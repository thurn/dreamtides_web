import type { StaticCondition } from "../../dsl/types";
import { definePrimitive } from "../types";

/** C4: the original physical journey-deck characters, wherever they are. */
export interface JourneyDeckSparkModifierNode {
  readonly op: "journeyDeckSparkModifier";
  readonly costAtMost: number;
  readonly amount: number;
}

/** This bounded form admits public state gates without characteristic dependencies. */
export function assertJourneyDeckSparkCondition(condition: StaticCondition | undefined): void {
  if (condition === undefined) return;
  if (condition.cond === "energyAtLeast" || condition.cond === "turnOf" || condition.cond === "sourceIn" ||
      condition.cond === "sourceWasReclaimed" || (condition.cond === "cardsIn" && condition.filter === undefined)) return;
  throw new Error("Journey-deck spark does not support characteristic-dependent conditions");
}

export const journeyDeckSparkModifierPrimitive = definePrimitive<JourneyDeckSparkModifierNode>({
  op: "journeyDeckSparkModifier",
  staticOnly: true,
  continuous: {
    layer: 5,
    changes(node, env) {
      return env.journeyDeckCharacters(node.costAtMost).map(instance => ({ kind: "spark", instance, amount: node.amount }));
    },
  },
});

export function journeyDeckSparkModifier(costAtMost: number, amount: number): JourneyDeckSparkModifierNode {
  if (!Number.isSafeInteger(costAtMost) || costAtMost < 0 || !Number.isSafeInteger(amount)) {
    throw new RangeError("Journey-deck spark requires an integer cost bound and amount");
  }
  return { op: "journeyDeckSparkModifier", costAtMost, amount };
}
