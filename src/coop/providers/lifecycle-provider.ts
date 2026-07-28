// Real QuestLifecycleContentProvider: resolves a DreamAvatar's package and
// assembles the full started-run quest state from the loaded content.
//
// The legacy `startQuestFromDreamAvatar` is seed-string based (pool generation,
// draft state, and pricing all derive from the run seed), so it is a
// content-lookup + seed pass-through. Its one non-deterministic dependency was
// atlas generation (raw `Math.random`); this adapter closes that hole by
// passing a stream SEEDED from the run seed, so two clients folding the same
// `START_QUEST` build a byte-identical atlas.

import type { QuestContent } from "../../data/quest-content";
import type { ResolvedDreamAvatarPackage } from "../../types/content";
import {
  buildDreamAvatarPackage,
} from "../../data/quest-content";
import { buildTutorialQuestPackage } from "../../data/tutorial-quest-package";
import { startQuestFromDreamAvatar } from "../../state/quest-state-actions";
import type { QuestLifecycleContentProvider } from "../../rules/quest/lifecycle";
import { seededRngFromString } from "./rng-stream";

export function createQuestLifecycleContentProvider(
  content: QuestContent,
): QuestLifecycleContentProvider {
  const dreamAvatarById = new Map(
    content.dreamAvatars.map((dreamAvatar) => [dreamAvatar.id, dreamAvatar]),
  );

  return {
    resolveDreamAvatarPackage: (
      dreamAvatarId,
      seed,
    ): ResolvedDreamAvatarPackage | null => {
      const dreamAvatar = dreamAvatarById.get(dreamAvatarId);
      if (dreamAvatar === undefined) return null;
      if (content.poolContext === undefined) return null;
      return buildDreamAvatarPackage(dreamAvatar, content.poolContext, seed);
    },
    startQuest: ({ quest, dreamAvatarId, seed }) => {
      const dreamAvatar = dreamAvatarById.get(dreamAvatarId);
      if (dreamAvatar === undefined) return null;
      if (content.poolContext === undefined) return null;
      const tutorialQuestPool = content.tutorialQuestPool;
      const isTutorialQuest =
        quest.screen.type === "questStart" &&
        quest.screen.tutorialDreamAvatarId === dreamAvatarId &&
        tutorialQuestPool?.dreamAvatarId === dreamAvatarId;
      const resolvedPackageOverride = isTutorialQuest
        ? buildTutorialQuestPackage(
            dreamAvatar,
            content.poolContext,
            tutorialQuestPool,
          )
        : undefined;
      // Seed atlas generation from the run seed so the assembled atlas is
      // identical on every client. `startQuestFromDreamAvatar` preserves
      // `quest.seed` because `seedOverride` is passed the run seed.
      return startQuestFromDreamAvatar({
        prev: quest,
        dreamAvatar,
        questContent: content,
        seedOverride: seed,
        atlasRng: seededRngFromString(`${seed}:atlas`),
        resolvedPackageOverride,
      });
    },
  };
}
