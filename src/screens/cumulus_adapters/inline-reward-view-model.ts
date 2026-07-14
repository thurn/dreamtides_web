import type {
  QuestState,
  SiteRuntimeState,
  SiteState,
} from "../../types/quest";

export type InlineRewardCompletionKind = "essence" | "reward";

export interface InlineRewardCompletionLog {
  kind: InlineRewardCompletionKind;
  fields: Record<string, unknown>;
}

/** Maps a completed inline collection to its reconstruction log fields. */
export function buildInlineRewardCompletionLog(
  site: SiteState | undefined,
  runtime: SiteRuntimeState | undefined,
  state: Pick<QuestState, "essence" | "essenceCap">,
): InlineRewardCompletionLog | null {
  if (site?.type === "Essence" && runtime?.kind === "essence") {
    if (runtime.accepted) return null;
    return {
      kind: "essence",
      fields: {
        siteType: "Essence",
        outcome: "collected",
        siteId: site.id,
        rewardAmount: runtime.amount,
        isEnhanced: site.isEnhanced,
        essenceBefore: state.essence,
        essenceAfter: Math.min(state.essenceCap, state.essence + runtime.amount),
        ui: "cumulus",
      },
    };
  }
  if (site?.type !== "Reward" || runtime?.kind !== "reward" || runtime.accepted) {
    return null;
  }
  const reward = runtime.reward;
  return {
    kind: "reward",
    fields: {
      siteType: "Reward",
      outcome: "collected",
      siteId: site.id,
      rewardType: reward.rewardType,
      ...(reward.rewardType === "dreamsign"
        ? { dreamsignId: reward.dreamsign.id }
        : {
            rewardAmount: reward.essenceAmount,
            essenceBefore: state.essence,
            essenceAfter: Math.min(
              state.essenceCap,
              state.essence + reward.essenceAmount,
            ),
          }),
      isEnhanced: site.isEnhanced,
      ui: "cumulus",
    },
  };
}
