import type { AbilityList } from "../../../engine/dsl/types";
import { all, characterYouControl, staticAbility } from "../../../engine/dsl/builders";
import { sparkModifier } from "../../../engine/effects/primitives/spark-modifier";

/** D6 provisional Aspect; production incarnation registration belongs to pair 291. */
export const warriorAnthemAspectAbilities: AbilityList = () => [
  staticAbility(sparkModifier(all(characterYouControl({ subtype: "Warrior" })), 1)),
];
