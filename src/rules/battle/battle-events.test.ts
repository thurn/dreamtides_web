// Journey -> battle start -> battle end -> reward handoff smoke. These cases
// guard the BEGIN_BATTLE / END_BATTLE boundary between the journey fold and the
// battle fold until the engine rewires it.
import { afterEach, describe, expect, it } from "vitest";

import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import type {
  BattleInit,
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
  DreamAtlas,
  JourneyState,
} from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import { emptyDawnFired, type BattleFoldState } from "./fold";
import {
  registerBattleCompletionProvider,
  registerBattleInitProvider,
  type BattleCompletionProvider,
  type BattleInitProvider,
} from "./battle-events";
import {
  parseAtlasNodeId,
  parseBattleId,
  parseDeckEntryId,
  parseSiteId,
  type DeckEntryId,
} from "../../types/identifiers";
import {
  testDreamscapeId,
  testEventActor,
  testJourneyMutationSource,
  testJourneySeed,
} from "../../types/test-identities";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: testJourneySeed("battle-events-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: { poolVariant: "tides4" },
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

function reduce(
  state: FoldState,
  type: GameEvent["type"],
  payload: Record<string, unknown>,
  context: EventContext = ctx(),
  actor = "alice",
): ReduceResult {
  return reduceGameEvent(state, event(type, payload, actor), context);
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
  };
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
    battleId: overrides.battleId ?? parseBattleId("battle-xyz"),
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
  };
}

// A minimal deterministic BattleInit carrying the win / turn-limit thresholds
// the defeat-reason classification reads. Cast because the full BattleInit shape
// is irrelevant to these cases (real construction is the Task 26 provider).
function makeInit(overrides: Partial<BattleInit> = {}): BattleInit {
  return {
    battleId: parseBattleId("battle-xyz"),
    siteId: SITE_ID,
    dreamscapeId: testDreamscapeId(NODE_ID),
    completionLevelAtStart: 0,
    essenceReward: 100,
    scoreToWin: 30,
    turnLimit: 12,
    dreamwellDeck: [],
    ...overrides,
  } as unknown as BattleInit;
}

function makeBattle(board = makeBoard(), init = makeInit()): BattleFoldState {
  return {
    init,
    board,
    effectQueue: [],
    pendingPrompt: null,
    dawnFired: emptyDawnFired(),
  };
}

/**
 * A deterministic fake {@link BattleInitProvider} that embeds an rng-derived
 * value into the board so re-folding the SAME event yields a byte-identical
 * battle fold state.
 */
const fakeProvider: BattleInitProvider = {
  beginBattle({ siteId, rng, timestamp }) {
    const roll = rng(0);
    const board = makeBoard({
      battleId: parseBattleId(`battle-${siteId}`),
      turnNumber: 1,
      playerScore: Math.floor(roll * 1000),
      enemyScore: 0,
    });
    // The forwarded timestamp threads through so the reducer's ctx.timestamp is
    // honored rather than a live clock.
    const init = makeInit({
      battleId: parseBattleId(`battle-${siteId}`),
      siteId,
    });
    void timestamp;
    return {
      init,
      board,
      effectQueue: [],
      pendingPrompt: null,
      dawnFired: emptyDawnFired(),
    };
  },
};

// ---------------------------------------------------------------------------
// Journey-state fixtures
// ---------------------------------------------------------------------------

function makeEntry(entryId: DeckEntryId, isBane = false): DeckEntry {
  return {
    entryId,
    cardNumber: isBane ? 10002 : 1,
    transfiguration: null,
    isBane,
  };
}

const SITE_ID = parseSiteId("site-42");
const NODE_ID = parseAtlasNodeId("node-1");
const NEXT_NODE_ID = parseAtlasNodeId("node-2");

function journeyAtlas(): DreamAtlas {
  return {
    layers: [[NODE_ID], [NEXT_NODE_ID]],
    nodes: {
      [NODE_ID]: {
        id: NODE_ID,
        layer: LayerName.One,
        indexInLayer: 0,
        dreamscapeId: testDreamscapeId("dreamscape-one"),
        sites: [
          {
            id: SITE_ID,
            type: "Battle",
            isEnhanced: false,
            isVisited: false,
          },
        ],
        position: { x: 0, y: 0 },
        state: "available",
        enhancedSiteType: null,
        forwardIds: [NEXT_NODE_ID],
        backwardIds: [],
        knownDreamsignId: null,
      },
      [NEXT_NODE_ID]: {
        id: NEXT_NODE_ID,
        layer: LayerName.Two,
        indexInLayer: 0,
        dreamscapeId: null,
        sites: [],
        position: { x: 1, y: 0 },
        state: "unrevealed",
        enhancedSiteType: null,
        forwardIds: [],
        backwardIds: [NODE_ID],
        knownDreamsignId: null,
      },
    },
    startingNodeId: NODE_ID,
    bossNodeId: NEXT_NODE_ID,
    currentNodeId: NODE_ID,
    knownDreamsignCarrierIds: [],
  };
}

