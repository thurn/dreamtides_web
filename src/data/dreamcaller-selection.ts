import type { DreamcallerContent } from "../types/content";
import type { Dreamcaller } from "../types/quest";

/**
 * Pick a stable random offer of Dreamcallers without replacement. Generic over
 * the Dreamcaller shape so both the quest start screen (`DreamcallerContent`)
 * and the draft test harness (`DraftDreamcaller`) can share the selection logic.
 */
export function selectDreamcallerOffer<T = DreamcallerContent>(
  dreamcallers: readonly T[],
  offerSize = 3,
  rng: () => number = Math.random,
): T[] {
  if (dreamcallers.length < offerSize) {
    throw new Error(
      `Expected at least ${String(offerSize)} Dreamcallers, received ${String(dreamcallers.length)}`,
    );
  }

  const pool = [...dreamcallers];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, offerSize);
}

/** FNV-1a hash of a room seed into the numeric seed used by mulberry32. */
function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic `[0, 1)` stream used only for the shared quest-start offer. */
function offerRng(seed: string): () => number {
  let state = hashSeed(`${seed}:dreamcaller-offer`);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive the room's shared Dreamcaller offer from its immutable genesis seed.
 * Every client and every remount therefore presents the same choices.
 */
export function selectDreamcallerOfferForSeed<T = DreamcallerContent>(
  dreamcallers: readonly T[],
  seed: string,
  offerSize = 3,
): T[] {
  return selectDreamcallerOffer(dreamcallers, offerSize, offerRng(seed));
}

/**
 * Derive the Dreamcaller offer for a shared debug-reroll count. Count zero is
 * the room's original offer. Later counts use distinct deterministic salts and,
 * when another Dreamcaller exists, guarantee that at least one shown id changes
 * from the preceding offer.
 */
export function selectDreamcallerOfferForReroll<
  T extends { readonly id: string } = DreamcallerContent,
>(
  dreamcallers: readonly T[],
  seed: string,
  rerollCount: number,
  offerSize = 3,
): T[] {
  let offer = selectDreamcallerOfferForSeed(dreamcallers, seed, offerSize);
  const normalizedCount = Math.max(0, Math.floor(rerollCount));

  for (let count = 1; count <= normalizedCount; count += 1) {
    const previousIds = new Set(offer.map((dreamcaller) => dreamcaller.id));
    const replacementPool = dreamcallers.filter(
      (dreamcaller) => !previousIds.has(dreamcaller.id),
    );
    const rerollSeed = `${seed}:debug-reroll:${String(count)}`;
    const candidate = selectDreamcallerOfferForSeed(
      dreamcallers,
      rerollSeed,
      offerSize,
    );

    if (
      replacementPool.length > 0 &&
      candidate.every((dreamcaller) => previousIds.has(dreamcaller.id))
    ) {
      const replacement = selectDreamcallerOfferForSeed(
        replacementPool,
        `${rerollSeed}:replacement`,
        1,
      )[0];
      offer = [...candidate.slice(0, -1), replacement];
    } else {
      offer = candidate;
    }
  }

  return offer;
}

/** Convert normalized Dreamcaller content into quest-state display data. */
export function toQuestDreamcaller(
  dreamcaller: DreamcallerContent,
): Dreamcaller {
  return {
    id: dreamcaller.id,
    name: dreamcaller.name,
    title: dreamcaller.title,
    renderedText: dreamcaller.renderedText,
    imageNumber: dreamcaller.imageNumber,
    ...(dreamcaller.portraitFocus === undefined
      ? {}
      : { portraitFocus: dreamcaller.portraitFocus }),
    startingEssence: dreamcaller.startingEssence,
  };
}
