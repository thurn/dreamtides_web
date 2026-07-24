import { afterEach, describe, expect, it } from "vitest";

import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import type {
  BattleCardInstance,
  BattleCardStatus,
  BattleInit,
  BattleMutableState,
  BattlePhase,
  BattleSide,
  DreamwellCardDefinition,
} from "../../battle/types";
import { backRankSlotId, frontRankSlotId } from "../../battle/types";
import { isoTimestampToMs } from "./timestamp";
import {
  emptyBackRankSlots,
  emptyFrontRankSlots,
} from "../../battle/test-support";
import { applyDebugEdit } from "./apply-debug-edit";
import {
  BATTLE_CARD_EFFECTS,
  planSupportRecompute,
} from "./battle-card-effects-table";
import { DREAMWELL_EFFECTS } from "./dreamwell-effects-table";
import type { StepContext } from "./effect-step";
import type {
  BattleModifier,
  DeckEntry,
  QuestState,
} from "../../types/quest";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import { emptyDawnFired, type BattleFoldState, type EffectRun } from "./fold";
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
  contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null },
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
  };
}

// A minimal deterministic BattleInit carrying the win / turn-limit thresholds
// the defeat-reason classification reads. Cast because the full BattleInit shape
// is irrelevant to these cases (real construction is the Task 26 provider).
function makeInit(overrides: Partial<BattleInit> = {}): BattleInit {
  return {
    battleId: "battle-xyz",
    siteId: SITE_ID,
    dreamscapeId: null,
    scoreToWin: 30,
    turnLimit: 12,
    dreamwellDeck: [],
    ...overrides,
  } as unknown as BattleInit;
}

