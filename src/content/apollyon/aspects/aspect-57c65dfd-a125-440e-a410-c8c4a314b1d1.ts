import type { AbilityList } from "../../../engine/dsl/types";
import { randomIn } from "../../../engine/dsl/builders";
import { onDawn, triggered } from "../../../engine/dsl/triggers";
import { returnFromVoid } from "../../../engine/effects/primitives/return-from-void";

/** D6 provisional Aspect; production incarnation registration belongs to pair 291. */
export const dawnRecoveryAspectAbilities: AbilityList = () => [
  triggered(onDawn(), returnFromVoid(randomIn("void", 1, { cardType: "character", costAtMost: 2 }))),
];
