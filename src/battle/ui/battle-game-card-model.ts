import { selectEffectiveSparkForInstance } from "../state/figments";
import type { BattleCardInstance } from "../types";
import type { GameCardModel } from "../../tango/components/card/CardView";
import { asCardId, asCardName, isCardId } from "../../types/card-identity";
import { semanticEntityId } from "../../types/semantic-identity";

/** Resolve canonical battle display state without changing battle-instance identity. */
export function battleGameCardModel(instance: BattleCardInstance): GameCardModel {
  const definition = instance.definition;
  const cardId = asCardId(
    isCardId(definition.cardId)
      ? definition.cardId
      : semanticEntityId("generated-battle-card", instance.battleCardId),
  );
  return {
    cardId,
    transfiguration: definition.transfigurationDisplay,
    displaySnapshot: {
      id: cardId,
      name: asCardName(definition.name),
      cardNumber: definition.cardNumber,
      cardType: definition.battleCardKind === "character" ? "Character" : "Event",
      subtype: definition.subtype,
      isStarter: false,
      energyCost: definition.energyCost,
      ...(definition.energyCosts === undefined ? {} : { energyCosts: definition.energyCosts }),
      spark:
        definition.battleCardKind === "character"
          ? selectEffectiveSparkForInstance(instance)
          : null,
      isFast: definition.isFast,
      isInterrupt: definition.timing === "interrupt",
      reclaimCost: definition.reclaimCost,
      renderedText: definition.renderedText,
      imageNumber: definition.imageNumber,
      artOwned: definition.imageNumber > 0,
      ...(definition.art === undefined ? {} : { art: definition.art }),
    },
  };
}
