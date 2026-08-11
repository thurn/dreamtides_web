import type { JourneyContent } from "../data/journey-content";
import { buildRewardSelectionContext } from "../reward-selection/context";
import { selectReward } from "../reward-selection/selectReward";
import { stableDigest } from "../reward-selection/stable";
import {
  SELECTION_RULES_VERSION,
  type RewardSelectionPolicyId,
  type RewardSelectionResult,
} from "../reward-selection/types";
import type {
  DreamsignActionUnavailableReason,
  ExplorationDreamsignMutationResolution,
  ExplorationDreamsignPreparation,
  ExplorationDreamsignPreparationKind,
  JourneyState,
  SiteState,
} from "../types/journey";

export type ExplorationDreamsignEffectKind =
  | "gain-nightmare-and-dreamsign"
  | "gain-nightmare-and-offered-dreamsign"
  | "gain-offered-dreamsign"
  | "replace-selected-dreamsign-with-offered"
  | "replace-all-dreamsigns-random"
  | "purge-selected-dreamsign-and-gain-random";

export interface ExplorationDreamsignSelection {
  offeredDreamsignId?: unknown;
  replacedDreamsignId?: unknown;
  purgedDreamsignId?: unknown;
  overflowReplacementDreamsignIds?: unknown;
}

export interface PreparedExplorationDreamsignPlan {
  preparation: ExplorationDreamsignPreparation;
  selector: RewardSelectionResult | null;
}

interface PlanContract {
  kind: ExplorationDreamsignPreparationKind;
  policyId: RewardSelectionPolicyId;
  requestedCount: number;
  nightmareCount: number;
  requiresNightmares: boolean;
  fixedDreamsignId?: string;
}

interface SelectorProof {
  signature: string;
  trace: RewardSelectionResult["trace"];
}

function contractFor(
  effectKind: ExplorationDreamsignEffectKind,
  authoredCount: number | undefined,
  heldCount: number,
  authoredNightmareCount: number | undefined,
  fixedDreamsignId: string | undefined,
): PlanContract {
  switch (effectKind) {
    case "gain-nightmare-and-dreamsign":
      return {
        kind: "fixed-gain",
        policyId: "fixed",
        requestedCount: 1,
        nightmareCount: authoredNightmareCount ?? 0,
        requiresNightmares: true,
        ...(fixedDreamsignId === undefined ? {} : { fixedDreamsignId }),
      };
    case "gain-nightmare-and-offered-dreamsign":
      return {
        kind: "offered-gain",
        policyId: "dreamsign-match",
        requestedCount: authoredCount ?? 0,
        nightmareCount: authoredNightmareCount ?? 0,
        requiresNightmares: true,
      };
    case "gain-offered-dreamsign":
      return {
        kind: "offered-gain",
        policyId: "dreamsign-match",
        requestedCount: authoredCount ?? 0,
        nightmareCount: 0,
        requiresNightmares: false,
      };
    case "replace-selected-dreamsign-with-offered":
      return {
        kind: "offered-replacement",
        policyId: "dreamsign-match",
        requestedCount: authoredCount ?? 0,
        nightmareCount: 0,
        requiresNightmares: false,
      };
    case "replace-all-dreamsigns-random":
      return {
        kind: "replace-all-random",
        policyId: "uniform",
        requestedCount: heldCount,
        nightmareCount: 0,
        requiresNightmares: false,
      };
    case "purge-selected-dreamsign-and-gain-random":
      return {
        kind: "purge-and-gain-random",
        policyId: "uniform",
        requestedCount: authoredCount ?? 0,
        nightmareCount: 0,
        requiresNightmares: false,
      };
  }
}

function dreamsignIdIndex(
  content: JourneyContent,
): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const template of content.dreamsignTemplates) {
    index.set(template.id.toLowerCase(), template.id);
  }
  for (const dreamsign of content.exploration?.customDreamsigns ?? []) {
    if (dreamsign.id !== undefined) {
      index.set(dreamsign.id.toLowerCase(), dreamsign.id);
    }
  }
  return index;
}

function randomPoolIdIndex(
  content: JourneyContent,
): ReadonlyMap<string, string> {
  return new Map(
    content.dreamsignTemplates.map((template) => [
      template.id.toLowerCase(),
      template.id,
    ]),
  );
}

