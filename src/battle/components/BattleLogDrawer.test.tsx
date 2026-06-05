// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logEvent, resetLog } from "../../logging";
import { applyBattleCommand } from "../debug/apply-command";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import { battleControllerReducer, createBattleControllerState } from "../state/controller";
import { createBattleReducerState } from "../state/reducer";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { BattleLogDrawer } from "./BattleLogDrawer";

function createFixture() {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });
  const state = createInitialBattleState(battleInit);
  const controllerState = battleControllerReducer(
    createBattleControllerState(state),
    {
      type: "APPLY_COMMAND",
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_PHASE",
          phase: "dusk",
        },
        sourceSurface: "side-summary",
      },
    },
  );
  logEvent("battle_proto_command_applied", {
    battleId: battleInit.battleId,
    turnNumber: 1,
    phase: "day",
    label: "Play to reserve",
  });
  logEvent("battle_proto_ai_choice", {
    battleId: battleInit.battleId,
    turnNumber: 1,
    phase: "day",
    label: "Enemy passed",
  });
  return { battleInit, history: controllerState.history };
}

function mount(isOpen: boolean): {
  container: HTMLDivElement;
  onClose: ReturnType<typeof vi.fn>;
  root: Root;
} {
  const { battleInit, history } = createFixture();
  const onClose = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <BattleLogDrawer
        battleInit={battleInit}
        futureCount={0}
        history={history}
        isOpen={isOpen}
        lastTransition={null}
        onClose={onClose}
      />,
    );
  });

  return { container, onClose, root };
}

beforeEach(() => {
  resetLog();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("BattleLogDrawer", () => {
  it("stays unmounted when closed and renders grouped history plus raw events when open", () => {
    const closed = mount(false);
    expect(closed.container.querySelector('[data-battle-region="battle-log"]')).toBeNull();
    act(() => {
      closed.root.unmount();
    });

    const { container, root } = mount(true);

    expect(container.querySelector('[data-battle-region="battle-log"]')?.textContent).toContain("Battle log");
    expect(container.textContent).toContain("Turn 1");
    expect(container.textContent).toContain("Set Phase to Dusk");
    expect(container.textContent).toContain("battle-flow");
    expect(container.textContent).toContain("Raw Events");

    act(() => {
      root.unmount();
    });
  });

  it("filters history kinds and expands the raw events section", () => {
    const { container, root } = mount(true);

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-log-filter="battle-flow"]')?.click();
      container.querySelectorAll<HTMLElement>(".log-turn-header")[1]?.click();
    });

    expect(container.textContent).toContain("Play to reserve");
    expect(container.textContent).toContain("Enemy passed");

    act(() => {
      root.unmount();
    });
  });

  it("renders aiChoices rationale and score when an entry with aiChoices is expanded", () => {
    const battleInit = createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    });
    const initialState = createInitialBattleState(battleInit);
    const reducerState = applyBattleCommand(
      createBattleReducerState(initialState),
      {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase: "dusk" },
        aiChoices: [
          {
            stage: "character",
            choice: "PLAY_CARD",
            battleCardId: "enemy-card-1",
            cardName: "Nocturne Strummer",
            sourceHandIndex: 0,
            sourceSlotId: null,
            targetSlotId: "R0",
            heuristicScoreBefore: 12.3,
            heuristicScoreAfter: 18.7,
            rationale: "Play Nocturne Strummer to the back rank",
          },
        ],
      },
    );

    const onClose = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <BattleLogDrawer
          battleInit={battleInit}
          futureCount={0}
          history={reducerState.history}
          isOpen={true}
          lastTransition={null}
          onClose={onClose}
        />,
      );
    });

    // Expand the history entry by clicking its summary button
    act(() => {
      container.querySelector<HTMLElement>("[data-battle-log-history-entry]")?.click();
    });

    expect(container.textContent).toContain("Play Nocturne Strummer to the back rank");
    expect(container.textContent).toContain("12.3");
    expect(container.textContent).toContain("18.7");

    act(() => {
      root.unmount();
    });
  });

  it("invokes onClose from the close button", () => {
    const { container, onClose, root } = mount(true);

    act(() => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Close")?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });
});
