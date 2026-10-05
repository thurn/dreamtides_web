import type { CardSubtype } from "../types/card-identity";
import type { CardId, DreamwellCardId, InstanceId } from "./state/ids";
import type { StackItem } from "./state/types";
import type { StepContext } from "./steps/types";

/** Choices made while playing a card, carried on its stack item. */
export interface PlayChoices {
  readonly targets?: readonly InstanceId[];
  readonly x?: number;
}

/**
 * Hand-written effects for synthetic test definitions only; catalog cards
 * never set them.
 */
export interface SyntheticHooks {
  /** Play-time choices, made before the commit point. */
  play?(ctx: StepContext, self: InstanceId): PlayChoices;
  /** Runs when the card resolves, before it moves to play or the void. */
  resolve?(ctx: StepContext, item: StackItem): void;
}

/** How a card's timing category lets it be played (rules § Playing Cards and the Stack). */
export type Speed = "standard" | "fast" | "interrupt";

/** Combat keywords the challenge rules read. */
export type CombatKeyword = "vengeful" | "awakened";

/** The engine's view of one card definition. */
export interface EngineCardDefinition {
  readonly id: CardId;
  readonly cardType: "character" | "event";
  /** Energy cost; `null` for an X cost. */
  readonly cost: number | null;
  /** Base spark for a character; `null` for an event or a variable-spark character. */
  readonly spark: number | null;
  readonly subtype: CardSubtype;
  readonly speed: Speed;
  readonly keywords: readonly CombatKeyword[];
  readonly synthetic?: SyntheticHooks;
}

export interface EngineDreamwellDefinition {
  readonly id: DreamwellCardId;
  /** Deck-construction tier; cards are shuffled only within their tier. */
  readonly order: number;
  readonly energyAdded: number;
}

/** Card and Dreamwell definitions by UUID. */
export interface EngineCatalog {
  card(id: CardId): EngineCardDefinition;
  dreamwellCard(id: DreamwellCardId): EngineDreamwellDefinition;
}

/** Builds a catalog over the given definitions; unknown UUIDs throw. */
export function createCatalog(
  cards: readonly EngineCardDefinition[],
  dreamwellCards: readonly EngineDreamwellDefinition[],
): EngineCatalog {
  const cardsById = new Map(cards.map((definition) => [definition.id, definition]));
  const dreamwellById = new Map(
    dreamwellCards.map((definition) => [definition.id, definition]),
  );
  return {
    card(id) {
      const definition = cardsById.get(id);
      if (definition === undefined) {
        throw new Error(`Unknown card ${id}`);
      }
      return definition;
    },
    dreamwellCard(id) {
      const definition = dreamwellById.get(id);
      if (definition === undefined) {
        throw new Error(`Unknown Dreamwell card ${id}`);
      }
      return definition;
    },
  };
}
