import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef } from "../../dsl/types";
import { definePrimitive } from "../types";

/** Additional cards requested by a player's actual Draw phase, held only as a static ability. */
export interface AdditionalDrawPhaseCardsNode {
  readonly op: "additionalDrawPhaseCards";
  readonly player: PlayerRef;
  readonly count: number;
}

function checkCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("An additional Draw-phase count must be a non-negative safe integer");
  }
}

export const additionalDrawPhaseCardsPrimitive = definePrimitive<AdditionalDrawPhaseCardsNode>({
  op: "additionalDrawPhaseCards",
  staticOnly: true,
  resolve() { throw new Error("additionalDrawPhaseCards belongs to a static ability"); },
  continuous: {
    layer: 6,
    changes(node, env) {
      checkCount(node.count);
      return [{ kind: "additionalDrawPhaseCards", player: resolvePlayer(env.controller, node.player), count: node.count }];
    },
  },
});

/** Each applicable held copy adds its count before the player's ordinary Draw-phase card is drawn. */
export function additionalDrawPhaseCards(player: PlayerRef, count: number): AdditionalDrawPhaseCardsNode {
  checkCount(count);
  return { op: "additionalDrawPhaseCards", player, count };
}