function canonicalIds(
  ids: readonly string[],
  index: ReadonlyMap<string, string>,
  excluded: ReadonlySet<string> = new Set(),
): string[] {
  const result = new Set<string>();
  for (const id of ids) {
    const canonical = index.get(id.toLowerCase());
    if (canonical !== undefined && !excluded.has(canonical.toLowerCase())) {
      result.add(canonical);
    }
  }
  return [...result].sort((left, right) => left.localeCompare(right));
}

function heldIds(
  journey: JourneyState,
  index: ReadonlyMap<string, string>,
): string[] | null {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const dreamsign of journey.dreamsigns) {
    const canonical =
      dreamsign.id === undefined
        ? undefined
        : index.get(dreamsign.id.toLowerCase());
    if (canonical === undefined || seen.has(canonical.toLowerCase()))
      return null;
    seen.add(canonical.toLowerCase());
    result.push(canonical);
  }
  return result;
}

function equalIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function unavailableReason(input: {
  contract: PlanContract;
  heldIds: readonly string[] | null;
  maxDreamsigns: number;
}): DreamsignActionUnavailableReason | null {
  const { contract, heldIds: held, maxDreamsigns } = input;
  if (held === null) return "invalid-held-dreamsigns";
  if (
    !Number.isInteger(maxDreamsigns) ||
    maxDreamsigns < 0 ||
    held.length > maxDreamsigns
  ) {
    return "invalid-capacity";
  }
  if (
    contract.kind !== "fixed-gain" &&
    contract.kind !== "offered-gain" &&
    held.length === 0
  ) {
    return "requires-held-dreamsign";
  }
  if (
    !Number.isInteger(contract.requestedCount) ||
    contract.requestedCount <= 0 ||
    !Number.isInteger(contract.nightmareCount) ||
    contract.nightmareCount < 0 ||
    (contract.requiresNightmares && contract.nightmareCount <= 0)
  ) {
    return "invalid-authored-count";
  }
  if (
    ((contract.kind === "fixed-gain" || contract.kind === "offered-gain") &&
      maxDreamsigns === 0) ||
    (contract.kind === "purge-and-gain-random" &&
      maxDreamsigns < contract.requestedCount)
  ) {
    return "capacity-too-small";
  }
  return null;
}

function signaturePayload(input: {
  effectKind: ExplorationDreamsignEffectKind;
  actionId: string;
  preparation: Omit<ExplorationDreamsignPreparation, "planSignature">;
  selector: SelectorProof | null;
}): unknown {
  return {
    effectKind: input.effectKind,
    actionId: input.actionId,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    preparation: input.preparation,
    selectorSignature: input.selector?.signature ?? null,
    selectorTrace: input.selector?.trace ?? null,
  };
}

function signedPreparation(input: {
  effectKind: ExplorationDreamsignEffectKind;
  actionId: string;
  preparation: Omit<ExplorationDreamsignPreparation, "planSignature">;
  selector: SelectorProof | null;
}): ExplorationDreamsignPreparation {
  return {
    ...input.preparation,
    planSignature: stableDigest(signaturePayload(input)),
  };
}

