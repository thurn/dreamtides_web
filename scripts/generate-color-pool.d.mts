// Type declarations for the Node color-pool generator so typed tests can import
// its building blocks. The pool algorithm lives in `src/draft/pool/index.ts`
// (the single source of truth); this script loads source data and formats the
// result. The runtime lives in `generate-color-pool.mjs`.

// Re-use the pool generator's own variant union so this declaration cannot
// drift from the set of supported variants.
import type { PoolVariant } from "../src/draft/pool/types.ts";

export type { PoolVariant };

/** A card record the generator reads. */
export interface PoolCard {
  name: string;
  id?: string;
  tides: string[];
  core: boolean;
  colors: string[];
  draftArchetypes: string[];
}

/** A v2 DreamAvatar record, with the optional seeding archetype list. */
export interface DreamAvatarRecord {
  id: string;
  name: string;
  title: string;
  draftArchetypes?: string[];
}

/** The generator's reconstructed inputs. */
export interface PoolData {
  core: Set<string>;
  archLists: Map<string, Set<string>>;
  draftLists: Map<string, Set<string>>;
}

/** Result of running one seed against prebuilt pool data. */
export interface SeedResult {
  lines: string[];
  identity: string;
  themes: string[];
  size: number;
}

export function buildPoolData(cards: readonly PoolCard[]): PoolData;
export function loadCards(tomlPath?: string): PoolCard[];
export function loadDreamAvatars(tomlPath?: string): DreamAvatarRecord[];
export function findDreamAvatar(
  dreamAvatars: readonly DreamAvatarRecord[],
  query: string,
): DreamAvatarRecord | null;
export function runSeed(
  seed: number,
  poolData: PoolData,
  seedArchetypes?: readonly string[],
  variant?: PoolVariant,
): SeedResult;
