import { selectEffectiveSparkForInstance } from "../state/figments";
import type { BattleCardInstance } from "../types";
import type { GameCardModel } from "../../cumulus/components/card/CardView";
import { parseCardId, parseCardName, isCardId } from "../../types/card-identity";
import { semanticEntityId } from "../../types/semantic-identity";
import {
  lookupFigmentCatalogEntry,
  lookupFigmentCatalogEntryById,
} from "../state/figment-catalog";

/** Resolve canonical battle display state without changing battle-instance identity. */
export function battleGameCardModel(instance: BattleCardInstance): GameCardModel {
  const definition = instance.definition;
  const catalogEntry =
    instance.provenance.kind === "generated-figment"
      ? lookupFigmentCatalogEntryById(definition.cardId) ??
        lookupFigmentCatalogEntry(definition.subtype)
      : undefined;
  const imageNumber = definition.imageNumber || catalogEntry?.imageNumber || 0;
  const art = definition.art ?? catalogEntry?.art;
  const cardId = parseCardId(
    isCardId(definition.cardId)
      ? definition.cardId
      : semanticEntityId("generated-battle-card", instance.battleCardId),
  );
  return {
    cardId,
    transfiguration: definition.transfigurationDisplay,
    displaySnapshot: {
      id: cardId,
      name: parseCardName(definition.name),
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
      renderedText: definition.renderedText || catalogEntry?.renderedText || "",
      imageNumber,
      artOwned: catalogEntry?.artOwned ?? imageNumber > 0,
      ...(art === undefined ? {} : { art }),
    },
  };
}
