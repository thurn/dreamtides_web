import { triggerAbandonedNamedBatch } from "../../triggers/matcher";
import { definePrimitive } from "../types";

/** The named abilities of this instruction's actual abandoned character. */
export interface TriggerAbandonedNamedNode {
  readonly op: "triggerAbandonedNamed";
  readonly named: "materialized" | "dawn" | "dissolved";
}

export const triggerAbandonedNamedPrimitive = definePrimitive<TriggerAbandonedNamedNode>({
  op: "triggerAbandonedNamed",
  resolve(ctx, node, env) {
    if (env.abandonedNamed !== undefined) triggerAbandonedNamedBatch(ctx, env.abandonedNamed, node.named);
  },
});

export function triggerAbandonedNamed(named: TriggerAbandonedNamedNode["named"]): TriggerAbandonedNamedNode {
  return { op: "triggerAbandonedNamed", named };
}
