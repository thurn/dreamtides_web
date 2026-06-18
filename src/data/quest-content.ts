import { loadDreamsignTemplates } from "./dreamsigns";
import { loadMerchantCorpus, type MerchantCorpus } from "./merchant-corpus";
import { loadDreamsignProfiles, type DreamsignProfile } from "./dreamsign-profiles";
import { logEvent } from "../logging";
import {
  DEFAULT_STARTING_ESSENCE,
  type DreamcallerContent,
  type DreamsignTemplate,
  type Idf3CardProvenance,
  type Idf3ProvenanceSummary,
  type ResolvedDreamcallerPackage,
  type SeedCardProvenance,
  type SeedProvenanceSummary,
  type Tides4CardProvenance,
  type Tides4ProvenanceSummary,
  type Tides4TideSummary,
} from "../types/content";
import type { CardData } from "../types/cards";
import type { GeneratedPool, PoolData, PoolVariant } from "../draft/pool/types.ts";
import { DEFAULT_POOL_VARIANT } from "../draft/pool/types.ts";
import { generatePoolFromData } from "../draft/pool/generate.ts";
import { buildPoolData } from "../draft/pool/pool-data";
import { loadFigmentDatabase } from "./figment-database";
import {
  buildNameIndex,
  loadAffinityCorpus,
  loadCardsV2Database,
  loadDecklists,
  loadDraftRecords,
  loadTideDecks,
  loadTides2Decks,
  loadTides2Relationships,
  loadTides3Decks,
  loadTides4Decks,
  resolvePool,
  type DraftRecord,
} from "./cards-v2-database";
import { loadDreamcallersV2 } from "./dreamcallers-v2-database";
import { loadDreamwellCards, type DreamwellCard } from "./dreamwell-database";
import { loadDreamscapes } from "./dreamscapes";
import { loadAtlasConfig } from "./atlas-config";
import type { DreamscapeContent } from "../types/content";
import type { AtlasConfig } from "../types/quest";
import { STARTER_CARD_NUMBERS } from "./starter-cards";
import { buildFitModel, type FitModel } from "../draft/replay/fit-model";
import {
  selectReplayRecordIndex,
  resolveCardNames,
  buildPackSequence,
} from "../draft/replay/draft-records";
import { createInitialReplayDraftState } from "../draft/draft-engine";
import type { ReplayDraftState } from "../types/draft";
import type { JourneyVariant } from "../runtime/runtime-config";

export interface QuestContent {
  cardDatabase: Map<number, CardData>;
  dreamcallers: DreamcallerContent[];
  /** The shared Dreamwell deck source, drawn from during battle. */
  dreamwellCards: readonly DreamwellCard[];
  dreamsignTemplates: readonly DreamsignTemplate[];
  /**
   * Dreamscape definitions the Atlas generator assigns to nodes, loaded from
   * `public/dreamscapes-data.json`.
   */
  dreamscapes: readonly DreamscapeContent[];
  /**
   * Dream Atlas generation tuning, loaded from `public/atlas-config-data.json`.
   */
  atlasConfig: AtlasConfig;
  poolContext?: RunPoolContext;
  /**
   * Draft mode for this run: `"replay"` activates the record-replay draft;
   * `"fresh20"` activates the fresh-random-pack draft; `"pool"` is the default.
   * From `?algo=`.
   */
  draftMode?: "pool" | "replay" | "fresh20";
  /** The full adapted draft-record corpus when the run needs record-backed ranking. */
  draftRecords?: DraftRecord[];
  /**
   * The live deck-fit model built from all record mainboards when the run uses
   * record-backed recommendations or draft ranking.
   */
  fitModel?: FitModel;
  /** Cards per fresh pack in fresh20 mode (from `?packsize=`); defaults applied at use. */
  fresh20PackSize?: number;
  /**
   * Baked merchant corpus artifact (quality, multiplicity, clusters) loaded
   * from `public/merchant-corpus-data.json`.  Populated unconditionally when
   * the v2 journey can be reached; absent before `npm run bake-merchant-corpus`
   * has been run.
   */
  merchantCorpus?: MerchantCorpus;
  /**
   * Curated dreamsign profiles keyed by dreamsign UUID, loaded from
   * `public/dreamsign-profiles-data.json`.  A dreamsign absent from the map
   * is treated as featureless quality 2 by the merchant signal layer.
   */
  dreamsignProfiles?: ReadonlyMap<string, DreamsignProfile>;
}

