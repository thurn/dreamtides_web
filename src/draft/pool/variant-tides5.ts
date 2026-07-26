// The `tides5` variant: the SAME pool-construction algorithm as `tides4`, grown
// from a different corpus. `tides4` bakes its signature / facet / neutral tide
// decks from every usable draft seat; `tides5` bakes the identical kinds of decks
// from ONLY the known-good decklists catalogued in
// `docs/known_good_decklists.json`, discarding every other draft seat. The two
// variants are indistinguishable at runtime — both load a committed tide-deck
// artifact and combine it through {@link combineTidesPool} (join the starter, draw
// a random subset of facets, top up with broad tides, shuffle, and deal — seeding
// the signature tide first so it is guaranteed into the pool). Only the
// data the decks were grown from differs, so any difference between a `tides4` and
// a `tides5` pool is attributable purely to the known-good corpus restriction.
//
// `tides5` reads its committed artifact (`data/tides5.jsonc`, served as
// `/tides5-data.json`) from `poolData.tides5Decks`; the schema is the `tides4`
// schema verbatim. The pool is keyed by cards_v2 UUID; the catalog index
// (`poolData.cardNameById`) gates which UUIDs are dealable.

import type { PoolStrategy } from "./strategy.ts";
import type { Tides5DecksJson } from "./tides5-io.ts";
import {
  missingPoolData,
  type PoolData,
  type VariantResult,
} from "./types.ts";
import { combineTidesPool } from "./variant-tides4.ts";

/**
 * Build a `tides5` pool by combining the committed known-good tide decks exactly
 * as `tides4` does (see {@link combineTidesPool}). Throws when no tide decks are
 * bundled (the bake/setup step did not run).
 */
export function generateTides5(
  rng: () => number,
  poolData: PoolData,
  dreamAvatarId?: string,
): VariantResult {
  const data: Tides5DecksJson | undefined = poolData.tides5Decks;
  if (!data) {
    missingPoolData(
      "tides5",
      "no tide decks are bundled (data/tides5.jsonc, served as /tides5-data.json)",
    );
  }
  return combineTidesPool(rng, poolData, data, dreamAvatarId, "tides5");
}

/** Strategy adapter for the `tides5` algorithm. */
export const tides5Strategy: PoolStrategy = {
  id: "tides5",
  description:
    "Combine preconstructed tides into a pool exactly as tides4 does — the " +
    "DreamAvatar's signature tide plus a random subset of its theme (facet) tides, " +
    "topped up with broad tides — but grown only from the known-good decklists, " +
    "discarding every other draft seat.",
  generate: ({ rng, poolData, dreamAvatarId }) =>
    generateTides5(rng, poolData, dreamAvatarId),
};
