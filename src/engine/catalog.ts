import type { TransfigurationPrefixState } from "./transfiguration-application-data";
import type { TransfigurationSourceState } from "../transfiguration/transfiguration-logic";
import type { ConstituentTransfiguration } from "./dsl/types";
import { applyEngineTransfigurations, type TransfigurationMetadata } from "./transfigurations";
import { remapAbilityTypes } from "./dsl/type-remap";
import { BATTLE } from "../content/battle";
import type { CardSubtype } from "../types/card-identity";
import type { CharacteristicsMemo } from "./continuous/characteristics";
import type { StaticsMemo } from "./continuous/layers";
import { worksInZone } from "./dsl/abilities";
import { energy, reclaim } from "./dsl/builders";
import { fixedEnergy } from "./dsl/energy";
import { BASE_VARIANT, type Ability, type AbilityList, type CardCost, type DeckMods, type Speed, type Variant } from "./dsl/types";
import type { AvatarId, CardId, DreamsignId, DreamwellCardId, FigmentId, InstanceId, Zone } from "./state/ids";
import type { CardInstance, CardStackItem, Printing } from "./state/types";
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
  /** Derived source capability; omitted from worker transport. */
  readonly transfigurationState?: (initiallyAmplified: boolean, steps: readonly ConstituentTransfiguration[]) => TransfigurationSourceState;
  /** Canonical source states for the exact histories carried by a text-less worker catalog. */
  readonly transfigurationStates?: readonly TransfigurationPrefixState[];
  /** Plain authored-text eligibility, supplied by the content loader. */
  readonly transfiguration?: TransfigurationMetadata;
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
  readonly abilities: AbilityList;
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
  /** Explicit canonical C12 target; false excludes special same-subtype figments. */
  readonly typeRemapTarget?: boolean;
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
  /** Public printed definitions for compatible historical sampling; no battle identities or observations. */
  readonly cardDefinitions: readonly EngineCardDefinition[];
  /** Public catalog cost ceiling, with X counting as 0; used only for free Discover cost choices. */
  readonly maximumFixedCost: number;
  /**
   * The character types "Choose a character type" offers, in code-unit
   * order: every subtype a catalog character or figment prints, except the
   * `BATTLE.untypedSubtypes` that name no type.
   */
  readonly characterTypes: readonly CardSubtype[];
  card(id: CardId): EngineCardDefinition;
  /** Resolves one immutable variant tuple; returned abilities belong to that resolved tuple. */
  variantCard(this: EngineCatalog, id: CardId, variant: Variant): PrintedCard;
  dreamwellCard(id: DreamwellCardId): EngineDreamwellDefinition;
  avatar(id: AvatarId): EngineAvatarDefinition;
  dreamsign(id: DreamsignId): EngineDreamsignDefinition;
  figment(id: FigmentId): EngineFigmentDefinition;
  /**
   * Effective characteristics of committed states evaluated over this
   * catalog (continuous/characteristics.ts). Derived data, never persisted.
   */
  readonly memo: CharacteristicsMemo;
  /** Each card's static abilities by printing and variant (continuous/layers.ts). Derived data, never persisted. */
  readonly statics: StaticsMemo;
  /**
   * Whether any card, in its base or amplified variant, or any figment has a
   * static ability that works from a zone other than play (`worksInZone`).
   * Read on first use and kept. When it is false, only an instance with
   * transfigurations or deck mods (`plainVariant` false) can have such an
   * ability, so the layer evaluation and determinization read no other
   * card's abilities outside play. Derived data, never persisted.
   */
  staticsOutsidePlay(): boolean;
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

/**
 * The printed card an instance is played as (layer 1): its printing's card
 * with structural transfigurations followed by its deck-entry modifications
 * (D39), in the prototype's order: type, then cost reduction, Fast, and
 * Reclaim, then the spark bonus. A character with no printed spark, an
 * Event turned into a Character, has 0 spark and takes no spark bonus, as
 * in the prototype.
 */
export function instanceCard(
  catalog: EngineCatalog,
  instance: { readonly printing: Printing; readonly variant: Variant },
): PrintedCard {
  const printed = instance.printing.kind === "figment"
    ? printedCard(catalog, instance.printing)
    : catalog.variantCard(instance.printing.cardId, instance.variant);
  const mods = instance.variant.deckMods;
  const card = mods === undefined ? printed : modifiedCard(printed, mods);
  return instance.printing.kind === "figmentCopy" && instance.printing.spark !== null && card.cardType === "character"
    ? { ...card, spark: instance.printing.spark }
    : card;
}

function modifiedCard(card: PrintedCard, mods: DeckMods): PrintedCard {
  const cardType = mods.typeChange?.cardType ?? card.cardType;
  let remaining = mods.costReduction;
  const costs = card.costs.map((cost): CardCost => {
    if (cost.cost !== "energy" || remaining <= 0) return cost;
    const cut = Math.min(cost.amount, remaining);
    remaining -= cut;
    return { ...cost, amount: cost.amount - cut };
  });
  const { reclaim: reclaimCost } = mods;
  return {
    ...card,
    cardType,
    subtype: mods.typeChange?.subtype ?? card.subtype,
    costs,
    spark:
      cardType === "event"
        ? null
        : card.spark === null
          ? 0
          : card.spark === "x"
            ? "x"
            : Math.max(0, card.spark + mods.sparkBonus),
    speed: mods.fast && card.speed === "standard" ? "fast" : card.speed,
    abilities:
      reclaimCost === null
        ? card.abilities
        : (variant) => {
            // The granted cost replaces a printed reclaim in place, so every ability keeps its index.
            const granted = reclaim(energy(reclaimCost));
            const abilities = card.abilities(variant);
            return abilities.some((ability) => ability.kind === "reclaim")
              ? abilities.map((ability) => (ability.kind === "reclaim" ? granted : ability))
              : [...abilities, granted];
          },
  };
}