/** Prepare an exact Dreamsign plan without mutating or spending the journey pool. */
export function prepareExplorationDreamsignPlan(input: {
  effectKind: ExplorationDreamsignEffectKind;
  authoredCount?: number;
  authoredNightmareCount?: number;
  fixedDreamsignId?: string;
  actionId: string;
  journey: JourneyState;
  site: SiteState;
  content: JourneyContent;
}): PreparedExplorationDreamsignPlan {
  const index = dreamsignIdIndex(input.content);
  const poolIndex = randomPoolIdIndex(input.content);
  const held = heldIds(input.journey, index);
  const contract = contractFor(
    input.effectKind,
    input.authoredCount,
    held?.length ?? input.journey.dreamsigns.length,
    input.authoredNightmareCount,
    input.fixedDreamsignId,
  );
  const excluded = new Set((held ?? []).map((id) => id.toLowerCase()));
  const poolBeforeIds = canonicalIds(
    input.journey.remainingDreamsignPool,
    poolIndex,
    excluded,
  );
  let poolBasisIds = poolBeforeIds;
  let poolRegenerated = false;
  if (
    contract.kind !== "fixed-gain" &&
    poolBasisIds.length < contract.requestedCount
  ) {
    poolRegenerated = true;
    poolBasisIds = canonicalIds(
      input.journey.resolvedPackage?.dreamsignPoolIds ?? [],
      poolIndex,
      excluded,
    );
  }
  const requiredOverflowReplacementCount =
    held === null
      ? 0
      : contract.kind === "fixed-gain" || contract.kind === "offered-gain"
        ? Math.max(0, held.length + 1 - input.journey.maxDreamsigns)
        : contract.kind === "purge-and-gain-random"
          ? Math.max(
              0,
              held.length -
                1 +
                contract.requestedCount -
                input.journey.maxDreamsigns,
            )
          : 0;
  let reason = unavailableReason({
    contract,
    heldIds: held,
    maxDreamsigns: input.journey.maxDreamsigns,
  });
  if (
    reason === null &&
    contract.kind !== "fixed-gain" &&
    poolBasisIds.length < contract.requestedCount
  ) {
    reason = "insufficient-candidates";
  }

  let selector: RewardSelectionResult | null = null;
  if (reason === null) {
    const selectionJourney = {
      ...input.journey,
      remainingDreamsignPool: poolBasisIds,
    };
    const outcome = selectReward(
      buildRewardSelectionContext({
        journeyState: selectionJourney,
        journeyContent: input.content,
        site: input.site,
      }),
      {
        mechanicId: "gain-dreamsign",
        policyId: contract.policyId,
        scope: {
          journeySeed: input.journey.seed,
          siteUuid: input.site.id,
          selectionKey: input.actionId,
        },
        count: contract.requestedCount,
        ...(contract.fixedDreamsignId === undefined
          ? {}
          : { constraints: { fixedDreamsignId: contract.fixedDreamsignId } }),
      },
    );
    if (
      outcome.ok &&
      outcome.bindings.dreamsignIds.length === contract.requestedCount
    ) {
      selector = outcome;
    } else {
      reason = "insufficient-candidates";
    }
  }

  const preparationWithoutSignature = {
    kind: contract.kind,
    requestedCount: contract.requestedCount,
    ...(contract.requiresNightmares
      ? { nightmareCount: contract.nightmareCount }
      : {}),
    heldIdsAtPreparation: [...(held ?? [])],
    maxDreamsignsAtPreparation: input.journey.maxDreamsigns,
    poolBeforeIds,
    poolBasisIds,
    poolRegenerated,
    preparedDreamsignIds: [...(selector?.bindings.dreamsignIds ?? [])],
    requiredOverflowReplacementCount,
    ...(reason === null ? {} : { unavailableReason: reason }),
  } satisfies Omit<ExplorationDreamsignPreparation, "planSignature">;
  return {
    preparation: signedPreparation({
      effectKind: input.effectKind,
      actionId: input.actionId,
      preparation: preparationWithoutSignature,
      selector,
    }),
    selector,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    return null;
  }
  const result = value as string[];
  return new Set(result).size === result.length ? result : null;
}

function selectionHasOnly(
  selection: ExplorationDreamsignSelection,
  keys: readonly string[],
): boolean {
  return Object.keys(selection).every((key) => keys.includes(key));
}

function poolAfter(
  preparation: ExplorationDreamsignPreparation,
  gainedIds: readonly string[],
): string[] {
  const gained = new Set(gainedIds.map((id) => id.toLowerCase()));
  return preparation.poolBasisIds.filter((id) => !gained.has(id.toLowerCase()));
}

function mutation(input: {
  preparation: ExplorationDreamsignPreparation;
  afterIds: string[];
  gainedIds: string[];
  purgedIds?: string[];
  replacements?: Array<{
    removedDreamsignId: string;
    gainedDreamsignId: string;
  }>;
}): ExplorationDreamsignMutationResolution {
  return {
    beforeIds: [...input.preparation.heldIdsAtPreparation],
    afterIds: input.afterIds,
    offeredIds:
      input.preparation.kind === "fixed-gain"
        ? []
        : [...input.preparation.preparedDreamsignIds],
    gainedIds: input.gainedIds,
    purgedIds: input.purgedIds ?? [],
    replacements: input.replacements ?? [],
    poolBeforeIds: [...input.preparation.poolBeforeIds],
    poolAfterIds: poolAfter(input.preparation, input.gainedIds),
    poolRegenerated: input.preparation.poolRegenerated,
  };
}

