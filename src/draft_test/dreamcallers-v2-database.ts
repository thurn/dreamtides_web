/**
 * Loads the v2 Dreamcaller identities (`dreamcallers_v2.toml`, normalized by
 * `scripts/setup-assets.mjs`) for the standalone draft test harness. Served from
 * the public directory at `/dreamcallers-v2-data.json`, separate from the
 * runtime `/dreamcaller-data.json`.
 */

/** A v2 Dreamcaller as consumed by the draft test harness. */
export interface DraftDreamcaller {
  id: string;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
  startingEssence: number;
  /**
   * Draft archetypes this Dreamcaller is suited to. When present, they seed
   * draft-pool construction (see `color-pool.ts`). When absent, the Dreamcaller
   * is suitable for any pool and the draft uses the unconstrained random pool.
   */
  draftArchetypes?: string[];
}

export async function loadDreamcallersV2(): Promise<DraftDreamcaller[]> {
  const response = await fetch("/dreamcallers-v2-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load v2 Dreamcaller data: ${String(response.status)} ${response.statusText}`,
    );
  }
  return (await response.json()) as DraftDreamcaller[];
}