/** Every zone but play: the compiler flags a zone added to `Zone` until it is listed here. */
const OUTSIDE_PLAY = Object.keys({
  deck: true,
  hand: true,
  stack: true,
  void: true,
  banished: true,
} as const satisfies Record<Exclude<Zone, "play">, true>) as readonly Zone[];

/** Whether any of `abilities` is a static ability that works from a zone other than play (`worksInZone`). */
function hasStaticOutsidePlay(abilities: readonly Ability[]): boolean {
  return abilities.some((ability) => ability.kind === "static" && OUTSIDE_PLAY.some((zone) => worksInZone(ability.zone, zone)));
}

/**
 * Whether an instance's abilities are its printing's base or amplified ones:
 * a figment, or a card with no transfigurations, deck mods or ability type remap.
 */
export function plainVariant({ printing, variant }: CardInstance): boolean {
  return printing.kind === "figment" || (variant.transfigurationApplications === undefined && variant.transfigurations === undefined && variant.deckMods === undefined && variant.typeRemap === undefined);
}

/** The catalog card a printing names, for prompt purposes and logs; `null` for a figment. */
export function printedCardId(printing: Printing): CardId | null {
  return printing.kind === "figment" ? null : printing.cardId;
}

/** The character types of `cards` and `figments`, distinct and in code-unit order, without the untyped placeholders. */
function characterTypes(cards: readonly EngineCardDefinition[], figments: readonly EngineFigmentDefinition[]): CardSubtype[] {
  const untyped: readonly string[] = BATTLE.untypedSubtypes;
  const types = new Set<CardSubtype>();
  for (const card of cards) if (card.cardType === "character") types.add(card.subtype);
  for (const figment of figments) types.add(figment.subtype);
  return [...types].filter((type) => !untyped.includes(type)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Builds a catalog over unique card definitions; duplicate and unknown UUIDs throw. */
export function createCatalog(
  cards: readonly EngineCardDefinition[],
  dreamwellCards: readonly EngineDreamwellDefinition[],
  emblems: EmblemDefinitions = {},
  figments: readonly EngineFigmentDefinition[] = [],
  /** The source catalog's public ceiling when rebuilding a subset for a policy worker. */
  publicMaximumFixedCost?: number,
): EngineCatalog {
  if (publicMaximumFixedCost !== undefined && (!Number.isSafeInteger(publicMaximumFixedCost) || publicMaximumFixedCost < 0 || publicMaximumFixedCost >= Number.MAX_SAFE_INTEGER)) {
    throw new Error("Invalid public catalog cost ceiling");
  }
  const cardIds = new Set<CardId>();
  for (const { id } of cards) {
    if (cardIds.has(id)) throw new Error(`Duplicate card UUID ${id}`);
    cardIds.add(id);
  }
  const figmentsById = new Map(figments.map((definition) => [definition.id, definition]));
  const cardsById = new Map(cards.map((definition) => [definition.id, {
    ...definition,
    abilities: (variant: Variant) => {
      const abilities = definition.abilities(variant);
      return variant.typeRemap === undefined ? abilities : remapAbilityTypes(abilities, variant.typeRemap, figments);
    },
  }]));
  const dreamwellById = new Map(
    dreamwellCards.map((definition) => [definition.id, definition]),
  );
  const avatarsById = new Map((emblems.avatars ?? []).map((definition) => [definition.id, definition]));
  const dreamsignsById = new Map(
    (emblems.dreamsigns ?? []).map((definition) => [definition.id, definition]),
  );
  let outsidePlay: boolean | undefined;
  return {
    cardDefinitions: [...cardsById.values()],
    characterTypes: characterTypes(cards, figments),
    memo: new WeakMap(),
    statics: new Map(),
    staticsOutsidePlay() {
      outsidePlay ??=
        [...cardsById.values()].some((card) => [false, true].some((amplified) => hasStaticOutsidePlay(card.abilities(amplified ? { amplified } : BASE_VARIANT)))) ||
        [...figmentsById.values()].some((figment) => hasStaticOutsidePlay(figment.abilities(BASE_VARIANT)));
      return outsidePlay;
    },
    maximumFixedCost: publicMaximumFixedCost ?? [...cardsById.values()].reduce((maximum, card) => Math.max(maximum, fixedEnergy(card.costs)), 0),
    avatar: (id) => lookup(avatarsById, id, "avatar"),
    dreamsign: (id) => lookup(dreamsignsById, id, "dreamsign"),
    figment: (id) => lookup(figmentsById, id, "figment"),
    variantCard(this: EngineCatalog, id, variant) {
      return applyEngineTransfigurations(this.card(id), variant);
    },
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