function baseState(overrides: Partial<JourneyState> = {}): FoldState {
  const base = genesisFoldState(GENESIS);
  return {
    ...base,
    journey: {
      ...base.journey,
      activeSiteId: SITE_ID,
      atlas: journeyAtlas(),
      currentDreamscape: NODE_ID,
      screen: { type: "site", siteId: SITE_ID },
      ...overrides,
    },
  };
}

/** A fold state already inside a battle, for END_BATTLE / double-begin tests. */
function inBattleState(
  overrides: Partial<JourneyState> = {},
  battle?: BattleFoldState,
): FoldState {
  const state = baseState(overrides);
  return {
    ...state,
    battle:
      battle ??
      makeBattle(
        makeBoard(),
        makeInit({ completionLevelAtStart: state.journey.completionLevel }),
      ),
  };
}

afterEach(() => {
  registerBattleInitProvider(null);
  registerBattleCompletionProvider(null);
});

const fakeCompletionProvider: BattleCompletionProvider = {
  advanceAtlas({ journey, battle }) {
    const dreamscapeId = battle.init.dreamscapeId;
    if (dreamscapeId === null) return null;
    const completed = journey.atlas.nodes[dreamscapeId];
    if (completed === undefined) return null;
    const nodes = { ...journey.atlas.nodes };
    nodes[dreamscapeId] = { ...completed, state: "completed" };
    for (const forwardId of completed.forwardIds) {
      const forward = nodes[forwardId];
      if (forward !== undefined) {
        nodes[forwardId] = {
          ...forward,
          dreamscapeId: testDreamscapeId("dreamscape-two"),
          state: "available",
        };
      }
    }
    return { ...journey.atlas, nodes, currentNodeId: dreamscapeId };
  },
};

// ---------------------------------------------------------------------------
// BEGIN_BATTLE
// ---------------------------------------------------------------------------

