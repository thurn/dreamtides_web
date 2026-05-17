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
  commitEntries,
  collectCostEntries,
  collectRewardEntries,
  planEntries,
  type ApplyMeta,
  type ApplyResult,
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
): ChooserRequest[] {
  const branchId = branch.id ?? "terminal";
  const costEntries = collectCostEntries(branch.costs);
  const rewardEntries = collectRewardEntries(branch.effects);
  return planEntries(
    [...costEntries, ...rewardEntries],
    ctx,
    (templateId, slot) => branchRequestIdFor(branchId, templateId, slot),
  );
}

/** Apply `branch` after the caller has supplied every planned resolution. */
export function commitBranch(
  branch: ApplyableBranchLike,
  ctx: JourneyContext,
  mut: JourneyMutations,
  resolutions: ReadonlyMap<string, ChooserResolution>,
): void {
  const branchId = branch.id ?? "terminal";
  const costEntries = collectCostEntries(branch.costs);
  const rewardEntries = collectRewardEntries(branch.effects);
  commitEntries(
    [...costEntries, ...rewardEntries],
    ctx,
    mut,
    resolutions,
    (templateId, slot) => branchRequestIdFor(branchId, templateId, slot),
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
  const plan = planBranch(branch, ctx);
  const nextMissing = plan.find((request) => !resolutions?.has(request.requestId));
  if (nextMissing !== undefined) {
    return { done: false, needsChoice: nextMissing };
  }

  const costEntries = collectCostEntries(branch.costs);
  const rewardEntries = collectRewardEntries(branch.effects);

  for (const entry of costEntries) {
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

  commitBranch(branch, ctx, mut, resolutions ?? new Map());

  logEvent("dream_journey_applied", {
    siteId: meta.siteId,
    journeyId: meta.journeyId,
    shapeId: meta.shapeId,
    branchId,
    templateIds: [
      ...costEntries.map((e) => e.payload.templateId),
      ...rewardEntries.map((e) => e.payload.templateId),
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
