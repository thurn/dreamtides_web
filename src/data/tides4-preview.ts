// The Avatar Select screen previews, under each offered Avatar, the
// exact `tides4` tides its draft pool will be dealt from. The draft pool for a
// Avatar is built deterministically from the run seed and the Avatar
// id (see `generateAvatarPool`): it seeds an RNG with
// `hashStringToSeed(`${journeySeed}:${avatar.id}`)` and runs `generateTides4`,
// whose `selected` labels are `["tides4", ...tideDeckIds]`. Reproducing that same
// seed and call here yields the same tide ids, so the preview is the real pool's
// tide list, not an approximation — as long as the screen passes the same
// `journeySeed` to `startJourney` that it previewed with.

import { makeRng } from "../draft/pool/rng.ts";
import type { Tides4DeckJson } from "../draft/pool/tides4-io.ts";
import { generateTides4 } from "../draft/pool/variant-tides4.ts";
import type { AvatarContent } from "../types/content.ts";
import type { JourneySeed } from "../types/journey-seed.ts";
import { hashStringToSeed, type RunPoolContext } from "./journey-content.ts";

/**
 * The ordered tide decks the `tides4` draft pool for `avatar` will be dealt
 * from under run seed `journeySeed`, in join order (the always-included starter
 * tide, the random facet subset, then any neutral fill). Returns an empty array
 * when the run is not a `tides4` run or its tide artifact has not been loaded, so
 * callers can simply omit the preview in that case.
 */
export function selectedTides4Decks(
  poolContext: RunPoolContext | undefined,
  avatar: AvatarContent,
  journeySeed: JourneySeed,
): Tides4DeckJson[] {
  if (poolContext === undefined) return [];
  if (poolContext.poolVariant !== "tides4") return [];
  const decks = poolContext.poolData.tides4Decks;
  if (decks === undefined) return [];

  const rng = makeRng(hashStringToSeed(`${journeySeed}:${avatar.id}`));
  const result = generateTides4(
    rng,
    poolContext.poolData,
    avatar.id,
    poolContext.tides4Tuning,
  );
  const tideById = new Map(decks.tides.map((tide) => [tide.id, tide]));
  const selected: Tides4DeckJson[] = [];
  for (const id of result.tideDeckIds) {
    const tide = tideById.get(id);
    if (tide !== undefined) selected.push(tide);
  }
  return selected;
}
