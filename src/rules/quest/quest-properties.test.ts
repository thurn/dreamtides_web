// Cross-cutting property tests for the Stage B quest reducer.
//
// These suites only make sense once every quest domain case exists (Tasks
// 10–15). They fold ~100 SEEDED random event sequences over a populated
// post-`START_QUEST` fold state and assert four invariants that no single
// per-case unit test can express:
//
//   (a) Run-field nullability — the successor to the deleted
//       `NON_NULLABLE_RUN_FIELDS` guard: no NORMAL gameplay event ever
//       transitions `draftState` / `resolvedPackage` / `dreamcaller` from
//       non-null to null. Only `RESET_QUEST`, `LOAD_STATE`, and the debug
//       `SET_DRAFT_STATE` may null a run field, so we draw the random
//       sequences from the NON-DEBUG quest event union (those three, plus the
//       other debug/QA edits, are excluded — see `DEBUG_EVENT_TYPES` below).
//       With the carve-out events excluded the invariant is crisp: the fields
//       must NEVER go non-null → null.
//   (b) Total fold safety — the sequences never throw and every outcome is
//       `applied` | `bounced` (contained-throw mode, `devMode: false`).
//   (c) Determinism — each sequence folded twice yields an identical final
//       `hashState`.
//   (d) JSON purity — the final state survives a plain JSON encode/decode
//       round-trip with hash equality (catches functions / `undefined`
//       smuggled into state). `GAME_ENGINE_CONFIG`'s encode/decode is not
//       defined until Task 22, so a plain JSON round-trip stands in here.
//
// The random generator is a small seeded xorshift PRNG (no `Math.random`, no
// `Date.now`, no firebase/react — the src/rules/ lint rails).
//
// Populated-start approach: FAKE content providers (approach (a) in the task
// brief). `START_QUEST` bounces unless a `QuestLifecycleContentProvider` is
// registered, and `ADD_CARD` / `ADD_DREAMSIGN` bounce without a
// `DeckContentProvider`. We register minimal deterministic fakes in
// `beforeAll` and clear them (`register*(null)`) in `afterAll`, so no
// registration leaks into other suites. The lifecycle fake's `startQuest`
// populates all three run fields (`dreamcaller`, `resolvedPackage`, and a
// non-null `draftState`) so the nullability invariant has a real precondition
// to protect. The Draft and Site providers are intentionally left unregistered
// — `PICK_DRAFT_CARD`, `OPEN_SITE`, the merchant events, and `REROLL_SHOP`
// then bounce cleanly (a valid outcome for (b)); their draft-state mutation
// paths only ever assign a non-null clone and are covered by draft.test.ts /
// shop.test.ts.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { eventRng } from "../../eventlog/rng";
import { foldEvents } from "../../eventlog/fold";
import { hashState } from "../../eventlog/hash";
import type {
  EngineConfig,
  EventContext,
  GameEvent,
  Genesis,
} from "../../eventlog/types";
import type {
  DreamcallerContent,
  ResolvedDreamcallerPackage,
} from "../../types/content";
import type { PoolDraftState } from "../../types/draft";
import type { Dreamsign } from "../../types/quest";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import {
  registerDeckContentProvider,
  type DeckContentProvider,
} from "./deck";
import {
  registerQuestLifecycleContentProvider,
  type QuestLifecycleContentProvider,
} from "./lifecycle";

// ---------------------------------------------------------------------------
// Fixtures & engine config
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: "quest-properties-seed",
  reducerVersion: "test",
  createdAt: 0,
};

const ACTOR = "alice";
const TIMESTAMP = "1970-01-01T00:00:00.000Z";

/**
 * A minimal `EngineConfig<FoldState>` for `foldEvents`. Only `reducer` is read
 * by `foldEvents`; the rest are supplied for completeness (and mirror what the
 * real engine config will expose in Task 22).
 */
const ENGINE_CONFIG: EngineConfig<FoldState> = {
  reducer: reduceGameEvent,
  genesisState: genesisFoldState,
  encode: (state) => JSON.stringify(state),
  decode: (raw) => JSON.parse(raw) as FoldState,
  hash: hashState,
};

