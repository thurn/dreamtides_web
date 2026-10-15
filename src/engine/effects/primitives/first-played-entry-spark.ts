import { characteristics } from "../../continuous/characteristics";
import type { InstanceId, Side } from "../../state/ids";
import type { StepContext } from "../../steps/types";
import { combinedSourceObservers } from "../../view/knowledge";
import { definePrimitive } from "../types";

/** The first actual character play's original entry permanently gains this amount. */
export interface FirstPlayedCharacterEntrySparkNode {
  readonly op: "firstPlayedCharacterEntrySpark";
  readonly amount: number;
}

function checkAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError("First-play entry spark must be a non-negative safe integer");
  }
}

export const firstPlayedCharacterEntrySparkPrimitive = definePrimitive<FirstPlayedCharacterEntrySparkNode>({
  op: "firstPlayedCharacterEntrySpark",
  staticOnly: true,
  resolve() { throw new Error("First-play entry spark belongs to a static ability"); },
  continuous: {
    layer: 6,
    changes(node, env) {
      checkAmount(node.amount);
      return [{ kind: "firstPlayedCharacterEntrySpark", player: env.controller, amount: node.amount }];
    },
  },
});

/** Called only for the qualifying original stack visit, before entry observers. */
export function applyFirstPlayedCharacterEntrySpark(ctx: StepContext, instance: InstanceId, side: Side): void {
  // Applicability and causal knowledge belong to one entry occasion, before any contribution changes it.
  const contributions = characteristics(ctx.state, ctx.catalog).firstPlayedCharacterEntrySpark(side)
    .map(grant => ({ ...grant, observedBy: combinedSourceObservers(ctx.state, grant.source, instance) }));
  for (const { source, ability, amount, observedBy } of contributions) {
    if (amount === 0) continue;
    ctx.state.instances[instance].status.gainedSpark += amount;
    ctx.emit({ kind: "sparkGained", instance, amount, expiry: { at: "never" }, additional: false,
      entrySpark: { source, ability, controller: side, observedBy } });
  }
}

/** Each applying source contributes once as the first played physical character successfully enters. */
export function firstPlayedCharacterEntrySpark(amount: number): FirstPlayedCharacterEntrySparkNode {
  checkAmount(amount);
  return { op: "firstPlayedCharacterEntrySpark", amount };
}
