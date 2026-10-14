import { startContinuous } from "../../continuous/resolve";
import type { Duration, SelfSpec, SubjectSpec, ZoneRandomSpec } from "../../dsl/types";
import type { InstanceId } from "../../state/ids";
import type { CardCostMode } from "../../state/types";
import type { StepContext } from "../../steps/types";
import { resolveCards } from "../interpreter";
import { definePrimitive, type EffectEnv, type EffectNode } from "../types";

/**
 * "Return an enemy to hand. It costs 2● more", "Draw a ≤2● cost card. It
 * costs 0●", "Return this character to hand. It costs 0● this turn" (rules §
 * Costs, Requirements, and X → Cost changes): `effect` resolves first, and
 * each card it put into a hand gets a floating layer-6 `cardCost` change,
 * announced by `effectStarted`. `"set"` gives the card `amount`● in place of
 * its ● cost; `"increase"` makes it cost `amount`● more, `"reduce"`
 * `amount`● less. When the effect put
 * no card into a hand (no target, an empty deck, no match, a created card
 * that ceased to exist), nothing changes (RD-hv-umm2.101-2). `duration`
 * `null` takes the enclosing `forDuration`'s, else the change is permanent
 * and travels with the card (rules § Durations).
 */
export interface ModifyCardCostNode {
  readonly op: "modifyCardCost";
  readonly effect: EffectNode;
  readonly mode: CardCostMode;
  readonly amount: number;
  readonly duration: Duration | null;
}

export const modifyCardCostPrimitive = definePrimitive<ModifyCardCostNode>({
  op: "modifyCardCost",
  children: (node) => [node.effect],
  resolve(ctx, node, env) {
    const ids = movedIntoHand(ctx, node.effect, env);
    startContinuous(
      ctx,
      env,
      node.duration,
      ids,
      ids.map((instance) => ({ kind: "cardCost", instance, mode: node.mode, amount: node.amount })),
    );
  },
});

/** The cards `effect` puts into a hand as it resolves, in the order they arrive. */
function movedIntoHand(ctx: StepContext, effect: EffectNode, env: EffectEnv): InstanceId[] {
  const since = ctx.state.clock;
  const eventStart = ctx.events.length;
  env.run(effect);
  // Separately addressed cost changes apply to requested outputs, not the
  // additional copies an operation modifier produced alongside them.
  const bonuses = new Set(ctx.events.slice(eventStart).flatMap(event =>
    event.kind === "cardCopied" && event.bonusFrom !== undefined ? [event.copy] : []));
  return Object.values(ctx.state.instances)
    .filter((instance) => instance.enteredZoneAt > since && instance.zone === "hand" && !bonuses.has(instance.id))
    .sort((a, b) => a.enteredZoneAt - b.enteredZoneAt)
    .map((instance) => instance.id);
}

/** A card cost change as printed: "It costs N●", "It costs N● more", or "reduce its cost by N●". */
type CardCostChange = { readonly set: number } | { readonly increase: number } | { readonly reduce: number };

function costChange(cost: CardCostChange): [CardCostMode, number] {
  const [mode, amount]: [CardCostMode, number] = "set" in cost ? ["set", cost.set] : "increase" in cost ? ["increase", cost.increase] : ["reduce", cost.reduce];
  if (!Number.isInteger(amount) || amount < 0) throw new Error("a card cost change takes a non-negative whole energy amount");
  return [mode, amount];
}

/**
 * "<effect>. It costs N●" (`{ set: N }`), "It costs N● more" (`{ increase:
 * N }`) or "… costs N● less" (`{ reduce: N }`), for `duration` (or the
 * enclosing `forDuration`'s, else permanently). `effect` moves the card into
 * a hand: a return to hand or a draw.
 */
export function modifyCardCost(
  effect: EffectNode,
  cost: CardCostChange,
  options: { readonly duration?: Duration } = {},
): ModifyCardCostNode {
  const [mode, amount] = costChange(cost);
  return { op: "modifyCardCost", effect, mode, amount, duration: options.duration ?? null };
}

/**
 * "Reduce its cost by N●" (rules § Costs, Requirements, and X → A card's own
 * cost; RD-hv-umm2.102-2), or change the cost of random cards in a zone:
 * resolve `card` through `resolveCards`, then start a floating layer-6
 * `cardCost` change, announced by `effectStarted`, for each selected card.
 * A `SelfSpec` names the physical source. A `SubjectSpec` names the card
 * the triggering event concerns, wherever it
 * exists. A `ZoneRandomSpec` names up to `count` distinct current matching
 * cards in its player's zone, picked without targeting or replacement from
 * `random:selection`; an empty pool consumes no RNG. Selecting cards moves
 * and reveals none of them. With no selected card, nothing changes.
 * `duration` `null` takes the enclosing `forDuration`'s, else the change is
 * permanent and travels with the card. The event and view hide a change
 * from a side that cannot identify its card.
 */
export interface ChangeCardCostNode {
  readonly op: "changeCardCost";
  readonly card: SelfSpec | SubjectSpec | ZoneRandomSpec;
  readonly mode: CardCostMode;
  readonly amount: number;
  readonly duration: Duration | null;
}

export const changeCardCostPrimitive = definePrimitive<ChangeCardCostNode>({
  op: "changeCardCost",
  resolve(ctx, node, env) {
    const ids = resolveCards(ctx, node.card, env);
    startContinuous(
      ctx,
      env,
      node.duration,
      ids,
      ids.map((instance) => ({ kind: "cardCost", instance, mode: node.mode, amount: node.amount })),
    );
  },
});

/**
 * "Reduce its cost by N●" (`{ reduce: N }`), "it costs N●" (`{ set: N }`),
 * or "N● more" (`{ increase: N }`), for the physical source (`SelfSpec`),
 * the triggering card (`SubjectSpec`)
 * or up to `count` distinct current matching zone cards (`ZoneRandomSpec`,
 * such as `randomIn`). Zone picks use `random:selection` without targeting
 * or replacement, moving or revealing no cards; an empty pool consumes no
 * RNG. Explicit `duration`, then the enclosing `forDuration`'s, else
 * permanent; event and view privacy hides the cost change from a side that
 * cannot identify its card.
 */
export function changeCardCost(
  card: SelfSpec | SubjectSpec | ZoneRandomSpec,
  cost: CardCostChange,
  options: { readonly duration?: Duration } = {},
): ChangeCardCostNode {
  const [mode, amount] = costChange(cost);
  return { op: "changeCardCost", card, mode, amount, duration: options.duration ?? null };
}