/**
 * Inputs shared across every Dreamcaller package build for a single quest run:
 * the prebuilt pool data, the card-name -> card-number index, and the run's
 * dreamsign pool ids.
 */
export interface RunPoolContext {
  poolData: PoolData;
  nameIndex: Map<string, number>;
  allDreamsignPoolIds: string[];
  /**
   * Pool-construction strategy for this run, from `?algo=`. Absent contexts
   * (e.g. tests) fall back to {@link DEFAULT_POOL_VARIANT}.
   */
  poolVariant?: PoolVariant;
}

const POOL_TARGET_SIZE = 200;

/**
 * Pool variants that grow their pool from the draft-record corpus
 * (`poolData.draftRecords`). In pool mode the records are only fetched for these
 * variants; any variant added here must read records in its corpus builder, and
 * any record-driven variant omitted here will silently fall back to the random
 * color-pool generator at runtime.
 */
const POOL_VARIANTS_NEEDING_RECORDS: ReadonlySet<PoolVariant> = new Set<PoolVariant>([
  "pickfit",
  "pickearly",
  "pickpos",
  "pickchoice",
  "pickcohere",
  "picksig",
  "sigseed",
]);

/** Whether `variant` grows its pool from the draft-record corpus. */
export function poolVariantNeedsRecords(variant: PoolVariant): boolean {
  return POOL_VARIANTS_NEEDING_RECORDS.has(variant);
}

/**
 * Pool variants that grow their pool from the committed affinity corpus
 * (`data/affinity_corpus.jsonc`, served as `/affinity-corpus-data.json`) instead
 * of the draft records. In pool mode the corpus is fetched only for these
 * variants and set on `poolData.affinityCorpus`; they do not need the raw
 * records, so the records fetch stays gated on
 * {@link POOL_VARIANTS_NEEDING_RECORDS} alone.
 */
const POOL_VARIANTS_NEEDING_CORPUS: ReadonlySet<PoolVariant> =
  new Set<PoolVariant>(["embedded"]);

/** Whether `variant` grows its pool from the committed affinity corpus. */
export function poolVariantNeedsCorpus(variant: PoolVariant): boolean {
  return POOL_VARIANTS_NEEDING_CORPUS.has(variant);
}

/**
 * Pool variants that combine the committed tide decks (`data/tides.jsonc`,
 * served as `/tides-data.json`). In pool mode the artifact is fetched only for
 * these variants and set on `poolData.tideDecks`.
 */
const POOL_VARIANTS_NEEDING_TIDES: ReadonlySet<PoolVariant> =
  new Set<PoolVariant>(["tides"]);

/** Whether `variant` combines the committed tide decks. */
export function poolVariantNeedsTides(variant: PoolVariant): boolean {
  return POOL_VARIANTS_NEEDING_TIDES.has(variant);
}

/**
 * Pool variants that combine the committed `tides2` tide decks
 * (`data/tides2.jsonc`) and their curated relationships
 * (`data/tides2_relationships.jsonc`). In pool mode both are fetched only for
 * these variants and set on `poolData.tides2Decks` / `poolData.tides2Relationships`.
 */
const POOL_VARIANTS_NEEDING_TIDES2: ReadonlySet<PoolVariant> =
  new Set<PoolVariant>(["tides2"]);

/** Whether `variant` combines the committed `tides2` tide decks. */
export function poolVariantNeedsTides2(variant: PoolVariant): boolean {
  return POOL_VARIANTS_NEEDING_TIDES2.has(variant);
}

/**
 * Pool variants that combine the committed `tides3` artifact (`data/tides3.jsonc`,
 * served as `/tides3-data.json`): the tide decks and the per-Dreamcaller tide
 * pools in one file. In pool mode the artifact is fetched only for these variants
 * and set on `poolData.tides3Decks`.
 */
const POOL_VARIANTS_NEEDING_TIDES3: ReadonlySet<PoolVariant> =
  new Set<PoolVariant>(["tides3"]);

/** Whether `variant` combines the committed `tides3` artifact. */
export function poolVariantNeedsTides3(variant: PoolVariant): boolean {
  return POOL_VARIANTS_NEEDING_TIDES3.has(variant);
}

/**
 * Pool variants that combine the committed `tides4` artifact (`data/tides4.jsonc`,
 * served as `/tides4-data.json`): the tide decks and the per-Dreamcaller tide
 * pools in one file. In pool mode the artifact is fetched only for these variants
 * and set on `poolData.tides4Decks`.
 */
