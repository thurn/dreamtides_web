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
  const completedDreamscapes = Object.values(state.atlas.nodes).filter(
    (node) => node.state === "completed",
  ).length;
  return {
    dreamcaller: buildQuestCompleteDreamcallerView(state),
    stats: [
      { id: "battles", label: "Battles Won", value: state.completionLevel, kind: "number" },
      { id: "dreamscapes", label: "Dreamscapes", value: completedDreamscapes, kind: "number" },
      { id: "cards", label: "Final Deck", value: state.deck.length, kind: "number" },
      { id: "dreamsigns", label: "Dreamsigns", value: state.dreamsigns.length, kind: "number" },
      { id: "essence", label: "Essence Remaining", value: state.essence, kind: "essence" },
    ],
    finalDeck: buildStartingDeckView(state.deck, cardDatabase).cards,
  };
}
