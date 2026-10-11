import { definePrimitive } from "../types";

/** A full controller turn after the current turn, before older extra turns (C8). */
export interface TakeExtraTurnNode {
  readonly op: "takeExtraTurn";
}

export const takeExtraTurnPrimitive = definePrimitive<TakeExtraTurnNode>({
  op: "takeExtraTurn",
  resolve(ctx, _node, env) {
    ctx.state.turn.extraTurns.push(env.controller);
    ctx.emit({ kind: "extraTurnGranted", side: env.controller, source: env.source });
  },
});

export function takeExtraTurn(): TakeExtraTurnNode {
  return { op: "takeExtraTurn" };
}