/** A seeded 32-bit xorshift PRNG — reproducible, no `Math.random`. */
function makePrng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

/** FNV-1a hash of a string to a 32-bit seed for the PRNG. */
function hashNumber(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Deterministic fake content providers
// ---------------------------------------------------------------------------

/**
 * A deterministic package derived only from `(dreamcallerId, seed)`. The
 * `startQuest` result populates ALL THREE run fields, including a non-null
 * `draftState`, so the nullability invariant (a) has a live precondition.
 */
function lifecycleProvider(): QuestLifecycleContentProvider {
  function packageFor(
    dreamcallerId: string,
    seed: string,
  ): ResolvedDreamcallerPackage {
    const dreamcaller: DreamcallerContent = {
      id: dreamcallerId,
      name: `caller-${dreamcallerId}`,
      title: "title",
      renderedText: "text",
      imageNumber: "1",
      startingEssence: 150,
    };
    const rng = makePrng(hashNumber(`${dreamcallerId}:${seed}`));
    const dreamsignPoolIds = Array.from(
      { length: 8 },
      () => `ds-${String(Math.floor(rng() * 1_000_000))}`,
    );
    return {
      dreamcaller,
      draftPoolCopiesByCard: { "100": 4, "101": 4, "102": 4 },
      dreamsignPoolIds,
      mandatoryOnlyPoolSize: 3,
      draftPoolSize: 3,
      doubledCardCount: 1,
      legalSubsetCount: 1,
      preferredSubsetCount: 1,
      starterDecklistCardNumbers: [10, 11, 12],
    };
  }

  function populatedDraftState(): PoolDraftState {
    return {
      mode: "pool",
      currentOffer: [100, 101, 102],
      activeSiteId: "draft-site-1",
      pickNumber: 1,
      sitePicksCompleted: 0,
      draftPoolCopiesByCard: { "100": 4, "101": 4, "102": 4 },
      remainingCopiesByCard: { "100": 3, "101": 4, "102": 4 },
    };
  }

  return {
    resolveDreamcallerPackage: (dreamcallerId, seed) =>
      packageFor(dreamcallerId, seed),
    startQuest: ({ quest, dreamcallerId, seed }) => {
      const pkg = packageFor(dreamcallerId, seed);
      return {
        ...quest,
        seed: quest.seed,
        essence: pkg.dreamcaller.startingEssence,
        dreamcaller: {
          id: pkg.dreamcaller.id,
          name: pkg.dreamcaller.name,
          title: pkg.dreamcaller.title,
          renderedText: pkg.dreamcaller.renderedText,
          imageNumber: pkg.dreamcaller.imageNumber,
          startingEssence: pkg.dreamcaller.startingEssence,
        },
        resolvedPackage: pkg,
        remainingDreamsignPool: [...pkg.dreamsignPoolIds],
        draftState: populatedDraftState(),
        currentDreamscape: "node-start",
        screen: { type: "dreamscape" },
      };
    },
  };
}

/**
 * A deck provider that resolves any `card-<n>` id to `n` and any dreamsign id
 * to a minimal record, so `ADD_CARD` / `ADD_DREAMSIGN` apply and exercise the
 * deck-mutation paths. Deterministic in the id alone (never seq/clock).
 */
function deckProvider(): DeckContentProvider {
  return {
    resolveCardNumber: (cardId) => {
      const match = /^card-(\d+)$/.exec(cardId);
      return match ? Number(match[1]) : null;
    },
    resolveDreamsign: (dreamsignId): Dreamsign | null => {
      const match = /^ds-(\d+)$/.exec(dreamsignId);
      if (match === null) return null;
      return {
        id: dreamsignId,
        name: `dreamsign-${match[1]}`,
        effectDescription: "effect",
        isBane: false,
      };
    },
  };
}

beforeAll(() => {
  registerQuestLifecycleContentProvider(lifecycleProvider());
  registerDeckContentProvider(deckProvider());
});

afterAll(() => {
  // Clear our registrations so no other suite sees a populated provider.
  registerQuestLifecycleContentProvider(null);
  registerDeckContentProvider(null);
});

// ---------------------------------------------------------------------------
// Event classification
// ---------------------------------------------------------------------------

/**
 * Debug / QA / carve-out event types EXCLUDED from the random generator for
 * suite (a). The three carve-out events (`RESET_QUEST`, `LOAD_STATE`,
 * `SET_DRAFT_STATE`) are allowed to null a run field; the remaining debug edits
 * (`SET_*` overrides, atlas/augury/source debug) are QA escape hatches with no
 * bearing on the normal-gameplay invariant. Excluding all of them makes (a)
 * crisp: with the generator drawing only from non-debug events, the run fields
 * must NEVER go non-null → null.
 */
const DEBUG_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  "SET_DRAFT_STATE",
  "SET_ESSENCE",
  "SET_ESSENCE_CAP",
  "SET_MAX_DREAMSIGNS",
  "SET_COMPLETION_LEVEL",
  "SET_DREAMSIGN_POOL",
  "SET_DECK_ENTRY_STAT_OVERRIDE",
  "SET_DECK_ENTRY_KEYWORDS",
  "UPDATE_ATLAS",
  "SET_CARD_SOURCE_DEBUG",
  "REROLL_DREAM_AUGURY",
  "FORCE_DREAM_AUGURY_ARCHETYPE",
  "LOAD_STATE",
  "RESET_QUEST",
]);

