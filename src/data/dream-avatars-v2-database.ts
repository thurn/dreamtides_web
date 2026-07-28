/**
 * Loads the v2 DreamAvatar identities (`dream_avatars_v2.toml`, normalized by
 * `scripts/setup-assets.mjs`) for the standalone draft test harness. Served from
 * the public directory at `/dream-avatars-v2-data.json`.
 */

import type { DreamAvatarPortraitFocus } from "../types/content";

/** A v2 DreamAvatar as consumed by the draft test harness. */
export interface DraftDreamAvatar {
  id: string;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
  /** Authored head position shared by full-body and square portrait crops. */
  portraitFocus?: DreamAvatarPortraitFocus;
  startingEssence: number;
  /**
   * Draft archetypes this avatar is suited to, sourced from
   * {@link DREAM_AVATAR_ARCHETYPES_BY_ID} and merged into the data by
   * `scripts/setup-assets.mjs`. When present, they seed draft-pool construction
   * for the non-`idf3` `?algo=` variants (see `color-pool.ts`). When absent, the
   * DreamAvatar is suitable for any pool and the draft uses the unconstrained
   * random pool.
   */
  draftArchetypes?: string[];
  /**
   * The mechanic-archetype themes (tide slugs, e.g. `abandon`, `spirit-animals`)
   * a DreamAvatar's ability is built around, attached at load from
   * {@link DREAM_AVATAR_THEMES_BY_ID}. The `decklists` pool variant uses them to bias a
   * pool toward the DreamAvatar's actual strategy. Empty for the "Neutral"
   * DreamAvatars whose abilities are not tied to a specific archetype.
   */
  themeArchetypes?: readonly string[];
  /**
   * The DreamAvatar's signature: a short list of distinctive card names that
   * stands in for "what this avatar wants to do", sourced from the
   * `signature-cards` field in `dream_avatars_v2.toml`. The `idf3` pool variant
   * (the standard algorithm) treats it as a query to locate the real decks that
   * most embody the DreamAvatar and steers the starter draw toward them (see
   * `docs/cards2/idf3_signature_design.md`). Empty for DreamAvatars with no
   * signature, which then get the diversity-only draw.
   */
  signatureCards?: readonly string[];
  /**
   * Stable cards_v2 UUIDs for {@link signatureCards}, index-aligned. Lets a
   * consumer distinguish two cards that share a display name (matching by name
   * is ambiguous; matching by id is exact).
   */
  signatureCardIds?: readonly string[];
}

/**
 * Maps each themed DreamAvatar UUID to the mechanic-archetype tide slugs
 * its ability is built around. Slugs match the keys of `PoolData.archLists`
 * (see `TIDE_TO_ARCHETYPE` in `color-pool/constants.ts`). Derived from each ability's
 * effect, not from its costs — e.g. Ossian pays an Abandon cost but its payoff
 * (draw a card) is generic, so it is Neutral and omitted here. Edit this map to
 * retune which archetype a DreamAvatar pulls its pool toward.
 */
export const DREAM_AVATAR_THEMES_BY_ID: Record<string, readonly string[]> = {
  // Blink / Celestial Reverie Combo
  "FE2510D9-BFEE-4C35-97F9-30E0CD2E2851": ["blink", "celestial-reverie-combo"],
  // Cost 2-or-less matters / Void Recursion
  "133E22DD-F81B-406D-B4E3-98C346D7FD4E": ["cheap-characters", "reclaim-combo"],
  // Abandon
  "9D64A4A2-3DC7-456E-9EB2-5FE3A48883C4": ["abandon"],
  "16B579FE-C15B-4DF6-8262-D45CE44732AE": ["abandon"],
  // Discard
  "86026206-1B11-4F38-A24E-FD3C697F5353": ["discard-madness"],
  "6488452D-4E9E-466C-96DF-716D4EC646B1": ["discard-madness"],
  "B8C1B0AB-0FE6-47D6-B576-0C2231AEB81E": ["discard-madness"],
  // Survivors / Void Recursion
  "81954CA0-DA36-49DD-915C-1CCB1B2D7B05": ["survivors", "reclaim-combo"],
  "60BD584B-5BC8-4EE7-8A98-CBB304EB71AB": ["survivors", "reclaim-combo"],
  // Tempo / Control / Outsiders
  "5E28154D-770A-4B84-8AAC-9DE44F5D7D02": ["outsiders"],
  "4D5E3933-7DD6-406B-922D-DD78ACFA044A": ["outsiders"],
  // Storm / Events
  "2B7E921D-0CD7-4C20-A415-9E7EEDE7B477": ["storm", "events"],
  "84E7020C-7384-4CC3-A20F-AB05F03CC375": ["storm", "events"],
  "F6208407-C4E9-42AC-B533-346704F5E39E": ["storm", "events"],
  // Spirit Animals / Celestial Reverie / Creature Storm
  "94E7C651-25E9-4A62-9DE4-EAF5BA20542C": ["spirit-animals", "celestial-reverie-combo"],
  "3EBABA62-9000-429D-B203-2A5A9724389A": ["spirit-animals", "celestial-reverie-combo"],
  "2C53B1B9-9291-4BBA-8D3A-F40B545C8F3C": ["spirit-animals", "celestial-reverie-combo"],
  // Warriors
  "BFC40414-5264-41BF-86E1-A0F41EE4F5B5": ["warrior-aggro", "warrior-combo"],
  "BF72ADFF-7D74-4BE8-9B93-1DB7BA13A1DB": ["warrior-aggro", "warrior-combo"],
  "91D4C3B5-FD63-480B-9ED5-979109A227BB": ["warrior-aggro", "warrior-combo"],
};

