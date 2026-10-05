import { AVATARS } from "../content/avatars";
import { CARDS } from "../content/cards";
import type { CardDefinition, DreamwellCardDefinition } from "../content/define";
import { DREAMSIGNS } from "../content/dreamsigns";
import { DREAMWELL_CARDS } from "../content/dreamwell";
import { parseCardId } from "../types/card-identity";
import { parseAvatarId, parseDreamsignId, parseDreamwellCardId } from "../types/identifiers";
import type { ContentStatus } from "../content/define";
import type {
  ContentState,
  EngineAvatarDefinition,
  EngineCardDefinition,
  EngineDreamsignDefinition,
  EngineDreamwellDefinition,
} from "./catalog";
import type { AbilityList } from "./dsl/types";

const NO_ABILITIES: AbilityList = () => [];

function contentState(status: ContentStatus): ContentState {
  return status.abilities !== undefined ? "authored" : status.pending === true ? "pending" : "vanilla";
}

/**
 * Converts catalog cards into engine definitions. A pending card plays
 * text-less (D36): its printed cost, spark, subtype, and speed, with no
 * abilities.
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
    status: contentState(card),
    abilities: card.abilities ?? NO_ABILITIES,
  };
}

export function engineDreamwellFromContent(
  card: DreamwellCardDefinition,
): EngineDreamwellDefinition {
  return {
    id: parseDreamwellCardId(card.id),
    order: card.order,
    energyAdded: card.energyAdded,
    status: contentState(card),
  };
}

export function contentCardDefinitions(): EngineCardDefinition[] {
  return CARDS.map(engineCardFromContent);
}

export function contentDreamwellDefinitions(): EngineDreamwellDefinition[] {
  return DREAMWELL_CARDS.map(engineDreamwellFromContent);
}

/** Avatar emblems from the catalog; a pending avatar has no abilities (D36). */
export function contentAvatarDefinitions(): EngineAvatarDefinition[] {
  return AVATARS.map((avatar) => ({
    id: parseAvatarId(avatar.id),
    status: contentState(avatar),
    abilities: avatar.abilities ?? NO_ABILITIES,
  }));
}

/** Dreamsign emblems from the catalog; a pending dreamsign has no abilities (D36). */
export function contentDreamsignDefinitions(): EngineDreamsignDefinition[] {
  return DREAMSIGNS.map((dreamsign) => ({
    id: parseDreamsignId(dreamsign.id),
    status: contentState(dreamsign),
    abilities: dreamsign.abilities ?? NO_ABILITIES,
  }));
}
