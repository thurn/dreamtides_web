import type { CharacterRef, Duration, ValueExpr } from "../../dsl/types";
import { startDuration } from "../../rules/durations";
import { addFloating } from "../../rules/floating";
import { payableEffect } from "../../rules/payable";
import { instanceOf } from "../../rules/zones";
import type { InstanceId } from "../../state/ids";
import type { BattleState, Expiry } from "../../state/types";
import type { StepContext } from "../../steps/types";
import { evaluate, resolveCharacters } from "../interpreter";
import type { EffectEnv } from "../types";
import { characterTarget, definePrimitive } from "../types";

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

/**
 * Gives each of `ids` `amount`✦ until `expiry` and emits a `sparkGained`
 * event for each, which "when … gains ✦" abilities match unless the gain is
 * `additional`.
 */
function applyGain(ctx: StepContext, env: EffectEnv, ids: readonly InstanceId[], amount: number, expiry: Expiry, additional: boolean): void {
  if (expiry.at === "never") {
    for (const id of ids) instanceOf(ctx.state, id).status.gainedSpark += amount;
  } else {
    for (const instance of ids) {
      addFloating(ctx, { controller: env.controller, source: env.source, expiry, change: { kind: "spark", instance, amount } });
    }
  }
  for (const id of ids) ctx.emit({ kind: "sparkGained", instance: id, amount, expiry, additional });
}

export const gainSparkPrimitive = definePrimitive<GainSparkNode>({
  op: "gainSpark",
  targets: (node) => characterTarget(node.subject),
  resolve(ctx, node, env) {
    const amount = evaluate(ctx, node.amount, env);
    const ids = resolveCharacters(ctx, node.subject, env);
    if (ids.length === 0) return;
    const expiry = startDuration(ctx, node.duration, env.controller, env.source, ids);
    if (expiry === null) return;
    applyGain(ctx, env, ids, amount, expiry, false);
  },
});

export function gainSpark(
  subject: CharacterRef,
  amount: ValueExpr,
  duration: Duration = "permanent",
): GainSparkNode {
  return { op: "gainSpark", subject, amount, duration };
}

/**
 * "It gains N additional ✦" in a "when … gains ✦" ability (rules § Spark →
 * Additional spark): the subject gains N✦ with the expiry of the gain that
 * triggered the ability, so the two end together, and the gain is marked
 * additional, so it triggers no "when … gains ✦" ability. It does nothing
 * when that gain's duration is already over. Resolving it in any other
 * ability is a definition error.
 */
export interface GainAdditionalSparkNode {
  readonly op: "gainAdditionalSpark";
  readonly subject: CharacterRef;
  readonly amount: ValueExpr;
}

/** Whether a change lasting until `expiry` would already be over: its source left play, or its payable effect ended. */
function expiryOver(state: BattleState, expiry: Expiry): boolean {
  switch (expiry.at) {
    case "sourceLeavesPlay":
      return state.instances[expiry.source]?.zone !== "play";
    case "paid":
      return payableEffect(state, expiry.effect) === null;
    default:
      return false;
  }
}

export const gainAdditionalSparkPrimitive = definePrimitive<GainAdditionalSparkNode>({
  op: "gainAdditionalSpark",
  targets: (node) => characterTarget(node.subject),
  resolve(ctx, node, env) {
    if (env.gain === null) throw new Error("gainAdditionalSpark resolved outside a 'when … gains ✦' trigger");
    const amount = evaluate(ctx, node.amount, env);
    const ids = resolveCharacters(ctx, node.subject, env);
    if (ids.length === 0 || expiryOver(ctx.state, env.gain.expiry)) return;
    applyGain(ctx, env, ids, amount, env.gain.expiry, true);
  },
});

export function gainAdditionalSpark(subject: CharacterRef, amount: ValueExpr): GainAdditionalSparkNode {
  return { op: "gainAdditionalSpark", subject, amount };
}
