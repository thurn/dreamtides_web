// Schema and validation for the committed `tides3` artifact (`data/tides3.jsonc`,
// served as `/tides3-data.json`), the single input the `tides3` pool variant
// combines into draft pools. `tides3` is the human-legible counterpart of
// `sigseed`: where `sigseed` grows each pool live from a Dreamcaller's signature
// cards through the pick-affinity corpus, `tides3` bakes that growth offline into
// 32 preconstructed decks ("tides") a player can go read, and a quest combines a
// few of them into the pool.
//
// The artifact carries both halves of the algorithm so it is self-contained
// (no separate relationships file):
//   * `tides` — the 32 decklists. Each tide has a `role`: a `signature` tide is
//     one signatured Dreamcaller's full-signature `sigseed` pool baked as a deck;
//     a `neutral` tide is a broad, format-spanning deck used as the generic tail
//     of a pool and as the body of a neutral Dreamcaller's pool.
//   * `tidePoolByDreamcaller` — per Dreamcaller UUID, the tides a pool combines,
//     split into `leads` and `fill`. One lead is drawn at random per run and
//     always joined; the fill tides are shuffled and joined until the pool is
//     full. A signatured Dreamcaller has a single lead (its own signature tide);
//     a neutral Dreamcaller has many lead candidates — the signature tides, which
//     are the format's coherent archetypes — so each run leans toward a random
//     one, the way `sigseed` falls back to a coherent, randomly-themed
//     `pickcohere` pool for a signatureless Dreamcaller. Every Dreamcaller has an
//     entry.
//
// Cards are keyed by their stable cards_v2 UUID; the `name` fields are
// informational, refreshed at bake time, so a card rename never invalidates the
// artifact. The whole file is baked by `scripts/bake-tides3.mjs`; because the
// per-Dreamcaller pools reference tide ids, re-baking (which can change tide ids
// or contents) is validated against the baked tide set, and a dangling id is a
// hard error so a stale combination cannot ship silently. Pure and
// dependency-free so the bake script, the metric harnesses, the unit tests, and
// the browser loader all share one implementation.

import type { TideDeckCardJson } from "./tides-io.ts";

/** The role a tide plays in pool construction. */
export type Tides3Role = "signature" | "neutral";

/** One preconstructed `tides3` deck. */
export interface Tides3DeckJson {
  /** Stable tide id, e.g. "tide-sig-01" / "tide-neu-01". */
  id: string;
  /** Human-readable tide name (its most distinctive cards, or its Dreamcaller). */
  name: string;
  /** Whether this is a signatured Dreamcaller's tide or a broad neutral tide. */
  role: Tides3Role;
  /** The decklist as UUID + copies entries. */
  cards: TideDeckCardJson[];
}

/**
 * The tides one Dreamcaller's pool combines. One of `leads` is drawn at random
 * each run and always joined; `fill` is shuffled and joined until the pool is
 * full. A signatured Dreamcaller has one lead (its own signature tide); a neutral
 * Dreamcaller has many lead candidates (the signature tides as coherent
 * archetypes) so each run leans toward a random one.
 */
export interface Tides3DreamcallerPool {
  /** Candidate lead tides; one is drawn at random per run (at least one). */
  leads: string[];
  /** Tail tides, shuffled and joined until the pool is full (at least one). */
  fill: string[];
}

/** The committed `tides3` artifact (`data/tides3.jsonc`). */
export interface Tides3DecksJson {
  version: number;
  /** All 32 tide decks. */
  tides: Tides3DeckJson[];
  /**
   * Per Dreamcaller UUID: the leads and fill its pool combines. Every Dreamcaller
   * has an entry; every id in it names a tide in {@link tides}.
   */
  tidePoolByDreamcaller: Record<string, Tides3DreamcallerPool>;
}

function fail(detail: string): never {
  throw new Error(`tides3 artifact is malformed: ${detail}.`);
}

/**
 * Validate a parsed `/tides3-data.json` payload and return it typed. Throws on
 * any structural problem (missing fields, an unknown role, duplicate tide ids, a
 * tide-pool id that names no tide, an empty tide pool) so a bad or stale bake
 * fails loudly at load time instead of producing a quietly wrong pool.
 */
export function validateTides3Decks(json: unknown): Tides3DecksJson {
  if (typeof json !== "object" || json === null) fail("not an object");
  const data = json as Partial<Tides3DecksJson>;
  if (typeof data.version !== "number") fail("missing numeric `version`");
  if (!Array.isArray(data.tides) || data.tides.length === 0) {
    fail("missing non-empty `tides` array");
  }
  const ids = new Set<string>();
  for (const tide of data.tides) {
    if (typeof tide !== "object" || tide === null) fail("tide is not an object");
    if (typeof tide.id !== "string" || tide.id === "") fail("tide without an id");
    if (ids.has(tide.id)) fail(`duplicate tide id "${tide.id}"`);
    ids.add(tide.id);
    if (typeof tide.name !== "string") fail(`tide "${tide.id}" without a name`);
    if (tide.role !== "signature" && tide.role !== "neutral") {
      fail(`tide "${tide.id}" has an unknown role "${String(tide.role)}"`);
    }
    if (!Array.isArray(tide.cards) || tide.cards.length === 0) {
      fail(`tide "${tide.id}" without cards`);
    }
    for (const card of tide.cards) {
      if (typeof card !== "object" || card === null) {
        fail(`tide "${tide.id}" has a non-object card`);
      }
      if (typeof card.id !== "string" || card.id === "") {
        fail(`tide "${tide.id}" has a card without a UUID`);
      }
      if (typeof card.name !== "string") {
        fail(`tide "${tide.id}" card "${card.id}" has no name`);
      }
      if (typeof card.copies !== "number" || card.copies < 1) {
        fail(`tide "${tide.id}" card "${card.id}" has invalid copies`);
      }
    }
  }
  const pools = data.tidePoolByDreamcaller;
  if (typeof pools !== "object" || pools === null || Array.isArray(pools)) {
    fail("missing `tidePoolByDreamcaller` object");
  }
  for (const [dreamcallerId, entry] of Object.entries(pools)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      fail(`tide pool for "${dreamcallerId}" is not an object`);
    }
    for (const key of ["leads", "fill"] as const) {
      const list = entry[key];
      if (!Array.isArray(list) || list.length === 0) {
        fail(`tide pool for "${dreamcallerId}" has no \`${key}\``);
      }
      for (const tideId of list) {
        if (typeof tideId !== "string" || !ids.has(tideId)) {
          fail(`tide "${String(tideId)}" in "${dreamcallerId}".${key} names no tide`);
        }
      }
    }
  }
  return data as Tides3DecksJson;
}
