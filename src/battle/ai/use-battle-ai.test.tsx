// @vitest-environment jsdom

import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBattleAi, type AiProposal } from "./use-battle-ai";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { resolveBattleAiConfiguration } from "../../types/opponents-data";
import { aiMayRunHere } from "./ai-may-run-here";
import { allocateBattleCardInstance } from "../state/create-initial-state";
import type { BattleCommand, BattleDebugEdit } from "../debug/commands";
import type {
  BattleCardProvenance,
  BattleDeckCardDefinition,
  BattleFieldSlotAddress,
  BattleMutableState,
  BattleReducerState,
  BattleSide,
  FrontRankSlotId,
} from "../types";
import { emptyFrontRankSlots, emptyBackRankSlots } from "../test-support";

vi.mock("../../logging", () => ({
  logEvent: vi.fn(),
  logEventOnce: vi.fn(),
}));

const TEST_AI_CONFIGURATION = resolveBattleAiConfiguration(
  opponentsFixture(),
  "journey",
);
const TEST_BATTLE_CAPS = { scoreToWin: 25, turnLimit: 50, maxEnergyCap: 10 };

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
    backRank: emptyBackRankSlots(),
    frontRank: emptyFrontRankSlots(),
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
    sides: {
      player: makeEmptySide(),
      enemy: makeEmptySide(),
    },
    cardInstances: {},
  };
}

