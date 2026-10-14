import { matchingCharacters } from "../../dsl/selectors";
import type { CharacterSelector, StackItemSelector, StackTargetSpec } from "../../dsl/types";
import type { ChooseCardsPrompt, ConfirmPrompt, PayOrDeclinePrompt } from "../../prompts/types";
import { abandonCharacter } from "../../rules/costs";
import { spendEnergy } from "../../rules/resources";
import { preventCard, type PreventDestination } from "../../rules/stack";
import { opponent, type InstanceId, type Side } from "../../state/ids";
import type { StepContext } from "../../steps/types";
import { resolveStackTargets, resolvingSourceSpark, resolvingSourceCounters } from "../interpreter";
import { cardTarget, definePrimitive, type EffectEnv } from "../types";

/** The characters an "unless the opponent abandons" cost accepts, relative to the opponent who pays it. */
export type UnlessAbandonsPredicate = Omit<CharacterSelector, "controller">;

/**
 * "Prevent a card": the chosen card leaves the stack without resolving and
 * goes to its owner's void, or to `destination` for the "put it on top or on
 * the bottom of its owner's deck", "into its owner's hand", and "put that card into your
 * hand" variants. With `unlessPays`, the opponent of the prevent's
 * controller may pay that much ● to keep the card on the stack. With
 * `unlessAbandons`, that opponent may instead abandon a character they
 * control matching the predicate: they first accept or decline, then choose
 * the character; with no matching character the card is prevented without a
 * choice. Cards that cannot be prevented are never candidates.
 */
export interface PreventNode {
  readonly op: "prevent";
  readonly subject: StackTargetSpec;
  readonly unlessPays: number | null;
  readonly unlessAbandons: UnlessAbandonsPredicate | null;
  readonly destination: PreventDestination;
}

/** Whether the opponent pays `energy` to keep the card on the stack; spends it when they do. */
function paysEnergy(ctx: StepContext, env: EffectEnv, payer: Side, energy: number): boolean {
  const pays = ctx.choose<PayOrDeclinePrompt>({
    kind: "payOrDecline",
    side: payer,
    purpose: env.purpose("preventUnlessPays"),
    energy,
    payable: ctx.state.sides[payer].currentEnergy >= energy,
  });
  if (pays) spendEnergy(ctx, payer, energy);
  return pays;
}

/**
 * Whether the opponent abandons a matching character they control to keep
 * the card on the stack (rules § Prevent): a public accept-or-decline, then
 * a non-targeting choice among the same characters. No prompt opens when
 * they control none.
 */
function abandons(ctx: StepContext, env: EffectEnv, payer: Side, predicate: UnlessAbandonsPredicate): boolean {
  const candidates: InstanceId[] = matchingCharacters(ctx.state, ctx.catalog, { ...predicate, controller: "you" }, payer, env.source, env.x ?? undefined, resolvingSourceSpark(ctx, env), resolvingSourceCounters(ctx, env));
  if (candidates.length === 0) return false;
  const accepts = ctx.choose<ConfirmPrompt>({ kind: "confirm", side: payer, purpose: env.purpose("preventUnlessAbandons") });
  if (!accepts) return false;
  const [chosen] = ctx.choose<ChooseCardsPrompt>({
    kind: "chooseCards",
    side: payer,
    purpose: env.purpose("abandon"),
    candidates,
    min: 1,
    max: 1,
  });
  if (chosen === undefined) throw new Error("preventUnlessAbandons answered with no character");
  abandonCharacter(ctx, payer, chosen);
  return true;
}

export const preventPrimitive = definePrimitive<PreventNode>({
  op: "prevent",
  targets: (node) => cardTarget(node.subject),
  resolve(ctx, node, env) {
    for (const id of resolveStackTargets(ctx, node.subject, env)) {
      const payer = opponent(env.controller);
      if (node.unlessPays !== null && paysEnergy(ctx, env, payer, node.unlessPays)) continue;
      if (node.unlessAbandons !== null && abandons(ctx, env, payer, node.unlessAbandons)) continue;
      preventCard(ctx, id, node.destination, env.controller);
    }
  },
});

/** At most one "unless" cost: pay N●, or abandon a matching character. */
export type PreventUnless =
  | { readonly unlessPays?: number; readonly unlessAbandons?: never }
  | { readonly unlessAbandons: UnlessAbandonsPredicate; readonly unlessPays?: never };

/**
 * "Prevent a card on the stack matching `selector`", optionally "unless the
 * opponent pays N●" or "unless the opponent abandons a <predicate>
 * character", and with a destination other than the void.
 */
export function prevent(
  selector: StackItemSelector,
  options: PreventUnless & { readonly destination?: PreventDestination } = {},
): PreventNode {
  return {
    op: "prevent",
    subject: { kind: "stackTarget", selector: { ...selector, preventable: true } },
    unlessPays: options.unlessPays ?? null,
    unlessAbandons: options.unlessAbandons ?? null,
    destination: options.destination ?? "void",
  };
}