/** The three run fields the nullability invariant protects. */
const RUN_FIELDS = ["draftState", "resolvedPackage", "dreamcaller"] as const;

// ---------------------------------------------------------------------------
// Seeded random event generator (non-debug quest event union)
// ---------------------------------------------------------------------------

type GeneratedEvent = { type: string; payload: Record<string, unknown> };

/** Pick a random element of `values`. */
function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)];
}

/** A small integer in `[-max, max]`. */
function smallInt(rng: () => number, max: number): number {
  return Math.floor((rng() - 0.5) * 2 * max);
}

const SITE_IDS = ["draft-site-1", "site-a", "site-b", "unknown-site"] as const;
const NODE_IDS = ["node-start", "node-a", "node-b"] as const;
const SITE_TYPES = ["Shop", "Draft", "DreamMerchant", "Battle"] as const;

/**
 * Occasionally corrupt a payload field to a wrong-typed value so the generator
 * produces the valid/invalid mix that suite (b) exercises (invalid payloads
 * must bounce, never throw).
 */
function maybeCorrupt(
  rng: () => number,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (rng() >= 0.15) return payload;
  const keys = Object.keys(payload);
  if (keys.length === 0) return { junk: {} };
  const key = pick(rng, keys);
  return { ...payload, [key]: pick(rng, [null, "nope", {}, [], NaN]) };
}

/**
 * The non-debug quest event generators. Each maps `(rng) => GeneratedEvent`.
 * Payloads are plausible-but-arbitrary: some resolve and apply, many bounce
 * (unknown ids, no provider wired for the content-coupled cases). Both paths
 * are intended.
 */
