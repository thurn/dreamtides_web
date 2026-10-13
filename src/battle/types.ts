import type { CardKeywordModification, CardTypeChange, Avatar, Dreamsign, TransfigurationType } from "../types/journey";
import type { ArtCrop } from "../types/cards";
import type { CardTransfigurationDisplay } from "../runtime/transfiguration-display";
import type { DeckEntryId } from "../types/identifiers";
import type { CardId, CardName, CardSubtype } from "../types/card-identity";
import type { DreamwellCardName } from "../types/catalog-names";
import type { ApollyonIncarnationId, AvatarId } from "../types/identifiers";
import type { DreamwellCardId, OpponentId, BackRankSlotId, FrontRankSlotId } from "../types/identifiers";
import type { BattleSide } from "../types/battle";

export type { BackRankSlotId, BattleSide, FrontRankSlotId };

export function isBackRankSlotId(value: string): value is BackRankSlotId {
  return /^B\d+$/.test(value);
}

export function isFrontRankSlotId(value: string): value is FrontRankSlotId {
  return /^F\d+$/.test(value);
}

export type BattlePhase =
  | "dreamwell"
  | "draw"
  | "dawn"
  | "day"
  | "dusk"
  | "night"
  | "challenge"
  | "ending";
export type BattleCardKind = "character" | "event";
export type BattleCardTiming = "standard" | "fast" | "interrupt";

export interface BattleDeckCardDefinition {
  sourceDeckEntryId: DeckEntryId | null;
  /** Stable card UUID of the source card. "" for synthetic definitions
   *  (figments, generated copies) that have no catalog card. */
  cardId: CardId;
  cardNumber: number;
  name: CardName;
  battleCardKind: BattleCardKind;
  subtype: CardSubtype;
  energyCost: number;
  printedEnergyCost: number | null;
  /**
   * Ordered orb labels for a card that has more than one printed energy cost
   * (an `energyCosts` list such as `["2", "X"]` yielding
   * `["2", "X"]`), carried through from the catalog `CardData.energyCosts` so
   * the in-hand surface renders one orb per label. Absent on the common
   * single-cost card, where the single orb is derived from `printedEnergyCost`.
   */
  energyCosts?: string[];
  printedSpark: number;
  isFast: boolean;
  timing?: BattleCardTiming;
  reclaimCost: number | null;
  renderedText: string;
  imageNumber: number;
  /** Curated art crop (pan/zoom) for the source image, sourced from the card or
   *  figment catalog's `art` table when that object has authored art. */
  art?: ArtCrop;
  transfiguration: TransfigurationType | null;
  /** Exact shared-builder presentation for the applied transfiguration. */
  transfigurationDisplay?: CardTransfigurationDisplay;
  typeChange?: CardTypeChange | null;
  keywordModification?: CardKeywordModification | null;
  isBane: boolean;
}

/**
 * A single Dreamwell card frozen into the battle's shared Dreamwell deck
 * (rules §The Dreamwell and Energy). Both players draw from this one sequence,
 * one card per turn during the Dreamwell phase. `energyAdded` permanently
 * raises the drawing side's maximum ●; `renderedText` carries the bonus ability
 * (applied manually by the player) with the same symbol/glossary markup as
 * regular cards.
 */
export interface DreamwellCardDefinition {
  id: DreamwellCardId;
  name: DreamwellCardName;
  renderedText: string;
  energyAdded: number;
  order: number;
  cardNumber: number;
  imageNumber: number;
  /** Curated art crop (pan/zoom) framing the source image, from the dreamwell
   *  catalog's `art` table. Absent on cards that have never been framed. */
  art?: ArtCrop;
}

/**
 * A card chosen to typify an opponent Avatar's ability, shown on the
 * Battle Start screen before hands are dealt. Identity is the stable card
 * UUID (`cardId`); `cardNumber` is the card-database key the screen resolves the
 * full card from for rendering. Selected by `selectSignatureCards`
 * (`src/battle/integration/signature-cards.ts`).
 */
export interface BattleSignatureCard {
  cardId: CardId;
  cardNumber: number;
  name: CardName;
}

export interface BattleEnemyDescriptor {
  id: OpponentId;
  /** The opponent Avatar; absent for the synthetic fallback opponent. */
  avatarId?: AvatarId;
  /** Boss incarnation and its distinct permanent Aspect emblem, carried together. */
  incarnationId?: ApollyonIncarnationId;
  aspectId?: AvatarId;
  name: string;
  subtitle: string;
  imageNumber?: Avatar["imageNumber"];
  portraitSeed: number;
  abilityText: string;
  /**
   * The concrete Dreamsigns the opponent brings to the battle, shown before
   * hands are dealt. Empty for most opponents (Dreamsigns arrive from the run
   * midpoint on), in which case the Battle Start screen omits the section.
   */
  dreamsigns: readonly BattleDreamsignSummary[];
  /**
   * The three cards from the opponent's deck most representative of its
   * Avatar's ability, shown on the Battle Start screen. Empty only when the
   * opponent has no deck (synthetic fallback descriptor).
   */
  signatureCards: readonly BattleSignatureCard[];
}

export interface BattleAvatarSummary {
  id: Avatar["id"] | OpponentId;
  name: Avatar["name"];
  title: Avatar["title"];
  renderedText: Avatar["renderedText"];
  imageNumber: Avatar["imageNumber"];
  portraitFocus?: Avatar["portraitFocus"];
}

export interface BattleDreamsignSummary {
  id: Dreamsign["id"];
  name: Dreamsign["name"];
  effectDescription: Dreamsign["effectDescription"];
  imageName?: Dreamsign["imageName"];
  imageAlt?: Dreamsign["imageAlt"];
}
