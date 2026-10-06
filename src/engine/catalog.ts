import type { CardSubtype } from "../types/card-identity";
import type { CharacteristicsMemo } from "./continuous/characteristics";
import type { AbilityList, CardCost, Speed } from "./dsl/types";
import type { AvatarId, CardId, DreamsignId, DreamwellCardId, FigmentId, InstanceId } from "./state/ids";
import type { CardStackItem, Printing } from "./state/types";
import type { StepContext } from "./steps/types";

/**
 * Choices a synthetic play hook makes while playing a card. Its modes and
 * targets are the first entry of the stack item's choices.
 */
export interface PlayChoices {
  readonly modes?: readonly number[];
  readonly targets?: readonly (readonly InstanceId[])[];
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
  resolve?(ctx: StepContext, item: CardStackItem): void;
}

/** How a card's timing category lets it be played (rules § Playing Cards and the Stack). */
export type { Speed } from "./dsl/types";

/**
 * Whether an entity's abilities are implemented: `pending` entities play
 * text-less (D36), `vanilla` ones have no rules text, `authored` ones carry
 * abilities.
 */
export type ContentState = "pending" | "vanilla" | "authored";

/**
 * A character's printed spark: a number, or `"x"` for variable spark, which
 * is the X paid to play the character while it is in play and 0 elsewhere.
 */
export type BaseSpark = number | "x";

/** The engine's view of one card definition. */
export interface EngineCardDefinition {
  readonly id: CardId;
  readonly cardType: "character" | "event";
  /** The costs paid to play the card, in printed order: "2 X" is `[energy(2), energyX()]`. */
  readonly costs: readonly CardCost[];
  /** Base spark for a character; `null` for an event. */
  readonly spark: BaseSpark | null;
  readonly subtype: CardSubtype;
  readonly speed: Speed;
  readonly status: ContentState;
  readonly abilities: AbilityList;
  readonly synthetic?: SyntheticHooks;
}

export interface EngineDreamwellDefinition {
  readonly id: DreamwellCardId;
  /** Deck-construction tier; cards are shuffled only within their tier. */
  readonly order: number;
  readonly energyAdded: number;
  readonly status: ContentState;
}

/**
 * The engine's view of an avatar or dreamsign: an emblem whose abilities use
 * the same DSL as cards (P4). A pending emblem has no abilities (D36).
 */
export interface EngineEmblemDefinition<Id extends AvatarId | DreamsignId> {
  readonly id: Id;
  readonly status: ContentState;
  readonly abilities: AbilityList;
}

export type EngineAvatarDefinition = EngineEmblemDefinition<AvatarId>;
export type EngineDreamsignDefinition = EngineEmblemDefinition<DreamsignId>;

/** A figment type (rules § Figments): a character that exists only in play, costing 0● (C13). */
export interface EngineFigmentDefinition {
  readonly id: FigmentId;
  readonly subtype: CardSubtype;
  /** The catalog base spark, used when the creating text gives none. */
  readonly spark: number;
  readonly status: ContentState;
  readonly abilities: AbilityList;
}

/** The printed characteristics an instance has before any continuous effect (layer 1). */
export type PrintedCard = Omit<EngineCardDefinition, "id">;

/** Card, Dreamwell, avatar, and dreamsign definitions by UUID. */
export interface EngineCatalog {
  card(id: CardId): EngineCardDefinition;
  dreamwellCard(id: DreamwellCardId): EngineDreamwellDefinition;
  avatar(id: AvatarId): EngineAvatarDefinition;
  dreamsign(id: DreamsignId): EngineDreamsignDefinition;
  figment(id: FigmentId): EngineFigmentDefinition;
  /**
   * Effective characteristics of committed states evaluated over this
   * catalog (continuous/characteristics.ts). Derived data, never persisted.
   */
  readonly memo: CharacteristicsMemo;
}

export interface EmblemDefinitions {
  readonly avatars?: readonly EngineAvatarDefinition[];
  readonly dreamsigns?: readonly EngineDreamsignDefinition[];
}

function lookup<K, V>(map: ReadonlyMap<K, V>, id: K, what: string): V {
  const definition = map.get(id);
  if (definition === undefined) {
    throw new Error(`Unknown ${what} ${String(id)}`);
  }
  return definition;
}

/**
 * The printed card a printing stands for: a catalog card; a figment, a
 * 0● character of its type with the spark its text gave it (C13); or a
 * figment copy, the copied card with its base spark replaced for a "0✦
 * figment copy" (C5).
 */
export function printedCard(catalog: EngineCatalog, printing: Printing): PrintedCard {
  switch (printing.kind) {
    case "card":
      return catalog.card(printing.cardId);
    case "figmentCopy": {
      const definition = catalog.card(printing.cardId);
      return printing.spark === null ? definition : { ...definition, spark: printing.spark };
    }
    case "figment": {
      const figment = catalog.figment(printing.figment);
      return {
        cardType: "character",
        costs: [],
        spark: printing.spark,
        subtype: figment.subtype,
        speed: "standard",
        status: figment.status,
        abilities: figment.abilities,
      };
    }
  }
}

/** The catalog card a printing names, for prompt purposes and logs; `null` for a figment. */
export function printedCardId(printing: Printing): CardId | null {
  return printing.kind === "figment" ? null : printing.cardId;
}

/** Builds a catalog over the given definitions; unknown UUIDs throw. */
export function createCatalog(
  cards: readonly EngineCardDefinition[],
  dreamwellCards: readonly EngineDreamwellDefinition[],
  emblems: EmblemDefinitions = {},
  figments: readonly EngineFigmentDefinition[] = [],
): EngineCatalog {
  const figmentsById = new Map(figments.map((definition) => [definition.id, definition]));
  const cardsById = new Map(cards.map((definition) => [definition.id, definition]));
  const dreamwellById = new Map(
    dreamwellCards.map((definition) => [definition.id, definition]),
  );
  const avatarsById = new Map((emblems.avatars ?? []).map((definition) => [definition.id, definition]));
  const dreamsignsById = new Map(
    (emblems.dreamsigns ?? []).map((definition) => [definition.id, definition]),
  );
  return {
    memo: new WeakMap(),
    avatar: (id) => lookup(avatarsById, id, "avatar"),
    dreamsign: (id) => lookup(dreamsignsById, id, "dreamsign"),
    figment: (id) => lookup(figmentsById, id, "figment"),
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