const POOL_VARIANTS_NEEDING_TIDES4: ReadonlySet<PoolVariant> =
  new Set<PoolVariant>(["tides4"]);

/** Whether `variant` combines the committed `tides4` artifact. */
export function poolVariantNeedsTides4(variant: PoolVariant): boolean {
  return POOL_VARIANTS_NEEDING_TIDES4.has(variant);
}

/**
 * Pool variants that draw one random seed card and grow a pool around it, so
 * each produces a {@link SeedProvenanceSummary}: the `seed` variant (decklist
 * co-occurrence) plus the pick-record variants. These are the variants whose
 * starting card and per-card growth metrics the Pool Viewer and "Why Cards"
 * overlay surface. Any affinity-grown variant added to the registry must be
 * listed here, or its seed provenance will not be computed for those surfaces.
 */
export const AFFINITY_GROWN_POOL_VARIANTS: ReadonlySet<PoolVariant> =
  new Set<PoolVariant>([
    "seed",
    ...POOL_VARIANTS_NEEDING_RECORDS,
    ...POOL_VARIANTS_NEEDING_CORPUS,
  ]);

/**
 * FNV-1a hash of a string into a 32-bit unsigned integer, used to derive the
 * idf3 generator's numeric seed from the quest seed and Dreamcaller id so each
 * run's pool is reproducible. Exported so replay record selection derives its
 * record index from the same quest seed (with a `:replay` salt), keeping draft
 * selection reproducible per run.
 */
export function hashStringToSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Generate the draft pool for one Dreamcaller, using the run's selected pool
 * strategy (`ctx.poolVariant`, from `?algo=`, defaulting to
 * {@link DEFAULT_POOL_VARIANT}), steered by its signature cards and pinned to the
 * run's deterministic seed. The single source of pool generation for both the
 * draft package and its provenance summary, so the two always describe the exact
 * same pool. The signature-card steering and the provenance summary apply only
 * to the `idf3` strategy; other strategies ignore the signature and produce no
 * provenance.
 */
function generateDreamcallerPool(
  dreamcaller: DreamcallerContent,
  ctx: RunPoolContext,
  questSeed: string,
): GeneratedPool {
  return generatePoolFromData(
    ctx.poolData,
    hashStringToSeed(`${questSeed}:${dreamcaller.id}`),
    undefined,
    ctx.poolVariant ?? DEFAULT_POOL_VARIANT,
    undefined,
    POOL_TARGET_SIZE,
    dreamcaller.signatureCards ?? [],
    dreamcaller.id,
  );
}

/** How many top cards (by blended admission score) `draft_pool_constructed` records. */
const POOL_CONSTRUCTED_LOG_TOP_CARDS = 20;

function roundTo3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Emit `draft_pool_constructed`, the "why is my pool shaped like this" record,
 * captured at the one point the freshly built {@link GeneratedPool} (and its
 * provenance) is in hand. Always logs the algorithm (`?algo=`), the seed, and
 * the size, which together reproduce and identify the pool. For the
 * affinity-grown variants (`pickearly`/`pickfit`/`seed`/`pickpos`/`pickchoice`)
 * it adds the single seed card the pool grew outward from, the seed-vs-pool
 * blend weight, the seed's strongest partners that landed in the pool, and the
 * top {@link POOL_CONSTRUCTED_LOG_TOP_CARDS} cards by blended admission score —
 * each with the order it joined, copies, and its seed/pool affinities. Read it
 * from `logs/quest-log.jsonl` filtered by the run's `gameId`. The tide variants
 * (`tides`/`tides2`/`tides3`) add `tideDeckIds` — the lead and fill tide decks the pool
 * was dealt from, to cross-reference against `data/<algo>.jsonc`. Other variants
 * with no seed-growth story (e.g. `idf3`, `color_pool`) log the base fields only.
 */
