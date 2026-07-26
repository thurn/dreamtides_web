import { generateInitialAtlas } from "../atlas/atlas-generator";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import { toQuestDreamAvatar } from "../data/dream-avatar-selection";
import { initializeDraftState } from "../draft/draft-engine";
import { buildDreamAvatarPackage } from "../data/quest-content";
import type { QuestContent } from "../data/quest-content";
import type { DreamAtlas, DreamscapeNode, QuestState } from "../types/quest";
import { generateQuestSeed } from "../state/quest-state-actions";

/**
 * A fully valid quest state parked on the Dream Atlas, plus the generated atlas
 * and its starter node, shared by every developer-only "jump straight to a
 * screen" entry point. The base {@link QuestState} is the between-dreamscapes
 * resting state (atlas screen, no dreamscape entered); callers that need a
 * different screen override `screen`/`currentDreamscape`/`activeSiteId` on top
 * of it (see `qa-scenes.ts`).
 */
export interface QaQuestFoundation {
  state: QuestState;
  atlas: DreamAtlas;
  starterNode: DreamscapeNode;
}

/**
 * Builds the common foundation for `?goto=<scene>` developer flows: the first
 * DreamAvatar, its resolved draft package, the starter deck, and a freshly
 * generated atlas with its boss node and Apollyon incarnation. Returns null
 * when required quest content is missing. The returned `state` is the resting
 * atlas state; nothing here is specific to any one target screen.
 */
export function createQaQuestFoundation(
  questContent: QuestContent,
): QaQuestFoundation | null {
  const dreamAvatar = questContent.dreamAvatars[0];

  if (dreamAvatar === undefined) {
    return null;
  }

  const poolContext = questContent.poolContext;
  if (poolContext === undefined) {
    return null;
  }

  const seed = generateQuestSeed();
  const resolvedPackage = buildDreamAvatarPackage(
    dreamAvatar,
    poolContext,
    seed,
  );

  const atlas = generateInitialAtlas(
    0,
    {},
    {
      dreamscapes: questContent.dreamscapes,
      atlasConfig: questContent.atlasConfig,
      dreamsignPoolIds: resolvedPackage.dreamsignPoolIds,
      apollyonIncarnations: questContent.apollyonIncarnations,
    },
  );
  const starterNode = atlas.nodes[atlas.startingNodeId];

  if (starterNode === undefined) {
    return null;
  }

  const state: QuestState = {
    runId: null,
    seed,
    essence: 200,
    essenceCap: 500,
    maxDreamsigns: 12,
    deck: STARTER_CARD_NUMBERS.map((cardNumber, index) => ({
      entryId: `deck-${String(index + 1)}`,
      cardNumber,
      transfiguration: null,
      isBane: false,
    })),
    dreamAvatar: toQuestDreamAvatar(dreamAvatar),
    resolvedPackage,
    cardSourceDebug: null,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
    dreamsigns: [],
    completionLevel: 0,
    atlas,
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: initializeDraftState(questContent.cardDatabase, resolvedPackage),
    screen: { type: "atlas" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: true,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
  };

  return { state, atlas, starterNode };
}
