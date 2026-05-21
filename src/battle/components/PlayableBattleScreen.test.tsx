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
    cardsByPackageTide: new Map(),
    dreamcallers: makeBattleTestDreamcallers(),
    dreamsignTemplates: [],
    resolvedPackagesByDreamcallerId: new Map(),
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

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
        <PlayableBattleScreen site={testBattle.site} />
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
      "player-status-strip",
      "enemy-reserve-row",
      "enemy-deployed-row",
      "judgment-divider",
      "player-deployed-row",
      "player-reserve-row",
      "enemy-status-strip",
      "player-hand-tray",
      "action-bar",
    ]);
    expect(container.querySelector('[data-battle-region="stack-zone"]')?.parentElement?.className)
      .toContain("battlefield-zone-layout");
    expect(container.querySelector('[data-battle-region="player-status-strip"]')?.parentElement?.className)
      .toContain("battlefield-zone-layout");
    expect(container.querySelector('[data-battle-region="enemy-status-strip"]')?.parentElement?.className)
      .toContain("battlefield-zone-layout");
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
    const emptySlot = container.querySelector<HTMLElement>('[data-slot-id="player-reserve-R0"]');
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
      container.querySelector('[data-slot-id="player-reserve-R0"]')?.getAttribute("data-slot-card-id"),
    ).toBeNull();
    expect(container.textContent).not.toContain("Your reserve R0");
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
      const [stackedCardId] = state.sides.player.hand;
      if (stackedCardId === undefined) {
        throw new Error("expected player hand card");
      }
      state.sides.player.hand = state.sides.player.hand.filter((battleCardId) => battleCardId !== stackedCardId);
      state.stack ??= [];
      state.stack.push({
        stackEntryId: "stack_test_0001",
        battleCardId: stackedCardId,
        side: "player",
        paidCost: 0,
      });
    });
    const stackZone = container.querySelector<HTMLElement>('[data-battle-region="stack-zone"]');

    expect(stackZone).not.toBeNull();
    expect(stackZone?.textContent).toContain("Stack");
    expect(stackZone?.querySelector("[data-battle-card-id]")).not.toBeNull();
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
    const { container, root } = renderScreen((state) => {
      state.activeSide = "enemy";
      state.phase = "day";
      state.sides.enemy.currentEnergy = 0;
      enemyCardId = state.sides.enemy.hand[0] ?? "";
      enemyCardName = state.cardInstances[enemyCardId].definition.name;
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

    expect(enemyCard?.getAttribute("data-battle-card-variant")).toBe("hand");
    expect(enemyCard?.hasAttribute("data-battle-hand-card")).toBe(true);
    expect(enemyCard?.classList.contains("hand-card")).toBe(true);
    expect(enemyCard?.classList.contains("quest-card")).toBe(true);
    expect(enemyCard?.classList.contains("opponent-card")).toBe(true);
    // Even when cost exceeds energy, no affordability dimming class is applied.
    expect(enemyCard?.classList.contains("unaffordable")).toBe(false);
    expect(enemyCard?.classList.contains("playable")).toBe(false);
    expect(enemyCard?.getAttribute("draggable")).toBe("true");

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
      container.querySelector<HTMLElement>('[data-slot-id="player-reserve-R0"]')
        ?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(
      container.querySelector('[data-slot-id="player-reserve-R0"]')?.getAttribute("data-slot-card-id"),
    ).toBe(firstHandCard.getAttribute("data-battle-card-id"));

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
      state.sides.player.reserve.R0 = battleCardId;
    });
    const reserveCard = container.querySelector<HTMLElement>(
      `[data-slot-id="player-reserve-R0"] [data-battle-card-id="${reserveCardId}"]`,
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
    expect(menu?.textContent).toContain("→ Deployed");

    const moveToDeployed = [...container.querySelectorAll<HTMLElement>(".ctx-item")]
      .find((element) => element.textContent === "→ Deployed");
    if (moveToDeployed === undefined) {
      throw new Error("expected move to deployed item");
    }

    act(() => {
      moveToDeployed.click();
    });

    expect(container.querySelector('[data-slot-id="player-reserve-R0"]')?.getAttribute("data-slot-card-id")).toBeNull();
    expect(container.querySelector('[data-slot-id="player-deployed-D0"]')?.getAttribute("data-slot-card-id")).toBe(reserveCardId);

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
      state.sides.enemy.reserve.R0 = battleCardId;
    });
    const reserveSlot = container.querySelector<HTMLElement>('[data-slot-id="enemy-reserve-R0"]');
    const deployedSlot = container.querySelector<HTMLElement>('[data-slot-id="enemy-deployed-D0"]');
    const reserveCard = container.querySelector<HTMLElement>(
      `[data-slot-id="enemy-reserve-R0"] [data-battle-card-id="${reserveCardId}"]`,
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
    expect(menu?.textContent).toContain("→ Deployed");

    const moveToDeployed = [...container.querySelectorAll<HTMLElement>(".ctx-item")]
      .find((element) => element.textContent === "→ Deployed");
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

    const enemyReserveSlot = container.querySelector<HTMLElement>('[data-slot-id="enemy-reserve-R0"]');
    if (enemyReserveSlot === null) {
      throw new Error("expected enemy reserve slot");
    }

    act(() => {
      opponentCard.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    expect(
      container.querySelector<HTMLElement>('[data-slot-id="enemy-reserve-R0"]')
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
    expect(menu?.textContent).toContain("Play to void");
    const playItem = [...container.querySelectorAll<HTMLElement>(".ctx-item")]
      .find((element) => element.textContent === "Play to void");
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
      state.sides.player.reserve.R0 = playerCardId;
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
      `[data-slot-id="player-reserve-R0"] [data-battle-card-id="${stalePlayerCardId}"]`,
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
      .find((element) => element.textContent === "Play to reserve");
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
      container.querySelector('[data-slot-id="player-reserve-R0"]')?.getAttribute("data-slot-card-id"),
    ).toBe(stalePlayerCardId);
    expect(
      [...container.querySelectorAll("[data-slot-id^='enemy-reserve-']")]
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

  it("does not expose status-strip zone targets for debug movement", () => {
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

    expect(container.querySelector('[data-battle-zone-open="enemy:void"]')).toBeNull();
    expect(container.querySelector('[data-battle-zone-open="player:void"]')).toBeNull();

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
    expect(menu?.textContent).toContain("Play to reserve");
    expect(menu?.textContent).toContain("Play, deploy");
    expect(menu?.textContent).toContain("Kindle");
    expect(menu?.textContent).toContain("→ Reserve");
    expect(menu?.textContent).toContain("→ Deployed");
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
      state.sides.player.deployed.D0 = characterCardId;
    });

    const battlefieldCard = container.querySelector<HTMLElement>(
      '[data-slot-id="player-deployed-D0"] [data-battle-card-id]',
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
      .find((element) => element.textContent === "Play to reserve");
    if (playItem === undefined) {
      throw new Error("expected play to reserve item");
    }

    act(() => {
      playItem.click();
    });

    // Even with zero energy the card is played — gating is removed.
    expect(
      container.querySelector('[data-slot-id="player-reserve-R0"]')?.getAttribute("data-slot-card-id"),
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

  it("opens read-only side summaries on status-strip hover", () => {
    const { container, root } = renderScreen();

    act(() => {
      container
        .querySelector<HTMLElement>('[data-battle-region="player-status-strip"]')
        ?.querySelector<HTMLElement>("[data-battle-side-summary]")
        ?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    const playerSummary = container.querySelector('[data-battle-side-summary-popover="player"]');
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
        ?.querySelector<HTMLElement>("[data-battle-side-summary]")
        ?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(container.querySelector('[data-battle-side-summary-popover="player"]')).toBeNull();
    const enemySummary = container.querySelector('[data-battle-side-summary-popover="enemy"]');
    expect(enemySummary?.textContent).toContain("field grows harder to uproot");
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
      state.sides.enemy.reserve.R0 = enemyCardId;
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
        'input[name="battle-figment-slot"][value="R1"]',
      )?.checked,
    ).toBe(true);

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-battle-figment-action="submit"]')
        ?.click();
    });

    const r1CardId = container
      .querySelector('[data-slot-id="enemy-reserve-R1"]')
      ?.getAttribute("data-slot-card-id");
    expect(r1CardId).toMatch(/^bc_/);
    expect(r1CardId).not.toBe(initialState.sides.enemy.reserve.R0);
    expect(container.querySelector('[data-slot-id="enemy-reserve-R1"]')?.textContent).toContain(
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
      const input = container.querySelector<HTMLInputElement>('[data-battle-figment-field="subtype"]');
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      descriptor?.set?.call(input, "Seeker");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
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
      const input = container.querySelector<HTMLInputElement>('[data-battle-figment-field="subtype"]');
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      descriptor?.set?.call(input, "Seeker");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-battle-figment-action="submit"]')
        ?.click();
    });

    const stackCardId = container
      .querySelector('[data-slot-id="player-reserve-R0"]')
      ?.getAttribute("data-slot-card-id");
    expect(stackCardId).toMatch(/^bc_/);
    expect(container.querySelector('[data-slot-id="player-reserve-R1"]')?.getAttribute("data-slot-card-id")).toBeNull();
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
    const reserveSlot = container.querySelector<HTMLElement>('[data-slot-id="player-reserve-R0"]');

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
      container.querySelector('[data-slot-id="player-reserve-R0"]')?.getAttribute("data-slot-card-id"),
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
      state.sides.player.deployed.D0 = deployedCardId;
    });

    const battlefieldCard = container.querySelector<HTMLElement>(
      '[data-slot-id="player-deployed-D0"] [data-battle-card-id]',
    );

    if (battlefieldCard === null) {
      throw new Error("expected battlefield card");
    }
    const hoveredCardId = initialState.sides.player.deployed.D0;
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
      state.sides.enemy.deployed.D0 = null;
    });

    const handCard = container.querySelector<HTMLElement>(
      `[data-battle-region="player-hand-tray"] [data-battle-card-id="${playerCardId}"]`,
    );
    const enemyDeployedSlot = container.querySelector<HTMLElement>('[data-slot-id="enemy-deployed-D0"]');
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
      container.querySelector('[data-slot-id="enemy-deployed-D0"]')?.getAttribute("data-slot-card-id"),
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
      [...container.querySelectorAll("[data-slot-id^='player-reserve-']")]
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
      state.sides.player.deployed.D0 = characterId;
    });

    const deployedCard = container.querySelector<HTMLElement>(
      `[data-slot-id="player-deployed-D0"] [data-battle-card-id="${deployedCardId}"]`,
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
      container.querySelector('[data-slot-id="player-deployed-D0"]')?.getAttribute("data-slot-card-id"),
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
      state.sides.player.deployed.D0 = characterId;
    });

    const deployedCard = container.querySelector<HTMLElement>(
      `[data-slot-id="player-deployed-D0"] [data-battle-card-id="${deployedCardId}"]`,
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
      container.querySelector('[data-slot-id="player-deployed-D0"]')?.getAttribute("data-slot-card-id"),
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
      state.sides.player.deployed.D0 = characterId;
    });

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="toggle-opponent-hand"]')?.click();
    });
    const deployedCard = container.querySelector<HTMLElement>(
      `[data-slot-id="player-deployed-D0"] [data-battle-card-id="${deployedCardId}"]`,
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
      container.querySelector('[data-slot-id="player-deployed-D0"]')?.getAttribute("data-slot-card-id"),
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
      container.querySelector<HTMLButtonElement>('button[aria-label="Decrease enemy points"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Increase enemy energy"]')?.click();
    });

    expect(container.querySelector('[data-battle-stat="player:score"]')?.getAttribute("data-battle-value"))
      .toBe("5");
    expect(container.querySelector('[data-battle-stat="player:energy"]')?.getAttribute("data-battle-current-energy"))
      .toBe("1");
    expect(container.querySelector('[data-battle-stat="player:energy"]')?.getAttribute("data-battle-max-energy"))
      .toBe("5");
    expect(container.querySelector('[data-battle-stat="enemy:score"]')?.getAttribute("data-battle-value"))
      .toBe("6");
    expect(container.querySelector('[data-battle-stat="enemy:energy"]')?.getAttribute("data-battle-current-energy"))
      .toBe("4");
    expect(container.querySelector('[data-battle-stat="enemy:energy"]')?.getAttribute("data-battle-max-energy"))
      .toBe("6");

    expect(getLogEntries().some((entry) => entry.event === "battle_proto_command_applied")).toBe(false);

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
});

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
