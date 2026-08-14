import {
  createRewardSelectionStream,
  selectReward,
  type RewardMechanicId,
  type RewardSelectionPolicyId,
  type RewardSelectionRequest,
  type RewardSelectionResult,
} from "../../reward-selection";
import type { MerchantArchetypeId, MerchantOfferDraft } from "./types";
import type { MerchantContext } from "../types";
import { auguryArchetype } from "../../data/augury-data";
import type { MerchantOfferTrace, MerchantTraceDecision } from "../trace/types";
import {
  asRewardCandidateKey,
  asMerchantTargetKey,
  asSelectionKey,
} from "../../types/identifiers";

function legacyTraceFor(selection: RewardSelectionResult): MerchantOfferTrace {
  const decision: MerchantTraceDecision =
    selection.mechanicId === "gain-dreamsign"
      ? "dreamsign_match"
      : selection.mechanicId === "add-site"
        ? "uniform"
        : selection.mechanicId === "purge-deck-entry" ||
            selection.mechanicId === "purge-for-essence" ||
            selection.mechanicId === "duplicate-deck-entry"
          ? "deck_entry_rank"
          : selection.mechanicId === "transfigure-deck-entry" ||
              selection.mechanicId === "change-entry-subtype"
            ? "entry_modification"
            : "scored_cards";
  const keyKind =
    selection.trace.keyKind === "dreamAvatarId"
      ? "entryId"
      : selection.trace.keyKind;
  const dreamsignTier = selection.trace.fallback.includes(
    asRewardCandidateKey("dreamsign-signal-free"),
  )
    ? ("fallback" as const)
    : selection.trace.fallback.includes(
          asRewardCandidateKey("dreamsign-generic"),
        )
      ? ("generic" as const)
      : ("covered" as const);
  const allCandidatesInDraftPool =
    selection.trace.band.candidates.length > 0 &&
    selection.trace.band.candidates.every(
      (candidate) => candidate.inDraftPool === true,
    );
  const threshold = selection.trace.band.candidates
    .map((candidate) => candidate.components.threshold)
    .find((value) => value !== undefined);
  const notes =
    selection.trace.policyId === "purge-misfit"
      ? [
          ...selection.trace.fallback,
          `purgeMisfitFraction=${String(selection.trace.tuning.purgeMisfitFraction ?? "unavailable")}`,
          `looThreshold=${String(threshold ?? "unavailable")}`,
          `starterPurgeBonus=${String(selection.trace.tuning.starterPurgeBonus ?? "unavailable")}`,
        ]
      : [
          ...selection.trace.fallback,
          ...(allCandidatesInDraftPool ? ["candidateSource=draftPool"] : []),
        ];
  const isScoredCardDecision =
    decision === "scored_cards" &&
    selection.policyId !== "uniform" &&
    selection.policyId !== "fixed";
  const coldStart = selection.trace.fallback.includes(
    asRewardCandidateKey("fit-unavailable"),
  );
  return {
    decision,
    keyKind,
    band: {
      poolSize: selection.trace.candidateCount,
      bandSize: selection.trace.band.size,
      bandFraction: selection.trace.band.fraction,
      bandMinimum: selection.trace.band.minimum,
      selectedCount: selection.trace.selectedKeys.length,
    },
    candidateCount: selection.trace.candidateCount,
    candidates: selection.trace.band.candidates.map((candidate) => ({
      key: asMerchantTargetKey(candidate.key),
      score: candidate.score,
      components: candidate.components,
      ...(candidate.cardUuid === undefined
        ? {}
        : { cardUuid: candidate.cardUuid }),
      ...(candidate.cardNumber === undefined
        ? {}
        : { cardNumber: candidate.cardNumber }),
      ...(candidate.dreamsignId === undefined
        ? {}
        : { dreamsignId: candidate.dreamsignId }),
      ...(candidate.entryId === undefined
        ? {}
        : { entryId: candidate.entryId }),
      ...(candidate.inDraftPool === undefined
        ? {}
        : { inDraftPool: candidate.inDraftPool }),
      inBand: candidate.inBand,
      selected: candidate.selected,
    })),
    truncated:
      selection.trace.band.candidates.length < selection.trace.candidateCount,
    ...(isScoredCardDecision ? { coldStartQualityFallback: coldStart } : {}),
    ...(decision === "dreamsign_match" ? { dreamsignTier } : {}),
    ...(Object.keys(selection.trace.tuning).length === 0 || coldStart
      ? {}
      : { blend: selection.trace.tuning }),
    ...(notes.length === 0 ? {} : { notes }),
  };
}

/** The TOML-authored policy for an Augury archetype. */
export function augurySelectionPolicy(
  context: MerchantContext,
  archetypeId: MerchantArchetypeId,
): RewardSelectionPolicyId {
  return auguryArchetype(
    context.rewardSelection.content.auguryData,
    archetypeId,
  ).selectionPolicyId;
}

export function selectMerchantReward(input: {
  context: MerchantContext;
  archetypeId: MerchantArchetypeId;
  mechanicId: RewardMechanicId;
  policyId: RewardSelectionPolicyId;
  request?: Omit<
    Partial<RewardSelectionRequest>,
    "mechanicId" | "policyId" | "scope"
  >;
}): RewardSelectionResult | null {
  const { context, archetypeId, mechanicId, policyId } = input;
  const rewardSelection =
    mechanicId === "gain-dreamsign" &&
    context.rewardSelection.remainingDreamsignIds.size === 0
      ? {
          ...context.rewardSelection,
          remainingDreamsignIds: new Set(
            context.candidateDreamsigns.map((dreamsign) => dreamsign.id),
          ),
        }
      : context.rewardSelection;
  const outcome = selectReward(rewardSelection, {
    mechanicId,
    policyId,
    scope: {
      journeySeed: context.journeySeed,
      siteUuid: context.site.id,
      selectionKey: asSelectionKey(
        `${context.selectionKey ?? "slot"}:${archetypeId}`,
      ),
    },
    count: 1,
    ...input.request,
  });
  return outcome.ok ? outcome : null;
}

export function selectionMetadata(
  selection: RewardSelectionResult,
): Pick<
  MerchantOfferDraft,
  | "mechanicId"
  | "policyId"
  | "selectionKey"
  | "selectionRulesVersion"
  | "selectionContentRevision"
  | "selectionTrace"
  | "trace"
> {
  return {
    mechanicId: selection.mechanicId,
    policyId: selection.policyId,
    selectionKey: selection.selectionKey,
    selectionRulesVersion: selection.selectionRulesVersion,
    selectionContentRevision: selection.selectionContentRevision,
    selectionTrace: selection.trace,
    trace: legacyTraceFor(selection),
  };
}

export function selectMerchantCount(input: {
  context: MerchantContext;
  archetypeId: MerchantArchetypeId;
  mechanicId: RewardMechanicId;
  policyId: RewardSelectionPolicyId;
  minimum: number;
  maximum: number;
}): number {
  const request: RewardSelectionRequest = {
    mechanicId: input.mechanicId,
    policyId: input.policyId,
    scope: {
      journeySeed: input.context.journeySeed,
      siteUuid: input.context.site.id,
      selectionKey: asSelectionKey(
        `${input.context.selectionKey ?? "slot"}:${input.archetypeId}`,
      ),
    },
    count: 1,
  };
  const stream = createRewardSelectionStream(request, "count");
  const span = input.maximum - input.minimum + 1;
  return input.minimum + Math.floor(stream.draw() * span);
}
