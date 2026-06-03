// Type declarations for the Node color-pool generator so typed tests can import
// its building blocks. The pool algorithm lives in `src/draft_test/color-pool.ts`
// (the single source of truth); this script loads source data and formats the
// result. The runtime lives in `generate-color-pool.mjs`.

/** A card record the generator reads. */
export interface PoolCard {
  name: string;
  tides: string[];
  core: boolean;
  colors: string[];
  draftArchetypes: string[];
}

/** A v2 Dreamcaller record, with the optional seeding archetype list. */
export interface DreamcallerRecord {
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
export function loadDreamcallers(tomlPath?: string): DreamcallerRecord[];
export function findDreamcaller(
  dreamcallers: readonly DreamcallerRecord[],
  query: string,
): DreamcallerRecord | null;
export function runSeed(
  seed: number,
  poolData: PoolData,
  seedArchetypes?: readonly string[],
): SeedResult;
