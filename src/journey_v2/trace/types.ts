/**
 * Pure explanation data for a single Dream Merchant offer.
 *
 * Every archetype builder is a deterministic `score → band → sample` pipeline,
 * but the scores it computes are thrown away once the {@link MerchantOfferDraft}
 * is built. A {@link MerchantOfferTrace} captures *what the builder already
 * computed* — the candidate set, each candidate's score and the components that
 * score blends, the sampling band, the branch taken, and the tuning weights
 * applied — so a human reading `logs/journey-log.jsonl` can reconstruct and
 * second-guess the decision without re-running any code.
 *
 * The builders stay pure: they assemble a trace from their own score maps (no
 * recomputation, no clocks, no logging) and attach it to the draft. The React
 * boundary (`ScreenRouter.tsx`) is the only place that turns a trace into a log
 * line.
 *
 * The 17 archetypes decide in five distinct ways, captured by
 * {@link MerchantTraceDecision}. A single candidate shape
 * ({@link MerchantTraceCandidate}) serves all of them because every generator
 * ultimately ranks keyed candidates by a numeric score; what differs is the key
 * ({@link MerchantTraceKeyKind}), the score's components, and a handful of
 * branch flags — all optional fields below.
 */

/** What a trace candidate's `key` identifies. */
export type MerchantTraceKeyKind =
  /** Grant family — pool cards keyed by card UUID. */
  | "cardUuid"
  /** Dreamsign family — dreamsigns keyed by their dreamsign id. */
  | "dreamsignId"
  /** `duplicate` / `purge` — existing deck entries keyed by `entryId`. */
  | "entryId"
  /** Improve family — `${entryId}:${variant}` (entry × modification) pairs. */
  | "entryModification"
  /** `add_site` — a placeable site type. */
  | "siteType";

/**
 * How a generator reaches its target(s). Groups the archetypes that decide the
 * same way so a reader knows which fields to expect:
 *
 * - `scored_cards` — the grant family blends quality/fit over the shared grant
 *   pool of unowned cards. Components: `quality`, `fit` (and the cold-start
 *   fallback flag). Used by `strong_card`, `fit_card_grant`, `fit_card_draft`,
 *   `copies_draft`, `category_draft_known`, `card_bundle`, and `transfigured_draft`.
 * - `dreamsign_match` — the dreamsign family ranks a tiered coverage pool by
 *   `meanCoverage * qualityWeight`. Components: `meanCoverage`, `featureCount`,
 *   `qualityWeight`; the chosen tier is in {@link MerchantOfferTrace.dreamsignTier}.
 * - `deck_entry_rank` — `duplicate` and `purge` rank EXISTING deck entries.
 *   `duplicate` blends `quality`/`fitLoo`; `purge` ranks by `misfit` (with a
 *   starter bonus and a leave-one-out threshold).
 * - `entry_modification` — the improve family picks an (entry, modification)
 *   pair. `transfigure` blends `benefit`/`centrality`; `starter_transfigure`
 *   samples uniformly.
 * - `uniform` — `add_site` samples a site type with equal weight.
 */
export type MerchantTraceDecision =
  | "scored_cards"
  | "dreamsign_match"
  | "deck_entry_rank"
  | "entry_modification"
  | "uniform";

/** Which dreamsign pool tier the `dreamsign` family sampled from. */
export type MerchantDreamsignTier = "covered" | "generic" | "fallback";

/**
 * One scored candidate the builder considered. The natural key (`key`) is
 * authoritative; the structured id fields (`cardUuid`/`dreamsignId`/`entryId`)
 * are present when applicable so a query can join on them. `displayName` is a
 * convenience only — no logic or query keys off it (AGENTS.md: identify cards by
 * UUID, never name).
 */
export interface MerchantTraceCandidate {
  /** Authoritative key (its meaning is {@link MerchantOfferTrace.keyKind}). */
  key: string;
  /** Non-authoritative human label; never key logic off this. */
  displayName?: string;
  cardUuid?: string;
  cardNumber?: number;
  dreamsignId?: string;
  entryId?: string;
  /** Final score used for banding; higher ranks first. */
  score: number;
  /** Named score sub-components, when the score is a blend or has structure. */
  components?: Readonly<Record<string, number>>;
  /**
   * Whether this card belongs to the player's resolved draft pool. Set on grant
   * candidates so a log reader can tell pool cards from global-catalog cards;
   * absent for decisions over deck entries / dreamsigns / sites that have no
   * pool-membership notion.
   */
  inDraftPool?: boolean;
  /** Whether the candidate fell inside the sampling band. */
  inBand: boolean;
  /** Whether the candidate was selected as (one of) the offer target(s). */
  selected: boolean;
}

/** The sampling band the builder drew the target(s) from. */
export interface MerchantTraceBand {
  /** Candidates the band was computed over. */
  poolSize: number;
  /** Top-scoring candidates kept as the band (the sampleable set). */
  bandSize: number;
  /** Band fraction tuning value applied. */
  bandFraction: number;
  /** Band minimum tuning value applied. */
  bandMinimum: number;
  /** How many candidates were ultimately selected from the band. */
  selectedCount: number;
}

/**
 * The full explanation of one offer's target selection. Attached to a
 * {@link MerchantOfferDraft}/{@link MerchantOffer} as pure data and logged once
 * at the React boundary as a `merchant_offer_built` event.
 */
export interface MerchantOfferTrace {
  decision: MerchantTraceDecision;
  keyKind: MerchantTraceKeyKind;
  band: MerchantTraceBand;
  /** Total candidates considered before any top-N truncation of `candidates`. */
  candidateCount: number;
  /**
   * Scored candidates, sorted by score descending. For small candidate sets
   * (choosers, deck-entry ranks) this is the full set. For large grant pools it
   * keeps every selected candidate plus the top runners-up; `truncated` and
   * `candidateCount` record that the line was bounded.
   */
  candidates: readonly MerchantTraceCandidate[];
  /** True when `candidates` was capped to a top-N (full size is `candidateCount`). */
  truncated: boolean;
  /**
   * Grant blends fell back to quality-only because the deck was below
   * `minDeckForFit`. Absent for generators with no such fallback.
   */
  coldStartQualityFallback?: boolean;
  /** Which dreamsign pool tier the candidates were drawn from (dreamsign family). */
  dreamsignTier?: MerchantDreamsignTier;
  /** Blend weights actually applied to the score (snapshot of tuning). */
  blend?: Readonly<Record<string, number>>;
  /** Free-form explanatory notes (category pick, bundle grow steps, thresholds). */
  notes?: readonly string[];
}
