// Schema and validation for the committed `tides4` artifact (`data/tides4.jsonc`,
// served as `/tides4-data.json`), the single input the `tides4` pool variant
// combines into draft pools. `tides4` is the human-legible counterpart of
// `sigseed`, built to reproduce the run-to-run VARIETY `sigseed` gets from
// growing each pool from a fresh random SUBSET of a Dreamcaller's signature
// cards. Where `tides3` bakes only the deterministic centre of that variety (one
// all-signatures pool per Dreamcaller) and so produces nearly the same pool every
// run, `tides4` bakes the AXES of the variety as separate decks and recombines a
// random few of them per run, the way `sigseed` recombines a random subset of
// signature anchors.
//
// The artifact carries both halves of the algorithm so it is self-contained:
//   * `tides` — the preconstructed decklists. Each tide has a `role`:
//       - a `signature` tide is one signatured Dreamcaller's signature cards
//         themselves (the always-included identity floor for its pool);
//       - a `facet` tide is a single-anchor `sigseed` pool — the coherent "lean"
//         one signature-region card grows into — and is the variety engine: a
//         pool draws a random few of a Dreamcaller's facets, so different runs
//         lean its identity different ways, exactly as `sigseed`'s subset draw
//         does;
//       - a `neutral` tide is a broad, format-spanning deck used as the generic
//         tail of a pool and as the body of a signatureless Dreamcaller's pool.
//   * `tidePoolByDreamcaller` — per Dreamcaller UUID, the tides a pool combines:
//     a `starter` (its signature tide, or null for a signatureless Dreamcaller,
//     always joined when present), `facets` (the on-identity facet tides a random
//     subset is drawn from each run), and `neutral` (the broad tail tides joined
//     to top the pool up to full size). Every Dreamcaller has an entry.
//
// Cards are keyed by their stable cards_v2 UUID; the `name` fields are
// informational, refreshed at bake time, so a card rename never invalidates the
// artifact. The whole file is baked by `scripts/bake-tides4.mjs`; because the
// per-Dreamcaller pools reference tide ids, a dangling id is a hard error so a
// stale combination cannot ship silently. Pure and dependency-free so the bake
// script, the metric harnesses, the unit tests, and the browser loader all share
// one implementation.

import type { TideDeckCardJson } from "./tides-io.ts";

/** The role a tide plays in pool construction. */
export type Tides4Role = "signature" | "facet" | "neutral";

/** The deck color a tide's mechanical identity belongs to. */
export type Tides4Color = "purple" | "green" | "yellow" | "blue" | "red";

/** Every valid {@link Tides4Color}, for validation. */
export const TIDES4_COLORS: readonly Tides4Color[] = [
  "purple",
  "green",
  "yellow",
  "blue",
  "red",
];

/** One preconstructed `tides4` deck. */
export interface Tides4DeckJson {
  /** Stable tide id, e.g. "tide-sig-01" / "tide-fac-01" / "tide-neu-01". */
  id: string;
  /** Human-readable tide name (its Dreamcaller, its lean card, or its breadth). */
  name: string;
  /**
   * A short hand-authored label (1-3 words) for the mechanical identity the tide
   * expresses, e.g. "Sacrifice Aggro" or "Spell Tempo". Present once the tide has
   * been annotated; preserved across bakes by stable id.
   */
  shortName?: string;
  /**
   * A narrative, thematic name (not literal game terms) shown for the tide on the
   * player-facing Dreamcaller select, pool viewer, and "why this card" screens.
   * Present once annotated; preserved across bakes by stable id.
   */
  displayName?: string;
  /**
   * A 10-20 word player-facing description of what makes the tide distinctive,
   * free of card, Dreamcaller, and tide names. Shown in the hover popovers on the
   * player-facing tide screens; preserved across bakes by stable id.
   */
  displayDescription?: string;
  /** A one-sentence summary of what the tide does and how it differs from peers. */
  summary?: string;
  /** A one-paragraph description of the tide's structure, engine, and contrasts. */
  description?: string;
  /**
   * The deck color this tide's mechanical identity belongs to. Every tide is
   * annotated with one; preserved across bakes by stable id. A tide without a
   * valid color is rejected by {@link validateTides4Decks}.
   */
  color: Tides4Color;
  /** Whether this is a signature floor, a directional facet, or a broad tide. */
  role: Tides4Role;
  /** The decklist as UUID + copies entries. */
  cards: TideDeckCardJson[];
}

