import type { AbilityList } from "../../../engine/dsl/types";
import { conditionCardCounts, randomIn } from "../../../engine/dsl/builders";
import { onDawn, triggered } from "../../../engine/dsl/triggers";
import { grantReclaim } from "../../../engine/effects/primitives/grant-reclaim";

/** D6 provisional Aspect; production incarnation registration belongs to pair 292. */
export const dawnReclaimAspectAbilities: AbilityList = () => [
  triggered(onDawn(), grantReclaim(randomIn("void", 1, { cardType: "character" })), { condition: conditionCardCounts("void", 7) }),
];
