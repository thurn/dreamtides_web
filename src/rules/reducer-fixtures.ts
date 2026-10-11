import { testJourneySeed } from "../types/test-identities";
import { testEventActor } from "../types/test-identities";
import type { GameEvent, EventContext, Genesis } from "../eventlog/types";
import type { BattleMutableState, BattleSide } from "../battle/types";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../battle/test-support";
import { genesisFoldState, type FoldState } from "./fold-state";
import { parseBattleId } from "../types/identifiers";
import { TEST_CONTENT_CONFIG } from "../testing/journey-genesis";



// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const GENESIS: Genesis = {
  seed: testJourneySeed("test-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};


/** A base fold state with a known, mutable essence value. */
export function foldStateWithEssence(essence: number): FoldState {
  const base = genesisFoldState(GENESIS);
  return {
    ...base,
    journey: {
      ...base.journey,
      essence,
    },
  };
}


export function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    contentConfig: TEST_CONTENT_CONFIG,
    seq: 10,
    rng: () => 0,
    intervening: [],
    timestamp: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}


export function event(
  type: GameEvent["type"],
  payload: Record<string, unknown>,
  actor = "alice",
): GameEvent {
  return {
    type,
    payload,
    actor: testEventActor(actor),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
}


export function adjustEssence(delta: number, actor = "alice"): GameEvent {
  return event("ADJUST_ESSENCE", { delta }, actor);
}


// ---------------------------------------------------------------------------
// Rule 4 / Rule 2 — prompt gate
// ---------------------------------------------------------------------------

/** Open sandbox prompts belong to the standalone tutorial battle. */
const TUTORIAL_MODE = {
  kind: "tutorial",
  tutorialRunId: "tutorial-run",
  restartNumber: 0,
  resultConfig: { playerOnlyVictory: true, turnLimitDisabled: true },
};


export function stateWithPendingPrompt(promptId: number): FoldState {
  const base = foldStateWithEssence(100);
  // The CAS policy reads only `battle.pendingPrompt.promptId`; the board is
  // cast because these tests never touch it (battle-fold construction is
  // exercised by driver.test.ts).
  const battle = {
    mode: TUTORIAL_MODE,
    board: {},
    effectQueue: [],
    pendingPrompt: {
      promptId,
      run: {
        scriptRef: { table: "dreamwell", id: "" },
        cursor: [0],
        side: "player",
      },
      kind: "foresee",
      options: { kind: "foresee", count: 0, cardIds: [] },
    },
  } as unknown as NonNullable<FoldState["battle"]>;
  return { ...base, battle };
}


function makeBattleSide(): BattleMutableState["sides"][BattleSide] {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
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


// ---------------------------------------------------------------------------
// RESOLVE_PROMPT single sanctioned catch (P1-2) — a throw while resolving the
// open prompt clears it (applied) instead of wedging the game forever.
// ---------------------------------------------------------------------------

/**
 * A battle fold state parked on an open prompt whose run cursor descends
 * through a non-existent branch (`[0, 0]` into an empty script), so
 * `resolvePendingPrompt` THROWS when the matching resolve reaches it.
 */
export function stateWithPoisonedPrompt(promptId: number): FoldState {
  const base = foldStateWithEssence(100);
  const board: BattleMutableState = {
    battleId: parseBattleId("b"),
    activeSide: "player",
    turnNumber: 3,
    phase: "day",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 100,
    sides: { player: makeBattleSide(), enemy: makeBattleSide() },
    cardInstances: {},
  };
  const run = {
    scriptRef: { table: "dreamwell", id: "" },
    cursor: [0, 0],
    side: "player",
  };
  const battle = {
    mode: TUTORIAL_MODE,
    init: {} as never,
    board,
    // A queued run present so the fallback's queue-clear is observable.
    effectQueue: [run],
    pendingPrompt: {
      promptId,
      run,
      kind: "foresee",
      options: { kind: "foresee", count: 0, cardIds: [] },
    },
  } as unknown as NonNullable<FoldState["battle"]>;
  return { ...base, battle };
}
