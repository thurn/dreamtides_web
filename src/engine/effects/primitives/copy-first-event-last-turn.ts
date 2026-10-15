import { instanceCard } from "../../catalog";
import { createCapturedHandCopy } from "../../rules/copies";
import { sidesBlindTo } from "../../view/knowledge";
import { definePrimitive } from "../types";

/** The controller's first actual event in the preceding completed global turn (C3). */
export interface CopyFirstEventLastTurnToHandNode {
  readonly op: "copyFirstEventLastTurnToHand";
  readonly ephemeral: true;
}

export const copyFirstEventLastTurnToHandPrimitive = definePrimitive<CopyFirstEventLastTurnToHandNode>({
  op: "copyFirstEventLastTurnToHand",
  resolve(ctx, node, env) {
    if (node.ephemeral !== true) throw new Error("A first-event hand copy requires Ephemeral");
    if (ctx.state.turn.turnNumber <= 1) return;
    const previous = ctx.state.firstEventHistory?.previous;
    if (previous == null) throw new Error("A first-event hand copy requires known previous-turn history");
    const source = previous[env.controller];
    if (source === null) return;
    const captured = structuredClone(source);
    if (captured?.printing.kind !== "card") throw new Error("A first-event hand copy requires card values");
    // Resolve the full catalog/variant before allocating or publishing a card.
    const definition = instanceCard(ctx.catalog, captured);
    if (definition.cardType !== "event") throw new Error("A first-event hand copy must describe an event");
    definition.abilities(captured.variant);
    createCapturedHandCopy(ctx, captured.instance, { printing: captured.printing, variant: captured.variant,
      ephemeral: true, copier: env.controller, originalHiddenFrom: sidesBlindTo(ctx.state, captured.instance) }, env.controller);
  },
});

export function copyFirstEventLastTurnToHand(options: { readonly ephemeral: true }): CopyFirstEventLastTurnToHandNode {
  if (options?.ephemeral !== true) throw new Error("A first-event hand copy requires Ephemeral");
  return { op: "copyFirstEventLastTurnToHand", ephemeral: true };
}