function logPoolConstructed(
  dreamcaller: DreamcallerContent,
  ctx: RunPoolContext,
  pool: GeneratedPool,
): void {
  const numberOf = (name: string): number | null => ctx.nameIndex.get(name) ?? null;
  const base = {
    dreamcallerId: dreamcaller.id,
    algo: pool.variant,
    seed: pool.seed,
    poolSize: pool.size,
    distinctCardCount: pool.counts.size,
  };

  const provenance = pool.seedProvenance;
  if (provenance === undefined) {
    // The tide variants (`tides`/`tides2`/`tides3`) carry no seed-growth story, but their
    // pool is composed entirely of preconstructed tide decks recorded in
    // `pool.themes` as `["<algo>", ...tideDeckIds]`. Logging those ids is the
    // "which tides made up my pool" record — cross-reference them against
    // `data/<algo>.jsonc` to see each tide's theme and cards, which is how you
    // answer "why does my warrior Dreamcaller have so few warrior cards" without
    // re-running the build.
    const tideDeckIds =
      pool.variant === "tides" ||
      pool.variant === "tides2" ||
      pool.variant === "tides3" ||
      pool.variant === "tides4"
        ? pool.themes.slice(1)
        : undefined;
    logEvent(
      "draft_pool_constructed",
      tideDeckIds === undefined ? base : { ...base, tideDeckIds },
    );
    return;
  }

  const topCards = Object.entries(provenance.cardProvenanceByName)
    .sort((a, b) => b[1].blendedScore - a[1].blendedScore)
    .slice(0, POOL_CONSTRUCTED_LOG_TOP_CARDS)
    .map(([name, entry]) => ({
      name,
      cardNumber: numberOf(name),
      addOrder: entry.addOrder,
      copies: entry.copies,
      seedAffinity: roundTo3(entry.seedAffinity),
      poolAffinity: roundTo3(entry.poolAffinity),
      blendedScore: roundTo3(entry.blendedScore),
    }));

  logEvent("draft_pool_constructed", {
    ...base,
    seedCardName: provenance.seedCardName,
    seedCardNumber: numberOf(provenance.seedCardName),
    seedAffinityWeight: provenance.seedAffinityWeight,
    totalCopies: provenance.totalCopies,
    doubledCardCount: provenance.doubledCardCount,
    topPartners: provenance.topPartnerCardNames.map((name) => ({
      name,
      cardNumber: numberOf(name),
    })),
    topCards,
  });
}

/**
 * Build the draft package for one Dreamcaller by generating its pool with the
 * run's selected strategy (see {@link generateDreamcallerPool}), resolving it
 * against the run's name index, and excluding starter cards from both the draft
 * pool and the starter decklist. Deterministic per `(questSeed, dreamcaller.id)`.
 */
export function buildDreamcallerPackage(
  dreamcaller: DreamcallerContent,
  ctx: RunPoolContext,
  questSeed: string,
): ResolvedDreamcallerPackage {
  const pool = generateDreamcallerPool(dreamcaller, ctx, questSeed);
  logPoolConstructed(dreamcaller, ctx, pool);

  const { draftPoolCopiesByCard, unresolvedNames } = resolvePool(pool, ctx.nameIndex);
  if (unresolvedNames.length > 0) {
    logEvent("build_dreamcaller_package_unresolved_names", {
      dreamcallerId: dreamcaller.id,
      unresolvedCount: unresolvedNames.length,
      unresolvedNames,
    });
  }
  for (const starter of STARTER_CARD_NUMBERS) {
    delete draftPoolCopiesByCard[String(starter)];
  }

  const starterSet = new Set(STARTER_CARD_NUMBERS);
  const seen = new Set<number>();
  const starterDecklistCardNumbers: number[] = [];
  for (const name of pool.starterDeck ?? []) {
    const cardNumber = ctx.nameIndex.get(name);
    if (cardNumber === undefined) continue;
    if (starterSet.has(cardNumber)) continue;
    if (seen.has(cardNumber)) continue;
    seen.add(cardNumber);
    starterDecklistCardNumbers.push(cardNumber);
  }

  const draftPoolSize = countDraftPoolSize(draftPoolCopiesByCard);
  const doubledCardCount = countDoubledCards(draftPoolCopiesByCard);

  return {
    dreamcaller,
    draftPoolCopiesByCard,
    dreamsignPoolIds: [...ctx.allDreamsignPoolIds],
    mandatoryOnlyPoolSize: draftPoolSize,
    draftPoolSize,
    doubledCardCount,
    legalSubsetCount: 1, // idf3 generates a single pool; no subset enumeration
    preferredSubsetCount: 1, // idf3 generates a single pool; no subset enumeration
    starterDecklistCardNumbers,
  };
}

/**
 * Recompute the full `idf3` provenance for one Dreamcaller's pool, resolved
 * against the run's name index so per-card entries are keyed by card number.
 * Reproduces the exact pool {@link buildDreamcallerPackage} built (same seed and
 * inputs), so the "Why Cards" surface can explain every offered card without the
 * provenance ever being persisted. Returns `null` for non-`idf3` pools (no
 * provenance is produced). Per-card entries for starter cards are dropped, since
 * those never appear as draftable pool cards.
 */
