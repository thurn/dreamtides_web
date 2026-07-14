import type { CardData } from "../../types/cards";
import type { QuestState } from "../../types/quest";
import type { QuestCompleteView } from "../../cumulus/screens/QuestCompleteScreen";
import { buildStartingDeckView } from "./starting-deck-view-model";

/** Build the victory statistics shown on the completion surface. */
export function buildQuestCompleteView(
  state: QuestState,
): QuestCompleteView {
  const completedDreamscapes = Object.values(state.atlas.nodes).filter(
    (node) => node.state === "completed",
  ).length;
  return {
    dreamcaller:
      state.dreamcaller === null
        ? null
        : {
            id: state.dreamcaller.id,
            name: state.dreamcaller.name,
            title: state.dreamcaller.title,
            ability: state.dreamcaller.renderedText,
            imageNumber: state.dreamcaller.imageNumber,
            ...(state.dreamcaller.portraitFocus === undefined
              ? {}
              : { portraitFocus: state.dreamcaller.portraitFocus }),
          },
    stats: [
      { id: "battles", label: "Battles Won", value: state.completionLevel, kind: "number" },
      { id: "dreamscapes", label: "Dreamscapes", value: completedDreamscapes, kind: "number" },
      { id: "cards", label: "Final Deck", value: state.deck.length, kind: "number" },
      { id: "dreamsigns", label: "Dreamsigns", value: state.dreamsigns.length, kind: "number" },
      { id: "essence", label: "Essence Remaining", value: state.essence, kind: "essence" },
    ],
  };
}

/** Resolve the final deck's UUIDs for the completion log. */
export function buildQuestCompleteCardIds(
  deck: QuestState["deck"],
  cardDatabase: Map<number, CardData>,
): readonly string[] {
  return buildStartingDeckView(deck, cardDatabase).cards.map(
    (entry) => entry.model.cardId,
  );
}
