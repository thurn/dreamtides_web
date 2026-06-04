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
  /**
   * The mechanic-archetype themes (tide slugs, e.g. `abandon`, `spirit-animals`)
   * a Dreamcaller's ability is built around, attached at load from
   * {@link DREAMCALLER_THEMES}. The `decklists` pool variant uses them to bias a
   * pool toward the Dreamcaller's actual strategy. Empty for the "Neutral"
   * Dreamcallers whose abilities are not tied to a specific archetype.
   */
  themeArchetypes?: readonly string[];
}

/**
 * Maps each themed Dreamcaller (by name) to the mechanic-archetype tide slugs
 * its ability is built around. Slugs match the keys of `PoolData.archLists`
 * (see `TIDE_TO_ARCHETYPE` in `color-pool/constants.ts`). Derived from each ability's
 * effect, not from its costs — e.g. Ossian pays an Abandon cost but its payoff
 * (draw a card) is generic, so it is Neutral and omitted here. Edit this map to
 * retune which archetype a Dreamcaller pulls its pool toward.
 */
export const DREAMCALLER_THEMES: Record<string, readonly string[]> = {
  // Blink / Celestial Reverie Combo
  "Yveth Coravel": ["blink", "celestial-reverie-combo"],
  // Cost 2-or-less matters / Void Recursion
  "Kell Tarn": ["cheap-characters", "reclaim-combo"],
  // Abandon
  Caedryn: ["abandon"],
  Kragg: ["abandon"],
  // Discard
  Vrakmoth: ["discard-madness"],
  Seraveth: ["discard-madness"],
  Corvath: ["discard-madness"],
  // Survivors / Void Recursion
  "Kael Voss": ["survivors", "reclaim-combo"],
  Vaela: ["survivors", "reclaim-combo"],
  // Tempo / Control / Outsiders
  Edran: ["outsiders"],
  Zeva: ["outsiders"],
  // Storm / Events
  Kasane: ["storm", "events"],
  Rael: ["storm", "events"],
  Ovanel: ["storm", "events"],
  // Spirit Animals / Celestial Reverie / Creature Storm
  Grath: ["spirit-animals", "celestial-reverie-combo"],
  Radulf: ["spirit-animals", "celestial-reverie-combo"],
  Demetrios: ["spirit-animals", "celestial-reverie-combo"],
  // Warriors
  "Gunnar Deepforge": ["warrior-aggro", "warrior-combo"],
  Tensho: ["warrior-aggro", "warrior-combo"],
  Valdren: ["warrior-aggro", "warrior-combo"],
};

export async function loadDreamcallersV2(): Promise<DraftDreamcaller[]> {
  const response = await fetch("/dreamcallers-v2-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load v2 Dreamcaller data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const dreamcallers = (await response.json()) as DraftDreamcaller[];
  for (const dc of dreamcallers) {
    dc.themeArchetypes = DREAMCALLER_THEMES[dc.name] ?? [];
  }
  return dreamcallers;
}
