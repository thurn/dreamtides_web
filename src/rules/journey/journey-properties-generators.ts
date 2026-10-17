import type { GameEvent } from "../../eventlog/types";
import { genesisFoldState } from "../fold-state";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { testAvatarId, testCardId, testDreamsignId } from "../../types/test-identities";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { GENESIS, ACTOR, TIMESTAMP, makePrng, SHOP_SITE_ID, DRAFT_SITE_ID } from "./journey-properties-fixtures";



// ---------------------------------------------------------------------------
// Seeded random event generator (non-debug journey event union)
// ---------------------------------------------------------------------------

type GeneratedEvent = {
  type: GameEvent["type"];
  payload: Record<string, unknown>;
};


/** Pick a random element of `values`. */
function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)];
}


/** A small integer in `[-max, max]`. */
function smallInt(rng: () => number, max: number): number {
  return Math.floor((rng() - 0.5) * 2 * max);
}


const SITE_IDS = [
  DRAFT_SITE_ID,
  SHOP_SITE_ID,
  "site-a",
  "site-b",
  "unknown-site",
] as const;

const NODE_IDS = ["node-start", "node-a", "node-b"] as const;

const SITE_TYPES = ["Shop", "Draft", "Augury", "Battle"] as const;


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
 * The non-debug journey event generators. Each maps `(rng) => GeneratedEvent`.
 * Payloads are plausible-but-arbitrary: some resolve and apply, many bounce
 * (unknown ids, no provider wired for the content-coupled cases). Both paths
 * are intended.
 */
const NON_DEBUG_GENERATORS: ReadonlyArray<
  (rng: () => number) => GeneratedEvent
