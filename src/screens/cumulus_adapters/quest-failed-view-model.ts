import type { QuestState } from "../../types/quest";
import type { QuestFailedView } from "../../cumulus/screens/QuestFailedScreen";

/** Build the player-facing terminal summary for a failed quest. */
export function buildQuestFailedView(state: QuestState): QuestFailedView | null {
  const summary = state.failureSummary;
  if (summary === null) return null;

  return {
    result: summary.result,
    reason: summary.reason,
    title: summary.result === "defeat" ? "Quest Ended" : "Stalemate",
    message:
      summary.result === "defeat"
        ? "Your journey ends here."
        : "Neither side could claim the dream.",
    reasonLabel: formatQuestFailureReason(summary.reason),
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
export function formatQuestFailureReason(
  reason: NonNullable<QuestState["failureSummary"]>["reason"],
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
