import { triggered, triggeringCard, whenDiscard } from "../../../engine/dsl/triggers";
import type { AbilityList } from "../../../engine/dsl/types";
import { grantReclaim } from "../../../engine/effects/primitives";

/** Provisional Keeper of Names Aspect; original pair authoring adopts this list. */
const abilities: AbilityList = () => [
  triggered(whenDiscard(), grantReclaim(triggeringCard(), { duration: "untilEndOfTurn" }), { oncePerTurn: true }),
];

export default abilities;
