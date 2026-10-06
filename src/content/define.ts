/**
 * Definition types and identity helpers for the entity content modules.
 *
 * Each card, Dreamsign, Avatar, Dreamwell card, and figment lives in its own
 * module under `src/content/<kind>/`, named `<slug>-<uuid8>.ts`, and each
 * directory's `index.ts` lists every module explicitly. Values are plain
 * data: ids and names are strings here and are validated into branded domain
 * types where the runtime loads them. Printed text is canonical English.
 *
 * Every entity carries a content status: `pending` (has rules text, not yet
 * implemented; it plays text-less), `vanilla` (no rules text), or authored
 * `abilities` with the `verifiedText` hash of the text they implement.
 */
import type { KnownCardSubtype } from "../types/card-identity";
import type { CardRole, CardType, Rarity } from "../types/cards";
import type { AbilityList } from "../engine/dsl/types";

/**
 * A UUID as written in a content module. The literal shape rejects an empty or
 * dashless value at compile time; the runtime validates each one into its
 * branded domain identity when the catalog loads.
 */
export type Uuid = `${string}-${string}-${string}-${string}-${string}`;

/** Whether an entity's rules text still awaits an ability implementation. */
export type ContentStatus =
  | { readonly pending: true; readonly vanilla?: never; readonly abilities?: never }
  | { readonly vanilla: true; readonly pending?: never; readonly abilities?: never }
  | {
      /** The entity's abilities: its printed text's implementation (D5). */
      readonly abilities: AbilityList;
      /** expectedVerifiedText of the printed and amplified text these abilities were checked against. */
      readonly verifiedText: string;
      readonly pending?: never;
      readonly vanilla?: never;
    };

/** Normalized art crop: `x`/`y` pan in -1..1, `scale` cover zoom. */
export interface ArtCropDefinition {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

interface CardFields {
  readonly name: string;
  /** Name of the Magic: The Gathering card this card's art reference is derived from. */
  readonly mtgName: string;
  readonly id: Uuid;
  /** Printed rules text; abilities are separated by blank lines. */
  readonly renderedText: string;
  /** Expanded rules text used by the Amplified transfiguration. */
  readonly amplifiedText?: string;
  /** Energy cost; `null` for a variable (X) cost. */
  readonly energyCost: number | null;
  /** Orb labels for a card with more than one energy cost, such as `["2", "X"]`. */
  readonly energyCosts?: readonly string[];
  readonly cardType: CardType;
  readonly subtype: KnownCardSubtype;
  readonly rarity: Rarity;
  readonly isFast: boolean;
  readonly isInterrupt: boolean;
  /** Base spark; `null` for events and variable-spark characters. */
  readonly spark: number | null;
  /** Whether the spark is variable (printed as an X orb). */
  readonly sparkVariable?: boolean;
  readonly tags: readonly string[];
  readonly imageNumber: number;
  readonly artOwned: boolean;
  /** Stable 1-based catalog position. */
  readonly cardNumber: number;
  readonly art?: ArtCropDefinition;
  readonly isStarter: boolean;
  readonly roles?: readonly CardRole[];
}

export type CardDefinition = CardFields & ContentStatus;

interface DreamsignFields {
  readonly id: Uuid;
  readonly name: string;
  readonly imageName: string;
  readonly imageAlt: string;
  readonly effectDescription: string;
  readonly rarity: "Common" | "Uncommon" | "Rare";
  readonly tideIds: readonly Uuid[];
  readonly tags: readonly string[];
}

export type DreamsignDefinition = DreamsignFields & ContentStatus;

/** An Avatar's draft tides: an optional signature tide, facets, and neutrals. */
export interface AvatarTidePoolDefinition {
  readonly starter?: Uuid;
  readonly facets: readonly Uuid[];
  readonly neutral: readonly Uuid[];
}

interface AvatarFields {
  readonly name: string;
  readonly title: string;
  readonly id: Uuid;
  readonly imageNumber: string;
  readonly renderedText: string;
  /** Normalized head position within the portrait art. */
  readonly portraitFocus: { readonly x: number; readonly y: number };
  readonly tidePool: AvatarTidePoolDefinition;
  readonly signatureCardIds?: readonly Uuid[];
}

export type AvatarDefinition = AvatarFields & ContentStatus;

interface DreamwellCardFields {
  readonly name: string;
  readonly id: Uuid;
  readonly renderedText: string;
  /** Deck-construction tier; cards are shuffled only within their tier. */
  readonly order: number;
  /** Permanent maximum-energy increase granted to the player who draws it. */
  readonly energyAdded: number;
  readonly cardType: "Dreamwell";
  readonly imageNumber: number;
  readonly artOwned: boolean;
  readonly cardNumber: number;
  readonly tags: readonly string[];
  readonly art?: ArtCropDefinition;
}

export type DreamwellCardDefinition = DreamwellCardFields & ContentStatus;

interface FigmentFields {
  readonly name: string;
  readonly id: Uuid;
  readonly subtype: KnownCardSubtype;
  readonly spark: number;
  /** The intrinsic keyword or rules ability this figment type carries. */
  readonly keyword: "" | "awakened" | "vengeful";
  readonly renderedText: string;
  readonly tags: readonly string[];
  readonly imageNumber: number;
  readonly artOwned: boolean;
  readonly art: ArtCropDefinition;
}

export type FigmentDefinition = FigmentFields & ContentStatus;

/** Declares one card module; the identity function keeps the literal checked. */
export function card(definition: CardDefinition): CardDefinition {
  return definition;
}

/** Declares one Dreamsign module. */
export function dreamsign(
  definition: DreamsignDefinition,
): DreamsignDefinition {
  return definition;
}

/** Declares one Avatar module. */
export function avatar(definition: AvatarDefinition): AvatarDefinition {
  return definition;
}

/** Declares one Dreamwell card module. */
export function dreamwellCard(
  definition: DreamwellCardDefinition,
): DreamwellCardDefinition {
  return definition;
}

/** Declares one figment module. */
export function figment(definition: FigmentDefinition): FigmentDefinition {
  return definition;
}
