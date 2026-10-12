import { cardMatchesFilter, matchesEveryCard } from "../../continuous/characteristics";
import { resolvePlayer } from "../../dsl/selectors";
import type { CardFilter, PlayerRef } from "../../dsl/types";
import { drawCard } from "../../rules/resources";
import type { Side } from "../../state/ids";
import type { StepContext } from "../../steps/types";
import { forgetFilteredDrawPositions } from "../../view/knowledge";
import { everyNode, publicAbilityEffect } from "../interpreter";
import { definePrimitive, type EffectEnv } from "../types";

/** Draw the first matching card in deck order, without looking at or shuffling the rest. */
export interface DrawMatchingNode {
  readonly op: "drawMatching";
  readonly filter: CardFilter;
  readonly player: PlayerRef;
}

/** Whether the source's public ability determines this filter independently of a hidden branch. */
function publicFilter(ctx: StepContext, env: EffectEnv, filter: CardFilter, viewer: Side): boolean {
  const effect = publicAbilityEffect(ctx, env, viewer);
  if (effect === null) return false;
  const nodes = everyNode(effect).filter((node): node is DrawMatchingNode => node.op === "drawMatching");
  // Differing filters in one ability supply no public predicate proof.
  return nodes.length > 0 && nodes.every((node) => {
    const equal = {
      cardType: node.filter.cardType === filter.cardType,
      subtype: node.filter.subtype === filter.subtype,
      costAtMost: node.filter.costAtMost === filter.costAtMost,
      costAtLeast: node.filter.costAtLeast === filter.costAtLeast,
      sparkAtMost: node.filter.sparkAtMost === filter.sparkAtMost,
      sparkAtLeast: node.filter.sparkAtLeast === filter.sparkAtLeast,
    } satisfies Record<keyof CardFilter, boolean>;
    return Object.values(equal).every(Boolean);
  });
}

export const drawMatchingPrimitive = definePrimitive<DrawMatchingNode>({
  op: "drawMatching",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const deck = ctx.state.sides[side].deck;
    if (deck.length === 0) { drawCard(ctx, side); return; }
    const drawn = deck.find((id) => cardMatchesFilter(ctx.state, ctx.catalog, id, node.filter));
    if (drawn === undefined) return;
    forgetFilteredDrawPositions(ctx.state, deck, drawn, (viewer, known) => {
      const predicateKnown = publicFilter(ctx, env, node.filter, viewer);
      if (predicateKnown && matchesEveryCard(node.filter)) return 0; // An ordinary top draw has a public position.
      const knownMatch = predicateKnown ? deck.findIndex((id) => known.has(id) && cardMatchesFilter(ctx.state, ctx.catalog, id, node.filter)) : -1;
      return knownMatch < 0 ? deck.length : knownMatch;
    });
    // This unobservable intermediate reorder lets the ordinary draw own movement, counting and triggers.
    deck.splice(deck.indexOf(drawn), 1);
    deck.unshift(drawn);
    drawCard(ctx, side);
  },
});

/** "Draw a <filter> card": the first match; a nonempty deck without one does nothing. */
export function drawMatching(filter: CardFilter, player: PlayerRef = "you"): DrawMatchingNode {
  return { op: "drawMatching", filter, player };
}