const NON_DEBUG_GENERATORS: ReadonlyArray<(rng: () => number) => GeneratedEvent> = [
  // essence & limits (non-debug)
  (rng) => ({ type: "ADJUST_ESSENCE", payload: { delta: smallInt(rng, 3000) } }),
  (rng) => ({ type: "ADJUST_ESSENCE_CAP", payload: { delta: smallInt(rng, 1000) } }),

  // navigation
  (rng) => ({
    type: "SET_SCREEN",
    payload: {
      screen: pick(rng, [
        { type: "atlas" },
        { type: "dreamscape" },
        { type: "questStart" },
        { type: "site", siteId: pick(rng, SITE_IDS) },
        { type: "questComplete" },
      ]),
    },
  }),
  (rng) => ({ type: "TRAVEL_TO_DREAMSCAPE", payload: { nodeId: pick(rng, NODE_IDS) } }),
  (rng) => ({ type: "MARK_SITE_VISITED", payload: { siteId: pick(rng, SITE_IDS) } }),
  () => ({ type: "DISMISS_STARTING_DECK_POPUP", payload: {} }),

  // deck & transfiguration
  (rng) => ({
    type: "ADD_CARD",
    payload: { cardId: `card-${100 + Math.floor(rng() * 20)}` },
  }),
  (rng) => ({ type: "REMOVE_DECK_ENTRY", payload: { entryId: `entry-${Math.floor(rng() * 20)}` } }),
  (rng) => ({
    type: "PURGE_DECK_CARDS",
    payload: { entryIds: [`entry-${Math.floor(rng() * 20)}`] },
  }),
  (rng) => ({ type: "DUPLICATE_DECK_ENTRY", payload: { entryId: `entry-${Math.floor(rng() * 20)}` } }),
  (rng) => ({
    type: "SET_DECK_ENTRY_TYPE",
    payload: { entryId: `entry-${Math.floor(rng() * 20)}`, typeChange: { to: "Event" } },
  }),
  (rng) => ({
    type: "TRANSFIGURE_CARD",
    payload: { entryId: `entry-${Math.floor(rng() * 20)}`, transfiguration: { kind: "x" } },
  }),
  (rng) => ({
    type: "ACCEPT_TRANSFIGURATION_CHOICE",
    payload: { siteId: pick(rng, SITE_IDS), entryId: `entry-${Math.floor(rng() * 20)}` },
  }),
  (rng) => ({
    type: "ACCEPT_DUPLICATION_CHOICE",
    payload: { siteId: pick(rng, SITE_IDS), entryId: `entry-${Math.floor(rng() * 20)}` },
  }),
  () => ({ type: "PURGE_ALL_BANE_CARDS", payload: {} }),
  (rng) => ({ type: "PURGE_RANDOM_BANE_CARDS", payload: { count: Math.floor(rng() * 4) } }),

  // dreamsigns
  (rng) => ({ type: "ADD_DREAMSIGN", payload: { dreamsignId: `ds-${Math.floor(rng() * 1_000_000)}` } }),
  (rng) => ({ type: "REMOVE_DREAMSIGN", payload: { dreamsignId: `ds-${Math.floor(rng() * 1_000_000)}` } }),
  (rng) => ({
    type: "SET_DREAMSIGN_IS_BANE",
    payload: { dreamsignId: `ds-${Math.floor(rng() * 1_000_000)}`, isBane: rng() < 0.5 },
  }),

  // draft (bounces without a DraftContentProvider)
  (rng) => ({
    type: "PICK_DRAFT_CARD",
    payload: { packIndex: Math.floor(rng() * 4), cardId: `card-${100 + Math.floor(rng() * 5)}` },
  }),

  // sites (bounce without a SiteContentProvider / matching runtime)
  (rng) => ({ type: "OPEN_SITE", payload: { siteId: pick(rng, SITE_IDS) } }),
  (rng) => ({ type: "COMPLETE_DREAM_AUGURY", payload: { siteId: pick(rng, SITE_IDS) } }),
  (rng) => ({
    type: "ACCEPT_REWARD",
    payload: { siteId: pick(rng, SITE_IDS), choiceIndex: Math.floor(rng() * 3) },
  }),
  (rng) => ({
    type: "ACCEPT_DREAMSIGN_OFFER",
    payload: { siteId: pick(rng, SITE_IDS), dreamsignId: `ds-${Math.floor(rng() * 1000)}` },
  }),
  (rng) => ({ type: "REJECT_DREAMSIGN_OFFER", payload: { siteId: pick(rng, SITE_IDS) } }),
  (rng) => ({ type: "ACCEPT_ESSENCE", payload: { siteId: pick(rng, SITE_IDS) } }),
  (rng) => ({ type: "COMPLETE_SITE", payload: { siteId: pick(rng, SITE_IDS) } }),

  // shop & merchant
  (rng) => ({ type: "ACCEPT_MERCHANT_OFFER", payload: { siteId: pick(rng, SITE_IDS) } }),
  (rng) => ({ type: "DECLINE_MERCHANT", payload: { siteId: pick(rng, SITE_IDS) } }),
  (rng) => ({
    type: "BUY_SHOP_SLOT",
    payload: { siteId: pick(rng, SITE_IDS), slotIndex: Math.floor(rng() * 4) },
  }),
  (rng) => ({ type: "REROLL_SHOP", payload: { siteId: pick(rng, SITE_IDS) } }),
  (rng) => ({ type: "GRANT_FREE_REROLLS", payload: { count: Math.floor(rng() * 3) } }),
  (rng) => ({ type: "APPLY_SHOP_DISCOUNT", payload: { percent: Math.floor(rng() * 50) } }),

  // modifiers & atlas edits (non-debug)
  (rng) => ({ type: "PUSH_BATTLE_MODIFIER", payload: { modifier: { kind: "x", value: smallInt(rng, 5) } } }),
  () => ({ type: "PUSH_TEMPORARY_BANE_GRANT", payload: { count: 1 } }),
  (rng) => ({
    type: "BAN_SITE_TYPE",
    payload: { siteType: pick(rng, SITE_TYPES), dreamscapesRemaining: Math.floor(rng() * 4) },
  }),
  (rng) => ({
    type: "BOOST_SITE_APPEARANCE",
    payload: {
      siteType: pick(rng, SITE_TYPES),
      percent: Math.floor(rng() * 100),
      dreamscapesRemaining: Math.floor(rng() * 4),
    },
  }),
  (rng) => ({
    type: "REPLACE_SITE_TYPE",
    payload: {
      nodeId: pick(rng, NODE_IDS),
      fromSiteType: pick(rng, SITE_TYPES),
      toSiteType: pick(rng, SITE_TYPES),
    },
  }),
  (rng) => ({
    type: "ADD_SITE_TO_DREAMSCAPE",
    payload: { nodeId: pick(rng, NODE_IDS), siteType: pick(rng, SITE_TYPES) },
  }),

  // battle bridges & CAS-exempt (no quest case → routed to a bounce; here to
  // stress total-fold safety with types outside the quest domain switch)
  (rng) => ({ type: "END_BATTLE", payload: { result: pick(rng, ["victory", "defeat"]) } }),
  () => ({ type: "QUEST_FAILED", payload: { summary: { reason: "x" } } }),
  (rng) => ({ type: "BEGIN_BATTLE", payload: { siteId: pick(rng, SITE_IDS) } }),
  () => ({ type: "SET_CARD_NOTE", payload: { instanceId: "i1", note: "hi" } }),
  (rng) => ({ type: "RESOLVE_PROMPT", payload: { promptId: Math.floor(rng() * 5), resolution: {} } }),

  // pure garbage: unknown type (must bounce, never throw)
  () => ({ type: "NOT_A_REAL_EVENT", payload: { anything: 1 } }),
];

