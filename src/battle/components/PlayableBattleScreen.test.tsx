// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, useReducer, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Database } from "firebase/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestProvider } from "../../state/quest-context";
import { getLogEntries, resetLog } from "../../logging";
import {
  MultiplayerBattleContext,
  type MultiplayerBattleValue,
} from "../../state/multiplayer-battle-context";
import { createBattleInit } from "../integration/create-battle-init";
import { freezeQuestFailureSummary } from "../integration/failure-route";
import {
  createBattleControllerState,
  battleControllerReducer,
  type BattleControllerAction,
} from "../state/controller";
import { createInitialBattleState } from "../state/create-initial-state";
import { createBattleReducerState } from "../state/reducer";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import type { SharedBattleState } from "../../multiplayer/battle-types";
import type { BattleInit, BattleMutableState } from "../types";
import { PlayableBattleScreen, computeBattlefieldScale } from "./PlayableBattleScreen";

const BATTLE_CSS = readFileSync(join(process.cwd(), "src/battle/battle.css"), "utf8");
const mountedRoots = new Set<Root>();

const battleCompletionBridge = vi.hoisted(() => ({
  completeBattleSiteVictory: vi.fn(),
}));
const failureRouteMock = vi.hoisted(() => ({
  beginQuestFailureRoute: vi.fn<
    (input: import("../integration/failure-route").BeginQuestFailureRouteInput) =>
      import("../../types/quest").QuestFailureSummary
  >((input) => freezeQuestFailureSummary(input)),
}));
const battleServiceMock = vi.hoisted(() => ({
  dispatchBattleReset: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("../integration/battle-completion-bridge", () => ({
  completeBattleSiteVictory: battleCompletionBridge.completeBattleSiteVictory,
}));

vi.mock("../integration/failure-route", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../integration/failure-route")>();
  return {
    ...actual,
    beginQuestFailureRoute: failureRouteMock.beginQuestFailureRoute,
  };
});

vi.mock("../../multiplayer/battle-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../multiplayer/battle-service")>();
  return {
    ...actual,
    dispatchBattleReset: battleServiceMock.dispatchBattleReset,
  };
});

function createTestBattle(): {
  battleInit: BattleInit;
  initialState: BattleMutableState;
  site: ReturnType<typeof makeBattleTestSite>;
} {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });

  return {
    battleInit,
    initialState: createInitialBattleState(battleInit),
    site: makeBattleTestSite(),
  };
}

/**
 * Test-only host that emulates the multiplayer battle context using a local
 * `useReducer`. Synchronous local dispatch keeps the existing test flow
 * (click → assert) working without needing the Firebase round-trip.
 */
function TestMultiplayerBattleHost({
  battleInit,
  initialState,
  children,
}: {
  battleInit: BattleInit;
  initialState: BattleMutableState;
  children: ReactNode;
}) {
  const [state, dispatchLocal] = useReducer(
    (
      reducerState: ReturnType<typeof createBattleControllerState>,
      action: BattleControllerAction,
    ) => battleControllerReducer(reducerState, action),
    initialState,
    createBattleControllerState,
  );

  const value = useMemo<MultiplayerBattleValue>(() => {
    const battleState: SharedBattleState = {
      init: battleInit,
      reducer: {
        mutable: state.mutable,
        history: state.history,
        lastTransition: state.lastTransition,
        commandSerial: state.activityId,
        lastActivityKind: state.lastActivity?.kind ?? null,
      },
    };
    const reducerState = createBattleReducerState(state.mutable, state.history);
    reducerState.lastTransition = state.lastTransition;
    return {
      database: {} as Database,
      roomId: "test-room",
      clientId: "test-client",
      connectedCount: 1,
      battleState,
      reducerState,
      dispatch: dispatchLocal,
    };
  }, [battleInit, state]);

  return (
    <MultiplayerBattleContext.Provider value={value}>
      {children}
    </MultiplayerBattleContext.Provider>
  );
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const cardDatabase = makeBattleTestCardDatabase();
  const questContent = {
    cardDatabase,
    dreamcallers: makeBattleTestDreamcallers(),
    dreamsignTemplates: [],
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const unmountRoot = root.unmount.bind(root);
  root.unmount = () => {
    mountedRoots.delete(root);
    unmountRoot();
  };
  mountedRoots.add(root);

  act(() => {
    root.render(
      <QuestProvider cardDatabase={cardDatabase} questContent={questContent}>
        {element}
      </QuestProvider>,
    );
  });

  return { container, root };
}

function renderScreen(
  mutateInitialState?: (state: ReturnType<typeof createTestBattle>["initialState"]) => void,
  options?: { aiMode?: boolean; basicAutomation?: boolean },
) {
  const testBattle = createTestBattle();
  mutateInitialState?.(testBattle.initialState);
  return {
    ...testBattle,
    ...mount(
      <TestMultiplayerBattleHost
        battleInit={testBattle.battleInit}
        initialState={testBattle.initialState}
      >
        <PlayableBattleScreen
          site={testBattle.site}
          aiMode={options?.aiMode ?? false}
          basicAutomation={options?.basicAutomation ?? false}
        />
      </TestMultiplayerBattleHost>,
    ),
  };
}

beforeEach(() => {
  resetLog();
  battleCompletionBridge.completeBattleSiteVictory.mockClear();
  failureRouteMock.beginQuestFailureRoute.mockClear();
  battleServiceMock.dispatchBattleReset.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1440,
  });
});

