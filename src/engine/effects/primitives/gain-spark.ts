import type { CharacterRef, Duration, ValueExpr } from "../../dsl/types";
import { instanceOf } from "../../rules/zones";
import { evaluate, resolveCharacters } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "This character gains +N✦", permanently (gained spark travels with the
 * card) or until end of turn (removed during Ending wherever the card is).
 * The amount is locked when the effect resolves.
 */
export interface GainSparkNode {
  readonly op: "gainSpark";
  readonly subject: CharacterRef;
  readonly amount: ValueExpr;
  readonly duration: Duration;
}

export const gainSparkPrimitive = definePrimitive<GainSparkNode>({
  op: "gainSpark",
  targets: (node) => (node.subject.kind === "target" ? [node.subject] : []),
  resolve(ctx, node, env) {
    const amount = evaluate(ctx, node.amount, env);
    for (const id of resolveCharacters(ctx, node.subject, env)) {
      const status = instanceOf(ctx.state, id).status;
      if (node.duration === "permanent") {
        status.gainedSpark += amount;
      } else {
        status.turnSpark += amount;
      }
      ctx.emit({ kind: "sparkGained", instance: id, amount, duration: node.duration });
    }
  },
});

export function gainSpark(
  subject: CharacterRef,
  amount: ValueExpr,
  duration: Duration = "permanent",
): GainSparkNode {
  return { op: "gainSpark", subject, amount, duration };
}
