// applyOption dispatch loop.
//
// Walks a `JourneyOption`'s `costs[]` and `effects[]` envelopes, dispatches
// each on `templateId`, and calls the matching template's `apply` method.
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
// Wave 2 (Task 21) will widen this entry point into two phases
// (`planOption` / `commitOption`) and start populating the `resolutions`
// map. Wave 1 always returns `{ done: true }` and ignores the parameter.
//
// The screen owns the question of "which site / journey is this for", so
// the apply meta arrives as an explicit struct rather than being pulled
// from a manifest reference. Keeping the meta out of the option avoids
// re-threading manifest plumbing through the dispatch loop.

import { logEvent } from "../../logging";

import type { JourneyContext } from "../journey/context";
import type { JourneyOption } from "../journey/manifest";

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

export type { ApplyMeta, ApplyResult } from "./applyShared";

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
  const costEntries = collectCostEntries(option.costs);
  const rewardEntries = collectRewardEntries(option.effects);

  for (const entry of costEntries) {
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

  const requestId = (templateId: string): string =>
    requestIdFor(option.number, templateId);
  applyEntries(costEntries, ctx, mut, resolutions, requestId);
  applyEntries(rewardEntries, ctx, mut, resolutions, requestId);

  logEvent("dream_journey_applied", {
    siteId: meta.siteId,
    journeyId: meta.journeyId,
    shapeId: meta.shapeId,
    optionNumber: option.number,
    templateIds: [
      ...costEntries.map((e) => e.payload.templateId),
      ...rewardEntries.map((e) => e.payload.templateId),
    ],
  });

  return { done: true };
}
