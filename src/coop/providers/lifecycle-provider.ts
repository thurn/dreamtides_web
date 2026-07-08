// Real QuestLifecycleContentProvider: resolves a Dreamcaller's package and
// assembles the full started-run quest state from the loaded content.
//
// The legacy `startQuestFromDreamcaller` is seed-string based (pool generation,
// draft state, and pricing all derive from the run seed), so it is a
// content-lookup + seed pass-through. Its one non-deterministic dependency was
// atlas generation (raw `Math.random`); this adapter closes that hole by
// passing a stream SEEDED from the run seed, so two clients folding the same
// `START_QUEST` build a byte-identical atlas.

import type { QuestContent } from "../../data/quest-content";
import type { ResolvedDreamcallerPackage } from "../../types/content";
import {
  buildDreamcallerPackage,
} from "../../data/quest-content";
import { startQuestFromDreamcaller } from "../../state/quest-state-actions";
import type { QuestLifecycleContentProvider } from "../../rules/quest/lifecycle";
import { seededRngFromString } from "./rng-stream";

export function createQuestLifecycleContentProvider(
  content: QuestContent,
): QuestLifecycleContentProvider {
  const dreamcallerById = new Map(
    content.dreamcallers.map((dreamcaller) => [dreamcaller.id, dreamcaller]),
  );

  return {
    resolveDreamcallerPackage: (
      dreamcallerId,
      seed,
    ): ResolvedDreamcallerPackage | null => {
      const dreamcaller = dreamcallerById.get(dreamcallerId);
      if (dreamcaller === undefined) return null;
      if (content.poolContext === undefined) return null;
      return buildDreamcallerPackage(dreamcaller, content.poolContext, seed);
    },
    startQuest: ({ quest, dreamcallerId, seed }) => {
      const dreamcaller = dreamcallerById.get(dreamcallerId);
      if (dreamcaller === undefined) return null;
      if (content.poolContext === undefined) return null;
      // Seed atlas generation from the run seed so the assembled atlas is
      // identical on every client. `startQuestFromDreamcaller` preserves
      // `quest.seed` because `seedOverride` is passed the run seed.
      return startQuestFromDreamcaller({
        prev: quest,
        dreamcaller,
        questContent: content,
        seedOverride: seed,
        atlasRng: seededRngFromString(`${seed}:atlas`),
      });
    },
  };
}