function generateEvent(rng: () => number): GeneratedEvent {
  const gen = pick(rng, NON_DEBUG_GENERATORS);
  const raw = gen(rng);
  return { type: raw.type, payload: maybeCorrupt(rng, raw.payload) };
}

/** Build a committed-event array (seq-ordered) from a seeded PRNG. */
function generateSequence(
  rng: () => number,
  length: number,
): Array<{ seq: number; event: GameEvent }> {
  const events: Array<{ seq: number; event: GameEvent }> = [];
  // seq 1 is reserved for the START_QUEST prefix; tail starts at seq 2.
  for (let index = 0; index < length; index += 1) {
    const seq = index + 2;
    const generated = generateEvent(rng);
    events.push({
      seq,
      event: {
        type: generated.type,
        payload: generated.payload,
        actor: ACTOR,
        clientTimestamp: TIMESTAMP,
        basedOnSeq: seq - 1,
      },
    });
  }
  return events;
}

const START_QUEST_ENTRY: { seq: number; event: GameEvent } = {
  seq: 1,
  event: {
    type: "START_QUEST",
    payload: { dreamcallerId: "dc-1" },
    actor: ACTOR,
    clientTimestamp: TIMESTAMP,
    basedOnSeq: 0,
  },
};

const SEQUENCE_COUNT = 100;
const SEQUENCE_LENGTH = 14;

/** The `SEQUENCE_COUNT` seeded sequences, each `[START_QUEST, ...tail]`. */
function allSequences(): Array<{
  seed: number;
  events: Array<{ seq: number; event: GameEvent }>;
}> {
  const sequences: Array<{
    seed: number;
    events: Array<{ seq: number; event: GameEvent }>;
  }> = [];
  for (let index = 0; index < SEQUENCE_COUNT; index += 1) {
    const seed = 1000 + index;
    const rng = makePrng(seed);
    sequences.push({
      seed,
      events: [START_QUEST_ENTRY, ...generateSequence(rng, SEQUENCE_LENGTH)],
    });
  }
  return sequences;
}