function makeBattle(
  board = makeBoard(),
  init = makeInit(),
): BattleFoldState {
  return { init, board, effectQueue: [], pendingPrompt: null, dawnFired: emptyDawnFired() };
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
      battleId: `battle-${siteId}`,
      turnNumber: 1,
      playerScore: Math.floor(roll * 1000),
      enemyScore: 0,
    });
    // The forwarded timestamp threads through so the reducer's ctx.timestamp is
    // honored rather than a live clock.
    const init = makeInit({
      battleId: `battle-${siteId}`,
      siteId,
    });
    void timestamp;
    return { init, board, effectQueue: [], pendingPrompt: null, dawnFired: emptyDawnFired() };
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
    // Same quest state + same seq → hash-identical battle both times.
    expect(hashBattle(first.state.battle)).toBe(hashBattle(second.state.battle));
    // A fresh battle carries the immutable init and starts with an empty effect
    // queue and no open prompt.
    expect(first.state.battle?.effectQueue).toEqual([]);
    expect(first.state.battle?.pendingPrompt).toBeNull();
    expect(first.state.battle?.board).toBeTypeOf("object");
    expect(first.state.battle?.init).toBeTypeOf("object");
    expect(first.state.battle?.init.siteId).toBe(SITE_ID);
  });

  it("starts every battle with automation enabled", () => {
    registerBattleInitProvider(fakeProvider);
    const result = reduce(baseState(), "BEGIN_BATTLE", { siteId: SITE_ID });

    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.basicAutomationEnabled).toBe(true);
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

  it("forwards a validated seed override and event sequence to the provider", () => {
    let captured: Parameters<BattleInitProvider["beginBattle"]>[0] | null = null;
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

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "42"])(
    "bounces invalid seed override %s",
    (seedOverride) => {
      registerBattleInitProvider(fakeProvider);
      const result = reduce(baseState(), "BEGIN_BATTLE", {
        siteId: SITE_ID,
        seedOverride,
      });
      expect(result.outcome).toBe("bounced");
      expect(result.state.battle).toBeNull();
    },
  );
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

  it("records a turn-limit reason when the turn count reached the limit below the score target", () => {
    const init = makeInit({ turnLimit: 10, scoreToWin: 30 });
    // Turn count at/over the limit, player score short of the target, no forced
    // result → turn_limit_reached (not score_target_reached).
    const board = makeBoard({
      turnNumber: 10,
      result: "defeat",
      forcedResult: null,
      playerScore: 12,
      enemyScore: 8,
    });
    const state = inBattleState({}, makeBattle(board, init));
    const result = reduce(state, "END_BATTLE", { result: "defeat" });
    expect(result.state.quest.failureSummary?.reason).toBe("turn_limit_reached");
  });

  it("records a score-target reason when the score target was reached before the turn limit", () => {
    const init = makeInit({ turnLimit: 10, scoreToWin: 30 });
    const board = makeBoard({
      turnNumber: 4,
      result: "defeat",
      forcedResult: null,
      playerScore: 5,
      enemyScore: 30,
    });
    const state = inBattleState({}, makeBattle(board, init));
    const result = reduce(state, "END_BATTLE", { result: "defeat" });
    expect(result.state.quest.failureSummary?.reason).toBe("score_target_reached");
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

// ---------------------------------------------------------------------------
// BATTLE_COMMAND — fold-time triggers (Task 20)
// ---------------------------------------------------------------------------

const EMISSION = { sourceSurface: "auto-system", selectedCardId: null } as const;

/** A default (all-falsy) card status. */
function defaultStatus(): BattleCardStatus {
  return {
    isExhausted: false,
    counters: 0,
    reclaimed: false,
    offering: false,
    ephemeral: false,
    veil: false,
    grantedUnstoppable: false,
    grantedVengeful: false,
    grantedPreeminence: false,
    grantedAwakened: false,
  };
}

/** A minimal in-play/hand card instance whose `definition.cardId` keys the
 *  automation registry (so a materialized/dawn script can resolve). */
function makeInstance(
  battleCardId: string,
  cardId: string,
  controller: BattleSide = "player",
): BattleCardInstance {
  return {
    battleCardId,
    definition: {
      sourceDeckEntryId: null,
      cardId,
      cardNumber: 0,
      name: "Fixture Card",
      battleCardKind: "character",
      subtype: "Unit",
      energyCost: 0,
      printedEnergyCost: 0,
      printedSpark: 1,
      isFast: false,
      reclaimCost: null,
      renderedText: "",
      imageNumber: 0,
      transfiguration: null,
      isBane: false,
    },
    owner: controller,
    controller,
    sparkDelta: 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: defaultStatus(),
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: {
      kind: "quest-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: null,
      createdAtSide: null,
      createdAtMs: null,
    },
  };
}

/** A configurable board with a per-card instance registry. */
function makeRichBoard(over: {
  phase?: BattlePhase;
  turnNumber?: number;
  dreamwellDeckIndex?: number;
  instances?: BattleCardInstance[];
  playerDeck?: string[];
  playerHand?: string[];
  playerVoid?: string[];
  playerFront?: Record<string, string | null>;
  playerBack?: Record<string, string | null>;
  playerDreamwellCardIndex?: number | null;
  playerDreamwellDrawnTurn?: number | null;
} = {}): BattleMutableState {
  const player = makeSide();
  player.deck = over.playerDeck ?? [];
  player.hand = over.playerHand ?? [];
  player.void = over.playerVoid ?? [];
  player.frontRank = { ...emptyFrontRankSlots(), ...(over.playerFront ?? {}) };
  player.backRank = { ...emptyBackRankSlots(), ...(over.playerBack ?? {}) };
  player.dreamwellCardIndex = over.playerDreamwellCardIndex ?? null;
  player.dreamwellDrawnTurn = over.playerDreamwellDrawnTurn ?? null;
  const cardInstances: Record<string, BattleCardInstance> = {};
  for (const instance of over.instances ?? []) {
    cardInstances[instance.battleCardId] = instance;
  }
  return {
    battleId: "battle-cmd",
    activeSide: "player",
    turnNumber: over.turnNumber ?? 3,
    phase: over.phase ?? "day",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: over.dreamwellDeckIndex ?? 0,
    nextBattleCardOrdinal: 1000,
    sides: {
      player,
      enemy: makeSide(),
    },
    cardInstances,
  };
}

function battleFrom(
  board: BattleMutableState,
  overrides: Partial<BattleFoldState> = {},
): BattleFoldState {
  return {
    init: makeInit(),
    board,
    effectQueue: [],
    pendingPrompt: null,
    dawnFired: emptyDawnFired(),
    ...overrides,
  };
}

function hashBoard(board: BattleMutableState): string {
  return JSON.stringify(board);
}

/** The first unconditional back-rank support script (no `applies` subtype
 *  filter), so it grants spark to ANY supported front ally regardless of type. */
function firstSupportScript(): { id: string } {
  const script = Object.values(BATTLE_CARD_EFFECTS).find(
    (s) => s.support.applies === undefined,
  );
  if (script === undefined) throw new Error("no unconditional support script registered");
  return script;
}

/** A deterministic Dreamwell script whose edits move a void character into a
 *  play (battlefield) slot — the Celestial-Gateway shape. Requires a probe board
 *  with a player void character and an open play slot. */
function firstVoidToPlayDreamwell(probe: BattleMutableState): { id: string } {
  const ctx: StepContext = { side: "player", state: probe, random: () => 0, nowMs: 0 };
  const script = Object.values(DREAMWELL_EFFECTS).find((s) => {
    if (s.steps.some((step) => step.kind === "prompt")) return false;
    const edits = s.steps.flatMap((step) => (step.kind === "edits" ? step.build(ctx) : []));
    return edits.some((e) => e.kind === "MOVE_CARD_TO_ZONE" && "slotId" in e.destination);
  });
  if (script === undefined) throw new Error("no void-to-play dreamwell script registered");
  return script;
}

const SAFE_DREAMWELL_KINDS = new Set<string>([
  "ADJUST_SCORE",
  "ADJUST_CURRENT_ENERGY",
  "ADJUST_MAX_ENERGY",
  "SET_CARD_SPARK_DELTA",
  "SET_SIDE_HAND_VISIBILITY",
]);

/** A deterministic dreamwell script whose edits touch no deck/instance state,
 *  so the fixture board needs no card instances to observe its effect. */
function firstSafeDeterministicDreamwell(probe: BattleMutableState): { id: string } {
  const ctx: StepContext = { side: "player", state: probe, random: () => 0, nowMs: 0 };
  const script = Object.values(DREAMWELL_EFFECTS).find((s) => {
    if (s.steps.some((step) => step.kind === "prompt")) return false;
    const edits = s.steps.flatMap((step) =>
      step.kind === "edits" ? step.build(ctx) : [],
    );
    return edits.length > 0 && edits.every((e) => SAFE_DREAMWELL_KINDS.has(e.kind));
  });
  if (script === undefined) throw new Error("no safe deterministic dreamwell script registered");
  return script;
}

function debugEdit(edit: Record<string, unknown>): Record<string, unknown> {
  return { command: { id: "DEBUG_EDIT", edit } };
}

describe("BATTLE_COMMAND fold-time triggers", () => {
  it("bounces when no battle is in progress", () => {
    const result = reduce(baseState(), "BATTLE_COMMAND", debugEdit({ kind: "SET_SCORE", side: "player", value: 5 }));
    expect(result.outcome).toBe("bounced");
    expect(result.state.battle).toBeNull();
  });

  it("bounces when a prompt is already pending", () => {
    const board = makeRichBoard();
    const battle = battleFrom(board, {
      pendingPrompt: {
        promptId: 7,
        run: { scriptRef: { table: "battle", id: "x" }, cursor: [0], side: "player" },
        kind: "foresee",
        options: { kind: "foresee", count: 1, cardIds: [board.sides.player.deck[0]] },
      },
    });
    const state = { ...baseState(), battle };
    const result = reduce(state, "BATTLE_COMMAND", debugEdit({ kind: "SET_SCORE", side: "player", value: 5 }));
    expect(result.outcome).toBe("bounced");
  });

  it("bounces a malformed command payload", () => {
    const state = { ...baseState(), battle: battleFrom(makeRichBoard()) };
    expect(reduce(state, "BATTLE_COMMAND", { command: { id: "NONSENSE" } }).outcome).toBe("bounced");
    expect(reduce(state, "BATTLE_COMMAND", {}).outcome).toBe("bounced");
  });

  it("accepts and applies one atomic Foresee command", () => {
    const deckInstances = [1, 2, 3].map((index) => makeInstance(
      `foresee-command-${String(index)}`,
      `10000000-0000-0000-0000-00000000000${String(index)}`,
    ));
    const viewedCardIds = deckInstances.map((instance) => instance.battleCardId);
    const board = makeRichBoard({
      instances: deckInstances,
      playerDeck: viewedCardIds,
    });
    const state = { ...baseState(), battle: battleFrom(board) };
    const result = reduce(state, "BATTLE_COMMAND", debugEdit({
      kind: "FORESEE",
      side: "player",
      viewedCardIds,
      orderedCardIds: [viewedCardIds[2], viewedCardIds[0]],
      voidCardIds: [viewedCardIds[1]],
    }));

    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.board.sides.player.deck).toEqual([
      viewedCardIds[2],
      viewedCardIds[0],
    ]);
    expect(result.state.battle?.board.sides.player.void).toEqual([
      viewedCardIds[1],
    ]);
  });

  it("accepts the nineteen-character battlefield preview payload", () => {
    const state = { ...baseState(), battle: battleFrom(makeRichBoard()) };
    const definition = makeInstance(
      "preview-source",
      "10000000-0000-0000-0000-000000000099",
    ).definition;
    const definitions = Array.from({ length: 24 }, () => definition);
    const result = reduce(state, "BATTLE_COMMAND", debugEdit({
      kind: "FILL_BATTLEFIELD_PREVIEW",
      definitions: { player: definitions, enemy: definitions },
      createdAtMs: 10_000,
    }));

    expect(result.outcome).toBe("applied");
    expect(
      Object.values(result.state.battle?.board.sides.player.backRank ?? {})
        .filter((battleCardId) => battleCardId !== null),
    ).toHaveLength(10);
    expect(
      Object.values(result.state.battle?.board.sides.player.frontRank ?? {})
        .filter((battleCardId) => battleCardId !== null),
    ).toHaveLength(9);
  });

  it("bounces a DEBUG_EDIT whose side is not a battle side", () => {
    const state = inBattleState();
    const before = hashBattle(state.battle);
    const result = reduce(
      state,
      "BATTLE_COMMAND",
      debugEdit({ kind: "SET_SCORE", side: "__proto__", value: 5 }),
    );
    expect(result.outcome).toBe("bounced");
    expect(hashBattle(result.state.battle)).toBe(before);
  });

  it("bounces a DEBUG_EDIT whose numeric field is not finite", () => {
    const state = inBattleState();
    const result = reduce(
      state,
      "BATTLE_COMMAND",
      debugEdit({ kind: "ADJUST_SCORE", side: "player", amount: "5" }),
    );
    expect(result.outcome).toBe("bounced");
    expect(result.state.battle?.board.sides.player.score).toBe(
      state.battle?.board.sides.player.score,
    );
  });

  it("applies a plain command edit with no triggers and drains to an empty queue", () => {
    const state = { ...baseState(), battle: battleFrom(makeRichBoard()) };
    const result = reduce(state, "BATTLE_COMMAND", debugEdit({ kind: "SET_SCORE", side: "player", value: 9 }));
    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.board.sides.player.score).toBe(9);
    expect(result.state.battle?.effectQueue).toEqual([]);
    expect(result.state.battle?.pendingPrompt).toBeNull();
  });

  it("moves a character into play without resolving its rules text", () => {
    const instance = makeInstance(
      "bc-mat",
      "647f5150-b2e0-424b-9480-27557642524e",
      "player",
    );
    const board = makeRichBoard({ turnNumber: 3, phase: "day", playerHand: ["bc-mat"], instances: [instance] });
    const state = { ...baseState(), battle: battleFrom(board) };

    const moveEdit = {
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "bc-mat",
      destination: { side: "player", zone: "frontRank", slotId: frontRankSlotId(0) },
    };
    const result = reduce(state, "BATTLE_COMMAND", debugEdit(moveEdit));
    expect(result.outcome).toBe("applied");

    const exhausted = applyDebugEdit(board, {
      kind: "SET_CARD_STATUS",
      battleCardId: "bc-mat",
      status: { isExhausted: true },
    }, EMISSION).state;
    const expected = applyDebugEdit(exhausted, moveEdit as never, EMISSION).state;
    expect(hashBoard(result.state.battle!.board)).toBe(hashBoard(expected));
    expect(
      result.state.battle?.board.cardInstances["bc-mat"]?.status.isExhausted,
    ).toBe(true);
    expect(result.state.battle?.effectQueue).toEqual([]);
    expect(result.state.battle?.pendingPrompt).toBeNull();
  });

  it("does not clear exhaustion when the active side crosses Dawn", () => {
    const instance = makeInstance(
      "bc-dawn",
      "0458658d-7e02-4286-9249-93674d16620b",
      "player",
    );
    instance.status.isExhausted = true;
    const board = makeRichBoard({
      turnNumber: 4,
      phase: "day",
      playerFront: { [frontRankSlotId(0)]: "bc-dawn" },
      instances: [instance],
    });
    const state = { ...baseState(), battle: battleFrom(board) };

    const setDawn = { kind: "SET_PHASE", phase: "dawn" };
    const first = reduce(state, "BATTLE_COMMAND", debugEdit(setDawn));
    expect(first.outcome).toBe("applied");
    expect(first.state.battle?.board.phase).toBe("day");
    expect(
      first.state.battle?.board.cardInstances["bc-dawn"]?.status.isExhausted,
    ).toBe(true);
    expect(first.state.battle?.dawnFired.player).toBeNull();
    expect(first.state.battle?.effectQueue).toEqual([]);
    expect(first.state.battle?.pendingPrompt).toBeNull();
  });

  it("clears exhaustion from both sides when the turn ends", () => {
    const outgoing = makeInstance("bc-outgoing", "outgoing-card", "player");
    const incoming = makeInstance("bc-incoming", "incoming-card", "enemy");
    outgoing.status.isExhausted = true;
    incoming.status.isExhausted = true;
    const board = makeRichBoard({
      turnNumber: 1,
      phase: "day",
      playerBack: { B0: outgoing.battleCardId },
      instances: [outgoing, incoming],
    });
    board.sides.enemy.backRank.B0 = incoming.battleCardId;
    const state = { ...baseState(), battle: battleFrom(board) };

    const result = reduce(
      state,
      "BATTLE_COMMAND",
      debugEdit({
        kind: "SET_BATTLE_FLOW",
        phase: "dreamwell",
        activeSide: "enemy",
        turnNumber: 1,
      }),
    );

    expect({
      outcome: result.outcome,
      activeSide: result.state.battle?.board.activeSide,
      outgoingExhausted:
        result.state.battle?.board.cardInstances[outgoing.battleCardId]?.status
          .isExhausted,
      incomingExhausted:
        result.state.battle?.board.cardInstances[incoming.battleCardId]?.status
          .isExhausted,
      marker: result.state.battle?.dawnFired,
    }).toEqual({
      outcome: "applied",
      activeSide: "enemy",
      outgoingExhausted: false,
      incomingExhausted: false,
      marker: { player: 1, enemy: null },
    });
  });

  // --- dreamwell reveal queues the revealed card's script ---
  it("fires the revealed Dreamwell card's script when a reveal lands", () => {
    const probe = makeRichBoard();
    const dw = firstSafeDeterministicDreamwell(probe);
    const dreamwellCard: DreamwellCardDefinition = {
      id: dw.id,
      name: "Fixture Dreamwell",
      renderedText: "",
      energyAdded: 0,
      order: 0,
      cardNumber: 0,
      imageNumber: 0,
    };
    const init = makeInit({ dreamwellDeck: [dreamwellCard] });
    const board = makeRichBoard({
      turnNumber: 2,
      phase: "dreamwell",
      dreamwellDeckIndex: 0,
      playerDreamwellDrawnTurn: null,
    });
    const state = { ...baseState(), battle: battleFrom(board, { init }) };

    const revealEdit = { kind: "DRAW_DREAMWELL_CARD", side: "player", turnNumber: 2 };
    const result = reduce(state, "BATTLE_COMMAND", debugEdit(revealEdit));
    expect(result.outcome).toBe("applied");
    // The reveal alone advances the index; the script's edits change more.
    const revealOnly = applyDebugEdit(board, revealEdit as never, EMISSION).state;
    expect(hashBoard(result.state.battle!.board)).not.toBe(hashBoard(revealOnly));
    // Deterministic dreamwell script drains fully.
    expect(result.state.battle?.effectQueue).toEqual([]);
    expect(result.state.battle?.pendingPrompt).toBeNull();
  });

  // --- support convergence: recompute at the fold boundary is idempotent ---
  it("recomputes Support so an immediate re-recompute yields zero edits", () => {
    const support = firstSupportScript();
    const supporter = makeInstance("bc-support", support.id, "player");
    const ally = makeInstance("bc-ally", "ally-card", "player");
    // Supporter at B0 supports the front ally at F0 (supportedDeploySlots(B0) = [F0]).
    const board = makeRichBoard({
      turnNumber: 3,
      phase: "day",
      playerBack: { [backRankSlotId(0)]: "bc-support" },
      playerFront: { [frontRankSlotId(0)]: "bc-ally" },
      instances: [supporter, ally],
    });
    const state = { ...baseState(), battle: battleFrom(board) };

    const result = reduce(state, "BATTLE_COMMAND", debugEdit({ kind: "SET_SCORE", side: "player", value: 3 }));
    expect(result.outcome).toBe("applied");
    const nextBoard = result.state.battle!.board;
    // The ally picked up the supporter's spark bonus during the fold's recompute.
    expect(nextBoard.cardInstances["bc-ally"].staticSparkBonus).toBeGreaterThan(0);
    // Recomputing again immediately produces no further edits (idempotent).
    const again = planSupportRecompute(nextBoard, true, () => 0, 0);
    expect(again).toEqual([]);
  });

  // --- determinism: folding the same event twice yields identical state ---
  it("is deterministic — the same event folds to a byte-identical battle", () => {
    const board = makeRichBoard({
      turnNumber: 3,
      phase: "day",
      playerHand: ["bc-det"],
      instances: [makeInstance("bc-det", "647f5150-b2e0-424b-9480-27557642524e", "player")],
    });
    const state = { ...baseState(), battle: battleFrom(board) };
    const payload = debugEdit({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "bc-det",
      destination: { side: "player", zone: "frontRank", slotId: frontRankSlotId(0) },
    });
    const first = reduce(state, "BATTLE_COMMAND", payload);
    const second = reduce(state, "BATTLE_COMMAND", payload);
    expect(first.outcome).toBe("applied");
    expect(hashBattle(first.state.battle)).toBe(hashBattle(second.state.battle));
  });
});

// ---------------------------------------------------------------------------
// RESOLVE_PROMPT (Task 21)
// ---------------------------------------------------------------------------

/** The first Dreamwell script whose first step is a Foresee prompt. */
function firstForeseePromptDreamwellScript() {
  const script = Object.values(DREAMWELL_EFFECTS).find((s) => {
    const first = s.steps[0];
    return (
      first !== undefined &&
      first.kind === "prompt" &&
      first.prompt.kind === "foresee"
    );
  });
  if (script === undefined) {
    throw new Error("no foresee-prompt Dreamwell script registered");
  }
  return script;
}

const PARK_SEQ = 77;

/**
 * Parks a foresee prompt by seeding a foresee run (plus any `extraQueue` runs
 * behind it) and issuing a benign command that advances the queue until it
 * stops on the prompt. Returns the parked state, the open `promptId` (= the
 * command's seq), and the parked board hash.
 */
function parkForeseePrompt(extraQueue: EffectRun[] = []): {
  state: FoldState;
  promptId: number;
  parkedBoardHash: string;
  cardIds: string[];
} {
  const foresee = firstForeseePromptDreamwellScript();
  const deckInstances = [1, 2, 3].map((index) => makeInstance(
    `foresee-${String(index)}`,
    `00000000-0000-0000-0000-00000000000${String(index)}`,
  ));
  const board = makeRichBoard({
    turnNumber: 3,
    phase: "day",
    instances: deckInstances,
    playerDeck: deckInstances.map((instance) => instance.battleCardId),
  });
  const battle = battleFrom(board, {
    effectQueue: [
      { scriptRef: { table: "dreamwell", id: foresee.id }, cursor: [0], side: "player" },
      ...extraQueue,
    ],
  });
  const state = { ...baseState(), battle };
  const parked = reduce(
    state,
    "BATTLE_COMMAND",
    debugEdit({ kind: "SET_SCORE", side: "player", value: 4 }),
    ctx({ seq: PARK_SEQ }),
  );
  const prompt = parked.state.battle?.pendingPrompt;
  if (prompt == null) {
    throw new Error("expected a parked foresee prompt");
  }
  expect(prompt.kind).toBe("foresee");
  if (prompt.options.kind !== "foresee") {
    throw new Error("expected foresee prompt options");
  }
  const parkedBoard = parked.state.battle!.board;
  for (const battleCardId of parkedBoard.sides.player.deck.slice(
    0,
    prompt.options.count,
  )) {
    expect(parkedBoard.cardInstances[battleCardId]?.revealedTo?.player).toBe(
      true,
    );
  }
  return {
    state: parked.state,
    promptId: prompt.promptId,
    parkedBoardHash: hashBoard(parked.state.battle!.board),
    cardIds: prompt.options.cardIds,
  };
}

describe("RESOLVE_PROMPT", () => {
  it("applies a matching resolve and clears the open prompt", () => {
    const { state, promptId } = parkForeseePrompt();
    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      { promptId, resolution: { kind: "foresee" } },
      ctx({ seq: PARK_SEQ + 1 }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.pendingPrompt).toBeNull();
    expect(result.state.battle?.effectQueue).toEqual([]);
  });

  it("applies the staged Foresee order and void choice inside the prompt event", () => {
    const { state, promptId, cardIds } = parkForeseePrompt();
    const [voidedCardId, ...orderedCardIds] = cardIds;
    if (voidedCardId === undefined) throw new Error("expected a foreseen card");
    const deckTail = state.battle!.board.sides.player.deck.slice(cardIds.length);
    const voidBefore = state.battle!.board.sides.player.void;
    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      {
        promptId,
        resolution: {
          kind: "foresee",
          orderedCardIds,
          voidCardIds: [voidedCardId],
        },
      },
      ctx({ seq: PARK_SEQ + 1 }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.state.battle!.board.sides.player.deck).toEqual([
      ...orderedCardIds,
      ...deckTail,
    ]);
    expect(result.state.battle!.board.sides.player.void).toEqual([
      ...voidBefore,
      voidedCardId,
    ]);
  });

  it("applies an adjusted Foresee count when the resolution carries a live deck prefix", () => {
    const { state, promptId } = parkForeseePrompt();
    const viewedCardIds = state.battle!.board.sides.player.deck.slice(0, 3);
    const [firstCardId, secondCardId, thirdCardId] = viewedCardIds;
    if (
      firstCardId === undefined ||
      secondCardId === undefined ||
      thirdCardId === undefined
    ) {
      throw new Error("expected three deck cards");
    }

    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      {
        promptId,
        resolution: {
          kind: "foresee",
          viewedCardIds,
          orderedCardIds: [thirdCardId, firstCardId],
          voidCardIds: [secondCardId],
        },
      },
      ctx({ seq: PARK_SEQ + 1 }),
    );

    expect(result.outcome).toBe("applied");
    expect(result.state.battle!.board.sides.player.deck).toEqual([
      thirdCardId,
      firstCardId,
    ]);
    expect(result.state.battle!.board.sides.player.void).toContain(secondCardId);
  });

  it("bounces a Foresee resolution that does not partition the recorded prefix", () => {
    const { state, promptId, cardIds } = parkForeseePrompt();
    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      {
        promptId,
        resolution: {
          kind: "foresee",
          orderedCardIds: [...cardIds, ...cardIds],
          voidCardIds: [],
        },
      },
      ctx({ seq: PARK_SEQ + 1 }),
    );

    expect(result.outcome).toBe("bounced");
    expect(result.state.battle?.pendingPrompt?.promptId).toBe(promptId);
  });

  it("bounces an adjusted Foresee resolution whose viewed cards are not a deck prefix", () => {
    const { state, promptId } = parkForeseePrompt();
    const deck = state.battle!.board.sides.player.deck;
    const nonTopCardId = deck[1];
    if (nonTopCardId === undefined) throw new Error("expected a second deck card");

    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      {
        promptId,
        resolution: {
          kind: "foresee",
          viewedCardIds: [nonTopCardId],
          orderedCardIds: [nonTopCardId],
          voidCardIds: [],
        },
      },
      ctx({ seq: PARK_SEQ + 1 }),
    );

    expect(result.outcome).toBe("bounced");
    expect(result.state.battle?.pendingPrompt?.promptId).toBe(promptId);
  });

  it("resumes and drains the rest of the queue after a matching resolve", () => {
    const probe = makeRichBoard();
    const safe = firstSafeDeterministicDreamwell(probe);
    const safeRun: EffectRun = {
      scriptRef: { table: "dreamwell", id: safe.id },
      cursor: [0],
      side: "player",
    };
    const { state, promptId, parkedBoardHash } = parkForeseePrompt([safeRun]);
    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      { promptId, resolution: { kind: "foresee" } },
      ctx({ seq: PARK_SEQ + 1 }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.pendingPrompt).toBeNull();
    expect(result.state.battle?.effectQueue).toEqual([]);
    // The queued dreamwell run ran once the foresee resolved — the board moved
    // past the parked state, proving the driver resumed advancing the queue.
    expect(hashBoard(result.state.battle!.board)).not.toBe(parkedBoardHash);
  });

  it("prompt race — the first matching resolve applies and a duplicate bounces", () => {
    const { state, promptId } = parkForeseePrompt();
    const first = reduce(
      state,
      "RESOLVE_PROMPT",
      { promptId, resolution: { kind: "foresee" } },
      ctx({ seq: PARK_SEQ + 1 }),
    );
    expect(first.outcome).toBe("applied");
    expect(first.state.battle?.pendingPrompt).toBeNull();
    // Both players answered the same prompt; the second (loser) resolve arrives
    // after the prompt is closed and bounces.
    const second = reduce(
      first.state,
      "RESOLVE_PROMPT",
      { promptId, resolution: { kind: "foresee" } },
      ctx({ seq: PARK_SEQ + 2 }),
    );
    expect(second.outcome).toBe("bounced");
  });

  it("bounces a stale/mismatched promptId while the prompt is open, leaving it untouched", () => {
    const { state, promptId } = parkForeseePrompt();
    const before = hashBattle(state.battle);
    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      { promptId: promptId - 1, resolution: { kind: "foresee" } },
      ctx({ seq: PARK_SEQ + 1 }),
    );
    expect(result.outcome).toBe("bounced");
    expect(hashBattle(result.state.battle)).toBe(before);
    expect(result.state.battle?.pendingPrompt?.promptId).toBe(promptId);
  });

  it("bounces when no battle is in progress", () => {
    const result = reduce(baseState(), "RESOLVE_PROMPT", {
      promptId: 1,
      resolution: { kind: "foresee" },
    });
    expect(result.outcome).toBe("bounced");
  });

  it("bounces when no prompt is pending", () => {
    const state = { ...baseState(), battle: battleFrom(makeRichBoard()) };
    const result = reduce(state, "RESOLVE_PROMPT", {
      promptId: 1,
      resolution: { kind: "foresee" },
    });
    expect(result.outcome).toBe("bounced");
  });

  it("bounces a malformed resolution payload", () => {
    const { state, promptId } = parkForeseePrompt();
    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      { promptId, resolution: { kind: "nonsense" } },
      ctx({ seq: PARK_SEQ + 1 }),
    );
    expect(result.outcome).toBe("bounced");
    // The prompt survives the malformed resolve.
    expect(result.state.battle?.pendingPrompt?.promptId).toBe(promptId);
  });
});

