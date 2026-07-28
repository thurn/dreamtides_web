import type { DreamAvatarContent } from "../types/content";
import type { DreamAvatar } from "../types/journey";

/**
 * Pick a stable random offer of DreamAvatars without replacement. Generic over
 * the DreamAvatar shape so both the journey start screen (`DreamAvatarContent`)
 * and the draft test harness (`DraftDreamAvatar`) can share the selection logic.
 */
export function selectDreamAvatarOffer<T = DreamAvatarContent>(
  dreamAvatars: readonly T[],
  offerSize = 3,
  rng: () => number = Math.random,
): T[] {
  if (dreamAvatars.length < offerSize) {
    throw new Error(
      `Expected at least ${String(offerSize)} DreamAvatars, received ${String(dreamAvatars.length)}`,
    );
  }

  const pool = [...dreamAvatars];

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

/** Deterministic `[0, 1)` stream used only for the shared journey-start offer. */
function offerRng(seed: string): () => number {
  let state = hashSeed(`${seed}:dream-avatar-offer`);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive the room's shared DreamAvatar offer from its immutable genesis seed.
 * Every client and every remount therefore presents the same choices.
 */
export function selectDreamAvatarOfferForSeed<T = DreamAvatarContent>(
  dreamAvatars: readonly T[],
  seed: string,
  offerSize = 3,
): T[] {
  return selectDreamAvatarOffer(dreamAvatars, offerSize, offerRng(seed));
}

/**
 * Derive the DreamAvatar offer for a shared debug-reroll count. Count zero is
 * the room's original offer. Later counts use distinct deterministic salts and,
 * when another DreamAvatar exists, guarantee that at least one shown id changes
 * from the preceding offer.
 */
export function selectDreamAvatarOfferForReroll<
  T extends { readonly id: string } = DreamAvatarContent,
>(
  dreamAvatars: readonly T[],
  seed: string,
  rerollCount: number,
  offerSize = 3,
): T[] {
  let offer = selectDreamAvatarOfferForSeed(dreamAvatars, seed, offerSize);
  const normalizedCount = Math.max(0, Math.floor(rerollCount));

  for (let count = 1; count <= normalizedCount; count += 1) {
    const previousIds = new Set(offer.map((dreamAvatar) => dreamAvatar.id));
    const replacementPool = dreamAvatars.filter(
      (dreamAvatar) => !previousIds.has(dreamAvatar.id),
    );
    const rerollSeed = `${seed}:debug-reroll:${String(count)}`;
    const candidate = selectDreamAvatarOfferForSeed(
      dreamAvatars,
      rerollSeed,
      offerSize,
    );

    if (
      replacementPool.length > 0 &&
      candidate.every((dreamAvatar) => previousIds.has(dreamAvatar.id))
    ) {
      const replacement = selectDreamAvatarOfferForSeed(
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

/** Convert normalized DreamAvatar content into journey-state display data. */
export function toJourneyDreamAvatar(
  dreamAvatar: DreamAvatarContent,
): DreamAvatar {
  return {
    id: dreamAvatar.id,
    name: dreamAvatar.name,
    title: dreamAvatar.title,
    renderedText: dreamAvatar.renderedText,
    imageNumber: dreamAvatar.imageNumber,
    ...(dreamAvatar.portraitFocus === undefined
      ? {}
      : { portraitFocus: dreamAvatar.portraitFocus }),
    startingEssence: dreamAvatar.startingEssence,
  };
}
