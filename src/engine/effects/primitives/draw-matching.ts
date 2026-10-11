import { cardMatchesFilter, matchesEveryCard } from "../../continuous/characteristics";
import { resolvePlayer } from "../../dsl/selectors";
import type { CardFilter, PlayerRef } from "../../dsl/types";
import { abilityOrigin, originAbilities } from "../../rules/activation";
import { drawCard } from "../../rules/resources";
import { SIDES, type InstanceId, type Side } from "../../state/ids";
import type { StepContext } from "../../steps/types";
import { identifies } from "../../view/knowledge";
import { everyNode } from "../interpreter";
import { definePrimitive, type EffectEnv } from "../types";

/** Draw the first matching card in deck order, without looking at or shuffling the rest. */
export interface DrawMatchingNode {
  readonly op: "drawMatching";
  readonly filter: CardFilter;
  readonly player: PlayerRef;
}

/** Whether the source's public ability determines this filter independently of a hidden branch. */
function publicFilter(ctx: StepContext, env: EffectEnv, filter: CardFilter, viewer: Side): boolean {
  if (typeof env.source === "string" && !identifies(ctx.state, env.source, viewer)) return false;
  const origin = abilityOrigin(ctx.state, env.source);
  if (origin === null || JSON.stringify(origin) !== JSON.stringify(env.origin)) return false;
  const ability = originAbilities(ctx.catalog, origin)[env.ability];
  if (ability === undefined || !("effect" in ability)) return false;
  const nodes = everyNode(ability.effect).filter((node): node is DrawMatchingNode => node.op === "drawMatching");
  // Multiple filters in one ability, or an opaque synthetic resolver, supply no public predicate proof.
  return nodes.length > 0 && nodes.every((node) =>
    node.filter.cardType === filter.cardType && node.filter.subtype === filter.subtype &&
    node.filter.costAtMost === filter.costAtMost && node.filter.costAtLeast === filter.costAtLeast,
  );
}

/** Forget only positions an unidentified removal makes ambiguous, without reading its actual index. */
function forgetAmbiguousPositions(ctx: StepContext, env: EffectEnv, node: DrawMatchingNode, deck: readonly InstanceId[], drawn: InstanceId): void {
  for (const viewer of SIDES) {
    const known = new Set(ctx.state.knownTo[viewer]);
    if (known.has(drawn)) continue;
    const predicateKnown = publicFilter(ctx, env, node.filter, viewer);
    if (predicateKnown && matchesEveryCard(node.filter)) continue; // An ordinary top draw has a public position.
    const knownMatch = predicateKnown ? deck.findIndex((id) => known.has(id) && cardMatchesFilter(ctx.state, ctx.catalog, id, node.filter)) : -1;
    const limit = knownMatch < 0 ? deck.length : knownMatch;
    const possible = deck.slice(0, limit).flatMap((id, index) => known.has(id) ? [] : [index]);
    const ambiguous = new Set(deck.filter((id, index) => known.has(id) && possible.some((place) => place < index) && possible.some((place) => place > index)));
    ctx.state.knownTo[viewer] = ctx.state.knownTo[viewer].filter((id) => !ambiguous.has(id));
  }
}

export const drawMatchingPrimitive = definePrimitive<DrawMatchingNode>({
  op: "drawMatching",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const deck = ctx.state.sides[side].deck;
    if (deck.length === 0) { drawCard(ctx, side); return; }
    const drawn = deck.find((id) => cardMatchesFilter(ctx.state, ctx.catalog, id, node.filter));
    if (drawn === undefined) return;
    forgetAmbiguousPositions(ctx, env, node, deck, drawn);
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
