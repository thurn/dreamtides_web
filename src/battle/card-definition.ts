import type { CardData } from "../types/cards";
import type { BattleDeckCardDefinition } from "./types";

export function createBaseBattleDeckCardDefinition(
  card: CardData,
): BattleDeckCardDefinition {
  return {
    sourceDeckEntryId: null,
    cardId: card.id,
    cardNumber: card.cardNumber,
    name: card.name,
    battleCardKind: card.cardType === "Character" ? "character" : "event",
    subtype: card.subtype,
    energyCost: card.energyCost ?? 0,
    printedEnergyCost: card.energyCost,
    // Carry multi-cost orb labels through only when present: this definition is
    // serialized into the shared battle state, and Firebase rejects an explicit
    // `undefined` field. Single-cost cards omit it and fall back to the orb
    // derived from `printedEnergyCost`.
    ...(card.energyCosts ? { energyCosts: card.energyCosts } : {}),
    printedSpark: card.spark ?? 0,
    isFast: card.isFast,
    timing: card.isFast ? "fast" : "standard",
    reclaimCost: card.reclaimCost ?? null,
    renderedText: card.renderedText,
    imageNumber: card.imageNumber,
    // Only set `art` when the card has a curated crop: this definition is
    // serialized into the shared battle state, and Firebase rejects an explicit
    // `undefined` field. Cards with no crop fall back to the default at render.
    ...(card.art ? { art: card.art } : {}),
    transfiguration: null,
    isBane: false,
  };
}
