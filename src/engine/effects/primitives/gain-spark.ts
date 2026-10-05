import type { CharacterRef, Duration, ValueExpr } from "../../dsl/types";
import { startDuration } from "../../rules/durations";
import { addFloating } from "../../rules/floating";
import { instanceOf } from "../../rules/zones";
import { evaluate, resolveCharacters } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "This character gains +N✦", permanently (gained spark travels with the
 * card) or for a duration (a floating effect that ends when the duration
 * expires, wherever the card is). The amount is locked when the effect
 * resolves.
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
    const ids = resolveCharacters(ctx, node.subject, env);
    if (ids.length === 0) return;
    if (node.duration === "permanent") {
      for (const id of ids) instanceOf(ctx.state, id).status.gainedSpark += amount;
    } else {
      const expiry = startDuration(ctx, node.duration, env.controller, env.source, ids);
      if (expiry === null) return;
      for (const instance of ids) {
        addFloating(ctx, { controller: env.controller, source: env.source, expiry, change: { kind: "spark", instance, amount } });
      }
    }
    for (const id of ids) ctx.emit({ kind: "sparkGained", instance: id, amount, duration: node.duration });
  },
});

export function gainSpark(
  subject: CharacterRef,
  amount: ValueExpr,
  duration: Duration = "permanent",
): GainSparkNode {
  return { op: "gainSpark", subject, amount, duration };
}
