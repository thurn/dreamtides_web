// @vitest-environment jsdom

import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBattleAi, type AiProposal } from "./use-battle-ai";
import { aiMayRunHere } from "./ai-may-run-here";
import { createBattleReducerState } from "../state/reducer";
import { allocateBattleCardInstance } from "../state/create-initial-state";
import type { BattleCommand, BattleDebugEdit } from "../debug/commands";
import type {
  BattleCardProvenance,
  BattleDeckCardDefinition,
  BattleMutableState,
  BattleReducerState,
  BattleSide,
} from "../types";

vi.mock("../../logging", () => ({
  logEvent: vi.fn(),
  logEventOnce: vi.fn(),
}));

// --- Fixture helpers -------------------------------------------------------

function makeEmptySide(): BattleMutableState["sides"]["player"] {
  return {
    currentEnergy: 10,
    maxEnergy: 10,
    score: 0,
    visibility: {},
    deck: [],
    hand: [],
    void: [],
    banished: [],
    backRank: { B0: null, B1: null, B2: null, B3: null, B4: null },
    frontRank: { F0: null, F1: null, F2: null, F3: null },
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
  };
}

function makeBareState(): BattleMutableState {
  return {
    battleId: "battle-ai-hook-test",
    activeSide: "enemy",
    turnNumber: 2,
    phase: "day",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 1,
    nextStackEntryOrdinal: 1,
    stack: [],
    sides: {
      player: makeEmptySide(),
      enemy: makeEmptySide(),
    },
    cardInstances: {},
  };
}

function questDeckProvenance(): BattleCardProvenance {
  return {
    kind: "quest-deck",
    sourceBattleCardId: null,
    chosenSpark: null,
    chosenSubtype: null,
    createdAtTurnNumber: null,
    createdAtSide: null,
    createdAtMs: null,
  };
}

/** A real Starter character: vanilla Marked Direwolf (#512), 4●, 4✦. */
function direwolfDefinition(): BattleDeckCardDefinition {
  return {
    sourceDeckEntryId: null,
    cardNumber: 512,
    name: "Marked Direwolf",
    battleCardKind: "character",
    subtype: "Warrior",
    energyCost: 4,
    printedEnergyCost: 4,
    printedSpark: 4,
    isFast: false,
    reclaimCost: null,
    renderedText: "",
    imageNumber: 0,
    transfiguration: null,
    isBane: false,
  };
}

/**
 * Builds a reducer state whose active side is the AI (`enemy`) with a ready
 * reserve character and an empty deploy slot, so the planner's best line is to
 * reposition it as a challenger (a non-endTurn action that beats the baseline).
 */
function makeEnemyTurnState(
  mutate?: (state: BattleMutableState) => void,
): BattleReducerState {
  const mutable = makeBareState();
  const cardId = allocateBattleCardInstance(mutable, {
    definition: direwolfDefinition(),
    owner: "enemy",
    controller: "enemy",
    isRevealedToPlayer: false,
    provenance: questDeckProvenance(),
  });
  mutable.sides.enemy.backRank.B0 = cardId;
  mutate?.(mutable);
  return createBattleReducerState(mutable);
}

/** A character with the given printed spark and rendered keyword text. */
function keywordCharacterDefinition(
  name: string,
  printedSpark: number,
  renderedText: string,
): BattleDeckCardDefinition {
  return {
    sourceDeckEntryId: null,
    cardNumber: 0,
    name,
    battleCardKind: "character",
    subtype: "Warrior",
    energyCost: 1,
    printedEnergyCost: 1,
    printedSpark,
    isFast: false,
    reclaimCost: null,
    renderedText,
    imageNumber: 0,
    transfiguration: null,
    isBane: false,
  };
}

/**
 * Places a character in `side`'s front-rank `F0` with the given spark and
 * keyword text, returning its allocated battleCardId. Used to prove the AI's
 * endTurn proposal resolves the Challenge through the keyword-aware unified
 * resolver.
 */
function placeFrontRankCharacter(
  state: BattleMutableState,
  side: BattleSide,
  name: string,
  printedSpark: number,
  renderedText: string,
): string {
  const id = allocateBattleCardInstance(state, {
    definition: keywordCharacterDefinition(name, printedSpark, renderedText),
    owner: side,
    controller: side,
    isRevealedToPlayer: side === "enemy" ? false : true,
    provenance: questDeckProvenance(),
  });
  state.sides[side].frontRank.F0 = id;
  return id;
}

/** The DEBUG_EDIT edits carried by the current proposal's commands. */
function proposalEdits(): BattleDebugEdit[] {
  const commands = latest?.proposal?.commands ?? [];
  const edits: BattleDebugEdit[] = [];
  for (const command of commands) {
    if (command.id === "DEBUG_EDIT") {
      edits.push(command.edit);
    }
  }
  return edits;
}