afterEach(() => {
  act(() => {
    for (const root of [...mountedRoots]) {
      root.unmount();
    }
  });
  mountedRoots.clear();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("PlayableBattleScreen", () => {
  it("keeps battlefield scaling unset until the wrapper has measurable space and grows into available room", () => {
    expect(
      computeBattlefieldScale({
        naturalHeight: 450,
        naturalWidth: 430,
        wrapHeight: 0,
        wrapWidth: 700,
      }),
    ).toBeNull();
    expect(
      computeBattlefieldScale({
        naturalHeight: 450,
        naturalWidth: 430,
        wrapHeight: 220,
        wrapWidth: 700,
      }),
    ).toBeGreaterThan(0);
    expect(
      computeBattlefieldScale({
        naturalHeight: 300,
        naturalWidth: 300,
        wrapHeight: 600,
        wrapWidth: 600,
      }),
    ).toBe(2);
  });

  it("renders the new battle shell in the required region order with minimal controls", () => {
    const { container, root } = renderScreen();

    expect(
      [...container.querySelectorAll("[data-battle-region]")]
        .map((element) => element.getAttribute("data-battle-region")),
    ).toEqual([
      "status-bar",
      "stack-zone",
      "player-banished-zone",
      "player-void-zone",
      "player-status-strip",
      "enemy-backRank-row",
      "enemy-frontRank-row",
      "judgment-divider",
      "player-frontRank-row",
      "player-backRank-row",
      "enemy-status-strip",
      "enemy-void-zone",
      "enemy-banished-zone",
      "player-hand-tray",
      "action-bar",
    ]);
    expect(container.querySelector('[data-battle-region="stack-zone"]')?.parentElement?.className)
      .toContain("battlefield-zone-layout");
    expect(container.querySelector('[data-battle-region="player-status-strip"]')?.parentElement?.className)
      .toContain("battle-side-zone-column");
    expect(container.querySelector('[data-battle-region="enemy-status-strip"]')?.parentElement?.className)
      .toContain("battle-side-zone-column");
    expect(container.querySelector('[data-battle-region="player-void-zone"]')?.closest(".battle-side-zone-column")?.className)
      .toContain("battle-side-zone-column");
    expect(container.querySelector('[data-battle-region="enemy-void-zone"]')?.closest(".battle-side-zone-column")?.className)
      .toContain("battle-side-zone-column");
    expect(container.querySelector('[data-battle-region="player-banished-zone"]')?.closest(".battle-side-zone-column")?.className)
      .toContain("battle-side-zone-column");
    expect(container.querySelector('[data-battle-region="enemy-banished-zone"]')?.closest(".battle-side-zone-column")?.className)
      .toContain("battle-side-zone-column");
    expect(container.textContent).toContain("You");
    expect(container.textContent).toContain("Enemy");
    expect(container.textContent).toContain("Undo");
    expect(container.textContent).toContain("Redo");
    expect(container.textContent).toContain("Log");
    expect(container.textContent).toContain("Skip to rewards");
    expect(container.textContent).toContain("Show enemy hand");
    expect(container.querySelector('[data-battle-region="action-bar"]')?.textContent).not.toContain("Skip to rewards");
    expect(container.querySelector('[data-battle-region="action-bar"]')?.textContent).not.toContain("Show enemy hand");
    expect(container.querySelector(".inspector.open")?.textContent).toContain("Skip to rewards");
    expect(container.querySelector(".inspector.open")?.textContent).toContain("Show enemy hand");
    expect(container.querySelector('[data-battle-action="end-turn"]')).toBeNull();
    expect(container.querySelector(".inspector.open")).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shows card counts on the void and banished zone buttons and the player hand count on the character", () => {
    const { container, root } = renderScreen((state) => {
      const voidCardId = state.sides.player.deck.pop();
      const banishedCardId = state.sides.player.deck.pop();
      if (voidCardId !== undefined) {
        state.sides.player.void.push(voidCardId);
      }
      if (banishedCardId !== undefined) {
        state.sides.player.banished.push(banishedCardId);
      }
    });

    const playerVoid = container.querySelector('[data-battle-zone-open="player:void"]');
    const playerBanished = container.querySelector('[data-battle-zone-open="player:banished"]');
    const enemyVoid = container.querySelector('[data-battle-zone-open="enemy:void"]');

    expect(playerVoid?.getAttribute("data-battle-zone-count")).toBe("1");
    expect(playerVoid?.querySelector(".battle-small-zone-count")?.textContent).toBe("1");
    expect(playerBanished?.getAttribute("data-battle-zone-count")).toBe("1");
    expect(enemyVoid?.getAttribute("data-battle-zone-count")).toBe("0");

    const handCount = container.querySelector<HTMLElement>(
      '[data-battle-status-hand-count="player"]',
    );
    expect(handCount).not.toBeNull();
    expect(handCount?.textContent).toContain("5");

    act(() => {
      root.unmount();
    });
  });

  it("starts the basic automation gear ON from runtimeConfig and toggles off then on with the gear", () => {
    const { container, root } = renderScreen(undefined, { basicAutomation: true });
    const toggle = container.querySelector<HTMLElement>('[data-battle-action="toggle-automation"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("data-battle-automation-enabled")).toBe("true");
    expect(toggle?.querySelector("i.bxf.bx-cog")).not.toBeNull();

    // The gear is a manual override: the first click turns the default-on
    // automation OFF.
    act(() => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container
        .querySelector('[data-battle-action="toggle-automation"]')
        ?.getAttribute("data-battle-automation-enabled"),
    ).toBe("false");

    // A second click toggles it back ON, proving the override flips both ways.
    act(() => {
      container
        .querySelector('[data-battle-action="toggle-automation"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container
        .querySelector('[data-battle-action="toggle-automation"]')
        ?.getAttribute("data-battle-automation-enabled"),
    ).toBe("true");

    act(() => {
      root.unmount();
    });
  });

  it("starts the basic automation gear OFF when runtimeConfig disables it (?automation=0)", () => {
    const { container, root } = renderScreen(undefined, { basicAutomation: false });
    const toggle = container.querySelector<HTMLElement>('[data-battle-action="toggle-automation"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("data-battle-automation-enabled")).toBe("false");

    // The gear is still a manual override: a click turns automation ON.
    act(() => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container
        .querySelector('[data-battle-action="toggle-automation"]')
        ?.getAttribute("data-battle-automation-enabled"),
    ).toBe("true");

    act(() => {
      root.unmount();
    });
  });

  it("spends energy and sends a played event to the void when automation is on", () => {
    let eventCardId = "";
    let eventCost = 0;
    const { container, root } = renderScreen((state) => {
      const found = Object.values(state.cardInstances).find(
        (instance) => instance.definition.battleCardKind === "event",
      );
      if (found === undefined) {
        throw new Error("expected an event card instance in the test battle");
      }
      eventCardId = found.battleCardId;
      eventCost = found.definition.energyCost;
      for (const side of ["player", "enemy"] as const) {
        const sideState = state.sides[side];
        sideState.hand = sideState.hand.filter((id) => id !== eventCardId);
        sideState.deck = sideState.deck.filter((id) => id !== eventCardId);
        sideState.void = sideState.void.filter((id) => id !== eventCardId);
      }
      found.owner = "player";
      found.controller = "player";
      state.sides.player.hand = [eventCardId];
      state.sides.player.currentEnergy = 8;
      state.sides.player.maxEnergy = 8;
    }, { basicAutomation: true });

    const handCard = container.querySelector<HTMLElement>(
      `[data-battle-region="player-hand-tray"] [data-battle-card-id="${eventCardId}"]`,
    );
    expect(handCard).not.toBeNull();

    act(() => {
      handCard?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    // The event resolved to the void rather than entering a battlefield slot.
    expect(
      container
        .querySelector('[data-battle-zone-open="player:void"]')
        ?.getAttribute("data-battle-zone-count"),
    ).toBe("1");
    expect(
      container.querySelector('[data-slot-id="player-backRank-B0"]')?.getAttribute("data-slot-card-id"),
    ).toBeNull();

    // Energy dropped by exactly the event's cost.
    const energy = Number(
      container
        .querySelector('[data-battle-stat="player:energy"]')
        ?.getAttribute("data-battle-current-energy"),
    );
    expect(energy).toBe(8 - eventCost);

    act(() => {
      root.unmount();
    });
  });

  it("renders the empty stack zone without instructional copy or a counter", () => {
    const { container, root } = renderScreen();
    const stackZone = container.querySelector<HTMLElement>('[data-battle-region="stack-zone"]');

    expect(stackZone).not.toBeNull();
    expect(stackZone?.textContent).toBe("Stack");
    expect(stackZone?.querySelector(".battle-stack-zone-header strong")).toBeNull();
    expect(stackZone?.querySelector(".battle-stack-empty")).toBeNull();
    expect(stackZone?.querySelector("[data-battle-card-id]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("does not select cards or battlefield slots from ordinary clicks", () => {
    const { container, root } = renderScreen();
    const firstHandCard = container.querySelector<HTMLElement>(
      '[data-battle-region="player-hand-tray"] [data-battle-card-id]',
    );
    const emptySlot = container.querySelector<HTMLElement>('[data-slot-id="player-backRank-B0"]');
    if (firstHandCard === null || emptySlot === null) {
      throw new Error("expected hand card and reserve slot");
    }
    const handCardId = firstHandCard.getAttribute("data-battle-card-id");

    act(() => {
      firstHandCard.click();
    });

    expect(container.querySelector('.inspector .head h3')?.textContent).toBe("Inspector");
    expect(container.textContent).toContain("Battle State");
    expect(container.textContent).not.toContain("Card State");
    expect(container.querySelector('[data-battle-card-id][data-selected="true"]')).toBeNull();

    act(() => {
      emptySlot.click();
    });

    expect(
      container.querySelector('[data-slot-id="player-backRank-B0"]')?.getAttribute("data-slot-card-id"),
    ).toBeNull();
    expect(container.textContent).not.toContain("Your reserve B0");
    expect(container.querySelector('[data-slot-id][data-selected="true"]')).toBeNull();
    expect(container.querySelector(".selected-slot")).toBeNull();
    expect(
      container.querySelector(
        `[data-battle-region="player-hand-tray"] [data-battle-card-id="${handCardId ?? ""}"]`,
      ),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("keeps stacked cards and resolution controls available in the stack zone", () => {
    const { container, root } = renderScreen((state) => {
      const stackedCardIds = state.sides.player.hand.slice(0, 2);
      if (stackedCardIds.length < 2) {
        throw new Error("expected two player hand cards");
      }
      state.sides.player.hand = state.sides.player.hand.filter((battleCardId) => !stackedCardIds.includes(battleCardId));
      state.stack ??= [];
      stackedCardIds.forEach((battleCardId, index) => {
        state.stack?.push({
          stackEntryId: `stack_test_${String(index + 1).padStart(4, "0")}`,
          battleCardId,
          side: "player",
          paidCost: 0,
        });
      });
    });
    const stackZone = container.querySelector<HTMLElement>('[data-battle-region="stack-zone"]');

    expect(stackZone).not.toBeNull();
    expect(stackZone?.textContent).toContain("Stack");
    expect(stackZone?.querySelectorAll(".battle-stack-entry")).toHaveLength(2);
    expect(stackZone?.querySelectorAll("[data-battle-card-id]")).toHaveLength(2);
    expect(stackZone?.querySelectorAll(".battle-stack-entry-actions")).toHaveLength(2);
    expect(stackZone?.querySelector(".battle-stack-zone-header strong")).toBeNull();
    expect(stackZone?.querySelector(".battle-stack-empty")).toBeNull();
    expect(stackZone?.textContent).toContain("Void");
    expect(stackZone?.textContent).toContain("Banish");

    act(() => {
      root.unmount();
    });
  });

  it("uses fixed battle zone sizing without splitter handles", () => {
    const { container, root } = renderScreen();
    const battleMain = container.querySelector<HTMLElement>(".battle-main");

    expect(battleMain).not.toBeNull();
    expect(container.querySelector("[data-battle-resize-handle]")).toBeNull();
    expect(container.querySelector('[role="separator"]')).toBeNull();
    expect(battleMain?.style.getPropertyValue("--battlefield-zone-height")).toBe("");
    expect(battleMain?.style.getPropertyValue("--player-hand-zone-height")).toBe("");

    act(() => {
      root.unmount();
    });
  });

  it("lets the battlefield region expand into the space above the hand tray", () => {
    expect(BATTLE_CSS).toMatch(/\.stage\s*{[^}]*flex:\s*1 1 auto;/s);
    expect(BATTLE_CSS).toMatch(/\.battlefield-zone-layout\s*{[^}]*flex:\s*1 1 auto;/s);
    expect(BATTLE_CSS).toMatch(/\.bf-wrap\s*{[^}]*flex:\s*1 1 var\(--battlefield-row-width\);/s);
    expect(BATTLE_CSS).toMatch(/\.player-hand-zone\.compact\s*{[^}]*flex-basis:\s*var\(--player-hand-zone-compact-height,/s);
    expect(BATTLE_CSS).toMatch(/--revealed-hand-card-w:\s*clamp\(66px,\s*6vw,\s*78px\);/);
    expect(BATTLE_CSS).toMatch(/--revealed-hand-card-h:\s*clamp\(99px,\s*9vw,\s*117px\);/);
  });

  it("keeps stack zone cards at the mini battle-card aspect ratio", () => {
    expect(BATTLE_CSS).toMatch(/\.battle-stack-zone-cards\s*{[^}]*flex-direction:\s*column;/s);
    expect(BATTLE_CSS).toMatch(/\.battle-stack-zone-cards\s*{[^}]*overflow-y:\s*auto;/s);
    expect(BATTLE_CSS).toMatch(/\.battle-stack-entry\s*{[^}]*grid-template-rows:\s*auto auto;/s);
    expect(BATTLE_CSS).toMatch(/\.battle-stack-entry\s*{[^}]*align-content:\s*start;/s);
    expect(BATTLE_CSS).toMatch(/\.battle-stack-entry\s+\.battle-card\s*{[^}]*height:\s*auto;/s);
    expect(BATTLE_CSS).toMatch(/\.battle-stack-entry\s+\.battle-card\s*{[^}]*aspect-ratio:\s*78 \/ 108;/s);
  });

  it("has no phase-action button in the action bar", () => {
    const { container, root } = renderScreen((state) => {
      state.phase = "day";
      state.activeSide = "player";
      state.sides.player.currentEnergy = 2;
    });

    expect(container.querySelector('[data-battle-action="end-turn"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("places phase controls under the enemy banished zone", () => {
    const { container, root } = renderScreen((state) => {
      state.phase = "day";
      state.activeSide = "player";
      state.turnNumber = 1;
    });

    expect(container.querySelector('[data-battle-phase-increment]')).toBeNull();
    const controls = container.querySelectorAll("[data-battle-phase-control]");
    expect(controls).toHaveLength(3);
    expect(
      container.querySelector(".battle-side-zone-column.enemy .phase-float-actions"),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLButtonElement>('[data-battle-phase-control="previous"]')
        ?.getAttribute("title"),
    ).toBe("Return to Dawn");
    expect(
      container.querySelector<HTMLButtonElement>('[data-battle-phase-control="next"]')
        ?.getAttribute("title"),
    ).toBe("Advance to Dusk");
    expect(
      container.querySelector<HTMLButtonElement>('[data-battle-phase-control="next-major"]')
        ?.getAttribute("title"),
    ).toBe("Advance to Night");

    act(() => {
      root.unmount();
    });
  });

  it("decrements the phase with the left floating phase control", () => {
    const { container, root } = renderScreen((state) => {
      state.phase = "dusk";
      state.activeSide = "player";
      state.turnNumber = 1;
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-battle-phase-control="previous"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[data-battle-stat="phase"]')?.textContent).toBe("Day");
    expect(container.querySelector('[data-battle-stat="round-number"]')?.textContent).toBe("Turn 1");
    expect(container.querySelector(".turn-owner-pill")?.textContent).toBe("Player");

    act(() => {
      root.unmount();
    });
  });

  it("decrements active side and turn when the left floating phase control wraps from player", () => {
    const { container, root } = renderScreen((state) => {
      state.phase = "dawn";
      state.activeSide = "player";
      state.turnNumber = 2;
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-battle-phase-control="previous"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[data-battle-stat="phase"]')?.textContent).toBe("Challenge");
    expect(container.querySelector('[data-battle-stat="round-number"]')?.textContent).toBe("Turn 1");
    expect(container.querySelector(".turn-owner-pill")?.textContent).toBe("Enemy");

    act(() => {
      root.unmount();
    });
  });

  it("decrements active side without changing turn when the left floating phase control wraps from enemy", () => {
    const { container, root } = renderScreen((state) => {
      state.phase = "dawn";
      state.activeSide = "enemy";
      state.turnNumber = 1;
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-battle-phase-control="previous"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[data-battle-stat="phase"]')?.textContent).toBe("Challenge");
    expect(container.querySelector('[data-battle-stat="round-number"]')?.textContent).toBe("Turn 1");
    expect(container.querySelector(".turn-owner-pill")?.textContent).toBe("Player");

    act(() => {
      root.unmount();
    });
  });

  it("advances the phase from night to challenge with the next floating phase control", () => {
    const { container, root } = renderScreen((state) => {
      state.phase = "night";
      state.activeSide = "player";
      state.turnNumber = 1;
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-battle-phase-control="next"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[data-battle-stat="phase"]')?.textContent).toBe("Challenge");
    expect(container.querySelector('[data-battle-stat="round-number"]')?.textContent).toBe("Turn 1");
    expect(container.querySelector(".turn-owner-pill")?.textContent).toBe("Player");

    act(() => {
      root.unmount();
    });
  });

  it("advances active side when the next floating phase control wraps from challenge", () => {
    const { container, root } = renderScreen((state) => {
      state.phase = "challenge";
      state.activeSide = "player";
      state.turnNumber = 1;
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-battle-phase-control="next"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[data-battle-stat="phase"]')?.textContent).toBe("Dawn");
    expect(container.querySelector('[data-battle-stat="round-number"]')?.textContent).toBe("Turn 1");
    expect(container.querySelector(".turn-owner-pill")?.textContent).toBe("Enemy");

    act(() => {
      root.unmount();
    });
  });

  it("increments the turn when the next day-or-night floating phase control wraps from enemy", () => {
    const { container, root } = renderScreen((state) => {
      state.phase = "night";
      state.activeSide = "enemy";
      state.turnNumber = 1;
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-battle-phase-control="next-major"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[data-battle-stat="phase"]')?.textContent).toBe("Day");
    expect(container.querySelector('[data-battle-stat="round-number"]')?.textContent).toBe("Turn 2");
    expect(container.querySelector(".turn-owner-pill")?.textContent).toBe("Player");

    act(() => {
      root.unmount();
    });
  });

  it("ramps the enemy energy and draws when the player passes the turn in AI mode", () => {
    const { container, root } = renderScreen(
      (state) => {
        state.phase = "night";
        state.activeSide = "player";
        state.turnNumber = 2;
        state.sides.enemy.currentEnergy = 2;
        state.sides.enemy.maxEnergy = 2;
      },
      { aiMode: true },
    );

    // Reveal the enemy hand so its live card count is observable in the DOM.
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });
    const enemyHandBefore = container.querySelectorAll(".revealed-hand-card.opponent").length;

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-battle-phase-control="next-major"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[data-battle-stat="phase"]')?.textContent).toBe("Day");
    expect(container.querySelector(".turn-owner-pill")?.textContent).toBe("Enemy");
    const enemyEnergy = container.querySelector('[data-battle-stat="enemy:energy"]');
    // Turn 2 ramp: min(turnNumber + 1, cap) === 3, applied to both max and current.
    expect(enemyEnergy?.getAttribute("data-battle-current-energy")).toBe("3");
    expect(enemyEnergy?.getAttribute("data-battle-max-energy")).toBe("3");
    // The enemy draws one card for its turn.
    expect(container.querySelectorAll(".revealed-hand-card.opponent").length).toBe(
      enemyHandBefore + 1,
    );

    act(() => {
      root.unmount();
    });
  });

  it("leaves enemy energy untouched on a turn handoff when AI mode is off", () => {
    const { container, root } = renderScreen((state) => {
      state.phase = "night";
      state.activeSide = "player";
      state.turnNumber = 2;
      state.sides.enemy.currentEnergy = 2;
      state.sides.enemy.maxEnergy = 2;
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-battle-phase-control="next-major"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector(".turn-owner-pill")?.textContent).toBe("Enemy");
    const enemyEnergy = container.querySelector('[data-battle-stat="enemy:energy"]');
    expect(enemyEnergy?.getAttribute("data-battle-current-energy")).toBe("2");
    expect(enemyEnergy?.getAttribute("data-battle-max-energy")).toBe("2");

    act(() => {
      root.unmount();
    });
  });

  it("reveals compact player and opponent hand trays from the action bar", () => {
    const { container, initialState, root } = renderScreen();

    expect(container.querySelector('[data-battle-region="opponent-hand-tray"]')).toBeNull();
    expect(container.querySelector(".player-hand-zone")?.className)
      .not.toContain("compact");
    expect(container.querySelector('[data-battle-region="player-hand-tray"]')?.className)
      .not.toContain("compact");

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });

    expect(container.querySelector('[data-battle-region="opponent-hand-tray"]')).not.toBeNull();
    expect(container.querySelector(".player-hand-zone")?.className)
      .toContain("compact");
    expect(container.querySelector('[data-battle-region="player-hand-tray"]')?.className)
      .toContain("compact");
    expect(container.querySelectorAll(".revealed-hand-card.player")).toHaveLength(
      initialState.sides.player.hand.length,
    );
    expect(container.querySelectorAll(".revealed-hand-card.opponent")).toHaveLength(
      initialState.sides.enemy.hand.length,
    );

    act(() => {
      root.unmount();
    });
  });

  it("renders revealed opponent hand cards without selection or affordability dimming", () => {
    let enemyCardId = "";
    let enemyCardName = "";
    let playerCardId = "";
    let playerCardName = "";
    const { container, root } = renderScreen((state) => {
      state.activeSide = "enemy";
      state.phase = "day";
      state.sides.enemy.currentEnergy = 0;
      enemyCardId = state.sides.enemy.hand[0] ?? "";
      enemyCardName = state.cardInstances[enemyCardId].definition.name;
      playerCardId = state.sides.player.hand[0] ?? "";
      playerCardName = state.cardInstances[playerCardId].definition.name;
      // Give all enemy hand cards a cost that exceeds available energy.
      for (const battleCardId of state.sides.enemy.hand) {
        state.cardInstances[battleCardId].definition = {
          ...state.cardInstances[battleCardId].definition,
          energyCost: 99,
        };
      }
    });

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });

    const enemyCard = container.querySelector<HTMLElement>(
      `[data-battle-region="opponent-hand-tray"] [data-battle-card-id="${enemyCardId}"]`,
    );
    const playerCard = container.querySelector<HTMLElement>(
      `[data-battle-region="player-hand-tray"] [data-battle-card-id="${playerCardId}"]`,
    );

    expect(enemyCard?.getAttribute("data-battle-card-variant")).toBe("hand");
    expect(enemyCard?.hasAttribute("data-battle-hand-card")).toBe(true);
    expect(enemyCard?.classList.contains("hand-card")).toBe(true);
    expect(enemyCard?.classList.contains("quest-card")).toBe(true);
    expect(enemyCard?.classList.contains("opponent-card")).toBe(true);
    // Even when cost exceeds energy, no affordability dimming class is applied.
    expect(enemyCard?.classList.contains("unaffordable")).toBe(false);
    expect(enemyCard?.classList.contains("playable")).toBe(false);
    expect(enemyCard?.getAttribute("draggable")).toBe("true");

    expect(playerCard?.classList.contains("quest-card")).toBe(true);
    expect(playerCard?.classList.contains("revealed-hand-card")).toBe(true);
    expect(playerCard?.querySelector(".c-top")).toBeNull();
    expect(enemyCard?.querySelector(".c-top")).toBeNull();
    expect(playerCard?.querySelector("[data-testid='card-type-line']")).not.toBeNull();
    expect(enemyCard?.querySelector("[data-testid='card-type-line']")).not.toBeNull();
    expect(playerCard?.textContent).toContain(playerCardName);
    expect(playerCard?.querySelector("[data-rules-text-paragraph]")).toBeNull();
    expect(enemyCard?.textContent).toContain(enemyCardName);
    expect(enemyCard?.querySelector("[data-rules-text-paragraph]")).toBeNull();

    act(() => {
      enemyCard?.click();
    });

    expect(enemyCard?.getAttribute("data-selected")).toBe("false");
    expect(container.querySelector(".inspector")?.textContent).not.toContain(enemyCardName);

    act(() => {
      root.unmount();
    });
  });

  it("drags a hand card into reserve through the battlefield shell", () => {
    const { container, root } = renderScreen((state) => {
      state.sides.player.currentEnergy = 10;
      state.sides.player.maxEnergy = 10;
    });
    const firstHandCard = container.querySelector<HTMLElement>(
      '[data-battle-region="player-hand-tray"] [data-battle-card-id]',
    );

    if (firstHandCard === null) {
      throw new Error("expected first hand card");
    }

    act(() => {
      firstHandCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    act(() => {
      container.querySelector<HTMLElement>('[data-slot-id="player-backRank-B0"]')
        ?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(
      container.querySelector('[data-slot-id="player-backRank-B0"]')?.getAttribute("data-slot-card-id"),
    ).toBe(firstHandCard.getAttribute("data-battle-card-id"));

    act(() => {
      root.unmount();
    });
  });

  it("opens the battle pool viewer and drags generated cards into visible drop targets", () => {
    const { container, root } = renderScreen();
    const handTray = container.querySelector<HTMLElement>('[data-battle-region="player-hand-tray"]');
    const poolButton = container.querySelector<HTMLButtonElement>('[data-battle-action="open-pool-viewer"]');
    const initialHandCount = container.querySelectorAll(
      '[data-battle-region="player-hand-tray"] [data-battle-card-id]',
    ).length;

    if (handTray === null || poolButton === null) {
      throw new Error("expected hand tray and pool button");
    }

    act(() => {
      poolButton.click();
    });
    expect(container.querySelector('[data-pool-viewer="floating"]')).not.toBeNull();

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-pool-source="catalog"]')?.click();
    });

    const handPoolCard = container.querySelector<HTMLElement>('[data-pool-card-number="201"]');
    if (handPoolCard === null) {
      throw new Error("expected pool card");
    }

    act(() => {
      handPoolCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    expect(handTray.getAttribute("data-battle-zone-drop-target")).toBe("player:hand");

    act(() => {
      handTray.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(container.querySelectorAll(
      '[data-battle-region="player-hand-tray"] [data-battle-card-id]',
    )).toHaveLength(initialHandCount + 1);
    expect(handTray.textContent).toContain("Beta Tender");

    const slotPoolCard = container.querySelector<HTMLElement>('[data-pool-card-number="202"]');
    const reserveSlot = container.querySelector<HTMLElement>('[data-slot-id="player-backRank-B0"]');
    if (slotPoolCard === null || reserveSlot === null) {
      throw new Error("expected pool card and reserve slot");
    }

    act(() => {
      slotPoolCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });
    act(() => {
      reserveSlot.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(reserveSlot.getAttribute("data-slot-card-id")).toMatch(/^bc_/);
    expect(reserveSlot.textContent).toContain("Garden Sentinel");

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });
    const enemyHandTray = container.querySelector<HTMLElement>('[data-battle-region="opponent-hand-tray"]');
    const enemyPoolCard = container.querySelector<HTMLElement>('[data-pool-card-number="205"]');
    if (enemyHandTray === null || enemyPoolCard === null) {
      throw new Error("expected enemy hand tray and pool card");
    }

    act(() => {
      enemyPoolCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });
    expect(enemyHandTray.getAttribute("data-battle-zone-drop-target")).toBe("enemy:hand");
    act(() => {
      enemyHandTray.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });
    expect(enemyHandTray.textContent).toContain("Harvest Ritual");

    act(() => {
      root.unmount();
    });
  });

  it("drops a player hand card into the player void zone and opens the void browser", () => {
    const { container, root } = renderScreen();
    const firstHandCard = container.querySelector<HTMLElement>(
      '[data-battle-region="player-hand-tray"] [data-battle-card-id]',
    );
    const voidZone = container.querySelector<HTMLElement>('[data-battle-region="player-void-zone"]');

    if (firstHandCard === null || voidZone === null) {
      throw new Error("expected player hand card and void zone");
    }
    const battleCardId = firstHandCard.getAttribute("data-battle-card-id");

    act(() => {
      firstHandCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    expect(voidZone.getAttribute("data-battle-zone-drop-target")).toBe("player:void");

    act(() => {
      voidZone.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(
      container.querySelector(
        `[data-battle-region="player-hand-tray"] [data-battle-card-id="${battleCardId ?? ""}"]`,
      ),
    ).toBeNull();
    expect(container.querySelector('[data-battle-zone-browser="player:void"]')).toBeNull();

    act(() => {
      voidZone.click();
    });

    const browser = container.querySelector<HTMLElement>('[data-battle-zone-browser="player:void"]');
    expect(browser?.textContent).toContain("Your Void");
    expect(
      browser?.querySelector(`[data-zone-browser-card-id="${battleCardId ?? ""}"]`),
    ).not.toBeNull();

    const secondHandCard = container.querySelector<HTMLElement>(
      '[data-battle-region="player-hand-tray"] [data-battle-card-id]',
    );
    if (secondHandCard === null) {
      throw new Error("expected another player hand card");
    }
    const secondHandCardId = secondHandCard.getAttribute("data-battle-card-id");

    act(() => {
      secondHandCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    expect(browser?.getAttribute("data-battle-zone-drop-target")).toBe("player:void");

    act(() => {
      browser?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(
      container.querySelector(
        `[data-battle-zone-browser="player:void"] [data-zone-browser-card-id="${secondHandCardId ?? ""}"]`,
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        `[data-battle-region="player-hand-tray"] [data-battle-card-id="${secondHandCardId ?? ""}"]`,
      ),
    ).toBeNull();

    const browserCard = browser?.querySelector<HTMLElement>(
      `[data-battle-card-id="${battleCardId ?? ""}"]`,
    );
    const handTray = container.querySelector<HTMLElement>('[data-battle-region="player-hand-tray"]');
    if (browserCard === undefined || browserCard === null || handTray === null) {
      throw new Error("expected void browser card and player hand tray");
    }

    act(() => {
      browserCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    expect(handTray.getAttribute("data-battle-zone-drop-target")).toBe("player:hand");

    act(() => {
      handTray.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(
      container.querySelector(
        `[data-battle-region="player-hand-tray"] [data-battle-card-id="${battleCardId ?? ""}"]`,
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        `[data-battle-zone-browser="player:void"] [data-zone-browser-card-id="${battleCardId ?? ""}"]`,
      ),
    ).toBeNull();

    act(() => {
      browser?.querySelector<HTMLButtonElement>(".m-head .btn.ghost")?.click();
    });

    expect(container.querySelector('[data-battle-zone-browser="player:void"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("drops a player hand card into the player banished zone and opens the banished browser", () => {
    const { container, root } = renderScreen();
    const firstHandCard = container.querySelector<HTMLElement>(
      '[data-battle-region="player-hand-tray"] [data-battle-card-id]',
    );
    const banishedZone = container.querySelector<HTMLElement>('[data-battle-region="player-banished-zone"]');

    if (firstHandCard === null || banishedZone === null) {
      throw new Error("expected player hand card and banished zone");
    }
    const battleCardId = firstHandCard.getAttribute("data-battle-card-id");

    act(() => {
      firstHandCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    expect(banishedZone.getAttribute("data-battle-zone-drop-target")).toBe("player:banished");

    act(() => {
      banishedZone.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(
      container.querySelector(
        `[data-battle-region="player-hand-tray"] [data-battle-card-id="${battleCardId ?? ""}"]`,
      ),
    ).toBeNull();
    expect(container.querySelector('[data-battle-zone-browser="player:banished"]')).toBeNull();

    act(() => {
      banishedZone.click();
    });

    const browser = container.querySelector<HTMLElement>('[data-battle-zone-browser="player:banished"]');
    expect(browser?.textContent).toContain("Your Banished");
    expect(
      browser?.querySelector(`[data-zone-browser-card-id="${battleCardId ?? ""}"]`),
    ).not.toBeNull();

    act(() => {
      browser?.querySelector<HTMLButtonElement>(".m-head .btn.ghost")?.click();
    });

    expect(container.querySelector('[data-battle-zone-browser="player:banished"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("deploys a player reserve character during the opponent-turn Dusk defender setup", () => {
    let reserveCardId = "";
    const { container, root } = renderScreen((state) => {
      const battleCardId = state.sides.player.hand.find(
        (cardId) => state.cardInstances[cardId]?.definition.battleCardKind === "character",
      ) ?? state.sides.player.deck.find(
        (cardId) => state.cardInstances[cardId]?.definition.battleCardKind === "character",
      );
      if (battleCardId === undefined) {
        throw new Error("expected player character");
      }
      reserveCardId = battleCardId;
      state.activeSide = "player";
      state.phase = "dusk";
      state.turnNumber = 1;
      state.sides.player.hand = state.sides.player.hand.filter((cardId) => cardId !== battleCardId);
      state.sides.player.deck = state.sides.player.deck.filter((cardId) => cardId !== battleCardId);
      state.sides.player.backRank.B0 = battleCardId;
    });
    const reserveCard = container.querySelector<HTMLElement>(
      `[data-slot-id="player-backRank-B0"] [data-battle-card-id="${reserveCardId}"]`,
    );
    if (reserveCard === null) {
      throw new Error("expected reserve card");
    }

    act(() => {
      reserveCard.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 280,
        clientY: 520,
      }));
    });

    const menu = container.querySelector("[data-battle-context-menu]");
    expect(menu?.textContent).not.toContain("Clear reserved");
    expect(menu?.textContent).toContain("→ Front Rank");

    const moveToDeployed = [...container.querySelectorAll<HTMLElement>(".ctx-item")]
      .find((element) => element.textContent === "→ Front Rank");
    if (moveToDeployed === undefined) {
      throw new Error("expected move to deployed item");
    }

    act(() => {
      moveToDeployed.click();
    });

    expect(container.querySelector('[data-slot-id="player-backRank-B0"]')?.getAttribute("data-slot-card-id")).toBeNull();
    expect(container.querySelector('[data-slot-id="player-frontRank-F0"]')?.getAttribute("data-slot-card-id")).toBe(reserveCardId);

    act(() => {
      root.unmount();
    });
  });

  it("deploys an enemy reserve character through the Dusk battlefield controls", () => {
    let reserveCardId = "";
    const { container, root } = renderScreen((state) => {
      const battleCardId = state.sides.enemy.hand.find(
        (cardId) => state.cardInstances[cardId]?.definition.battleCardKind === "character",
      ) ?? state.sides.enemy.deck.find(
        (cardId) => state.cardInstances[cardId]?.definition.battleCardKind === "character",
      );
      if (battleCardId === undefined) {
        throw new Error("expected enemy character");
      }
      reserveCardId = battleCardId;
      state.activeSide = "enemy";
      state.phase = "dusk";
      state.turnNumber = 2;
      state.sides.enemy.hand = state.sides.enemy.hand.filter((cardId) => cardId !== battleCardId);
      state.sides.enemy.deck = state.sides.enemy.deck.filter((cardId) => cardId !== battleCardId);
      state.sides.enemy.backRank.B0 = battleCardId;
    });
    const reserveSlot = container.querySelector<HTMLElement>('[data-slot-id="enemy-backRank-B0"]');
    const deployedSlot = container.querySelector<HTMLElement>('[data-slot-id="enemy-frontRank-F0"]');
    const reserveCard = container.querySelector<HTMLElement>(
      `[data-slot-id="enemy-backRank-B0"] [data-battle-card-id="${reserveCardId}"]`,
    );
    if (reserveSlot === null || deployedSlot === null || reserveCard === null) {
      throw new Error("expected enemy battlefield card and target slot");
    }

    act(() => {
      reserveSlot.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 280,
        clientY: 300,
      }));
    });

    const menu = container.querySelector("[data-battle-context-menu]");
    expect(menu?.textContent).toContain("→ Front Rank");

    const moveToDeployed = [...container.querySelectorAll<HTMLElement>(".ctx-item")]
      .find((element) => element.textContent === "→ Front Rank");
    if (moveToDeployed === undefined) {
      throw new Error("expected move to deployed item");
    }

    act(() => {
      moveToDeployed.click();
    });

    expect(reserveSlot.getAttribute("data-slot-card-id")).toBeNull();
    expect(deployedSlot.getAttribute("data-slot-card-id")).toBe(reserveCardId);

    act(() => {
      root.unmount();
    });
  });

  it("opens the zone browser from the inspector with the mockup controls", () => {
    const { container, root } = renderScreen();

    act(() => {
      clickChip(container, "Open Deck");
    });

    expect(container.textContent).toContain("Your Deck");
    expect(
      container.querySelector<HTMLInputElement>("[data-zone-browser-search]")?.placeholder,
    ).toBe("Search by name…");
    expect(container.textContent).toContain("Current order");
    expect(container.textContent).toContain("All types");

    act(() => {
      container.querySelector<HTMLElement>(".modal-scrim")?.click();
    });

    expect(container.textContent).not.toContain("Your Deck");

    act(() => {
      root.unmount();
    });
  });

  it("locally toggles the opponent hand tray without adding battle history", () => {
    const { container, initialState, root } = renderScreen();
    const firstEnemyHandCardId = initialState.sides.enemy.hand[0];

    expect(container.querySelector('[data-battle-region="opponent-hand-tray"]')).toBeNull();
    expect(initialState.cardInstances[firstEnemyHandCardId].isRevealedToPlayer).toBe(false);

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });

    expect(container.querySelector('[data-battle-region="opponent-hand-tray"]')).not.toBeNull();
    expect(
      container.querySelector<HTMLButtonElement>('[data-battle-action="undo"]')?.disabled,
    ).toBe(true);
    expect(initialState.cardInstances[firstEnemyHandCardId].isRevealedToPlayer).toBe(false);

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });

    expect(container.querySelector('[data-battle-region="opponent-hand-tray"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("right-clicks and drags revealed opponent hand cards to enemy battlefield slots", () => {
    const { container, initialState, root } = renderScreen();

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });

    const opponentCard = [...container.querySelectorAll<HTMLElement>(
      '[data-battle-region="opponent-hand-tray"] [data-battle-card-id]',
    )].find((element) => {
      const battleCardId = element.getAttribute("data-battle-card-id");
      return battleCardId !== null &&
        initialState.cardInstances[battleCardId]?.definition.battleCardKind === "character";
    });
    if (opponentCard === undefined) {
      throw new Error("expected opponent character hand card");
    }
    const opponentCardId = opponentCard.getAttribute("data-battle-card-id");
    if (opponentCardId === null) {
      throw new Error("expected opponent card id");
    }
    act(() => {
      opponentCard.click();
    });

    expect(opponentCard.getAttribute("data-selected")).toBe("false");

    act(() => {
      opponentCard.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 220,
        clientY: 160,
      }));
    });

    const menu = container.querySelector("[data-battle-context-menu]");
    expect(menu?.textContent).not.toContain("Inspect");
    expect(menu?.textContent).not.toContain("Reveal");
    expect(menu?.textContent).not.toContain("Hide");

    const enemyReserveSlot = container.querySelector<HTMLElement>('[data-slot-id="enemy-backRank-B0"]');
    if (enemyReserveSlot === null) {
      throw new Error("expected enemy reserve slot");
    }

    act(() => {
      opponentCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    expect(
      container.querySelector<HTMLElement>('[data-slot-id="enemy-backRank-B0"]')
        ?.getAttribute("data-battle-drop-target"),
    ).toBe("true");

    act(() => {
      enemyReserveSlot.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(enemyReserveSlot.getAttribute("data-slot-card-id")).toBe(opponentCardId);
    expect(
      container.querySelector(
        `[data-battle-region="opponent-hand-tray"] [data-battle-card-id="${opponentCardId}"]`,
      ),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("plays revealed opponent hand events through the context menu play action", () => {
    const { container, initialState, root } = renderScreen((state) => {
      state.activeSide = "player";
      state.phase = "day";
      state.sides.enemy.currentEnergy = 10;
      state.sides.enemy.maxEnergy = 10;
      if (
        state.sides.enemy.hand.every((battleCardId) =>
          state.cardInstances[battleCardId]?.definition.battleCardKind !== "event")
      ) {
        const deckEventId = state.sides.enemy.deck.find((battleCardId) =>
          state.cardInstances[battleCardId]?.definition.battleCardKind === "event");
        if (deckEventId !== undefined) {
          state.sides.enemy.deck = state.sides.enemy.deck.filter((battleCardId) => battleCardId !== deckEventId);
          state.sides.enemy.hand = [...state.sides.enemy.hand, deckEventId];
        }
      }
    });
    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });

    const opponentCard = [...container.querySelectorAll<HTMLElement>(
      '[data-battle-region="opponent-hand-tray"] [data-battle-card-id]',
    )].find((element) => {
      const battleCardId = element.getAttribute("data-battle-card-id");
      return battleCardId !== null &&
        initialState.cardInstances[battleCardId]?.definition.battleCardKind === "event";
    });
    if (opponentCard === undefined) {
      throw new Error("expected opponent event card");
    }
    const opponentEventId = opponentCard.getAttribute("data-battle-card-id");
    if (opponentEventId === null) {
      throw new Error("expected opponent event id");
    }

    act(() => {
      opponentCard.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 220,
        clientY: 160,
      }));
    });

    const menu = container.querySelector("[data-battle-context-menu]");
    expect(menu?.textContent).toContain("Play to Void");
    const playItem = [...container.querySelectorAll<HTMLElement>(".ctx-item")]
      .find((element) => element.textContent === "Play to Void");
    if (playItem === undefined) {
      throw new Error("expected enemy event play item");
    }

    act(() => {
      playItem.click();
    });

    expect(
      container.querySelector(
        `[data-battle-region="opponent-hand-tray"] [data-battle-card-id="${opponentEventId}"]`,
      ),
    ).toBeNull();
    // The play is now an unrestricted move: the event lands in void without
    // spending energy.
    expect(
      container.querySelector('[data-battle-stat="enemy:energy"]')?.getAttribute("data-battle-current-energy"),
    ).toBe("10");

    act(() => {
      root.unmount();
    });
  });

  it("plays a revealed opponent hand character even after a stale player reserve selection", () => {
    let stalePlayerCardId = "";
    let opponentCharacterId = "";
    const { container, initialState, root } = renderScreen((state) => {
      state.activeSide = "enemy";
      state.phase = "day";
      state.sides.enemy.currentEnergy = 10;
      state.sides.enemy.maxEnergy = 10;

      const playerCardId = state.sides.player.hand.find((battleCardId) =>
        state.cardInstances[battleCardId]?.definition.battleCardKind === "character");
      if (playerCardId === undefined) {
        throw new Error("expected player character");
      }
      state.sides.player.hand = state.sides.player.hand.filter((battleCardId) => battleCardId !== playerCardId);
      state.sides.player.backRank.B0 = playerCardId;
      stalePlayerCardId = playerCardId;

      let enemyCardId = state.sides.enemy.hand.find((battleCardId) => {
        const card = state.cardInstances[battleCardId];
        return card?.definition.battleCardKind === "character" && card.definition.energyCost <= 10;
      });
      if (enemyCardId === undefined) {
        enemyCardId = state.sides.enemy.deck.find((battleCardId) => {
          const card = state.cardInstances[battleCardId];
          return card?.definition.battleCardKind === "character" && card.definition.energyCost <= 10;
        });
        if (enemyCardId !== undefined) {
          state.sides.enemy.deck = state.sides.enemy.deck.filter((battleCardId) => battleCardId !== enemyCardId);
          state.sides.enemy.hand = [...state.sides.enemy.hand, enemyCardId];
        }
      }
      if (enemyCardId === undefined) {
        throw new Error("expected affordable enemy character");
      }
      opponentCharacterId = enemyCardId;
    });

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });

    const stalePlayerCard = container.querySelector<HTMLElement>(
      `[data-slot-id="player-backRank-B0"] [data-battle-card-id="${stalePlayerCardId}"]`,
    );
    const opponentCard = container.querySelector<HTMLElement>(
      `[data-battle-region="opponent-hand-tray"] [data-battle-card-id="${opponentCharacterId}"]`,
    );
    if (stalePlayerCard === null || opponentCard === null) {
      throw new Error("expected stale player reserve card and opponent hand card");
    }

    act(() => {
      stalePlayerCard.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 520,
        clientY: 420,
      }));
    });
    expect(container.querySelector("[data-battle-context-menu]")?.textContent).toContain("→ Void");

    act(() => {
      opponentCard.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 220,
        clientY: 160,
      }));
    });

    const menu = container.querySelector("[data-battle-context-menu]");
    expect(menu?.textContent).toContain(initialState.cardInstances[opponentCharacterId].definition.name);
    const playItem = [...container.querySelectorAll<HTMLElement>(".ctx-item")]
      .find((element) => element.textContent === "Play to Back Rank");
    if (playItem === undefined) {
      throw new Error("expected enemy character play item");
    }
    const enemyEnergyBeforePlay = Number(
      container.querySelector('[data-battle-stat="enemy:energy"]')?.getAttribute("data-battle-current-energy") ?? "0",
    );

    act(() => {
      playItem.click();
    });

    expect(
      container.querySelector('[data-slot-id="player-backRank-B0"]')?.getAttribute("data-slot-card-id"),
    ).toBe(stalePlayerCardId);
    expect(
      [...container.querySelectorAll("[data-slot-id^='enemy-backRank-']")]
        .some((slot) => slot.getAttribute("data-slot-card-id") === opponentCharacterId),
    ).toBe(true);
    expect(
      container.querySelector(
        `[data-battle-region="opponent-hand-tray"] [data-battle-card-id="${opponentCharacterId}"]`,
      ),
    ).toBeNull();
    // The play is now an unrestricted move: placing the character costs no
    // energy.
    expect(
      container.querySelector('[data-battle-stat="enemy:energy"]')?.getAttribute("data-battle-current-energy"),
    ).toBe(String(enemyEnergyBeforePlay));

    act(() => {
      root.unmount();
    });
  });

  it("exposes void and banished drop zones beside both status strips", () => {
    const { container, root } = renderScreen();

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });

    const opponentCard = container.querySelector<HTMLElement>(
      '[data-battle-region="opponent-hand-tray"] [data-battle-card-id]',
    );
    if (opponentCard === null) {
      throw new Error("expected opponent card");
    }

    act(() => {
      opponentCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    expect(
      container.querySelector('[data-battle-region="enemy-void-zone"]')
        ?.getAttribute("data-battle-zone-open"),
    ).toBe("enemy:void");
    expect(
      container.querySelector('[data-battle-region="enemy-banished-zone"]')
        ?.getAttribute("data-battle-zone-open"),
    ).toBe("enemy:banished");
    expect(
      container.querySelector('[data-battle-region="player-void-zone"]')
        ?.getAttribute("data-battle-zone-open"),
    ).toBe("player:void");
    expect(
      container.querySelector('[data-battle-region="player-banished-zone"]')
        ?.getAttribute("data-battle-zone-open"),
    ).toBe("player:banished");
    expect(
      container.querySelector('[data-battle-region="enemy-void-zone"]')
        ?.getAttribute("data-battle-zone-drop-target"),
    ).toBe("enemy:void");
    expect(
      container.querySelector('[data-battle-region="enemy-banished-zone"]')
        ?.getAttribute("data-battle-zone-drop-target"),
    ).toBe("enemy:banished");
    expect(
      container.querySelector('[data-battle-region="player-void-zone"]')
        ?.getAttribute("data-battle-zone-drop-target"),
    ).toBe("player:void");
    expect(
      container.querySelector('[data-battle-region="player-banished-zone"]')
        ?.getAttribute("data-battle-zone-drop-target"),
    ).toBe("player:banished");

    act(() => {
      root.unmount();
    });
  });

  it("opens the right-click context menu with the mockup action labels", () => {
    const { container, root } = renderScreen((state) => {
      state.sides.player.currentEnergy = 10;
      state.sides.player.maxEnergy = 10;
    });
    const firstHandCard = container.querySelector<HTMLElement>(
      '[data-battle-region="player-hand-tray"] [data-battle-card-id]',
    );

    if (firstHandCard === null) {
      throw new Error("expected first hand card");
    }

    act(() => {
      firstHandCard.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 200,
        clientY: 140,
      }));
    });

    const menu = container.querySelector("[data-battle-context-menu]");
    expect(menu?.textContent).toContain("Play to Back Rank");
    expect(menu?.textContent).toContain("Play to Front Rank");
    expect(menu?.textContent).toContain("Kindle");
    expect(menu?.textContent).toContain("→ Back Rank");
    expect(menu?.textContent).toContain("→ Front Rank");
    expect(menu?.textContent).toContain("→ Void");
    expect(menu?.textContent).toContain("→ Banished");
    expect(menu?.textContent).toContain("→ Deck top");
    expect(menu?.textContent).toContain("→ Deck bottom");
    expect(menu?.textContent).toContain("Create Copy");
    expect(menu?.textContent).toContain("Markers");
    expect(menu?.textContent).toContain("Add Note");
    expect(menu?.textContent).not.toContain("Inspect");
    expect(container.querySelector('[data-battle-card-id][data-selected="true"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("applies Kindle submenu actions to a deployed card through the context menu", () => {
    let deployedCardId: string | null = null;
    let printedSpark = 0;
    const { container, root } = renderScreen((state) => {
      const characterCardId = state.sides.player.hand.find(
        (battleCardId) => state.cardInstances[battleCardId]?.definition.battleCardKind === "character",
      );
      if (characterCardId === undefined) {
        throw new Error("expected player character hand card");
      }
      deployedCardId = characterCardId;
      printedSpark = state.cardInstances[characterCardId]?.definition.printedSpark ?? 0;
      state.sides.player.hand = state.sides.player.hand.filter(
        (battleCardId) => battleCardId !== characterCardId,
      );
      state.sides.player.frontRank.F0 = characterCardId;
    });

    const battlefieldCard = container.querySelector<HTMLElement>(
      '[data-slot-id="player-frontRank-F0"] [data-battle-card-id]',
    );
    if (battlefieldCard === null || deployedCardId === null) {
      throw new Error("expected deployed battlefield card");
    }

    act(() => {
      battlefieldCard.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 280,
        clientY: 300,
      }));
    });

    const kindleTrigger = [...container.querySelectorAll<HTMLElement>(".ctx-item")].find(
      (element) => element.textContent?.includes("Kindle"),
    );
    if (kindleTrigger === undefined) {
      throw new Error("expected Kindle submenu trigger");
    }

    act(() => {
      kindleTrigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    const kindlePlusThree = [...container.querySelectorAll<HTMLElement>(".ctx-submenu .ctx-item")].find(
      (element) => element.textContent?.trim() === "Kindle +3",
    );
    if (kindlePlusThree === undefined) {
      throw new Error("expected Kindle +3 submenu item");
    }

    act(() => {
      kindlePlusThree.click();
    });

    const sparkBadge = [...container.querySelectorAll<HTMLElement>(
      "[data-battle-card-id] .c-spark[aria-label=\"spark\"]",
    )].find(
      (element) => element.closest("[data-battle-card-id]")?.getAttribute("data-battle-card-id") === deployedCardId,
    );
    expect(sparkBadge?.textContent).toBe(String(printedSpark + 3));
    expect(
      getLogEntries().some((entry) =>
        entry.event === "battle_proto_command_applied" &&
        entry.commandId === "KINDLE" &&
        String(entry.label).includes("Kindle 3")
      ),
    ).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("plays a hand card into reserve regardless of energy and exposes override labels in the context menu", () => {
    const { container, root } = renderScreen((state) => {
      state.sides.player.currentEnergy = 0;
      state.sides.player.maxEnergy = 0;
      // Give all hand cards a cost that exceeds available energy.
      for (const battleCardId of state.sides.player.hand) {
        state.cardInstances[battleCardId].definition = {
          ...state.cardInstances[battleCardId].definition,
          energyCost: 99,
        };
      }
    });
    const firstHandCard = container.querySelector<HTMLElement>(
      '[data-battle-region="player-hand-tray"] [data-battle-card-id]',
    );

    if (firstHandCard === null) {
      throw new Error("expected first hand card");
    }
    const firstHandCardId = firstHandCard.getAttribute("data-battle-card-id");

    act(() => {
      firstHandCard.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 200,
        clientY: 140,
      }));
    });

    const playItem = [...container.querySelectorAll<HTMLElement>(".ctx-item")]
      .find((element) => element.textContent === "Play to Back Rank");
    if (playItem === undefined) {
      throw new Error("expected play to reserve item");
    }

    act(() => {
      playItem.click();
    });

    // Even with zero energy the card is played — gating is removed.
    expect(
      container.querySelector('[data-slot-id="player-backRank-B0"]')?.getAttribute("data-slot-card-id"),
    ).toBe(firstHandCardId);

    act(() => {
      root.unmount();
    });
  });

  it("toggles the battle log from the action bar", () => {
    const { container, root } = renderScreen();

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="toggle-log"]')?.click();
    });

    expect(container.querySelector('[data-battle-region="battle-log"]')?.textContent).toContain("Battle log");

    act(() => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Close")?.click();
    });

    expect(container.querySelector('[data-battle-region="battle-log"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("opens read-only side summaries from Dreamcaller image hover", () => {
    const { battleInit, container, root } = renderScreen();

    act(() => {
      container
        .querySelector<HTMLElement>('[data-battle-region="player-status-strip"]')
        ?.querySelector<HTMLElement>("[data-battle-side-summary]")
        ?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(container.querySelector('[data-battle-side-summary-popover="player"]')).toBeNull();

    act(() => {
      container
        .querySelector<HTMLElement>('[data-battle-region="player-status-strip"]')
        ?.querySelector<HTMLElement>("[data-battle-status-dreamcaller-name]")
        ?.dispatchEvent(new Event("pointerenter"));
    });

    expect(container.querySelector('[data-battle-side-summary-popover="player"]')).toBeNull();

    act(() => {
      container
        .querySelector<HTMLElement>('[data-battle-region="player-status-strip"]')
        ?.querySelector<HTMLElement>("[data-battle-status-dreamcaller-thumb]")
        ?.dispatchEvent(new Event("pointerenter"));
    });

    const playerSummary = container.querySelector('[data-battle-side-summary-popover="player"]');
    expect(playerSummary?.className).toBe("side-summary-popover");
    expect(playerSummary?.textContent).toContain("Gain a fleeting advantage");
    expect(playerSummary?.textContent).not.toContain("Status");
    expect(playerSummary?.textContent).not.toContain("Reserve");
    expect(playerSummary?.textContent).not.toContain("Deployed");
    expect(playerSummary?.textContent).not.toContain("Extra Turns");
    expect(playerSummary?.textContent).not.toContain("Quick Zones");
    expect(playerSummary?.textContent).not.toContain("Debug Actions");
    expect(playerSummary?.textContent).not.toContain("Create Figment");
    expect(playerSummary?.textContent).not.toContain("Dreamcaller");
    expect(playerSummary?.querySelector("[data-battle-summary-dreamcaller-card]")).not.toBeNull();
    expect(playerSummary?.querySelector("[data-battle-summary-dreamcaller-rules]")).not.toBeNull();
    expect(playerSummary?.querySelector('img[alt="Aeris, Storm Archivist"]')).not.toBeNull();

    act(() => {
      container
        .querySelector<HTMLElement>('[data-battle-region="enemy-status-strip"]')
        ?.querySelector<HTMLElement>("[data-battle-status-dreamcaller-thumb]")
        ?.dispatchEvent(new Event("pointerenter"));
    });

    expect(container.querySelector('[data-battle-side-summary-popover="player"]')).toBeNull();
    const enemySummary = container.querySelector('[data-battle-side-summary-popover="enemy"]');
    expect(enemySummary?.className).toBe("side-summary-popover");
    expect(enemySummary?.textContent).toContain(
      battleInit.enemyDescriptor.abilityText,
    );
    expect(enemySummary?.textContent).not.toContain("Quick Zones");
    expect(enemySummary?.textContent).not.toContain("Debug Actions");
    expect(enemySummary?.textContent).not.toContain("Create Figment");
    expect(enemySummary?.querySelector("[data-battle-summary-dreamcaller-card]")).not.toBeNull();
    expect(enemySummary?.querySelector("img")).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("creates an enemy Shadow Figment from the inspector into an open reserve slot", () => {
    const { container, initialState, root } = renderScreen((state) => {
      const enemyCardId = state.sides.enemy.hand[0];
      if (enemyCardId === undefined) {
        throw new Error("expected enemy hand card");
      }
      state.sides.enemy.hand = state.sides.enemy.hand.filter((id) => id !== enemyCardId);
      state.sides.enemy.backRank.B0 = enemyCardId;
    });

    act(() => {
      clickChip(container, "Create Figment", 1);
    });

    expect(container.querySelector("[data-battle-figment-creator]")).not.toBeNull();
    expect(
      container.querySelector<HTMLInputElement>('[data-battle-figment-field="subtype"]')?.value,
    ).toBe("Shadow");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[name="battle-figment-slot"][value="B1"]',
      )?.checked,
    ).toBe(true);

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-battle-figment-action="submit"]')
        ?.click();
    });

    const r1CardId = container
      .querySelector('[data-slot-id="enemy-backRank-B1"]')
      ?.getAttribute("data-slot-card-id");
    expect(r1CardId).toMatch(/^bc_/);
    expect(r1CardId).not.toBe(initialState.sides.enemy.backRank.B0);
    expect(container.querySelector('[data-slot-id="enemy-backRank-B1"]')?.textContent).toContain(
      "Shadow Figment",
    );

    act(() => {
      root.unmount();
    });
  });

  it("renders a centered count on a stacked figment card", () => {
    const { container, root } = renderScreen();

    act(() => {
      clickChip(container, "Create Figment");
    });
    act(() => {
      selectFigmentType(container, "Warrior");
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-battle-figment-action="submit"]')
        ?.click();
    });

    act(() => {
      clickChip(container, "Create Figment");
    });
    act(() => {
      selectFigmentType(container, "Warrior");
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-battle-figment-action="submit"]')
        ?.click();
    });

    const stackCardId = container
      .querySelector('[data-slot-id="player-backRank-B0"]')
      ?.getAttribute("data-slot-card-id");
    expect(stackCardId).toMatch(/^bc_/);
    expect(container.querySelector('[data-slot-id="player-backRank-B1"]')?.getAttribute("data-slot-card-id")).toBeNull();
    expect(
      container.querySelector(`[data-battle-card-id="${stackCardId ?? ""}"] .c-figment-count`)?.textContent,
    ).toBe("2");

    act(() => {
      root.unmount();
    });
  });

  it("drags an event hand card onto a battlefield slot like any other card", () => {
    const { container, root } = renderScreen((state) => {
      const eventCardId = state.sides.player.deck.find(
        (battleCardId) => state.cardInstances[battleCardId]?.definition.battleCardKind === "event",
      );
      if (eventCardId === undefined) {
        throw new Error("expected player event card");
      }
      state.sides.player.deck = state.sides.player.deck.filter((battleCardId) => battleCardId !== eventCardId);
      state.sides.player.hand = [...state.sides.player.hand, eventCardId];
    });

    const eventCard = [...container.querySelectorAll<HTMLElement>(
      '[data-battle-region="player-hand-tray"] [data-battle-card-id]',
    )].find((element) => element.textContent?.includes("Ion Burst"));

    if (eventCard === undefined) {
      throw new Error("expected event hand card");
    }

    const eventCardId = eventCard.getAttribute("data-battle-card-id");
    const reserveSlot = container.querySelector<HTMLElement>('[data-slot-id="player-backRank-B0"]');

    if (eventCardId === null || reserveSlot === null) {
      throw new Error("expected event card id and reserve slot");
    }

    act(() => {
      eventCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    // Events are no longer special-cased: any dragged card highlights every
    // battlefield slot as a drop target.
    expect(reserveSlot.getAttribute("data-battle-drop-target")).toBe("true");

    act(() => {
      reserveSlot.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    // The event lands directly on the slot via the unrestricted move.
    expect(
      container.querySelector(
        `[data-battle-region="player-hand-tray"] [data-battle-card-id="${eventCardId}"]`,
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot-id="player-backRank-B0"]')?.getAttribute("data-slot-card-id"),
    ).toBe(eventCardId);

    act(() => {
      root.unmount();
    });
  });

  it("shows a full card hover preview for battlefield cards", () => {
    const { container, initialState, root } = renderScreen((state) => {
      const deployedCardId = state.sides.player.hand.shift();
      if (deployedCardId === undefined) {
        throw new Error("expected player hand card");
      }
      state.sides.player.frontRank.F0 = deployedCardId;
    });

    const battlefieldCard = container.querySelector<HTMLElement>(
      '[data-slot-id="player-frontRank-F0"] [data-battle-card-id]',
    );

    if (battlefieldCard === null) {
      throw new Error("expected battlefield card");
    }
    const hoveredCardId = initialState.sides.player.frontRank.F0;
    if (hoveredCardId === null) {
      throw new Error("expected deployed card id");
    }

    act(() => {
      battlefieldCard.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        clientX: 320,
        clientY: 240,
      }));
      battlefieldCard.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        clientX: 340,
        clientY: 260,
      }));
    });

    expect(container.querySelector("[data-battle-hover-preview]")?.textContent).toContain(
      initialState.cardInstances[hoveredCardId]?.definition.renderedText ?? "",
    );

    act(() => {
      battlefieldCard.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });

    expect(container.querySelector("[data-battle-hover-preview]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shows a full card hover preview for stack cards", () => {
    const { container, initialState, root } = renderScreen((state) => {
      const stackedCardId = state.sides.player.hand.shift();
      if (stackedCardId === undefined) {
        throw new Error("expected player hand card");
      }
      state.stack ??= [];
      state.stack.push({
        stackEntryId: "stack_test_0001",
        battleCardId: stackedCardId,
        side: "player",
        paidCost: 0,
      });
    });

    const stackCard = container.querySelector<HTMLElement>(
      '[data-battle-region="stack-zone"] [data-battle-card-id]',
    );
    const hoveredCardId = initialState.stack?.[0]?.battleCardId;

    if (stackCard === null || hoveredCardId === undefined) {
      throw new Error("expected stack card");
    }

    act(() => {
      stackCard.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        clientX: 320,
        clientY: 240,
      }));
      stackCard.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        clientX: 340,
        clientY: 260,
      }));
    });

    expect(container.querySelector("[data-battle-hover-preview]")?.textContent).toContain(
      initialState.cardInstances[hoveredCardId]?.definition.renderedText ?? "",
    );

    act(() => {
      stackCard.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });

    expect(container.querySelector("[data-battle-hover-preview]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("closes and suppresses card hover previews while a hand card drag is active", () => {
    const { container, root } = renderScreen();
    const handCards = [
      ...container.querySelectorAll<HTMLElement>(
        '[data-battle-region="player-hand-tray"] [data-battle-card-id]',
      ),
    ];
    const firstHandCard = handCards[0];
    const secondHandCard = handCards[1];

    if (firstHandCard === undefined || secondHandCard === undefined) {
      throw new Error("expected at least two hand cards");
    }

    act(() => {
      firstHandCard.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        clientX: 320,
        clientY: 240,
      }));
    });

    expect(container.querySelector("[data-battle-hover-preview]")).not.toBeNull();

    act(() => {
      firstHandCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector("[data-battle-hover-preview]")).toBeNull();

    act(() => {
      secondHandCard.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        clientX: 360,
        clientY: 260,
      }));
    });

    expect(container.querySelector("[data-battle-hover-preview]")).toBeNull();

    act(() => {
      firstHandCard.dispatchEvent(new Event("dragend", { bubbles: true, cancelable: true }));
    });

    act(() => {
      secondHandCard.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        clientX: 380,
        clientY: 280,
      }));
    });

    expect(container.querySelector("[data-battle-hover-preview]")).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("closes card hover previews when dragging a battlefield card", () => {
    const { container, root } = renderScreen((state) => {
      const deployedCardId = state.sides.player.hand.shift();
      if (deployedCardId === undefined) {
        throw new Error("expected player hand card");
      }
      state.sides.player.frontRank.F0 = deployedCardId;
    });

    const battlefieldCard = container.querySelector<HTMLElement>(
      '[data-slot-id="player-frontRank-F0"] [data-battle-card-id]',
    );

    if (battlefieldCard === null) {
      throw new Error("expected battlefield card");
    }

    act(() => {
      battlefieldCard.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        clientX: 320,
        clientY: 240,
      }));
    });

    expect(container.querySelector("[data-battle-hover-preview]")).not.toBeNull();

    act(() => {
      battlefieldCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector("[data-battle-hover-preview]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("keeps the phase indicator in the persistent battle UI", () => {
    const { container, root } = renderScreen((state) => {
      state.phase = "day";
      state.activeSide = "player";
    });

    expect(container.textContent).toContain("Player Turn 1 Day");
    expect(container.textContent).not.toContain("Your Turn");
    expect(container.querySelector("[data-battle-judgment-overlay]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("opens an essence-only victory reward surface from Force victory, supports dismiss/reopen, and finishes via Continue", () => {
    const { battleInit, container, root } = renderScreen();

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="skip-to-rewards"]')?.click();
    });

    expect(container.querySelector("[data-battle-reward-surface]")).not.toBeNull();
    expect(container.textContent).toContain("Essence Earned");

    // Card-selection chrome must not appear anywhere on the reward surface.
    expect(container.querySelector("[data-battle-reward-card]")).toBeNull();
    expect(
      container.querySelector('[data-battle-reward-action="select"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-battle-reward-action="confirm"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("Choose a Card Reward");

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-reward-action="cancel"]')?.click();
    });

    expect(container.querySelector("[data-battle-reward-surface]")).toBeNull();
    expect(container.textContent).toContain("victory — reopen");

    act(() => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "victory — reopen")?.click();
    });

    const continueButton = container.querySelector<HTMLButtonElement>(
      '[data-battle-reward-action="continue"]',
    );
    expect(continueButton).not.toBeNull();
    expect(continueButton?.disabled).toBe(false);

    act(() => {
      continueButton?.click();
    });

    expect(battleCompletionBridge.completeBattleSiteVictory).toHaveBeenCalledTimes(1);
    const bridgeCall = battleCompletionBridge.completeBattleSiteVictory.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(bridgeCall).toMatchObject({
      battleId: battleInit.battleId,
      siteId: battleInit.siteId,
      essenceReward: battleInit.essenceReward,
    });
    // Battle victory should never plumb a reward card through the bridge.
    expect(bridgeCall).not.toHaveProperty("selectedRewardCard");

    act(() => {
      root.unmount();
    });
  });

  it("routes defeat reset through the shared failure flow from the inspector result section", () => {
    const { battleInit, container, root } = renderScreen();

    act(() => {
      clickChip(container, "Force defeat");
    });

    expect(container.querySelector('[data-battle-result-overlay="defeat"]')).not.toBeNull();

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-result-action="reset-run"]')?.click();
    });

    expect(failureRouteMock.beginQuestFailureRoute).toHaveBeenCalledTimes(1);
    expect(failureRouteMock.beginQuestFailureRoute.mock.calls[0]?.[0]).toMatchObject({
      battleInit: {
        battleId: battleInit.battleId,
        siteId: battleInit.siteId,
        dreamscapeId: battleInit.dreamscapeId,
      },
      result: "defeat",
      siteLabel: "Battle",
    });

    act(() => {
      root.unmount();
    });
  });

  it("double-clicking an over-cost hand card during night phase plays it onto the battlefield with no energy gating", () => {
    let overpriceCardId = "";
    const { container, root } = renderScreen((state) => {
      state.phase = "night";
      state.activeSide = "enemy";
      state.sides.player.currentEnergy = 0;
      state.sides.player.maxEnergy = 0;
      overpriceCardId = state.sides.player.hand[0] ?? "";
      if (overpriceCardId === "") {
        throw new Error("expected player hand card");
      }
      state.cardInstances[overpriceCardId].definition = {
        ...state.cardInstances[overpriceCardId].definition,
        energyCost: 99,
      };
    });

    const handCard = container.querySelector<HTMLElement>(
      `[data-battle-region="player-hand-tray"] [data-battle-card-id="${overpriceCardId}"]`,
    );
    if (handCard === null) {
      throw new Error("expected player hand card element");
    }

    act(() => {
      handCard.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    // The double-click plays the card onto the battlefield (removed from
    // hand) without any energy or phase gating.
    expect(
      container.querySelector(
        `[data-battle-region="player-hand-tray"] [data-battle-card-id="${overpriceCardId}"]`,
      ),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("drops a player hand card onto an enemy deployed slot via the cross-side unrestricted move", () => {
    let playerCardId = "";
    const { container, root } = renderScreen((state) => {
      playerCardId = state.sides.player.hand[0] ?? "";
      if (playerCardId === "") {
        throw new Error("expected player hand card");
      }
      // Clear an enemy deployed slot so the move lands on an empty target.
      state.sides.enemy.frontRank.F0 = null;
    });

    const handCard = container.querySelector<HTMLElement>(
      `[data-battle-region="player-hand-tray"] [data-battle-card-id="${playerCardId}"]`,
    );
    const enemyDeployedSlot = container.querySelector<HTMLElement>('[data-slot-id="enemy-frontRank-F0"]');
    if (handCard === null || enemyDeployedSlot === null) {
      throw new Error("expected player hand card and enemy deployed slot");
    }

    act(() => {
      handCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });
    act(() => {
      enemyDeployedSlot.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    // MOVE_CARD_TO_ZONE with destination.side === "enemy": the player card is
    // now controlled by the enemy and occupies their deployed slot.
    expect(
      container.querySelector('[data-slot-id="enemy-frontRank-F0"]')?.getAttribute("data-slot-card-id"),
    ).toBe(playerCardId);
    expect(
      container.querySelector(
        `[data-battle-region="player-hand-tray"] [data-battle-card-id="${playerCardId}"]`,
      ),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("double-clicks a hand card into reserve without changing either side's current energy", () => {
    let playerCardId = "";
    const { container, root } = renderScreen((state) => {
      state.sides.player.currentEnergy = 4;
      state.sides.player.maxEnergy = 7;
      state.sides.enemy.currentEnergy = 5;
      state.sides.enemy.maxEnergy = 9;
      playerCardId = state.sides.player.hand[0] ?? "";
      if (playerCardId === "") {
        throw new Error("expected player hand card");
      }
    });

    const readEnergy = (side: string): string | null | undefined =>
      container.querySelector(`[data-battle-stat="${side}:energy"]`)?.getAttribute("data-battle-current-energy");
    const playerEnergyBefore = readEnergy("player");
    const enemyEnergyBefore = readEnergy("enemy");

    const handCard = container.querySelector<HTMLElement>(
      `[data-battle-region="player-hand-tray"] [data-battle-card-id="${playerCardId}"]`,
    );
    if (handCard === null) {
      throw new Error("expected player hand card element");
    }

    act(() => {
      handCard.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    // The card lands in the first open reserve slot...
    expect(
      [...container.querySelectorAll("[data-slot-id^='player-backRank-']")]
        .some((slot) => slot.getAttribute("data-slot-card-id") === playerCardId),
    ).toBe(true);
    // ...and neither side's current energy changed (a move never pays a cost).
    expect(readEnergy("player")).toBe(playerEnergyBefore);
    expect(readEnergy("enemy")).toBe(enemyEnergyBefore);

    act(() => {
      root.unmount();
    });
  });

  it("drops a deployed card onto the void zone via the unrestricted move", () => {
    let deployedCardId = "";
    const { container, root } = renderScreen((state) => {
      const characterId = state.sides.player.hand.find(
        (battleCardId) => state.cardInstances[battleCardId]?.definition.battleCardKind === "character",
      ) ?? state.sides.player.deck.find(
        (battleCardId) => state.cardInstances[battleCardId]?.definition.battleCardKind === "character",
      );
      if (characterId === undefined) {
        throw new Error("expected player character");
      }
      deployedCardId = characterId;
      state.sides.player.hand = state.sides.player.hand.filter((id) => id !== characterId);
      state.sides.player.deck = state.sides.player.deck.filter((id) => id !== characterId);
      state.sides.player.frontRank.F0 = characterId;
    });

    const deployedCard = container.querySelector<HTMLElement>(
      `[data-slot-id="player-frontRank-F0"] [data-battle-card-id="${deployedCardId}"]`,
    );
    if (deployedCard === null) {
      throw new Error("expected deployed card");
    }

    act(() => {
      deployedCard.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 300,
        clientY: 300,
      }));
    });
    const voidItem = [...container.querySelectorAll<HTMLElement>(".ctx-item")]
      .find((element) => element.textContent === "→ Void");
    if (voidItem === undefined) {
      throw new Error("expected void move item");
    }

    act(() => {
      voidItem.click();
    });

    expect(
      container.querySelector('[data-slot-id="player-frontRank-F0"]')?.getAttribute("data-slot-card-id"),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("drops a battlefield card onto the player hand tray via the unrestricted move", () => {
    let deployedCardId = "";
    const { container, root } = renderScreen((state) => {
      const characterId = state.sides.player.hand.find(
        (battleCardId) => state.cardInstances[battleCardId]?.definition.battleCardKind === "character",
      ) ?? state.sides.player.deck.find(
        (battleCardId) => state.cardInstances[battleCardId]?.definition.battleCardKind === "character",
      );
      if (characterId === undefined) {
        throw new Error("expected player character");
      }
      deployedCardId = characterId;
      state.sides.player.hand = state.sides.player.hand.filter((id) => id !== characterId);
      state.sides.player.deck = state.sides.player.deck.filter((id) => id !== characterId);
      state.sides.player.frontRank.F0 = characterId;
    });

    const deployedCard = container.querySelector<HTMLElement>(
      `[data-slot-id="player-frontRank-F0"] [data-battle-card-id="${deployedCardId}"]`,
    );
    const handTray = container.querySelector<HTMLElement>('[data-battle-region="player-hand-tray"]');
    if (deployedCard === null || handTray === null) {
      throw new Error("expected deployed card and player hand tray");
    }
    act(() => {
      deployedCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });
    expect(handTray.getAttribute("data-battle-zone-drop-target")).toBe("player:hand");
    act(() => {
      handTray.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(
      container.querySelector('[data-slot-id="player-frontRank-F0"]')?.getAttribute("data-slot-card-id"),
    ).toBeNull();
    expect(
      container.querySelector(
        `[data-battle-region="player-hand-tray"] [data-battle-card-id="${deployedCardId}"]`,
      ),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("drops a battlefield card onto the revealed enemy hand tray via the unrestricted move", () => {
    let deployedCardId = "";
    const { container, root } = renderScreen((state) => {
      const characterId = state.sides.player.hand.find(
        (battleCardId) => state.cardInstances[battleCardId]?.definition.battleCardKind === "character",
      ) ?? state.sides.player.deck.find(
        (battleCardId) => state.cardInstances[battleCardId]?.definition.battleCardKind === "character",
      );
      if (characterId === undefined) {
        throw new Error("expected player character");
      }
      deployedCardId = characterId;
      state.sides.player.hand = state.sides.player.hand.filter((id) => id !== characterId);
      state.sides.player.deck = state.sides.player.deck.filter((id) => id !== characterId);
      state.sides.player.frontRank.F0 = characterId;
    });

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });
    const deployedCard = container.querySelector<HTMLElement>(
      `[data-slot-id="player-frontRank-F0"] [data-battle-card-id="${deployedCardId}"]`,
    );
    const enemyHandTray = container.querySelector<HTMLElement>('[data-battle-region="opponent-hand-tray"]');
    if (deployedCard === null || enemyHandTray === null) {
      throw new Error("expected deployed card and revealed enemy hand tray");
    }
    act(() => {
      deployedCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });
    expect(enemyHandTray.getAttribute("data-battle-zone-drop-target")).toBe("enemy:hand");
    act(() => {
      enemyHandTray.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(
      container.querySelector('[data-slot-id="player-frontRank-F0"]')?.getAttribute("data-slot-card-id"),
    ).toBeNull();
    expect(
      container.querySelector(
        `[data-battle-region="opponent-hand-tray"] [data-battle-card-id="${deployedCardId}"]`,
      ),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("has no end-turn button and pressing e dispatches nothing", () => {
    const { container, root } = renderScreen();

    expect(container.querySelector('[data-battle-action="end-turn"]')).toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
    });

    // Pressing e must not trigger any state change — undo stays disabled.
    expect(
      container.querySelector<HTMLButtonElement>('[data-battle-action="undo"]')?.disabled,
    ).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("adjusts both sides' score and current energy from status-strip arrow controls", () => {
    vi.useFakeTimers();
    const { container, root } = renderScreen((state) => {
      state.sides.player.score = 4;
      state.sides.player.currentEnergy = 2;
      state.sides.player.maxEnergy = 5;
      state.sides.enemy.score = 7;
      state.sides.enemy.currentEnergy = 3;
      state.sides.enemy.maxEnergy = 6;
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Increase your points"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Decrease your energy"]')?.click();
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Increase your maximum energy and refill energy"]')
        ?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Decrease enemy points"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Increase enemy energy"]')?.click();
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Increase enemy maximum energy and refill energy"]')
        ?.click();
    });

    expect(container.querySelector('[data-battle-stat="player:score"]')?.getAttribute("data-battle-value"))
      .toBe("5");
    expect(container.querySelector('[data-battle-stat="player:energy"]')?.getAttribute("data-battle-current-energy"))
      .toBe("6");
    expect(container.querySelector('[data-battle-stat="player:energy"]')?.getAttribute("data-battle-max-energy"))
      .toBe("6");
    expect(container.querySelector('[data-battle-stat="enemy:score"]')?.getAttribute("data-battle-value"))
      .toBe("6");
    expect(container.querySelector('[data-battle-stat="enemy:energy"]')?.getAttribute("data-battle-current-energy"))
      .toBe("7");
    expect(container.querySelector('[data-battle-stat="enemy:energy"]')?.getAttribute("data-battle-max-energy"))
      .toBe("7");

    expect(getLogEntries().some((entry) =>
      entry.event === "battle_proto_command_applied" &&
      entry.commandId === "INCREASE_MAX_ENERGY_AND_FILL" &&
      entry.sourceSurface === "status-strip"
    )).toBe(true);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    const commandLogs = getLogEntries().filter((entry) => entry.event === "battle_proto_command_applied");
    const lastCommandLog = commandLogs[commandLogs.length - 1];
    expect(lastCommandLog?.sourceSurface).toBe("status-strip");

    act(() => {
      root.unmount();
    });
    vi.useRealTimers();
  });

  it("draws one card for each side from its status-strip draw button", () => {
    const { container, initialState, root } = renderScreen();
    const playerDrawnCardId = initialState.sides.player.deck[0];
    const enemyDrawnCardId = initialState.sides.enemy.deck[0];
    if (playerDrawnCardId === undefined || enemyDrawnCardId === undefined) {
      throw new Error("expected both decks to contain a card");
    }
    const initialPlayerHandCount = initialState.sides.player.hand.length;
    const initialEnemyHandCount = initialState.sides.enemy.hand.length;

    const playerDrawButton = container.querySelector<HTMLButtonElement>(
      '[data-battle-region="player-status-strip"] [data-battle-action="status-draw-player"]',
    );
    const enemyDrawButton = container.querySelector<HTMLButtonElement>(
      '[data-battle-region="enemy-status-strip"] [data-battle-action="status-draw-enemy"]',
    );

    expect(playerDrawButton).not.toBeNull();
    expect(playerDrawButton?.textContent).toBe("Draw card");
    expect(enemyDrawButton).not.toBeNull();
    expect(enemyDrawButton?.textContent).toBe("Draw card");

    act(() => {
      playerDrawButton?.click();
    });

    expect(container.querySelectorAll('[data-battle-region="player-hand-tray"] [data-battle-card-id]'))
      .toHaveLength(initialPlayerHandCount + 1);
    expect(
      container.querySelector(
        `[data-battle-region="player-hand-tray"] [data-battle-card-id="${playerDrawnCardId}"]`,
      ),
    ).not.toBeNull();
    expect(getLogEntries().some((entry) =>
      entry.event === "battle_proto_command_applied" &&
      entry.commandId === "DRAW_CARD" &&
      entry.label === "Draw 1 for Player" &&
      entry.sourceSurface === "status-strip"
    )).toBe(true);

    act(() => {
      enemyDrawButton?.click();
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });

    expect(container.querySelectorAll('[data-battle-region="opponent-hand-tray"] [data-battle-card-id]'))
      .toHaveLength(initialEnemyHandCount + 1);
    expect(
      container.querySelector(
        `[data-battle-region="opponent-hand-tray"] [data-battle-card-id="${enemyDrawnCardId}"]`,
      ),
    ).not.toBeNull();

    expect(getLogEntries().some((entry) =>
      entry.event === "battle_proto_command_applied" &&
      entry.commandId === "DRAW_CARD" &&
      entry.label === "Draw 1 for Enemy" &&
      entry.sourceSurface === "status-strip"
    )).toBe(true);

    act(() => {
      root.unmount();
    });
  });
});

function selectFigmentType(container: HTMLElement, subtype: string): void {
  const select = container.querySelector<HTMLSelectElement>(
    '[data-battle-figment-field="subtype"]',
  );
  if (select === null) {
    throw new Error("missing figment-type select");
  }
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  );
  descriptor?.set?.call(select, subtype);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickChip(container: HTMLElement, label: string, matchIndex = 0): void {
  const chips = [...container.querySelectorAll<HTMLElement>(".chip")].filter(
    (element) => element.textContent?.trim() === label,
  );
  const chip = chips[matchIndex];
  if (chip === undefined) {
    throw new Error(`missing chip: ${label}`);
  }
  chip.click();
}
