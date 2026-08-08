import type { MerchantRng } from "../signals/rng";
import type {
  MerchantApplyPayload,
  MerchantChoiceCandidate,
  MerchantContext,
  MerchantGameObject,
} from "../types";
import type { MerchantOfferTrace } from "../trace/types";
import type {
  RewardMechanicId,
  RewardSelectionPolicyId,
  RewardSelectionTrace,
} from "../../reward-selection/types";

/** The 13 offer archetypes across the 6 families. */
export type MerchantArchetypeId =
  | "fit_card_grant"
  | "fit_card_draft"
  | "copies_draft"
  | "strong_card"
  | "category_draft_known"
  | "card_bundle"
  | "transfigured_draft"
  | "transfigure"
  | "starter_transfigure"
  | "purge"
  | "duplicate"
  | "dreamsign"
  | "add_site";

const TRANSFIGURATION_MERCHANT_ARCHETYPE_IDS: ReadonlySet<MerchantArchetypeId> =
  new Set([
    "transfigured_draft",
    "transfigure",
    "starter_transfigure",
  ]);

export function isTransfigurationMerchantArchetype(
  archetypeId: MerchantArchetypeId,
): boolean {
  return TRANSFIGURATION_MERCHANT_ARCHETYPE_IDS.has(archetypeId);
}

/** The 6 offer families. Slot B must come from a different family than slot A. */
export type MerchantOfferFamily =
  | "grant"
  | "improve"
  | "remove"
  | "duplicate"
  | "dreamsign"
  | "site";

/**
 * The canonical family of every archetype. The registry invariant cross-checks
 * this table against {@link MerchantArchetypeBuilder.family} so a misregistered
 * builder is caught structurally.
 */
export const MERCHANT_ARCHETYPE_FAMILIES: Readonly<
  Record<MerchantArchetypeId, MerchantOfferFamily>
> = {
  fit_card_grant: "grant",
  fit_card_draft: "grant",
  copies_draft: "grant",
  strong_card: "grant",
  category_draft_known: "grant",
  card_bundle: "grant",
  transfigured_draft: "grant",
  transfigure: "improve",
  starter_transfigure: "improve",
  purge: "remove",
  duplicate: "duplicate",
  dreamsign: "dreamsign",
  add_site: "site",
};

export type MerchantChoiceCandidateDraft = MerchantChoiceCandidate;

/**
 * A built offer before it is assigned an offer id (`A`/`B`) and an encounter
 * signature. One draft is one reward; chooser drafts carry a
 * {@link MerchantChoiceRequest} of at most 4 candidates.
 */
export interface MerchantOfferDraft {
  archetypeId: MerchantArchetypeId;
  family: MerchantOfferFamily;
  gameObjects: readonly MerchantGameObject[];
  /** Direct reward payload (mutually exclusive in practice with `choiceRequest`). */
  applyPayload?: MerchantApplyPayload;
  /** Chooser reward (<= 4 candidates). */
  choiceRequest?: {
    choiceType: "catalogCard" | "dreamsign" | "replacementCard";
    candidates: readonly MerchantChoiceCandidateDraft[];
  };
  /** Stable identity of the offer's target, used by metrics and repetition checks. */
  targetKey: string;
  /**
   * Pure explanation of how the target(s) were chosen — the candidate set,
   * scores, band, and branch taken. Populated by the builder from the score maps
   * it already computes and logged at the React boundary as `merchant_offer_built`.
   * Optional so a builder can omit it; the encounter still forms without it.
   */
  trace?: MerchantOfferTrace;
  mechanicId?: RewardMechanicId;
  policyId?: RewardSelectionPolicyId;
  selectionKey?: string;
  selectionRulesVersion?: string;
  selectionContentRevision?: string;
  selectionTrace?: RewardSelectionTrace;
}

/**
 * An archetype builder: an eligibility predicate plus a seeded build step that
 * produces a single {@link MerchantOfferDraft} (or null when no target survives
 * sampling, even though eligibility passed).
 */
export interface MerchantArchetypeBuilder {
  archetypeId: MerchantArchetypeId;
  family: MerchantOfferFamily;
  eligible(context: MerchantContext): boolean;
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null;
}
