import { generateInitialAtlas } from "../atlas/atlas-generator";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import { toQuestDreamcaller } from "../data/dreamcaller-selection";
import { initializeDraftState } from "../draft/draft-engine";
import type { QuestContent } from "../data/quest-content";
import type { QuestState } from "../types/quest";

export function createStartInBattleState(
  questContent: QuestContent,
): QuestState | null {
  const dreamcaller = questContent.dreamcallers.find((candidate) =>
    questContent.resolvedPackagesByDreamcallerId.has(candidate.id)
  );

  if (dreamcaller === undefined) {
    return null;
  }

  const resolvedPackage = questContent.resolvedPackagesByDreamcallerId.get(
    dreamcaller.id,
  );

  if (resolvedPackage === undefined) {
    return null;
  }

  const atlas = generateInitialAtlas(0, { playerHasBanes: false });
  const dreamscapeWithBattle = Object.values(atlas.nodes).find(
    (node) =>
      node.status === "available" &&
      node.sites.some((site) => site.type === "Battle"),
  );
  const battleSite = dreamscapeWithBattle?.sites.find(
    (site) => site.type === "Battle",
  );

  if (dreamscapeWithBattle === undefined || battleSite === undefined) {
    return null;
  }

  return {
    essence: 250,
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
  };
}
