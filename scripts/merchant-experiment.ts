/**
 * Dream Merchant v3 metrics harness.
 *
 * Drives the REAL generator (`src/journey_v2`) under vite-node — no JS mirror —
 * across many simulated deck states x quest seeds, then reports the five metric
 * families with PASS/FAIL against their targets. This is the BASELINE feed for
 * the Task 19 tuning loop, so the measurements must be correct.
 *
 * Run: `npm run merchant-metric` (which first runs `setup-assets` to refresh the
 * `public/*-data.json` inputs). Flags `--records N` and `--seeds S` shrink the
 * run. The only randomness is the varied quest-seed string per generated
 * encounter; the record slice is a deterministic prefix and nothing uses
 * `Date.now`/`Math.random`.
 *
 * Output: a table per metric to stdout, plus `merchant-metric-report.json`
 * written to the repo root (gitignored). Exit code is always 0 — this is a
 * report, not CI — but the final line summarises `X/Y metric targets met`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { MerchantCorpus, MerchantCorpusCard } from "../src/data/merchant-corpus";
import type { DreamsignProfile } from "../src/data/dreamsign-profiles";
import type { QuestContent } from "../src/data/quest-content";
import { buildFitModel } from "../src/draft/replay/fit-model";
import type { FitModel } from "../src/draft/replay/fit-model";
import { buildNameIndex } from "../src/data/cards-v2-database";
import { STARTER_CARD_NUMBERS } from "../src/data/starter-cards";
import type { CardData } from "../src/types/cards";
import type { DreamsignTemplate } from "../src/types/content";
import type { DeckEntry, QuestState, SiteState } from "../src/types/quest";

import { buildMerchantContext } from "../src/journey_v2/context/buildMerchantContext";
import {
  generateMerchantEncounterWithDebug,
  type MerchantEncounterGenerationDebug,
} from "../src/journey_v2/encounter/generateMerchantEncounter";
import { MERCHANT_ARCHETYPE_BUILDERS } from "../src/journey_v2/archetypes/registry";
import {
  MERCHANT_ARCHETYPE_FAMILIES,
  type MerchantArchetypeId,
} from "../src/journey_v2/archetypes/types";
import { MERCHANT_TUNING } from "../src/journey_v2/tuning";
import type {
  MerchantContext,
  MerchantEncounter,
  MerchantOffer,
} from "../src/journey_v2/types";

// Signal accessors and candidate enumerators reused so desirability percentiles
// are computed against the EXACT same signals the builders sample on.
import { qualityOf, multiplicityOf } from "../src/journey_v2/signals/corpus";
import { fitScores, fitLooByEntry, centrality } from "../src/journey_v2/signals/fit";
import { dreamsignMatchScore } from "../src/journey_v2/signals/dreamsignMatch";
import { grantCandidatePool } from "../src/journey_v2/archetypes/grant";
import {
  transfigureCandidatePairs,
  keywordModCandidatePairs,
  tribalChangeCandidatePairs,
  transfigurationBenefit,
} from "../src/journey_v2/archetypes/improve";
import { purgeCandidates } from "../src/journey_v2/archetypes/remove";
import {
  applyTransfigurationToCard,
  eligibleTransfigurations,
} from "../src/transfiguration/transfiguration-logic";
import type { TransfigurationType } from "../src/types/quest";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const DEFAULT_RECORDS = 60;
const DEFAULT_SEEDS = 40;
const PICK_BUCKETS = [0, 5, 10, 20] as const;
type PickBucket = (typeof PICK_BUCKETS)[number];

function parseFlag(name: string, fallback: number): number {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    const value = Number.parseInt(process.argv[idx + 1] ?? "", 10);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

const RECORD_COUNT = parseFlag("records", DEFAULT_RECORDS);
const SEED_COUNT = parseFlag("seeds", DEFAULT_SEEDS);

// ---------------------------------------------------------------------------
// Paths and input loading (read public JSON directly — vite-node `fetch`
// does not serve `public/`, so the app's fetch-based loaders are inlined here
// against the same JSON shapes).
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const PUBLIC_DIR = join(REPO_ROOT, "public");

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, file), "utf8")) as T;
}

interface RawDraftRecord {
  id: string;
  mainboard: string[];
  pickIds: string[][];
}

interface RawMerchantCorpus {
  cards: Record<string, { quality: number; multiplicity: number; df: number; cluster?: number }>;
  clusters: Array<{ id: number; flagship: string; members: string[] }>;
}

interface RawDreamsignProfile {
  id: string;
  subtypes?: string[];
  cardTypes?: string[];
  costBands?: string[];
  keywords?: string[];
  quality: number;
}

function loadMerchantCorpusFromDisk(): MerchantCorpus {
  const raw = readJson<RawMerchantCorpus>("merchant-corpus-data.json");
  const cards = new Map<string, MerchantCorpusCard>();
  for (const [uuid, entry] of Object.entries(raw.cards)) {
    const card: MerchantCorpusCard = {
      quality: entry.quality,
      multiplicity: entry.multiplicity,
      df: entry.df,
    };
    if (entry.cluster !== undefined) card.cluster = entry.cluster;
    cards.set(uuid, card);
  }
  return { cards, clusters: raw.clusters };
}

function loadDreamsignProfilesFromDisk(): ReadonlyMap<string, DreamsignProfile> {
  const raw = readJson<RawDreamsignProfile[]>("dreamsign-profiles-data.json");
  const profiles = new Map<string, DreamsignProfile>();
  for (const entry of raw) {
    const q = entry.quality;
    if (q !== 1 && q !== 2 && q !== 3) continue;
    profiles.set(entry.id, {
      id: entry.id,
      subtypes: entry.subtypes ?? [],
      cardTypes: entry.cardTypes ?? [],
      costBands: (entry.costBands ?? []) as ("cheap" | "mid" | "big")[],
      keywords: entry.keywords ?? [],
      quality: q,
    });
  }
  return profiles;
}

/**
 * Builds a `QuestContent` compatible with `buildMerchantContext`:
 * - `cardDatabase` keyed by cardNumber (CardData carries id=UUID),
 * - `fitModel` via `buildFitModel` over record mainboards, exactly as
 *   `src/data/quest-content.ts` constructs it for the v2 journey,
 * - `merchantCorpus` and `dreamsignProfiles` from the baked public JSON,
 * - `dreamsignTemplates` from the dreamsign data.
 */
