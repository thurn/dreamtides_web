// Real JourneyLifecycleContentProvider: resolves a DreamAvatar's package and
// assembles the full started-run journey state from the loaded content.
//
// The legacy `startJourneyFromDreamAvatar` is seed-string based (pool generation,
// draft state, and pricing all derive from the run seed), so it is a
// content-lookup + seed pass-through. Its one non-deterministic dependency was
// atlas generation (raw `Math.random`); this adapter closes that hole by
// passing a stream SEEDED from the run seed, so two clients folding the same
// `START_JOURNEY` build a byte-identical atlas.

import type { JourneyContent } from "../../data/journey-content";
import type { ResolvedDreamAvatarPackage } from "../../types/content";
import {
  buildDreamAvatarPackage,
} from "../../data/journey-content";
import { buildTutorialJourneyPackage } from "../../data/tutorial-journey-package";
import { startJourneyFromDreamAvatar } from "../../state/journey-state-actions";
import type { JourneyLifecycleContentProvider } from "../../rules/journey/lifecycle";
import { seededRngFromString } from "./rng-stream";

export function createJourneyLifecycleContentProvider(
  content: JourneyContent,
): JourneyLifecycleContentProvider {
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
    startJourney: ({ journey, dreamAvatarId, seed }) => {
      const dreamAvatar = dreamAvatarById.get(dreamAvatarId);
      if (dreamAvatar === undefined) return null;
      if (content.poolContext === undefined) return null;
      const tutorialJourneyPool = content.tutorialJourneyPool;
      const isTutorialJourney =
        journey.screen.type === "journeyStart" &&
        journey.screen.tutorialDreamAvatarId === dreamAvatarId &&
        tutorialJourneyPool?.dreamAvatarId === dreamAvatarId;
      const resolvedPackageOverride = isTutorialJourney
        ? buildTutorialJourneyPackage(
            dreamAvatar,
            content.poolContext,
            tutorialJourneyPool,
          )
        : undefined;
      // Seed atlas generation from the run seed so the assembled atlas is
      // identical on every client. `startJourneyFromDreamAvatar` preserves
      // `journey.seed` because `seedOverride` is passed the run seed.
      return startJourneyFromDreamAvatar({
        prev: journey,
        dreamAvatar,
        journeyContent: content,
        seedOverride: seed,
        atlasRng: seededRngFromString(`${seed}:atlas`),
        resolvedPackageOverride,
      });
    },
  };
}
