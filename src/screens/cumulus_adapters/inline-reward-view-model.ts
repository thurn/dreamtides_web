import { isEnhancedDreamsignReward } from "../../rules/journey/sites";
import { essenceSiteGain } from "../../rules/journey/journey-essence";
import { journeyModifierRegistry, type JourneyModifierRegistry } from "../../rules/journey/modifier-registry";
import type {
  DreamscapeNode,
  JourneyState,
  SiteRuntimeState,
  SiteState,
} from "../../types/journey";
import type { SiteId } from "../../types/identifiers";
import type { DreamsignId } from "../../types/identifiers";

function isInlineRewardSite(
  site: SiteState | undefined,
  runtime: SiteRuntimeState | undefined,
): site is SiteState {
  return site?.type === "Reward" || (site?.type === "Essence" &&
    runtime?.kind === "reward" && runtime.journeyEssenceSource !== undefined);
}

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
  state: Pick<JourneyState, "essence" | "dreamsigns" | "maxDreamsigns">,
): InlineRewardResolution | null {
  if (runtime?.kind === "reward" && "enhancedDreamsignOffer" in runtime) return null;
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
  siteId: SiteId,
  dreamsignId: DreamsignId,
) {
  const site = node.sites.find((candidate) => candidate.id === siteId);
  const runtime = state.siteRuntime[siteId];
  const purgeIndex = state.dreamsigns.findIndex(
    (dreamsign) => dreamsign.id === dreamsignId,
  );
  if (
    purgeIndex < 0 ||
    !isInlineRewardSite(site, runtime) ||
    runtime?.kind !== "reward" ||
    runtime.reward.rewardType !== "dreamsign"
  )
    return null;
  return {
    siteId: site.id,
    purgeIndex,
    fields: {
      siteType: site.type,
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
  siteId: SiteId,
) {
  const site = node.sites.find((candidate) => candidate.id === siteId);
  const runtime = state.siteRuntime[siteId];
  if (
    !isInlineRewardSite(site, runtime) ||
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
  state: Pick<JourneyState, "essence" | "dreamsigns">,
  modifiers: JourneyModifierRegistry = journeyModifierRegistry,
): InlineRewardCompletionLog | null {
  if (site?.type === "Essence" && runtime?.kind === "essence") {
    if (runtime.accepted) return null;
    const amount = essenceSiteGain(state, runtime.amount, modifiers);
    return {
      kind: "essence",
      fields: {
        siteType: "Essence",
        outcome: "collected",
        siteId: site.id,
        rewardAmount: amount,
        isEnhanced: site.isEnhanced,
        essenceBefore: state.essence,
        essenceAfter: state.essence + amount,
      },
    };
  }
  if (
    !isInlineRewardSite(site, runtime) ||
    runtime?.kind !== "reward" ||
    runtime.accepted
  ) {
    return null;
  }
  if ("enhancedDreamsignOffer" in runtime) return null;
  const reward = runtime.reward;
  return {
    kind: "reward",
    fields: {
      siteType: site.type,
      outcome: "collected",
      siteId: site.id,
      rewardType: reward.rewardType,
      ...(reward.rewardType === "dreamsign"
        ? { dreamsignId: reward.dreamsign.id }
        : {
            rewardAmount: reward.essenceAmount,
            essenceBefore: state.essence,
            essenceAfter: state.essence + reward.essenceAmount,
          }),
      isEnhanced: site.isEnhanced,
    },
  };
}

/** Resolve incoming and held UUIDs against the live stored quote before an intent. */
export function resolveEnhancedRewardChoice(
  node: DreamscapeNode,
  state: JourneyState,
  siteId: SiteId,
  incomingId: DreamsignId,
  heldId?: DreamsignId,
) {
  const site = node.sites.find((candidate) => candidate.id === siteId);
  const runtime = state.siteRuntime[siteId];
  if (state.currentDreamscape !== node.id || site?.type !== "Reward" || site.isVisited ||
    !isEnhancedDreamsignReward(runtime) || runtime.accepted) return null;
  const dreamsign = runtime.enhancedDreamsignOffer.offeredDreamsigns.find((sign) => sign.id === incomingId);
  if (dreamsign === undefined) return null;
  if (heldId === undefined && state.dreamsigns.length >= state.maxDreamsigns) {
    return { kind: "replacement" as const, siteId, dreamsign };
  }
  const purgeIndex = heldId === undefined ? undefined : state.dreamsigns.findIndex((sign) => sign.id === heldId);
  if (purgeIndex !== undefined && purgeIndex < 0) return null;
  return { kind: "accept" as const, siteId, dreamsign, purgeIndex };
}
