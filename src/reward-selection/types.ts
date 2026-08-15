import type { CardData } from "../types/cards";
import type { JourneySeed } from "../types/journey-seed";
import type {
  DeckEntry,
  SiteState,
  SiteType,
  TransfigurationType,
} from "../types/journey";
import type { JourneyContent } from "../data/journey-content";
import type { RewardSelectionTuning } from "../types/reward-selection-data";
import type { TideAffinityIndex, TideVector } from "../selection/tide-affinity";
import type {
  REWARD_CARD_PREDICATES,
  REWARD_MECHANIC_IDS,
  REWARD_SELECTION_POLICY_IDS,
} from "../../scripts/reward-selection-contracts.mjs";
import type { DeckEntryId } from "../types/identifiers";
import type { DreamsignId } from "../types/identifiers";
import type { DreamAvatarId } from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import type {
  RewardCandidateKey,
  SelectionKey,
  SiteId,
} from "../types/identifiers";
import type { SelectionContentRevision } from "../types/selection-content-revision";
import type { StableDigest } from "./stable";

declare const selectionRulesVersionBrand: unique symbol;

export type SelectionRulesVersion = string & {
  readonly [selectionRulesVersionBrand]: "SelectionRulesVersion";
};

export function parseSelectionRulesVersion(value: unknown): SelectionRulesVersion {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Selection rules version must be a non-empty string.");
  }
  return value as SelectionRulesVersion;
}

export const SELECTION_RULES_VERSION = parseSelectionRulesVersion("2");

export type RewardSelectionPolicyId =
  (typeof REWARD_SELECTION_POLICY_IDS)[number];

export type RewardMechanicId = (typeof REWARD_MECHANIC_IDS)[number];

export type RewardCardPredicate = (typeof REWARD_CARD_PREDICATES)[number];

export type RewardCandidateKeyKind =
  | "cardUuid"
  | "dreamsignId"
  | "entryId"
  | "entryModification"
  | "dreamAvatarId"
  | "siteType";

export interface RewardSelectionScope {
  journeySeed: JourneySeed;
  siteUuid: SiteId;
  selectionKey: SelectionKey;
}

export interface RewardSelectionContext {
  journeySeed: JourneySeed;
  site: SiteState;
  content: JourneyContent;
  tuning: RewardSelectionTuning;
  deckEntries: readonly DeckEntry[];
  effectiveDeckCards: readonly {
    entry: DeckEntry;
    baseCard: CardData;
    effectiveCard: CardData;
  }[];
  cardByUuid: ReadonlyMap<CardId, CardData>;
  ownedCardUuids: ReadonlySet<CardId>;
  draftPoolCardUuids: ReadonlySet<CardId>;
  heldDreamsignIds: ReadonlySet<DreamsignId>;
  remainingDreamsignIds: ReadonlySet<DreamsignId>;
  affinityIndex: TideAffinityIndex;
  affinityContext: TideVector;
  selectionContentRevision: SelectionContentRevision;
}

export interface RewardSelectionConstraints {
  predicate?: RewardCardPredicate;
  cardScope?: "draft-pool" | "catalog";
  excludeOwned?: boolean;
  excludedCardUuids?: readonly CardId[];
  allowedCardUuids?: readonly CardId[];
  excludedDeckEntryIds?: readonly DeckEntryId[];
  fixedCardUuid?: CardId;
  fixedDreamsignId?: DreamsignId;
  fixedDeckEntryId?: DeckEntryId;
  fixedTransfiguration?: TransfigurationType;
  allowedTransfigurations?: readonly TransfigurationType[];
  allowPerfected?: boolean;
  allowStarters?: boolean;
  starterOnly?: boolean;
  allowNightmare?: boolean;
  allowedSiteTypes?: readonly SiteType[];
  excludedDreamAvatarIds?: readonly DreamAvatarId[];
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
}

export interface RewardSelectionCandidateTrace {
  key: RewardCandidateKey;
  score: number;
  components: Readonly<Record<string, number>>;
  cardUuid?: CardId;
  cardNumber?: number;
  entryId?: DeckEntryId;
  dreamsignId?: DreamsignId;
  dreamAvatarId?: DreamAvatarId;
  siteType?: SiteType;
  transfiguration?: TransfigurationType;
  inDraftPool?: boolean;
  inBand: boolean;
  selected: boolean;
}

export interface RewardSelectionTrace {
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: SelectionContentRevision;
  mechanicId: RewardMechanicId;
  policyId: RewardSelectionPolicyId;
  selectionKey: SelectionKey;
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
  candidateDigest: StableDigest;
  band: {
    fraction: number;
    minimum: number;
    size: number;
    cutoffScore: number | null;
    candidates: readonly RewardSelectionCandidateTrace[];
  };
  selectedKeys: readonly RewardCandidateKey[];
  fallback: readonly RewardCandidateKey[];
  tuning: Readonly<Record<string, number>>;
  effectiveDeck: readonly {
    entryId: DeckEntryId;
    cardUuid: CardId;
    cardNumber: number;
    transfiguration: TransfigurationType | null;
  }[];
  effectiveDeckDigest: StableDigest;
}

export interface RewardSelectionBindings {
  cardUuids: readonly CardId[];
  cardNumbers: readonly number[];
  deckEntryIds: readonly DeckEntryId[];
  dreamsignIds: readonly DreamsignId[];
  dreamAvatarIds: readonly DreamAvatarId[];
  siteTypes: readonly SiteType[];
  transfigurations: readonly {
    entryId?: DeckEntryId;
    cardUuid: CardId;
    cardNumber: number;
    transfiguration: TransfigurationType;
  }[];
  packs: readonly (readonly CardId[])[];
}

export interface RewardSelectionResult {
  ok: true;
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: SelectionContentRevision;
  mechanicId: RewardMechanicId;
  policyId: RewardSelectionPolicyId;
  selectionKey: SelectionKey;
  signature: StableDigest;
  bindings: RewardSelectionBindings;
  trace: RewardSelectionTrace;
}

export interface RewardSelectionFailure {
  ok: false;
  selectionRulesVersion: SelectionRulesVersion;
  mechanicId: RewardMechanicId;
  policyId: RewardSelectionPolicyId;
  selectionKey: SelectionKey;
  reason:
    | "invalid_request"
    | "unsupported_mechanic_policy"
    | "fixed_target_unavailable"
    | "no_legal_candidates"
    | "insufficient_candidates";
  detail?: string;
}

export type RewardSelectionOutcome =
  RewardSelectionResult | RewardSelectionFailure;
