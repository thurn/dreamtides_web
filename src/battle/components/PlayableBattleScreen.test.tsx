// @vitest-environment jsdom

import { act, useReducer, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Database } from "firebase/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestProvider } from "../../state/quest-context";
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
import { PlayableBattleScreen } from "./PlayableBattleScreen";

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
    ) => battleControllerReducer(reducerState, action, battleInit),
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
  it("renders the new battle shell in the required region order with minimal controls", () => {
    const { container, root } = renderScreen();

    expect(
      [...container.querySelectorAll("[data-battle-region]")]
        .map((element) => element.getAttribute("data-battle-region")),
    ).toEqual([
      "status-bar",
      "enemy-status-strip",
      "enemy-reserve-row",
      "enemy-deployed-row",
      "judgment-divider",
      "player-deployed-row",
      "player-reserve-row",
      "stack-zone",
      "player-status-strip",
      "player-hand-tray",
      "action-bar",
    ]);
    expect(container.textContent).toContain("You");
    expect(container.textContent).toContain("Enemy");
    expect(container.textContent).toContain("Undo");
    expect(container.textContent).toContain("Redo");
    expect(container.textContent).toContain("Log");
    expect(container.textContent).toContain("Skip to rewards");
    expect(container.textContent).toContain("End Phase");
    expect(container.querySelector(".inspector.open")).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("plays a selected hand card into reserve through the battlefield shell", () => {
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
      firstHandCard.click();
    });

    act(() => {
      container.querySelector<HTMLElement>('[data-slot-id="player-reserve-R0"]')?.click();
    });

    expect(
      container.querySelector('[data-slot-id="player-reserve-R0"]')?.getAttribute("data-slot-card-id"),
    ).toBe(firstHandCard.getAttribute("data-battle-card-id"));

    act(() => {
      root.unmount();
    });
  });

  it("opens the zone browser from the status strip with the mockup controls", () => {
    const { container, root } = renderScreen();

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-zone-open="player:hand"]')?.click();
    });

    expect(container.textContent).toContain("Your Hand");
    expect(
      container.querySelector<HTMLInputElement>("[data-zone-browser-search]")?.placeholder,
    ).toBe("Search by name…");
    expect(container.textContent).toContain("Current order");
    expect(container.textContent).toContain("All types");

    act(() => {
      container.querySelector<HTMLElement>(".modal-scrim")?.click();
    });

    expect(container.textContent).not.toContain("Your Hand");

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
    expect(menu?.textContent).toContain("Inspect");

    act(() => {
      root.unmount();
    });
  });

  it("blocks unaffordable hand plays from normal battlefield clicks but exposes override labels in the context menu", () => {
    const { container, root } = renderScreen((state) => {
      state.sides.player.currentEnergy = 0;
      state.sides.player.maxEnergy = 0;
    });
    const firstHandCard = container.querySelector<HTMLElement>(
      '[data-battle-region="player-hand-tray"] [data-battle-card-id]',
    );

    if (firstHandCard === null) {
      throw new Error("expected first hand card");
    }

    act(() => {
      firstHandCard.click();
    });

    act(() => {
      container.querySelector<HTMLElement>('[data-slot-id="player-reserve-R0"]')?.click();
    });

    expect(
      container.querySelector('[data-slot-id="player-reserve-R0"]')?.getAttribute("data-slot-card-id"),
    ).toBeNull();

    act(() => {
      firstHandCard.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 200,
        clientY: 140,
      }));
    });

    const menu = container.querySelector("[data-battle-context-menu]");
    expect(menu?.textContent).toContain("Override cost → reserve");
    expect(menu?.textContent).toContain("Override cost → deploy");

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

  it("opens side-summary actions and player battle-side info without altering the main strip", () => {
    const { container, root } = renderScreen();

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-side-summary="player"]')?.click();
    });

    expect(container.querySelector('[data-battle-side-summary-popover="player"]')?.textContent).toContain("Quick Zones");
    expect(container.textContent).toContain("Extra Turn");
    expect(container.textContent).toContain("Create Figment");
    expect(container.textContent).toContain("Dreamcaller");

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-side-summary="enemy"]')?.click();
    });

    expect(container.querySelector('[data-battle-side-summary-popover="player"]')).toBeNull();
    expect(container.querySelector('[data-battle-side-summary-popover="enemy"]')?.textContent).toContain("Quick Zones");

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-side-summary="player"]')?.click();
    });

    act(() => {
      clickChip(container, "Dreamcaller");
    });

    expect(container.querySelector("[data-battle-dreamcaller-panel]")?.textContent).toContain("Dreamsigns");

    act(() => {
      root.unmount();
    });
  });

  it("plays an affordable event by dragging it into the battlefield without slot highlights", () => {
    const { container, root } = renderScreen((state) => {
      const eventCardId = state.sides.player.deck.find(
        (battleCardId) => state.cardInstances[battleCardId]?.definition.battleCardKind === "event",
      );
      if (eventCardId === undefined) {
        throw new Error("expected player event card");
      }
      state.sides.player.deck = state.sides.player.deck.filter((battleCardId) => battleCardId !== eventCardId);
      state.sides.player.hand = [...state.sides.player.hand, eventCardId];
      state.sides.player.currentEnergy = 10;
      state.sides.player.maxEnergy = 10;
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

    expect(container.querySelector('[data-battle-drop-target="true"]')).toBeNull();

    act(() => {
      reserveSlot.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(
      container.querySelector(
        `[data-battle-region="player-hand-tray"] [data-battle-card-id="${eventCardId}"]`,
      ),
    ).toBeNull();
    expect(container.querySelector('[data-slot-id="player-reserve-R0"]')?.getAttribute("data-slot-card-id")).not.toBe(eventCardId);

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

  it("pauses on judgment results until the player continues", () => {
    const { container, root } = renderScreen();

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="end-turn"]')?.click();
    });
    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="end-turn"]')?.click();
    });
    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="end-turn"]')?.click();
    });

    expect(container.querySelector("[data-battle-judgment-overlay]")?.textContent).toContain("Challenge Resolved");
    expect(container.querySelector("[data-battle-judgment-overlay]")?.textContent).toContain("Turn 2 results");

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-judgment-action="continue"]')?.click();
    });

    expect(container.querySelector("[data-battle-judgment-overlay]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("opens an essence-only victory reward surface from Force victory, supports dismiss/reopen, and finishes via Continue", () => {
    const { battleInit, container, root } = renderScreen();

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-action="force-victory"]')?.click();
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
});

function clickChip(container: HTMLElement, label: string): void {
  const chip = [...container.querySelectorAll<HTMLElement>(".chip")].find(
    (element) => element.textContent?.trim() === label,
  );
  if (chip === undefined) {
    throw new Error(`missing chip: ${label}`);
  }
  chip.click();
}