// --- React harness ---------------------------------------------------------

interface HookHandle {
  proposal: AiProposal | null;
  approve: () => void;
  reject: () => void;
  endAiTurn: () => void;
}

let latest: HookHandle | null = null;

function HookHarness({
  initialState,
  dispatch,
  enabled = true,
  aiSide = "enemy",
}: {
  initialState: BattleReducerState;
  dispatch: (action: { type: "APPLY_COMMAND"; command: BattleCommand }) => void;
  enabled?: boolean;
  aiSide?: BattleSide;
}): ReactElement {
  const [reducerState, setReducerState] = useState(initialState);
  const wrappedDispatch = (action: {
    type: "APPLY_COMMAND";
    command: BattleCommand;
  }): void => {
    dispatch(action);
    // Mirror the screen: a dispatched command advances reducer state. The test
    // dispatch is a spy, so we re-derive a successor here only to keep the hook
    // re-rendering; the spy call count is what the contract test asserts on.
    setReducerState((prev) => prev);
  };
  const handle = useBattleAi({
    reducerState,
    dispatch: wrappedDispatch,
    enabled,
    aiSide,
  });
  latest = {
    proposal: handle.proposal,
    approve: handle.approve,
    reject: handle.reject,
    endAiTurn: handle.endAiTurn,
  };
  return <div data-test-proposal={handle.proposal === null ? "null" : handle.proposal.kind} />;
}

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  latest = null;
});

afterEach(() => {
  document.body.innerHTML = "";
  latest = null;
});

