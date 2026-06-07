import { loadDreamsignTemplates } from "./dreamsigns";
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
} from "../types/content";
import type { CardData } from "../types/cards";
import type { GeneratedPool, PoolData, PoolVariant } from "../draft/pool/types.ts";
import { DEFAULT_POOL_VARIANT } from "../draft/pool/types.ts";
import { generatePoolFromData } from "../draft/pool/generate.ts";
import { buildPoolData } from "../draft/pool/pool-data";
import {
  buildNameIndex,
  loadCardsV2Database,
  loadDecklists,
  loadDraftRecords,
  loadHumanDecklists,
  resolvePool,
  type DraftRecord,
} from "./cards-v2-database";
import { loadDreamcallersV2 } from "./dreamcallers-v2-database";
import { STARTER_CARD_NUMBERS } from "./starter-cards";
import { buildFitModel, type FitModel } from "../draft/replay/fit-model";
import {
  selectReplayRecordIndex,
  resolveCardNames,
  buildPackSequence,
} from "../draft/replay/draft-records";
import { createInitialReplayDraftState } from "../draft/draft-engine";
import type { ReplayDraftState } from "../types/draft";

export interface QuestContent {
  cardDatabase: Map<number, CardData>;
  dreamcallers: DreamcallerContent[];
  dreamsignTemplates: readonly DreamsignTemplate[];
  poolContext?: RunPoolContext;
  /**
   * Draft mode for this run: `"replay"` activates the record-replay draft;
   * `"fresh20"` activates the fresh-random-pack draft; `"pool"` is the default.
   * From `?algo=`.
   */
  draftMode?: "pool" | "replay" | "fresh20";
  /** Loaded in replay mode (the full adapted draft-record corpus). */
  draftRecords?: DraftRecord[];
  /**
   * The live deck-fit model built from all record mainboards. Loaded in both
   * the replay and fresh20 modes, which share the same fit ranking.
   */
  fitModel?: FitModel;
  /** Cards per fresh pack in fresh20 mode (from `?packsize=`); defaults applied at use. */
  fresh20PackSize?: number;
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
  );
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
 * Recompute the full `seed` provenance for one Dreamcaller's pool, resolved
 * against the run's name index so per-card entries are keyed by card number.
 * Reproduces the exact pool {@link buildDreamcallerPackage} built (same seed and
 * inputs), so the "Why Cards" surface can explain the random seed card and how
 * the pool grew without the provenance ever being persisted. Returns `null` for
 * non-`seed` pools. Per-card entries for starter cards are dropped, since those
 * never appear as draftable pool cards.
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
 * Loads V2 quest content (cards, Dreamcallers, decklists) and the run pool
 * context. `poolVariant` (from `?algo=`) selects the pool-construction strategy
 * for the run; it defaults to {@link DEFAULT_POOL_VARIANT}. `draftMode` (from
 * `?algo=`) switches to a deck-fit draft: `"replay"` replays a real record's
 * packs, `"fresh20"` rolls fresh random packs. Both fetch the full draft-record
 * corpus and build the live deck-fit model from it. In pool mode no records are
 * fetched, keeping the default path cost-free. `fresh20PackSize` (from
 * `?packsize=`) is carried through for the fresh20 draft.
 */
export async function loadQuestContent(
  poolVariant: PoolVariant = DEFAULT_POOL_VARIANT,
  draftMode: "pool" | "replay" | "fresh20" = "pool",
  fresh20PackSize?: number,
): Promise<QuestContent> {
  // Both deck-fit modes need the record corpus to build the fit model.
  const usesFitModel = draftMode === "replay" || draftMode === "fresh20";
  const [
    cardDatabase,
    draftDreamcallers,
    dreamsignTemplates,
    decklists,
    humanDecklists,
    draftRecords,
  ] = await Promise.all([
    loadCardsV2Database(),
    loadDreamcallersV2(),
    loadDreamsignTemplates(),
    loadDecklists(),
    loadHumanDecklists(),
    // Only fetch the draft records corpus for the deck-fit modes; pool mode
    // skips this entirely so the default load path incurs no extra network cost.
    usesFitModel ? loadDraftRecords() : Promise.resolve([] as DraftRecord[]),
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

  const poolContext: RunPoolContext = {
    poolData: buildPoolData(
      Array.from(cardDatabase.values()),
      decklists,
      undefined,
      humanDecklists,
    ),
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
      dreamsignTemplates,
      poolContext,
      draftMode,
      draftRecords,
      fitModel,
      fresh20PackSize,
    };
  }

  return {
    cardDatabase,
    dreamcallers,
    dreamsignTemplates,
    poolContext,
    draftMode,
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