// ---------------------------------------------------------------------------
// Sanity check: the populated start really has non-null run fields
// ---------------------------------------------------------------------------

describe("populated start fixture", () => {
  it("START_QUEST yields non-null dreamcaller / resolvedPackage / draftState", () => {
    const result = foldEvents(
      ENGINE_CONFIG,
      GENESIS,
      { seq: 0, state: genesisFoldState(GENESIS) },
      [START_QUEST_ENTRY],
      { devMode: false },
    );
    expect(result.outcomes[0]?.outcome).toBe("applied");
    for (const field of RUN_FIELDS) {
      expect(result.state.quest[field]).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// (a) Run-field nullability
// ---------------------------------------------------------------------------

describe("(a) run-field nullability", () => {
  it("the generator emits no debug / carve-out event types", () => {
    // Guards the crispness of the invariant below: if a debug event (which MAY
    // legitimately null a run field) ever leaks into the generator, this fails
    // rather than the nullability assertion silently becoming unsound.
    const emitted = new Set<string>();
    const rng = makePrng(424242);
    for (let index = 0; index < 20_000; index += 1) {
      emitted.add(generateEvent(rng).type);
    }
    for (const type of emitted) {
      expect(DEBUG_EVENT_TYPES.has(type)).toBe(false);
    }
  });

  it("no non-debug event transitions a run field non-null → null", () => {
    for (const { events } of allSequences()) {
      // Fold step by step so every intermediate state is inspectable. This is
      // a faithful single-actor fold: basedOnSeq = seq - 1 makes every
      // intervening window empty, and rng is keyed by (seed, seq) exactly as
      // `foldEvents` keys it.
      let state = genesisFoldState(GENESIS);
      for (const { seq, event } of events) {
        const ctx: EventContext = {
          seq,
          rng: eventRng(GENESIS.seed, seq),
          intervening: [],
          timestamp: TIMESTAMP,
        };
        const before = state;
        const result = reduceGameEvent(before, event, ctx);
        state = result.state;
        for (const field of RUN_FIELDS) {
          const wasSet = before.quest[field] != null;
          const nowNull = state.quest[field] == null;
          if (wasSet && nowNull) {
            throw new Error(
              `event ${event.type} (seq ${seq}) nulled run field "${field}" ` +
                `— forbidden for non-debug events`,
            );
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// (b) Total fold safety
// ---------------------------------------------------------------------------

describe("(b) total fold safety", () => {
  it("folds never throw and every outcome is applied | bounced", () => {
    for (const { events } of allSequences()) {
      const result = foldEvents(
        ENGINE_CONFIG,
        GENESIS,
        { seq: 0, state: genesisFoldState(GENESIS) },
        events,
        { devMode: false },
      );
      for (const outcome of result.outcomes) {
        expect(["applied", "bounced"]).toContain(outcome.outcome);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// (c) Determinism
// ---------------------------------------------------------------------------

describe("(c) determinism", () => {
  it("folding a sequence twice yields an identical final hash", () => {
    for (const { events } of allSequences()) {
      const foldOnce = () =>
        foldEvents(
          ENGINE_CONFIG,
          GENESIS,
          { seq: 0, state: genesisFoldState(GENESIS) },
          events,
          { devMode: false },
        ).state;
      expect(hashState(foldOnce())).toBe(hashState(foldOnce()));
    }
  });
});

// ---------------------------------------------------------------------------
// (d) JSON purity
// ---------------------------------------------------------------------------

describe("(d) JSON purity", () => {
  it("final state survives a JSON round-trip with hash equality", () => {
    for (const { events } of allSequences()) {
      const state = foldEvents(
        ENGINE_CONFIG,
        GENESIS,
        { seq: 0, state: genesisFoldState(GENESIS) },
        events,
        { devMode: false },
      ).state;
      const roundTripped = JSON.parse(JSON.stringify(state)) as FoldState;
      expect(hashState(state)).toBe(hashState(roundTripped));
    }
  });
});