/**
 * Maps each themed DreamAvatar UUID to the draft archetypes its pool is
 * steered toward by the non-`idf3` `?algo=` variants (`default`, `diverse`,
 * `decklists`). The standard `idf3` variant reads none of this — it
 * steers from each DreamAvatar's `signature-cards` in `dream_avatars_v2.toml`
 * instead. These labels live here in TypeScript rather
 * than in `dream_avatars_v2.toml`; `scripts/setup-assets.mjs` merges them into
 * `dream-avatars-v2-data.json`, and `scripts/generate-color-pool.mjs` reads them
 * directly. Edit a list to retune which archetypes a DreamAvatar pulls toward.
 */
export const DREAM_AVATAR_ARCHETYPES_BY_ID: Record<string, readonly string[]> = {
  "133E22DD-F81B-406D-B4E3-98C346D7FD4E": ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-aristocrats", "bg-lands-midrange", "bg-lands-soup", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-monsters", "brg-lands-soup", "brg-midrange", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubr-control", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "ug-sneak", "ur-welder", "urg-lands-soup", "w-weenie", "wb-aristocrats", "wb-artifact-control", "wb-weenie", "wbg-midrange", "wbg-value-midrange", "wbrg-aristocrats", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wr-artifact-aggro", "wu-artifact-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-lands-soup", "wubg-value-midrange", "wubr-artifact-aggro", "wubrg-lands-soup", "wug-big-ramp", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  "9D64A4A2-3DC7-456E-9EB2-5FE3A48883C4": ["b-aristocrats", "bg-big-ramp", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-monsters", "brg-midrange", "ub-reanimator", "ubg-tempo", "ug-cheaty-ramp", "ug-sneak", "wb-aristocrats", "wbg-midrange", "wbg-value-midrange", "wubg-big-ramp", "wubg-control", "wubg-value", "wubrg-value"],
  "16B579FE-C15B-4DF6-8262-D45CE44732AE": ["b-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-monsters", "brg-midrange", "ug-cheaty-ramp", "ug-sneak", "wb-aristocrats", "wbg-midrange", "wbg-value-midrange", "wbr-aristocrats", "wbrg-aristocrats", "wubg-value", "wubrg-value"],
  "86026206-1B11-4F38-A24E-FD3C697F5353": ["br-aristocrats", "br-madness", "r-aggro", "r-burn", "rg-midrange", "ubr-control", "ubr-storm", "ubrg-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wubrg-value", "wur-aggro", "wurg-lands-soup"],
  "6488452D-4E9E-466C-96DF-716D4EC646B1": ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-monsters", "brg-midrange", "g-big-ramp", "rg-midrange", "ubg-tempo", "ubg-value-midrange", "ug-ramp", "ug-sneak", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wub-control", "wubg-control", "wubg-value-midrange", "wubrg-value", "wug-big-ramp"],
  "B8C1B0AB-0FE6-47D6-B576-0C2231AEB81E": ["bg-midrange", "br-aristocrats", "br-madness", "br-welder", "brg-lands-monsters", "r-aggro", "r-burn", "ub-madness", "ubr-control", "ubr-storm", "ur-spellslinger", "ur-storm", "ur-welder", "wb-weenie", "wr-aggro", "wu-artifact-control", "wub-artifact-control", "wubg-value-midrange", "wubrg-value"],
  "81954CA0-DA36-49DD-915C-1CCB1B2D7B05": ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-midrange", "ub-reanimator", "ub-tempo", "ubg-tempo", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wbrg-aristocrats", "wub-control", "wubrg-value"],
  "60BD584B-5BC8-4EE7-8A98-CBB304EB71AB": ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-reanimator", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wubg-value-midrange"],
  "5E28154D-770A-4B84-8AAC-9DE44F5D7D02": ["b-aristocrats", "b-tempo", "b-weenie", "br-aristocrats", "brg-midrange", "ub-reanimator", "ub-storm", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ug-ramp", "ug-sneak", "ur-welder", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wu-control", "wub-control", "wubg-value-midrange", "wubrg-value", "wug-value"],
  "4D5E3933-7DD6-406B-922D-DD78ACFA044A": ["br-madness", "br-storm", "u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-madness", "ub-reanimator", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-lands-soup", "urg-storm", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubg-lands-soup", "wubr-artifact-aggro", "wubrg-value", "wug-value", "wur-aggro", "wurg-artifacts"],
  "2B7E921D-0CD7-4C20-A415-9E7EEDE7B477": ["br-aristocrats", "br-storm", "brg-midrange", "u-storm", "ubr-storm", "ubrg-storm", "ur-burn", "ur-spellslinger", "ur-storm", "urg-lands-soup", "urg-storm", "wr-aggro", "wubrg-value", "wur-control"],
  "84E7020C-7384-4CC3-A20F-AB05F03CC375": ["br-aristocrats", "br-storm", "r-aggro", "r-burn", "r-welder", "ub-storm", "ubr-control", "ubr-storm", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "urg-storm", "wbr-aristocrats", "wr-aggro", "wu-control", "wubr-artifact-aggro", "wur-aggro", "wur-control"],
  "F6208407-C4E9-42AC-B533-346704F5E39E": ["u-control", "u-storm", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wub-control", "wur-control"],
  "FE2510D9-BFEE-4C35-97F9-30E0CD2E2851": ["b-tempo", "bg-big-ramp", "bg-lands-midrange", "bg-midrange", "g-big-ramp", "g-lands-soup", "ub-tempo", "ubg-ramp", "ubg-tempo", "ubg-value-midrange", "ubr-control", "ug-big-ramp", "ug-lands-midrange", "ug-ramp", "ug-sneak", "urg-lands-soup", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wg-ramp", "wr-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubg-big-ramp", "wubg-control", "wubg-lands-soup", "wubg-ramp", "wubg-value", "wubg-value-midrange", "wubrg-value", "wug-lands-soup", "wug-value", "wur-artifacts", "wurg-lands-soup"],
  "94E7C651-25E9-4A62-9DE4-EAF5BA20542C": ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubrg-lands-soup", "ug-big-ramp", "ug-lands-soup", "ug-ramp", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-big-ramp", "wubg-lands-soup", "wubg-ramp", "wubrg-value", "wug-big-ramp", "wurg-lands-soup"],
  "3EBABA62-9000-429D-B203-2A5A9724389A": ["bg-big-ramp", "bg-midrange", "brg-lands-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "rg-midrange", "ubg-value-midrange", "ubrg-storm", "ug-big-ramp", "ug-ramp", "ug-sneak", "w-weenie", "wb-weenie", "wbg-midrange", "wbg-weenie", "wbr-aristocrats", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-value-midrange", "wr-aggro", "wr-vanguard", "wr-warriors", "wu-artifact-control", "wu-midrange-weenie", "wu-weenie", "wubg-lands-soup", "wubg-value-midrange", "wubrg-value", "wug-value", "wurg-artifacts", "wurg-lands-soup"],
  "2C53B1B9-9291-4BBA-8D3A-F40B545C8F3C": ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "ubg-ramp", "ubg-value-midrange", "ug-ramp", "ug-sneak", "urg-lands-soup", "w-weenie", "wb-value", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wg-ramp", "wg-value-midrange", "wu-midrange-weenie", "wu-weenie", "wubg-value", "wubrg-value", "wug-big-ramp", "wug-value", "wurg-lands-soup"],
  "BFC40414-5264-41BF-86E1-A0F41EE4F5B5": ["br-welder", "r-aggro", "r-burn", "u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "u-control", "ub-tempo", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-academy", "ur-artifacts", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wr-vanguard", "wr-warriors", "wu-academy", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-artifact-control", "wubr-artifact-aggro", "wubrg-lands-midrange", "wubrg-value", "wug-value", "wur-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  "BF72ADFF-7D74-4BE8-9B93-1DB7BA13A1DB": ["u-artifacts", "u-welder", "ub-storm", "ubg-value-midrange", "ubr-storm", "ubr-welder", "ur-artifacts", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-aggro", "wr-aggro", "wr-artifacts", "wr-vanguard", "wr-warriors", "wu-artifact-control", "wu-artifacts", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubr-welder", "wur-aggro", "wur-artifacts", "wurg-artifacts"],
  "91D4C3B5-FD63-480B-9ED5-979109A227BB": ["u-artifacts", "u-welder", "ub-storm", "ubg-value-midrange", "ubr-storm", "ubr-welder", "ur-artifacts", "ur-storm", "ur-welder", "urg-artifact-control", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-value", "wb-weenie", "wbg-weenie", "wbr-aristocrats", "wbrg-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wr-vanguard", "wr-warriors", "wu-artifact-control", "wu-artifacts", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubg-value", "wubr-welder", "wubrg-value", "wug-value", "wur-aggro", "wur-artifacts", "wurg-artifacts"],
};

export async function loadDreamAvatarsV2(): Promise<DraftDreamAvatar[]> {
  const response = await fetch("/dream-avatars-v2-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load v2 DreamAvatar data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const dreamAvatars = (await response.json()) as DraftDreamAvatar[];
  for (const dc of dreamAvatars) {
    dc.themeArchetypes = DREAM_AVATAR_THEMES_BY_ID[dc.id] ?? [];
    dc.signatureCards = dc.signatureCards ?? [];
    dc.signatureCardIds = dc.signatureCardIds ?? [];
  }
  return dreamAvatars;
}