describe("BEGIN_BATTLE", () => {
  it("bounces (a recorded no-op) until a battle-init provider is registered", () => {
    const result = reduce(baseState(), "BEGIN_BATTLE", {
      siteId: SITE_ID,
    });
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
    // Same journey state + same seq → hash-identical battle both times.
    expect(hashBattle(first.state.battle)).toBe(
      hashBattle(second.state.battle),
    );
    // A fresh battle carries the immutable init and starts with an empty effect
    // queue and no open prompt.
    expect(first.state.battle?.effectQueue).toEqual([]);
    expect(first.state.battle?.pendingPrompt).toBeNull();
    expect(first.state.battle?.board).toBeTypeOf("object");
    expect(first.state.battle?.init).toBeTypeOf("object");
    expect(first.state.battle?.init.siteId).toBe(SITE_ID);
  });

  it("bounces a second BEGIN_BATTLE when a battle is already in progress", () => {
    registerBattleInitProvider(fakeProvider);
    const existing = inBattleState();
    const result = reduce(existing, "BEGIN_BATTLE", {
      siteId: SITE_ID,
    });
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

  it("forwards a validated seed override and event sequence to the provider", () => {
    let captured: Parameters<BattleInitProvider["beginBattle"]>[0] | null =
      null;
    registerBattleInitProvider({
      beginBattle(input) {
        captured = input;
        return fakeProvider.beginBattle(input);
      },
    });

    const result = reduce(
      baseState(),
      "BEGIN_BATTLE",
      { siteId: SITE_ID, seedOverride: 4242 },
      ctx({ seq: 77 }),
    );

    expect(result.outcome).toBe("applied");
    expect(captured).toMatchObject({
      siteId: SITE_ID,
      seedOverride: 4242,
      seq: 77,
    });
  });

});

// ---------------------------------------------------------------------------
// END_BATTLE — victory
// ---------------------------------------------------------------------------

describe("END_BATTLE victory", () => {
  it("atomically rewards, completes the Battle site, advances the Atlas, expires modifiers, and ends the battle", () => {
    registerBattleCompletionProvider(fakeCompletionProvider);
    const survivingMod: BattleModifier = {
      kind: "reward_reduction_flat",
      amount: 5,
      battlesRemaining: 2,
      source: testJourneyMutationSource("test"),
    };
    const expiringNightmareMod: BattleModifier = {
      kind: "temporary_nightmare_grant",
      count: 1,
      battlesRemaining: 1,
      addedEntryIds: [parseDeckEntryId("nightmare-entry")],
      source: testJourneyMutationSource("test"),
    };
    const state = inBattleState(
      {
        essence: 450,
        battleModifiers: [survivingMod, expiringNightmareMod],
        deck: [
          makeEntry(parseDeckEntryId("keep-entry")),
          makeEntry(parseDeckEntryId("nightmare-entry"), true),
        ],
      },
      makeBattle(makeBoard({ result: "victory" }), makeInit()),
    );

    const result = reduce(state, "END_BATTLE", {});
    expect(result.outcome).toBe("applied");
    const journey = result.state.journey;

    expect(journey.completionLevel).toBe(1);
    expect(journey.essence).toBe(550);
    expect(journey.visitedSites).toContain(SITE_ID);
    expect(
      journey.atlas.nodes[NODE_ID].sites.find((site) => site.id === SITE_ID)
        ?.isVisited,
    ).toBe(true);
    expect(journey.atlas.nodes[NODE_ID].state).toBe("completed");
    expect(journey.atlas.nodes[NEXT_NODE_ID]).toMatchObject({
      state: "available",
      dreamscapeId: testDreamscapeId("dreamscape-two"),
    });
    // Surviving modifier decremented by one; expired one dropped.
    expect(journey.battleModifiers).toEqual([
      { ...survivingMod, battlesRemaining: 1 },
    ]);
    // Temporary Nightmare entries introduced by the dropped modifier leave the deck.
    expect(journey.deck.map((e) => e.entryId)).toEqual(["keep-entry"]);
    expect(journey.currentDreamscape).toBeNull();
    expect(result.state.battle).toBeNull();
    expect(journey.screen.type).toBe("atlas");
  });

  it("routes to the journey-complete screen at the final completion level", () => {
    registerBattleCompletionProvider(fakeCompletionProvider);
    const state = inBattleState(
      { completionLevel: 6 },
      makeBattle(
        makeBoard({ result: "victory" }),
        makeInit({ completionLevelAtStart: 6 }),
      ),
    );
    const result = reduce(state, "END_BATTLE", {});
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.completionLevel).toBe(7);
    expect(result.state.journey.screen.type).toBe("journeyComplete");
    expect(result.state.battle).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// END_BATTLE — defeat
// ---------------------------------------------------------------------------

describe("END_BATTLE defeat", () => {
  it("freezes a failure summary from the battle fold state and ends the battle", () => {
    const board = makeBoard({
      battleId: parseBattleId("defeat-battle"),
      turnNumber: 5,
      result: "defeat",
      playerScore: 7,
      enemyScore: 25,
    });
    const state = inBattleState({}, makeBattle(board));

    const result = reduce(state, "END_BATTLE", {});
    expect(result.outcome).toBe("applied");
    const journey = result.state.journey;

    expect(journey.screen.type).toBe("journeyFailed");
    expect(result.state.battle).toBeNull();
    expect(journey.failureSummary).not.toBeNull();
    // Derived directly from the battle board + journey slice.
    expect(journey.failureSummary?.battleId).toBe(board.battleId);
    expect(journey.failureSummary?.turnNumber).toBe(board.turnNumber);
    expect(journey.failureSummary?.playerScore).toBe(board.sides.player.score);
    expect(journey.failureSummary?.enemyScore).toBe(board.sides.enemy.score);
    expect(journey.failureSummary?.dreamscapeIdOrNone).toBe(NODE_ID);
    expect(journey.failureSummary?.result).toBe("defeat");
  });

  it("records a forced-result reason when the board carries a forced result", () => {
    const board = makeBoard({ forcedResult: "defeat", result: "defeat" });
    const state = inBattleState({}, makeBattle(board));
    const result = reduce(state, "END_BATTLE", {});
    expect(result.state.journey.failureSummary?.reason).toBe("forced_result");
  });

});

// ---------------------------------------------------------------------------
// Bounces shared across both events
// ---------------------------------------------------------------------------

describe("END_BATTLE bounces", () => {
  it("bounces when no battle exists", () => {
    const result = reduce(baseState(), "END_BATTLE", {});
    expect(result.outcome).toBe("bounced");
    expect(result.state.journey.completionLevel).toBe(0);
  });

  it("bounces while the folded board is not terminal", () => {
    const result = reduce(inBattleState(), "END_BATTLE", {});
    expect(result.outcome).toBe("bounced");
    expect(result.state.battle).not.toBeNull();
  });
});