function buildQuestContent(): {
  questContent: QuestContent;
  records: RawDraftRecord[];
  idToCardNumber: Map<string, number>;
} {
  const cards = readJson<CardData[]>("cards_v2-data.json");
  const cardDatabase = new Map<number, CardData>();
  const idToCardNumber = new Map<string, number>();
  for (const card of cards) {
    cardDatabase.set(card.cardNumber, card);
    if (card.id.length > 0 && !idToCardNumber.has(card.id)) {
      idToCardNumber.set(card.id, card.cardNumber);
    }
  }

  const dreamsignTemplates = readJson<DreamsignTemplate[]>("dreamsign-data.json").map(
    (entry) => ({
      id: entry.id,
      name: entry.name,
      effectDescription: entry.effectDescription,
      imageName: entry.imageName,
      imageAlt: entry.imageAlt,
    }),
  );

  const records = readJson<RawDraftRecord[]>("draft-records-data.json");

  const nameIndex = buildNameIndex(cardDatabase);
  // Live fit corpus = all record mainboards (no per-record leave-one-out),
  // matching quest-content.ts:502.
  const fitModel: FitModel = buildFitModel(
    records.map((r) => r.mainboard),
    nameIndex,
  );

  const merchantCorpus = loadMerchantCorpusFromDisk();
  const dreamsignProfiles = loadDreamsignProfilesFromDisk();

  const questContent: QuestContent = {
    cardDatabase,
    dreamcallers: [],
    dreamsignTemplates,
    fitModel,
    merchantCorpus,
    dreamsignProfiles,
  };

  return { questContent, records, idToCardNumber };
}

// ---------------------------------------------------------------------------
// Simulated deck states
// ---------------------------------------------------------------------------

const HARNESS_SITE: SiteState = {
  id: "merchant-harness-site",
  type: "DreamJourney",
  isEnhanced: false,
  isVisited: false,
};

/** The standard starter deck every new quest begins with (cardNumbers 510–519). */
function starterDeckEntries(): DeckEntry[] {
  return STARTER_CARD_NUMBERS.map((cardNumber, i) => ({
    entryId: `deck-${String(i + 1)}`,
    cardNumber,
    transfiguration: null,
    isBane: false,
  }));
}

/**
 * Builds a deck prefix at the given pick bucket: the starter deck plus the
 * record's first N picked cardNumbers (pickIds flattened in pick order, mapped
 * through CardData.id). Picks whose UUID is unknown to the database are skipped.
 */
function buildDeckPrefix(
  record: RawDraftRecord,
  picks: number,
  idToCardNumber: Map<string, number>,
): DeckEntry[] {
  const deck = starterDeckEntries();
  if (picks === 0) return deck;

  const flatPickIds: string[] = [];
  for (const slot of record.pickIds) {
    for (const id of slot) flatPickIds.push(id);
  }

  let added = 0;
  let counter = deck.length;
  for (const id of flatPickIds) {
    if (added >= picks) break;
    const cardNumber = idToCardNumber.get(id);
    if (cardNumber === undefined) continue;
    counter += 1;
    deck.push({
      entryId: `deck-${String(counter)}`,
      cardNumber,
      transfiguration: null,
      isBane: false,
    });
    added += 1;
  }
  return deck;
}

function questStateFor(deck: DeckEntry[], seed: string): QuestState {
  return {
    seed,
    essence: 0,
    essenceCap: 0,
    omens: 0,
    maxDreamsigns: 12,
    deck,
    dreamcaller: null,
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [],
    completionLevel: 0,
    atlas: { nodes: {}, edges: [], startingNodeId: "" },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: null,
    screen: { type: "questStart" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
    battleModifiers: [],
    shopModifiers: { freeRerolls: 0, upcomingOmenDiscounts: 0, essenceDiscountPercent: 0 },
    dreamscapeModifiers: [],
  };
}

/** A single generated encounter together with the deck-state metadata it came from. */
interface SampledEncounter {
  recordId: string;
  bucket: PickBucket;
  seed: string;
  context: MerchantContext;
  encounter: MerchantEncounter;
  debug: MerchantEncounterGenerationDebug;
}

/** The per-(record,bucket) deck state, reused across all seeds. */
interface DeckState {
  recordId: string;
  bucket: PickBucket;
  deck: DeckEntry[];
}

// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------

/** Shannon perplexity (effective count) of a multiset of outcome keys. */
export function perplexity(counts: readonly number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let entropy = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    entropy -= p * Math.log(p);
  }
  return Math.exp(entropy);
}

/** The distinct-outcome tuple identifying an encounter's two offers. */
export function outcomeKey(encounter: MerchantEncounter): string {
  const [a, b] = encounter.offers;
  return JSON.stringify([
    a?.archetypeId ?? "",
    a?.targetKey ?? "",
    b?.archetypeId ?? "",
    b?.targetKey ?? "",
  ]);
}

/**
 * Tie-aware percentile rank (0–100) of `value` within `population`: the standard
 * mid-rank definition `(below + 0.5 * ties) / n * 100`. The single best value of
 * a continuous signal approaches 100; the worst approaches 0; a value tied with
 * the entire population lands at 50.
 *
 * Mid-rank (rather than strict-less-than) matters for archetypes whose candidate
 * population has a large tied cluster. `purge`/`purge_replace` rank starters at a
 * fixed maximum misfit score, so a purge target tied at that maximum is the
 * worst-fitting card in the deck and must read as a HIGH misfit percentile.
 * Strict-less-than would count only the (few) non-tied candidates below it and
 * report ~9th percentile for what is in fact the most-misfit pick. For
 * continuous-signal archetypes (fit, quality, blended scores) ties are rare, so
 * mid-rank and strict-less-than agree to within rounding.
 */
export function percentileOf(value: number, population: readonly number[]): number {
  if (population.length === 0) return 0;
  let below = 0;
  let ties = 0;
  for (const p of population) {
    if (p < value) below += 1;
    else if (p === value) ties += 1;
  }
  return ((below + 0.5 * ties) / population.length) * 100;
}