export function buildDreamcallerProvenance(
  dreamcaller: DreamcallerContent,
  ctx: RunPoolContext,
  questSeed: string,
): Idf3ProvenanceSummary | null {
  const pool = generateDreamcallerPool(dreamcaller, ctx, questSeed);
  const provenance = pool.idf3Provenance;
  if (provenance === undefined) return null;

  const starterSet = new Set(STARTER_CARD_NUMBERS);
  const cardProvenanceByNumber: Record<string, Idf3CardProvenance> = {};
  for (const [name, entry] of Object.entries(provenance.cardProvenanceByName)) {
    const cardNumber = ctx.nameIndex.get(name);
    if (cardNumber === undefined) continue;
    if (starterSet.has(cardNumber)) continue;
    cardProvenanceByNumber[String(cardNumber)] = { ...entry };
  }

  return {
    signatureCardNames: [...provenance.signatureCardNames],
    signatureWeightedNames: [...provenance.signatureWeightedNames],
    signatureDroppedNames: [...provenance.signatureDroppedNames],
    anchors: provenance.anchors.map((a) => ({
      similarityToSignature: a.similarityToSignature,
      distinctiveCardNames: [...a.distinctiveCardNames],
    })),
    starterDistinctiveCardNames: [...provenance.starterDistinctiveCardNames],
    starterCardCount: provenance.starterCardCount,
    sourceDecks: provenance.sourceDecks.map((d) => ({
      rank: d.rank,
      similarityToStarter: d.similarityToStarter,
      distinctiveCardNames: [...d.distinctiveCardNames],
      contributedCardCount: d.contributedCardCount,
    })),
    cardProvenanceByNumber,
  };
}

/**
 * Recompute the full seed-growth provenance for one Dreamcaller's pool, resolved
 * against the run's name index so per-card entries are keyed by card number.
 * Reproduces the exact pool {@link buildDreamcallerPackage} built (same seed and
 * inputs), so the "Why Cards" surface can explain the random seed card and how
 * the pool grew without the provenance ever being persisted. Returns a summary
 * for every affinity-grown variant (`seed`, `pickfit`, `pickearly`, `pickpos`,
 * `pickchoice`) and `null` for variants that produce no seed-growth story.
 * Per-card entries for starter cards are dropped, since those never appear as
 * draftable pool cards.
 */
export function buildDreamcallerSeedProvenance(
  dreamcaller: DreamcallerContent,
  ctx: RunPoolContext,
  questSeed: string,
): SeedProvenanceSummary | null {
  const pool = generateDreamcallerPool(dreamcaller, ctx, questSeed);
  const provenance = pool.seedProvenance;
  if (provenance === undefined) return null;

  const starterSet = new Set(STARTER_CARD_NUMBERS);
  const cardProvenanceByNumber: Record<string, SeedCardProvenance> = {};
  for (const [name, entry] of Object.entries(provenance.cardProvenanceByName)) {
    const cardNumber = ctx.nameIndex.get(name);
    if (cardNumber === undefined) continue;
    if (starterSet.has(cardNumber)) continue;
    cardProvenanceByNumber[String(cardNumber)] = { ...entry };
  }

  return {
    variant: pool.variant,
    seedCardName: provenance.seedCardName,
    seedCardNumber: ctx.nameIndex.get(provenance.seedCardName) ?? null,
    targetSize: provenance.targetSize,
    seedAffinityWeight: provenance.seedAffinityWeight,
    distinctCardCount: provenance.distinctCardCount,
    totalCopies: provenance.totalCopies,
    doubledCardCount: provenance.doubledCardCount,
    topPartnerCardNames: [...provenance.topPartnerCardNames],
    cardProvenanceByNumber,
  };
}

/**
 * Recompute the full `tides4` tide provenance for one Dreamcaller's pool,
 * resolved against the run's name index so per-card entries and per-tide
 * decklists are keyed by card number. Reproduces the exact pool
 * {@link buildDreamcallerPackage} built (same seed and inputs), so the Pool
 * Viewer can show each individual tide deck and the "Why Cards" surface can
 * attribute every offered card to its source tide without the provenance ever
 * being persisted. Returns `null` for non-`tides4` pools. Starter cards (never
 * draftable) are dropped from both the per-tide decklists and the per-card map,
 * and each tide's `contributedCardCount` is recounted over the dropped-starter
 * pool so it matches what a player actually sees.
 */
