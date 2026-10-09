/** Resolving one queued trigger (D14): the body of the `resolveTrigger` step. */
import { chooseOnResolution, conditionHolds, purposeOf, resolveEffect } from "../effects/interpreter";
import type { QueuedTrigger } from "../state/types";
import type { StepContext } from "../steps/types";
import { triggerBody } from "./body";

/**
 * Resolves `trigger`. Its intervening "if" is checked again first; if it no
 * longer holds, the trigger does nothing. Triggers do not use the stack, so
 * their modes and targets are chosen now, as prompts inside this step. A
 * trigger that empties the stack, by preventing its last card, ends the
 * priority window with it.
 */
export function resolveQueuedTrigger(ctx: StepContext, trigger: QueuedTrigger): void {
  resolveBody(ctx, trigger);
  if (ctx.state.stack.length === 0) ctx.state.priority = null;
}

function resolveBody(ctx: StepContext, trigger: QueuedTrigger): void {
  const { source, controller, origin, ability, node, subject, gain } = trigger;
  const body = triggerBody(ctx.catalog, origin, ability, node);
  const applied =
    body.condition === null ||
    conditionHolds(ctx.state, ctx.catalog, body.condition, { controller, source, optionalPaid: [] });
  ctx.emit({ kind: "triggerResolved", source, controller, ability, node, applied });
  if (!applied) return;
  const choices = chooseOnResolution(ctx, body.effect, controller, source, (role) => purposeOf(source, origin, ability, role));
  if (choices === null) return;
  resolveEffect(ctx, body.effect, { source, origin, ability, root: body.root, subject, gain: gain ?? null, controller, x: null, optionalPaid: [], choices });
}
