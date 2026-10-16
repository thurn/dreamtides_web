import { definePrimitive } from "../types";

/** The current turn's first played character has base spark 0 while this static applies. */
export interface FirstPlayedSparkSetterNode {
  readonly op: "firstPlayedSparkSetter";
  readonly value: 0;
}

export const firstPlayedSparkSetterPrimitive = definePrimitive<FirstPlayedSparkSetterNode>({
  op: "firstPlayedSparkSetter",
  staticOnly: true,
  continuous: {
    layer: 4,
    changes(node, env) {
      const first = env.state.turnLog.played[env.controller].find(card => card.cardType === "character");
      if (first === undefined || env.state.instances[first.instance]?.zone !== "play" || env.read(first.instance).cardType !== "character") return [];
      return [{ kind: "baseSpark", instance: first.instance, value: node.value }];
    },
  },
});

/** "The first character you play each turn … has 0✦" (RD-hv-umm2.718-1). */
export function firstPlayedSparkSetter(value: 0): FirstPlayedSparkSetterNode {
  return { op: "firstPlayedSparkSetter", value };
}