describe("useBattleAi", () => {
  it("computes a proposal on mount WITHOUT dispatching anything (safety contract)", () => {
    const dispatch = vi.fn();
    mount(<HookHarness initialState={makeEnemyTurnState()} dispatch={dispatch} />);

    expect(latest?.proposal).not.toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("approve() dispatches each of the proposal's commands in order", () => {
    const dispatch = vi.fn();
    mount(<HookHarness initialState={makeEnemyTurnState()} dispatch={dispatch} />);

    const proposal = latest?.proposal;
    expect(proposal).not.toBeNull();
    const commands = proposal?.commands ?? [];
    expect(commands.length).toBeGreaterThan(0);

    act(() => {
      latest?.approve();
    });

    expect(dispatch).toHaveBeenCalledTimes(commands.length);
    commands.forEach((command, index) => {
      expect(dispatch).toHaveBeenNthCalledWith(index + 1, {
        type: "APPLY_COMMAND",
        command,
      });
    });
  });

  it("attaches the action proposal's trace to the first dispatched command's aiChoices", () => {
    const dispatch = vi.fn();
    mount(<HookHarness initialState={makeEnemyTurnState()} dispatch={dispatch} />);

    const proposal = latest?.proposal;
    expect(proposal?.kind).toBe("action");
    const trace = proposal?.trace ?? null;
    expect(trace).not.toBeNull();
    expect(trace?.rationale).toBeTruthy();

    act(() => {
      latest?.approve();
    });

    const firstCall = dispatch.mock.calls[0]?.[0] as {
      type: "APPLY_COMMAND";
      command: BattleCommand;
    };
    expect(firstCall.command.aiChoices).toEqual([trace]);
    expect(firstCall.command.aiChoices?.[0]?.rationale).toBeTruthy();
  });

  it("reject() dispatches nothing and changes the proposal", () => {
    const dispatch = vi.fn();
    mount(<HookHarness initialState={makeEnemyTurnState()} dispatch={dispatch} />);

    const before = latest?.proposal;
    expect(before).not.toBeNull();

    act(() => {
      latest?.reject();
    });

    expect(dispatch).not.toHaveBeenCalled();
    const after = latest?.proposal;
    expect(after).not.toBeNull();
    // Either a different action, or the endTurn fallback once nothing else is
    // legal. In all cases the proposal must differ from the rejected one.
    expect(after).not.toBe(before);
  });

  it("endAiTurn() switches to an endTurn proposal without dispatching", () => {
    const dispatch = vi.fn();
    mount(<HookHarness initialState={makeEnemyTurnState()} dispatch={dispatch} />);

    act(() => {
      latest?.endAiTurn();
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(latest?.proposal?.kind).toBe("endTurn");
  });

  it("produces no proposal and dispatches nothing when disabled", () => {
    const dispatch = vi.fn();
    mount(
      <HookHarness
        initialState={makeEnemyTurnState()}
        dispatch={dispatch}
        enabled={false}
      />,
    );

    expect(latest?.proposal).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("produces no proposal and dispatches nothing when gated off by a shared room", () => {
    // Mirror the screen: the multiplayer-coexistence gate is layered on top of
    // aiMode. With two clients connected to the room, `aiMayRunHere` is false,
    // so even though aiMode is true and it IS the AI's turn with a legal action,
    // the hook must hold no proposal and dispatch nothing on this client.
    const dispatch = vi.fn();
    const aiMode = true;
    const enabled = aiMode && aiMayRunHere({ connectedCount: 2 });
    expect(enabled).toBe(false);
    mount(
      <HookHarness
        initialState={makeEnemyTurnState()}
        dispatch={dispatch}
        enabled={enabled}
      />,
    );

    expect(latest?.proposal).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("still runs in single-player (sole connected client) with aiMode on", () => {
    // The single-player quest flow is a room with exactly one connected client.
    // The gate must NOT disable the AI there: with aiMode on and count 1, the
    // hook produces a proposal on the AI's turn.
    const dispatch = vi.fn();
    const aiMode = true;
    const enabled = aiMode && aiMayRunHere({ connectedCount: 1 });
    expect(enabled).toBe(true);
    mount(
      <HookHarness
        initialState={makeEnemyTurnState()}
        dispatch={dispatch}
        enabled={enabled}
      />,
    );

    expect(latest?.proposal).not.toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("produces no proposal when it is not the AI's turn", () => {
    const dispatch = vi.fn();
    const state = makeEnemyTurnState((mutable) => {
      mutable.activeSide = "player";
    });
    mount(<HookHarness initialState={state} dispatch={dispatch} />);

    expect(latest?.proposal).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("produces no proposal when the battle already has a result", () => {
    const dispatch = vi.fn();
    const state = makeEnemyTurnState((mutable) => {
      mutable.result = "victory";
    });
    mount(<HookHarness initialState={state} dispatch={dispatch} />);

    expect(latest?.proposal).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  // The endTurn proposal resolves the Challenge through the unified, keyword-
  // aware `engine/challenge.resolveChallenge` (Task 5.2). These cases prove the
  // four combat keywords flow through the AI's committed Challenge edits —
  // outcomes the prior keyword-blind judgment shim dropped. Each places the AI's
  // (enemy) challenger and the player's defender in front-rank F0, then inspects
  // the endTurn proposal's DEBUG_EDIT edits.
  describe("endTurn proposal — keyword-aware Challenge resolution", () => {
    function endTurnEdits(
      place: (mutable: BattleMutableState) => void,
    ): BattleDebugEdit[] {
      const dispatch = vi.fn();
      const state = makeEnemyTurnState(place);
      mount(<HookHarness initialState={state} dispatch={dispatch} />);
      act(() => {
        latest?.endAiTurn();
      });
      expect(latest?.proposal?.kind).toBe("endTurn");
      expect(dispatch).not.toHaveBeenCalled();
      return proposalEdits();
    }

    it("scores a surviving defended Unstoppable challenger for the AI side", () => {
      // Keyword-blind: a defended challenger never scored. Keyword-aware: the
      // AI's surviving Unstoppable challenger scores its spark.
      const edits = endTurnEdits((mutable) => {
        placeFrontRankCharacter(mutable, "enemy", "aiUnstoppable", 6, "Unstoppable");
        placeFrontRankCharacter(mutable, "player", "defender", 3, "");
      });

      expect(edits).toContainEqual({
        kind: "ADJUST_SCORE",
        side: "enemy",
        amount: 6,
      });
    });

    it("drags the AI winner down when the opposing loser is Vengeful", () => {
      // Keyword-blind: only the 2-spark loser dissolved. Keyword-aware: the
      // Vengeful loser drags the AI's surviving 5-spark winner down too.
      let winner = "";
      let loser = "";
      const edits = endTurnEdits((mutable) => {
        winner = placeFrontRankCharacter(mutable, "enemy", "aiWinner", 5, "");
        loser = placeFrontRankCharacter(mutable, "player", "vengefulLoser", 2, "Vengeful");
      });

      expect(edits).toContainEqual({
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: winner,
        destination: { side: "enemy", zone: "void" },
      });
      expect(edits).toContainEqual({
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: loser,
        destination: { side: "player", zone: "void" },
      });
    });

    it("lets an AI Preeminence character win a spark tie instead of trading", () => {
      // Keyword-blind: a 4v4 tie dissolved both. Keyword-aware: the AI's
      // Preeminence bearer survives; only the opposing defender dissolves.
      let champion = "";
      let defender = "";
      const edits = endTurnEdits((mutable) => {
        champion = placeFrontRankCharacter(mutable, "enemy", "aiPreeminence", 4, "Preeminence");
        defender = placeFrontRankCharacter(mutable, "player", "defender", 4, "");
      });

      expect(edits).toContainEqual({
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: defender,
        destination: { side: "player", zone: "void" },
      });
      expect(
        edits.some(
          (edit) =>
            edit.kind === "MOVE_CARD_TO_ZONE" && edit.battleCardId === champion,
        ),
      ).toBe(false);
    });
  });
});
