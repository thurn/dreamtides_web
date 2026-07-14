import type { CardData } from "../../types/cards";
import type { QuestState } from "../../types/quest";
import type {
  QuestCompleteDreamcallerView,
  QuestCompleteView,
} from "../../cumulus/screens/QuestCompleteScreen";
import { buildStartingDeckView } from "./starting-deck-view-model";

/** Map the selected Dreamcaller to the victory portrait contract. */
export function buildQuestCompleteDreamcallerView(
  state: QuestState,
): QuestCompleteDreamcallerView | null {
  if (state.dreamcaller === null) return null;
  return {
    id: state.dreamcaller.id,
    name: state.dreamcaller.name,
    title: state.dreamcaller.title,
    imageNumber: state.dreamcaller.imageNumber,
    portraitFocus: state.dreamcaller.portraitFocus,
  };
}

/** Build the complete victory summary from live quest state. */
export function buildQuestCompleteView(
  state: QuestState,
  cardDatabase: Map<number, CardData>,
): QuestCompleteView {
  return {
    dreamcaller: buildQuestCompleteDreamcallerView(state),
    finalDeck: buildStartingDeckView(state.deck, cardDatabase).cards,
  };
}
