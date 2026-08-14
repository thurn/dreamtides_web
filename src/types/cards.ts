import type { CardId, CardName } from "./card-identity";

/** The two card types in Dreamtides. */
export type CardType = "Character" | "Event";

/** Authored gameplay roles that give a card a unique systemic purpose. */
export const CARD_ROLES = ["starter-deck", "nightmare"] as const;
export type CardRole = (typeof CARD_ROLES)[number];

/** Canonical rarity vocabulary shared by authored-data compilers and loaders. */
export const CARD_RARITIES = [
  "Common",
  "Uncommon",
  "Rare",
  "Legendary",
  "Starter",
  "Tutorial",
  "Special",
] as const;

/**
 * Card rarity in Dreamtides. Common through Legendary express strength for
 * pool cards. Starter, Tutorial, and Special identify cards that are valid in
 * authored flows but do not enter a normal draft pool.
 */
export type Rarity = (typeof CARD_RARITIES)[number];

/**
 * Per-card art crop. The image covers the frame at `scale` 1; `scale` is the
 * cover zoom (1 = fill, larger = zoomed in). `x` and `y` are normalized pan
 * positions in the range -1..1, where 0 is centered and ±1 pans to the image's
 * edge. The pan is normalized (not pixels) so the stored value is independent
 * of the source image's dimensions; `CardView` resolves it against the loaded
 * image's aspect ratio so the frame always stays fully covered. Authored
 * through the card editor's focused editor and stored as the inline `art` table
 * in the card TOML; absent on cards that have never been cropped, in which case
 * `CardView` falls back to its default crop.
 */
export interface ArtCrop {
  x: number;
  y: number;
  scale: number;
}

/** A single card record loaded from card-data.json. */
export interface CardData {
  name: CardName;
  id: CardId;
  cardNumber: number;
  cardType: CardType;
  subtype: string;
  isStarter: boolean;
  /** Gameplay roles compiled from the canonical card's RON `roles` field. */
  roles?: CardRole[];
  /**
   * Rarity bucket sourced from the canonical card catalog.
   */
  rarity?: Rarity;
  energyCost: number | null;
  /**
   * Ordered orb labels for a card that has more than one energy cost, sourced
   * from a comma-separated TOML `energy-cost` such as `"2,X"` (which yields
   * `["2", "X"]`). `CardView` renders one energy orb per label in a vertical
   * column. Absent on the common single-cost card, where the single orb is
   * derived from `energyCost` (or `X` when it is `null`).
   */
  energyCosts?: string[];
  spark: number | null;
  /**
   * Whether this card's spark is variable (printed as an `X` orb), sourced from
   * a TOML `spark` of `X`/`x`/`*`. When `true`, `spark` is `null` and `CardView`
   * renders a single `X` spark orb. This distinguishes a variable-spark card
   * from a card with no spark at all (the common case for Events), which also
   * has `spark: null` but leaves this `false`/absent and renders no spark orb.
   * Mirrors how a `null` `energyCost` falls back to an `X` energy orb.
   */
  sparkVariable?: boolean;
  isFast: boolean;
  /**
   * Whether this card is an interrupt, sourced from a TOML `is-interrupt`.
   * Interrupt cards are always also `isFast`; card surfaces mark an interrupt
   * with a double-bolt glyph (versus the single bolt for a plain fast card).
   */
  isInterrupt?: boolean;
  reclaimCost?: number | null;
  renderedText: string;
  /** Authored stronger ability used by the Amplified transfiguration. */
  amplifiedText?: string;
  /**
   * Name of the Magic: The Gathering card this card is derived from, sourced
   * from a TOML `mtg-name` and carried through the setup-assets transform.
   * Surfaced as a reference hover tooltip in card-browsing surfaces (the card
   * editor and the Pool Viewer). Present on sources that record it (e.g.
   * `cards.toml`); absent on cards whose source TOML omits `mtg-name`.
   */
  mtgName?: string;
  imageNumber: number;
  artOwned: boolean;
  /** Art crop applied to the card's image; absent cards use the default crop. */
  art?: ArtCrop;
}
