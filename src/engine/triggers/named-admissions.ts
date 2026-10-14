/** Synchronous, complete-batch observation of actual named-bearing admissions. */
import { isNamedTrigger } from "../dsl/abilities";
import type { Trigger } from "../dsl/types";
import { endBattle } from "../rules/victory";
import type { QueuedTrigger } from "../state/types";
import type { StepContext } from "../steps/types";

/** The exact queued occurrence and the descriptor selected when it was admitted. */
export interface NamedAdmission {
  readonly queued: QueuedTrigger;
  readonly trigger: Trigger;
}

/** Completes the current step immediately after a proved admission-only draw. */
export class AdmissionCycleDraw extends Error {}

function namedBearing(trigger: Trigger): boolean {
  return trigger.on === "either" ? trigger.triggers.some(namedBearing) : isNamedTrigger(trigger.on);
}

/**
 * Each root has its own ancestry: independent identical occasions all react.
 * No body resolves here. Eligibility can change only by consuming one of the
 * step's monotone once-per-turn or one-shot allowances. At an unchanged
 * revision, repeating an exact occurrence on its own ancestry proves an
 * unavoidable admission cycle, even when a waiting body would be optional.
 */
export function observeNamedAdmissions(
  ctx: StepContext,
  roots: readonly NamedAdmission[],
  match: (admission: NamedAdmission) => readonly NamedAdmission[],
  hasObservers: () => boolean,
): void {
  let wave = roots.filter(({ trigger }) => namedBearing(trigger)).map(admission => ({ admission, ancestry: new Set<string>() }));
  if (wave.length === 0 || !hasObservers()) return;
  while (wave.length > 0) {
    const next: typeof wave = [];
    for (const { admission, ancestry } of wave) {
      // Processing-time revisions are used consistently, including when a
      // sibling consumed an allowance after this occurrence was enqueued.
      const key = JSON.stringify([admission, ctx.triggerUses.oncePerTurn.length, ctx.triggerUses.once.size]);
      if (ancestry.has(key)) {
        endBattle(ctx, { kind: "draw", reason: "mandatoryLoop" });
        throw new AdmissionCycleDraw();
      }
      const parents = new Set([...ancestry, key]);
      for (const child of match(admission)) {
        if (namedBearing(child.trigger)) next.push({ admission: child, ancestry: parents });
      }
    }
    wave = next;
  }
}
