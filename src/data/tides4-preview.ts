// The Dreamcaller Select screen previews, under each offered Dreamcaller, the
// exact `tides4` tides its draft pool will be dealt from. The draft pool for a
// Dreamcaller is built deterministically from the run seed and the Dreamcaller
// id (see `generateDreamcallerPool`): it seeds an RNG with
// `hashStringToSeed(`${questSeed}:${dreamcaller.id}`)` and runs `generateTides4`,
// whose `selected` labels are `["tides4", ...tideDeckIds]`. Reproducing that same
// seed and call here yields the same tide ids, so the preview is the real pool's
// tide list, not an approximation — as long as the screen passes the same
// `questSeed` to `startQuest` that it previewed with.

import { makeRng } from "../draft/pool/rng.ts";
import type { Tides4DeckJson } from "../draft/pool/tides4-io.ts";
import { generateTides4 } from "../draft/pool/variant-tides4.ts";
import type { DreamcallerContent } from "../types/content.ts";
import { hashStringToSeed, type RunPoolContext } from "./quest-content.ts";

/**
 * The ordered tide decks the `tides4` draft pool for `dreamcaller` will be dealt
 * from under run seed `questSeed`, in join order (the always-included starter
 * tide, the random facet subset, then any neutral fill). Returns an empty array
 * when the run is not a `tides4` run or its tide artifact has not been loaded, so
 * callers can simply omit the preview in that case.
 */
export function selectedTides4Decks(
  poolContext: RunPoolContext | undefined,
  dreamcaller: DreamcallerContent,
  questSeed: string,
): Tides4DeckJson[] {
  if (poolContext === undefined) return [];
  if (poolContext.poolVariant !== "tides4") return [];
  const decks = poolContext.poolData.tides4Decks;
  if (decks === undefined) return [];

  const rng = makeRng(hashStringToSeed(`${questSeed}:${dreamcaller.id}`));
  const result = generateTides4(rng, poolContext.poolData, dreamcaller.id);
  // `selected` is `["tides4", ...tideDeckIds]`; drop the leading algorithm label.
  const deckIds = result.selected.slice(1);

  const tideById = new Map(decks.tides.map((tide) => [tide.id, tide]));
  const selected: Tides4DeckJson[] = [];
  for (const id of deckIds) {
    const tide = tideById.get(id);
    if (tide !== undefined) selected.push(tide);
  }
  return selected;
}
