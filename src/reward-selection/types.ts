import type { CardData } from "../types/cards";
import type {
  DeckEntry,
  SiteState,
  SiteType,
  TransfigurationType,
} from "../types/journey";
import type { JourneyContent } from "../data/journey-content";

export const SELECTION_RULES_VERSION = "1" as const;

export type SelectionRulesVersion = typeof SELECTION_RULES_VERSION;

export type RewardSelectionPolicyId =
  | "fixed"
  | "uniform"
  | "card-fit"
  | "card-fit-quality"
  | "card-bundle"
  | "purge-misfit"
  | "duplicate-value"
  | "deck-entry-centrality"
  | "transfiguration-value"
  | "dreamsign-match"
  | "site-uniform";

export type RewardMechanicId =
  | "gain-card"
  | "catalog-card-chooser"
  | "pack-chooser"
  | "transfigured-card-chooser"
  | "gain-dreamsign"
  | "transfigure-deck-entry"
  | "purge-deck-entry"
  | "purge-for-essence"
  | "purge-and-duplicate"
  | "replace-deck-entry"
  | "duplicate-deck-entry"
  | "change-entry-subtype"
  | "change-deck-subtype"
  | "gain-nightmare-and-card"
  | "next-site-transfiguration"
  | "gain-essence-by-deck-predicate"
  | "increase-deck-spark"
  | "purge-dreamsign-for-essence"
  | "make-deck-fast"
  | "reduce-deck-cost-and-add-nightmares"
  | "next-battle-modifier"
  | "choose-dream-avatar"
  | "purge-duplicates-and-grant-reclaim"
  | "add-site";

export type RewardCardPredicate =
  | "any"
  | "character"
  | "event"
  | "cheap-character"
  | "spirit-animal"
  | "survivor"
  | "warrior";

export type RewardCandidateKeyKind =
  | "cardUuid"
  | "dreamsignId"
  | "entryId"
  | "entryModification"
  | "dreamAvatarId"
  | "siteType";

export interface RewardSelectionScope {
  journeySeed: string;
  siteUuid: string;
  selectionKey: string;
}

export interface RewardSelectionContext {
  journeySeed: string;
  site: SiteState;
  content: JourneyContent;
  deckEntries: readonly DeckEntry[];
  effectiveDeckCards: readonly {
    entry: DeckEntry;
    baseCard: CardData;
    effectiveCard: CardData;
  }[];
  cardByUuid: ReadonlyMap<string, CardData>;
  ownedCardUuids: ReadonlySet<string>;
  draftPoolCardUuids: ReadonlySet<string>;
  heldDreamsignIds: ReadonlySet<string>;
  remainingDreamsignIds: ReadonlySet<string>;
  selectionContentRevision: string;
}

export interface RewardSelectionConstraints {
  predicate?: RewardCardPredicate;
  cardScope?: "draft-pool" | "catalog";
  excludeOwned?: boolean;
  excludedCardUuids?: readonly string[];
  allowedCardUuids?: readonly string[];
  excludedDeckEntryIds?: readonly string[];
  fixedCardUuid?: string;
  fixedDreamsignId?: string;
  fixedDeckEntryId?: string;
  fixedTransfiguration?: TransfigurationType;
  allowedTransfigurations?: readonly TransfigurationType[];
  allowPerfected?: boolean;
  allowStarters?: boolean;
  starterOnly?: boolean;
  allowNightmare?: boolean;
  allowedSiteTypes?: readonly SiteType[];
  excludedDreamAvatarIds?: readonly string[];
  distinctCards?: boolean;
  distinctDeckEntries?: boolean;
}

export interface RewardSelectionRequest {
  mechanicId: RewardMechanicId;
  policyId: RewardSelectionPolicyId;
  scope: RewardSelectionScope;
  constraints?: RewardSelectionConstraints;
  /** Number of displayed or directly granted targets. */
  count: number;
  /** Allows a nonempty result smaller than count. */
  upTo?: boolean;
  /** Cards per pack for pack choosers. */
  packSize?: number;
  /** Fit/quality weights for the copies-draft variation. */
  cardFitQualityBlend?: Readonly<{ fit: number; quality: number }>;
}

export interface RewardSelectionCandidateTrace {
  key: string;
  score: number;
  components: Readonly<Record<string, number>>;
  cardUuid?: string;
  cardNumber?: number;
  entryId?: string;
  dreamsignId?: string;
  dreamAvatarId?: string;
  siteType?: SiteType;
  transfiguration?: TransfigurationType;
  inDraftPool?: boolean;
  inBand: boolean;
  selected: boolean;
}

export interface RewardSelectionTrace {
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: string;
  mechanicId: RewardMechanicId;
  policyId: RewardSelectionPolicyId;
  selectionKey: string;
  keyKind: RewardCandidateKeyKind;
  saltParts: readonly string[];
  purpose: string;
  drawsConsumed: number;
  streams: readonly {
    purpose: string;
    saltParts: readonly string[];
    drawsConsumed: number;
  }[];
  constraints: RewardSelectionConstraints;
  candidateCount: number;
  candidateDigest: string;
  band: {
    fraction: number;
    minimum: number;
    size: number;
    cutoffScore: number | null;
    candidates: readonly RewardSelectionCandidateTrace[];
  };
  selectedKeys: readonly string[];
  fallback: readonly string[];
  tuning: Readonly<Record<string, number>>;
  effectiveDeck: readonly {
    entryId: string;
    cardUuid: string;
    cardNumber: number;
    transfiguration: TransfigurationType | null;
  }[];
  effectiveDeckDigest: string;
}

export interface RewardSelectionBindings {
  cardUuids: readonly string[];
  cardNumbers: readonly number[];
  deckEntryIds: readonly string[];
  dreamsignIds: readonly string[];
  dreamAvatarIds: readonly string[];
  siteTypes: readonly SiteType[];
  transfigurations: readonly {
    entryId?: string;
    cardUuid: string;
    cardNumber: number;
    transfiguration: TransfigurationType;
  }[];
  packs: readonly (readonly string[])[];
}

export interface RewardSelectionResult {
  ok: true;
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: string;
  mechanicId: RewardMechanicId;
  policyId: RewardSelectionPolicyId;
  selectionKey: string;
  signature: string;
  bindings: RewardSelectionBindings;
  trace: RewardSelectionTrace;
}

export interface RewardSelectionFailure {
  ok: false;
  selectionRulesVersion: SelectionRulesVersion;
  mechanicId: RewardMechanicId;
  policyId: RewardSelectionPolicyId;
  selectionKey: string;
  reason:
    | "invalid_request"
    | "unsupported_mechanic_policy"
    | "fixed_target_unavailable"
    | "no_legal_candidates"
    | "insufficient_candidates";
  detail?: string;
}

export type RewardSelectionOutcome =
  | RewardSelectionResult
  | RewardSelectionFailure;
