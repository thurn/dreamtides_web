import { activated, energy, enemyCharacter, exhaustSelf, target } from "../../../engine/dsl/builders";
import type { AbilityList } from "../../../engine/dsl/types";
import { dissolve } from "../../../engine/effects/primitives";

/** Provisional pair-294 permanent Aspect; incarnation integration owns its registration. */
export const smallEnemyDissolveAspectAbilities: AbilityList = () => [
  activated([energy(2), exhaustSelf()], dissolve(target(enemyCharacter({ sparkAtMost: 2 })))),
];
