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
import { energy, energyX } from "./dsl/builders";
import { fixedEnergy, xCost } from "./dsl/energy";
import type { AbilityList, CardCost } from "./dsl/types";

const NO_ABILITIES: AbilityList = () => [];

function contentState(status: ContentStatus): ContentState {
  return status.abilities !== undefined ? "authored" : status.pending === true ? "pending" : "vanilla";
}

/**
 * A card's printed energy costs. `energyCosts` lists the orbs of a card with
 * more than one, such as `["2", "X"]`; otherwise `energyCost` is the one orb,
 * with `null` for X. Throws when the two fields disagree.
 */
function cardCosts(card: CardDefinition): CardCost[] {
  const labels = card.energyCosts ?? [card.energyCost === null ? "X" : String(card.energyCost)];
  const costs = labels.map((label): CardCost => {
    if (label === "X") return energyX();
    const amount = Number(label);
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(`Card ${card.id} has an unreadable energy cost orb ${label}`);
    }
    return energy(amount);
  });
  const fixed = fixedEnergy(costs);
  if ((card.energyCost ?? 0) !== fixed || (card.energyCost === null) !== (xCost(costs) !== null && fixed === 0)) {
    throw new Error(`Card ${card.id} has energyCost ${String(card.energyCost)} but energy cost orbs ${labels.join(" ")}`);
  }
  return costs;
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
    costs: cardCosts(card),
    spark: card.cardType !== "Character" ? null : card.sparkVariable === true ? "x" : card.spark,
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
