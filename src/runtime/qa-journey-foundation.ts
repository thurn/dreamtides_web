import { generateInitialAtlas } from "../atlas/atlas-generator";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import { toJourneyDreamAvatar } from "../data/dream-avatar-selection";
import { initializeDraftState } from "../draft/draft-engine";
import { buildDreamAvatarPackage } from "../data/journey-content";
import type { JourneyContent } from "../data/journey-content";
import type {
  DreamAtlas,
  DreamscapeNode,
  JourneyState,
} from "../types/journey";
import { generateJourneySeed } from "../state/journey-state-actions";

/**
 * A fully valid journey state parked on the Dream Atlas, plus the generated atlas
 * and its starter node, shared by every developer-only "jump straight to a
 * screen" entry point. The base {@link JourneyState} is the between-dreamscapes
 * resting state (atlas screen, no dreamscape entered); callers that need a
 * different screen override `screen`/`currentDreamscape`/`activeSiteId` on top
 * of it (see `qa-scenes.ts`).
 */
export interface QaJourneyFoundation {
  state: JourneyState;
  atlas: DreamAtlas;
  starterNode: DreamscapeNode;
}

/**
 * Builds the common foundation for `?goto=<scene>` developer flows: the first
 * DreamAvatar, its resolved draft package, the starter deck, and a freshly
 * generated atlas with its boss node and Apollyon incarnation. Returns null
 * when required journey content is missing. The returned `state` is the resting
 * atlas state; nothing here is specific to any one target screen.
 */
export function createQaJourneyFoundation(
  journeyContent: JourneyContent,
): QaJourneyFoundation | null {
  const dreamAvatar = journeyContent.dreamAvatars[0];

  if (dreamAvatar === undefined) {
    return null;
  }

  const poolContext = journeyContent.poolContext;
  if (poolContext === undefined) {
    return null;
  }

  const seed = generateJourneySeed();
  const resolvedPackage = buildDreamAvatarPackage(
    dreamAvatar,
    poolContext,
    seed,
  );

  const atlas = generateInitialAtlas(
    0,
    { draftPickCount: journeyContent.draftData.offers.picksPerSite },
    {
      dreamscapes: journeyContent.dreamscapes,
      atlasData: journeyContent.atlasData,
      sitesData: journeyContent.sitesData,
      dreamsignPoolIds: resolvedPackage.dreamsignPoolIds,
      apollyonIncarnations: journeyContent.apollyonIncarnations,
    },
  );
  const starterNode = atlas.nodes[atlas.startingNodeId];

  if (starterNode === undefined) {
    return null;
  }

  const state: JourneyState = {
    runId: null,
    seed,
    essence: dreamAvatar.startingEssence,
    maxDreamsigns: journeyContent.economyData.journey.dreamsignCap,
    deck: STARTER_CARD_NUMBERS.map((cardNumber, index) => ({
      entryId: `deck-${String(index + 1)}`,
      cardNumber,
      transfiguration: null,
      isBane: false,
    })),
    dreamAvatar: toJourneyDreamAvatar(dreamAvatar),
    resolvedPackage,
    cardSourceDebug: null,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
    dreamsigns: [],
    completionLevel: 0,
    atlas,
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: initializeDraftState(
      journeyContent.cardDatabase,
      resolvedPackage,
    ),
    screen: { type: "atlas" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: true,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      essenceDiscountPercent: 0,
    },
    siteOfferModifiers: [],
    dreamscapeModifiers: [],
  };

  return { state, atlas, starterNode };
}
