import { generateInitialAtlas } from "../atlas/atlas-generator";
import { toJourneyAvatar } from "../data/avatar-selection";
import { initializeDraftState } from "../draft/draft-engine";
import { buildAvatarPackage } from "../data/journey-content";
import type { JourneyContent } from "../data/journey-content";
import type {
  DreamAtlas,
  DreamscapeNode,
  JourneyState,
} from "../types/journey";
import { initialJourneyState } from "../rules/fold-state";
import { generateJourneySeed } from "../state/journey-state-actions";
import { parseDeckEntryId } from "../types/identifiers";

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
  atlas: DreamAtlas<true>;
  starterNode: DreamscapeNode;
}

/**
 * Builds the common foundation for `?goto=<scene>` developer flows: the first
 * Avatar, its resolved draft package, the starter deck, and a freshly
 * generated atlas with its boss node and Apollyon incarnation. Returns null
 * when required journey content is missing. The returned `state` is the resting
 * atlas state; nothing here is specific to any one target screen.
 */
export function createQaJourneyFoundation(
  journeyContent: JourneyContent,
): QaJourneyFoundation | null {
  const avatar = journeyContent.avatars[0];

  if (avatar === undefined) {
    return null;
  }

  const poolContext = journeyContent.poolContext;

  const seed = generateJourneySeed();
  const resolvedPackage = buildAvatarPackage(
    avatar,
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
      gambleData: journeyContent.gambleData,
      dreamsignPoolIds: resolvedPackage.dreamsignPoolIds,
      apollyonIncarnations: journeyContent.apollyonIncarnations,
    },
  );
  const starterNode = atlas.nodes[atlas.startingNodeId];

  if (starterNode === undefined) {
    return null;
  }

  const state: JourneyState = {
    ...initialJourneyState(seed, journeyContent.economyData.journey),
    essence: avatar.startingEssence,
    deck: poolContext.starterCardNumbers.map((cardNumber, index) => ({
      entryId: parseDeckEntryId(`deck-${String(index + 1)}`),
      cardNumber,
      transfiguration: null,
      isBane: false,
    })),
    avatar: toJourneyAvatar(avatar),
    resolvedPackage,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
    atlas,
    draftState: initializeDraftState(
      journeyContent.cardDatabase,
      resolvedPackage,
    ),
    screen: { type: "atlas" },
    hasSeenStartingDeckPopup: true,
  };

  return { state, atlas, starterNode };
}
