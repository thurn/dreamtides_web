import type { CardData } from "../types/cards";
import type { BattleDeckCardDefinition } from "./types";

export function createBaseBattleDeckCardDefinition(
  card: CardData,
): BattleDeckCardDefinition {
  return {
    sourceDeckEntryId: null,
    cardNumber: card.cardNumber,
    name: card.name,
    battleCardKind: card.cardType === "Character" ? "character" : "event",
    subtype: card.subtype,
    energyCost: card.energyCost ?? 0,
    printedEnergyCost: card.energyCost,
    printedSpark: card.spark ?? 0,
    isFast: card.isFast,
    timing: card.isFast ? "fast" : "standard",
    reclaimCost: card.reclaimCost ?? null,
    tides: [...card.tides],
    renderedText: card.renderedText,
    imageNumber: card.imageNumber,
    transfiguration: null,
    isBane: false,
  };
}
