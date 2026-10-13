import type { AbilityList } from "../../../engine/dsl/types";
import { all, characterYouControl } from "../../../engine/dsl/builders";
import { triggered, whenYouPlay } from "../../../engine/dsl/triggers";
import { awaken } from "../../../engine/effects/primitives/awaken";

/** D6 provisional Aspect; production incarnation registration belongs to pair 292. */
export const secondEventWarriorAspectAbilities: AbilityList = () => [
  triggered(whenYouPlay({ cardType: "event" }, 2), awaken(all(characterYouControl({ subtype: "Warrior" })))),
];
