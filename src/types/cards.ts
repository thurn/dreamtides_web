import type { PackageTideId } from "./content";

/** The two card types in Dreamtides. */
export type CardType = "Character" | "Event";

/**
 * Card rarity in Dreamtides. Most cards have no rarity; the buckets that
 * exist are `Legendary` (powerful cards that get the gold frame in
 * `CardDisplay`), `Starter` (cards that seed the fixed starter deck), and
 * `Special` (bane content like Nightmare that journey effects reference by
 * name to add to the player's deck — see `addBaneCardById` and
 * `pushTemporaryBaneGrant`). Sourced from `data/tabula/rendered-cards.toml`
 * and surfaced through the setup-assets transform.
 */
export type Rarity = "Legendary" | "Starter" | "Special";

/** A single card record loaded from card-data.json. */
export interface CardData {
  name: string;
  id: string;
  cardNumber: number;
  cardType: CardType;
  subtype: string;
  isStarter: boolean;
  /**
   * Rarity bucket sourced from the TOML. Present only on `Legendary` and
   * `Starter` cards; most cards have no rarity.
   */
  rarity?: Rarity;
  energyCost: number | null;
  spark: number | null;
  isFast: boolean;
  reclaimCost?: number | null;
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