export function buildDreamcallerTides4Provenance(
  dreamcaller: DreamcallerContent,
  ctx: RunPoolContext,
  questSeed: string,
): Tides4ProvenanceSummary | null {
  const pool = generateDreamcallerPool(dreamcaller, ctx, questSeed);
  const provenance = pool.tides4Provenance;
  if (provenance === undefined) return null;

  const starterSet = new Set(STARTER_CARD_NUMBERS);
  const toNumbers = (names: readonly string[]): number[] => {
    const out: number[] = [];
    const seen = new Set<number>();
    for (const name of names) {
      const cardNumber = ctx.nameIndex.get(name);
      if (cardNumber === undefined) continue;
      if (starterSet.has(cardNumber)) continue;
      if (seen.has(cardNumber)) continue;
      seen.add(cardNumber);
      out.push(cardNumber);
    }
    return out;
  };

  const cardProvenanceByNumber: Record<string, Tides4CardProvenance> = {};
  const contributionByTide = new Map<string, number>();
  for (const [name, entry] of Object.entries(provenance.cardProvenanceByName)) {
    const cardNumber = ctx.nameIndex.get(name);
    if (cardNumber === undefined) continue;
    if (starterSet.has(cardNumber)) continue;
    cardProvenanceByNumber[String(cardNumber)] = {
      copies: entry.copies,
      tideIds: [...entry.tideIds],
      primaryTideId: entry.primaryTideId,
    };
    if (entry.primaryTideId !== "") {
      contributionByTide.set(
        entry.primaryTideId,
        (contributionByTide.get(entry.primaryTideId) ?? 0) + 1,
      );
    }
  }

  const tides: Tides4TideSummary[] = provenance.tides.map((tide) => ({
    id: tide.id,
    name: tide.name,
    displayName: tide.displayName,
    displayDescription: tide.displayDescription,
    role: tide.role,
    selection: tide.selection,
    joined: tide.joined,
    cardNumbers: toNumbers(tide.cardNames),
    contributedCardCount: contributionByTide.get(tide.id) ?? 0,
  }));

  return {
    dreamcallerId: provenance.dreamcallerId,
    signatureless: provenance.signatureless,
    borrowedArchetypeName: provenance.borrowedArchetypeName,
    dealSize: provenance.dealSize,
    cap: provenance.cap,
    facetDrawnCount: provenance.facetDrawnCount,
    facetAvailableCount: provenance.facetAvailableCount,
    tides,
    cardProvenanceByNumber,
  };
}

/**
 * Loads V2 quest content (cards, Dreamcallers, decklists) and the run pool
 * context. `poolVariant` (from `?algo=`) selects the pool-construction strategy
 * for the run; it defaults to {@link DEFAULT_POOL_VARIANT}. `draftMode` (from
 * `?algo=`) switches to a deck-fit draft: `"replay"` replays a real record's
 * packs, `"fresh20"` rolls fresh random packs. Both fetch the full draft-record
 * corpus and build the live deck-fit model from it. The v2 journey variant uses
 * the same model in pool mode. Classic pool mode fetches records when the pool
 * variant uses the draft-record corpus. `fresh20PackSize` (from `?packsize=`)
 * is carried through for the fresh20 draft.
 */
