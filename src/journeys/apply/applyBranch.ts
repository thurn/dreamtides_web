// applyBranch dispatch loop.
//
// Tree-branch counterpart to `applyOption`. Same frame (locked re-check
// before any mutation, costs-then-effects, malformed-envelope tolerance),
// only indexed off `branch.id` so the log payload identifies the chosen
// branch rather than a flat-option number.
//
// `JourneyTreeTerminal` carries the same `costs[]` / `effects[]` shape as
// `JourneyTreeBranch`, so a terminal can be applied through the same
// entry point by upcasting; there is no separate `applyTerminal`.

import { logEvent } from "../../logging";

import type { JourneyContext } from "../journey/context";
import type { JourneyTreeBranch, JourneyTreeTerminal } from "../journey/manifest";

import {
  applyEntries,
  collectCostEntries,
  collectRewardEntries,
  type ApplyMeta,
  type ApplyResult,
} from "./applyShared";
import { requestIdFor } from "./chooserPlan";
import type { ChooserResolution } from "./chooserPlan";
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

  const requestId = (templateId: string): string =>
    branchRequestIdFor(branchId, templateId);
  applyEntries(costEntries, ctx, mut, resolutions, requestId);
  applyEntries(rewardEntries, ctx, mut, resolutions, requestId);

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
 * Wave 2 templates that emit more than one chooser; Wave 1 always uses 0.
 */
export function branchRequestIdFor(branchId: string, templateId: string): string {
  return requestIdFor(branchId, templateId);
}
