import type { AuguryRng } from "../signals/rng";
import type {
  AuguryApplyPayload,
  AuguryChoiceCandidate,
  AuguryContext,
  AuguryGameObject,
} from "../types";
import type { AuguryOfferTrace } from "../trace/types";
import type {
  RewardMechanicId,
  RewardSelectionPolicyId,
  RewardSelectionTrace,
  SelectionRulesVersion,
} from "../../reward-selection/types";
import type { AuguryTargetKey, SelectionKey } from "../../types/identifiers";
import type { AuguryArchetypeId as CanonicalAuguryArchetypeId } from "../../types/identifiers";
import type { SelectionContentRevision } from "../../types/selection-content-revision";

/** The 13 offer archetypes across the 6 families. */
export type AuguryArchetypeId = CanonicalAuguryArchetypeId;

const TRANSFIGURATION_AUGURY_ARCHETYPE_IDS: ReadonlySet<AuguryArchetypeId> =
  new Set(["transfigured_draft", "transfigure", "starter_transfigure"]);

export function isTransfigurationAuguryArchetype(
  archetypeId: AuguryArchetypeId,
): boolean {
  return TRANSFIGURATION_AUGURY_ARCHETYPE_IDS.has(archetypeId);
}

/** The 6 offer families. Slot B must come from a different family than slot A. */
export type AuguryOfferFamily =
  "grant" | "improve" | "remove" | "duplicate" | "dreamsign" | "site";

/**
 * The canonical family of every archetype. The registry invariant cross-checks
 * this table against {@link AuguryArchetypeBuilder.family} so a misregistered
 * builder is caught structurally.
 */
export const AUGURY_ARCHETYPE_FAMILIES: Readonly<
  Record<AuguryArchetypeId, AuguryOfferFamily>
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

export type AuguryChoiceCandidateDraft = AuguryChoiceCandidate;

/**
 * A built offer before it is assigned an offer id (`A`/`B`) and an encounter
 * signature. One draft is one reward; chooser drafts carry a
 * {@link AuguryChoiceRequest} of at most 4 candidates.
 */
export interface AuguryOfferDraft {
  archetypeId: AuguryArchetypeId;
  family: AuguryOfferFamily;
  gameObjects: readonly AuguryGameObject[];
  /** Direct reward payload (mutually exclusive in practice with `choiceRequest`). */
  applyPayload?: AuguryApplyPayload;
  /** Chooser reward (<= 4 candidates). */
  choiceRequest?: {
    choiceType: "catalogCard" | "dreamsign" | "replacementCard";
    candidates: readonly AuguryChoiceCandidateDraft[];
  };
  /** Stable identity of the offer's target, used by metrics and repetition checks. */
  targetKey: AuguryTargetKey;
  /**
   * Pure explanation of how the target(s) were chosen — the candidate set,
   * scores, band, and branch taken. Populated by the builder from the score maps
   * it already computes and logged at the React boundary as `augury_offer_built`.
   * Optional so a builder can omit it; the encounter still forms without it.
   */
  trace?: AuguryOfferTrace;
  mechanicId?: RewardMechanicId;
  policyId?: RewardSelectionPolicyId;
  selectionKey?: SelectionKey;
  selectionRulesVersion?: SelectionRulesVersion;
  selectionContentRevision?: SelectionContentRevision;
  selectionTrace?: RewardSelectionTrace;
}

/**
 * An archetype builder: an eligibility predicate plus a seeded build step that
 * produces a single {@link AuguryOfferDraft} (or null when no target survives
 * sampling, even though eligibility passed).
 */
export interface AuguryArchetypeBuilder {
  archetypeId: AuguryArchetypeId;
  family: AuguryOfferFamily;
  eligible(context: AuguryContext): boolean;
  build(context: AuguryContext, rng: AuguryRng): AuguryOfferDraft | null;
}