export async function loadQuestContent(
  poolVariant: PoolVariant = DEFAULT_POOL_VARIANT,
  draftMode: "pool" | "replay" | "fresh20" = "pool",
  fresh20PackSize?: number,
  journeyVariant: JourneyVariant = "classic",
): Promise<QuestContent> {
  // Deck-fit modes and the v2 merchant path need the record corpus to build the
  // fit model.
  const usesFitModel =
    draftMode === "replay" || draftMode === "fresh20" || journeyVariant === "v2";
  // The pick-data pool variants grow their pool from the same record corpus, so
  // they need the records fetched in pool mode too. Without the records each
  // builds an empty corpus and `growPoolFromCorpus` silently falls back to the
  // random color-pool generator — an unfocused pool that is not the variant the
  // run asked for.
  const poolNeedsRecords = POOL_VARIANTS_NEEDING_RECORDS.has(poolVariant);
  // The `embedded` variant grows from the committed affinity corpus instead of
  // the records, so it fetches `/affinity-corpus-data.json` rather than the
  // 19 MB record bundle; other pool modes skip it.
  const poolNeedsCorpus = POOL_VARIANTS_NEEDING_CORPUS.has(poolVariant);
  // The `tides` variant combines the committed tide decks; only it fetches
  // `/tides-data.json`.
  const poolNeedsTides = POOL_VARIANTS_NEEDING_TIDES.has(poolVariant);
  // The `tides2` variant combines its own (smaller) tide decks and their curated
  // relationships; only it fetches `/tides2-data.json` and the relationships.
  const poolNeedsTides2 = POOL_VARIANTS_NEEDING_TIDES2.has(poolVariant);
  // The `tides3` variant combines its own committed artifact; only it fetches
  // `/tides3-data.json`.
  const poolNeedsTides3 = POOL_VARIANTS_NEEDING_TIDES3.has(poolVariant);
  // The `tides4` variant combines its own committed artifact; only it fetches
  // `/tides4-data.json`.
  const poolNeedsTides4 = POOL_VARIANTS_NEEDING_TIDES4.has(poolVariant);
  // Hydrate the figment catalog from figments.toml in the background so battle
  // figments render with their editor-authored name, character type, spark,
  // rules text, and art. A failure is non-fatal: the catalog keeps its built-in
  // rules defaults.
  void loadFigmentDatabase().catch(() => undefined);

  const [
    cardDatabase,
    draftDreamcallers,
    dreamwellCards,
    dreamsignTemplates,
    decklists,
    draftRecords,
    affinityCorpus,
    tideDecks,
    tides2Decks,
    tides3Decks,
    tides4Decks,
    merchantCorpus,
    dreamsignProfiles,
    dreamscapes,
    atlasConfig,
  ] = await Promise.all([
    loadCardsV2Database(),
    loadDreamcallersV2(),
    loadDreamwellCards(),
    loadDreamsignTemplates(),
    loadDecklists(),
    // Fetch the draft records corpus when a deck-fit mode or a pick-data pool
    // variant needs it; other pool modes skip it so the default load path incurs
    // no extra network cost.
    usesFitModel || poolNeedsRecords
      ? loadDraftRecords()
      : Promise.resolve([] as DraftRecord[]),
    // Fetch the committed corpus only for the variants that grow from it.
    poolNeedsCorpus
      ? loadAffinityCorpus()
      : Promise.resolve(null),
    // Fetch the committed tide decks only for the `tides` variant.
    poolNeedsTides ? loadTideDecks() : Promise.resolve(null),
    // Fetch the committed `tides2` tide decks only for the `tides2` variant.
    poolNeedsTides2 ? loadTides2Decks() : Promise.resolve(null),
    // Fetch the committed `tides3` artifact only for the `tides3` variant.
    poolNeedsTides3 ? loadTides3Decks() : Promise.resolve(null),
    // Fetch the committed `tides4` artifact only for the `tides4` variant.
    poolNeedsTides4 ? loadTides4Decks() : Promise.resolve(null),
    // The merchant corpus and dreamsign profiles are small and always loaded
    // unconditionally so the v2 journey's merchant has signals on every path.
    loadMerchantCorpus().catch(() => undefined as MerchantCorpus | undefined),
    loadDreamsignProfiles().catch(
      () => undefined as ReadonlyMap<string, DreamsignProfile> | undefined,
    ),
    // Dreamscape definitions and Atlas generation tuning are small and always
    // loaded so the 7-layer Atlas generator can assign and tune nodes.
    loadDreamscapes(),
    loadAtlasConfig(),
  ]);

  const dreamcallers: DreamcallerContent[] = draftDreamcallers.map((dc) => ({
    id: dc.id,
    name: dc.name,
    title: dc.title,
    renderedText: dc.renderedText,
    imageNumber: dc.imageNumber,
    startingEssence: dc.startingEssence || DEFAULT_STARTING_ESSENCE,
    signatureCards: [...(dc.signatureCards ?? [])],
  }));

  // Build the name index once; reused by both poolContext and (in replay mode)
  // the fit model to avoid building it twice.
  const nameIndex = buildNameIndex(cardDatabase);

  const poolData = buildPoolData(
    Array.from(cardDatabase.values()),
    decklists,
    // The pick-data variants key on stable card ids, so feed them the
    // records' id arrays.
    draftRecords.map((r) => ({ packs: r.packIds, picks: r.pickIds })),
  );
  // The `embedded` variant reads its corpus from here; every other variant
  // ignores it, so this never changes any other variant's pools.
  if (affinityCorpus) poolData.affinityCorpus = affinityCorpus;
  // The `tides` variant reads the committed tide decks from here; every other
  // variant ignores them.
  if (tideDecks) poolData.tideDecks = tideDecks;
  // The `tides2` variant reads its own tide decks and the curated relationships
  // (validated against those tide ids). Fetched only for `tides2` and only once
  // its decks are in hand, since the relationship validation keys on their ids.
  if (tides2Decks) {
    poolData.tides2Decks = tides2Decks;
    const tides2Relationships = await loadTides2Relationships(tides2Decks);
    if (tides2Relationships) poolData.tides2Relationships = tides2Relationships;
  }
  // The `tides3` variant reads its committed artifact (decks + per-Dreamcaller
  // tide pools) from here; every other variant ignores it.
  if (tides3Decks) poolData.tides3Decks = tides3Decks;
  // The `tides4` variant reads its committed artifact (decks + per-Dreamcaller
  // tide pools) from here; every other variant ignores it.
  if (tides4Decks) poolData.tides4Decks = tides4Decks;

  const poolContext: RunPoolContext = {
    poolData,
    nameIndex,
    allDreamsignPoolIds: dreamsignTemplates.map((template) => template.id),
    poolVariant,
  };

  if (usesFitModel) {
    // Live fit corpus = all record mainboards (no per-record leave-one-out).
    // Live play does not teacher-force the deck along the replayed record's pick
    // path, so the self-neighbour leak the offline eval guards against does not
    // occur here; the eval's leave-one-out exists only to produce an honest
    // offline metric.
    const fitModel =
      draftRecords.length > 0
        ? buildFitModel(
            draftRecords.map((r) => r.mainboard),
            nameIndex,
          )
        : undefined;

    return {
      cardDatabase,
      dreamcallers,
      dreamwellCards,
      dreamsignTemplates,
      dreamscapes,
      atlasConfig,
      poolContext,
      draftMode,
      draftRecords,
      fitModel,
      fresh20PackSize,
      merchantCorpus,
      dreamsignProfiles,
    };
  }

  return {
    cardDatabase,
    dreamcallers,
    dreamwellCards,
    dreamsignTemplates,
    dreamscapes,
    atlasConfig,
    poolContext,
    draftMode,
    merchantCorpus,
    dreamsignProfiles,
  };
}

