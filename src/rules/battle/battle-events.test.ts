import { afterEach, describe, expect, it } from "vitest";

import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import type {
  BattleMutableState,
  BattleSide,
} from "../../battle/types";
import {
  emptyBackRankSlots,
  emptyFrontRankSlots,
} from "../../battle/test-support";
import type {
  BattleModifier,
  DeckEntry,
  QuestState,
} from "../../types/quest";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import type { BattleFoldState } from "./fold";
import {
  registerBattleInitProvider,
  type BattleInitProvider,
} from "./battle-events";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: "battle-events-seed",
  reducerVersion: "test",
  createdAt: 0,
};

/** A deterministic PRNG bound to a seed so a generation draw is reproducible. */
function makeRng(seed: number): (drawIndex: number) => number {
  return (drawIndex: number) => {
    let x = (seed + drawIndex * 2654435761) >>> 0;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x1_0000_0000;
  };
}

function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    seq: 42,
    rng: makeRng(overrides.seq ?? 42),
    intervening: [],
    timestamp: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function event(
  type: string,
  payload: Record<string, unknown>,
  actor = "alice",
): GameEvent {
  return {
    type,
    payload,
    actor,
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
}

function reduce(
  state: FoldState,
  type: string,
  payload: Record<string, unknown>,
  context: EventContext = ctx(),
): ReduceResult {
  return reduceGameEvent(state, event(type, payload), context);
}

// Canonical hash: JSON is byte-stable for pure-data fold state and doubles as a
// closure-smuggling detector — a function in state would vanish from the string.
function hashBattle(battle: BattleFoldState | null): string {
  return JSON.stringify(battle);
}

// ---------------------------------------------------------------------------
// Board + battle fold fixtures
// ---------------------------------------------------------------------------

function makeSide(
  overrides: Partial<{ score: number }> = {},
): BattleMutableState["sides"][BattleSide] {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
    score: overrides.score ?? 0,
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
  } as BattleMutableState["sides"][BattleSide];
}

function makeBoard(
  overrides: Partial<
    Pick<
      BattleMutableState,
      "battleId" | "turnNumber" | "result" | "forcedResult"
    >
  > & { playerScore?: number; enemyScore?: number } = {},
): BattleMutableState {
  return {
    battleId: overrides.battleId ?? "battle-xyz",
    activeSide: "player",
    turnNumber: overrides.turnNumber ?? 3,
    phase: "day",
    result: overrides.result ?? null,
    forcedResult: overrides.forcedResult ?? null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 100,
    sides: {
      player: makeSide({ score: overrides.playerScore ?? 12 }),
      enemy: makeSide({ score: overrides.enemyScore ?? 25 }),
    },
    cardInstances: {},
  } as BattleMutableState;
}

function makeBattle(board = makeBoard()): BattleFoldState {
  return { board, effectQueue: [], pendingPrompt: null };
}

/**
 * A deterministic fake {@link BattleInitProvider} that embeds an rng-derived
 * value into the board so re-folding the SAME event yields a byte-identical
 * battle fold state (the determinism the ensureBattleSession race lacked).
 */
const fakeProvider: BattleInitProvider = {
  beginBattle({ siteId, rng, timestamp }) {
    const roll = rng(0);
    const board = makeBoard({
      battleId: `battle-${siteId}`,
      turnNumber: 1,
      playerScore: Math.floor(roll * 1000),
      enemyScore: 0,
    });
    // Timestamp threads through so the reducer's ctx.timestamp is honored
    // rather than a live clock.
    board.cardInstances = {};
    void timestamp;
    return { board, effectQueue: [], pendingPrompt: null };
  },
};

// ---------------------------------------------------------------------------
// Quest-state fixtures
// ---------------------------------------------------------------------------

function makeEntry(entryId: string, isBane = false): DeckEntry {
  return { entryId, cardNumber: 1, transfiguration: null, isBane };
}

const SITE_ID = "site-42";
const NODE_ID = "node-1";

function baseState(overrides: Partial<QuestState> = {}): FoldState {
  const base = genesisFoldState(GENESIS);
  return {
    ...base,
    quest: {
      ...base.quest,
      activeSiteId: SITE_ID,
      currentDreamscape: NODE_ID,
      screen: { type: "site", siteId: SITE_ID },
      ...overrides,
    },
  };
}

/** A fold state already inside a battle, for END_BATTLE / double-begin tests. */
function inBattleState(
  overrides: Partial<QuestState> = {},
  battle = makeBattle(),
): FoldState {
  const state = baseState(overrides);
  return { ...state, battle };
}

afterEach(() => {
  registerBattleInitProvider(null);
});

// ---------------------------------------------------------------------------
// BEGIN_BATTLE
// ---------------------------------------------------------------------------

