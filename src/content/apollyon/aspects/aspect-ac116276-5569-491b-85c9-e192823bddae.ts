import { triggered, whenAbandon } from "../../../engine/dsl/triggers";
import type { AbilityList } from "../../../engine/dsl/types";
import { draw } from "../../../engine/effects/primitives";

/** Provisional Butcher Aspect; original pair authoring adopts this list. */
const abilities: AbilityList = () => [
  triggered(whenAbandon("you", { cardType: "character" }), draw(1), { oncePerTurn: true }),
];

export default abilities;
