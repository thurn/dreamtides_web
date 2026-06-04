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
  /**
   * The Dreamcaller's signature: a short list of distinctive card names that
   * stands in for "what this Dreamcaller wants to do", attached at load from
   * {@link DREAMCALLER_SIGNATURES}. The `idf3` pool variant treats it as a query
   * to locate the real decks that most embody the Dreamcaller and steers the
   * starter draw toward them (see `docs/cards2/idf3_signature_design.md`). Empty
   * for Dreamcallers with no signature, which then get the diversity-only draw.
   */
  signatureCards?: readonly string[];
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

/**
 * Maps each themed Dreamcaller (by name) to its signature: a short list of
 * distinctive card names capturing what the Dreamcaller is about. This is the
 * only new data the `idf3` pool variant needs — it reads no colors, tides, or
 * archetype labels, just these card names (see
 * `docs/cards2/idf3_signature_design.md`).
 *
 * Each list was derived from the Dreamcaller's {@link DREAMCALLER_THEMES} tide
 * build-arounds, scored by how often each card recurs in that Dreamcaller's own
 * real decklists weighted by its corpus IDF (distinctiveness), so the cards are
 * both characteristic of the strategy and distinctive in the corpus at large —
 * the recipe in Section 4.4 of the design. Same-theme Dreamcallers lean toward
 * the cards distinctive to their own color / sub-archetype home. The derivation
 * is reproducible via `scripts/idf3-derive-signatures.mjs`. Edit a list to
 * retune which decks a Dreamcaller's pool anchors on; a handful of genuinely
 * characteristic cards is enough, and IDF self-cleans any incidental staple.
 */
export const DREAMCALLER_SIGNATURES: Record<string, readonly string[]> = {
  // Blink / Celestial Reverie Combo
  "Yveth Coravel": [
    "Celestial Reverie",
    "Ambush Operative",
    "Featherlight Summoner",
    "Skyborne Jellyfish",
    "Mountainwatch Alpha",
  ],
  // Cost 2-or-less matters / Void Recursion
  "Kell Tarn": [
    "Starsea Traveler",
    "Revenant of the Lost",
    "Skull Weaver",
    "Ashborn Necromancer",
    "Abomination of Memory",
  ],
  // Abandon
  Caedryn: [
    "Harborwarden",
    "Fathomless Maw",
    "Kindlehorn",
    "Duskwall Delver",
    "Maelstrom Denial",
  ],
  Kragg: [
    "Harborwarden",
    "Duskwall Delver",
    "Fathomless Maw",
    "Maelstrom Denial",
    "Dreadweaver",
  ],
  // Discard / Madness
  Vrakmoth: [
    "From the Barrow",
    "Cascade of Reflections",
    "Starfall Communion",
    "Across the Void",
    "A New Adventure",
  ],
  Seraveth: [
    "Kindred Sparks",
    "Dreadweaver",
    "Silent Avenger",
    "Ashwalker",
    "Veil of the Wastes",
  ],
  Corvath: [
    "Cascade of Reflections",
    "From the Barrow",
    "Starfall Communion",
    "Pulse of Sacrifice",
    "Gleamharvester",
  ],
  // Survivors / Void Recursion
  "Kael Voss": [
    "Ashborn Necromancer",
    "Wasteland Tamer",
    "Dreadweaver",
    "Skull Weaver",
    "Kindred Sparks",
  ],
  Vaela: [
    "Skull Weaver",
    "Ashborn Necromancer",
    "Dreadweaver",
    "Kindred Sparks",
    "Harvester of Despair",
  ],
  // Tempo / Control / Outsiders
  Edran: [
    "Riftwalker",
    "Dreaming Groves",
    "Lurking Dread",
    "Standoff",
    "Keeper of the Tides",
  ],
  Zeva: [
    "Dreadwood Emissary",
    "Break the Sequence",
    "Ridgecutter",
    "Clockwork Prodigy",
    "Echoing Denial",
  ],
  // Storm / Events
  Kasane: [
    "Archive of the Forgotten",
    "Cascade of Reflections",
    "Arc Gate Opening",
    "From the Barrow",
    "Hatching Ground",
  ],
  Rael: [
    "Archive of the Forgotten",
    "Arc Gate Opening",
    "From the Barrow",
    "Cascade of Reflections",
    "Molten Duel",
  ],
  Ovanel: [
    "Archive of the Forgotten",
    "Arc Gate Opening",
    "From the Barrow",
    "Genesis Burst",
    "Broadcast Array",
  ],
  // Spirit Animals / Celestial Reverie / Creature Storm
  Grath: [
    "Mountainwatch Alpha",
    "Ethereal Trailblazer",
    "Skyborne Jellyfish",
    "Young Beastcaller",
    "Celestial Reverie",
  ],
  Radulf: [
    "Ethereal Trailblazer",
    "Celestial Reverie",
    "Mountainwatch Alpha",
    "Worldsong Behemoth",
    "Oathbound Pair",
  ],
  Demetrios: [
    "Celestial Reverie",
    "Ethereal Trailblazer",
    "Skyborne Jellyfish",
    "Mountainwatch Alpha",
    "Sunshadow Eagle",
  ],
  // Warriors
  "Gunnar Deepforge": [
    "Crucible Warlord",
    "Assault Leader",
    "Flamestride Rider",
    "Invoker of Myths",
    "Reforged Automaton",
  ],
  Tensho: [
    "Runebound Champion",
    "Echo Technician",
    "Dream Garden Visitor",
    "Aftermath Bloom",
    "Grim Reclaimer",
  ],
  Valdren: [
    "Crucible Warlord",
    "Assault Leader",
    "Wolfbond Chieftain",
    "Invoker of Myths",
    "Flamestride Rider",
  ],
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
    dc.signatureCards = DREAMCALLER_SIGNATURES[dc.name] ?? [];
  }
  return dreamcallers;
}
