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
    dreamAvatar:
      state.dreamAvatar === null
        ? null
        : {
            id: state.dreamAvatar.id,
            name: localizedSourceText(state.dreamAvatar.name),
            title: localizedSourceText(state.dreamAvatar.title),
            ability: localizedSourceText(state.dreamAvatar.renderedText),
            imageNumber: state.dreamAvatar.imageNumber,
            ...(state.dreamAvatar.portraitFocus === undefined
              ? {}
              : { portraitFocus: state.dreamAvatar.portraitFocus }),
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
