import { abandonCharacter } from "../../rules/costs";
import { resolveCards } from "../interpreter";
import { definePrimitive, type CapturedCardsSpec } from "../types";

/** "Abandon them": the captured materializations still in play under this effect's controller. */
export interface AbandonCardsNode {
  readonly op: "abandonCards";
  readonly cards: readonly CapturedCardsSpec[];
}

export const abandonCardsPrimitive = definePrimitive<AbandonCardsNode>({
  op: "abandonCards",
  resolve(ctx, node, env) {
    const named = [...new Set(node.cards.flatMap((ref) => resolveCards(ctx, ref, env)))];
    for (const id of named) {
      const instance = ctx.state.instances[id];
      if (instance?.zone === "play" && instance.controller === env.controller) abandonCharacter(ctx, env.controller, id);
    }
  },
});

/** Abandon each captured card once, in materialization order, if the effect's controller still controls it in play. */
export function abandonCards(cards: readonly CapturedCardsSpec[]): AbandonCardsNode {
  if (cards.length === 0) throw new Error("abandonCards needs at least one captured card reference");
  return { op: "abandonCards", cards };
}
