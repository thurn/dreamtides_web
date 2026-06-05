import { loadDreamsignTemplates } from "./dreamsigns";
import { logEvent } from "../logging";
import {
  DEFAULT_STARTING_ESSENCE,
  type DreamcallerContent,
  type DreamsignTemplate,
  type Idf3CardProvenance,
  type Idf3ProvenanceSummary,
  type ResolvedDreamcallerPackage,
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
  resolvePool,
} from "./cards-v2-database";
import { loadDreamcallersV2 } from "./dreamcallers-v2-database";
import { STARTER_CARD_NUMBERS } from "./starter-cards";

export interface QuestContent {
  cardDatabase: Map<number, CardData>;
  dreamcallers: DreamcallerContent[];
  dreamsignTemplates: readonly DreamsignTemplate[];
  poolContext?: RunPoolContext;
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
 * run's pool is reproducible.
 */
function hashStringToSeed(input: string): number {
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
 * Loads V2 quest content (cards, Dreamcallers, decklists) and the run pool
 * context. `poolVariant` (from `?algo=`) selects the pool-construction strategy
 * for the run; it defaults to {@link DEFAULT_POOL_VARIANT}.
 */
export async function loadQuestContent(
  poolVariant: PoolVariant = DEFAULT_POOL_VARIANT,
): Promise<QuestContent> {
  const [cardDatabase, draftDreamcallers, dreamsignTemplates, decklists] =
    await Promise.all([
      loadCardsV2Database(),
      loadDreamcallersV2(),
      loadDreamsignTemplates(),
      loadDecklists(),
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

  const poolContext: RunPoolContext = {
    poolData: buildPoolData(Array.from(cardDatabase.values()), decklists),
    nameIndex: buildNameIndex(cardDatabase),
    allDreamsignPoolIds: dreamsignTemplates.map((template) => template.id),
    poolVariant,
  };

  return {
    cardDatabase,
    dreamcallers,
    dreamsignTemplates,
    poolContext,
  };
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