/**
 * Misfit percentile for purge desirability: how far toward the WORST-fit end of
 * the deck the purged card sits, scored as the fraction of deck entries the
 * target is at least as misfit as (`(below + ties) / n`). A starter or
 * worst-fitting card tied at the maximum misfit scores ~100 — it is, after all,
 * the weakest card in the deck and the ideal purge. The spec defines purge
 * desirability as exactly this "misfit percentile (worst fit = high
 * desirability)", which the symmetric mid-rank `percentileOf` would understate
 * whenever many starters share the maximum misfit.
 */
export function misfitPercentile(value: number, population: readonly number[]): number {
  if (population.length === 0) return 0;
  let atOrBelow = 0;
  for (const p of population) if (p <= value) atOrBelow += 1;
  return (atOrBelow / population.length) * 100;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ---------------------------------------------------------------------------
// Metric 1: distinct outcomes
// ---------------------------------------------------------------------------

export interface DistinctOutcomesRow {
  bucket: PickBucket;
  encounters: number;
  distinct: number;
  perplexity: number;
}

/** Distinct (archetypeA,targetA,archetypeB,targetB) tuples + perplexity per bucket. */
export function computeDistinctOutcomes(
  samples: readonly SampledEncounter[],
): DistinctOutcomesRow[] {
  const rows: DistinctOutcomesRow[] = [];
  for (const bucket of PICK_BUCKETS) {
    const counts = new Map<string, number>();
    let total = 0;
    for (const s of samples) {
      if (s.bucket !== bucket) continue;
      const key = outcomeKey(s.encounter);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total += 1;
    }
    rows.push({
      bucket,
      encounters: total,
      distinct: counts.size,
      perplexity: perplexity([...counts.values()]),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Metric 2: desirability
//
// Per archetype: percentile of the offered target's signal within its full
// candidate list. For direct offers the target is the single offered reward;
// for choosers we score the representative target = the strongest candidate in
// the chooser (the card the player would rationally pick), so the metric asks
// "was the best option in the chooser actually a strong pick?". Each archetype's
// signal mirrors the builder's own sampling signal exactly.
// ---------------------------------------------------------------------------

export interface DesirabilityRow {
  archetypeId: MerchantArchetypeId;
  samples: number;
  median: number;
  floor: number;
}

/** Card-grant archetypes scored by fit; strong/premium by quality. */
function grantSignalByUuid(
  context: MerchantContext,
  archetypeId: MerchantArchetypeId,
): Map<string, number> {
  const pool = grantCandidatePool(context);
  const result = new Map<string, number>();
  const corpus = context.merchantCorpus;
  const useQuality = archetypeId === "strong_card" || archetypeId === "premium_draft";
  if (useQuality) {
    for (const card of pool) {
      result.set(card.cardUuid, corpus === undefined ? 0 : qualityOf(corpus, card.cardUuid));
    }
    return result;
  }
  // Fit-driven grant archetypes.
  const fitModel = context.fitModel;
  if (fitModel === undefined) {
    for (const card of pool) result.set(card.cardUuid, 0);
    return result;
  }
  const deck = context.deckCards.map((dc) => dc.card);
  const scores = fitScores(pool.map((c) => c.card), deck, fitModel);
  for (const card of pool) result.set(card.cardUuid, scores.get(card.cardUuid)?.fit ?? 0);
  return result;
}

/**
 * Computes the desirability percentile for one offer: the percentile of its
 * representative target's signal within the archetype's full candidate-signal
 * population. Returns null for archetypes with no card/deck-target signal
 * (`add_site`, `starter_transfigure`, `keyword_mod` — uniform-sampled, no
 * meaningful percentile), so they are excluded from the metric.
 */
export function desirabilityPercentile(
  context: MerchantContext,
  offer: MerchantOffer,
): number | null {
  const a = offer.archetypeId;
  const deck = context.deckCards.map((dc) => dc.card);

  // Card-grant family scored by the builder's own signal.
  if (
    a === "strong_card" ||
    a === "fit_card_grant" ||
    a === "fit_card_draft" ||
    a === "copies_draft" ||
    a === "premium_draft" ||
    a === "category_draft_known" ||
    a === "card_bundle" ||
    a === "transfigured_draft"
  ) {
    const signalByUuid = grantSignalByUuid(context, a);
    const population = [...signalByUuid.values()];
    const targetUuids = offerCardUuids(offer);
    if (targetUuids.length === 0 || population.length === 0) return null;
    const best = Math.max(...targetUuids.map((u) => signalByUuid.get(u) ?? -Infinity));
    if (!Number.isFinite(best)) return null;
    return percentileOf(best, population);
  }

  if (a === "transfigure") {
    const pairs = transfigureCandidatePairs(context);
    if (pairs.length === 0) return null;
    const blend = MERCHANT_TUNING.transfigureBlend;
    const score = (benefit: number, card: CardData): number =>
      blend.benefit * benefit + blend.centrality * centrality(card, deck, context.fitModel);
    const population = pairs.map((p) => score(p.benefit, p.deckCard.card));
    // targetKey is `entryId:transfiguration`.
    const [entryId, transfiguration] = offer.targetKey.split(":");
    const match = pairs.find(
      (p) => p.entryId === entryId && p.transfiguration === transfiguration,
    );
    if (match === undefined) return null;
    return percentileOf(score(match.benefit, match.deckCard.card), population);
  }

  if (a === "tribal_change") {
    const pairs = tribalChangeCandidatePairs(context);
    if (pairs.length === 0) return null;
    const population = pairs.map((p) => centrality(p.deckCard.card, deck, context.fitModel));
    const [entryId, tribe] = offer.targetKey.split(":");
    const match = pairs.find((p) => p.entryId === entryId && p.tribe === tribe);
    if (match === undefined) return null;
    return percentileOf(centrality(match.deckCard.card, deck, context.fitModel), population);
  }

  if (a === "purge" || a === "purge_replace") {
    // Spec: "for purges, the target's misfit percentile." The population is the
    // WHOLE deck's misfit ranking, not the pre-filtered purge candidate set:
    // purge intentionally targets the worst-fitting cards, so the desirability
    // question is "how weak is the purged card relative to the entire deck?".
    // Scoring against the already-filtered candidate band would be circular —
    // uniform sampling within the worst band can never clear a median >= 75th
    // target by construction. Misfit is oriented worst = high (matching the
    // builder's own `misfitScore`), so a high percentile means a deeply weak pick.
    const population = deckMisfitScores(context);
    if (population.length === 0) return null;
    const entryId = offer.targetKey.split(":")[0];
    const target = purgeCandidates(context).find((c) => c.entryId === entryId);
    if (target === undefined) return null;
    return misfitPercentile(target.misfitScore, population);
  }

  if (a === "duplicate") {
    const cands = duplicateSignalEntries(context);
    if (cands.length === 0) return null;
    const population = cands.map((c) => c.signal);
    // Chooser/direct: score the strongest candidate among the offered entryIds.
    const entryIds = offer.targetKey.split(",");
    const offered = entryIds
      .map((id) => cands.find((c) => c.entryId === id)?.signal)
      .filter((v): v is number => v !== undefined);
    if (offered.length === 0) return null;
    return percentileOf(Math.max(...offered), population);
  }

  if (a === "dreamsign" || a === "dreamsign_draft") {
    const profiles = context.dreamsignProfiles;
    const population = context.candidateDreamsigns.map((t) =>
      dreamsignMatchScore(profiles?.get(t.id), deck),
    );
    if (population.length === 0) return null;
    const offeredIds = offer.targetKey.split(",");
    const offered = offeredIds.map((id) => dreamsignMatchScore(profiles?.get(id), deck));
    if (offered.length === 0) return null;
    return percentileOf(Math.max(...offered), population);
  }

  // add_site / starter_transfigure / keyword_mod: uniform sampling, no percentile.
  return null;
}

/** UUIDs of the cards an offer grants (direct payload or chooser candidates). */
function offerCardUuids(offer: MerchantOffer): string[] {
  const uuids: string[] = [];
  if (offer.choiceRequest !== undefined) {
    for (const c of offer.choiceRequest.candidates) {
      if (c.cardUuid !== undefined) uuids.push(c.cardUuid);
    }
  }
  // Direct offers carry their granted cards in `targetKey` (comma-joined UUIDs).
  if (uuids.length === 0) {
    for (const part of offer.targetKey.split(",")) {
      // strip any `cluster:`/`entry:` style prefixes by taking the last colon segment
      const piece = part.includes(":") ? part.slice(part.indexOf(":") + 1) : part;
      if (piece.length > 0) uuids.push(piece);
    }
  }
  return uuids;
}

/**
 * Misfit score for every deck entry the purge corpus can judge, on the same
 * orientation the builder uses (worst fit = highest score): starters at
 * `1 + starterPurgeBonus`, non-starters with corpus signal at `1 - loo`.
 * No-signal non-starters are excluded (the corpus cannot call them weak), so
 * they neither inflate nor deflate the percentile of a genuine purge target.
 * This is the full-deck population the purge desirability percentile is measured
 * against.
 */
function deckMisfitScores(context: MerchantContext): number[] {
  const fitModel = context.fitModel;
  const looScores =
    fitModel !== undefined
      ? fitLooByEntry(context.deckCards, fitModel)
      : new Map<string, number>();
  const scores: number[] = [];
  for (const dc of context.deckCards) {
    if (dc.deckEntry.isBane) continue;
    if (dc.card.isStarter) {
      scores.push(1 + MERCHANT_TUNING.starterPurgeBonus);
      continue;
    }
    const loo = looScores.get(dc.entryId);
    if (loo === undefined) continue;
    scores.push(1 - loo);
  }
  return scores;
}

/** Duplicate-archetype candidate entries with the builder's blended signal. */
function duplicateSignalEntries(
  context: MerchantContext,
): Array<{ entryId: string; signal: number }> {
  const corpus = context.merchantCorpus;
  if (corpus === undefined) return [];
  const eligible = context.deckCards.filter(
    (dc) =>
      !dc.card.isStarter &&
      multiplicityOf(corpus, dc.cardUuid) >= MERCHANT_TUNING.duplicateMultiplicityMin,
  );
  if (eligible.length === 0) return [];
  const fitModel = context.fitModel;
  const looScores =
    fitModel !== undefined
      ? fitLooByEntry(context.deckCards, fitModel)
      : new Map<string, number>();
  const mult = eligible.map((dc) => multiplicityOf(corpus, dc.cardUuid));
  const loo = eligible.map((dc) => looScores.get(dc.entryId) ?? 0);
  const multNorm = minMaxNormalize(mult);
  const looNorm = minMaxNormalize(loo);
  const blend = MERCHANT_TUNING.duplicateBlend;
  return eligible.map((dc, i) => ({
    entryId: dc.entryId,
    signal: blend.multiplicity * multNorm[i] + blend.fitLoo * looNorm[i],
  }));
}

function minMaxNormalize(values: readonly number[]): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return values.map(() => 0);
  return values.map((v) => (v - min) / span);
}

export function computeDesirability(
  samples: readonly SampledEncounter[],
): DesirabilityRow[] {
  const byArchetype = new Map<MerchantArchetypeId, number[]>();
  for (const s of samples) {
    for (const offer of s.encounter.offers) {
      const pct = desirabilityPercentile(s.context, offer);
      if (pct === null) continue;
      const list = byArchetype.get(offer.archetypeId) ?? [];
      list.push(pct);
      byArchetype.set(offer.archetypeId, list);
    }
  }
  const rows: DesirabilityRow[] = [];
  for (const [archetypeId, pcts] of byArchetype) {
    rows.push({
      archetypeId,
      samples: pcts.length,
      median: median(pcts),
      floor: pcts.length === 0 ? 0 : Math.min(...pcts),
    });
  }
  rows.sort((a, b) => a.archetypeId.localeCompare(b.archetypeId));
  return rows;
}

// ---------------------------------------------------------------------------
// Metric 3: repetition
//
// Per deck state: probability that two distinct seeds give an identical offer
// pair (by outcomeKey). Computed as sum over distinct keys of count*(count-1)
// divided by total ordered seed pairs, averaged over deck states.
// ---------------------------------------------------------------------------

export interface RepetitionResult {
  meanProbability: number;
  maxProbability: number;
  worstState: string;
}

function deckStateKey(s: SampledEncounter): string {
  return `${s.recordId}#${String(s.bucket)}`;
}

export function computeRepetition(
  samples: readonly SampledEncounter[],
): RepetitionResult {
  const byState = new Map<string, Map<string, number>>();
  for (const s of samples) {
    const stateKey = deckStateKey(s);
    const counts = byState.get(stateKey) ?? new Map<string, number>();
    const key = outcomeKey(s.encounter);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    byState.set(stateKey, counts);
  }

  let sum = 0;
  let count = 0;
  let maxProbability = 0;
  let worstState = "";
  for (const [stateKey, counts] of byState) {
    let total = 0;
    for (const c of counts.values()) total += c;
    if (total < 2) continue;
    let collisions = 0;
    for (const c of counts.values()) collisions += c * (c - 1);
    const probability = collisions / (total * (total - 1));
    sum += probability;
    count += 1;
    if (probability > maxProbability) {
      maxProbability = probability;
      worstState = stateKey;
    }
  }

  return {
    meanProbability: count === 0 ? 0 : sum / count,
    maxProbability,
    worstState,
  };
}

// ---------------------------------------------------------------------------
// Metric 4: archetype coverage
//
// Observed share per archetype vs weight-implied share among archetypes
// eligible at that state. The weight-implied share is computed per sampled
// encounter from the eligible set (so an archetype only counts toward the
// denominator when it was actually eligible), then averaged.
// ---------------------------------------------------------------------------

export interface ArchetypeCoverageRow {
  archetypeId: MerchantArchetypeId;
  observedShare: number;
  expectedShare: number;
  ratio: number;
  withinTarget: boolean;
  eligibleSamples: number;
}

/**
 * Expected number of the two encounter slots each eligible archetype fills,
 * given the eligible set, the stage-1 weights, and the family-distinctness rule.
 *
 * Slot A is a weighted draw over the eligible set. Slot B is a weighted draw
 * over the eligible archetypes whose family differs from slot A's. The expected
 * slot count for archetype `i` is therefore
 *   `P(A=i) + Σ_a P(A=a) · P(B=i | A=a)`,
 * which, summed over all eligible `i`, totals 2. This is the correct
 * "weight-implied share among eligible archetypes" for the two-offer encounter;
 * dividing by 2 puts it on the same per-slot scale as the observed share.
 */
function twoSlotExpectedSlots(
  eligibleIds: readonly MerchantArchetypeId[],
): Map<MerchantArchetypeId, number> {
  const result = new Map<MerchantArchetypeId, number>();
  const weightOf = (id: MerchantArchetypeId): number => MERCHANT_TUNING.weights[id];
  const familyOf = (id: MerchantArchetypeId): string => MERCHANT_ARCHETYPE_FAMILIES[id];

  let totalWeight = 0;
  for (const id of eligibleIds) totalWeight += weightOf(id);
  if (totalWeight <= 0) return result;

  for (const id of eligibleIds) result.set(id, 0);

  for (const a of eligibleIds) {
    const pA = weightOf(a) / totalWeight;
    // Slot A directly fills `a`.
    result.set(a, (result.get(a) ?? 0) + pA);
    // Slot B: weighted draw over eligible archetypes of a different family.
    let denomB = 0;
    for (const j of eligibleIds) {
      if (familyOf(j) !== familyOf(a)) denomB += weightOf(j);
    }
    if (denomB <= 0) continue;
    for (const j of eligibleIds) {
      if (familyOf(j) === familyOf(a)) continue;
      const pBgivenA = weightOf(j) / denomB;
      result.set(j, (result.get(j) ?? 0) + pA * pBgivenA);
    }
  }
  return result;
}

export function computeArchetypeCoverage(
  samples: readonly SampledEncounter[],
): ArchetypeCoverageRow[] {
  // Observed: how often each archetype is one of the two offered slots.
  const observed = new Map<MerchantArchetypeId, number>();
  let totalSlots = 0;
  // Expected: the mean weight-implied probability that an archetype is offered,
  // accumulated per sample from its eligible set. We approximate the per-sample
  // expected share for slot A as weight/sumEligibleWeights (slot B's family
  // constraint is a second-order effect; this is the spec's "weight-implied
  // share among eligible archetypes").
  const expectedSum = new Map<MerchantArchetypeId, number>();
  const eligibleCount = new Map<MerchantArchetypeId, number>();
  let sampleCount = 0;

  for (const s of samples) {
    sampleCount += 1;
    for (const offer of s.encounter.offers) {
      observed.set(offer.archetypeId, (observed.get(offer.archetypeId) ?? 0) + 1);
      totalSlots += 1;
    }
    const eligibleIds = s.debug.eligibleArchetypeIds;
    for (const id of eligibleIds) {
      eligibleCount.set(id, (eligibleCount.get(id) ?? 0) + 1);
    }
    // Expected slots each archetype fills, modelling BOTH slots and the
    // family-distinctness rule (slot B must differ in family from slot A) — the
    // core design constraint the observed distribution obeys. Ignoring it
    // (modelling slot A only) systematically halves the expected share of
    // archetypes in small families and produced a spurious ~2x inflation for
    // every such archetype. See `twoSlotExpectedSlots`.
    const expectedSlots = twoSlotExpectedSlots(eligibleIds);
    for (const [id, slots] of expectedSlots) {
      expectedSum.set(id, (expectedSum.get(id) ?? 0) + slots);
    }
  }

  const rows: ArchetypeCoverageRow[] = [];
  for (const builder of MERCHANT_ARCHETYPE_BUILDERS) {
    const id = builder.archetypeId;
    const observedShare = totalSlots > 0 ? (observed.get(id) ?? 0) / totalSlots : 0;
    // Mean per-sample expected share (over ALL samples, mirroring observedShare's
    // per-slot/total normalization): expectedSum is "expected slots" so divide by
    // 2*samples to put it on the same per-slot share scale.
    const expectedShare = sampleCount > 0 ? (expectedSum.get(id) ?? 0) / (2 * sampleCount) : 0;
    const ratio = expectedShare > 0 ? observedShare / expectedShare : observedShare > 0 ? Infinity : 1;
    // Within 2x in either direction, but only judged for archetypes that were
    // ever eligible (a never-eligible archetype trivially has 0 expected).
    const everEligible = (eligibleCount.get(id) ?? 0) > 0;
    const withinTarget = !everEligible ? true : ratio >= 0.5 && ratio <= 2;
    rows.push({
      archetypeId: id,
      observedShare,
      expectedShare,
      ratio,
      withinTarget,
      eligibleSamples: eligibleCount.get(id) ?? 0,
    });
  }
  rows.sort((a, b) => a.archetypeId.localeCompare(b.archetypeId));
  return rows;
}

// ---------------------------------------------------------------------------
// Metric 5: content coverage
// ---------------------------------------------------------------------------

const ALL_TRANSFIGURATION_TYPES: readonly TransfigurationType[] = [
  "Viridian",
  "Scarlet",
  "Golden",
  "Azure",
  "Bronze",
  "Magenta",
  "Rose",
  "Prismatic",
];

const TRANSFIGURE_ARCHETYPES = new Set<MerchantArchetypeId>([
  "transfigure",
  "starter_transfigure",
  "transfigured_draft",
]);

const GRANT_DRAFT_ARCHETYPES = new Set<MerchantArchetypeId>([
  "fit_card_grant",
  "fit_card_draft",
  "copies_draft",
  "strong_card",
  "premium_draft",
  "category_draft_known",
  "card_bundle",
  "transfigured_draft",
  "purge_replace",
]);

const DECK_TARGET_ARCHETYPES: readonly MerchantArchetypeId[] = [
  "purge",
  "duplicate",
  "transfigure",
  "keyword_mod",
  "tribal_change",
];

export interface ContentCoverageReport {
  transfigurationShares: Record<string, number>;
  allTransfigurationTypesAppear: boolean;
  dreamsignTemplateCoverage: number;
  dreamsignTotal: number;
  dreamsignOffered: number;
  cardCoverage: number;
  nonStarterPoolTotal: number;
  cardsOffered: number;
  neverOfferedCardNames: string[];
  deckTargetDiversity: Array<{
    archetypeId: MerchantArchetypeId;
    distinctGlobal: number;
    perplexityGlobal: number;
    minDistinctPerState: number;
    minPerplexityPerState: number;
    statesWithMultiple: number;
    statesTotal: number;
  }>;
}

/**
 * Extracts the transfiguration types an offer exercises (across transfigure /
 * starter_transfigure / transfigured_draft).
 */
function offerTransfigurationTypes(offer: MerchantOffer): TransfigurationType[] {
  const types: TransfigurationType[] = [];
  if (offer.archetypeId === "transfigure") {
    const t = offer.targetKey.split(":")[1];
    if (isTransfiguration(t)) types.push(t);
  } else if (offer.archetypeId === "starter_transfigure") {
    // targetKey = comma-joined `entryId:Transfiguration` pairs.
    for (const part of offer.targetKey.split(",")) {
      const t = part.split(":")[1];
      if (isTransfiguration(t)) types.push(t);
    }
  } else if (offer.archetypeId === "transfigured_draft") {
    // targetKey = comma-joined `cardUuid:Transfiguration` pairs.
    for (const part of offer.targetKey.split(",")) {
      const t = part.split(":")[1];
      if (isTransfiguration(t)) types.push(t);
    }
  }
  return types;
}

function isTransfiguration(v: string | undefined): v is TransfigurationType {
  return v !== undefined && (ALL_TRANSFIGURATION_TYPES as readonly string[]).includes(v);
}

/** Card UUIDs offered through a grant/draft archetype. */
function grantOfferedUuids(offer: MerchantOffer): string[] {
  if (!GRANT_DRAFT_ARCHETYPES.has(offer.archetypeId)) return [];
  return offerCardUuids(offer);
}

/** Deck-target identity (entryId-based) chosen by a deck-targeting archetype. */
function deckTargetKey(offer: MerchantOffer): string | null {
  switch (offer.archetypeId) {
    case "purge":
      return offer.targetKey; // entryId
    case "duplicate":
      return offer.targetKey.split(",")[0]; // first/representative entryId
    case "transfigure":
    case "keyword_mod":
      return offer.targetKey.split(":")[0]; // entryId
    case "tribal_change":
      return offer.targetKey.split(":")[0]; // entryId
    default:
      return null;
  }
}

export function computeContentCoverage(
  samples: readonly SampledEncounter[],
  questContent: QuestContent,
): ContentCoverageReport {
  // Transfiguration type shares.
  const transfigCounts = new Map<TransfigurationType, number>();
  let transfigTotal = 0;
  // Dreamsign + card coverage.
  const dreamsignOffered = new Set<string>();
  const cardsOffered = new Set<string>();
  // Deck-target diversity: archetype -> stateKey -> entryId counts.
  const deckTargets = new Map<MerchantArchetypeId, Map<string, Map<string, number>>>();

  for (const s of samples) {
    const stateKey = deckStateKey(s);
    for (const offer of s.encounter.offers) {
      for (const t of offerTransfigurationTypes(offer)) {
        transfigCounts.set(t, (transfigCounts.get(t) ?? 0) + 1);
        transfigTotal += 1;
      }
      if (offer.archetypeId === "dreamsign" || offer.archetypeId === "dreamsign_draft") {
        for (const id of offer.targetKey.split(",")) {
          if (id.length > 0) dreamsignOffered.add(id);
        }
      }
      for (const uuid of grantOfferedUuids(offer)) cardsOffered.add(uuid);

      const targetKey = deckTargetKey(offer);
      if (targetKey !== null) {
        const byState = deckTargets.get(offer.archetypeId) ?? new Map<string, Map<string, number>>();
        const counts = byState.get(stateKey) ?? new Map<string, number>();
        counts.set(targetKey, (counts.get(targetKey) ?? 0) + 1);
        byState.set(stateKey, counts);
        deckTargets.set(offer.archetypeId, byState);
      }
    }
  }

  const transfigurationShares: Record<string, number> = {};
  for (const type of ALL_TRANSFIGURATION_TYPES) {
    transfigurationShares[type] =
      transfigTotal > 0 ? (transfigCounts.get(type) ?? 0) / transfigTotal : 0;
  }
  const allTransfigurationTypesAppear = ALL_TRANSFIGURATION_TYPES.every(
    (t) => (transfigCounts.get(t) ?? 0) > 0,
  );

  // Dreamsign template coverage.
  const dreamsignTotal = questContent.dreamsignTemplates?.length ?? 0;
  const dreamsignTemplateCoverage =
    dreamsignTotal > 0 ? dreamsignOffered.size / dreamsignTotal : 0;

  // Non-starter pool card coverage.
  const nonStarterCards: CardData[] = [];
  for (const card of questContent.cardDatabase.values()) {
    if (card.isStarter) continue;
    if (card.rarity === "Starter" || card.rarity === "Special") continue;
    nonStarterCards.push(card);
  }
  const nonStarterPoolTotal = nonStarterCards.length;
  const neverOffered = nonStarterCards.filter((c) => !cardsOffered.has(c.id));
  const cardCoverage =
    nonStarterPoolTotal > 0
      ? (nonStarterPoolTotal - neverOffered.length) / nonStarterPoolTotal
      : 0;

  // Deck-target diversity per archetype.
  const deckTargetDiversity = DECK_TARGET_ARCHETYPES.map((archetypeId) => {
    const byState = deckTargets.get(archetypeId);
    if (byState === undefined) {
      return {
        archetypeId,
        distinctGlobal: 0,
        perplexityGlobal: 0,
        minDistinctPerState: 0,
        minPerplexityPerState: 0,
        statesWithMultiple: 0,
        statesTotal: 0,
      };
    }
    const globalCounts = new Map<string, number>();
    let minDistinct = Infinity;
    let minPerplexity = Infinity;
    let statesWithMultiple = 0;
    let statesTotal = 0;
    for (const counts of byState.values()) {
      statesTotal += 1;
      const distinct = counts.size;
      const perp = perplexity([...counts.values()]);
      if (distinct < minDistinct) minDistinct = distinct;
      if (perp < minPerplexity) minPerplexity = perp;
      if (distinct >= 2) statesWithMultiple += 1;
      for (const [k, v] of counts) globalCounts.set(k, (globalCounts.get(k) ?? 0) + v);
    }
    return {
      archetypeId,
      distinctGlobal: globalCounts.size,
      perplexityGlobal: perplexity([...globalCounts.values()]),
      minDistinctPerState: Number.isFinite(minDistinct) ? minDistinct : 0,
      minPerplexityPerState: Number.isFinite(minPerplexity) ? minPerplexity : 0,
      statesWithMultiple,
      statesTotal,
    };
  });

  return {
    transfigurationShares,
    allTransfigurationTypesAppear,
    dreamsignTemplateCoverage,
    dreamsignTotal,
    dreamsignOffered: dreamsignOffered.size,
    cardCoverage,
    nonStarterPoolTotal,
    cardsOffered: cardsOffered.size,
    neverOfferedCardNames: neverOffered.map((c) => c.name).sort(),
    deckTargetDiversity,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

function passLabel(pass: boolean): string {
  return pass ? "PASS" : "FAIL";
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

interface MetricResult {
  name: string;
  pass: boolean;
}

function main(): void {
  const startedAt = Date.now();
  console.log(
    `Dream Merchant metrics harness — ${String(RECORD_COUNT)} records x ${String(SEED_COUNT)} seeds x ${String(PICK_BUCKETS.length)} buckets`,
  );

  const { questContent, records, idToCardNumber } = buildQuestContent();

  // Deterministic record slice: the first RECORD_COUNT records (no shuffle).
  const sliced = records.slice(0, RECORD_COUNT);

  // Build deck states (record x bucket), reused across seeds.
  const deckStates: DeckState[] = [];
  for (const record of sliced) {
    for (const bucket of PICK_BUCKETS) {
      deckStates.push({
        recordId: record.id,
        bucket,
        deck: buildDeckPrefix(record, bucket, idToCardNumber),
      });
    }
  }

  // Generate encounters. The only varied randomness is the quest-seed string.
  const samples: SampledEncounter[] = [];
  for (const state of deckStates) {
    for (let seedIdx = 0; seedIdx < SEED_COUNT; seedIdx += 1) {
      const seed = `merchant-metric:${state.recordId}:${String(state.bucket)}:${String(seedIdx)}`;
      const questState = questStateFor(state.deck, seed);
      const context = buildMerchantContext({
        questState,
        questContent,
        site: HARNESS_SITE,
      });
      const { encounter, debug } = generateMerchantEncounterWithDebug(context);
      samples.push({
        recordId: state.recordId,
        bucket: state.bucket,
        seed,
        context,
        encounter,
        debug,
      });
    }
  }

  console.log(`Generated ${String(samples.length)} encounters.\n`);

  const results: MetricResult[] = [];

  // ---- Metric 1: distinct outcomes ----
  const distinct = computeDistinctOutcomes(samples);
  console.log("=== Metric 1: Distinct outcomes (target: >= 50 distinct at pick-0 and pick-5) ===");
  console.log(`${pad("bucket", 8)}${pad("encounters", 12)}${pad("distinct", 10)}${pad("perplexity", 12)}`);
  for (const row of distinct) {
    console.log(
      `${pad(`pick-${String(row.bucket)}`, 8)}${pad(String(row.encounters), 12)}${pad(String(row.distinct), 10)}${pad(row.perplexity.toFixed(1), 12)}`,
    );
  }
  const pick0 = distinct.find((r) => r.bucket === 0);
  const pick5 = distinct.find((r) => r.bucket === 5);
  const distinctPass = (pick0?.distinct ?? 0) >= 50 && (pick5?.distinct ?? 0) >= 50;
  console.log(`Result: ${passLabel(distinctPass)} (pick-0=${String(pick0?.distinct ?? 0)}, pick-5=${String(pick5?.distinct ?? 0)})\n`);
  results.push({ name: "distinct_outcomes", pass: distinctPass });

  // ---- Metric 2: desirability ----
  const desirability = computeDesirability(samples);
  console.log("=== Metric 2: Desirability (target: median >= 75th pct, floor >= 50th pct) ===");
  console.log(`${pad("archetype", 22)}${pad("samples", 9)}${pad("median", 9)}${pad("floor", 9)}${pad("result", 6)}`);
  let desirabilityPass = true;
  for (const row of desirability) {
    const rowPass = row.median >= 75 && row.floor >= 50;
    if (!rowPass) desirabilityPass = false;
    console.log(
      `${pad(row.archetypeId, 22)}${pad(String(row.samples), 9)}${pad(row.median.toFixed(1), 9)}${pad(row.floor.toFixed(1), 9)}${pad(passLabel(rowPass), 6)}`,
    );
  }
  console.log(`Result: ${passLabel(desirabilityPass)}\n`);
  results.push({ name: "desirability", pass: desirabilityPass });

  // ---- Metric 3: repetition ----
  const repetition = computeRepetition(samples);
  console.log("=== Metric 3: Repetition (target: < 2% identical-pair probability per deck state) ===");
  console.log(`mean P(identical pair) = ${fmtPct(repetition.meanProbability * 100, 3)}`);
  console.log(`max  P(identical pair) = ${fmtPct(repetition.maxProbability * 100, 3)} (state ${repetition.worstState})`);
  const repetitionPass = repetition.meanProbability < 0.02;
  console.log(`Result: ${passLabel(repetitionPass)}\n`);
  results.push({ name: "repetition", pass: repetitionPass });

  // ---- Metric 4: archetype coverage ----
  const coverage = computeArchetypeCoverage(samples);
  console.log("=== Metric 4: Archetype coverage (target: observed within 2x of weight-implied, when eligible) ===");
  console.log(`${pad("archetype", 22)}${pad("eligible", 9)}${pad("observed", 10)}${pad("expected", 10)}${pad("ratio", 8)}${pad("result", 6)}`);
  let coveragePass = true;
  for (const row of coverage) {
    if (!row.withinTarget) coveragePass = false;
    const ratioStr = Number.isFinite(row.ratio) ? row.ratio.toFixed(2) : "inf";
    const note = row.eligibleSamples === 0 ? " (never eligible)" : "";
    console.log(
      `${pad(row.archetypeId, 22)}${pad(String(row.eligibleSamples), 9)}${pad(fmtPct(row.observedShare * 100, 2), 10)}${pad(fmtPct(row.expectedShare * 100, 2), 10)}${pad(ratioStr, 8)}${pad(passLabel(row.withinTarget), 6)}${note}`,
    );
  }
  console.log(`Result: ${passLabel(coveragePass)}\n`);
  results.push({ name: "archetype_coverage", pass: coveragePass });

  // ---- Metric 5: content coverage ----
  const content = computeContentCoverage(samples, questContent);
  console.log("=== Metric 5: Content coverage ===");
  console.log("Transfiguration types (target: all 8 appear, each share > 0):");
  for (const type of ALL_TRANSFIGURATION_TYPES) {
    console.log(`  ${pad(type, 12)}${fmtPct((content.transfigurationShares[type] ?? 0) * 100, 2)}`);
  }
  console.log(`  all 8 appear: ${passLabel(content.allTransfigurationTypesAppear)}`);
  console.log(
    `Dreamsign templates offered: ${String(content.dreamsignOffered)}/${String(content.dreamsignTotal)} = ${fmtPct(content.dreamsignTemplateCoverage * 100)} (target 100%)`,
  );
  console.log(
    `Non-starter pool cards offered: ${String(content.cardsOffered)}/${String(content.nonStarterPoolTotal)} = ${fmtPct(content.cardCoverage * 100)} (target >= 90%)`,
  );
  if (content.neverOfferedCardNames.length > 0) {
    console.log(`  never offered (${String(content.neverOfferedCardNames.length)}): ${content.neverOfferedCardNames.join(", ")}`);
  }
  console.log("Deck-target diversity per targeting archetype (target: multiple distinct targets per fixed state):");
  console.log(`  ${pad("archetype", 16)}${pad("distinct(g)", 12)}${pad("perplex(g)", 11)}${pad("minDistinct/state", 18)}${pad("states>=2/total", 16)}`);
  for (const row of content.deckTargetDiversity) {
    console.log(
      `  ${pad(row.archetypeId, 16)}${pad(String(row.distinctGlobal), 12)}${pad(row.perplexityGlobal.toFixed(1), 11)}${pad(String(row.minDistinctPerState), 18)}${pad(`${String(row.statesWithMultiple)}/${String(row.statesTotal)}`, 16)}`,
    );
  }
  const transfigPass = content.allTransfigurationTypesAppear;
  const dreamsignPass = content.dreamsignTemplateCoverage >= 1.0;
  const cardPass = content.cardCoverage >= 0.9;
  const contentPass = transfigPass && dreamsignPass && cardPass;
  console.log(
    `Result: ${passLabel(contentPass)} (transfig=${passLabel(transfigPass)}, dreamsign=${passLabel(dreamsignPass)}, cards=${passLabel(cardPass)})\n`,
  );
  results.push({ name: "content_coverage", pass: contentPass });

  // ---- Summary ----
  const met = results.filter((r) => r.pass).length;
  const total = results.length;
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  console.log(`Runtime: ${elapsedSeconds.toFixed(1)}s`);
  console.log(`${String(met)}/${String(total)} metric targets met`);

  // ---- Write JSON report ----
  const report = {
    config: { records: RECORD_COUNT, seeds: SEED_COUNT, buckets: PICK_BUCKETS, encounters: samples.length },
    distinctOutcomes: distinct,
    desirability,
    repetition,
    archetypeCoverage: coverage,
    contentCoverage: content,
    summary: { met, total, results },
    runtimeSeconds: elapsedSeconds,
  };
  const reportPath = join(REPO_ROOT, "merchant-metric-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Wrote report to ${reportPath}`);
}

main();
