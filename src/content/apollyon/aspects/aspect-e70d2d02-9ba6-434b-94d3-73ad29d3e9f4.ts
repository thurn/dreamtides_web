import { triggered, triggeringCard, whenReclaim } from "../../../engine/dsl/triggers";
import type { AbilityList } from "../../../engine/dsl/types";
import { gainTriggeringCardSpark } from "../../../engine/effects/primitives";

/** Provisional pair-294 permanent Aspect; gains travel with the actual reclaimed card. */
export const reclaimedCharacterSparkAspectAbilities: AbilityList = () => [
  triggered(whenReclaim("you", { cardType: "character" }), gainTriggeringCardSpark(triggeringCard(), 1, "permanent"), { oncePerTurn: true }),
];
