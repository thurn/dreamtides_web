import type { CardData } from "../../types/cards";
import type { JourneyState } from "../../types/journey";
import type { JourneyCompleteView } from "../../cumulus/screens/JourneyCompleteScreen";
import { buildStartingDeckView } from "./starting-deck-view-model";

/** Build the victory statistics shown on the completion surface. */
export function buildJourneyCompleteView(state: JourneyState): JourneyCompleteView {
  const completedDreamscapes = Object.values(state.atlas.nodes).filter(
    (node) => node.state === "completed",
  ).length;
  return {
    dreamAvatar:
      state.dreamAvatar === null
        ? null
        : {
            id: state.dreamAvatar.id,
            name: state.dreamAvatar.name,
            title: state.dreamAvatar.title,
            ability: state.dreamAvatar.renderedText,
            imageNumber: state.dreamAvatar.imageNumber,
            ...(state.dreamAvatar.portraitFocus === undefined
              ? {}
              : { portraitFocus: state.dreamAvatar.portraitFocus }),
          },
    stats: [
      {
        id: "battles",
        value: state.completionLevel,
        kind: "number",
      },
      {
        id: "dreamscapes",
        value: completedDreamscapes,
        kind: "number",
      },
      {
        id: "cards",
        value: state.deck.length,
        kind: "number",
      },
      {
        id: "dreamsigns",
        value: state.dreamsigns.length,
        kind: "number",
      },
      {
        id: "essence",
        value: state.essence,
        kind: "essence",
      },
    ],
  };
}

/** Resolve the final deck's UUIDs for the completion log. */
export function buildJourneyCompleteCardIds(
  deck: JourneyState["deck"],
  cardDatabase: Map<number, CardData>,
): readonly string[] {
  return buildStartingDeckView(deck, cardDatabase).cards.map(
    (entry) => entry.model.cardId,
  );
}
