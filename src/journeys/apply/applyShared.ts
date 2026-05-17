// Shared dispatch-loop helpers for `applyOption` and `applyBranch`.
//
// Both entry points walk a `costs[]` / `effects[]` pair, narrow each
// envelope, resolve its templateId to a catalog entry, run the locked
// re-check, and (on success) call `template.apply`. Factoring the
// narrow-and-resolve step keeps the two entry points byte-identical in
// their inner loop so a future regression in one cannot diverge from
// the other.

import type { JourneyContext } from "../journey/context";
import { findCost } from "../journey/shared/costs";
import { findReward } from "../journey/shared/rewards";
import type { Cost, Reward } from "../journey/shared/types";

import type { ChooserRequest, ChooserResolution } from "./chooserPlan";
import type { JourneyMutations } from "./JourneyMutations";
import {
  narrowSharedCostPayload,
  narrowSharedRewardPayload,
  type SharedCostPayload,
  type SharedRewardPayload,
} from "./payloads";

/** Identifier metadata the screen owns and threads into every apply call. */
export interface ApplyMeta {
  readonly siteId: string;
  readonly journeyId: string;
  readonly shapeId: string;
}

export type { ApplyResult } from "./chooserPlan";

/** Narrowed + resolved cost envelope ready for the apply pass. */
export interface CostEntry {
  payload: SharedCostPayload;
  template: Cost;
}

/** Narrowed + resolved reward envelope ready for the apply pass. */
export interface RewardEntry {
  payload: SharedRewardPayload;
  template: Reward;
}

export type ApplyEntry = CostEntry | RewardEntry;

type RequestIdForEntry = (templateId: string, slot: number) => string;

/** Narrow a raw `costs[]` array into resolved template entries. Malformed
 *  envelopes and unknown templateIds warn and drop out of the result. */
export function collectCostEntries(raw: readonly unknown[]): CostEntry[] {
  const out: CostEntry[] = [];
  for (const value of raw) {
    const payload = narrowSharedCostPayload(value);
    if (payload === null) {
      console.warn("[dream_journey] dropping malformed cost envelope", value);
      continue;
    }
    const template = findCost(payload.templateId);
    if (template === undefined) {
      console.warn(
        `[dream_journey] dropping cost envelope with unknown templateId: ${payload.templateId}`,
      );
      continue;
    }
    out.push({ payload, template });
  }
  return out;
}

/** Mirror of `collectCostEntries` for reward (`effects[]`) arrays. */
export function collectRewardEntries(raw: readonly unknown[]): RewardEntry[] {
  const out: RewardEntry[] = [];
  for (const value of raw) {
    const payload = narrowSharedRewardPayload(value);
    if (payload === null) {
      console.warn("[dream_journey] dropping malformed reward envelope", value);
      continue;
    }
    const template = findReward(payload.templateId);
    if (template === undefined) {
      console.warn(
        `[dream_journey] dropping reward envelope with unknown templateId: ${payload.templateId}`,
      );
      continue;
    }
    out.push({ payload, template });
  }
  return out;
}

/** Collect chooser requests from resolved entries without applying mutations. */
export function planEntries(
  entries: ReadonlyArray<ApplyEntry>,
  ctx: JourneyContext,
  requestIdForEntry: RequestIdForEntry,
): ChooserRequest[] {
  const out: ChooserRequest[] = [];
  const slotsByTemplateId = new Map<string, number>();
  for (const { payload, template } of entries) {
    const request = template.choosePlan?.(payload.params, ctx);
    if (request !== undefined) {
      const slot = slotsByTemplateId.get(payload.templateId) ?? 0;
      slotsByTemplateId.set(payload.templateId, slot + 1);
      out.push({
        ...request,
        requestId: requestIdForEntry(payload.templateId, slot),
      });
    }
  }
  return out;
}

/** Apply loop. Costs and rewards both flow through this with the same
 *  `(params, ctx, mut, resolution)` calling convention. Caller controls
 *  ordering through the `entries` array. */
export function commitEntries(
  entries: ReadonlyArray<ApplyEntry>,
  ctx: JourneyContext,
  mut: JourneyMutations,
  resolutions: ReadonlyMap<string, ChooserResolution>,
  requestIdForEntry: RequestIdForEntry,
): void {
  const slotsByTemplateId = new Map<string, number>();
  for (const { payload, template } of entries) {
    const request = template.choosePlan?.(payload.params, ctx);
    const slot = slotsByTemplateId.get(payload.templateId) ?? 0;
    if (request !== undefined) {
      slotsByTemplateId.set(payload.templateId, slot + 1);
    }
    const resolution =
      request === undefined
        ? undefined
        : resolutions.get(requestIdForEntry(payload.templateId, slot));
    template.apply(payload.params, ctx, mut, resolution);
  }
}
