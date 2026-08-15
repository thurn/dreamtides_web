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
import type { CardId } from "../../types/card-identity";
import { parseCardId } from "../../types/card-identity";
import type {
  DreamAvatarId,
  IdentityRecord,
  TideId,
} from "../../types/identifiers";
import {
  parseDreamAvatarId,
  parseTideId,
} from "../../types/identifiers";

/** One card entry in a committed tide deck. */
export interface TideDeckCardJson {
  id: CardId;
  copies: number;
}

/** The role a tide plays in pool construction. */
export type Tides4Role = "signature" | "facet" | "neutral";

/** One preconstructed `tides4` deck. */
export interface Tides4DeckJson {
  /** Stable UUIDv4 tide identity. */
  id: TideId;
  /** Player-facing narrative label. */
  displayName: string;
  /** Localized grammatical reference used by Augury package offers. */
  auguryPackageReference: string;
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
  starter: TideId | null;
  /** Facet tide ids a random subset is drawn from each run (at least one). */
  facets: TideId[];
  /** Broad tail tide ids, joined as needed to top the pool up to full size. */
  neutral: TideId[];
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
  tidePoolByDreamAvatar: IdentityRecord<
    DreamAvatarId,
    Tides4DreamAvatarPool
  >;
}

function fail(detail: string): never {
  throw new Error(`tides4 artifact is malformed: ${detail}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseKnownTideId(
  value: unknown,
  knownIds: ReadonlySet<TideId>,
  detail: string,
): TideId {
  let tideId: TideId;
  try {
    tideId = parseTideId(value);
  } catch {
    return fail(detail);
  }
  if (!knownIds.has(tideId)) return fail(detail);
  return tideId;
}

/**
 * Validate a parsed `/tides4-data.json` payload and return it typed. Throws on
 * any structural problem (missing fields, an unknown role, duplicate tide ids, a
 * tide-pool id that names no tide, an empty facet list) so a bad or stale bake
 * fails loudly at load time instead of producing a quietly wrong pool.
 */
export function validateTides4Decks(json: unknown): Tides4DecksJson {
  if (!isRecord(json)) fail("not an object");
  if (json["version"] !== 2) fail("unsupported `version`");
  const rawSelection = json["selection"];
  if (
    !isRecord(rawSelection) ||
    typeof rawSelection["bandFraction"] !== "number" ||
    !Number.isFinite(rawSelection["bandFraction"]) ||
    rawSelection["bandFraction"] <= 0 ||
    rawSelection["bandFraction"] > 1 ||
    !Number.isInteger(rawSelection["bandMinimum"]) ||
    typeof rawSelection["bandMinimum"] !== "number" ||
    rawSelection["bandMinimum"] <= 0
  ) fail("invalid unified `selection` tuning");
  const rawTides = json["tides"];
  if (!Array.isArray(rawTides) || rawTides.length === 0) {
    fail("missing non-empty `tides` array");
  }
  const ids = new Set<TideId>();
  const tides: Tides4DeckJson[] = rawTides.map((rawTide) => {
    if (!isRecord(rawTide)) return fail("tide is not an object");
    let id: TideId;
    try {
      id = parseTideId(rawTide["id"]);
    } catch {
      return fail("tide without a valid UUID id");
    }
    if (ids.has(id)) fail(`duplicate tide id "${id}"`);
    ids.add(id);
    const displayName = rawTide["displayName"];
    if (typeof displayName !== "string") {
      return fail(`tide "${id}" without a display name`);
    }
    const auguryPackageReference = rawTide["auguryPackageReference"];
    if (
      typeof auguryPackageReference !== "string" ||
      auguryPackageReference.trim() === ""
    ) {
      return fail(`tide "${id}" without an Augury package reference`);
    }
    const displayDescription = rawTide["displayDescription"];
    if (typeof displayDescription !== "string") {
      return fail(`tide "${id}" without a display description`);
    }
    const role = rawTide["role"];
    if (
      role !== "signature" &&
      role !== "facet" &&
      role !== "neutral"
    ) {
      return fail(`tide "${id}" has an unknown role "${String(role)}"`);
    }
    const resonance = rawTide["resonance"];
    if (!isResonance(resonance)) {
      return fail(
        `tide "${id}" has an unknown resonance "${String(resonance)}"`,
      );
    }
    const rawCards = rawTide["cards"];
    if (!Array.isArray(rawCards) || rawCards.length === 0) {
      return fail(`tide "${id}" without cards`);
    }
    const cards: TideDeckCardJson[] = rawCards.map((rawCard) => {
      if (!isRecord(rawCard)) {
        return fail(`tide "${id}" has a non-object card`);
      }
      let cardId: CardId;
      try {
        cardId = parseCardId(rawCard["id"]);
      } catch {
        return fail(`tide "${id}" has a card without a UUID`);
      }
      const copies = rawCard["copies"];
      if (
        typeof copies !== "number" ||
        !Number.isInteger(copies) ||
        copies < 1
      ) {
        return fail(`tide "${id}" card "${cardId}" has invalid copies`);
      }
      return { id: cardId, copies };
    });
    return {
      id,
      displayName,
      auguryPackageReference,
      displayDescription,
      resonance,
      role,
      cards,
    };
  });
  const rawPools = json["tidePoolByDreamAvatar"];
  if (!isRecord(rawPools)) {
    fail("missing `tidePoolByDreamAvatar` object");
  }
  const tidePoolByDreamAvatar: IdentityRecord<
    DreamAvatarId,
    Tides4DreamAvatarPool
  > = {};
  for (const [rawDreamAvatarId, rawEntry] of Object.entries(rawPools)) {
    let dreamAvatarId: DreamAvatarId;
    try {
      dreamAvatarId = parseDreamAvatarId(rawDreamAvatarId);
    } catch {
      return fail(`tide pool key "${rawDreamAvatarId}" is not a DreamAvatar UUID`);
    }
    if (!isRecord(rawEntry)) {
      return fail(`tide pool for "${dreamAvatarId}" is not an object`);
    }
    // `starter` is the only optional/nullable id: a signatureless DreamAvatar has
    // none. A non-null starter must name a tide.
    const starter =
      rawEntry["starter"] === null
        ? null
        : parseKnownTideId(
            rawEntry["starter"],
            ids,
            `tide pool for "${dreamAvatarId}" has an unknown \`starter\``,
          );
    // `facets` is the variety engine and must be non-empty; `neutral` may be empty
    // when a DreamAvatar's facets alone can already fill a pool.
    const rawFacets = rawEntry["facets"];
    if (!Array.isArray(rawFacets) || rawFacets.length === 0) {
      return fail(`tide pool for "${dreamAvatarId}" has no \`facets\``);
    }
    const rawNeutral = rawEntry["neutral"];
    if (!Array.isArray(rawNeutral)) {
      return fail(
        `tide pool for "${dreamAvatarId}" has a non-array \`neutral\``,
      );
    }
    const parsePoolIds = (values: readonly unknown[], key: "facets" | "neutral") =>
      values.map((value) =>
        parseKnownTideId(
          value,
          ids,
          `tide "${String(value)}" in "${dreamAvatarId}".${key} names no tide`,
        ),
      );
    tidePoolByDreamAvatar[dreamAvatarId] = {
      starter,
      facets: parsePoolIds(rawFacets, "facets"),
      neutral: parsePoolIds(rawNeutral, "neutral"),
    };
  }
  return {
    version: 2,
    selection: {
      bandFraction: rawSelection["bandFraction"],
      bandMinimum: rawSelection["bandMinimum"],
    },
    tides,
    tidePoolByDreamAvatar,
  };
}
