import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import { generateInitialAtlas } from "../atlas/atlas-generator";
import { initializeDraftState } from "../draft/draft-engine";
import { logEvent } from "../logging";
import type { QuestContent } from "../data/quest-content";
import type { CardData } from "../types/cards";
import type { DreamcallerContent } from "../types/content";
import type { QuestMutations } from "../state/quest-context";
import type { QuestState } from "../types/quest";

export interface QuestStartBootstrapArgs {
  dreamcaller: DreamcallerContent;
  state: Pick<
    QuestState,
    "completionLevel" | "deck" | "dreamsigns" | "essence"
  >;
  mutations: Pick<
    QuestMutations,
    | "addCard"
    | "setCurrentDreamscape"
    | "setDraftState"
    | "setDreamcallerSelection"
    | "setScreen"
    | "updateAtlas"
  >;
  cardDatabase: Map<number, CardData>;
  questContent: Pick<
    QuestContent,
    "resolvedPackagesByDreamcallerId"
  >;
}

export function bootstrapQuestStart({
  dreamcaller,
  state,
  mutations,
  cardDatabase,
  questContent,
}: QuestStartBootstrapArgs): void {
  const resolvedPackage = questContent.resolvedPackagesByDreamcallerId.get(
    dreamcaller.id,
  );

  if (resolvedPackage === undefined) {
    throw new Error(`Missing resolved package for ${dreamcaller.id}`);
  }

  const starterCardNumbers = STARTER_CARD_NUMBERS.filter(
    (cardNumber) => !state.deck.some((entry) => entry.cardNumber === cardNumber),
  );

  for (const cardNumber of starterCardNumbers) {
    mutations.addCard(cardNumber, "quest_start_starter_deck");
  }

  logEvent("starter_deck_initialized", {
    starterCardNumbers,
    starterCardNames: starterCardNumbers.map(
      (cardNumber) => cardDatabase.get(cardNumber)?.name ?? `Unknown Card #${String(cardNumber)}`,
    ),
    totalDeckSize: state.deck.length + starterCardNumbers.length,
  });

  mutations.setDreamcallerSelection(resolvedPackage);

  const playerHasBanes =
    state.deck.some((entry) => entry.isBane) ||
    state.dreamsigns.some((dreamsign) => dreamsign.isBane);
  const atlas = generateInitialAtlas(state.completionLevel, {
    playerHasBanes,
  });
  const draftState = initializeDraftState(cardDatabase, resolvedPackage);

  mutations.setDraftState(draftState, "quest_start");
  mutations.updateAtlas(atlas);

  const firstNode = Object.values(atlas.nodes).find(
    (node) => node.status === "available",
  );

  logEvent("quest_started", {
    initialEssence: state.essence,
    startingDeckSize: state.deck.length + starterCardNumbers.length,
    dreamcallerId: dreamcaller.id,
    dreamcallerName: dreamcaller.name,
    packageSummary: {
      mandatoryTides: resolvedPackage.mandatoryTides,
      optionalSubset: resolvedPackage.optionalSubset,
      selectedTides: resolvedPackage.selectedTides,
    },
    selectedPackageTides: resolvedPackage.selectedTides,
    draftPoolSize: resolvedPackage.draftPoolSize,
    dreamsignPoolSize: resolvedPackage.dreamsignPoolIds.length,
    dreamscapesGenerated: Object.keys(atlas.nodes).length - 1,
  });

  if (firstNode !== undefined) {
    mutations.setCurrentDreamscape(firstNode.id);
    mutations.setScreen({ type: "dreamscape" });
    return;
  }

  mutations.setScreen({ type: "atlas" });
}