describe("BEGIN_BATTLE", () => {
  it("bounces (a recorded no-op) until a battle-init provider is registered", () => {
    const result = reduce(baseState(), "BEGIN_BATTLE", { siteId: SITE_ID });
    expect(result.outcome).toBe("bounced");
    expect(result.state.battle).toBeNull();
  });

  it("constructs a battle fold state deterministically from the same event", () => {
    registerBattleInitProvider(fakeProvider);
    const state = baseState();
    const first = reduce(state, "BEGIN_BATTLE", { siteId: SITE_ID });
    const second = reduce(state, "BEGIN_BATTLE", { siteId: SITE_ID });

    expect(first.outcome).toBe("applied");
    expect(second.outcome).toBe("applied");
    expect(first.state.battle).not.toBeNull();
    // Same quest state + same seq → hash-identical battle both times (the
    // ensureBattleSession race, eliminated).
    expect(hashBattle(first.state.battle)).toBe(hashBattle(second.state.battle));
    // A fresh battle starts with an empty effect queue and no open prompt.
    expect(first.state.battle?.effectQueue).toEqual([]);
    expect(first.state.battle?.pendingPrompt).toBeNull();
    expect(first.state.battle?.board).toBeTypeOf("object");
  });

  it("bounces a second BEGIN_BATTLE when a battle is already in progress", () => {
    registerBattleInitProvider(fakeProvider);
    const existing = inBattleState();
    const result = reduce(existing, "BEGIN_BATTLE", { siteId: SITE_ID });
    expect(result.outcome).toBe("bounced");
    // Battle slice is untouched by the bounced double-begin.
    expect(hashBattle(result.state.battle)).toBe(hashBattle(existing.battle));
  });

  it("bounces a malformed payload (missing siteId)", () => {
    registerBattleInitProvider(fakeProvider);
    const result = reduce(baseState(), "BEGIN_BATTLE", {});
    expect(result.outcome).toBe("bounced");
    expect(result.state.battle).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// END_BATTLE — victory
// ---------------------------------------------------------------------------

describe("END_BATTLE victory", () => {
  it("bumps completion level, decrements/drops battle modifiers, clears the dreamscape, and ends the battle", () => {
    const survivingMod: BattleModifier = {
      kind: "reward_reduction_flat",
      amount: 5,
      battlesRemaining: 2,
      source: "test",
    };
    const expiringBaneMod: BattleModifier = {
      kind: "temporary_bane_grant",
      baneName: "b",
      count: 1,
      battlesRemaining: 1,
      addedEntryIds: ["bane-entry"],
      source: "test",
    };
    const state = inBattleState({
      completionLevel: 3,
      battleModifiers: [survivingMod, expiringBaneMod],
      deck: [makeEntry("keep-entry"), makeEntry("bane-entry", true)],
    });

    const result = reduce(state, "END_BATTLE", { result: "victory" });
    expect(result.outcome).toBe("applied");
    const quest = result.state.quest;

    expect(quest.completionLevel).toBe(4);
    // Surviving modifier decremented by one; expired one dropped.
    expect(quest.battleModifiers).toEqual([
      { ...survivingMod, battlesRemaining: 1 },
    ]);
    // Temporary-bane deck entries introduced by the dropped modifier leave the deck.
    expect(quest.deck.map((e) => e.entryId)).toEqual(["keep-entry"]);
    expect(quest.currentDreamscape).toBeNull();
    expect(result.state.battle).toBeNull();
    expect(quest.screen.type).toBe("atlas");
  });

  it("routes to the quest-complete screen at the final completion level", () => {
    const state = inBattleState({ completionLevel: 6 });
    const result = reduce(state, "END_BATTLE", { result: "victory" });
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.completionLevel).toBe(7);
    expect(result.state.quest.screen.type).toBe("questComplete");
    expect(result.state.battle).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// END_BATTLE — defeat
// ---------------------------------------------------------------------------

describe("END_BATTLE defeat", () => {
  it("freezes a failure summary from the battle fold state and ends the battle", () => {
    const board = makeBoard({
      battleId: "defeat-battle",
      turnNumber: 5,
      result: "defeat",
      playerScore: 7,
      enemyScore: 25,
    });
    const state = inBattleState({}, makeBattle(board));

    const result = reduce(state, "END_BATTLE", { result: "defeat" });
    expect(result.outcome).toBe("applied");
    const quest = result.state.quest;

    expect(quest.screen.type).toBe("questFailed");
    expect(result.state.battle).toBeNull();
    expect(quest.failureSummary).not.toBeNull();
    // Derived directly from the battle board + quest slice.
    expect(quest.failureSummary?.battleId).toBe(board.battleId);
    expect(quest.failureSummary?.turnNumber).toBe(board.turnNumber);
    expect(quest.failureSummary?.playerScore).toBe(board.sides.player.score);
    expect(quest.failureSummary?.enemyScore).toBe(board.sides.enemy.score);
    expect(quest.failureSummary?.dreamscapeIdOrNone).toBe(NODE_ID);
    expect(quest.failureSummary?.result).toBe("defeat");
  });

  it("records a forced-result reason when the board carries a forced result", () => {
    const board = makeBoard({ forcedResult: "defeat", result: "defeat" });
    const state = inBattleState({}, makeBattle(board));
    const result = reduce(state, "END_BATTLE", { result: "defeat" });
    expect(result.state.quest.failureSummary?.reason).toBe("forced_result");
  });
});

// ---------------------------------------------------------------------------
// Bounces shared across both events
// ---------------------------------------------------------------------------

describe("END_BATTLE bounces", () => {
  it("bounces when no battle exists", () => {
    const result = reduce(baseState(), "END_BATTLE", { result: "victory" });
    expect(result.outcome).toBe("bounced");
    expect(result.state.quest.completionLevel).toBe(0);
  });

  it("bounces an unknown result", () => {
    const result = reduce(inBattleState(), "END_BATTLE", { result: "draw?" });
    expect(result.outcome).toBe("bounced");
    expect(result.state.battle).not.toBeNull();
  });
});
