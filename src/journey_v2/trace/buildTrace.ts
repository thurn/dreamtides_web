import { MERCHANT_TUNING } from "../tuning";
import type { MerchantCatalogCard, MerchantDeckCard } from "../types";
import type {
  MerchantDreamsignTier,
  MerchantOfferTrace,
  MerchantTraceCandidate,
  MerchantTraceDecision,
  MerchantTraceKeyKind,
} from "./types";

/**
 * Cap on the candidates carried per offer line. Small candidate sets (choosers
 * of <= 4, deck-entry ranks over a handful of entries) fall well under this and
 * are kept whole. Large grant pools (hundreds of cards) are bounded to this many
 * — selected candidates are always kept, then the highest-scoring runners-up
 * fill the rest, which is exactly what explains "why this won and what it beat"
 * without dumping an unbounded blob per line.
 */
const DEFAULT_MAX_TRACE_CANDIDATES = 12;

/**
 * The band size for a candidate pool under a band fraction / minimum, mirroring
 * `bandSample`'s sizing so the trace's `inBand` flags match what the builder
 * actually sampled from.
 */
export function traceBandSize(
  poolSize: number,
  bandFraction: number,
  bandMinimum: number,
): number {
  if (poolSize === 0) return 0;
  return Math.min(
    poolSize,
    Math.max(
      Math.ceil(bandFraction * poolSize),
      Math.min(bandMinimum, poolSize),
    ),
  );
}

/** A candidate before the trace assembler ranks, bands, and truncates it. */
export interface TraceCandidateInput {
  key: string;
  displayName?: string;
  cardUuid?: string;
  cardNumber?: number;
  dreamsignId?: string;
  entryId?: string;
  score: number;
  components?: Readonly<Record<string, number>>;
  inDraftPool?: boolean;
}

/**
 * Assembles a {@link MerchantOfferTrace} from a builder's candidate inputs.
 *
 * Ranks candidates by score descending (the same comparator `bandSample` uses,
 * so the band membership matches), marks the top `bandSize` as in-band and the
 * `selectedKeys` as selected, then truncates large candidate sets to the
 * selected candidates plus the top runners-up (`maxCandidates`). `candidateCount`
 * always reports the full pre-truncation size.
 *
 * Purity: this only rearranges data the builder already computed. It never
 * touches the clock, RNG, or logger.
 */
export function assembleOfferTrace(params: {
  decision: MerchantTraceDecision;
  keyKind: MerchantTraceKeyKind;
  candidates: readonly TraceCandidateInput[];
  selectedKeys: readonly string[];
  bandFraction: number;
  bandMinimum?: number;
  selectedCount: number;
  coldStartQualityFallback?: boolean;
  dreamsignTier?: MerchantDreamsignTier;
  blend?: Readonly<Record<string, number>>;
  notes?: readonly string[];
  maxCandidates?: number;
}): MerchantOfferTrace {
  const bandMinimum = params.bandMinimum ?? MERCHANT_TUNING.bandMinimum;
  const poolSize = params.candidates.length;
  const bandSize = traceBandSize(poolSize, params.bandFraction, bandMinimum);
  const selectedSet = new Set(params.selectedKeys);
  const maxCandidates = params.maxCandidates ?? DEFAULT_MAX_TRACE_CANDIDATES;

  // Rank by score descending (stable for equal scores, matching `bandSample`).
  const ranked = params.candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => b.candidate.score - a.candidate.score);

  const full: MerchantTraceCandidate[] = ranked.map(({ candidate }, rank) => ({
    key: candidate.key,
    ...(candidate.displayName === undefined
      ? {}
      : { displayName: candidate.displayName }),
    ...(candidate.cardUuid === undefined ? {} : { cardUuid: candidate.cardUuid }),
    ...(candidate.cardNumber === undefined
      ? {}
      : { cardNumber: candidate.cardNumber }),
    ...(candidate.dreamsignId === undefined
      ? {}
      : { dreamsignId: candidate.dreamsignId }),
    ...(candidate.entryId === undefined ? {} : { entryId: candidate.entryId }),
    score: candidate.score,
    ...(candidate.components === undefined
      ? {}
      : { components: candidate.components }),
    ...(candidate.inDraftPool === undefined
      ? {}
      : { inDraftPool: candidate.inDraftPool }),
    inBand: rank < bandSize,
    selected: selectedSet.has(candidate.key),
  }));

  // Keep every selected candidate plus the highest-scoring runners-up.
  const kept =
    full.length <= maxCandidates
      ? full
      : full.filter((candidate, rank) => candidate.selected || rank < maxCandidates);

  return {
    decision: params.decision,
    keyKind: params.keyKind,
    band: {
      poolSize,
      bandSize,
      bandFraction: params.bandFraction,
      bandMinimum,
      selectedCount: params.selectedCount,
    },
    candidateCount: poolSize,
    candidates: kept,
    truncated: kept.length < full.length,
    ...(params.coldStartQualityFallback === undefined
      ? {}
      : { coldStartQualityFallback: params.coldStartQualityFallback }),
    ...(params.dreamsignTier === undefined
      ? {}
      : { dreamsignTier: params.dreamsignTier }),
    ...(params.blend === undefined ? {} : { blend: params.blend }),
    ...(params.notes === undefined ? {} : { notes: params.notes }),
  };
}

/**
 * Maps grant-pool catalog cards to {@link TraceCandidateInput}s for the
 * `scored_cards` decision, the shared shape across the grant family. `score`
 * comes from the builder's UUID-keyed score map; `components` (e.g. quality/fit)
 * are optional per-card breakdowns when the builder surfaces them.
 */
export function catalogTraceCandidates(
  pool: readonly MerchantCatalogCard[],
  scoreByUuid: ReadonlyMap<string, number>,
  componentsByUuid?: ReadonlyMap<string, Readonly<Record<string, number>>>,
  draftPoolCardUuids?: ReadonlySet<string>,
): TraceCandidateInput[] {
  return pool.map((card) => ({
    key: card.cardUuid,
    displayName: card.displayName,
    cardUuid: card.cardUuid,
    cardNumber: card.cardNumber,
    score: scoreByUuid.get(card.cardUuid) ?? 0,
    ...(componentsByUuid?.get(card.cardUuid) === undefined
      ? {}
      : { components: componentsByUuid.get(card.cardUuid) }),
    ...(draftPoolCardUuids === undefined
      ? {}
      : { inDraftPool: draftPoolCardUuids.has(card.cardUuid) }),
  }));
}

/**
 * Maps deck-card entries to {@link TraceCandidateInput}s keyed by `entryId`,
 * for the `deck_entry_rank` decision (`duplicate`, `purge`).
 */
export function deckEntryTraceCandidates(
  entries: readonly {
    deckCard: MerchantDeckCard;
    entryId: string;
    score: number;
    components?: Readonly<Record<string, number>>;
  }[],
): TraceCandidateInput[] {
  return entries.map((entry) => ({
    key: entry.entryId,
    displayName: entry.deckCard.displayName,
    cardUuid: entry.deckCard.cardUuid,
    cardNumber: entry.deckCard.cardNumber,
    entryId: entry.entryId,
    score: entry.score,
    ...(entry.components === undefined ? {} : { components: entry.components }),
  }));
}