/**
 * The tides one Dreamcaller's pool combines. The `starter` (when present) is
 * always joined; a random SUBSET of `facets` is drawn each run (the variety
 * engine); `neutral` tides are joined as needed to top the pool up to full size.
 * A signatured Dreamcaller has a `starter` (its signature tide) and on-identity
 * `facets`; a signatureless Dreamcaller has a null `starter` and draws its subset
 * from the broad set of `facets`.
 */
export interface Tides4DreamcallerPool {
  /** The always-joined signature tide id, or null for a signatureless Dreamcaller. */
  starter: string | null;
  /** Facet tide ids a random subset is drawn from each run (at least one). */
  facets: string[];
  /** Broad tail tide ids, joined as needed to top the pool up to full size. */
  neutral: string[];
}

/** The committed `tides4` artifact (`data/tides4.jsonc`). */
export interface Tides4DecksJson {
  version: number;
  /** All tide decks (signature floors, directional facets, broad neutrals). */
  tides: Tides4DeckJson[];
  /**
   * Per Dreamcaller UUID: the starter, facets, and neutral tides its pool
   * combines. Every Dreamcaller has an entry; every id in it names a tide in
   * {@link tides}.
   */
  tidePoolByDreamcaller: Record<string, Tides4DreamcallerPool>;
}

function fail(detail: string): never {
  throw new Error(`tides4 artifact is malformed: ${detail}.`);
}

/**
 * Validate a parsed `/tides4-data.json` payload and return it typed. Throws on
 * any structural problem (missing fields, an unknown role, duplicate tide ids, a
 * tide-pool id that names no tide, an empty facet list) so a bad or stale bake
 * fails loudly at load time instead of producing a quietly wrong pool.
 */
export function validateTides4Decks(json: unknown): Tides4DecksJson {
  if (typeof json !== "object" || json === null) fail("not an object");
  const data = json as Partial<Tides4DecksJson>;
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
    if (
      tide.role !== "signature" &&
      tide.role !== "facet" &&
      tide.role !== "neutral"
    ) {
      fail(`tide "${tide.id}" has an unknown role "${String(tide.role)}"`);
    }
    if (!TIDES4_COLORS.includes(tide.color)) {
      fail(`tide "${tide.id}" has an unknown color "${String(tide.color)}"`);
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
    const known = (tideId: unknown): boolean =>
      typeof tideId === "string" && ids.has(tideId);
    // `starter` is the only optional/nullable id: a signatureless Dreamcaller has
    // none. A non-null starter must name a tide.
    if (entry.starter !== null && !known(entry.starter)) {
      fail(`tide pool for "${dreamcallerId}" has an unknown \`starter\``);
    }
    // `facets` is the variety engine and must be non-empty; `neutral` may be empty
    // when a Dreamcaller's facets alone can already fill a pool.
    if (!Array.isArray(entry.facets) || entry.facets.length === 0) {
      fail(`tide pool for "${dreamcallerId}" has no \`facets\``);
    }
    if (!Array.isArray(entry.neutral)) {
      fail(`tide pool for "${dreamcallerId}" has a non-array \`neutral\``);
    }
    for (const key of ["facets", "neutral"] as const) {
      for (const tideId of entry[key]) {
        if (!known(tideId)) {
          fail(`tide "${String(tideId)}" in "${dreamcallerId}".${key} names no tide`);
        }
      }
    }
  }
  return data as Tides4DecksJson;
}
