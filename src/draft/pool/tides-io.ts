// Schema and validation for the committed tide-deck artifact
// (`data/tides.jsonc`, served as `/tides-data.json`), the input the `tides`
// pool variant combines into draft pools. The artifact is baked offline by
// `scripts/bake-tides.mjs` from the real decklist corpus and is the
// player-facing contract of the algorithm: 32 preconstructed decks ("tide
// decks") whose lists a player can go read (`docs/cards2/tide_decklists.md` is
// the generated human-readable rendering of the same data).
//
// Cards are keyed by their stable cards_v2 UUID; the `name` fields are
// informational, refreshed at bake time, so a card rename never invalidates
// the artifact. Pure and dependency-free so the bake script, the similarity
// harness, the unit tests, and the browser loader all share one
// implementation.

/** One card entry in a tide deck: a stable cards_v2 UUID with a copy count. */
export interface TideDeckCardJson {
  /** Stable cards_v2 UUID. */
  id: string;
  /** Informational display name, refreshed at bake time. */
  name: string;
  /** Copies of this card in the tide deck (>= 1). */
  copies: number;
}

/** One preconstructed tide deck. */
export interface TideDeckJson {
  /** Stable tide id, e.g. "tide-07" (or the core tide's id). */
  id: string;
  /** Human-readable tide name, e.g. the cluster's most distinctive cards. */
  name: string;
  /** The decklist as UUID + copies entries. */
  cards: TideDeckCardJson[];
}

/** The committed tide-deck artifact (`data/tides.jsonc`). */
export interface TideDecksJson {
  version: number;
  /**
   * Id of a tide that goes into every pool (a "core" staples deck), when the
   * artifact carries one. The baked artifact is all-archetype tides; the field
   * exists so a hand-authored core deck can be added without a schema change.
   */
  coreTideId?: string;
  /** All 32 tide decks. */
  tides: TideDeckJson[];
  /**
   * Each Dreamcaller's favored tide ids (by Dreamcaller UUID), most similar to
   * its signature first, baked offline the way `idf3` finds its anchors. The
   * runtime draws a subset of these; Dreamcallers without a signature have no
   * entry (or an empty list) and get all-random tides.
   */
  favoredTidesByDreamcaller: Record<string, string[]>;
}

function fail(detail: string): never {
  throw new Error(`Tide-deck artifact is malformed: ${detail}.`);
}

/**
 * Validate a parsed `/tides-data.json` payload and return it typed. Throws on
 * any structural problem (missing fields, unknown core id, duplicate tide ids,
 * favored ids that name no tide) so a bad bake fails loudly at load time
 * instead of producing a quietly wrong pool.
 */
export function validateTideDecks(json: unknown): TideDecksJson {
  if (typeof json !== "object" || json === null) fail("not an object");
  const data = json as Partial<TideDecksJson>;
  if (typeof data.version !== "number") fail("missing numeric `version`");
  if (data.coreTideId !== undefined && typeof data.coreTideId !== "string") {
    fail("`coreTideId` is not a string");
  }
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
  if (data.coreTideId !== undefined && !ids.has(data.coreTideId)) {
    fail(`coreTideId "${data.coreTideId}" names no tide`);
  }
  const favored = data.favoredTidesByDreamcaller;
  if (typeof favored !== "object" || favored === null || Array.isArray(favored)) {
    fail("missing `favoredTidesByDreamcaller` object");
  }
  for (const [dreamcallerId, tideIds] of Object.entries(favored)) {
    if (!Array.isArray(tideIds)) {
      fail(`favored tides for "${dreamcallerId}" is not an array`);
    }
    for (const tideId of tideIds) {
      if (typeof tideId !== "string" || !ids.has(tideId)) {
        fail(
          `favored tide "${String(tideId)}" for "${dreamcallerId}" names no tide`,
        );
      }
      if (tideId === data.coreTideId) {
        fail(`favored tides for "${dreamcallerId}" include the core tide`);
      }
    }
  }
  return data as TideDecksJson;
}
