import { instanceCard } from "../../catalog";
import type { Duration, SubjectSpec, ValueExpr } from "../../dsl/types";
import { startDuration } from "../../rules/durations";
import { addFloating } from "../../rules/floating";
import { evaluate, resolveCards } from "../interpreter";
import { definePrimitive } from "../types";

/** A gain on the physical triggering character card, wherever it exists. */
export interface GainTriggeringCardSparkNode {
  readonly op: "gainTriggeringCardSpark";
  readonly card: SubjectSpec;
  readonly amount: ValueExpr;
  readonly duration: Duration;
}

export const gainTriggeringCardSparkPrimitive = definePrimitive<GainTriggeringCardSparkNode>({
  op: "gainTriggeringCardSpark",
  resolve(ctx, node, env) {
    const amount = evaluate(ctx, node.amount, env);
    const ids = resolveCards(ctx, node.card, env).filter((id) => {
      const instance = ctx.state.instances[id];
      return instance.printing.kind === "card" && instanceCard(ctx.catalog, instance).cardType === "character";
    });
    if (ids.length === 0) return;
    const expiry = startDuration(ctx, node.duration, env.controller, env.source, ids);
    if (expiry === null) return;
    for (const instance of ids) {
      if (expiry.at === "never") ctx.state.instances[instance].status.gainedSpark += amount;
      else addFloating(ctx, { controller: env.controller, source: env.source, expiry, change: { kind: "spark", instance, amount } });
      ctx.emit({ kind: "sparkGained", instance, amount, expiry, additional: false });
    }
  },
});

/**
 * "It gains N✦" on the character card a play, draw or return trigger names
 * (rules § Spark → Gains on the triggering card). The amount is fixed on
 * resolution. Permanent gains travel with the card; durations expire in any
 * zone. This names no figment and changes no in-play-only character gain.
 */
export function gainTriggeringCardSpark(
  card: SubjectSpec,
  amount: ValueExpr,
  duration: Duration = "permanent",
): GainTriggeringCardSparkNode {
  return { op: "gainTriggeringCardSpark", card, amount, duration };
}