// ---------------------------------------------------------------------------
// SET_CARD_NOTE (Task 21)
// ---------------------------------------------------------------------------

const MANUAL_NOTE = {
  noteId: "note-1",
  text: "watch this card",
  expiry: { kind: "manual" },
};

function noteState(): FoldState {
  const board = makeRichBoard({
    turnNumber: 3,
    phase: "day",
    instances: [makeInstance("bc-note", "note-card", "player")],
  });
  return { ...baseState(), battle: battleFrom(board) };
}

describe("SET_CARD_NOTE", () => {
  it("stores a note on the target card using the event timestamp", () => {
    const state = noteState();
    const result = reduce(
      state,
      "SET_CARD_NOTE",
      { instanceId: "bc-note", note: MANUAL_NOTE },
      ctx({ seq: 5, timestamp: "1970-01-01T00:00:02.000Z" }),
    );
    expect(result.outcome).toBe("applied");
    const notes = result.state.battle?.board.cardInstances["bc-note"].notes ?? [];
    expect(notes).toHaveLength(1);
    expect(notes[0].noteId).toBe("note-1");
    expect(notes[0].text).toBe("watch this card");
    expect(notes[0].expiry).toEqual({ kind: "manual" });
    // createdAtMs comes from ctx.timestamp (= event.clientTimestamp), never a
    // live clock — two clients folding the same event stamp the same value.
    expect(notes[0].createdAtMs).toBe(isoTimestampToMs("1970-01-01T00:00:02.000Z"));
  });

  it("accepts an atStartOfTurn expiry", () => {
    const state = noteState();
    const result = reduce(state, "SET_CARD_NOTE", {
      instanceId: "bc-note",
      note: {
        noteId: "note-2",
        text: "temporary",
        expiry: { kind: "atStartOfTurn", side: "enemy", turnNumber: 4 },
      },
    });
    expect(result.outcome).toBe("applied");
    const notes = result.state.battle?.board.cardInstances["bc-note"].notes ?? [];
    expect(notes[0].expiry).toEqual({
      kind: "atStartOfTurn",
      side: "enemy",
      turnNumber: 4,
    });
  });

  it("bounces when the target card does not exist", () => {
    const state = noteState();
    const result = reduce(state, "SET_CARD_NOTE", {
      instanceId: "missing",
      note: MANUAL_NOTE,
    });
    expect(result.outcome).toBe("bounced");
  });

  it("bounces when there is no battle (no card to annotate)", () => {
    const result = reduce(baseState(), "SET_CARD_NOTE", {
      instanceId: "bc-note",
      note: MANUAL_NOTE,
    });
    expect(result.outcome).toBe("bounced");
  });

  it("bounces a malformed note payload", () => {
    const state = noteState();
    expect(
      reduce(state, "SET_CARD_NOTE", { instanceId: "bc-note", note: "hi" }).outcome,
    ).toBe("bounced");
    expect(
      reduce(state, "SET_CARD_NOTE", {
        instanceId: "bc-note",
        note: { text: "no id", expiry: { kind: "manual" } },
      }).outcome,
    ).toBe("bounced");
    expect(
      reduce(state, "SET_CARD_NOTE", {
        instanceId: "bc-note",
        note: { noteId: "n", text: "bad expiry", expiry: { kind: "whenever" } },
      }).outcome,
    ).toBe("bounced");
  });

  it("applies through an open prompt without resolving it (CAS-exempt)", () => {
    const foresee = firstForeseePromptDreamwellScript();
    const board = makeRichBoard({
      turnNumber: 3,
      phase: "day",
      instances: [makeInstance("bc-note", "note-card", "player")],
    });
    const battle = battleFrom(board, {
      effectQueue: [
        { scriptRef: { table: "dreamwell", id: foresee.id }, cursor: [0], side: "player" },
      ],
    });
    const parked = reduce(
      { ...baseState(), battle },
      "BATTLE_COMMAND",
      debugEdit({ kind: "SET_SCORE", side: "player", value: 1 }),
      ctx({ seq: 60 }),
    );
    expect(parked.state.battle?.pendingPrompt).not.toBeNull();

    const result = reduce(
      parked.state,
      "SET_CARD_NOTE",
      { instanceId: "bc-note", note: MANUAL_NOTE },
      ctx({ seq: 61 }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.board.cardInstances["bc-note"].notes).toHaveLength(1);
    // The note left the open prompt intact.
    expect(result.state.battle?.pendingPrompt).not.toBeNull();
  });

  it("applies through a hostile partner intervening window (CAS-exempt)", () => {
    const state = noteState();
    const result = reduceGameEvent(
      state,
      event("SET_CARD_NOTE", { instanceId: "bc-note", note: MANUAL_NOTE }),
      ctx({ intervening: [{ seq: 5, actor: "bob", type: "ADJUST_ESSENCE" }] }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.board.cardInstances["bc-note"].notes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Shared battle automation and AI defense
// ---------------------------------------------------------------------------

describe("battle automation", () => {
  function cardPlayState(enabled: boolean): FoldState {
    const instance = makeInstance("bc-play", "card-play", "player");
    instance.definition.energyCost = 2;
    instance.definition.printedEnergyCost = 2;
    const board = makeRichBoard({
      instances: [instance],
      playerHand: [instance.battleCardId],
    });
    board.sides.player.currentEnergy = 5;
    board.sides.player.maxEnergy = 5;
    return {
      ...baseState(),
      battle: battleFrom(board, { basicAutomationEnabled: enabled }),
    };
  }

  const playCommand = debugEdit({
    kind: "MOVE_CARD_TO_ZONE",
    battleCardId: "bc-play",
    destination: { side: "player", zone: "backRank", slotId: backRankSlotId(0) },
  });

  it("expands raw commands even when persisted state carries a false marker", () => {
    const automated = reduce(cardPlayState(true), "BATTLE_COMMAND", playCommand);
    const persistedFalse = reduce(cardPlayState(false), "BATTLE_COMMAND", playCommand);

    expect(automated.state.battle?.board.sides.player.currentEnergy).toBe(3);
    expect(persistedFalse.state.battle?.board.sides.player.currentEnergy).toBe(3);
    expect(automated.state.battle?.basicAutomationEnabled).toBe(true);
    expect(persistedFalse.state.battle?.basicAutomationEnabled).toBe(false);
    expect(automated.state.battle?.board.sides.player.backRank[backRankSlotId(0)]).toBe("bc-play");
    expect(persistedFalse.state.battle?.board.sides.player.backRank[backRankSlotId(0)]).toBe("bc-play");
    expect(
      automated.state.battle?.board.cardInstances["bc-play"]?.status.isExhausted,
    ).toBe(true);
    expect(
      persistedFalse.state.battle?.board.cardInstances["bc-play"]?.status.isExhausted,
    ).toBe(true);
  });

  it("keeps automation enabled when folding a persisted setting event", () => {
    const result = reduce(cardPlayState(true), "SET_BATTLE_AUTOMATION", {
      enabled: false,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.basicAutomationEnabled).toBe(true);
  });
});

describe("BATTLE_AI_DEFEND", () => {
  it("applies deterministic defense once and records the processed turn", () => {
    const challenger = makeInstance("challenger", "challenger-card", "player");
    challenger.definition.printedSpark = 2;
    const blocker = makeInstance("blocker", "blocker-card", "enemy");
    blocker.definition.printedSpark = 4;
    const board = makeRichBoard({
      phase: "dusk",
      turnNumber: 3,
      instances: [challenger, blocker],
      playerFront: { [frontRankSlotId(0)]: challenger.battleCardId },
    });
    board.sides.enemy.backRank[backRankSlotId(0)] = blocker.battleCardId;
    const state = { ...baseState(), battle: battleFrom(board) };

    const first = reduce(state, "BATTLE_AI_DEFEND", { aiSide: "enemy" });
    expect(first.outcome).toBe("applied");
    expect(first.state.battle?.board.sides.enemy.frontRank[frontRankSlotId(0)]).toBe(
      blocker.battleCardId,
    );
    expect(first.state.battle?.aiDefenseTurn).toEqual({
      activeSide: "player",
      turnNumber: 3,
    });

    const second = reduce(first.state, "BATTLE_AI_DEFEND", { aiSide: "enemy" });
    expect(second.outcome).toBe("bounced");
  });

  it("records an empty defense so reloads do not retry it forever", () => {
    const board = makeRichBoard({ phase: "dusk", turnNumber: 4 });
    const result = reduce(
      { ...baseState(), battle: battleFrom(board) },
      "BATTLE_AI_DEFEND",
      { aiSide: "enemy" },
    );

    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.aiDefenseTurn).toEqual({
      activeSide: "player",
      turnNumber: 4,
    });
  });
});

// ---------------------------------------------------------------------------
// BATTLE_GESTURE — all-or-nothing multi-command atomicity (P1-8)
// ---------------------------------------------------------------------------

describe("BATTLE_GESTURE", () => {
  const gainFive = { id: "DEBUG_EDIT", edit: { kind: "ADJUST_SCORE", side: "player", amount: 5 } };
  const gainThree = { id: "DEBUG_EDIT", edit: { kind: "ADJUST_SCORE", side: "player", amount: 3 } };
  // Missing `edit.kind` → coerceBattleCommand returns null (invalid command).
  const invalid = { id: "DEBUG_EDIT", edit: {} };

  function gestureState(): FoldState {
    return { ...baseState(), battle: battleFrom(makeRichBoard({ turnNumber: 3, phase: "day" })) };
  }

  it("applies every command when all are valid (both effects present)", () => {
    const state = gestureState();
    const base = state.battle!.board.sides.player.score;
    const result = reduce(state, "BATTLE_GESTURE", { commands: [gainFive, gainThree] });
    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.board.sides.player.score).toBe(base + 5 + 3);
  });

  it("bounces the WHOLE gesture when any command is invalid — no partial application", () => {
    const state = gestureState();
    const before = hashBattle(state.battle);
    const result = reduce(state, "BATTLE_GESTURE", { commands: [gainFive, invalid] });
    expect(result.outcome).toBe("bounced");
    // The valid leading command left no trace: the battle is byte-identical.
    expect(hashBattle(result.state.battle)).toBe(before);
  });

  it("bounces an empty or non-array commands payload", () => {
    const state = gestureState();
    expect(reduce(state, "BATTLE_GESTURE", { commands: [] }).outcome).toBe("bounced");
    expect(reduce(state, "BATTLE_GESTURE", { commands: "nope" }).outcome).toBe("bounced");
    expect(reduce(state, "BATTLE_GESTURE", {}).outcome).toBe("bounced");
  });

  it("bounces with no battle in progress", () => {
    expect(reduce(baseState(), "BATTLE_GESTURE", { commands: [gainFive] }).outcome).toBe("bounced");
  });

  it("folds a valid gesture deterministically (two folds are byte-identical)", () => {
    const state = gestureState();
    const a = reduce(state, "BATTLE_GESTURE", { commands: [gainFive, gainThree] });
    const b = reduce(state, "BATTLE_GESTURE", { commands: [gainFive, gainThree] });
    expect(hashBattle(a.state.battle)).toBe(hashBattle(b.state.battle));
  });

});

// ---------------------------------------------------------------------------
// Dreamwell reveal side — non-active-side reveal fires its script (P2-2)
// ---------------------------------------------------------------------------

describe("dreamwell reveal side", () => {
  it("queues the revealed script for a NON-active-side reveal (Lily Lake case)", () => {
    const probe = makeRichBoard();
    const dw = firstSafeDeterministicDreamwell(probe);
    const dreamwellCard: DreamwellCardDefinition = {
      id: dw.id,
      name: "Fixture Dreamwell",
      renderedText: "",
      energyAdded: 0,
      order: 0,
      cardNumber: 0,
      imageNumber: 0,
    };
    const init = makeInit({ dreamwellDeck: [dreamwellCard] });
    // Active side is `player`; the enemy takes a manual extra dreamwell draw.
    const board = makeRichBoard({ turnNumber: 2, phase: "dreamwell", dreamwellDeckIndex: 0 });
    const state = { ...baseState(), battle: battleFrom(board, { init }) };

    const revealEdit = { kind: "DRAW_DREAMWELL_CARD", side: "enemy", turnNumber: 2 };
    const result = reduce(state, "BATTLE_COMMAND", debugEdit(revealEdit));
    expect(result.outcome).toBe("applied");
    // The enemy's revealed script ran: the board changed beyond the bare reveal.
    const revealOnly = applyDebugEdit(board, revealEdit as never, EMISSION).state;
    expect(hashBoard(result.state.battle!.board)).not.toBe(hashBoard(revealOnly));
    expect(result.state.battle?.board.sides.enemy.dreamwellDrawnTurn).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Support recompute ordering — recomputed on the DRAINED board (P2-1)
// ---------------------------------------------------------------------------

describe("support recompute ordering", () => {
  it("keeps staticSparkBonus correct after a queued effect changes the board", () => {
    // Celestial-Gateway shape: a dreamwell reveal queues a script that moves a
    // scripted supporter out of the void and into play DURING the drain. Support
    // must be recomputed AFTER the drain, so the final board is self-consistent.
    const support = firstSupportScript();
    const probe = makeRichBoard({
      playerVoid: ["bc-support"],
      playerFront: { [frontRankSlotId(0)]: "bc-ally" },
      instances: [makeInstance("bc-support", support.id, "player"), makeInstance("bc-ally", "ally-card", "player")],
    });
    const voidToPlay = firstVoidToPlayDreamwell(probe);
    const dreamwellCard: DreamwellCardDefinition = {
      id: voidToPlay.id,
      name: "Fixture Gateway",
      renderedText: "",
      energyAdded: 0,
      order: 0,
      cardNumber: 0,
      imageNumber: 0,
    };
    const init = makeInit({ dreamwellDeck: [dreamwellCard] });
    const board = makeRichBoard({
      turnNumber: 2,
      phase: "dreamwell",
      dreamwellDeckIndex: 0,
      playerVoid: ["bc-support"],
      playerFront: { [frontRankSlotId(0)]: "bc-ally" },
      instances: [makeInstance("bc-support", support.id, "player"), makeInstance("bc-ally", "ally-card", "player")],
    });
    const state = { ...baseState(), battle: battleFrom(board, { init }) };

    const result = reduce(
      state,
      "BATTLE_COMMAND",
      debugEdit({ kind: "DRAW_DREAMWELL_CARD", side: "player", turnNumber: 2 }),
    );
    expect(result.outcome).toBe("applied");
    // Whatever the queued move did to the board, Support is fully consistent with
    // the DRAINED board: an immediate re-recompute yields no further edits. Under
    // the pre-fix ordering (recompute before the drain) a queued board change
    // would leave a non-empty delta here.
    const finalBoard = result.state.battle!.board;
    expect(planSupportRecompute(finalBoard, true, () => 0, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// RESOLVE_PROMPT pick-cards candidate validation (P2-6)
// ---------------------------------------------------------------------------

describe("RESOLVE_PROMPT pick-cards candidate validation", () => {
  const PROMPT_SEQ = 90;

  function pickCardsState(): FoldState {
    const board = makeRichBoard({ turnNumber: 3, phase: "day" });
    const battle = battleFrom(board, {
      pendingPrompt: {
        promptId: PROMPT_SEQ,
        // The run's script is irrelevant to the candidate check, which reads the
        // recorded `options`; a bounce never reaches the driver.
        run: { scriptRef: { table: "battle", id: "unresolved" }, cursor: [0], side: "player" },
        kind: "pick-cards",
        options: {
          kind: "pick-cards",
          label: "pick one",
          candidateIds: ["card-a", "card-b"],
          count: 1,
          optional: false,
          highlightCardIds: [],
        },
      },
    });
    return { ...baseState(), battle };
  }

  it("bounces when a chosen id is outside the recorded candidate set, leaving the prompt open", () => {
    const state = pickCardsState();
    const before = hashBattle(state.battle);
    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      { promptId: PROMPT_SEQ, resolution: { kind: "pick-cards", chosenIds: ["card-z"] } },
      ctx({ seq: PROMPT_SEQ + 1 }),
    );
    expect(result.outcome).toBe("bounced");
    // A candidate violation does NOT clear the prompt (rule 5 bounce).
    expect(hashBattle(result.state.battle)).toBe(before);
    expect(result.state.battle?.pendingPrompt?.promptId).toBe(PROMPT_SEQ);
  });

  it("bounces when the chosen count exceeds the prompt max", () => {
    const state = pickCardsState();
    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      { promptId: PROMPT_SEQ, resolution: { kind: "pick-cards", chosenIds: ["card-a", "card-b"] } },
      ctx({ seq: PROMPT_SEQ + 1 }),
    );
    expect(result.outcome).toBe("bounced");
    expect(result.state.battle?.pendingPrompt?.promptId).toBe(PROMPT_SEQ);
  });

  it("does not bounce a resolution whose id is a member of the candidate set", () => {
    const state = pickCardsState();
    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      { promptId: PROMPT_SEQ, resolution: { kind: "pick-cards", chosenIds: ["card-a"] } },
      ctx({ seq: PROMPT_SEQ + 1 }),
    );
    // In-candidate + in-count → passes validation (the driver then resolves it).
    expect(result.outcome).toBe("applied");
  });
});

describe("RESOLVE_PROMPT choice validation", () => {
  const PROMPT_SEQ = 91;

  function choiceState(): FoldState {
    const board = makeRichBoard({ turnNumber: 3, phase: "day" });
    return {
      ...baseState(),
      battle: battleFrom(board, {
        pendingPrompt: {
          promptId: PROMPT_SEQ,
          run: { scriptRef: { table: "battle", id: "unresolved" }, cursor: [0], side: "player" },
          kind: "choice",
          options: {
            kind: "choice",
            label: "choose",
            options: [{ label: "A" }, { label: "B" }],
          },
        },
      }),
    };
  }

  it("bounces an out-of-range choice index and leaves the prompt open", () => {
    const state = choiceState();
    const before = hashBattle(state.battle);
    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      { promptId: PROMPT_SEQ, resolution: { kind: "choice", optionIndex: 2 } },
      ctx({ seq: PROMPT_SEQ + 1 }),
    );
    expect(result.outcome).toBe("bounced");
    expect(hashBattle(result.state.battle)).toBe(before);
    expect(result.state.battle?.pendingPrompt?.promptId).toBe(PROMPT_SEQ);
  });
});

describe("RESOLVE_PROMPT confirm validation", () => {
  const PROMPT_SEQ = 92;

  function confirmState(): FoldState {
    const board = makeRichBoard({ turnNumber: 3, phase: "day" });
    return {
      ...baseState(),
      battle: battleFrom(board, {
        pendingPrompt: {
          promptId: PROMPT_SEQ,
          run: { scriptRef: { table: "battle", id: "unresolved" }, cursor: [0], side: "player" },
          kind: "confirm",
          options: {
            kind: "choice",
            label: "confirm",
            options: [{ label: "Yes" }, { label: "Skip" }],
          },
        },
      }),
    };
  }

  it("bounces a confirm resolution outside the Yes/Skip range", () => {
    const state = confirmState();
    const result = reduce(
      state,
      "RESOLVE_PROMPT",
      { promptId: PROMPT_SEQ, resolution: { kind: "choice", optionIndex: 3 } },
      ctx({ seq: PROMPT_SEQ + 1 }),
    );
    expect(result.outcome).toBe("bounced");
    expect(result.state.battle?.pendingPrompt?.promptId).toBe(PROMPT_SEQ);
  });
});
