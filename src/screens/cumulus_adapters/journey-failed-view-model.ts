import type { JourneyState } from "../../types/journey";
import type { JourneyFailedView } from "../../cumulus/screens/JourneyFailedScreen";

/** Build the player-facing terminal summary for a failed journey. */
export function buildJourneyFailedView(
  state: JourneyState,
): JourneyFailedView | null {
  const summary = state.failureSummary;
  const draw = state.journeyDraw;
  if (summary === null && draw === undefined) return null;

  return {
    ...(draw === undefined ? { result: summary!.result, reason: summary!.reason } : { kind: "journey" as const, result: "draw" as const, reason: "mandatory_journey_loop" as const }),
    avatar:
      state.avatar === null
        ? null
        : {
            id: state.avatar.id,
            name: state.avatar.name,
            title: state.avatar.title,
            ability: state.avatar.renderedText,
            imageNumber: state.avatar.imageNumber,
            ...(state.avatar.portraitFocus === undefined
              ? {}
              : { portraitFocus: state.avatar.portraitFocus }),
          },
    stats: draw === undefined ? [
      {
        id: "battles",
        value: state.completionLevel,
      },
      { id: "round", value: summary!.turnNumber },
      { id: "playerScore", value: summary!.playerScore },
      {
        id: "enemyScore",
        value: summary!.enemyScore,
      },
    ] : [{ id: "battles", value: state.completionLevel }, { id: "deckEntries", value: state.deck.length }],
  };
}
