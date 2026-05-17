// applyBranch two-phase dispatch loop.
//
// Tree-branch counterpart to `applyOption`. Same two-phase frame
// (plan chooser requests, wait for every resolution, locked re-check before
// mutation, costs-then-effects, malformed-envelope tolerance), only indexed
// off `branch.id` so the log payload identifies the chosen branch rather
// than a flat-option number.
//
// `JourneyTreeTerminal` carries the same `costs[]` / `effects[]` shape as
// `JourneyTreeBranch`, so a terminal can be applied through the same
// entry point by upcasting; there is no separate `applyTerminal`.

import { logEvent } from "../../logging";

import type { JourneyContext } from "../journey/context";
import type { JourneyTreeBranch, JourneyTreeTerminal } from "../journey/manifest";

import {
  collectApplyEntries,
  commitPlannedEntries,
  planEntries,
  type ApplyMeta,
  type ApplyResult,
  type CollectedApplyEntries,
} from "./applyShared";
import { requestIdFor } from "./chooserPlan";
import type { ChooserRequest, ChooserResolution } from "./chooserPlan";
import type { JourneyMutations } from "./JourneyMutations";

/**
 * The structural subset of a branch / terminal that `applyBranch` reads.
 * Terminal records satisfy this without an explicit cast: both carry
 * `costs[]` and `effects[]` of `unknown[]`, and a terminal has no `id`
 * field — the `branchId` log payload falls back to `"terminal"` when
 * absent.
 */
export type ApplyableBranchLike = Pick<
  JourneyTreeBranch | JourneyTreeTerminal,
  "costs" | "effects"
> & {
  readonly id?: string;
};

/** Collect every chooser required by `branch`, in cost-then-effect order. */
export function planBranch(
  branch: ApplyableBranchLike,
  ctx: JourneyContext,
  resolutions: ReadonlyMap<string, ChooserResolution> = new Map(),
): ChooserRequest[] {
  const branchId = branch.id ?? "terminal";
  const entries = collectApplyEntries(branch.costs, branch.effects);
  return planBranchEntries(branchId, ctx, resolutions, entries);
}

function planBranchEntries(
  branchId: string,
  ctx: JourneyContext,
  resolutions: ReadonlyMap<string, ChooserResolution>,
  entries: CollectedApplyEntries,
): ChooserRequest[] {
  return planEntries(
    entries.entries,
    ctx,
    resolutions,
    (templateId, occurrenceIndex, slot) =>
      branchRequestIdForEntry(branchId, templateId, occurrenceIndex, slot),
  );
}

function commitBranchEntries(
  branchId: string,
  ctx: JourneyContext,
  mut: JourneyMutations,
  resolutions: ReadonlyMap<string, ChooserResolution>,
  entries: CollectedApplyEntries,
): void {
  commitPlannedEntries(
    entries.entries,
    ctx,
    mut,
    resolutions,
    (templateId, occurrenceIndex, slot) =>
      branchRequestIdForEntry(branchId, templateId, occurrenceIndex, slot),
  );
}

/**
 * Apply every cost and effect on `branch` against `mut`. See `applyOption`
 * for the contract; the only branch-specific detail is that the log payload
 * carries `branchId` instead of `optionNumber`.
 */
export function applyBranch(
  branch: ApplyableBranchLike,
  meta: ApplyMeta,
  ctx: JourneyContext,
  mut: JourneyMutations,
  resolutions?: ReadonlyMap<string, ChooserResolution>,
): ApplyResult {
  const branchId = branch.id ?? "terminal";
  const entries = collectApplyEntries(branch.costs, branch.effects);
  const safeResolutions = resolutions ?? new Map();
  const plan = planBranchEntries(branchId, ctx, safeResolutions, entries);
  const nextMissing = plan.find((request) => !safeResolutions.has(request.requestId));
  if (nextMissing !== undefined) {
    return { done: false, needsChoice: nextMissing };
  }

  for (const entry of entries.costEntries) {
    if (entry.template.locked(entry.payload.params, ctx)) {
      logEvent("dream_journey_locked_at_apply", {
        siteId: meta.siteId,
        journeyId: meta.journeyId,
        shapeId: meta.shapeId,
        branchId,
        lockedTemplateId: entry.payload.templateId,
      });
      return { done: true };
    }
  }

  commitBranchEntries(branchId, ctx, mut, safeResolutions, entries);

  logEvent("dream_journey_applied", {
    siteId: meta.siteId,
    journeyId: meta.journeyId,
    shapeId: meta.shapeId,
    branchId,
    templateIds: [
      ...entries.costEntries.map((e) => e.payload.templateId),
      ...entries.rewardEntries.map((e) => e.payload.templateId),
    ],
  });

  return { done: true };
}

/**
 * Branch-scoped analogue of `requestIdFor`. The `:0` slot is reserved for
 * the first chooser emitted by a template in this branch.
 */
export function branchRequestIdFor(
  branchId: string,
  templateId: string,
  slot: number = 0,
): string {
  return requestIdFor(branchId, templateId, slot);
}

function branchRequestIdForEntry(
  branchId: string,
  templateId: string,
  occurrenceIndex: number,
  slot: number,
): string {
  const scope = occurrenceIndex === 0 ? branchId : `${branchId}:entry:${occurrenceIndex}`;
  return requestIdFor(scope, templateId, slot);
}
