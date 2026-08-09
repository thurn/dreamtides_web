// Public and internal types for the production tides4 draft-pool generator.

import type { CardId } from "../../types/card-identity.ts";
import type { Tides4DecksJson, Tides4Role } from "./tides4-io.ts";

/** The single production draft-pool construction strategy. */
export type PoolVariant = "tides4";

export const DEFAULT_POOL_VARIANT: PoolVariant = "tides4";

export function missingPoolData(detail: string): never {
  throw new Error(
    `The tides4 draft pool cannot be built: ${detail}. Supply the committed ` +
      "tides4 artifact before starting a journey.",
  );
}

/** The card fields needed to build the UUID and display-name indexes. */
export interface PoolCard {
  name: string;
  id?: string;
}

/** Shared run inputs used by tides4 and affiliation scoring. */
export interface PoolData {
  /** Historical decklists keyed by stable card UUID for affiliation scoring. */
  decklistIds?: readonly (readonly string[])[];
  /** The committed production tide-deck artifact. */
  tides4Decks?: Tides4DecksJson;
  /** Stable card UUID -> current display name. */
  cardNameById?: Map<string, string>;
}

export type Tides4PoolTideSelection =
  | "starter"
  | "facet-drawn"
  | "facet-fill"
  | "neutral-fill";

export interface Tides4PoolTide {
  id: string;
  displayName: string;
  displayDescription: string;
  role: Tides4Role;
  selection: Tides4PoolTideSelection;
  joined: boolean;
  cardIds: CardId[];
  contributedCardCount: number;
}

export interface Tides4PoolCardProvenance {
  copies: number;
  tideIds: string[];
  primaryTideId: string;
}

export interface Tides4PoolProvenance {
  dreamAvatarId: string;
  signatureless: boolean;
  borrowedArchetypeName: string | null;
  dealSize: number;
  cap: number;
  maxFacets: number;
  facetDrawnCount: number;
  facetAvailableCount: number;
  tides: Tides4PoolTide[];
  cardProvenanceById: Record<CardId, Tides4PoolCardProvenance>;
}

/** Result of one deterministic tides4 pool generation. */
export interface GeneratedPool {
  counts: Map<CardId, number>;
  seed: number;
  size: number;
  variant: PoolVariant;
  tideDeckIds: string[];
  tides4Provenance: Tides4PoolProvenance;
}

/** Raw output of the tide combination before run metadata is attached. */
export interface Tides4GenerationResult {
  counts: Map<CardId, number>;
  tideDeckIds: string[];
  /** Current algorithm label followed by joined tide ids. */
  selected: string[];
  tides4Provenance: Tides4PoolProvenance;
}