> = [
  // essence & limits (non-debug)
  (rng) => ({
    type: "ADJUST_ESSENCE",
    payload: { delta: smallInt(rng, 3000) },
  }),

  // navigation
  (rng) => ({
    type: "ENTER_SITE",
    payload: { siteId: parseSiteId(pick(rng, SITE_IDS)) },
  }),
  (rng) => ({
    type: "TRAVEL_TO_DREAMSCAPE",
    payload: { nodeId: parseAtlasNodeId(pick(rng, NODE_IDS)) },
  }),
  () => ({ type: "DISMISS_STARTING_DECK_POPUP", payload: {} }),

  // deck & transfiguration
  (rng) => ({
    type: "ADD_CARD",
    payload: { cardId: testCardId(`card-${100 + Math.floor(rng() * 20)}`) },
  }),
  (rng) => ({
    type: "REMOVE_DECK_ENTRY",
    payload: { entryId: parseDeckEntryId(`entry-${Math.floor(rng() * 20)}`) },
  }),
  (rng) => ({
    type: "PURGE_DECK_CARDS",
    payload: { entryIds: [parseDeckEntryId(`entry-${Math.floor(rng() * 20)}`)] },
  }),
  (rng) => ({
    type: "DUPLICATE_DECK_ENTRY",
    payload: { entryId: parseDeckEntryId(`entry-${Math.floor(rng() * 20)}`) },
  }),
  (rng) => ({
    type: "SET_DECK_ENTRY_TYPE",
    payload: {
      entryId: parseDeckEntryId(`entry-${Math.floor(rng() * 20)}`),
      typeChange: { to: "Event" },
    },
  }),
  (rng) => ({
    type: "TRANSFIGURE_CARD",
    payload: {
      entryId: parseDeckEntryId(`entry-${Math.floor(rng() * 20)}`),
      transfiguration: { kind: "x" },
    },
  }),
  (rng) => ({
    type: "ACCEPT_TRANSFIGURATION_CHOICE",
    payload: {
      siteId: parseSiteId(pick(rng, SITE_IDS)),
      entryId: parseDeckEntryId(`entry-${Math.floor(rng() * 20)}`),
    },
  }),
  (rng) => ({
    type: "ACCEPT_DUPLICATION_CHOICE",
    payload: {
      siteId: parseSiteId(pick(rng, SITE_IDS)),
      entryId: parseDeckEntryId(`entry-${Math.floor(rng() * 20)}`),
    },
  }),
  () => ({ type: "PURGE_ALL_NIGHTMARE_CARDS", payload: {} }),
  (rng) => ({
    type: "PURGE_RANDOM_NIGHTMARE_CARDS",
    payload: { count: Math.floor(rng() * 4) },
  }),

  // dreamsigns
  (rng) => ({
    type: "ADD_DREAMSIGN",
    payload: {
      dreamsignId: testDreamsignId(`ds-${Math.floor(rng() * 1_000_000)}`),
    },
  }),
  (rng) => ({
    type: "REMOVE_DREAMSIGN",
    payload: {
      dreamsignId: testDreamsignId(`ds-${Math.floor(rng() * 1_000_000)}`),
    },
  }),
  // draft — a pick aligned with the start draft's offer ([100,101,102]) so it
  // APPLIES on the first pick (writing draftState); later picks bounce once the
  // offer empties. The engine advances on a clone, so draftState stays non-null.
  (rng) => {
    const idx = Math.floor(rng() * 3);
    return {
      type: "PICK_DRAFT_CARD",
      payload: { packIndex: idx, cardId: testCardId(`card-${100 + idx}`) },
    };
  },
  // draft — a deliberately mismatched pick (exercises the pack-membership bounce)
  (rng) => ({
    type: "PICK_DRAFT_CARD",
    payload: {
      packIndex: Math.floor(rng() * 5),
      cardId: testCardId(`card-${200 + Math.floor(rng() * 5)}`),
    },
  }),

  // sites (bounce without a SiteContentProvider / matching runtime)
  (rng) => ({
    type: "OPEN_SITE",
    payload: {
      siteId: parseSiteId(pick(rng, SITE_IDS)),
      selectionRulesVersion: SELECTION_RULES_VERSION,
    },
  }),
  (rng) => ({
    type: "COMPLETE_AUGURY",
    payload: { siteId: parseSiteId(pick(rng, SITE_IDS)) },
  }),
  (rng) => ({
    type: "ACCEPT_REWARD",
    payload: {
      siteId: parseSiteId(pick(rng, SITE_IDS)),
      choiceIndex: Math.floor(rng() * 3),
    },
  }),
  (rng) => ({
    type: "ACCEPT_DREAMSIGN_OFFER",
    payload: {
      siteId: parseSiteId(pick(rng, SITE_IDS)),
      dreamsignId: testDreamsignId(`ds-${Math.floor(rng() * 1000)}`),
    },
  }),
  (rng) => ({
    type: "REJECT_DREAMSIGN_OFFER",
    payload: { siteId: parseSiteId(pick(rng, SITE_IDS)) },
  }),
  (rng) => ({
    type: "ACCEPT_ESSENCE",
    payload: { siteId: parseSiteId(pick(rng, SITE_IDS)) },
  }),
  (rng) => ({
    type: "COMPLETE_SITE",
    payload: { siteId: parseSiteId(pick(rng, SITE_IDS)) },
  }),

  // shop & augury
  (rng) => ({
    type: "ACCEPT_AUGURY_OFFER",
    payload: { siteId: parseSiteId(pick(rng, SITE_IDS)) },
  }),
  (rng) => ({
    type: "DECLINE_AUGURY",
    payload: { siteId: parseSiteId(pick(rng, SITE_IDS)) },
  }),
  (rng) => ({
    type: "BUY_SHOP_SLOT",
    payload: {
      siteId: parseSiteId(pick(rng, SITE_IDS)),
      slotIndex: Math.floor(rng() * 4),
    },
  }),
  (rng) => ({
    type: "REROLL_SHOP",
    payload: { siteId: parseSiteId(pick(rng, SITE_IDS)) },
  }),
  // REROLL_SHOP aimed at the seeded Shop site so it APPLIES (rewriting
  // draftState from the Site fake's non-null restock) at least once per run,
  // before another action can close it.
  () => ({ type: "REROLL_SHOP", payload: { siteId: parseSiteId(SHOP_SITE_ID) } }),
  (rng) => ({
    type: "GRANT_FREE_REROLLS",
    payload: { count: Math.floor(rng() * 3) },
  }),
  (rng) => ({
    type: "APPLY_SHOP_DISCOUNT",
    payload: { percent: Math.floor(rng() * 50) },
  }),

  // modifiers & atlas edits (non-debug)
  (rng) => ({
    type: "PUSH_BATTLE_MODIFIER",
    payload: { modifier: { kind: "x", value: smallInt(rng, 5) } },
  }),
  () => ({ type: "PUSH_TEMPORARY_NIGHTMARE_GRANT", payload: { count: 1 } }),
  (rng) => ({
    type: "BAN_SITE_TYPE",
    payload: {
      siteType: pick(rng, SITE_TYPES),
      dreamscapesRemaining: Math.floor(rng() * 4),
    },
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
      nodeId: parseAtlasNodeId(pick(rng, NODE_IDS)),
      fromSiteType: pick(rng, SITE_TYPES),
      toSiteType: pick(rng, SITE_TYPES),
    },
  }),
  (rng) => ({
    type: "ADD_SITE_TO_DREAMSCAPE",
    payload: {
      nodeId: parseAtlasNodeId(pick(rng, NODE_IDS)),
      siteType: pick(rng, SITE_TYPES),
    },
  }),

  // battle bridges & prompt-gate-exempt (no journey case → routed to a bounce; here to
  // stress total-fold safety with types outside the journey domain switch)
  () => ({ type: "END_BATTLE", payload: {} }),
  (rng) => ({
    type: "BEGIN_BATTLE",
    payload: { siteId: parseSiteId(pick(rng, SITE_IDS)) },
  }),
  // Battle-slice mutation (applies once a BEGIN_BATTLE has created the slice), so
  // the determinism / JSON-purity / hash properties exercise a live battle fold.
  (rng) => ({
    type: "BATTLE_COMMAND",
    payload: {
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "ADJUST_SCORE",
          side: pick(rng, ["player", "enemy"]),
          amount: smallInt(rng, 5),
        },
      },
    },
  }),
  (rng) => ({
    type: "BATTLE_GESTURE",
    payload: {
      commands: [
        {
          id: "DEBUG_EDIT",
          edit: {
            kind: "ADJUST_SCORE",
            side: "player",
            amount: smallInt(rng, 5),
          },
        },
        {
          id: "DEBUG_EDIT",
          edit: {
            kind: "ADJUST_CURRENT_ENERGY",
            side: "player",
            amount: smallInt(rng, 3),
          },
        },
      ],
    },
  }),
  // Engine intents over the journey battle's engine slice: legal and illegal
  // actions, and answers or cancels of real and stale prompt ids.
  (rng) => ({
    type: "BATTLE_ACTION",
    payload: {
      side: pick(rng, ["player", "enemy"]),
      action: pick(rng, [
        { kind: "pass" },
        { kind: "play", card: `i${String(Math.abs(smallInt(rng, 12)))}`, from: "hand" },
      ]),
    },
  }),
  (rng) => ({
    type: pick(rng, ["BATTLE_ANSWER", "BATTLE_CANCEL"]),
    payload: {
      side: "player",
      promptId: `${String(Math.abs(smallInt(rng, 6)))}:${String(Math.abs(smallInt(rng, 6)))}:0`,
      value: smallInt(rng, 2),
    },
  }),
  (rng) => ({
    type: "RESOLVE_PROMPT",
    payload: { promptId: Math.floor(rng() * 5), resolution: {} },
  }),

  // LOAD_STATE — adversarial snapshots the validator must bounce, preserving
  // the nullability invariant IN-REDUCER rather than via a generator carve-out:
  //   - a structurally valid snapshot with the correct game seed but null run
  //     fields (the genesis journey) — bounced for nulling a non-null run field;
  //   - a snapshot with a foreign seed — bounced by the seed check;
  //   - a malformed snapshot — bounced by the shape check.
  () => ({
    type: "LOAD_STATE",
    payload: { snapshot: genesisFoldState(GENESIS).journey },
  }),
  () => ({
    type: "LOAD_STATE",
    payload: {
      snapshot: { ...genesisFoldState(GENESIS).journey, seed: "foreign-seed" },
    },
  }),
  (rng) => ({
    type: "LOAD_STATE",
    payload: {
      snapshot: pick(rng, [null, "nope", { essence: "not-a-number" }]),
    },
  }),

  // pure garbage: unknown type (must bounce, never throw)
  () => ({ type: "NOT_A_REAL_EVENT", payload: { anything: 1 } }),
];


export function generateEvent(rng: () => number): GeneratedEvent {
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
  // seq 1 is reserved for the START_JOURNEY prefix; tail starts at seq 2.
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
      },
    });
  }
  return events;
}


export const START_JOURNEY_ENTRY: { seq: number; event: GameEvent } = {
  seq: 1,
  event: {
    type: "START_JOURNEY",
    payload: { avatarId: testAvatarId("dc-1") },
    actor: ACTOR,
    clientTimestamp: TIMESTAMP,
  },
};


export const SEQUENCE_COUNT = 100;

const SEQUENCE_LENGTH = 14;


/** The `SEQUENCE_COUNT` seeded sequences, each `[START_JOURNEY, ...tail]`. */
export function allSequences(): Array<{
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
      events: [START_JOURNEY_ENTRY, ...generateSequence(rng, SEQUENCE_LENGTH)],
    });
  }
  return sequences;
}