/** Validate the signed plan and produce one complete immutable ID transition. */
export function resolveExplorationDreamsignPlan(input: {
  effectKind: ExplorationDreamsignEffectKind;
  authoredCount?: number;
  authoredNightmareCount?: number;
  fixedDreamsignId?: string;
  actionId: string;
  preparation: ExplorationDreamsignPreparation;
  selectorSignature?: string;
  selectorTrace?: RewardSelectionResult["trace"];
  journey: JourneyState;
  content: JourneyContent;
  selection: ExplorationDreamsignSelection;
}): ExplorationDreamsignMutationResolution | null {
  const index = dreamsignIdIndex(input.content);
  const poolIndex = randomPoolIdIndex(input.content);
  const held = heldIds(input.journey, index);
  if (held === null) return null;
  const contract = contractFor(
    input.effectKind,
    input.authoredCount,
    held.length,
    input.authoredNightmareCount,
    input.fixedDreamsignId,
  );
  const excluded = new Set(held.map((id) => id.toLowerCase()));
  const currentPool = canonicalIds(
    input.journey.remainingDreamsignPool,
    poolIndex,
    excluded,
  );
  const { planSignature: _planSignature, ...preparedWithoutSignature } =
    input.preparation;
  const selector =
    input.selectorSignature === undefined || input.selectorTrace === undefined
      ? null
      : {
          signature: input.selectorSignature,
          trace: input.selectorTrace,
        };
  const expectedSignature = stableDigest(
    signaturePayload({
      effectKind: input.effectKind,
      actionId: input.actionId,
      preparation: preparedWithoutSignature,
      selector,
    }),
  );
  const expectedPoolRegenerated =
    contract.kind !== "fixed-gain" &&
    currentPool.length < contract.requestedCount;
  const expectedPoolBasis = expectedPoolRegenerated
    ? canonicalIds(
        input.journey.resolvedPackage?.dreamsignPoolIds ?? [],
        poolIndex,
        excluded,
      )
    : currentPool;
  const expectedOverflow =
    contract.kind === "fixed-gain" || contract.kind === "offered-gain"
      ? Math.max(0, held.length + 1 - input.journey.maxDreamsigns)
      : contract.kind === "purge-and-gain-random"
        ? Math.max(
            0,
            held.length -
              1 +
              contract.requestedCount -
              input.journey.maxDreamsigns,
          )
        : 0;
  if (
    input.preparation.planSignature !== expectedSignature ||
    input.preparation.unavailableReason !== undefined ||
    input.preparation.kind !== contract.kind ||
    input.preparation.requestedCount !== contract.requestedCount ||
    input.preparation.nightmareCount !==
      (contract.requiresNightmares ? contract.nightmareCount : undefined) ||
    input.preparation.maxDreamsignsAtPreparation !==
      input.journey.maxDreamsigns ||
    !equalIds(input.preparation.heldIdsAtPreparation, held) ||
    !equalIds(input.preparation.poolBeforeIds, currentPool) ||
    input.preparation.poolRegenerated !== expectedPoolRegenerated ||
    !equalIds(input.preparation.poolBasisIds, expectedPoolBasis) ||
    input.preparation.requiredOverflowReplacementCount !== expectedOverflow ||
    input.preparation.preparedDreamsignIds.length !== contract.requestedCount ||
    new Set(input.preparation.preparedDreamsignIds).size !==
      contract.requestedCount ||
    input.preparation.preparedDreamsignIds.some(
      (id) =>
        excluded.has(id.toLowerCase()) ||
        (contract.kind !== "fixed-gain" &&
          !input.preparation.poolBasisIds.includes(id)) ||
        (contract.kind === "fixed-gain" && id !== contract.fixedDreamsignId),
    ) ||
    input.selectorTrace === undefined ||
    !equalIds(
      input.selectorTrace.selectedKeys,
      input.preparation.preparedDreamsignIds,
    )
  ) {
    return null;
  }

  const prepared = input.preparation.preparedDreamsignIds;
  if (contract.kind === "fixed-gain") {
    if (!selectionHasOnly(input.selection, ["replacedDreamsignId"])) {
      return null;
    }
    const gained = prepared[0];
    const replaced = stringValue(input.selection.replacedDreamsignId);
    if (gained === undefined) return null;
    if (held.length < input.journey.maxDreamsigns) {
      if (replaced !== null) return null;
      return mutation({
        preparation: input.preparation,
        afterIds: [...held, gained],
        gainedIds: [gained],
      });
    }
    const slot = replaced === null ? -1 : held.indexOf(replaced);
    if (slot < 0) return null;
    const afterIds = [...held];
    afterIds[slot] = gained;
    return mutation({
      preparation: input.preparation,
      afterIds,
      gainedIds: [gained],
      replacements: [
        {
          removedDreamsignId: replaced as string,
          gainedDreamsignId: gained,
        },
      ],
    });
  }
  if (contract.kind === "offered-gain") {
    if (
      !selectionHasOnly(input.selection, [
        "offeredDreamsignId",
        "replacedDreamsignId",
      ])
    ) {
      return null;
    }
    const offered = stringValue(input.selection.offeredDreamsignId);
    const replaced = stringValue(input.selection.replacedDreamsignId);
    if (offered === null || !prepared.includes(offered)) return null;
    if (held.length < input.journey.maxDreamsigns) {
      if (replaced !== null) return null;
      return mutation({
        preparation: input.preparation,
        afterIds: [...held, offered],
        gainedIds: [offered],
      });
    }
    const slot = replaced === null ? -1 : held.indexOf(replaced);
    if (slot < 0) return null;
    const afterIds = [...held];
    afterIds[slot] = offered;
    return mutation({
      preparation: input.preparation,
      afterIds,
      gainedIds: [offered],
      replacements: [
        {
          removedDreamsignId: replaced as string,
          gainedDreamsignId: offered,
        },
      ],
    });
  }

  if (contract.kind === "offered-replacement") {
    if (
      !selectionHasOnly(input.selection, [
        "offeredDreamsignId",
        "replacedDreamsignId",
      ])
    ) {
      return null;
    }
    const offered = stringValue(input.selection.offeredDreamsignId);
    const replaced = stringValue(input.selection.replacedDreamsignId);
    const slot = replaced === null ? -1 : held.indexOf(replaced);
    if (offered === null || !prepared.includes(offered) || slot < 0)
      return null;
    const afterIds = [...held];
    afterIds[slot] = offered;
    return mutation({
      preparation: input.preparation,
      afterIds,
      gainedIds: [offered],
      replacements: [
        {
          removedDreamsignId: replaced as string,
          gainedDreamsignId: offered,
        },
      ],
    });
  }

  if (contract.kind === "replace-all-random") {
    if (
      !selectionHasOnly(input.selection, []) ||
      Object.keys(input.selection).length > 0
    ) {
      return null;
    }
    return mutation({
      preparation: input.preparation,
      afterIds: [...prepared],
      gainedIds: [...prepared],
      replacements: held.map((removedDreamsignId, index) => ({
        removedDreamsignId,
        gainedDreamsignId: prepared[index],
      })),
    });
  }

  if (
    !selectionHasOnly(input.selection, [
      "purgedDreamsignId",
      "overflowReplacementDreamsignIds",
    ])
  ) {
    return null;
  }
  const purged = stringValue(input.selection.purgedDreamsignId);
  const overflow = stringArray(input.selection.overflowReplacementDreamsignIds);
  if (
    purged === null ||
    !held.includes(purged) ||
    overflow === null ||
    overflow.length !== input.preparation.requiredOverflowReplacementCount ||
    overflow.includes(purged) ||
    overflow.some((id) => !held.includes(id))
  ) {
    return null;
  }
  const overflowSet = new Set(overflow);
  const canonicalTargets = held.filter((id) => overflowSet.has(id));
  let preparedIndex = 0;
  const replacements: ExplorationDreamsignMutationResolution["replacements"] =
    [];
  const afterIds: string[] = [];
  for (const heldId of held) {
    if (heldId === purged) continue;
    if (overflowSet.has(heldId)) {
      const gainedDreamsignId = prepared[preparedIndex++];
      if (gainedDreamsignId === undefined) return null;
      afterIds.push(gainedDreamsignId);
      replacements.push({
        removedDreamsignId: heldId,
        gainedDreamsignId,
      });
    } else {
      afterIds.push(heldId);
    }
  }
  afterIds.push(...prepared.slice(canonicalTargets.length));
  if (afterIds.length > input.journey.maxDreamsigns) return null;
  return mutation({
    preparation: input.preparation,
    afterIds,
    gainedIds: [...prepared],
    purgedIds: [purged],
    replacements,
  });
}
