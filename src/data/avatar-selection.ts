import type { AvatarContent } from "../types/content";
import type { AvatarId } from "../types/identifiers";
import type { Avatar } from "../types/journey";
import type { JourneySeed } from "../types/journey-seed";

/**
 * Pick a stable random offer of Avatars without replacement. Generic over
 * the Avatar shape so both the journey start screen (`AvatarContent`)
 * and the draft test harness (`DraftAvatar`) can share the selection logic.
 */
export function selectAvatarOffer<T = AvatarContent>(
  avatars: readonly T[],
  offerSize = 3,
  rng: () => number = Math.random,
): T[] {
  if (avatars.length < offerSize) {
    throw new Error(
      `Expected at least ${String(offerSize)} Avatars, received ${String(avatars.length)}`,
    );
  }

  const pool = [...avatars];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, offerSize);
}

/** FNV-1a hash of a room seed into the numeric seed used by mulberry32. */
function hashSeed(seedMaterial: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seedMaterial.length; index += 1) {
    hash ^= seedMaterial.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

type AvatarOfferRngScope =
  | { readonly kind: "initial" }
  | {
      readonly kind: "debug-reroll";
      readonly count: number;
      readonly replacement: boolean;
    };

/** Deterministic `[0, 1)` stream used only for the shared journey-start offer. */
function offerRng(
  seed: JourneySeed,
  scope: AvatarOfferRngScope,
): () => number {
  const seedMaterial =
    scope.kind === "initial"
      ? `${seed}:avatar-offer`
      : `${seed}:debug-reroll:${String(scope.count)}${scope.replacement ? ":replacement" : ""}:avatar-offer`;
  let state = hashSeed(seedMaterial);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive the room's shared Avatar offer from its immutable genesis seed.
 * Every client and every remount therefore presents the same choices.
 */
export function selectAvatarOfferForSeed<T = AvatarContent>(
  avatars: readonly T[],
  seed: JourneySeed,
  offerSize = 3,
): T[] {
  return selectAvatarOffer(
    avatars,
    offerSize,
    offerRng(seed, { kind: "initial" }),
  );
}

function selectAvatarOfferForScope<T>(
  avatars: readonly T[],
  seed: JourneySeed,
  scope: AvatarOfferRngScope,
  offerSize: number,
): T[] {
  return selectAvatarOffer(avatars, offerSize, offerRng(seed, scope));
}

/**
 * Derive the Avatar offer for a shared debug-reroll count. Count zero is
 * the room's original offer. Later counts use distinct deterministic salts and,
 * when another Avatar exists, guarantee that at least one shown id changes
 * from the preceding offer.
 */
export function selectAvatarOfferForReroll<
  T extends { readonly id: AvatarId } = AvatarContent,
>(
  avatars: readonly T[],
  seed: JourneySeed,
  rerollCount: number,
  offerSize = 3,
): T[] {
  let offer = selectAvatarOfferForSeed(avatars, seed, offerSize);
  const normalizedCount = Math.max(0, Math.floor(rerollCount));

  for (let count = 1; count <= normalizedCount; count += 1) {
    const previousIds = new Set(offer.map((avatar) => avatar.id));
    const replacementPool = avatars.filter(
      (avatar) => !previousIds.has(avatar.id),
    );
    const candidate = selectAvatarOfferForScope(
      avatars,
      seed,
      { kind: "debug-reroll", count, replacement: false },
      offerSize,
    );

    if (
      replacementPool.length > 0 &&
      candidate.every((avatar) => previousIds.has(avatar.id))
    ) {
      const replacement = selectAvatarOfferForScope(
        replacementPool,
        seed,
        { kind: "debug-reroll", count, replacement: true },
        1,
      )[0];
      offer = [...candidate.slice(0, -1), replacement];
    } else {
      offer = candidate;
    }
  }

  return offer;
}

/** Convert normalized Avatar content into journey-state display data. */
export function toJourneyAvatar(
  avatar: AvatarContent,
): Avatar {
  return {
    id: avatar.id,
    name: avatar.name,
    title: avatar.title,
    renderedText: avatar.renderedText,
    imageNumber: avatar.imageNumber,
    ...(avatar.portraitFocus === undefined
      ? {}
      : { portraitFocus: avatar.portraitFocus }),
    startingEssence: avatar.startingEssence,
  };
}
