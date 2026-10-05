import { CARDS } from "../content/cards";
import type { CardDefinition, DreamwellCardDefinition } from "../content/define";
import { DREAMWELL_CARDS } from "../content/dreamwell";
import { parseCardId } from "../types/card-identity";
import { parseDreamwellCardId } from "../types/identifiers";
import type { EngineCardDefinition, EngineDreamwellDefinition } from "./catalog";

/**
 * Converts catalog cards into engine definitions. Every catalog card plays
 * text-less: its printed cost, spark, subtype, and speed, with no abilities.
 */
export function engineCardFromContent(card: CardDefinition): EngineCardDefinition {
  return {
    id: parseCardId(card.id),
    cardType: card.cardType === "Character" ? "character" : "event",
    cost: card.energyCost,
    spark: card.cardType === "Character" ? card.spark : null,
    subtype: card.subtype,
    speed: card.isInterrupt ? "interrupt" : card.isFast ? "fast" : "standard",
    keywords: [],
  };
}

export function engineDreamwellFromContent(
  card: DreamwellCardDefinition,
): EngineDreamwellDefinition {
  return {
    id: parseDreamwellCardId(card.id),
    order: card.order,
    energyAdded: card.energyAdded,
  };
}

export function contentCardDefinitions(): EngineCardDefinition[] {
  return CARDS.map(engineCardFromContent);
}

export function contentDreamwellDefinitions(): EngineDreamwellDefinition[] {
  return DREAMWELL_CARDS.map(engineDreamwellFromContent);
}
