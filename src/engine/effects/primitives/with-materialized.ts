import type { ResolvingEffect } from "../registry";
import type { InstanceId } from "../../state/ids";
import type { BattleState } from "../../state/types";
import { resolveNode } from "../interpreter";
import { definePrimitive, type ResolvingPrimitiveDefinition, type CapturedCardsSpec, type EffectEnv } from "../types";
import type { MaterializeNode } from "./materialize";
import type { MaterializeChosenNode } from "./materialize-chosen";
import type { MaterializeFigmentsNode } from "./materialize-figments";

/**
 * "Materialize each ≤X● cost character in your void. Banish them at end of
 * turn", or "Materialize figments. Abandon them at end of turn": resolves
 * `materialize`, then `effect` with the characters it put
 * into play bound as the captured cards (`capturedCards()`, rules § Keywords
 * and Effects → Materialize, RD-hv-umm2.392-1). The binding holds exactly the
 * cards that entered play while `materialize` resolved, in the order they
 * entered: never a card that stayed in its zone (a full back rank, a
 * reclaimed card), a card already in play, or a card another node put into
 * play. For a figment group at capacity, these are the new figments that
 * fit, with the group's spark distributed among them. A floating or delayed trigger created inside `effect` keeps the
 * binding with its controller, so its effect names the same cards when it
 * resolves later; the nearest enclosing binding applies.
 */
export interface WithMaterializedNode {
  readonly op: "withMaterialized";
  readonly materialize: MaterializeNode | MaterializeFigmentsNode | MaterializeChosenNode;
  readonly effect: ResolvingEffect;
}

/** The cards in play that entered play after `since`, in the order they entered. */
function enteredPlaySince(state: BattleState, since: number): InstanceId[] {
  return Object.values(state.instances)
    .filter((instance) => instance.zone === "play" && instance.enteredZoneAt > since)
    .sort((a, b) => a.enteredZoneAt - b.enteredZoneAt)
    .map((instance) => instance.id);
}

export const withMaterializedPrimitive: ResolvingPrimitiveDefinition<WithMaterializedNode> = definePrimitive<WithMaterializedNode>({
  op: "withMaterialized",
  children: (node) => [node.materialize, node.effect],
  resolve(ctx, node, env) {
    const since = ctx.state.clock;
    env.run(node.materialize);
    const inner: EffectEnv = {
      ...env,
      captured: enteredPlaySince(ctx.state, since),
      run(effect) {
        resolveNode(ctx, effect, inner);
      },
    };
    inner.run(node.effect);
  },
});

/** Resolves `materialize`, then `effect` with the characters it materialized as `capturedCards()`. */
export function withMaterialized(materialize: MaterializeNode | MaterializeFigmentsNode | MaterializeChosenNode, effect: ResolvingEffect): WithMaterializedNode {
  return { op: "withMaterialized", materialize, effect };
}

/** "Them": the captured cards of the nearest enclosing `withMaterialized` binding still in play. */
export function capturedCards(): CapturedCardsSpec {
  return { kind: "captured" };
}
