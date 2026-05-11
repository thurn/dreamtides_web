import type { PackageTideId } from "./content";

/** The two card types in Dreamtides. */
export type CardType = "Character" | "Event";

/**
 * Rarity bucket for a card. Sourced from `data/tabula/rendered-cards.toml`
 * and surfaced through the setup-assets transform. Drives the rarity frame
 * styling in `CardDisplay`.
 *
 * `Special` cards are filtered out of the runtime pool by `setupAssets`,
 * so this type is kept tight to the rarities that can appear at runtime —
 * legendary frames and any future Mythic / Ascendant variants plug in via
 * the `RARITY_STYLES` map in `CardDisplay`.
 */
export type Rarity = "Common" | "Uncommon" | "Rare" | "Legendary" | "Starter";

/** A single card record loaded from card-data.json. */
export interface CardData {
  name: string;
  id: string;
  cardNumber: number;
  cardType: CardType;
  subtype: string;
  isStarter: boolean;
  /**
   * Rarity bucket sourced from the TOML. Optional so existing test fixtures
   * that omit it continue to compile; cards built by `setupAssets` always
   * carry a value.
   */
  rarity?: Rarity;
  energyCost: number | null;
  spark: number | null;
  isFast: boolean;
  tides: PackageTideId[];
  renderedText: string;
  imageNumber: number;
  artOwned: boolean;
}

/**
 * A `CardData` value whose top-level and `tides` array are frozen at runtime.
 * Consumers that receive a frozen value get compile-time feedback if they try
 * to mutate it (bug-030).
 */
export interface FrozenCardData extends Omit<CardData, "tides"> {
  readonly tides: readonly PackageTideId[];
}
