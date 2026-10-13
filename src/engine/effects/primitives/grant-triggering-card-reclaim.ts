import { startContinuous } from "../../continuous/resolve";
import type { Cost, SubjectSpec } from "../../dsl/types";
import type { ContinuousChange } from "../../state/types";
import { resolveCards } from "../interpreter";
import { definePrimitive } from "../types";

/** A play trigger's Reclaim gain follows its physical subject across zones (RD-hv-umm2.612-1). */
export interface GrantTriggeringCardReclaimNode {
  readonly op: "grantTriggeringCardReclaim";
  readonly card: SubjectSpec;
  readonly costs: readonly Cost[];
}

export const grantTriggeringCardReclaimPrimitive = definePrimitive<GrantTriggeringCardReclaimNode>({
  op: "grantTriggeringCardReclaim",
  resolve(ctx, node, env) {
    const ids = resolveCards(ctx, node.card, env);
    if (ids.length === 0) return;
    const changes = ids.map((instance): ContinuousChange => ({
      kind: "keyword", instance, keyword: "reclaim", gains: true, reclaimCosts: node.costs,
    }));
    startContinuous(ctx, env, null, ids, changes);
  },
});

/** Grants the played physical subject the stated Reclaim costs, wherever it exists. */
export function grantTriggeringCardReclaim(card: SubjectSpec, costs: readonly Cost[]): GrantTriggeringCardReclaimNode {
  return { op: "grantTriggeringCardReclaim", card, costs };
}
