import { repeatCapturedTrigger } from "../../triggers/matcher";
import { definePrimitive } from "../types";

/** Trigger exactly the admitted ability that caused this named observer. */
export interface RepeatTriggeringAbilityNode {
  readonly op: "repeatTriggeringAbility";
}

export const repeatTriggeringAbilityPrimitive = definePrimitive<RepeatTriggeringAbilityNode>({
  op: "repeatTriggeringAbility",
  resolve(ctx, _node, env) {
    if (env.triggeringAbility !== undefined) repeatCapturedTrigger(ctx, env.triggeringAbility);
  },
});

export function repeatTriggeringAbility(): RepeatTriggeringAbilityNode {
  return { op: "repeatTriggeringAbility" };
}
