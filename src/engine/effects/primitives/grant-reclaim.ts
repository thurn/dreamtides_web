import { startContinuous } from "../../continuous/resolve";
import type { Cost, Duration, ZoneCardSpec } from "../../dsl/types";
import type { InstanceId } from "../../state/ids";
import type { ContinuousChange } from "../../state/types";
import type { StepContext } from "../../steps/types";
import { resolveCards } from "../interpreter";
import { cardTarget, definePrimitive, type EffectEnv, type EffectNode } from "../types";

/**
 * "Erode 1. That card gains reclaim": the nested effect resolves first, and
 * the cards it put into a void, in the order they arrived, are the ones that
 * gain Reclaim.
 */
export interface ReclaimMovedBy {
  readonly kind: "movedBy";
  readonly effect: EffectNode;
}

/** The void cards a grant names: a reference to cards in a void, or the cards a nested effect put there. */
export type ReclaimCards = ZoneCardSpec | ReclaimMovedBy;

/**
 * "Choose a card in your void to gain reclaim", "That card gains reclaim
 * 0●", "Until end of turn, cards in your void gain reclaim" (rules §
 * Keywords and Effects → Reclaim): each card `cards` names in a void as it
 * resolves gains Reclaim (layer 3) through a floating change announced by
 * `effectStarted`, with `costs` when the text states a Reclaim cost. A card
 * with a granted cost is played from the void for those costs in place of a
 * printed or deck-entry Reclaim cost (rules/timing.ts `routeCosts`); plain
 * Reclaim keeps the cost it had. `duration` `null` takes the enclosing
 * `forDuration`'s, else the gain is permanent and travels with the card
 * (rules § Zone Changes). It only names void cards, which are public, so the
 * public `effectStarted` event names no hidden card.
 */
export interface GrantReclaimNode {
  readonly op: "grantReclaim";
  readonly cards: ReclaimCards;
  /** "Reclaim N●": the costs of playing the card by the granted Reclaim; `null` for plain Reclaim. */
  readonly costs: readonly Cost[] | null;
  readonly duration: Duration | null;
}

export const grantReclaimPrimitive = definePrimitive<GrantReclaimNode>({
  op: "grantReclaim",
  children: (node) => (node.cards.kind === "movedBy" ? [node.cards.effect] : []),
  targets: (node) => (node.cards.kind === "movedBy" ? [] : cardTarget(node.cards)),
  resolve(ctx, node, env) {
    const named = node.cards.kind === "movedBy" ? movedIntoVoid(ctx, node.cards.effect, env) : resolveCards(ctx, node.cards, env);
    const ids = [...new Set(named)].filter((id) => ctx.state.instances[id]?.zone === "void");
    const { costs } = node;
    const changes = ids.map(
      (instance): ContinuousChange => ({
        kind: "keyword",
        instance,
        keyword: "reclaim",
        gains: true,
        ...(costs === null ? {} : { reclaimCosts: costs }),
      }),
    );
    startContinuous(ctx, env, node.duration, ids, changes);
  },
});

/** The cards `effect` puts into a void as it resolves, in the order they arrive. */
function movedIntoVoid(ctx: StepContext, effect: EffectNode, env: EffectEnv): InstanceId[] {
  const since = ctx.state.clock;
  env.run(effect);
  return Object.values(ctx.state.instances)
    .filter((instance) => instance.enteredZoneAt > since && instance.zone === "void")
    .sort((a, b) => a.enteredZoneAt - b.enteredZoneAt)
    .map((instance) => instance.id);
}

/** "<effect>. That card …": the cards `effect` puts into a void. */
export function reclaimMovedBy(effect: EffectNode): ReclaimMovedBy {
  return { kind: "movedBy", effect };
}

/**
 * "<cards> gain(s) reclaim", or "reclaim N●" with `costs`, for `duration`
 * (or the enclosing `forDuration`'s, else permanently). `cards` names cards
 * in a void only.
 */
export function grantReclaim(
  cards: ReclaimCards,
  options: { readonly costs?: readonly Cost[]; readonly duration?: Duration } = {},
): GrantReclaimNode {
  if (cards.kind === "inZone" && cards.zone !== "void") throw new Error("grantReclaim names cards in a void only");
  return { op: "grantReclaim", cards, costs: options.costs ?? null, duration: options.duration ?? null };
}