function journeyDeckProvenance(): BattleCardProvenance {
  return {
    kind: "journey-deck",
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
    cardId: "",
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

/** A real Starter support character: Nocturne Strummer (#510), 2●, 1✦. */
function strummerDefinition(): BattleDeckCardDefinition {
  return {
    ...direwolfDefinition(),
    cardNumber: 510,
    name: "Nocturne Strummer",
    subtype: "Musician",
    energyCost: 2,
    printedEnergyCost: 2,
    printedSpark: 1,
    renderedText: "Support – Supported characters have +2✦.",
  };
}

/** Wraps a mutable board in the reducer-state envelope the hook harness reads. */
function createReducerState(mutable: BattleMutableState): BattleReducerState {
  return {
    mutable,
    history: { past: [], future: [] },
    lastTransition: null,
    transitionId: 0,
    lastActivity: null,
    activityId: 0,
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
    provenance: journeyDeckProvenance(),
  });
  mutable.sides.enemy.backRank.B0 = cardId;
  mutate?.(mutable);
  return createReducerState(mutable);
}

/**
 * An enemy (AI) turn state with NO playable action: empty hand, empty back rank,
 * and zero energy, so the planner returns END_TURN. Used to exercise the AI's
 * end-of-Day proposal (endPhase with automation on, endTurn with it off).
 */
function makeEnemyNoActionState(
  mutate?: (state: BattleMutableState) => void,
): BattleReducerState {
  const mutable = makeBareState();
  mutable.sides.enemy.currentEnergy = 0;
  mutate?.(mutable);
  return createReducerState(mutable);
}

/** A character with the given printed spark and rendered keyword text. */
function keywordCharacterDefinition(
  name: string,
  printedSpark: number,
  renderedText: string,
): BattleDeckCardDefinition {
  return {
    sourceDeckEntryId: null,
    cardId: "",
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
function placeFrontRankCharacterInSlot(
  state: BattleMutableState,
  side: BattleSide,
  slot: FrontRankSlotId,
  name: string,
  printedSpark: number,
  renderedText: string,
): string {
  const id = allocateBattleCardInstance(state, {
    definition: keywordCharacterDefinition(name, printedSpark, renderedText),
    owner: side,
    controller: side,
    isRevealedToPlayer: side === "enemy" ? false : true,
    provenance: journeyDeckProvenance(),
  });
  state.sides[side].frontRank[slot] = id;
  return id;
}

function placeFrontRankCharacter(
  state: BattleMutableState,
  side: BattleSide,
  name: string,
  printedSpark: number,
  renderedText: string,
): string {
  return placeFrontRankCharacterInSlot(
    state,
    side,
    "F0",
    name,
    printedSpark,
    renderedText,
  );
}

function placeBackRankCharacter(
  state: BattleMutableState,
  side: BattleSide,
  slot: "B0" | "B1",
  name: string,
  printedSpark: number,
): string {
  const id = allocateBattleCardInstance(state, {
    definition: keywordCharacterDefinition(name, printedSpark, ""),
    owner: side,
    controller: side,
    isRevealedToPlayer: side === "enemy" ? false : true,
    provenance: journeyDeckProvenance(),
  });
  state.sides[side].backRank[slot] = id;
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
  thinking: boolean;
  approve: () => void;
  reject: () => void;
}

let latest: HookHandle | null = null;

/**
 * Flushes the hook's ASYNCHRONOUS planner — which yields to the event loop
 * between beam rounds — until it reports it is no longer `thinking`, so the
 * settled proposal can be asserted on. Bounded so a stuck plan fails the test
 * rather than hanging.
 */
async function settleProposal(): Promise<void> {
  for (let i = 0; i < 500; i += 1) {
    if (latest !== null && !latest.thinking) {
      return;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error("AI proposal did not settle");
}

function HookHarness({
  initialState,
  submit,
  submitGesture = () => {},
  submitPlayCard,
  enabled = true,
  aiSide = "enemy",
  basicAutomation = true,
}: {
  initialState: BattleReducerState;
  submit: (command: BattleCommand) => void;
  submitGesture?: (commands: readonly BattleCommand[]) => void;
  submitPlayCard?: (
    battleCardId: string,
    targetBattleCardIds: readonly string[],
    trace: import("../types").BattleAiChoiceTrace | null,
    characterDestination?: BattleFieldSlotAddress,
  ) => void;
  enabled?: boolean;
  aiSide?: BattleSide;
  basicAutomation?: boolean;
}): ReactElement {
  const [board, setBoard] = useState(initialState.mutable);
  const wrappedSubmit = (command: BattleCommand): void => {
    submit(command);
    // Mirror the screen: a submitted command advances the board. The test
    // submit fn is a spy, so we re-derive a successor here only to keep the
    // hook re-rendering; the spy call count is what the contract test asserts
    // on.
    setBoard((prev) => prev);
  };
  const wrappedSubmitGesture = (commands: readonly BattleCommand[]): void => {
    submitGesture(commands);
    setBoard((prev) => prev);
  };
  const handle = useBattleAi({
    board,
    submitCommand: wrappedSubmit,
    submitGesture: wrappedSubmitGesture,
    submitPlayCard,
    enabled,
    aiSide,
    basicAutomation,
    caps: TEST_BATTLE_CAPS,
    aiConfiguration: TEST_AI_CONFIGURATION,
  });
  latest = {
    proposal: handle.proposal,
    thinking: handle.thinking,
    approve: handle.approve,
    reject: handle.reject,
  };
  return (
    <div
      data-test-proposal={
        handle.proposal === null ? "null" : handle.proposal.kind
      }
    />
  );
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
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
  it("computes a proposal WITHOUT dispatching anything (safety contract)", async () => {
    const dispatch = vi.fn();
    mount(
      <HookHarness initialState={makeEnemyTurnState()} submit={dispatch} />,
    );
    await settleProposal();

    expect(latest?.proposal).not.toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("approve() dispatches each of the proposal's commands in order", async () => {
    const dispatch = vi.fn();
    mount(
      <HookHarness initialState={makeEnemyTurnState()} submit={dispatch} />,
    );
    await settleProposal();

    const proposal = latest?.proposal;
    expect(proposal).not.toBeNull();
    const commands = proposal?.commands ?? [];
    expect(commands.length).toBeGreaterThan(0);

    act(() => {
      latest?.approve();
    });

    expect(dispatch).toHaveBeenCalledTimes(commands.length);
    commands.forEach((command, index) => {
      expect(dispatch).toHaveBeenNthCalledWith(index + 1, command);
    });
  });

  it("submits a character play into the nearest open center destination", async () => {
    const state = makeEnemyTurnState((mutable) => {
      const deployedId = mutable.sides.enemy.backRank.B0;
      mutable.sides.enemy.backRank.B0 = null;
      mutable.sides.enemy.frontRank.F4 = deployedId;
      const centerOccupantId = allocateBattleCardInstance(mutable, {
        definition: direwolfDefinition(),
        owner: "enemy",
        controller: "enemy",
        isRevealedToPlayer: false,
        provenance: journeyDeckProvenance(),
      });
      mutable.cardInstances[centerOccupantId].status.isExhausted = true;
      mutable.sides.enemy.backRank.B4 = centerOccupantId;
      mutable.sides.enemy.currentEnergy = 2;
      const supportId = allocateBattleCardInstance(mutable, {
        definition: strummerDefinition(),
        owner: "enemy",
        controller: "enemy",
        isRevealedToPlayer: false,
        provenance: journeyDeckProvenance(),
      });
      mutable.sides.enemy.hand = [supportId];
    });
    const commandDispatch = vi.fn();
    const playCardDispatch = vi.fn();
    mount(
      <HookHarness
        initialState={state}
        submit={commandDispatch}
        submitPlayCard={playCardDispatch}
      />,
    );
    await settleProposal();

    expect(latest?.proposal?.playCard?.characterDestination).toEqual({
      side: "enemy",
      zone: "backRank",
      slotId: "B5",
    });

    act(() => {
      latest?.approve();
    });

    expect(commandDispatch).not.toHaveBeenCalled();
    expect(playCardDispatch).toHaveBeenCalledWith(
      expect.any(String),
      [],
      latest?.proposal?.trace,
      { side: "enemy", zone: "backRank", slotId: "B5" },
    );
  });

  it("attaches the action proposal's trace to the first dispatched command's aiChoices", async () => {
    const dispatch = vi.fn();
    mount(
      <HookHarness initialState={makeEnemyTurnState()} submit={dispatch} />,
    );
    await settleProposal();

    const proposal = latest?.proposal;
    expect(proposal?.kind).toBe("action");
    const trace = proposal?.trace ?? null;
    expect(trace).not.toBeNull();
    expect(trace?.rationale).toBeTruthy();

    act(() => {
      latest?.approve();
    });

    const firstCommand = dispatch.mock.calls[0]?.[0] as BattleCommand;
    expect(firstCommand.aiChoices).toEqual([trace]);
    expect(firstCommand.aiChoices?.[0]?.rationale).toBeTruthy();
  });

  it("reject() dispatches nothing and changes the proposal", async () => {
    const dispatch = vi.fn();
    mount(
      <HookHarness initialState={makeEnemyTurnState()} submit={dispatch} />,
    );
    await settleProposal();

    const before = latest?.proposal;
    expect(before).not.toBeNull();

    act(() => {
      latest?.reject();
    });
    await settleProposal();

    expect(dispatch).not.toHaveBeenCalled();
    const after = latest?.proposal;
    expect(after).not.toBeNull();
    // Either a different action, or the endTurn fallback once nothing else is
    // legal. In all cases the proposal must differ from the rejected one.
    expect(after).not.toBe(before);
  });

  it("ends its Day with an endPhase proposal once no play remains (automation on)", async () => {
    // With basic automation resolving turn bookends, the AI steps Day → Dusk and
    // stops, handing the Dusk repositioning window to the human; approving it
    // dispatches a single same-side SET_BATTLE_FLOW into Dusk.
    const dispatch = vi.fn();
    mount(
      <HookHarness
        initialState={makeEnemyNoActionState()}
        submit={dispatch}
        basicAutomation={true}
      />,
    );
    await settleProposal();

    expect(dispatch).not.toHaveBeenCalled();
    expect(latest?.proposal?.kind).toBe("endPhase");
    expect(proposalEdits()).toEqual([
      {
        kind: "SET_BATTLE_FLOW",
        phase: "dusk",
        activeSide: "enemy",
        turnNumber: 2,
      },
    ]);
  });

  it("holds no proposal past Day so the human drives the rest (automation on)", async () => {
    // Once the AI sits at Dusk with no play, it proposes nothing: the human
    // repositions and advances Night/Challenge with the phase controls.
    const dispatch = vi.fn();
    mount(
      <HookHarness
        initialState={makeEnemyNoActionState((mutable) => {
          mutable.phase = "dusk";
        })}
        submit={dispatch}
        basicAutomation={true}
      />,
    );
    await settleProposal();

    expect(latest?.proposal).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("bundles an endTurn proposal when no play remains and automation is off", async () => {
    const dispatch = vi.fn();
    mount(
      <HookHarness
        initialState={makeEnemyNoActionState()}
        submit={dispatch}
        basicAutomation={false}
      />,
    );
    await settleProposal();

    expect(dispatch).not.toHaveBeenCalled();
    expect(latest?.proposal?.kind).toBe("endTurn");
  });

  it("approve() submits a single-command endTurn proposal directly", async () => {
    const dispatch = vi.fn();
    const gestureDispatch = vi.fn();
    mount(
      <HookHarness
        initialState={makeEnemyNoActionState()}
        submit={dispatch}
        submitGesture={gestureDispatch}
        basicAutomation={false}
      />,
    );
    await settleProposal();

    const commands = latest?.proposal?.commands ?? [];
    expect(latest?.proposal?.kind).toBe("endTurn");
    expect(commands.length).toBeGreaterThan(0);

    act(() => {
      latest?.approve();
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(commands[0]);
    expect(gestureDispatch).not.toHaveBeenCalled();
  });

  it("does not dispatch blocking from local hook state", async () => {
    const dispatch = vi.fn();
    const gestureDispatch = vi.fn();
    const state = makeEnemyTurnState((mutable) => {
      mutable.activeSide = "player";
      mutable.phase = "dusk";
      mutable.turnNumber = 3;
      mutable.sides.enemy.backRank = emptyBackRankSlots();
      placeFrontRankCharacterInSlot(
        mutable,
        "player",
        "F0",
        "challengerA",
        2,
        "",
      );
      placeFrontRankCharacterInSlot(
        mutable,
        "player",
        "F1",
        "challengerB",
        3,
        "",
      );
      placeBackRankCharacter(mutable, "enemy", "B0", "blockerA", 4);
      placeBackRankCharacter(mutable, "enemy", "B1", "blockerB", 5);
    });

    mount(
      <HookHarness
        initialState={state}
        submit={dispatch}
        submitGesture={gestureDispatch}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(gestureDispatch).not.toHaveBeenCalled();
  });

  it("produces no proposal and dispatches nothing when disabled", async () => {
    const dispatch = vi.fn();
    mount(
      <HookHarness
        initialState={makeEnemyTurnState()}
        submit={dispatch}
        enabled={false}
      />,
    );
    await settleProposal();

    expect(latest?.proposal).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("produces no proposal and dispatches nothing when gated off by a shared room", async () => {
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
        submit={dispatch}
        enabled={enabled}
      />,
    );
    await settleProposal();

    expect(latest?.proposal).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("still runs in single-player (sole connected client) with aiMode on", async () => {
    // The single-player journey flow is a room with exactly one connected client.
    // The gate must NOT disable the AI there: with aiMode on and count 1, the
    // hook produces a proposal on the AI's turn.
    const dispatch = vi.fn();
    const aiMode = true;
    const enabled = aiMode && aiMayRunHere({ connectedCount: 1 });
    expect(enabled).toBe(true);
    mount(
      <HookHarness
        initialState={makeEnemyTurnState()}
        submit={dispatch}
        enabled={enabled}
      />,
    );
    await settleProposal();

    expect(latest?.proposal).not.toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("produces no proposal when it is not the AI's turn", async () => {
    const dispatch = vi.fn();
    const state = makeEnemyTurnState((mutable) => {
      mutable.activeSide = "player";
    });
    mount(<HookHarness initialState={state} submit={dispatch} />);
    await settleProposal();

    expect(latest?.proposal).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("produces no proposal when the battle already has a result", async () => {
    const dispatch = vi.fn();
    const state = makeEnemyTurnState((mutable) => {
      mutable.result = "victory";
    });
    mount(<HookHarness initialState={state} submit={dispatch} />);
    await settleProposal();

    expect(latest?.proposal).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  // The endTurn proposal resolves the Challenge through the unified, keyword-
  // aware `engine/challenge.resolveChallenge` (Task 5.2). These cases prove the
  // combat keywords flow through the AI's committed Challenge edits —
  // outcomes the prior keyword-blind judgment shim dropped. Each places the AI's
  // (enemy) challenger and the player's blocker in front-rank F0, then inspects
  // the endTurn proposal's DEBUG_EDIT edits.
  describe("endTurn proposal — keyword-aware Challenge resolution", () => {
    async function endTurnEdits(
      place: (mutable: BattleMutableState) => void,
    ): Promise<BattleDebugEdit[]> {
      const dispatch = vi.fn();
      // No playable action + automation off ⇒ the AI holds the all-in-one
      // endTurn proposal, whose edits carry the keyword-aware Challenge result.
      const state = makeEnemyNoActionState(place);
      mount(
        <HookHarness
          initialState={state}
          submit={dispatch}
          basicAutomation={false}
        />,
      );
      await settleProposal();
      expect(latest?.proposal?.kind).toBe("endTurn");
      expect(dispatch).not.toHaveBeenCalled();
      return proposalEdits();
    }

    it("drags the AI winner down when the opposing loser is Vengeful", async () => {
      // Keyword-blind: only the 2-spark loser dissolved. Keyword-aware: the
      // Vengeful loser drags the AI's surviving 5-spark winner down too.
      let winner = "";
      let loser = "";
      const edits = await endTurnEdits((mutable) => {
        winner = placeFrontRankCharacter(mutable, "enemy", "aiWinner", 5, "");
        loser = placeFrontRankCharacter(
          mutable,
          "player",
          "vengefulLoser",
          2,
          "Vengeful",
        );
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
  });
});
