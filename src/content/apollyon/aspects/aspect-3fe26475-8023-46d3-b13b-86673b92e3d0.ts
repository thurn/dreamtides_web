/** Provisional D6 Aspect: copy the controller's second actual event play each turn. */
import { triggered, triggeringCard, whenYouPlay } from "../../../engine/dsl/triggers";
import type { AbilityList } from "../../../engine/dsl/types";
import { copyCard } from "../../../engine/effects/primitives/copy-card";

export const secondEventAspectAbilities: AbilityList = () => [
  triggered(whenYouPlay({ cardType: "event" }, 2), copyCard(triggeringCard())),
];
