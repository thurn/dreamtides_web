// Real JourneyLifecycleContentProvider: resolves an Avatar's package and
// assembles the full started-run journey state from the loaded content.
//
// The legacy `startJourneyFromAvatar` is seed-string based (pool generation,
// draft state, and pricing all derive from the run seed), so it is a
// content-lookup + seed pass-through. Its one non-deterministic dependency was
// atlas generation (raw `Math.random`); this adapter closes that hole by
// passing a stream SEEDED from the run seed, so two clients folding the same
// `START_JOURNEY` build a byte-identical atlas.

import type { JourneyContent } from "../../data/journey-content";
import type { ResolvedAvatarPackage } from "../../types/content";
import { buildAvatarPackage } from "../../data/journey-content";
import { buildTutorialJourneyPackage } from "../../data/tutorial-journey-package";
import { startJourneyFromAvatar } from "../../state/journey-state-actions";
import type { JourneyLifecycleContentProvider } from "../../rules/journey/lifecycle";
import { seededJourneyRng } from "./rng-stream";
import { regenerateAtlasForProgress } from "../../atlas/atlas-generator";

export function createJourneyLifecycleContentProvider(
  content: JourneyContent,
): JourneyLifecycleContentProvider {
  const avatarById = new Map(
    content.avatars.map((avatar) => [avatar.id, avatar]),
  );

  return {
    resolveAvatarPackage: (
      avatarId,
      seed,
    ): ResolvedAvatarPackage | null => {
      const avatar = avatarById.get(avatarId);
      if (avatar === undefined) return null;
      if (content.poolContext === undefined) return null;
      return buildAvatarPackage(avatar, content.poolContext, seed);
    },
    startJourney: ({ journey, avatarId, seed }) => {
      const avatar = avatarById.get(avatarId);
      if (avatar === undefined) return null;
      if (content.poolContext === undefined) return null;
      const tutorialJourneyPool = content.tutorialJourneyPool;
      const isTutorialJourney =
        journey.screen.type === "journeyStart" &&
        journey.screen.tutorialAvatarId === avatarId &&
        tutorialJourneyPool?.avatarId === avatarId;
      const resolvedPackageOverride = isTutorialJourney
        ? buildTutorialJourneyPackage(
            avatar,
            content.poolContext,
            tutorialJourneyPool,
            content.cardDatabase,
          )
        : undefined;
      // Seed atlas generation from the run seed so the assembled atlas is
      // identical on every client. `startJourneyFromAvatar` preserves
      // `journey.seed` because `seedOverride` is passed the run seed.
      return startJourneyFromAvatar({
        prev: journey,
        avatar,
        journeyContent: content,
        seedOverride: seed,
        atlasRng: seededJourneyRng(seed, "atlas"),
        resolvedPackageOverride,
        isTutorialJourney,
      });
    },
    regenerateAtlas: ({ journey, completionLevel, rng }) => {
      let drawIndex = 0;
      const atlas = regenerateAtlasForProgress(
        completionLevel,
        {
          ...(journey.dreamscapeModifiers.length === 0
            ? {}
            : { dreamscapeModifiers: journey.dreamscapeModifiers }),
          draftPickCount: content.draftData.offers.picksPerSite,
        },
        {
          dreamscapes: content.dreamscapes,
          atlasData: content.atlasData,
          sitesData: content.sitesData,
          gambleData: content.gambleData,
          dreamsignPoolIds: journey.remainingDreamsignPool,
          apollyonIncarnations: content.apollyonIncarnations,
        },
        {
          logEvents: false,
          rng: () => rng(drawIndex++),
        },
      );
      return {
        ...journey,
        completionLevel,
        atlas,
        currentDreamscape: completionLevel === 0 ? atlas.startingNodeId : null,
        screen:
          completionLevel === 0
            ? { type: "dreamscape" }
            : completionLevel >= 7
              ? { type: "journeyComplete" }
              : { type: "atlas" },
        activeSiteId: null,
        visitedSites: [],
      };
    },
  };
}