/**
 * Build a {@link ReplayDraftState} for a new quest run in replay mode. Selects
 * a draft record deterministically from the corpus, biased toward records whose
 * served packs contain the Dreamcaller's signature (archetype) cards so the
 * player can draft toward that archetype. The salted hash of `questSeed` (the
 * `:replay` salt keeps the selection independent from the per-Dreamcaller
 * pool-gen draw, which uses `${questSeed}:${dreamcaller.id}`) seeds the final
 * pick within the matched shortlist, keeping the selection reproducible per
 * seed. When no usable IDF signal is available (no fitModel, no weighted
 * signatures) the selection falls back to a uniform seeded draw.
 *
 * @throws If `draftRecords` is empty.
 */
export function buildReplayDraftState(
  dreamcaller: DreamcallerContent,
  nameIndex: Map<string, number>,
  questSeed: string,
  draftRecords: readonly DraftRecord[],
  fitModel?: FitModel,
): ReplayDraftState {
  if (draftRecords.length === 0) {
    throw new Error("buildReplayDraftState requires at least one draft record");
  }
  const index = selectReplayRecordIndex(
    dreamcaller.signatureCards ?? [],
    draftRecords,
    fitModel?.idf,
    hashStringToSeed(`${questSeed}:replay`),
  );
  const record = draftRecords[index];
  const packSequence = buildPackSequence(record, nameIndex);
  const signatureCardNumbers = resolveCardNames(
    dreamcaller.signatureCards ?? [],
    nameIndex,
  );
  return createInitialReplayDraftState({
    recordId: record.id,
    packSequence,
    signatureCardNumbers,
  });
}

function countDraftPoolSize(draftPoolCopiesByCard: Record<string, number>): number {
  return Object.values(draftPoolCopiesByCard).reduce(
    (total, copies) => total + copies,
    0,
  );
}

function countDoubledCards(draftPoolCopiesByCard: Record<string, number>): number {
  return Object.values(draftPoolCopiesByCard).filter((copies) => copies === 2)
    .length;
}
