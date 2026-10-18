// Synthetic run fixtures for collection tests: a run slice with an empty or
// small reward bag, and collections built through `acquireForRun`.

import type { CardId } from "../../types/card-identity";
import { parseD97RunId, parseD97RunSeed, type D97RunSeed } from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";
import { acquireForRun, type D97AcquiringRun } from "./acquisition";
import { emptyCollection } from "./collection";
import { createRewardBag, type D97DealtCard } from "./reward-bag";
import type { D97Collection, D97CopyZone } from "./types";

/** A run with no copies whose bag holds `dealt`. */
export function testAcquiringRun(
  dealt: readonly D97DealtCard[] = [],
  runSeed: D97RunSeed = parseD97RunSeed("collection-fixture"),
): D97AcquiringRun {
  return {
    runId: parseD97RunId(`fixture:${runSeed}`),
    runSeed,
    battlesFought: 0,
    collection: emptyCollection(),
    bag: createRewardBag({
      avatarId: testAvatarId("collection-fixture-avatar"),
      dealSeed: 7,
      joinedTideIds: [],
      dealt,
    }),
  };
}

/** A collection holding one starting copy per entry, in entry order. */
export function testCollection(
  entries: readonly (readonly [CardId, D97CopyZone])[],
  runSeed?: D97RunSeed,
): D97Collection {
  let run = testAcquiringRun([], runSeed);
  for (const [cardId, zone] of entries) {
    run = acquireForRun(run, { cardId, zone, channel: "starting", source: "named" }).run;
  }
  return run.collection;
}
