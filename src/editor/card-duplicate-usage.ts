import type { EditorCardRecord } from "./types";

/** Duplicate-source counts for one UUID-keyed card record. */
export interface CardDuplicateUsage {
  nameCount: number;
  artCount: number;
}

type DuplicateFacet = keyof CardDuplicateUsage;

function markDuplicateRun(
  usageByCardId: Map<string, CardDuplicateUsage>,
  cards: readonly EditorCardRecord[],
  facet: DuplicateFacet,
): void {
  if (cards.length < 2) {
    return;
  }

  for (const card of cards) {
    const current = usageByCardId.get(card.id) ?? {
      nameCount: 1,
      artCount: 1,
    };
    usageByCardId.set(card.id, {
      ...current,
      [facet]: cards.length,
    });
  }
}

function markSortedDuplicateRuns(
  usageByCardId: Map<string, CardDuplicateUsage>,
  sortedCards: readonly EditorCardRecord[],
  compare: (left: EditorCardRecord, right: EditorCardRecord) => number,
  facet: DuplicateFacet,
): void {
  let runStart = 0;
  while (runStart < sortedCards.length) {
    let runEnd = runStart + 1;
    while (
      runEnd < sortedCards.length &&
      compare(sortedCards[runStart], sortedCards[runEnd]) === 0
    ) {
      runEnd += 1;
    }
    markDuplicateRun(
      usageByCardId,
      sortedCards.slice(runStart, runEnd),
      facet,
    );
    runStart = runEnd;
  }
}

/**
 * Audit the complete source catalog for reused display names and image assets.
 * The result is keyed only by stable card UUID. Name comparison exists solely
 * to report authoring collisions; it never resolves or identifies a card.
 */
export function buildCardDuplicateUsageById(
  cards: readonly EditorCardRecord[],
): ReadonlyMap<string, CardDuplicateUsage> {
  const usageByCardId = new Map<string, CardDuplicateUsage>();

  markSortedDuplicateRuns(
    usageByCardId,
    [...cards].sort((left, right) => left.name.localeCompare(right.name)),
    (left, right) => left.name.localeCompare(right.name),
    "nameCount",
  );
  markSortedDuplicateRuns(
    usageByCardId,
    [...cards].sort(
      (left, right) => left.preview.imageNumber - right.preview.imageNumber,
    ),
    (left, right) => left.preview.imageNumber - right.preview.imageNumber,
    "artCount",
  );

  return usageByCardId;
}
