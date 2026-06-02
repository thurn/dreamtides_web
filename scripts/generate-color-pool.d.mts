// Type declarations for the Node color-pool generator so typed tests can import
// its building blocks. The runtime lives in `generate-color-pool.mjs`.

/** A card record the generator reads. */
export interface PoolCard {
  name: string;
  tides: string[];
  core: boolean;
  colors: string[];
  draftArchetypes: string[];
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
export function runSeed(seed: number, poolData: PoolData): SeedResult;
