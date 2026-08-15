import type { JourneyState } from "../../types/journey";
import type { JourneyFailedView } from "../../cumulus/screens/JourneyFailedScreen";
import { localizedSourceText } from "../../runtime/localization/runtime";

/** Build the player-facing terminal summary for a failed journey. */
export function buildJourneyFailedView(
  state: JourneyState,
): JourneyFailedView | null {
  const summary = state.failureSummary;
  if (summary === null) return null;

  return {
    result: summary.result,
    reason: summary.reason,
    avatar:
      state.avatar === null
        ? null
        : {
            id: state.avatar.id,
            name: localizedSourceText(state.avatar.name),
            title: localizedSourceText(state.avatar.title),
            ability: localizedSourceText(state.avatar.renderedText),
            imageNumber: state.avatar.imageNumber,
            ...(state.avatar.portraitFocus === undefined
              ? {}
              : { portraitFocus: state.avatar.portraitFocus }),
          },
    stats: [
      {
        id: "battles",
        value: state.completionLevel,
      },
      { id: "round", value: summary.turnNumber },
      { id: "playerScore", value: summary.playerScore },
      {
        id: "enemyScore",
        value: summary.enemyScore,
      },
    ],
  };
}
