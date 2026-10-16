import type { ResolvingEffect } from "../registry";
import { characteristics, copiableCostOf, filterSubjectOf, matchesFilter } from "../../continuous/characteristics";
import type { CardFilter } from "../../dsl/types";
import type { ChooseCardsPrompt, ConfirmPrompt } from "../../prompts/types";
import { instanceOf, moveToHand } from "../../rules/zones";
import { opponent, type InstanceId, type Side } from "../../state/ids";
import type { StepContext } from "../../steps/types";
import { definePrimitive, type ResolvingPrimitiveDefinition, type EffectEnv } from "../types";

/** The cards a take chooses among. */
export type AmongSource =
  /**
   * "Erode 3. … from among those cards": the nested effect resolves first,
   * and the cards it put into a void or the Banished zone are the ones
   * chosen among. Both zones are public, so both sides see the choice.
   */
  | { readonly kind: "movedBy"; readonly effect: ResolvingEffect }
  /**
   * "Look at the opponent's hand. Put a card from it …": the controller
   * alone looks at the whole hand, whichever cards the filter and cost bound
   * leave to choose (none, or every one), and keeps knowing each card while
   * it stays in that hand (view/knowledge.ts). The prompt is private to the
   * controller.
   */
  | { readonly kind: "opponentHand" };

/**
 * "Put a <filter> from among <cards> into your hand" (rules § Keywords and
 * Effects → Erode, and § Zones → Hand): the controller chooses `count` of
 * the cards `among` names that match the filter and the cost bound, all of
 * them when fewer match, and puts each into their hand (`cardTaken`) in
 * the order the cards are offered, whatever order the answer lists them.
 * With no matching card nothing is chosen.
 *
 * With `optional` ("You may") the controller takes none or the full number
 * (RD-hv-umm2.502-1): a take of one card may choose none, and a take of
 * several asks its "you may" first (`youMay`) and then chooses exactly
 * that many.
 */
export interface TakeFromAmongNode {
  readonly op: "takeFromAmong";
  readonly among: AmongSource;
  readonly filter: CardFilter;
  /** "≤N● cost": the card's copiable cost, with X counting as 0, is at most this. */
  readonly costAtMost?: number;
  /** "Put two of those cards": how many cards are taken; one when absent. */
  readonly count?: number;
  readonly optional: boolean;
}

export const takeFromAmongPrimitive: ResolvingPrimitiveDefinition<TakeFromAmongNode> = definePrimitive<TakeFromAmongNode>({
  op: "takeFromAmong",
  children: (node) => (node.among.kind === "movedBy" ? [node.among.effect] : []),
  resolve(ctx, node, env) {
    const side = env.controller;
    const among = node.among.kind === "movedBy" ? cardsMovedBy(ctx, node.among.effect, env) : lookAtOpponentHand(ctx, side);
    const layers = characteristics(ctx.state, ctx.catalog);
    const candidates = among.filter(
      (id) =>
        matchesFilter(filterSubjectOf(ctx.state, ctx.catalog, id, layers.of(id)), node.filter) &&
        (node.costAtMost === undefined || copiableCostOf(ctx.state, ctx.catalog, id) <= node.costAtMost),
    );
    if (candidates.length === 0) return;
    const count = node.count ?? 1;
    const taken = Math.min(count, candidates.length);
    if (node.optional && count > 1 && !ctx.choose<ConfirmPrompt>({ kind: "confirm", side, purpose: env.purpose("youMay") })) return;
    const fromHand = node.among.kind === "opponentHand";
    const chosen = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side,
      ...(fromHand ? { privateTo: side } : {}),
      purpose: env.purpose(fromHand ? "chooseFromOpponentHand" : "chooseAmong"),
      candidates,
      min: node.optional && count === 1 ? 0 : taken,
      max: taken,
    });
    // A chooseCards answer is a set (canonicalAnswer): the cards go to hand in the order offered.
    const picked = new Set(chosen);
    for (const id of candidates) if (picked.has(id)) take(ctx, id, side);
  },
});

/** The cards `effect` puts into a void or the Banished zone as it resolves, in the order they arrive. */
function cardsMovedBy(ctx: StepContext, effect: ResolvingEffect, env: EffectEnv): InstanceId[] {
  const since = ctx.state.clock;
  env.run(effect);
  return Object.values(ctx.state.instances)
    .filter((instance) => instance.enteredZoneAt > since && (instance.zone === "void" || instance.zone === "banished"))
    .sort((a, b) => a.enteredZoneAt - b.enteredZoneAt)
    .map((instance) => instance.id);
}

/** "Look at the opponent's hand": `side` alone sees every card in it before any is chosen. */
function lookAtOpponentHand(ctx: StepContext, side: Side): InstanceId[] {
  const hand = [...ctx.state.sides[opponent(side)].hand];
  ctx.disclose(side, hand);
  return hand;
}

/** Puts `id` into `side`'s hand and announces it; a created card ceases to exist instead. */
function take(ctx: StepContext, id: InstanceId, side: Side): void {
  const { zone: from, controller: holder } = instanceOf(ctx.state, id);
  if (moveToHand(ctx, id, side) === "hand") ctx.emit({ kind: "cardTaken", side, instance: id, from, holder });
}

/** The cards `effect` moves: "<effect>. … from among those cards …". */
export function movedBy(effect: ResolvingEffect): AmongSource {
  return { kind: "movedBy", effect };
}

/** The opponent's hand, looked at by the controller. */
export function opponentHand(): AmongSource {
  return { kind: "opponentHand" };
}

export function takeFromAmong(
  among: AmongSource,
  options: { readonly filter?: CardFilter; readonly costAtMost?: number; readonly count?: number; readonly optional?: boolean } = {},
): TakeFromAmongNode {
  const count = options.count ?? 1;
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("takeFromAmong count must be a positive safe integer");
  return {
    op: "takeFromAmong",
    among,
    filter: options.filter ?? {},
    ...(options.costAtMost === undefined ? {} : { costAtMost: options.costAtMost }),
    ...(count === 1 ? {} : { count }),
    optional: options.optional ?? false,
  };
}
