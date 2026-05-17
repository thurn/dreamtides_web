// applyOption two-phase dispatch loop.
//
// Walks a `JourneyOption`'s `costs[]` and `effects[]` envelopes in two
// phases. The plan phase collects chooser requests without mutation. The
// commit phase runs after every chooser has a resolution, re-checks lock
// state, and then calls matching template `apply` methods.
//
// The frame around the per-template work pins three invariants:
//
//   1. **Locked re-check before any mutation.** Every well-formed cost is
//      re-checked against the live context immediately before applying.
//      If any cost is locked, the whole apply aborts (no partial state
//      change), emits `dream_journey_locked_at_apply`, and returns
//      `{ done: true }`. This guards against generation-drift between
//      render and apply (e.g. a battle between picks consumed essence).
//
//   2. **Costs strictly before rewards.** All cost envelopes apply first
//      in array order, then all reward envelopes in array order. Symmetric
//      with the CLI's pay-then-receive convention.
//
//   3. **Malformed envelope or unknown templateId logs and continues.**
//      A single bad envelope does not abort the rest of the option; we
//      `console.warn` and keep walking. Throwing here would leave the
//      player stuck mid-apply with no recovery path.
//
// The screen owns the question of "which site / journey is this for", so
// the apply meta arrives as an explicit struct rather than being pulled
// from a manifest reference. Keeping the meta out of the option avoids
// re-threading manifest plumbing through the dispatch loop.

import { logEvent } from "../../logging";

import type { JourneyContext } from "../journey/context";
import type { JourneyOption } from "../journey/manifest";

import {
  collectApplyEntries,
  commitEntries,
  planEntries,
  type ApplyMeta,
  type ApplyResult,
  type CollectedApplyEntries,
} from "./applyShared";
import { requestIdFor } from "./chooserPlan";
import type { ChooserRequest, ChooserResolution } from "./chooserPlan";
import type { JourneyMutations } from "./JourneyMutations";

export type { ApplyMeta, ApplyResult } from "./applyShared";

/** Collect every chooser required by `option`, in cost-then-effect order. */
export function planOption(
  option: JourneyOption,
  ctx: JourneyContext,
  resolutions: ReadonlyMap<string, ChooserResolution> = new Map(),
): ChooserRequest[] {
  const entries = collectApplyEntries(option.costs, option.effects);
  return planOptionEntries(option, ctx, resolutions, entries);
}

function planOptionEntries(
  option: JourneyOption,
  ctx: JourneyContext,
  resolutions: ReadonlyMap<string, ChooserResolution>,
  entries: CollectedApplyEntries,
): ChooserRequest[] {
  return planEntries(
    entries.entries,
    ctx,
    resolutions,
    (templateId, slot) => requestIdFor(option.number, templateId, slot),
  );
}

function commitOptionEntries(
  option: JourneyOption,
  ctx: JourneyContext,
  mut: JourneyMutations,
  resolutions: ReadonlyMap<string, ChooserResolution>,
  entries: CollectedApplyEntries,
): void {
  commitEntries(
    entries.entries,
    ctx,
    mut,
    resolutions,
    (templateId, slot) => requestIdFor(option.number, templateId, slot),
  );
}

/**
 * Apply every cost and effect on `option` against `mut`. See the module
 * comment for the contract.
 */
export function applyOption(
  option: JourneyOption,
  meta: ApplyMeta,
  ctx: JourneyContext,
  mut: JourneyMutations,
  resolutions?: ReadonlyMap<string, ChooserResolution>,
): ApplyResult {
  const entries = collectApplyEntries(option.costs, option.effects);
  const safeResolutions = resolutions ?? new Map();
  const plan = planOptionEntries(option, ctx, safeResolutions, entries);
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
        optionNumber: option.number,
        lockedTemplateId: entry.payload.templateId,
      });
      return { done: true };
    }
  }

  commitOptionEntries(option, ctx, mut, safeResolutions, entries);

  logEvent("dream_journey_applied", {
    siteId: meta.siteId,
    journeyId: meta.journeyId,
    shapeId: meta.shapeId,
    optionNumber: option.number,
    templateIds: [
      ...entries.costEntries.map((e) => e.payload.templateId),
      ...entries.rewardEntries.map((e) => e.payload.templateId),
    ],
  });

  return { done: true };
}
