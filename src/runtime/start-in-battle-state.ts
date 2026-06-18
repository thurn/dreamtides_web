import { generateInitialAtlas } from "../atlas/atlas-generator";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import { toQuestDreamcaller } from "../data/dreamcaller-selection";
import { initializeDraftState } from "../draft/draft-engine";
import { buildDreamcallerPackage } from "../data/quest-content";
import type { QuestContent } from "../data/quest-content";
import type { QuestState } from "../types/quest";
import { generateQuestSeed } from "../state/quest-state-actions";

export function createStartInBattleState(
  questContent: QuestContent,
): QuestState | null {
  const dreamcaller = questContent.dreamcallers[0];

  if (dreamcaller === undefined) {
    return null;
  }

  const poolContext = questContent.poolContext;
  if (poolContext === undefined) {
    return null;
  }

  const seed = generateQuestSeed();
  const resolvedPackage = buildDreamcallerPackage(
    dreamcaller,
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
  const dreamscapeWithBattle = atlas.nodes[atlas.startingNodeId];
  const battleSite = dreamscapeWithBattle.sites.find(
    (site) => site.type === "Battle",
  );

  if (battleSite === undefined) {
    return null;
  }

  return {
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
    dreamcaller: toQuestDreamcaller(dreamcaller),
    resolvedPackage,
    cardSourceDebug: null,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
    dreamsigns: [],
    completionLevel: 0,
    atlas,
    currentDreamscape: dreamscapeWithBattle.id,
    visitedSites: [],
    siteRuntime: {},
    draftState: initializeDraftState(questContent.cardDatabase, resolvedPackage),
    screen: { type: "site", siteId: battleSite.id },
    activeSiteId: battleSite.id,
    failureSummary: null,
    hasSeenStartingDeckPopup: true,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
  };
}
