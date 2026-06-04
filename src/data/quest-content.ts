import {
  isStarterCard,
  loadCardDatabase,
} from "./card-database";
import { loadDreamsignTemplates } from "./dreamsigns";
import { logEvent } from "../logging";
import type {
  DreamcallerContent,
  DreamsignTemplate,
  PackageTideId,
  ResolvedDreamcallerPackage,
} from "../types/content";
import type { CardData } from "../types/cards";
import type { PoolData } from "../draft/pool/types.ts";
import { generatePoolFromData } from "../draft/pool/generate.ts";
import { resolvePool } from "./cards-v2-database";
import { STARTER_CARD_NUMBERS } from "./starter-cards";

const DREAMCALLER_JSON_PATH = "/dreamcaller-data.json";
const LEGAL_MIN_POOL_SIZE = 175;
const LEGAL_MAX_POOL_SIZE = 225;
const PREFERRED_MIN_POOL_SIZE = 190;
const PREFERRED_MAX_POOL_SIZE = 210;
const MANDATORY_ONLY_MIN_POOL_SIZE = 110;
const MANDATORY_ONLY_MAX_POOL_SIZE = 150;

export interface QuestContent {
  cardDatabase: Map<number, CardData>;
  cardsByPackageTide: Map<PackageTideId, CardData[]>;
  dreamcallers: DreamcallerContent[];
  dreamsignTemplates: readonly DreamsignTemplate[];
  resolvedPackagesByDreamcallerId: Map<string, ResolvedDreamcallerPackage>;
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
 * Build the draft package for one Dreamcaller by generating an `idf3` pool
 * steered by the Dreamcaller's signature cards, resolving it against the run's
 * name index, and excluding starter cards from both the draft pool and the
 * starter decklist. Deterministic per `(questSeed, dreamcaller.id)`.
 */
export function buildDreamcallerPackage(
  dreamcaller: DreamcallerContent,
  ctx: RunPoolContext,
  questSeed: string,
): ResolvedDreamcallerPackage {
  const pool = generatePoolFromData(
    ctx.poolData,
    hashStringToSeed(`${questSeed}:${dreamcaller.id}`),
    undefined,
    "idf3",
    undefined,
    POOL_TARGET_SIZE,
    dreamcaller.signatureCards ?? [],
  );

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
    mandatoryTides: [],
    optionalSubset: [],
    selectedTides: [],
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

export interface PackageAdjacentCandidate<T> {
  item: T;
  overlapCount: number;
}

/** Returns the overlap count between a candidate and the selected package tides. */
export function countPackageOverlap(
  candidatePackageTides: readonly PackageTideId[],
  selectedPackageTides: Iterable<PackageTideId>,
): number {
  const selected = new Set(selectedPackageTides);
  let overlap = 0;

  for (const packageTideId of candidatePackageTides) {
    if (selected.has(packageTideId)) {
      overlap += 1;
    }
  }

  return overlap;
}

/** Returns whether a candidate shares any package tide with the selected package. */
export function isPackageAdjacent(
  candidatePackageTides: readonly PackageTideId[],
  selectedPackageTides: Iterable<PackageTideId>,
): boolean {
  return countPackageOverlap(candidatePackageTides, selectedPackageTides) > 0;
}

/** Returns overlap count or 1 when no package filtering is active. */
export function packageOverlapWeight(
  candidatePackageTides: readonly PackageTideId[],
  selectedPackageTides: readonly PackageTideId[],
): number {
  if (selectedPackageTides.length === 0) {
    return 1;
  }
  return countPackageOverlap(candidatePackageTides, selectedPackageTides);
}

/** Filters to package-adjacent items, falling back to the full pool if needed. */
export function selectPackageAdjacentOrFallback<T>(
  items: readonly T[],
  packageTides: (item: T) => readonly PackageTideId[],
  selectedPackageTides: readonly PackageTideId[],
): T[] {
  return packageAdjacentCandidatesOrFallback(
    items,
    packageTides,
    selectedPackageTides,
  ).map((candidate) => candidate.item);
}

/** Returns package-adjacent items with overlap counts, or the full pool as a flat fallback. */
export function packageAdjacentCandidatesOrFallback<T>(
  items: readonly T[],
  packageTides: (item: T) => readonly PackageTideId[],
  selectedPackageTides: readonly PackageTideId[],
): PackageAdjacentCandidate<T>[] {
  const candidates = items.map((item) => ({
    item,
    overlapCount: countPackageOverlap(packageTides(item), selectedPackageTides),
  }));

  if (selectedPackageTides.length === 0) {
    return candidates.map((candidate) => ({
      ...candidate,
      overlapCount: 1,
    }));
  }

  const adjacent = candidates.filter((candidate) => candidate.overlapCount > 0);
  if (adjacent.length > 0) {
    return adjacent;
  }

  return candidates.map((candidate) => ({
    ...candidate,
    overlapCount: 1,
  }));
}

/** Selects package-adjacent items with overlap counts, or the full pool as a flat fallback. */
export function selectPackageAdjacentWithOverlap<T>(
  items: readonly T[],
  packageTides: (item: T) => readonly PackageTideId[],
  selectedPackageTides: readonly PackageTideId[],
): PackageAdjacentCandidate<T>[] {
  return packageAdjacentCandidatesOrFallback(
    items,
    packageTides,
    selectedPackageTides,
  );
}

/** Fetches normalized Dreamcaller content from the asset pipeline output. */
export async function loadDreamcallerContent(): Promise<DreamcallerContent[]> {
  const response = await fetch(DREAMCALLER_JSON_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load Dreamcaller data: ${String(response.status)} ${response.statusText}`,
    );
  }
  return (await response.json()) as DreamcallerContent[];
}

/** Loads normalized quest content and validates Dreamcaller package data up front. */
export async function loadQuestContent(): Promise<QuestContent> {
  const [cardDatabase, dreamcallers, dreamsignTemplates] = await Promise.all([
    loadCardDatabase(),
    loadDreamcallerContent(),
    loadDreamsignTemplates(),
  ]);
  const draftableCards = Array.from(cardDatabase.values()).filter(
    (card) => !isStarterCard(card),
  );
  const cardsByPackageTide = buildCardsByPackageTideIndex(draftableCards);
  const resolvedPackagesByDreamcallerId = new Map<
    string,
    ResolvedDreamcallerPackage
  >();
  const skipped: { name: string; id: string; reason: string }[] = [];
  const validDreamcallers: DreamcallerContent[] = [];

  for (const dreamcaller of dreamcallers) {
    try {
      resolvedPackagesByDreamcallerId.set(
        dreamcaller.id,
        resolveDreamcallerPackage(
          dreamcaller,
          draftableCards,
          dreamsignTemplates,
        ),
      );
      validDreamcallers.push(dreamcaller);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skipped.push({ name: dreamcaller.name, id: dreamcaller.id, reason: message });
      logEvent("dreamcaller_package_skipped", {
        dreamcallerId: dreamcaller.id,
        dreamcallerName: dreamcaller.name,
        reason: message,
      });
    }
  }

  if (skipped.length > 0) {
    logEvent("dreamcaller_package_validation_summary", {
      validCount: validDreamcallers.length,
      skippedCount: skipped.length,
      skipped,
    });
  }

  return {
    cardDatabase,
    cardsByPackageTide,
    dreamcallers: validDreamcallers,
    dreamsignTemplates,
    resolvedPackagesByDreamcallerId,
  };
}

/** Builds a package-tide index so later generators can query adjacent cards cheaply. */
export function buildCardsByPackageTideIndex(
  cards: readonly CardData[],
): Map<PackageTideId, CardData[]> {
  const index = new Map<PackageTideId, CardData[]>();

  for (const card of cards) {
    for (const packageTideId of card.tides) {
      const bucket = index.get(packageTideId);
      if (bucket === undefined) {
        index.set(packageTideId, [card]);
      } else {
        bucket.push(card);
      }
    }
  }

  return index;
}

/** Resolves and validates the fixed package for one Dreamcaller. */
export function resolveDreamcallerPackage(
  dreamcaller: DreamcallerContent,
  cards: readonly CardData[],
  dreamsignTemplates: readonly DreamsignTemplate[],
): ResolvedDreamcallerPackage {
  const mandatoryOnlyPool = buildDraftPoolCopies(cards, dreamcaller.mandatoryTides);
  const mandatoryOnlyPoolSize = countDraftPoolSize(mandatoryOnlyPool);

  if (
    mandatoryOnlyPoolSize < MANDATORY_ONLY_MIN_POOL_SIZE ||
    mandatoryOnlyPoolSize > MANDATORY_ONLY_MAX_POOL_SIZE
  ) {
    throw new Error(
      `mandatory-only pool size ${String(mandatoryOnlyPoolSize)} is outside ${String(MANDATORY_ONLY_MIN_POOL_SIZE)}-${String(MANDATORY_ONLY_MAX_POOL_SIZE)}`,
    );
  }

  const candidates = enumeratePackageCandidates(dreamcaller.optionalTides).map(
    (optionalSubset) => {
      const selectedTides = [...dreamcaller.mandatoryTides, ...optionalSubset];
      const draftPoolCopiesByCard = buildDraftPoolCopies(cards, selectedTides);
      const draftPoolSize = countDraftPoolSize(draftPoolCopiesByCard);

      return {
        optionalSubset,
        selectedTides,
        draftPoolCopiesByCard,
        draftPoolSize,
      };
    },
  );

  const legalCandidates = candidates.filter(
    (candidate) =>
      candidate.draftPoolSize >= LEGAL_MIN_POOL_SIZE &&
      candidate.draftPoolSize <= LEGAL_MAX_POOL_SIZE,
  );

  if (legalCandidates.length === 0) {
    throw new Error(
      `no legal optional subset produced a ${String(LEGAL_MIN_POOL_SIZE)}-${String(LEGAL_MAX_POOL_SIZE)} card pool`,
    );
  }

  const preferredCandidates = legalCandidates.filter(
    (candidate) =>
      candidate.draftPoolSize >= PREFERRED_MIN_POOL_SIZE &&
      candidate.draftPoolSize <= PREFERRED_MAX_POOL_SIZE,
  );
  const usePreferred = preferredCandidates.length > 0;
  const targetCenter = usePreferred
    ? (PREFERRED_MIN_POOL_SIZE + PREFERRED_MAX_POOL_SIZE) / 2
    : (LEGAL_MIN_POOL_SIZE + LEGAL_MAX_POOL_SIZE) / 2;
  const selectedCandidate = chooseBestCandidate(
    usePreferred ? preferredCandidates : legalCandidates,
    targetCenter,
  );
  const doubledCardCount = countDoubledCards(
    selectedCandidate.draftPoolCopiesByCard,
  );
  const dreamsignPoolIds = dreamsignTemplates
    .filter((template) =>
      isPackageAdjacent(template.packageTides, selectedCandidate.selectedTides),
    )
    .map((template) => template.id);

  return {
    dreamcaller,
    mandatoryTides: [...dreamcaller.mandatoryTides],
    optionalSubset: [...selectedCandidate.optionalSubset],
    selectedTides: [...selectedCandidate.selectedTides],
    draftPoolCopiesByCard: selectedCandidate.draftPoolCopiesByCard,
    dreamsignPoolIds,
    mandatoryOnlyPoolSize,
    draftPoolSize: selectedCandidate.draftPoolSize,
    doubledCardCount,
    legalSubsetCount: legalCandidates.length,
    preferredSubsetCount: preferredCandidates.length,
  };
}

function buildDraftPoolCopies(
  cards: readonly CardData[],
  selectedPackageTides: readonly PackageTideId[],
): Record<string, number> {
  const draftPoolCopiesByCard: Record<string, number> = {};

  for (const card of cards) {
    const overlapCount = countPackageOverlap(card.tides, selectedPackageTides);
    const copies = Math.min(2, overlapCount);

    if (copies > 0) {
      draftPoolCopiesByCard[String(card.cardNumber)] = copies;
    }
  }

  return draftPoolCopiesByCard;
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

function enumeratePackageCandidates(
  optionalTides: readonly PackageTideId[],
): PackageTideId[][] {
  return [
    ...buildCombinations(optionalTides, 3),
    ...buildCombinations(optionalTides, 4),
  ];
}

function buildCombinations<T>(values: readonly T[], size: number): T[][] {
  const combinations: T[][] = [];
  const current: T[] = [];

  function visit(startIndex: number) {
    if (current.length === size) {
      combinations.push([...current]);
      return;
    }

    for (
      let index = startIndex;
      index <= values.length - (size - current.length);
      index += 1
    ) {
      current.push(values[index]);
      visit(index + 1);
      current.pop();
    }
  }

  visit(0);
  return combinations;
}

/**
 * Picks the candidate whose draft pool size is closest to the centre of the
 * target range. Ties (equal distance from centre) are broken lexicographically
 * by optional-subset key so resolution stays deterministic.
 */
function chooseBestCandidate<
  T extends { optionalSubset: readonly PackageTideId[]; draftPoolSize: number },
>(candidates: readonly T[], targetCenter: number): T {
  return [...candidates].sort((left, right) => {
    const leftDistance = Math.abs(left.draftPoolSize - targetCenter);
    const rightDistance = Math.abs(right.draftPoolSize - targetCenter);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return compareSubsetKeys(left.optionalSubset, right.optionalSubset);
  })[0];
}

function compareSubsetKeys(
  left: readonly PackageTideId[],
  right: readonly PackageTideId[],
): number {
  const leftKey = [...left].sort().join("|");
  const rightKey = [...right].sort().join("|");
  return leftKey.localeCompare(rightKey);
}
