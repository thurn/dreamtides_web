import type { MerchantRng } from "../signals/rng";
import type {
  MerchantApplyPayload,
  MerchantChoiceRequest,
  MerchantContext,
  MerchantGameObject,
} from "../types";

/** The 18 offer archetypes across the 6 families. */
export type MerchantArchetypeId =
  | "fit_card_grant"
  | "fit_card_draft"
  | "copies_draft"
  | "strong_card"
  | "premium_draft"
  | "category_draft_known"
  | "card_bundle"
  | "transfigured_draft"
  | "transfigure"
  | "starter_transfigure"
  | "keyword_mod"
  | "tribal_change"
  | "purge"
  | "purge_replace"
  | "duplicate"
  | "dreamsign"
  | "dreamsign_draft"
  | "add_site";

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
  premium_draft: "grant",
  category_draft_known: "grant",
  card_bundle: "grant",
  transfigured_draft: "grant",
  transfigure: "improve",
  starter_transfigure: "improve",
  keyword_mod: "improve",
  tribal_change: "improve",
  purge: "remove",
  purge_replace: "remove",
  duplicate: "duplicate",
  dreamsign: "dreamsign",
  dreamsign_draft: "dreamsign",
  add_site: "site",
};

/**
 * Human-readable label for every archetype, grouped by family. Used by the
 * Journey V2 debug "force a category" dropdown so a developer can pick a
 * specific offer type by name rather than by raw id.
 */
export const MERCHANT_ARCHETYPE_LABELS: Readonly<
  Record<MerchantArchetypeId, string>
> = {
  fit_card_grant: "Grant: Fit card (gift)",
  fit_card_draft: "Grant: Fit card draft",
  copies_draft: "Grant: Copies draft",
  strong_card: "Grant: Strong card",
  premium_draft: "Grant: Premium draft",
  category_draft_known: "Grant: Category draft",
  card_bundle: "Grant: Card bundle",
  transfigured_draft: "Grant: Transfigured draft",
  transfigure: "Improve: Transfigure",
  starter_transfigure: "Improve: Starter transfigure",
  keyword_mod: "Improve: Keyword modifier",
  tribal_change: "Improve: Tribal change",
  purge: "Remove: Purge",
  purge_replace: "Remove: Purge & replace",
  duplicate: "Duplicate: Duplicate card",
  dreamsign: "Dreamsign: Grant dreamsign",
  dreamsign_draft: "Dreamsign: Dreamsign draft",
  add_site: "Site: Add a site",
};

/**
 * A built offer before it is assigned an offer id (`A`/`B`) and an encounter
 * signature. One draft is one reward; chooser drafts carry a
 * {@link MerchantChoiceRequest} of at most 4 candidates.
 */
export interface MerchantOfferDraft {
  archetypeId: MerchantArchetypeId;
  family: MerchantOfferFamily;
  title: string;
  summary: string;
  gameObjects: readonly MerchantGameObject[];
  /** True for archetypes that conceal their candidates until the player commits. */
  hiddenUntilCommit: boolean;
  /** Direct reward payload (mutually exclusive in practice with `choiceRequest`). */
  applyPayload?: MerchantApplyPayload;
  /** Chooser reward (<= 4 candidates). */
  choiceRequest?: MerchantChoiceRequest;
  /** Stable identity of the offer's target, used by metrics and repetition checks. */
  targetKey: string;
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
