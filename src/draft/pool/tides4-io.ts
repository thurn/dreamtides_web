// Schema and validation for the browser projection of `data/tides.ron` and the
// embedded tide pools in `data/dream_avatars.ron`, served as `/tides4-data.json`. The tides4
// pool algorithm recombines these manually curated decks into a seeded draft pool.
//
// The artifact carries both halves of the algorithm so it is self-contained:
//   * `tides` — the preconstructed decklists. Each tide has a `role`:
//       - a `signature` tide is one signatured DreamAvatar's signature cards
//         themselves (the always-included identity floor for its pool);
//       - a `facet` tide is a coherent lean around one signature-region card and
//         is the variety engine: a
//         pool draws a random few of a DreamAvatar's facets, so different runs
//         lean its identity different ways;
//       - a `neutral` tide is a broad, format-spanning deck used as the generic
//         tail of a pool and as the body of a signatureless DreamAvatar's pool.
//   * `tidePoolByDreamAvatar` — per DreamAvatar UUID, the tides a pool combines:
//     a `starter` (its signature tide, or null for a signatureless DreamAvatar,
//     always joined when present), `facets` (the on-identity facet tides a random
//     subset is drawn from each run), and `neutral` (the broad tail tides joined
//     to top the pool up to full size). Every DreamAvatar has an entry.
//
// Cards and tides are keyed by stable UUID. Display copy is retained only for
// tide labels; card display data resolves from the card catalog at render time.

import { isResonance } from "../../data/resonance-data";
import type { Resonance } from "../../types/resonance-data";

/** One card entry in a committed tide deck. */
export interface TideDeckCardJson {
  id: string;
  copies: number;
}

/** The role a tide plays in pool construction. */
export type Tides4Role = "signature" | "facet" | "neutral";

/** One preconstructed `tides4` deck. */
export interface Tides4DeckJson {
  /** Stable UUIDv4 tide identity. */
  id: string;
  /** Player-facing narrative label. */
  displayName: string;
  /** Player-facing explanation of the tide's mechanical identity. */
  displayDescription: string;
  /**
   * The resonance this tide's mechanical identity belongs to. Every tide is
   * assigned one. A tide without a valid resonance is rejected by
   * {@link validateTides4Decks}.
   */
  resonance: Resonance;
  /** Whether this is a signature floor, a directional facet, or a broad tide. */
  role: Tides4Role;
  /** The decklist as UUID + copies entries. */
  cards: TideDeckCardJson[];
}

/**
 * The tides one DreamAvatar's pool combines. The `starter` (when present) is
 * always joined; a random SUBSET of `facets` is drawn each run (the variety
 * engine); `neutral` tides are joined as needed to top the pool up to full size.
 * A signatured DreamAvatar has a `starter` (its signature tide) and on-identity
 * `facets`; a signatureless DreamAvatar has a null `starter` and draws its subset
 * from the broad set of `facets`.
 */
export interface Tides4DreamAvatarPool {
  /** The always-joined signature tide id, or null for a signatureless DreamAvatar. */
  starter: string | null;
  /** Facet tide ids a random subset is drawn from each run (at least one). */
  facets: string[];
  /** Broad tail tide ids, joined as needed to top the pool up to full size. */
  neutral: string[];
}

/** Browser projection compiled from the canonical tide catalog. */
export interface Tides4DecksJson {
  version: 2;
  /** Universal seeded variety band used by affinity selection. */
  selection: {
    bandFraction: number;
    bandMinimum: number;
  };
  /** All tide decks (signature floors, directional facets, broad neutrals). */
  tides: Tides4DeckJson[];
  /**
   * Per DreamAvatar UUID: the starter, facets, and neutral tides its pool
   * combines. Every DreamAvatar has an entry; every id in it names a tide in
   * {@link tides}.
   */
  tidePoolByDreamAvatar: Record<string, Tides4DreamAvatarPool>;
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
  if (data.version !== 2) fail("unsupported `version`");
  if (
    typeof data.selection?.bandFraction !== "number" ||
    !Number.isFinite(data.selection.bandFraction) ||
    data.selection.bandFraction <= 0 ||
    data.selection.bandFraction > 1 ||
    !Number.isInteger(data.selection.bandMinimum) ||
    data.selection.bandMinimum <= 0
  ) fail("invalid unified `selection` tuning");
  if (!Array.isArray(data.tides) || data.tides.length === 0) {
    fail("missing non-empty `tides` array");
  }
  const ids = new Set<string>();
  for (const tide of data.tides) {
    if (typeof tide !== "object" || tide === null)
      fail("tide is not an object");
    if (typeof tide.id !== "string" || tide.id === "")
      fail("tide without an id");
    if (ids.has(tide.id)) fail(`duplicate tide id "${tide.id}"`);
    ids.add(tide.id);
    if (typeof tide.displayName !== "string") {
      fail(`tide "${tide.id}" without a display name`);
    }
    if (typeof tide.displayDescription !== "string") {
      fail(`tide "${tide.id}" without a display description`);
    }
    if (
      tide.role !== "signature" &&
      tide.role !== "facet" &&
      tide.role !== "neutral"
    ) {
      fail(`tide "${tide.id}" has an unknown role "${String(tide.role)}"`);
    }
    if (!isResonance(tide.resonance)) {
      fail(
        `tide "${tide.id}" has an unknown resonance "${String(tide.resonance)}"`,
      );
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
      if (typeof card.copies !== "number" || card.copies < 1) {
        fail(`tide "${tide.id}" card "${card.id}" has invalid copies`);
      }
    }
  }
  const pools = data.tidePoolByDreamAvatar;
  if (typeof pools !== "object" || pools === null || Array.isArray(pools)) {
    fail("missing `tidePoolByDreamAvatar` object");
  }
  for (const [dreamAvatarId, entry] of Object.entries(pools)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      fail(`tide pool for "${dreamAvatarId}" is not an object`);
    }
    const known = (tideId: unknown): boolean =>
      typeof tideId === "string" && ids.has(tideId);
    // `starter` is the only optional/nullable id: a signatureless DreamAvatar has
    // none. A non-null starter must name a tide.
    if (entry.starter !== null && !known(entry.starter)) {
      fail(`tide pool for "${dreamAvatarId}" has an unknown \`starter\``);
    }
    // `facets` is the variety engine and must be non-empty; `neutral` may be empty
    // when a DreamAvatar's facets alone can already fill a pool.
    if (!Array.isArray(entry.facets) || entry.facets.length === 0) {
      fail(`tide pool for "${dreamAvatarId}" has no \`facets\``);
    }
    if (!Array.isArray(entry.neutral)) {
      fail(`tide pool for "${dreamAvatarId}" has a non-array \`neutral\``);
    }
    for (const key of ["facets", "neutral"] as const) {
      for (const tideId of entry[key]) {
        if (!known(tideId)) {
          fail(
            `tide "${String(tideId)}" in "${dreamAvatarId}".${key} names no tide`,
          );
        }
      }
    }
  }
  return data as Tides4DecksJson;
}
