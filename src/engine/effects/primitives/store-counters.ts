import type { ValueExpr } from "../../dsl/types";
import { sourceInstance } from "../../state/ids";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "Store N⧗" (rules § Counters): adds N counters to the source's stored ⧗
 * and announces the new total with `countersChanged`. Only a card in play
 * stores counters: a source that has left play as the effect resolves (to a
 * void, a hand, the Banished zone, or by ceasing to exist) stores nothing
 * and nothing is announced (RD-hv-umm2.94-1). An emblem stores no counters,
 * so a dreamsign or avatar holding this effect is a definition error.
 */
export interface StoreCountersNode {
  readonly op: "storeCounters";
  readonly amount: ValueExpr;
}

export const storeCountersPrimitive = definePrimitive<StoreCountersNode>({
  op: "storeCounters",
  resolve(ctx, node, env) {
    const source = sourceInstance(env.source);
    if (source === null) throw new Error("an emblem stores no counters");
    const amount = evaluate(ctx, node.amount, env);
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`cannot store ${String(amount)}⧗`);
    const instance = ctx.state.instances[source];
    if (instance?.zone !== "play" || amount === 0) return;
    instance.status.counters += amount;
    ctx.emit({ kind: "countersChanged", instance: source, counters: instance.status.counters });
  },
});

/** "Store N⧗" on the source. */
export function storeCounters(amount: ValueExpr): StoreCountersNode {
  return { op: "storeCounters", amount };
}
