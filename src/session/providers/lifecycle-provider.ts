// Real JourneyLifecycleContentProvider: resolves an Avatar's package and
// assembles the full started-run journey state from the loaded content.
//
// Run assembly is seed-string based (pool generation, draft state, and pricing
// all derive from the run seed), so it is a content-lookup + seed pass-through.
// Atlas generation draws from a stream SEEDED from the run seed, so two clients
// folding the same `START_JOURNEY` build a byte-identical atlas.

import type { JourneyContent } from "../../data/journey-content";
import type {
  AvatarContent,
  ResolvedAvatarPackage,
} from "../../types/content";
import { buildAvatarPackage } from "../../data/journey-content";
import { buildTutorialJourneyPackage } from "../../data/tutorial-journey-package";
import { toJourneyAvatar } from "../../data/avatar-selection";
import { createInitialDraftState } from "../../draft/draft-engine";
import { deriveEntryIdCounter } from "../../rules/journey/deck";
import type { JourneyLifecycleContentProvider } from "../../rules/journey/lifecycle";
import type { JourneyState } from "../../types/journey";
import type { JourneySeed } from "../../types/journey-seed";
import type { DreamsignId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { seededJourneyRng } from "./rng-stream";
import {
  generateInitialAtlas,
  regenerateAtlasForProgress,
} from "../../atlas/atlas-generator";

/**
 * Assemble the started-run journey state for `avatar`: starter deck, Avatar
 * package, atlas, remaining dreamsign pool, draft state, and opening screen.
 * Deterministic in `(prev, avatar, journeyContent, seed, atlasRng)`; the
 * returned state carries `seed` as its run seed.
 */
export function startJourneyFromAvatar({
  prev,
  avatar,
  journeyContent,
  seed,
  atlasRng,
  resolvedPackageOverride,
  isTutorialJourney = false,
}: {
  prev: JourneyState;
  avatar: AvatarContent;
  journeyContent: JourneyContent;
  /** The run seed every derived generator reads. */
  seed: JourneySeed;
  /** Deterministic `[0, 1)` random source for atlas generation. */
  atlasRng: () => number;
  /** Authored package for flows such as the tutorial journey handoff. */
  resolvedPackageOverride?: ResolvedAvatarPackage;
  /** Marks the assembled run as the authored tutorial journey. */
  isTutorialJourney?: boolean;
}): JourneyState {
  const poolContext = journeyContent.poolContext;
  const resolvedPackage =
    resolvedPackageOverride ??
    buildAvatarPackage(avatar, poolContext, seed);

  const deck = [...prev.deck];
  for (const cardNumber of poolContext.starterCardNumbers) {
    if (deck.some((entry) => entry.cardNumber === cardNumber)) {
      continue;
    }

    deck.push({
      entryId: parseDeckEntryId(
        `deck-${String(deriveEntryIdCounter(deck) + 1)}`,
      ),
      cardNumber,
      transfiguration: null,
      isBane: false,
    });
  }

  const openingDreamsignIds = new Set(
    (resolvedPackage.openingDreamsignOfferIds ?? []).map((id) =>
      id.toLocaleLowerCase(),
    ),
  );
  const atlasDreamsignPoolIds = resolvedPackage.dreamsignPoolIds.filter(
    (id) => !openingDreamsignIds.has(id.toLocaleLowerCase()),
  );
  const atlas = generateInitialAtlas(
    prev.completionLevel,
    {},
    {
      dreamscapes: journeyContent.dreamscapes,
      atlasData: journeyContent.atlasData,
      sitesData: journeyContent.sitesData,
      gambleData: journeyContent.gambleData,
      dreamsignPoolIds: atlasDreamsignPoolIds,
      apollyonIncarnations: journeyContent.apollyonIncarnations,
    },
    { logEvents: false, rng: atlasRng },
  );
  const firstNode = atlas.nodes[atlas.startingNodeId];
  // Known dreamsigns placed on the atlas are drawn from (and removed from) the
  // run dreamsign pool at generation time, so exclude them from the remaining
  // pool offered by sites later in the run.
  const knownDreamsignIds = new Set(
    atlas.knownDreamsignCarrierIds
      .map((id) => atlas.nodes[id]?.knownDreamsignId)
      .filter((id): id is DreamsignId => id !== null && id !== undefined),
  );
  const remainingDreamsignPool = resolvedPackage.dreamsignPoolIds.filter(
    (id) => !knownDreamsignIds.has(id),
  );

  const draftState = createInitialDraftState(
    journeyContent.cardDatabase,
    resolvedPackage,
  );

  return {
    ...prev,
    seed,
    isTutorialJourney,
    essence: avatar.startingEssence,
    maxDreamsigns: journeyContent.economyData.journey.dreamsignCap,
    deck,
    avatar: toJourneyAvatar(avatar),
    resolvedPackage,
    remainingDreamsignPool,
    draftState,
    atlas,
    currentDreamscape: firstNode.id,
    screen: { type: "dreamscape" },
  };
}

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
      return buildAvatarPackage(avatar, content.poolContext, seed);
    },
    startJourney: ({ journey, avatarId, seed }) => {
      const avatar = avatarById.get(avatarId);
      if (avatar === undefined) return null;
      const tutorialJourneyPool = content.tutorialJourneyPool;
      const isTutorialJourney =
        journey.screen.type === "journeyStart" &&
        journey.screen.tutorialAvatarId === avatarId &&
        tutorialJourneyPool.avatarId === avatarId;
      const resolvedPackageOverride = isTutorialJourney
        ? buildTutorialJourneyPackage(
            avatar,
            content.poolContext,
            tutorialJourneyPool,
            content.cardDatabase,
          )
        : undefined;
      // Seed atlas generation from the run seed so the assembled atlas is
      // identical on every client.
      return startJourneyFromAvatar({
        prev: journey,
        avatar,
        journeyContent: content,
        seed,
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
      };
    },
  };
}
