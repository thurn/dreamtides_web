/** Resolving one queued trigger (D14): the body of the `resolveTrigger` step. */
import { chooseOnResolution, conditionHolds, purposeOf, resolveEffect } from "../effects/interpreter";
import type { QueuedTrigger } from "../state/types";
import type { StepContext } from "../steps/types";
import { originAbilities } from "../rules/activation";
import { hasImmutableRepeatAllowance, hasNamedTrigger, ruleReactionBody, triggerBody } from "./body";
import { observeRuleReactions } from "./rule-reactions";

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
  const { source, controller, origin, ability, node, subject, gain, scored, discardedCount, captured, lastKnownSourceSpark, lastKnownSubjectCost, lastKnownSubjectSpark, linkedSource } = trigger;
  const body = trigger.kind === "dreamwellBonus"
    ? dreamwellBody(ctx, trigger)
    : trigger.kind === "ruleReaction" ? ruleReactionBody(ctx.catalog, origin, ability) : triggerBody(ctx.catalog, origin, ability, node);
  if (trigger.repeated !== undefined) {
    if (trigger.kind !== undefined) throw new Error("A repeated occurrence must be a triggered ability");
    const named = trigger.repeated.named;
    const repeatedBody = triggerBody(ctx.catalog, origin, ability, node);
    if (!hasNamedTrigger(repeatedBody.trigger, named)) throw new Error("A repeated occurrence has no matching named trigger");
    if (!hasImmutableRepeatAllowance(ctx.catalog, origin, ability, node, repeatedBody)) throw new Error("A repeated occurrence has spent its immutable allowance");
  }
  observeRuleReactions(ctx, [trigger]);
  const applied =
    body.condition === null ||
    conditionHolds(ctx.state, ctx.catalog, body.condition, { controller, source, optionalPaid: [] });
  ctx.emit({ kind: "triggerResolved", source, controller, ability, node, applied, ...(linkedSource === undefined ? {} : { linkedSource }) });
  if (!applied) return;
  const choices = chooseOnResolution(ctx, body.effect, controller, source, (role) => purposeOf(source, origin, ability, role), lastKnownSourceSpark, undefined, undefined, lastKnownSubjectCost ?? null);
  if (choices === null) return;
  resolveEffect(ctx, body.effect, {
    source,
    ...(trigger.triggeringAbility === undefined ? {} : { triggeringAbility: trigger.triggeringAbility }),
    ...(lastKnownSourceSpark === undefined ? {} : { lastKnownSourceSpark }),
    ...(linkedSource === undefined ? {} : { linkedSource }),
    origin,
    ability,
    root: body.root,
    subject,
    ...(trigger.handCopy === undefined ? {} : { handCopy: trigger.handCopy }),
    ...(lastKnownSubjectCost === undefined ? {} : { lastKnownSubjectCost }),
    ...(lastKnownSubjectSpark === undefined ? {} : { lastKnownSubjectSpark }),
    gain: gain ?? null,
    scored: scored ?? null,
    discardedCount: discardedCount ?? null,
    captured: captured ?? null,
    controller,
    x: null,
    optionalPaid: [],
    choices,
    resolutionChoices: true,
  });
}

function dreamwellBody(ctx: StepContext, bonus: QueuedTrigger) {
  const { source, origin, controller } = bonus;
  if (origin.kind !== "dreamwell" || typeof source === "string" || source.kind !== "dreamwell" ||
      source.id !== origin.id || source.side !== controller || bonus.node !== null || bonus.subject !== null) {
    throw new Error("Invalid Dreamwell bonus source");
  }
  const ability = originAbilities(ctx.catalog, origin)[bonus.ability];
  if (ability?.kind !== "event") throw new Error("Dreamwell bonus must be an event ability");
  return { effect: ability.effect, root: ability.effect, condition: null };
}
