// Synthetic fixtures for collection tests: synthetic pinned pools and
// capacity stages (values chosen for the tests, not the production table), a
// run slice over them, and collections built through `acquireForRun`.

import type { D97RewardBagTuning } from "../../content/d97/collection";
import type { CardId } from "../../types/card-identity";
import { parseD97RunId, parseD97RunSeed, type AvatarId, type D97RunSeed, type TideId } from "../../types/identifiers";
import { testAvatarId, testTideId } from "../../types/test-identities";
import { acquireForRun, type D97AcquiringRun } from "./acquisition";
import { emptyCollection } from "./collection";
import { initialRewardBags, type D97RewardBagContent } from "./reward-bag";
import type { D97AvatarPool, D97Collection, D97CopyZone, D97RewardBags } from "./types";

export const FIXTURE_AVATAR = testAvatarId("collection-fixture-avatar");

/** Synthetic capacity stages: ring 1 opens with two copies, ring 2 opens on Act 2. */
export const FIXTURE_BAG_TUNING: D97RewardBagTuning = {
  stages: [
    { stage: 1, opensOn: { kind: "runStart" }, ring1Capacity: 2, ring2Capacity: 0 },
    { stage: 2, opensOn: { kind: "actEntered", act: 2 }, ring1Capacity: 2, ring2Capacity: 1 },
    { stage: 3, opensOn: { kind: "apollyonFalls" }, ring1Capacity: 3, ring2Capacity: 3 },
  ],
};

/** A synthetic pinned pool: its rings as given, every ring card dealt once. */
export function testPool(
  avatarId: AvatarId,
  ring1: readonly CardId[],
  ring2: readonly CardId[] = [],
  tideIds: readonly TideId[] = [testTideId("fixture-signature"), testTideId("fixture-facet")],
): D97AvatarPool {
  return {
    avatarId,
    tideIds,
    ring1: [...ring1].sort(),
    ring2: [...ring2].sort(),
    dealt: [...ring1, ...ring2].map((cardId) => ({ cardId, copies: 1 })),
  };
}

/** Bag content over `pools` and `tuning`. */
export function testBagContent(
  pools: readonly D97AvatarPool[] = [],
  tuning: D97RewardBagTuning = FIXTURE_BAG_TUNING,
): D97RewardBagContent {
  const byAvatar = new Map(pools.map((pool) => [pool.avatarId, pool]));
  return { rewardPool: (avatarId) => byAvatar.get(avatarId) ?? null, rewardBagTuning: tuning };
}

/** A run with no copies, playing `avatarId`, with every bag at run start. */
export function testAcquiringRun(
  options: { readonly avatarId?: AvatarId; readonly bags?: D97RewardBags; readonly runSeed?: D97RunSeed } = {},
): D97AcquiringRun {
  const runSeed = options.runSeed ?? parseD97RunSeed("collection-fixture");
  return {
    runId: parseD97RunId(`fixture:${runSeed}`),
    runSeed,
    battlesFought: 0,
    collection: emptyCollection(),
    avatarId: options.avatarId ?? FIXTURE_AVATAR,
    bags: options.bags ?? initialRewardBags(FIXTURE_BAG_TUNING),
  };
}

/** A collection holding one starting copy per entry, in entry order. */
export function testCollection(
  entries: readonly (readonly [CardId, D97CopyZone])[],
  runSeed?: D97RunSeed,
): D97Collection {
  let run = testAcquiringRun(runSeed === undefined ? {} : { runSeed });
  const content = testBagContent();
  for (const [cardId, zone] of entries) {
    run = acquireForRun(run, { cardId, zone, channel: "starting", source: "named" }, content).run;
  }
  return run.collection;
}
