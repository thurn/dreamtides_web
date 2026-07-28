import type { JourneyState } from "../../types/journey";
import type { JourneyFailedView } from "../../cumulus/screens/JourneyFailedScreen";

/** Build the player-facing terminal summary for a failed journey. */
export function buildJourneyFailedView(
  state: JourneyState,
): JourneyFailedView | null {
  const summary = state.failureSummary;
  if (summary === null) return null;

  return {
    result: summary.result,
    reason: summary.reason,
    title: summary.result === "defeat" ? "Journey Ended" : "Stalemate",
    message:
      summary.result === "defeat"
        ? "Your journey ends here."
        : "Neither side could claim the dream.",
    reasonLabel: formatJourneyFailureReason(summary.reason),
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
        label: "Battles Won",
        value: state.completionLevel,
      },
      { id: "round", label: "Final Round", value: summary.turnNumber },
      { id: "playerScore", label: "Your Score", value: summary.playerScore },
      {
        id: "enemyScore",
        label: "Opponent Score",
        value: summary.enemyScore,
      },
    ],
  };
}

/** Convert the persisted reason discriminator into player-facing copy. */
export function formatJourneyFailureReason(
  reason: NonNullable<JourneyState["failureSummary"]>["reason"],
): string {
  switch (reason) {
    case "score_target_reached":
      return "Score Threshold Reached";
    case "turn_limit_reached":
      return "Turn Limit Reached";
    case "forced_result":
      return "Forced Result";
  }
}
