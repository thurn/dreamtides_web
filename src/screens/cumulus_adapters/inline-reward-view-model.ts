import type {
  DreamscapeNode,
  JourneyState,
  SiteRuntimeState,
  SiteState,
} from "../../types/journey";
import { requireDreamsignId } from "../../data/dreamsigns";

export type InlineRewardCompletionKind = "essence" | "reward";

export interface InlineRewardCompletionLog {
  kind: InlineRewardCompletionKind;
  fields: Record<string, unknown>;
}

export type InlineRewardResolution =
  { kind: "replacement" } | InlineRewardCompletionLog;

/** Resolves the post-animation action, including the at-cap choice gate. */
export function resolveInlineReward(
  site: SiteState | undefined,
  runtime: SiteRuntimeState | undefined,
  state: Pick<
    JourneyState,
    "essence" | "essenceCap" | "dreamsigns" | "maxDreamsigns"
  >,
): InlineRewardResolution | null {
  const completion = buildInlineRewardCompletionLog(site, runtime, state);
  if (completion === null) return null;
  if (
    runtime?.kind === "reward" &&
    runtime.reward.rewardType === "dreamsign" &&
    state.dreamsigns.length >= state.maxDreamsigns
  ) {
    return { kind: "replacement" };
  }
  return completion;
}

/** Resolves a held Dreamsign UUID against the live collection. */
export function resolveRewardReplacement(
  node: DreamscapeNode,
  state: JourneyState,
  siteId: string,
  dreamsignId: string,
) {
  const site = node.sites.find((candidate) => candidate.id === siteId);
  const runtime = state.siteRuntime[siteId];
  const purgeIndex = state.dreamsigns.findIndex(
    (dreamsign) =>
      requireDreamsignId(dreamsign, "Reward site replacement") === dreamsignId,
  );
  if (
    purgeIndex < 0 ||
    site?.type !== "Reward" ||
    runtime?.kind !== "reward" ||
    runtime.reward.rewardType !== "dreamsign"
  )
    return null;
  return {
    siteId: site.id,
    purgeIndex,
    fields: {
      siteType: "Reward",
      outcome: "replaced_dreamsign",
      siteId: site.id,
      dreamsignId: runtime.reward.dreamsign.id,
      replacedDreamsignId: dreamsignId,
      isEnhanced: site.isEnhanced,
    },
  };
}

/** Resolves an at-cap decline against the live Reward runtime. */
export function resolveRewardDecline(
  node: DreamscapeNode,
  state: JourneyState,
  siteId: string,
) {
  const site = node.sites.find((candidate) => candidate.id === siteId);
  const runtime = state.siteRuntime[siteId];
  if (
    site?.type !== "Reward" ||
    runtime?.kind !== "reward" ||
    runtime.reward.rewardType !== "dreamsign"
  )
    return null;
  return {
    siteId: site.id,
    fields: {
      siteId: site.id,
      dreamsignId: runtime.reward.dreamsign.id,
      outcome: "kept_current_collection",
    },
  };
}

/** Maps a completed inline collection to its reconstruction log fields. */
export function buildInlineRewardCompletionLog(
  site: SiteState | undefined,
  runtime: SiteRuntimeState | undefined,
  state: Pick<JourneyState, "essence" | "essenceCap">,
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
        essenceAfter: Math.min(
          state.essenceCap,
          state.essence + runtime.amount,
        ),
      },
    };
  }
  if (
    site?.type !== "Reward" ||
    runtime?.kind !== "reward" ||
    runtime.accepted
  ) {
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
    },
  };
}
