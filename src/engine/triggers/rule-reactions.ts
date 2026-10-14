/** Retained knowledge of identifiable rule reactions at observable boundaries. */
import type { RuleModifierNode } from "../effects/primitives/rule-modifier";
import { sourcePrivacy, seenSource } from "../events/sources";
import type { AbilitySource, Side } from "../state/ids";
import { SIDES } from "../state/ids";
import type { QueuedTrigger } from "../state/types";
import type { StepContext } from "../steps/types";
import { ruleReactionBody } from "./body";

/** A private or unidentified source discloses no ability classification. */
export function sourceObserved(ctx: Pick<StepContext, "state">, source: AbilitySource, viewer: Side): boolean {
  const holder = sourcePrivacy(source, ctx.state);
  return (holder === null || holder === viewer) && seenSource(source, viewer, ctx.state) !== null;
}

/** Observation raises only a viewer's lower bound; authoritative admissions stay unchanged. */
export function observeRuleReactions(ctx: Pick<StepContext, "state" | "catalog">, triggers: readonly QueuedTrigger[] = ctx.state.triggerQueue): void {
  const progress = ctx.state.turnLog.dawnProgress;
  if (progress === undefined) return;
  for (const trigger of triggers) {
    if (trigger.kind !== "ruleReaction") continue;
    const viewers = SIDES.filter(viewer => sourceObserved(ctx, trigger.source, viewer));
    if (viewers.length === 0) continue;
    const root = ruleReactionBody(ctx.catalog, trigger.origin, trigger.ability).root as RuleModifierNode;
    if (root.rule !== "dawnThreshold") throw new Error("Invalid observed rule reaction");
    for (const viewer of viewers) progress.known[viewer] = Math.max(progress.known[viewer], root.count);
  }
}
