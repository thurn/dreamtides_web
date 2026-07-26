// Draft-pool metadata for the experimental cards_v2 pool, keyed by each card's
// stable `id` UUID from `cards_v2.toml`. Keying by UUID keeps the metadata in
// sync across display renames; the trailing `// Name` comments are maintained
// from the current card name.
//
// The `idf3` pool variant (the standard algorithm) reads none of this — it works
// from the bundled real decklists plus each DreamAvatar's signature alone. These
// fields exist only for the other `?algo=` variants (`default`, `diverse`,
// `decklists`): `core` flags an always-included staple, `tides` supply
// the mechanic-archetype themes, and `colors` / `draftArchetypes` supply the
// color-combo lists and color+archetype slices. They live here in TypeScript
// rather than in `cards_v2.toml`; `scripts/setup-assets.mjs` merges them into
// `cards_v2-data.json`, and `scripts/generate-color-pool.mjs` reads them directly.
// See `docs/cards2/draft_pool_algorithms.md`.

export interface CardV2PoolMetadata {
  tides?: readonly string[];
  core?: boolean;
  colors?: readonly string[];
  draftArchetypes?: readonly string[];
}

export const CARDS_V2_POOL_METADATA: Record<string, CardV2PoolMetadata> = {
  "7be2e6d7-abff-4c44-a0c3-35460da1693c": { // Gatebound Warden
    colors: ["w", "wu", "wb", "wr", "wub", "wur", "wug", "wbr", "wbg", "wurg", "wubrg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-weenie", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-control", "wub-artifact-control", "wub-control", "wubrg-value", "wug-value", "wur-control"],
  },
  "161482b6-af07-4d9e-822d-8c738672beb9": { // Starlight Guide
    tides: ["Blink", "Outsiders"],
    colors: ["w", "wu", "wb", "wr", "wub", "wur", "wug", "wbr", "wbg", "wurg", "wubrg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-weenie", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-control", "wub-artifact-control", "wub-control", "wubrg-value", "wug-value", "wur-control"],
  },
  "b56ef7e8-c634-4d40-ac08-fab591dfbc4a": { // Miraculous Arrival
    colors: ["u", "wu", "ub", "ur", "wur", "wug", "ubr", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-storm", "ub-tempo", "ubr-storm", "ur-spellslinger", "ur-storm", "urg-storm", "wur-control"],
  },
  "9b9c2743-75b3-499d-b5fb-c3429c92d420": { // Driftcaller Sovereign
    tides: ["Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["w", "g", "wg", "ug", "bg", "rg", "wub", "wug", "wbg", "ubg", "urg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "g-big-ramp", "g-ramp", "rg-midrange", "ubg-value-midrange", "ubrg-lands-midrange", "ug-big-ramp", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-big-ramp", "wubg-value", "wubrg-lands-midrange", "wug-lands-soup", "wug-value", "wurg-artifacts"],
  },
  "967c714f-40c5-4a77-8e22-40691a2755d4": { // Passage Through Oblivion
    tides: ["Blink", "Spirit Animals"],
    colors: ["w", "wu", "wr", "wg", "wub", "wug", "wbg", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wr-aggro", "wu-artifact-control", "wu-blink", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubg-value", "wug-value"],
  },
  "3a59cd3d-08a9-4a75-a5ab-c91b19d2d8c1": { // Graywatch
    tides: ["Survivors"],
    colors: ["b", "br", "bg", "ubg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-tempo", "ubg-value-midrange", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wubg-value-midrange"],
  },
  "25d00336-5ad7-433b-8ced-71720a9f074a": { // Wheel of the Heavens
    tides: ["Discard / Madness"],
    colors: ["w", "u", "g", "wu", "ub", "ur", "ug", "wub", "ubr", "urg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "urg-storm", "wu-academy", "wu-artifact-control", "wu-control", "wub-control", "wubg-lands-soup", "wug-value"],
  },
  "68978d92-aa8b-4873-bb0b-6e52f12b0849": { // Chronicle Reclaimer
    tides: ["Discard / Madness"],
    colors: ["u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wug", "wbr", "ubr", "wubr", "ubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "brg-midrange", "u-artifacts", "w-artifact-aggro", "w-weenie", "wb-artifact-control", "wbrg-lands-soup", "wg-ramp", "wu-artifact-control", "wub-artifact-control", "wubg-artifacts", "wubr-artifact-aggro"],
  },
  "724a1362-3f0f-4b77-b14e-22c0b877349a": { // Radiants' Captain
    tides: ["Discard / Madness"],
    colors: ["u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wug", "wbr", "ubr", "wubr", "ubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "brg-midrange", "u-artifacts", "w-artifact-aggro", "w-weenie", "wb-artifact-control", "wbrg-lands-soup", "wg-ramp", "wu-artifact-control", "wub-artifact-control", "wubg-artifacts", "wubr-artifact-aggro"],
  },
  "1ce0f0f2-4b1a-483d-b93b-74c36e946a08": { // The Deathsworn
    tides: ["Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "br", "ubr", "brg", "wubr", "wubrg"],
    draftArchetypes: ["br-welder", "u-artifacts", "ur-artifacts", "ur-welder", "urg-artifact-control", "w-academy", "w-artifact-control", "wb-artifact-control", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-artifact-control", "wur-artifacts"],
  },
  "be72bd04-21a6-4035-a117-2b7213ad1a34": { // Arc Gate Opening
    tides: ["Storm"],
    colors: ["ur", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "ubr-storm", "ubrg-storm", "ur-burn", "ur-storm", "urg-storm", "wr-aggro"],
  },
  "f8678d24-f18b-4c94-a6c2-50efb8193b7f": { // Moonlit Voyage
    core: true,
    colors: ["b", "wb", "ub", "ur", "br", "wub", "wbr", "wbg", "ubr", "ubg", "brg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "br-welder", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ur-storm", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wubrg-value"],
  },
  "3cda9dd7-cb81-43c1-9db5-1444d7363e13": { // Spirit Bond
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "br", "bg", "wbg", "ubg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "ubrg-lands-soup", "ug-big-ramp", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wg-midrange", "wug-big-ramp"],
  },
  "8a6fc6ea-9a88-441e-bdc2-d40dfec37481": { // Fading Farewell
    tides: ["Abandon", "Fading Farewell"],
    colors: ["w", "wu", "wb", "wr", "ur", "wur", "wubr", "wubrg"],
    draftArchetypes: ["w-weenie", "wbr-aristocrats", "wbrg-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-control", "wu-weenie", "wubg-lands-soup", "wubrg-value"],
  },
  "ebda8a89-9cc7-4fcd-96bd-0e022bb88a49": { // Luminwings
    tides: ["Spirit Animals"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "br", "wub", "wbr", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifact-control", "u-artifacts", "ubr-storm", "ubr-welder", "ur-burn", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-aristocrats", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-artifacts", "wubr-artifact-aggro", "wubrg-lands-soup", "wur-artifacts", "wurg-artifacts"],
  },
  "12bb1efa-463b-4ac8-b9bd-e5bd135c3eb4": { // Gearwright
    tides: ["Cindermarch / Shadow Soloist Combo", "Events", "Storm"],
    colors: ["wur", "wbr", "wubg", "wubrg"],
    draftArchetypes: ["ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wbrg-aristocrats", "wr-aggro", "wubr-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "181b4924-743b-49c3-8056-6afd08ebde1d": { // Shadow Soloist
    tides: ["Cindermarch / Shadow Soloist Combo", "Events", "Storm"],
    colors: ["wur", "wbr", "wubg", "wubrg"],
    draftArchetypes: ["ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wbrg-aristocrats", "wr-aggro", "wubr-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "34ef6c0c-1a23-4870-a52c-90d34e9769be": { // Moonlit Dancer
    tides: ["Cindermarch / Shadow Soloist Combo", "Events", "Storm"],
    colors: ["wur", "wbr", "wubg", "wubrg"],
    draftArchetypes: ["ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wbrg-aristocrats", "wr-aggro", "wubr-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "5e1b943f-9fa2-4055-b613-5dd09a048c99": { // Call to the Unknown
    tides: ["Blink", "Celestial Reverie Combo"],
    colors: ["w", "wb", "wr", "wg", "wub", "wug", "wbg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["w-weenie", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wu-control", "wub-artifact-control", "wubg-lands-soup", "wubg-ramp", "wubrg-value"],
  },
  "d26d31c0-7bd2-4d58-bed9-444e032a1087": { // Door to Possibility
    tides: ["Abandon", "Events", "Reclaim Combo"],
    colors: ["b", "ub", "br", "bg", "wub", "wbg", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-weenie", "br-aristocrats", "ub-storm", "ub-tempo", "ubr-storm", "ur-storm", "urg-lands-soup", "wb-aristocrats", "wb-weenie", "wub-control"],
  },
  "738a5af0-f848-4d48-bceb-9a43c9b11066": { // Reclaimer of Lost Paths
    tides: ["Cheap Characters", "Reclaim Combo"],
    colors: ["w", "wu", "wb", "wr", "wg", "wbr", "wbg", "wubg", "wubrg"],
    draftArchetypes: ["w-weenie", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wub-control", "wubg-value", "wubrg-value", "wug-value", "wur-artifacts"],
  },
  "6f1833a0-30f5-4718-9a3e-7620beb72bfc": { // Flagbearer of Decay
    tides: ["Discard / Madness"],
    colors: ["wu", "wr", "ub", "ur", "br", "wub", "ubr", "brg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "br-welder", "ur-spellslinger", "ur-storm", "ur-welder", "wr-aggro", "wu-artifact-control", "wub-artifact-control", "wubg-value-midrange", "wubrg-value"],
  },
  "4edf2d8d-61e4-4c3a-a388-4b52b2ebd005": { // Pathwalker
    tides: ["Abandon", "Cheap Characters", "Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Events", "Survivors"],
    colors: ["ug", "bg", "ubg", "urg", "brg", "wubg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "bg-midrange", "brg-lands-midrange", "g-lands-soup", "rg-lands-soup", "ubg-lands-soup", "ubg-ramp", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wg-lands-soup", "wg-ramp", "wubg-lands-soup", "wubrg-lands-midrange"],
  },
  "975f49d3-213a-43fc-8079-5fe40f126a7b": { // Scrap Reclaimer
    tides: ["Cheap Characters", "Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Survivors"],
    colors: ["ug", "bg", "ubg", "urg", "brg", "wubg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "bg-midrange", "brg-lands-midrange", "g-lands-soup", "rg-lands-soup", "ubg-lands-soup", "ubg-ramp", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wg-lands-soup", "wg-ramp", "wubg-lands-soup", "wubrg-lands-midrange"],
  },
  "448abb34-d77d-40ac-8292-58db03176247": { // Arc Disciple
    tides: ["Abandon", "Fading Farewell", "Reclaim Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "wg", "ub", "ur", "wub", "wug", "wbr", "wbg", "ubr", "wubr", "wubg"],
    draftArchetypes: ["br-aristocrats", "brg-midrange", "ur-welder", "wb-weenie", "wbg-weenie", "wbrg-aristocrats", "wg-value-midrange", "wr-artifact-aggro", "wu-academy", "wub-artifact-control", "wubg-control", "wubg-value-midrange", "wur-artifacts"],
  },
  "21965e95-0c8c-470c-a1e1-06d7b87a8d00": { // Echo Architect
    tides: ["Events", "Storm"],
    colors: ["r", "ur", "wbr", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "r-burn", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wr-aggro", "wubrg-value"],
  },
  "e455225f-c444-44a2-8796-805cae2b755f": { // Oracle of Shifting Skies
    tides: ["Events", "Outsiders", "Storm"],
    colors: ["wr", "ur", "br", "wur", "ubr", "urg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "r-welder", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wbr-aristocrats", "wr-aggro", "wubr-artifact-aggro", "wur-aggro"],
  },
  "29c4c45d-33df-42ac-bf28-387eb00264aa": { // Architect of Memory
    tides: ["Discard / Madness"],
    colors: ["wr", "ur", "br", "wur", "ubr", "urg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "r-welder", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wbr-aristocrats", "wr-aggro", "wubr-artifact-aggro", "wur-aggro"],
  },
  "3e6a5236-9850-4a69-9fe1-48389365a399": { // Dusk Duelist
    tides: ["Blink"],
    core: true,
    colors: ["g", "wg", "ug", "bg", "rg", "wbg", "ubg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "g-big-ramp", "rg-lands-soup", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-big-ramp", "ug-ramp", "wbg-value-midrange", "wg-midrange", "wg-ramp", "wug-lands-soup", "wug-value"],
  },
  "6044f6da-cf71-4dbb-9feb-f71ae66a4f5b": { // Molten Duel
    tides: ["Abandon", "Events", "Outsiders", "Reclaim Combo", "Spirit Animals", "Storm"],
    core: true,
    colors: ["w", "r", "wb", "wr", "ub", "ur", "br", "rg", "wur", "wbr", "ubr", "urg", "brg", "wubr", "wubg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "r-welder", "rg-midrange", "ubr-control", "ubr-storm", "ubrg-storm", "ur-academy", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wubrg-value", "wur-control"],
  },
  "4124a05c-b6dd-4334-b202-59fa17d77668": { // Unbroken
    tides: ["Discard / Madness"],
    colors: ["ur", "br", "rg", "wbr", "ubr", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "r-aggro", "r-aristocrats", "r-burn", "ubr-control", "ubr-storm", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "wr-aggro", "wubrg-value"],
  },
  "bbf316f6-1fd4-40f5-aacd-d9ed8a5c58ea": { // Bloomweaver
    tides: ["Celestial Reverie Combo", "Cheap Characters"],
    colors: ["g", "wg", "ug", "bg", "rg", "wbg", "wrg", "urg", "brg", "wubr", "wubg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-lands-monsters", "brg-lands-soup", "brg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "u-storm", "ubg-value-midrange", "ubr-storm", "ug-lands-soup", "ug-ramp", "ur-storm", "urg-lands-soup", "urg-storm", "wbrg-lands-soup", "wg-lands-soup", "wg-midrange", "wg-ramp", "wubg-lands-soup", "wubrg-lands-soup"],
  },
  "78673e2b-a6d1-43de-8850-3d3327de5cc6": { // Spirit Field Reclaimer
    colors: ["w", "wu", "wb", "wr", "wg", "wbr", "wbg", "wubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["r-welder", "ur-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-artifact-control", "wubg-value-midrange", "wurg-welder"],
  },
  "5b2b2188-b9f0-4b3b-9185-26a820d343c7": { // Pathfinder Adrift
    tides: ["Discard / Madness", "Events"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "ubr", "ubrg"],
    draftArchetypes: ["b-tempo", "u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-ramp", "ug-sneak", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "urg-sneak", "urg-storm", "wr-aggro", "wu-blink", "wu-control", "wub-control", "wubg-control", "wubg-value-midrange", "wur-control"],
  },
  "1268a899-b209-46bb-bce4-6def1dcd0404": { // Woodland Apparition
    colors: ["r", "wr", "br", "rg", "ubr", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "r-welder", "rg-midrange", "ubr-control", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "wr-aggro", "wr-artifact-aggro", "wubrg-value"],
  },
  "f4082c01-fdc8-4583-afdb-76bac980b3bf": { // Wasteland Holdout
    colors: ["w", "wu", "wb", "wr", "wbr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-value", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wbr-artifact-aggro", "wg-midrange", "wg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wub-artifact-control", "wubr-artifact-aggro", "wubrg-value", "wurg-artifacts"],
  },
  "4f0f0811-1a4c-4d42-a804-77dba8707792": { // Curio Dealer
    tides: ["Discard / Madness", "Reclaim Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "g-big-ramp", "ubg-ramp", "ubrg-lands-soup", "ug-big-ramp", "ug-ramp", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wg-value-midrange", "wub-control", "wubg-big-ramp", "wubg-control", "wubg-value", "wubg-value-midrange", "wug-value"],
  },
  "a911ef71-799c-4240-ad13-8fabd3caeafa": { // Moment Rewound
    core: true,
    colors: ["u", "g", "wu", "ub", "ur", "ug", "wub", "wug", "wbr", "ubr", "ubg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "g-big-ramp", "r-burn", "u-artifacts", "ub-tempo", "ubg-lands-soup", "ubr-control", "ubr-storm", "ug-lands-soup", "ug-ramp", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "w-weenie", "wbrg-lands-soup", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-artifacts", "wubg-big-ramp", "wubg-value", "wubrg-value", "wug-lands-soup", "wug-value", "wur-control"],
  },
  "b78d776b-15dd-4d0c-ad12-68b97b8d9fb6": { // Starsea Traveler
    tides: ["Celestial Reverie Combo", "Cheap Characters"],
    colors: ["g", "wg", "ug", "bg", "rg", "wbg", "wrg", "ubg", "urg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "bg-midrange", "brg-lands-monsters", "brg-midrange", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-ramp", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wubg-lands-soup", "wubrg-lands-soup", "wug-big-ramp", "wug-lands-soup", "wug-value"],
  },
  "47b1d6b7-0388-4bb9-abfc-ed832d902e9f": { // The Waking Titan
    tides: ["Events"],
    colors: ["r", "wu", "ur", "wbr", "ubr", "wubg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ubrg-storm", "ug-sneak", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wub-control", "wur-control"],
  },
  "8d35aec1-29ad-432c-9c23-25a52804cbae": { // Duskshore Virtuoso
    tides: ["Events"],
    colors: ["r", "wu", "ur", "wbr", "ubr", "wubg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ubrg-storm", "ug-sneak", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wub-control", "wur-control"],
  },
  "89c0d03c-2199-415a-bc66-89e451034328": { // Sylvan Matriarch
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "ubg-value-midrange", "ug-big-ramp", "ug-lands-soup", "ug-ramp", "wbg-midrange", "wbg-value-midrange", "wg-big-ramp", "wg-midrange", "wubg-big-ramp", "wubrg-value", "wug-lands-soup", "wug-value", "wurg-welder"],
  },
  "a9b5afaa-e149-4bf4-9007-077e8e9f12e6": { // Starshot Gunner
    tides: ["Abandon", "Warrior Combo"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "ur-welder", "w-academy", "wu-artifact-control", "wub-artifact-control", "wub-control", "wur-academy", "wur-artifacts", "wur-control", "wurg-artifacts"],
  },
  "8855e20c-e23f-4499-a5e8-a7a46ff81d2b": { // Desolation's Edge
    tides: ["Cheap Characters"],
    colors: ["u", "wg", "wbr", "wbg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifact-control", "ubr-control", "ubrg-storm", "ur-burn", "ur-storm", "ur-welder", "urg-lands-soup", "wbrg-aristocrats", "wr-artifacts", "wu-artifacts", "wub-artifact-control", "wubg-control", "wubrg-lands-midrange", "wur-control"],
  },
  "401bb341-8385-41e9-8f6f-7b48e9ce174d": { // Soulflame Predator
    colors: ["w", "wu", "wr", "wg", "wubg", "wubrg"],
    draftArchetypes: ["w-weenie", "wb-weenie", "wr-aggro", "wr-artifacts", "wu-blink", "wu-midrange-weenie", "wub-control", "wubg-control", "wubrg-value", "wug-value"],
  },
  "44ae8838-4714-43a5-a7bd-e9f806f35ca9": { // Nomad of Endless Paths
    tides: ["Blink", "Celestial Reverie Combo", "Outsiders"],
    core: true,
    colors: ["w", "wu", "wr", "wg", "wubg", "wubrg"],
    draftArchetypes: ["w-weenie", "wb-weenie", "wr-aggro", "wr-artifacts", "wu-blink", "wu-midrange-weenie", "wub-control", "wubg-control", "wubrg-value", "wug-value"],
  },
  "eae928f6-aab2-415e-b4b1-b9c3ed8e6818": { // Conduit of Ashes
    tides: ["Abandon", "Cheap Characters", "Cindermarch / Shadow Soloist Combo", "Fading Farewell", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "wr", "ub", "ur", "ug", "br", "wub", "wbr", "wbg", "ubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "u-artifacts", "ub-storm", "ubr-storm", "ur-academy", "ur-storm", "ur-welder", "w-artifact-control", "w-weenie", "wb-weenie", "wu-artifact-control", "wub-artifact-control", "wubrg-value", "wur-artifacts", "wurg-artifacts"],
  },
  "c8579b20-95ff-4b1d-b4c6-6bd049fc4760": { // Ghostlight Wolves
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "wrg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "ug-lands-soup", "ug-ramp", "wbrg-lands-soup", "wg-big-ramp", "wubg-big-ramp", "wubg-ramp", "wubrg-value", "wurg-lands-soup"],
  },
  "4e3c04a9-1cdd-468a-b42a-40157ed9c9d6": { // Eternal Stag
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "wrg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "ug-lands-soup", "ug-ramp", "wbrg-lands-soup", "wg-big-ramp", "wubg-big-ramp", "wubg-ramp", "wubrg-value", "wurg-lands-soup"],
  },
  "cbabe603-1333-42bd-85c0-555c664b60b3": { // Avatar of Cosmic Reckoning
    tides: ["Abandon", "Fading Farewell", "Reclaim Combo", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["b", "wb", "br", "wub", "wbr", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "br-welder", "ubg-value-midrange", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wbrg-aristocrats", "wu-artifacts", "wub-artifact-control", "wubg-artifact-control", "wubg-value-midrange"],
  },
  "5639053e-1fe3-4a42-b9c3-3fdf894bfab6": { // Ashen Remnant
    tides: ["Abandon", "Discard / Madness", "Reclaim Combo", "Spirit Animals", "Survivors"],
    colors: ["b", "g", "wb", "ug", "br", "bg", "rg", "wbr", "wbg", "wrg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-big-ramp", "bg-lands-midrange", "bg-midrange", "bg-midrange-reanimator", "brg-lands-monsters", "ub-storm", "ubg-tempo", "wb-aristocrats", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wub-control", "wubg-artifact-control", "wubg-big-ramp", "wubg-control", "wubg-value"],
  },
  "648237c5-ceff-4a28-aaf8-4aa099eae80d": { // The Dread Sovereign
    tides: ["Abandon", "Reclaim Combo", "Spirit Animals"],
    colors: ["b", "g", "wb", "ug", "br", "bg", "rg", "wbr", "wbg", "wrg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-big-ramp", "bg-lands-midrange", "bg-midrange", "bg-midrange-reanimator", "brg-lands-monsters", "ub-storm", "ubg-tempo", "wb-aristocrats", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wub-control", "wubg-artifact-control", "wubg-big-ramp", "wubg-control", "wubg-value"],
  },
  "b8a66998-f2d8-401d-8262-d5a658563936": { // Spent Courier
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["r", "wr", "ub", "ur", "br", "wbr", "ubr", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-welder", "ubr-welder", "ur-academy", "ur-burn", "ur-control", "ur-welder", "wbr-aristocrats", "wubg-artifact-control", "wubrg-value", "wur-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "28f8d95a-be99-4b4c-b9ef-92a4b40fffe7": { // Ironclad Marksman
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["u", "wu", "wr", "ub", "ur", "ug", "wur", "wbr", "ubr", "urg", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifacts", "ur-storm", "ur-welder", "urg-artifact-control", "wu-academy", "wu-artifact-control", "wu-artifacts", "wu-control", "wub-artifact-control", "wur-artifacts"],
  },
  "c61c8b29-6911-4bbf-b1c4-0c18b22ed33f": { // Last Light Herald
    tides: ["Outsiders", "Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wur", "wbr", "ubr", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "br-welder", "r-welder", "u-artifact-control", "u-artifacts", "u-welder", "ur-artifacts", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-weenie", "wubg-artifacts", "wubr-artifact-aggro", "wubr-welder", "wur-academy", "wur-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "56411ed4-bda9-4fdf-82e5-b5492de67039": { // Skyflame Commander
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wur", "wbr", "ubr", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "br-welder", "r-welder", "u-artifact-control", "u-artifacts", "u-welder", "ur-artifacts", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-weenie", "wubg-artifacts", "wubr-artifact-aggro", "wubr-welder", "wur-academy", "wur-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "713b9f42-b0a0-4c0a-bc2e-89e0ac8a2dbc": { // Verdant Wayfarer
    tides: ["Blink", "Discard / Madness", "Survivors"],
    colors: ["r", "wg", "ur", "br", "rg", "ubr", "brg", "wbrg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "ubg-tempo", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wubrg-value", "wur-aggro"],
  },
  "8adfa141-6864-4f5f-a9ca-59306eaf5432": { // Urban Cipher
    tides: ["Blink", "Discard / Madness", "Survivors"],
    colors: ["r", "wg", "ur", "br", "rg", "ubr", "brg", "wbrg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "ubg-tempo", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wubrg-value", "wur-aggro"],
  },
  "78b5a42d-b099-48f1-a1b4-5b6bc177adeb": { // Crucible Warlord
    tides: ["Warrior Aggro"],
    colors: ["w", "wu", "wb", "wr", "wub", "wug", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubg-value", "wubr-welder", "wug-value", "wur-artifacts"],
  },
  "16d2e85d-f940-43dd-9867-784b3a5ec5d7": { // Stargazer Adrift
    tides: ["Abandon", "Reclaim Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "wbr", "wbg", "brg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wubg-value", "wubrg-value"],
  },
  "d30bd488-f921-49cb-a44f-353c54cb6548": { // Starrunner
    tides: ["Abandon", "Reclaim Combo", "Spirit Animals", "Wake the Fallen / Shadow March Combo"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-big-ramp", "g-ramp", "ubg-ramp", "ubrg-storm", "ug-lands-soup", "ug-ramp", "wbg-midrange", "wg-big-ramp", "wubg-value", "wug-big-ramp", "wug-value"],
  },
  "3811a0a2-66af-4c06-b179-948dfa9b2ee3": { // Weblight Waif
    tides: ["Events"],
    colors: ["r", "wr", "ur", "ubr", "urg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wbr-artifact-aggro", "wr-aggro", "wubrg-value", "wur-aggro"],
  },
  "2a230602-a39b-4ec2-a467-97b92b389aff": { // Scuttled Fortune
    tides: ["Abandon"],
    colors: ["b", "br", "bg", "wbr", "wbg", "brg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-storm", "ubrg-lands-soup", "wb-weenie", "wbg-value-midrange", "wbrg-aristocrats", "wubg-value"],
  },
  "f7ffe999-685d-4ea2-85de-2e567eb2a042": { // Key to the Moment
    tides: ["Blink", "Celestial Reverie Combo", "Warrior Aggro"],
    colors: ["u", "wu", "ub", "ur", "ug", "wbr", "ubr", "urg", "wubg", "wubrg"],
    draftArchetypes: ["u-artifact-control", "ub-storm", "ub-tempo", "ubr-storm", "ur-storm", "wubrg-value", "wur-artifacts", "wurg-artifacts"],
  },
  "6e019832-2e0c-4166-81c3-54f7995425df": { // Momentum of the Fallen
    tides: ["Events"],
    colors: ["u", "wu", "ub", "ur", "wub", "wur", "wug", "ubr", "wubr", "wubg"],
    draftArchetypes: ["u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wu-artifact-control", "wu-blink", "wu-control", "wug-value", "wur-control"],
  },
  "86881031-393f-4359-96f5-3adde6bdd74d": { // Abomination of Memory
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["g", "ug", "bg", "rg", "wug", "wbg", "wrg", "urg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-soup", "brg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubg-ramp", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wubg-lands-soup", "wubrg-lands-soup", "wug-big-ramp", "wug-lands-soup"],
  },
  "0d867086-8413-40c3-820f-1a5de486577e": { // Fathomless Maw
    tides: ["Abandon", "Cheap Characters", "Fading Farewell", "Reclaim Combo", "Storm", "Survivors", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["r", "br", "wbr", "ubr", "brg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "brg-lands-monsters", "brg-lands-soup", "brg-midrange"],
  },
  "a6866438-3632-408d-b464-c10f8a43a5c2": { // Kindlehorn
    tides: ["Abandon", "Cheap Characters", "Reclaim Combo", "Storm", "Survivors", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["r", "br", "wbr", "ubr", "brg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "brg-lands-monsters", "brg-lands-soup", "brg-midrange"],
  },
  "2f5cc27f-db6e-4bc8-bfa2-eeacebae57f7": { // Headtaker Wurm
    tides: ["Outsiders"],
    colors: ["wu", "ub", "ur", "wub", "ubr", "ubg", "urg"],
    draftArchetypes: ["u-artifacts", "u-storm", "ub-tempo", "ubg-value-midrange", "ubrg-lands-soup", "ubrg-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-sneak", "wu-blink", "wu-control", "wub-control", "wubg-lands-soup", "wug-value", "wur-control"],
  },
  "ffec9fdd-d948-4756-b7df-39b9e982613e": { // Skull Weaver
    tides: ["Abandon", "Fading Farewell", "Reclaim Combo", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["b", "wb", "br", "bg", "wbr", "brg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "wb-weenie", "wubg-control", "wubg-value-midrange"],
  },
  "3725379c-676d-4efd-81ee-7e45d80db6d0": { // Fragments of Vision
    tides: ["Events"],
    core: true,
    colors: ["wu", "ub", "ur", "ug", "wub", "ubr", "ubg", "urg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-storm", "wug-lands-soup", "wug-value"],
  },
  "2931e20b-1a80-4ddd-8944-20e68d182886": { // Sunken Radiance
    tides: ["Discard / Madness", "Events", "Survivors"],
    colors: ["r", "wr", "ur", "br", "rg", "wub", "wrg", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-spellslinger", "ur-storm", "wr-artifacts", "wur-control"],
  },
  "5a747998-7219-4e23-be42-b8cb3be12348": { // Salvage Engine
    tides: ["Discard / Madness"],
    colors: ["ub", "br", "wub", "ubg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "ub-tempo", "ubg-tempo", "ubrg-lands-soup", "wb-weenie"],
  },
  "c7c95f67-a838-4e39-879c-cfbf0591540c": { // Cosmonaut of Tides
    tides: ["Events", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["wu", "ub", "ur", "ug", "wub", "ubr", "wubg", "wurg"],
    draftArchetypes: ["u-big-mana-artifacts", "u-storm", "ubr-storm", "ug-ramp", "ur-academy", "ur-burn", "ur-spellslinger", "ur-storm", "wr-artifact-aggro", "wu-control", "wubg-value-midrange", "wur-control"],
  },
  "cebcd591-dbd6-40b1-813d-f7f01e1b7fdb": { // Thronebound Arbiter
    tides: ["Blink", "Outsiders"],
    colors: ["ub", "wub", "ubr", "brg", "wubrg"],
    draftArchetypes: ["brg-midrange", "ub-storm", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "wub-control", "wur-control"],
  },
  "97bc4b48-9ea1-40e9-94bb-a88ae4f55d83": { // Epiphany Unfolded
    tides: ["Events", "Storm"],
    core: true,
    colors: ["w", "u", "g", "wu", "ub", "ur", "ug", "wub", "wug", "ubr", "ubg", "urg", "brg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["brg-lands-soup", "g-big-ramp", "g-ramp", "u-big-mana-artifacts", "u-welder", "ub-reanimator", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ug-ramp", "ug-sneak", "ur-artifacts", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "urg-artifact-control", "w-weenie", "wb-weenie", "wu-artifact-control", "wu-artifacts", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wubg-lands-soup", "wubrg-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "027ae231-6569-49bb-866f-7c36ec794a11": { // Scorched Reckoning
    tides: ["Events"],
    core: true,
    colors: ["r", "wr", "ur", "br", "rg", "wur", "ubr", "urg", "brg", "wubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-aristocrats", "r-burn", "rg-midrange", "ubr-control", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wr-aggro", "wur-academy"],
  },
  "7ffb1179-6c94-4f80-9613-ece2b799f19d": { // Saltless Mariner
    tides: ["Abandon", "Reclaim Combo", "Survivors", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["b", "wr", "ur", "br", "wub", "wbr", "wbg", "brg", "wubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "r-aggro", "r-burn", "ubr-welder", "ur-burn", "ur-storm", "wbr-aristocrats", "wbr-artifact-aggro", "wbrg-aristocrats", "wr-aggro", "wu-artifacts"],
  },
  "f3f97e2c-3bb6-4a20-9880-f59c50e5af93": { // Obliterator of Worlds
    tides: ["Abandon", "Reclaim Combo", "Survivors", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["b", "wr", "ur", "br", "wub", "wbr", "wbg", "brg", "wubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "r-aggro", "r-burn", "ubr-welder", "ur-burn", "ur-storm", "wbr-aristocrats", "wbr-artifact-aggro", "wbrg-aristocrats", "wr-aggro", "wu-artifacts"],
  },
  "9629a58a-9f30-40f0-9199-835ea2dddc76": { // Vault Infiltrator
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "wu", "wr", "wub", "wbr", "wubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wubr-artifact-aggro", "wubr-welder", "wur-artifacts", "wurg-artifacts"],
  },
  "b977afaf-f583-45ec-8e34-99fbfa4e9190": { // Grim Reclaimer
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Warrior Combo"],
    colors: ["u", "r", "wu", "wr", "ub", "ur", "ug", "wub", "wubrg"],
    draftArchetypes: ["r-welder", "u-artifacts", "u-welder", "ur-storm", "ur-welder", "w-artifact-control", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wubg-artifact-control", "wubg-control", "wur-academy", "wur-artifact-aggro", "wur-artifacts", "wurg-welder"],
  },
  "90a6a7a0-b739-475e-8379-647741aab423": { // Voidsire
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["u", "r", "wu", "wr", "ub", "ur", "ug", "wub", "wubrg"],
    draftArchetypes: ["r-welder", "u-artifacts", "u-welder", "ur-storm", "ur-welder", "w-artifact-control", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wubg-artifact-control", "wubg-control", "wur-academy", "wur-artifact-aggro", "wur-artifacts", "wurg-welder"],
  },
  "7530e916-e4b9-4988-b3ac-0e400c7a04ff": { // Pilgrim of Old Stones
    tides: ["Blink", "Outsiders"],
    core: true,
    colors: ["wu", "ub", "ur", "ug", "wug", "ubr", "wubg", "ubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-tempo", "ubrg-lands-soup", "ug-ramp", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "wu-academy", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wug-value", "wur-control"],
  },
  "874d5e8f-4e12-4426-a2e7-1ab761d2ca12": { // Echoes of the Journey
    tides: ["Events", "Storm"],
    colors: ["u", "ur", "ug", "wub", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["ub-storm", "ubr-storm", "ur-storm", "ur-welder", "urg-storm", "wu-artifact-control"],
  },
  "fa7dadd8-c72f-42e7-b203-3d22aa36122f": { // Torn Circuit Feeder
    tides: ["Reclaim Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["g", "wb", "wg", "ug", "wug", "wbg", "wrg", "ubg", "brg", "wubg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-midrange", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wbrg-lands-soup", "wg-midrange", "wg-value-midrange", "wr-aggro", "wubg-big-ramp", "wubg-lands-soup", "wubrg-lands-soup", "wubrg-value", "wug-big-ramp"],
  },
  "de946f5a-1e27-4d40-ae44-9ef8cc041949": { // Mother of Flames
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["brg-lands-midrange", "brg-lands-soup", "g-big-ramp", "rg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ug-ramp", "urg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-ramp", "wug-value", "wur-control"],
  },
  "bf323913-3695-49ee-8d13-8165657e3dc9": { // Dreadwood Emissary
    tides: ["Events", "Outsiders", "Storm"],
    colors: ["wu", "ub", "ur", "ug", "wub", "ubr", "ubg", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wu-blink", "wu-control", "wub-control", "wubrg-value", "wug-value", "wur-aggro"],
  },
  "650b2ed4-f016-46c0-815a-f53fffe08a9a": { // Part the Veil
    tides: ["Discard / Madness", "Survivors"],
    colors: ["ur", "br", "ubr", "brg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aristocrats", "r-burn", "ubr-control", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm"],
  },
  "770b21e4-ea6a-4910-8fca-2ec5b8813da1": { // Grotto Seer
    tides: ["Discard / Madness", "Survivors"],
    colors: ["ur", "br", "ubr", "brg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aristocrats", "r-burn", "ubr-control", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm"],
  },
  "e656cfd3-7481-46e5-934d-4dd242b00031": { // Ordained Collapse
    tides: ["Cheap Characters", "Warrior Combo"],
    colors: ["br", "wbr", "ubr", "urg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "g-big-ramp", "rg-lands-soup", "ubrg-lands-soup", "ug-lands-midrange", "ur-spellslinger", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wg-ramp", "wubg-artifact-control", "wubg-control", "wug-lands-soup", "wur-control"],
  },
  "a8bca1eb-abc8-42e0-b770-0f03af250b81": { // Annular Recall
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "ubr", "urg", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-storm", "ub-tempo", "ubr-storm", "ug-ramp", "ug-sneak", "ur-burn", "ur-storm", "urg-sneak", "wug-value", "wur-control"],
  },
  "5f4bc2cf-4464-409f-acd5-fe4d6df28a05": { // Seeker for the Way
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "wbr", "ubg", "brg", "wubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-aggro", "r-burn", "r-welder", "ur-welder", "wbr-artifact-aggro", "wr-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wurg-welder"],
  },
  "120ea441-f6ff-434b-973c-bde459f65368": { // Inverted Reflection
    tides: ["Events"],
    colors: ["u", "ub", "ur", "ug", "bg", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-artifact-control", "u-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wu-artifact-control", "wub-artifact-control", "wur-artifacts"],
  },
  "8896c178-757e-4775-b117-a4357ebfe30f": { // Minstrel of Falling Light
    tides: ["Discard / Madness", "Events"],
    colors: ["ur", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wubrg-value", "wurg-welder"],
  },
  "c86c1364-6ac4-4c90-8053-4e49441a2c83": { // Key Sifter
    tides: ["Discard / Madness"],
    colors: ["ur", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wubrg-value", "wurg-welder"],
  },
  "e3431bd0-5a81-497f-9ec9-18275b568c00": { // Return to Nowhere
    core: true,
    colors: ["wr", "ur", "wur", "ubr", "wbrg", "wubrg"],
    draftArchetypes: ["br-storm", "r-burn", "ub-storm", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ubrg-storm", "ug-lands-midrange", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "urg-sneak", "wubg-lands-soup", "wubrg-lands-soup", "wur-academy", "wur-artifacts", "wur-control"],
  },
  "6e2188f8-580e-4a66-a3e3-267d509de903": { // Terminus
    tides: ["Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals", "Storm", "Warrior Combo"],
    colors: ["wu", "ub", "ur", "ug", "wub", "wur", "ubr", "wubg", "ubrg"],
    draftArchetypes: ["rg-lands-soup", "ub-storm", "ub-tempo", "ubg-tempo", "ubr-storm", "ur-storm", "wubg-ramp", "wur-control"],
  },
  "401fdd0a-356b-49c1-806d-d50617b084d2": { // Enginespeaker
    tides: ["Outsiders", "Reclaim Combo", "Wake the Fallen / Shadow March Combo", "Warrior Aggro"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "br-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wu-artifact-control", "wub-control", "wubg-value-midrange"],
  },
  "cea847ef-2d1f-45d2-a0e0-fe9ce3fec55c": { // Starchaser
    tides: ["Spirit Animals"],
    colors: ["w", "g", "wu", "wg", "ug", "bg", "wug", "wbg", "wrg", "urg", "brg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubrg-lands-soup", "ug-ramp", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wg-ramp", "wg-value-midrange", "wubg-big-ramp", "wubg-value", "wug-lands-soup", "wug-value", "wurg-artifacts"],
  },
  "5ce69085-aa75-4654-8abe-f9e773931e63": { // Sunset Chapel Rest
    core: true,
    colors: ["u", "wu", "ur", "ug", "wur", "ubr"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-control", "u-storm", "ub-tempo", "ubr-storm", "ug-lands-midrange", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wu-academy", "wu-blink", "wub-control", "wubrg-lands-soup", "wur-artifacts"],
  },
  "5a27e236-86d7-442f-81d2-fb29a2b7f12a": { // Shadowbinder
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo"],
    colors: ["r", "ur", "br", "wbr", "ubr", "brg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "ur-burn", "ur-storm", "wr-aggro", "wr-artifact-aggro", "wur-artifacts"],
  },
  "3a4ee059-4b6a-4a85-b3b8-a472834ea843": { // Keeper of the Lightpath
    tides: ["Events"],
    colors: ["r", "ur", "br", "wbr", "ubr", "brg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "ur-burn", "ur-storm", "wr-aggro", "wr-artifact-aggro", "wur-artifacts"],
  },
  "8436eaae-e410-4bfb-89d2-55bebf5a8144": { // Pyrewatcher
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "ur", "rg", "wub", "wur", "wbg", "ubr", "wubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["br-storm", "br-welder", "ubr-storm", "ubrg-storm", "ur-storm", "ur-welder", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wur-artifacts", "wurg-artifacts"],
  },
  "09332e5b-3b4e-458f-9df0-3fc0419f65c3": { // Unleash Ruin
    tides: ["Events", "Survivors"],
    core: true,
    colors: ["bg", "wbg", "ubg", "brg", "wubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-lands-monsters", "g-big-ramp", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-soup", "wb-weenie", "wbg-value-midrange", "wbrg-aristocrats", "wubg-lands-soup", "wug-value"],
  },
  "f82c7407-b642-4ab1-8878-171f9121b3eb": { // Blightmaw
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["u", "wu", "wr", "ub", "ur", "wub", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "ubr-storm", "ur-storm", "ur-welder", "urg-storm", "wg-value-midrange", "wr-artifacts", "wu-artifact-control", "wub-control"],
  },
  "7992dbb5-ca45-4066-aca3-ff1d6d87619e": { // Moonbound Wolf
    tides: ["Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wubr", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-midrange", "g-big-ramp", "rg-midrange", "ub-storm", "ubg-ramp", "ug-big-ramp", "ug-ramp", "ug-sneak", "wbg-value-midrange", "wg-big-ramp", "wubg-big-ramp", "wubrg-value", "wug-big-ramp", "wug-lands-soup", "wug-value"],
  },
  "95711262-8510-475c-a572-c1cd144d54cb": { // Somber Flockmaster
    tides: ["Events"],
    colors: ["r", "wr", "ur", "br", "rg", "ubr", "urg", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "r-aggro", "r-burn", "rg-midrange", "ubr-control", "ubr-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "wr-aggro", "wr-artifact-aggro", "wur-artifacts"],
  },
  "8c117d3f-09af-4312-9897-694a76bd23c6": { // Worldbreacher
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wbr", "wubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifact-control", "u-artifacts", "u-welder", "ub-tempo", "ur-artifacts", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wu-academy", "wu-artifact-control", "wub-artifact-control", "wubr-welder", "wur-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "243a15d3-a4eb-415c-b106-86d4a2b7ec6a": { // Sundown Ronin
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "wr", "ub", "ur", "wub", "wur", "wbr", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-welder", "ub-tempo", "ur-academy", "ur-artifacts", "ur-welder", "w-artifact-control", "w-weenie", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubr-artifact-aggro", "wubr-welder", "wur-academy", "wur-artifacts"],
  },
  "28c3ef90-c0dc-4b85-92c8-40758b99e0ce": { // Petal-Seer
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "urg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wg-midrange", "wubg-big-ramp", "wubg-lands-soup", "wubg-value", "wubrg-lands-soup", "wug-value"],
  },
  "01298848-1ebb-48a1-b00b-d7e0af890870": { // Ashfront Lieutenant
    colors: ["ur", "bg", "wbg", "ubg", "brg", "wubg", "ubrg"],
    draftArchetypes: ["bg-midrange", "bg-midrange-reanimator", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wr-artifacts", "wubg-artifact-control", "wubrg-value"],
  },
  "f3985df4-0867-4fd6-8312-6b358dc26883": { // Marrow Drinker
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["ur", "bg", "wbg", "ubg", "brg", "wubg", "ubrg"],
    draftArchetypes: ["bg-midrange", "bg-midrange-reanimator", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wr-artifacts", "wubg-artifact-control", "wubrg-value"],
  },
  "61060827-8bed-4b63-b63d-6c3b0536e941": { // Sunshadow Eagle
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "ubg-ramp", "ug-ramp", "ug-sneak", "wg-big-ramp", "wg-midrange", "wubg-ramp", "wubrg-lands-midrange", "wug-big-ramp"],
  },
  "ca0e9275-7fbe-47ce-b776-da5b2607145e": { // Vertiginous Leap
    tides: ["Events", "Storm", "Survivors"],
    core: true,
    colors: ["b", "wb", "ub", "ur", "br", "bg", "wub", "wbr", "wbg", "ubr", "ubg", "brg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-monsters", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wub-control"],
  },
  "d95533f4-7809-44a8-a882-7675c61cee1c": { // Tethered Hollow
    tides: ["Warrior Aggro", "Warrior Combo"],
    draftArchetypes: ["wr-warriors"],
  },
  "2690912e-0295-4d12-a603-5946d37902d3": { // Call of the Lost
    tides: ["Abandon", "Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Storm"],
    colors: ["r", "ur", "br", "wur", "ubr", "urg", "brg", "wbrg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "ub-storm", "ubr-control", "ubr-storm", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-lands-soup", "urg-storm"],
  },
  "6a3bb4ae-a537-4b79-8bdd-5093f05ec07a": { // Spirit Reaping
    tides: ["Abandon", "Fading Farewell", "Storm", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "wub", "wbr", "ubr", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "u-artifacts", "ubr-storm", "ur-academy", "ur-storm", "ur-welder", "w-artifact-control", "wbr-aristocrats", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wubg-control", "wubg-value-midrange", "wur-artifacts"],
  },
  "0fde04ac-8552-45ce-83a3-5ab2384b36da": { // Toll of Passage
    tides: ["Events", "Outsiders"],
    colors: ["u", "wu", "ub", "ur", "wub", "wur", "wug", "wbg", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-big-mana-artifacts", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ubr-control", "ubrg-storm", "ug-ramp", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-sneak", "urg-storm", "wu-artifact-control", "wu-blink", "wu-control", "wub-control", "wubrg-value", "wug-value", "wur-control"],
  },
  "8b5eb29c-146f-46fb-9407-55004128fba7": { // Keeper of Forgotten Light
    tides: ["Celestial Reverie Combo", "Cheap Characters", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["g", "wrg", "urg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["brg-lands-midrange", "r-aristocrats", "rg-lands-soup", "rg-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ur-burn", "ur-spellslinger", "urg-lands-soup", "wbrg-lands-soup", "wubg-lands-soup", "wubrg-lands-soup", "wur-control", "wurg-lands-soup"],
  },
  "ea118471-164b-4d7f-bb02-044c862ed07e": { // Wreckland Maverick
    tides: ["Outsiders"],
    colors: ["wb", "wub", "wbg", "wubrg"],
    draftArchetypes: ["ubr-storm", "wb-aristocrats", "wb-artifact-control", "wb-weenie", "wbg-weenie", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-lands-soup", "wubg-ramp", "wubrg-value"],
  },
  "c750af2e-8185-4af0-bb38-4a41430c71b3": { // Fangbound
    tides: ["Spirit Animals"],
    colors: ["w", "wu", "wr", "wg", "ub", "ur", "ug", "br", "rg", "wub", "wbg", "ubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-aristocrats", "ub-storm", "ubr-storm", "ug-cheaty-ramp", "ur-spellslinger", "ur-storm", "ur-welder", "w-weenie", "wb-weenie", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-midrange-weenie", "wub-artifact-control", "wur-artifacts"],
  },
  "1cfc72e9-b75c-4d55-8bcf-54bb301d7e40": { // Ashwalker
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["b", "bg", "wub", "ubg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ubg-lands-soup", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wub-control", "wubg-value-midrange"],
  },
  "bbf83d18-81b6-48c8-886f-4b9f0feb599f": { // Frost Visionary
    tides: ["Blink", "Warrior Aggro"],
    core: true,
    colors: ["w", "wu", "wb", "wr", "wg", "wug", "wbg", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["w-weenie", "wb-weenie", "wr-aggro", "wu-blink", "wu-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wubrg-value", "wug-value"],
  },
  "50fe6c54-4bf2-4177-a2f7-4c00a4a4c188": { // Aurora Confluence
    tides: ["Discard / Madness"],
    colors: ["wr", "ur", "br", "ubr", "urg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "r-burn", "ubr-control", "ubr-storm", "ur-spellslinger", "ur-storm", "wr-artifact-aggro", "wur-aggro"],
  },
  "a42fbd1b-7629-48c9-90da-e9a4246867d7": { // Dawnblade Wanderer
    tides: ["Celestial Reverie Combo", "Wake the Fallen / Shadow March Combo", "Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ur", "ug", "br", "wub", "wbr", "wbg", "wubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "g-big-ramp", "r-welder", "ub-tempo", "ubr-storm", "ur-academy", "ur-storm", "w-artifact-control", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wur-artifact-aggro"],
  },
  "4d4618bd-4779-4953-b446-dab05e1da5db": { // Nebula's Wake
    tides: ["Storm"],
    colors: ["ur", "wub", "ubr", "wubg", "ubrg"],
    draftArchetypes: ["b-tempo", "br-aristocrats", "br-storm", "ub-tempo", "ubr-storm", "ur-storm", "wubrg-value"],
  },
  "954e8d50-d494-4fb2-b4c7-74979083b774": { // Driftrider
    tides: ["Outsiders"],
    colors: ["wr", "ub", "wub", "ubr", "wubr", "wubg"],
    draftArchetypes: ["b-tempo", "ub-tempo", "ubg-tempo", "ubr-control", "wub-control"],
  },
  "006e2f95-59a2-4cda-a777-e64f4aa31060": { // Unleashed Destruction
    tides: ["Events"],
    colors: ["r", "wr", "ur", "br", "wub", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "br-welder", "brg-midrange", "r-aggro", "r-burn", "rg-midrange", "ubr-storm", "ubrg-lands-soup", "ur-burn", "ur-spellslinger", "urg-lands-soup", "wr-aggro", "wr-artifact-aggro", "wur-artifacts"],
  },
  "64ce3ebc-c0ac-4dd3-95ca-eeb67530187c": { // Ossuary Overlord
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wr", "ub", "wbr", "ubr", "wubg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "u-artifacts", "ubr-welder", "ur-welder", "wb-artifact-control", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wubg-value-midrange", "wur-artifacts"],
  },
  "ac2b2fc5-90d3-47e0-8332-25f7ba767035": { // Forsaken Pact
    tides: ["Abandon", "Cheap Characters", "Discard / Madness", "Wake the Fallen / Shadow March Combo"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "ubg", "urg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-value-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "urg-lands-soup", "wbrg-lands-soup", "wubg-big-ramp", "wubg-lands-soup", "wubrg-lands-soup", "wug-lands-soup", "wurg-lands-soup"],
  },
  "1c8e6736-13d6-42d1-8668-46f422fec11e": { // Burst of Obliteration
    tides: ["Cheap Characters", "Storm", "Warrior Combo"],
    colors: ["r", "ur", "br", "bg", "rg", "wur", "ubr", "urg", "brg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "brg-midrange", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wbr-artifact-aggro", "wr-artifact-aggro", "wubrg-value", "wur-aggro", "wurg-lands-soup"],
  },
  "ce84b8af-b802-42d3-8a31-36827cff17b2": { // Ripple of Defiance
    tides: ["Outsiders"],
    colors: ["wu", "ub", "ur", "ug", "wub", "wug", "ubr"],
    draftArchetypes: ["u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-sneak", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wug-value", "wur-control"],
  },
  "e3193b23-2002-40a9-91fc-e0713200355e": { // Rebirth Ritualist
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "ub", "ur", "wub", "wug", "wbr", "ubr", "wubg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-aggro", "u-artifacts", "ubr-control", "ubr-storm", "ug-ramp", "ur-storm", "ur-welder", "w-academy", "w-weenie", "wg-value-midrange", "wu-artifact-control", "wub-artifact-control", "wub-control", "wub-weenie", "wubrg-value", "wur-artifacts", "wurg-artifacts"],
  },
  "16f4962d-2950-4360-8f55-bc47428480ef": { // Sorrow Watcher
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "ubg", "brg", "wbrg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-reanimator", "ubg-tempo", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wbrg-aristocrats", "wub-control", "wubrg-value"],
  },
  "34ea77a8-66e4-49b8-a934-a9d95cb74376": { // Tidewreck Navigator
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "ubg", "brg", "wbrg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-reanimator", "ubg-tempo", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wbrg-aristocrats", "wub-control", "wubrg-value"],
  },
  "8fed2e20-09c6-43e0-b6e0-5a4a417529a1": { // Sandglider
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "wr", "ub", "ur", "ug", "br", "wub", "wur", "wug", "wbr", "ubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifact-control", "u-artifacts", "ur-spellslinger", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wbr-artifact-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wur-academy", "wur-artifacts"],
  },
  "8a971ba7-9dfb-45be-bfbb-bf5e4f11974a": { // Together Against the Tide
    tides: ["Abandon"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "wbg", "ubr", "brg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "bg-midrange", "br-aristocrats", "r-aristocrats", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wu-artifact-control", "wub-control", "wubr-welder", "wubrg-lands-soup"],
  },
  "8571d7b3-5401-4678-9e81-e14538c8c46e": { // Fargazer
    colors: ["r", "wr", "br", "wbr", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "r-welder", "ur-burn", "ur-welder", "wr-aggro", "wr-artifact-aggro", "wurg-welder"],
  },
  "2c9711c7-800c-4e55-a488-17ea5a6813c6": { // Angel of the Eclipse
    tides: ["Celestial Reverie Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["r", "wr", "br", "wbr", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "r-welder", "ur-burn", "ur-welder", "wr-aggro", "wr-artifact-aggro", "wurg-welder"],
  },
  "98f16d26-be71-49ad-9034-5fafb5d3f053": { // Frostbound Defiant
    colors: ["g", "ug", "bg", "rg", "wbg", "ubg", "urg", "brg", "wubr", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-midrange", "g-big-ramp", "g-ramp", "rg-lands-soup", "ubg-ramp", "ubrg-lands-midrange", "ubrg-lands-soup", "ubrg-storm", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wbrg-lands-soup", "wg-lands-soup", "wg-midrange", "wubg-ramp"],
  },
  "b8ecc46d-bd92-4826-a416-7ce177e69cbf": { // Emberwolf Triad
    tides: ["Spirit Animals"],
    colors: ["g", "ug", "bg", "rg", "wbg", "ubg", "urg", "brg", "wubr", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-midrange", "g-big-ramp", "g-ramp", "rg-lands-soup", "ubg-ramp", "ubrg-lands-midrange", "ubrg-lands-soup", "ubrg-storm", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wbrg-lands-soup", "wg-lands-soup", "wg-midrange", "wubg-ramp"],
  },
  "465d3463-1d8a-466d-b91f-b1993332b4d3": { // Blight Weaver
    colors: ["w", "u", "g", "wu", "wb", "wr", "ub", "ur", "ug", "br", "wub", "wur", "wug", "ubr", "brg", "wubg"],
    draftArchetypes: ["brg-lands-midrange", "g-big-ramp", "rg-lands-soup", "u-artifacts", "ub-tempo", "ubr-storm", "ur-storm", "urg-artifact-control", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wbr-artifact-aggro", "wr-aggro", "wr-artifacts", "wu-artifact-control", "wu-control", "wub-artifact-control", "wub-weenie", "wubrg-value", "wur-artifacts"],
  },
  "19aeffa6-fd1b-4b8f-bb0c-c35659521976": { // Nocturne
    tides: ["Reclaim Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["w", "g", "wu", "wb", "wg", "wbg", "brg", "wubg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "ubg-ramp", "ubrg-lands-soup", "w-weenie", "wb-aristocrats", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wu-weenie", "wub-control", "wubg-value", "wug-value"],
  },
  "be7cf049-29df-4801-9ca6-0e39dc1101af": { // Shattering Gambit
    tides: ["Storm"],
    colors: ["w", "wu", "wb", "wr", "wub", "wur", "wug", "wbr", "wbg", "wubg", "wubrg"],
    draftArchetypes: ["r-aggro", "ur-control", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-value", "wb-weenie", "wbg-midrange", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-value-midrange", "wubr-welder", "wug-value", "wur-artifacts", "wur-control", "wurg-lands-soup"],
  },
  "8c9ef6a8-d93e-4149-a965-0bdbe2acf6bd": { // Charnel Seraph
    tides: ["Warrior Aggro"],
    colors: ["w", "wu", "wb", "wr", "ub", "ur", "br", "rg", "wbr", "wbg", "wubg", "wubrg"],
    draftArchetypes: ["b-tempo", "br-aristocrats", "r-burn", "w-artifact-aggro", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wub-artifact-control", "wur-artifacts"],
  },
  "09e17f29-8ee1-477f-8175-ff37eb1f254a": { // Seer of the Fallen
    tides: ["Abandon", "Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "bg-midrange", "br-aristocrats", "brg-lands-midrange", "wb-weenie", "wubrg-value"],
  },
  "6af8cf81-9e9e-481f-b518-f5dadad99b27": { // Winterbough Monk
    tides: ["Blink", "Celestial Reverie Combo", "Spirit Animals", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["g", "ug", "bg", "rg", "wug", "wbr", "wbg", "wrg", "ubg", "urg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "rg-midrange", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-soup", "ug-ramp", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wg-ramp", "wug-value"],
  },
  "eed92573-8052-494c-adae-9838de5375a1": { // Mountainwatch Alpha
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "ubg", "urg", "brg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-big-ramp", "wubg-lands-soup", "wubg-ramp", "wug-big-ramp"],
  },
  "32f3d6f2-43c5-4510-a23e-558769a7a8c9": { // Glimmerwood Scout
    tides: ["Blink", "Outsiders"],
    core: true,
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wur", "wug", "wbg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wbg-weenie", "wr-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wubg-control", "wug-value", "wur-artifacts"],
  },
  "a952f833-825a-435f-82b1-8d85f872d274": { // Virtuoso of Harmony
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["bg", "wbg", "ubr", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "bg-midrange", "br-aristocrats", "brg-midrange", "rg-lands-soup", "ubg-ramp", "ubg-tempo", "ubrg-lands-soup", "urg-lands-soup", "wbg-value-midrange", "wbrg-lands-soup", "wr-artifacts", "wubg-lands-soup", "wubrg-lands-midrange", "wubrg-lands-soup", "wurg-lands-soup"],
  },
  "ffa4fa56-8897-465d-b812-3798e3cf5a1f": { // Augur Crow
    colors: ["g", "wu", "wg", "ug", "ubg", "urg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["brg-lands-midrange", "g-big-ramp", "ubg-lands-soup", "ubrg-lands-soup", "ug-cheaty-ramp", "ug-lands-soup", "ug-ramp", "urg-sneak", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wubg-lands-soup", "wubg-value", "wubrg-lands-midrange", "wubrg-value", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "c430ed7b-523e-4580-9a53-d43d11265633": { // Flash of Power
    tides: ["Storm"],
    colors: ["ur", "wbr", "ubr", "urg", "wubr", "ubrg"],
    draftArchetypes: ["br-aristocrats", "ubr-storm", "ur-burn", "ur-storm", "wubg-lands-soup", "wur-aggro"],
  },
  "0458658d-7e02-4286-9249-93674d16620b": { // Nightmare Manifest
    tides: ["Abandon", "Warrior Combo"],
    draftArchetypes: ["br-sacrifice"],
  },
  "6d6ce556-60df-486f-b2d8-5df168a6f75e": { // Wreckborn
    tides: ["Abandon", "Fading Farewell"],
    colors: ["r", "wr", "br", "wbr", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-aristocrats", "r-burn", "ubrg-storm", "ur-burn", "ur-welder", "wbrg-aristocrats", "wr-aggro", "wr-artifact-aggro"],
  },
  "041fafeb-f159-4aba-90c2-3ce4b3038bdc": { // Gloomantler
    tides: ["Discard / Madness", "Wake the Fallen / Shadow March Combo"],
    draftArchetypes: ["br-madness"],
  },
  "4ee2f0a5-c35c-4b5e-a0be-de5ef3e8639e": { // Revenant of the Lost
    tides: ["Cheap Characters", "Reclaim Combo"],
    colors: ["b", "wu", "wb", "wub", "wbr", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "br-aristocrats", "ubr-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wr-artifact-aggro", "wu-artifact-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-value-midrange", "wubr-artifact-aggro"],
  },
  "13c45db4-ebab-4364-a14a-59a2e9c52bb5": { // Dreaming Groves
    tides: ["Outsiders"],
    colors: ["u", "b", "ub", "br", "bg", "wub", "wbr", "wbg", "ubr", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-midrange", "br-aristocrats", "brg-midrange", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ubrg-storm", "ur-storm", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wbrg-lands-soup", "wub-control", "wubg-artifact-control", "wubrg-value"],
  },
  "965ce3b2-a722-475c-99c5-5b35685d2404": { // Dreamvale Monarch
    tides: ["Blink", "Celestial Reverie Combo", "Spirit Animals"],
    core: true,
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "g-big-ramp", "ubg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-soup", "ug-big-ramp", "ug-lands-soup", "ug-ramp", "urg-sneak", "wbg-value-midrange", "wg-midrange", "wug-big-ramp", "wug-value"],
  },
  "3d1fadf6-42e5-4d03-9a72-9bc25968c2b9": { // Sky Voyager
    tides: ["Blink", "Outsiders", "Spirit Animals", "Survivors", "Warrior Aggro"],
    colors: ["g", "wg", "ug", "rg", "ubg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "g-big-ramp", "ubrg-lands-soup", "ug-ramp", "wbg-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wubg-big-ramp", "wubg-value-midrange"],
  },
  "40b44ed7-d737-455b-bd42-e617a263b110": { // Voidcaller
    tides: ["Blink", "Outsiders", "Spirit Animals", "Survivors", "Warrior Aggro"],
    colors: ["g", "wg", "ug", "rg", "ubg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "g-big-ramp", "ubrg-lands-soup", "ug-ramp", "wbg-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wubg-big-ramp", "wubg-value-midrange"],
  },
  "5c5e316f-c499-4991-9733-bb6e3d826d7e": { // Harvest the Forgotten
    colors: ["wu", "ub", "ur", "wub", "ubr", "urg", "wubg", "ubrg"],
    draftArchetypes: ["u-artifacts", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm"],
  },
  "bd27a996-bcdd-4f49-95c2-92c9d5875344": { // Lurking Dread
    tides: ["Events", "Outsiders"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbg", "ubr", "ubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-tempo", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wub-control", "wubrg-value"],
  },
  "455ef341-8a26-44e1-b287-19e53bdc6158": { // Soulkindler
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Spirit Animals", "Survivors"],
    colors: ["ur", "br", "rg", "wbr", "ubr", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wubg-lands-soup", "wubrg-value", "wurg-artifacts"],
  },
  "1750c85c-f547-4d21-b7e3-9e5c5fcb3171": { // Unquenched
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Spirit Animals", "Survivors"],
    colors: ["ur", "br", "rg", "wbr", "ubr", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wubg-lands-soup", "wubrg-value", "wurg-artifacts"],
  },
  "7ad10754-690c-45fa-abe6-28944da6eef6": { // Pyrestone Avatar
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Spirit Animals"],
    colors: ["ur", "br", "rg", "wbr", "ubr", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wubg-lands-soup", "wubrg-value", "wurg-artifacts"],
  },
  "e4e8d3b9-3463-4b92-8fbe-35064f72402d": { // Pinnacle Ascendant
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Spirit Animals", "Survivors"],
    colors: ["ur", "br", "rg", "wbr", "ubr", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wubg-lands-soup", "wubrg-value", "wurg-artifacts"],
  },
  "4eb42989-7498-4995-a3ab-89eb026b0c13": { // Ferryman's Tithe
    colors: ["b", "wb", "ub", "br", "bg", "wbr", "ubr", "brg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-tempo", "ubg-tempo", "ubr-control", "wb-weenie", "wbg-weenie", "wubg-value-midrange"],
  },
  "26a05558-4692-43d2-ae6c-a6eb385a6d22": { // Meadowlight Charger
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ur", "wub", "wbr", "wubrg"],
    draftArchetypes: ["r-aggro", "u-artifacts", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-weenie", "wub-artifact-control", "wubrg-value", "wur-artifacts"],
  },
  "88994286-96db-4ba6-a660-b30ae9b52cff": { // Gleamharvester
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "wub", "wur", "ubr", "brg", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-spellslinger", "ur-storm", "ur-welder", "wb-weenie", "wr-aggro"],
  },
  "d755cfa4-d7c0-46d8-a836-909c45c68890": { // Shoreline Penitent
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "wub", "wur", "ubr", "brg", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-spellslinger", "ur-storm", "ur-welder", "wb-weenie", "wr-aggro"],
  },
  "f0a70e7d-46af-4d32-92cc-9d510e97a07e": { // Fathomscourge
    tides: ["Abandon", "Warrior Aggro", "Warrior Combo"],
    colors: ["r", "ub", "br", "wbr", "ubr", "wbrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "br-welder", "r-welder", "u-welder", "ur-artifacts", "ur-burn", "ur-welder", "wb-aristocrats", "wbr-aristocrats", "wbr-artifact-aggro", "wr-artifacts", "wubr-welder", "wur-artifacts"],
  },
  "d6ec65a2-d61e-4617-bdd0-75d5573c063d": { // Smoldering Ancient
    tides: ["Abandon", "Warrior Combo"],
    colors: ["r", "ub", "br", "wbr", "ubr", "wbrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "br-welder", "r-welder", "u-welder", "ur-artifacts", "ur-burn", "ur-welder", "wb-aristocrats", "wbr-aristocrats", "wbr-artifact-aggro", "wr-artifacts", "wubr-welder", "wur-artifacts"],
  },
  "7f90d17b-9146-4550-a372-a9d77e814ce6": { // Collapse Protocol
    colors: ["wb", "ub", "br", "wub", "wbg", "ubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "br-aristocrats", "ub-tempo", "ubr-control", "wb-aristocrats", "wb-weenie"],
  },
  "23a7aca4-3c64-4963-a9a0-d3638822df48": { // The Thinning
    colors: ["wb", "ub", "br", "wub", "wbg", "ubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "br-aristocrats", "ub-tempo", "ubr-control", "wb-aristocrats", "wb-weenie"],
  },
  "acefcfcf-cba5-46ec-913e-32f1091afbda": { // Spiral Offering
    tides: ["Discard / Madness"],
    colors: ["r", "ur", "br", "rg", "ubr", "brg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wubrg-value", "wur-aggro"],
  },
  "b6d1df72-d989-4689-a599-4490a0c2568d": { // Gateweaver
    tides: ["Events", "Storm"],
    colors: ["r", "wr", "ur", "br", "wur", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ug-sneak", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wr-aggro", "wur-aggro"],
  },
  "50267984-eaa3-415e-a23f-581c54b0ad2d": { // Reunion
    tides: ["Discard / Madness", "Storm"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wug", "ubr", "ubg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "ubg-ramp", "ubr-storm", "ug-lands-soup", "ug-ramp", "ur-storm", "wu-artifact-control", "wu-control", "wubrg-value"],
  },
  "49c6e5ad-8da8-47fa-a8f3-906cbef8a3ed": { // Dread Arbiter
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "ub", "ur", "br", "wub", "wrg", "ubr", "wubr"],
    draftArchetypes: ["b-aristocrats", "bg-aristocrats", "bg-midrange", "br-aristocrats", "br-welder", "r-burn", "u-artifact-control", "u-artifacts", "ubr-control", "ubr-storm", "ubrg-storm", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wu-academy", "wu-artifact-control", "wu-weenie", "wub-artifact-control", "wubg-control", "wur-artifacts"],
  },
  "b6bad2a1-b857-4dd7-8b22-050eb68433a5": { // Ferryman of the Falls
    tides: ["Abandon", "Cheap Characters"],
    colors: ["bg", "wbg", "ubg", "urg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-lands-soup", "rg-lands-soup", "ubg-lands-soup", "ubrg-lands-soup", "ubrg-storm", "ug-lands-midrange", "ug-lands-soup", "wbrg-lands-soup", "wg-lands-soup", "wubg-lands-soup", "wubrg-lands-soup", "wubrg-value"],
  },
  "e2f542eb-090f-4a22-a42c-a120eb6caaa3": { // Dreamborne Leviathan
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wbg", "wrg", "brg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-midrange", "g-big-ramp", "ubg-value-midrange", "ug-ramp", "urg-artifact-control", "wbrg-lands-soup", "wg-ramp", "wubrg-value"],
  },
  "a75c22ac-e343-4757-964e-a0bb981b5a28": { // Spiritbound Alpha
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wbg", "wrg", "brg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-midrange", "g-big-ramp", "ubg-value-midrange", "ug-ramp", "urg-artifact-control", "wbrg-lands-soup", "wg-ramp", "wubrg-value"],
  },
  "8bf53fe6-8a25-401e-9a99-84343a026bb0": { // Burning Pursuit
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "ubr", "ubg", "brg", "wubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-reanimator", "ub-tempo", "wb-weenie", "wbg-weenie", "wbr-aristocrats", "wubrg-lands-soup"],
  },
  "20fd609a-7529-4582-a362-b8151b0ae011": { // Rite of Summoning
    tides: ["Abandon"],
    colors: ["u", "b", "wr", "ub", "ur", "br", "bg", "ubr", "ubg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "br-aristocrats", "br-welder", "u-artifacts", "ub-tempo", "ubg-ramp", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ubrg-storm", "ur-storm", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbrg-lands-soup", "wub-artifact-control", "wubrg-value"],
  },
  "a7c2ee76-48c9-4587-8f01-81d00ae280cb": { // Defiant Holdout
    tides: ["Abandon", "Survivors"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "wubg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie"],
  },
  "fcb830e5-85ff-48f3-be1e-46e102a5c8e8": { // Shatterpoint Agent
    tides: ["Discard / Madness"],
    colors: ["g", "wg", "ur", "ug", "bg", "rg", "wbr", "wbg", "brg", "wubg", "ubrg"],
    draftArchetypes: ["bg-midrange", "brg-lands-monsters", "g-big-ramp", "g-lands-soup", "rg-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbg-value-midrange", "wbrg-aristocrats", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-big-ramp", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "6da831c8-6fda-4078-9f2b-873db2416aad": { // Cloaked Sentinel
    colors: ["w", "wu", "wb", "wr", "br", "wub", "wbg", "wubg", "wbrg"],
    draftArchetypes: ["w-weenie", "wb-weenie", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-value", "wubr-artifact-aggro", "wug-value"],
  },
  "f10a9ba9-f5eb-4011-9426-a89c5de3b550": { // Veil Crosser
    tides: ["Abandon", "Survivors"],
    colors: ["bg", "wbg", "ubg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-monsters", "brg-midrange", "ubg-ramp", "ubr-control", "ubrg-lands-soup", "ug-lands-soup", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wubg-big-ramp", "wubrg-lands-soup"],
  },
  "f46490a5-7030-4ade-93e9-bedb5813f590": { // Rooftop Prophet
    tides: ["Discard / Madness", "Survivors"],
    colors: ["bg", "wbg", "ubg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-monsters", "brg-midrange", "ubg-ramp", "ubr-control", "ubrg-lands-soup", "ug-lands-soup", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wubg-big-ramp", "wubrg-lands-soup"],
  },
  "d1b7d5c6-cde9-48c6-80ba-642ddc9f35ad": { // Ripple Through Reality
    colors: ["u", "wu", "ub", "ur", "ug", "wug", "ubr", "ubg", "wubg", "ubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ug-lands-midrange", "ug-ramp", "ur-spellslinger", "urg-artifact-control", "urg-storm", "wr-aggro", "wu-blink", "wu-control", "wub-control", "wubg-artifact-control", "wubr-welder", "wubrg-value", "wug-lands-soup", "wur-aggro", "wur-control"],
  },
  "9adbe3db-d872-4b75-92b5-d7f2798c22ce": { // Titan of Forgotten Echoes
    tides: ["Reclaim Combo"],
    colors: ["wu", "wb", "wg", "wug", "wbg", "brg", "wubr", "wbrg", "wubrg"],
    draftArchetypes: ["w-weenie", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wg-big-ramp", "wg-midrange", "wg-value-midrange", "wr-artifact-aggro", "wubg-value", "wubg-value-midrange", "wur-artifacts"],
  },
  "ecf77f27-df0f-47c4-99c2-48d7fa46a137": { // Scrapyard Custodian
    tides: ["Fading Farewell", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-tempo", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wubrg-value"],
  },
  "b56b3411-50c7-4cc9-90e0-d4ffcaec73c6": { // Exiles of the Last Light
    tides: ["Survivors"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "ub-storm", "ubg-tempo", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wbrg-aristocrats", "wub-control"],
  },
  "b4df0b25-0c46-4faa-8db6-84f5f3c3444b": { // Pyre Challenger
    tides: ["Warrior Aggro"],
    colors: ["wr", "ur", "br", "rg", "wbr", "ubr", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["bg-lands-midrange", "br-aristocrats", "brg-lands-midrange", "r-aggro", "r-aristocrats", "r-burn", "ubr-storm", "ur-spellslinger", "ur-storm", "w-weenie", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control"],
  },
  "c6d8a7cc-3856-4030-96eb-450e406dec33": { // Thornwood Delver
    tides: ["Reclaim Combo"],
    colors: ["wr", "ur", "br", "rg", "wbr", "ubr", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["bg-lands-midrange", "br-aristocrats", "brg-lands-midrange", "r-aggro", "r-aristocrats", "r-burn", "ubr-storm", "ur-spellslinger", "ur-storm", "w-weenie", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control"],
  },
  "21e376da-f4c3-4a60-bd63-a272b35db5a6": { // Infernal Rest
    tides: ["Events", "Outsiders"],
    colors: ["w", "wu", "wb", "wr", "ur", "wub", "wur", "wug", "wubr", "wubg", "wurg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wbrg-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wubr-artifact-aggro", "wubrg-value"],
  },
  "4fac8060-2644-409f-806b-c6a845ef6f31": { // Dreamscatter
    colors: ["r", "ur", "wur", "wbr", "ubr", "urg", "wubr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "ubr-storm", "ubrg-storm", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm"],
  },
  "d24ea640-638d-4ce2-b15d-b3f4588bda6b": { // Echoes of Eternity
    tides: ["Events", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["r", "ur", "wur", "wbr", "ubr", "urg", "wubr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "ubr-storm", "ubrg-storm", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm"],
  },
  "2a8dff0b-759f-40cc-af40-393a4e7129d4": { // Weight of Memory
    colors: ["wr", "ur", "br", "rg", "wur", "wbr", "ubr", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "br-welder", "brg-lands-midrange", "r-aggro", "r-burn", "rg-midrange", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ur-burn", "ur-storm", "ur-welder", "urg-sneak", "wbrg-aristocrats", "wbrg-lands-soup", "wr-aggro", "wur-artifact-aggro"],
  },
  "aba40bc6-3e9e-4874-be8a-6984cbf13146": { // The Forsaker
    tides: ["Abandon", "Cheap Characters", "Reclaim Combo", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["g", "ug", "bg", "wrg", "ubr", "brg", "wubg", "wurg", "wbrg", "ubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-big-ramp", "rg-lands-soup", "ubg-ramp", "ug-lands-soup", "ug-ramp", "ur-welder", "urg-artifact-control", "urg-lands-soup", "urg-storm", "wbg-midrange", "wbrg-lands-soup", "wg-lands-soup", "wubg-lands-soup", "wug-lands-soup", "wurg-lands-soup"],
  },
  "ed02e610-2e68-4457-95a6-c7c6db60ca40": { // Ruptured Dynamo
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["g", "ug", "bg", "wrg", "ubr", "brg", "wubg", "wurg", "wbrg", "ubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-big-ramp", "rg-lands-soup", "ubg-ramp", "ug-lands-soup", "ug-ramp", "ur-welder", "urg-artifact-control", "urg-lands-soup", "urg-storm", "wbg-midrange", "wbrg-lands-soup", "wg-lands-soup", "wubg-lands-soup", "wug-lands-soup", "wurg-lands-soup"],
  },
  "7947e9db-a85e-4277-a42a-8d45f7475295": { // Liminal Striker
    tides: ["Warrior Aggro"],
    draftArchetypes: ["wr-vanguard"],
  },
  "d6e8842f-c0a4-4b4c-93bd-377cfae60894": { // Ride of the Vanguard
    tides: ["Warrior Aggro"],
    colors: ["w", "wu", "wr", "wg", "br", "wub", "wbr", "wubr", "wurg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wbg-midrange", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wubrg-value", "wur-academy", "wur-artifact-aggro", "wur-control"],
  },
  "d217303e-b115-484a-b22c-0e44d5701389": { // Broadcast Array
    tides: ["Celestial Reverie Combo", "Events", "Storm"],
    colors: ["ur", "br", "wub", "ubr", "wubg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["brg-midrange", "ub-storm", "ubr-storm", "ubrg-storm", "ur-storm"],
  },
  "cfa78375-85b7-47e9-95f5-b31e6d112c52": { // Ruin Scavenger
    tides: ["Survivors"],
    colors: ["g", "ug", "bg", "rg", "wug", "wbg", "ubg", "urg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "bg-big-ramp", "bg-lands-midrange", "bg-lands-soup", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "brg-midrange", "g-big-ramp", "g-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-soup", "ug-ramp", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbrg-aristocrats", "wbrg-lands-soup", "wg-big-ramp", "wu-control", "wubg-big-ramp", "wubg-value-midrange", "wug-lands-soup"],
  },
  "f68774ce-0e94-489f-90a5-68e03a549ff6": { // Deathwalker
    tides: ["Abandon", "Survivors"],
    colors: ["b", "wb", "br", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-reanimator", "ub-tempo", "wb-aristocrats", "wb-weenie", "wug-big-ramp"],
  },
  "58f96494-87ec-4145-9e1c-95951d0ab711": { // Sanctum Approach
    tides: ["Discard / Madness"],
    colors: ["wu", "ub", "ur", "ug", "wub", "ubr", "urg", "wubrg"],
    draftArchetypes: ["u-big-mana-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ubrg-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "wu-control", "wubr-artifact-aggro", "wug-value", "wur-artifacts", "wur-control"],
  },
  "516dbd2d-dae4-4873-937e-adfeeee4444d": { // Gateway Defender
    tides: ["Reclaim Combo"],
    colors: ["u", "r", "wu", "ub", "ur", "ug", "br", "wub", "wbr", "ubr", "wubr"],
    draftArchetypes: ["brg-midrange", "u-welder", "ub-storm", "ubr-welder", "ubrg-storm", "ug-cheaty-ramp", "ug-ramp", "wbr-artifact-aggro", "wr-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubg-artifact-control", "wubg-ramp", "wur-academy", "wur-control", "wurg-lands-soup", "wurg-welder"],
  },
  "dbd014b1-1ec8-4762-bd96-48a2a4824de2": { // Abyssal Enforcer
    tides: ["Blink"],
    core: true,
    colors: ["wu", "wub", "wur", "wug", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["ubrg-lands-soup", "ur-spellslinger", "ur-storm", "w-weenie", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wu-weenie", "wub-control", "wubg-artifact-control", "wubg-ramp", "wubg-value-midrange", "wubrg-lands-midrange", "wubrg-value", "wug-value", "wur-control"],
  },
  "caaee8a9-0c22-41b4-950f-4c1131b98221": { // Celestial Reverie
    tides: ["Celestial Reverie Combo", "Spirit Animals", "Storm"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "wurg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "g-big-ramp", "g-lands-soup", "ubg-ramp", "ubg-value-midrange", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wg-ramp", "wug-value", "wurg-lands-soup"],
  },
  "470bbf9d-a73c-4e00-bc66-cb0fa767c8de": { // Depthwalker
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["b", "g", "ug", "bg", "wbg", "ubg", "brg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "bg-midrange-reanimator", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "rg-midrange", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-midrange", "ug-lands-soup", "ug-ramp", "ug-sneak", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-value-midrange", "wubg-big-ramp", "wubrg-lands-soup"],
  },
  "d89f4c33-ffd3-4313-8106-0a9f7013cad8": { // Lanternwood Scout
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo"],
    colors: ["r", "br", "wur", "wbr", "ubr", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "ur-burn", "ur-storm", "ur-welder", "wbrg-aristocrats", "wr-artifact-aggro"],
  },
  "3995100d-cdde-4c6a-9bf9-87167c8deb57": { // Immolate and Rise
    tides: ["Survivors"],
    colors: ["b", "wb", "ub", "bg", "wub", "wbg", "ubr", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "br-aristocrats", "ub-tempo", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wubrg-value", "wur-control"],
  },
  "6475483c-07de-43a0-b419-aaae6f436ec6": { // Peak Plunder
    tides: ["Events", "Survivors"],
    colors: ["b", "wb", "ub", "bg", "wub", "wbg", "ubr", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "br-aristocrats", "ub-tempo", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wubrg-value", "wur-control"],
  },
  "7ea13d02-9d97-492e-9edb-f326eb3b4d1c": { // Seaside Requiem
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "wbr", "ubr", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "r-welder", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wubr-welder", "wubrg-value"],
  },
  "25173cac-333f-4efc-9a03-b532d5783419": { // Ridgecutter
    tides: ["Outsiders"],
    colors: ["wu", "ub", "ur", "ug", "wur", "ubr", "urg", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-storm", "ub-tempo", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-spellslinger", "ur-storm", "urg-storm", "wbg-midrange", "wu-artifacts", "wu-blink", "wug-value", "wurg-lands-soup"],
  },
  "82749215-ed35-44e3-a745-72ca76036c7c": { // Colossal Convergence
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "wub", "wur", "wbr", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-welder", "u-artifact-control", "u-artifacts", "ubr-welder", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-value-midrange", "wur-artifact-aggro", "wur-artifacts", "wurg-welder"],
  },
  "747859fb-6fca-49fc-a653-08011a9bb44c": { // Forsworn Champion
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "wub", "wur", "wbr", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-welder", "u-artifact-control", "u-artifacts", "ubr-welder", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-value-midrange", "wur-artifact-aggro", "wur-artifacts", "wurg-welder"],
  },
  "4b4cc613-2e28-4851-975f-14146286a062": { // Forge-Twin
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "ub", "ur", "wub", "wur", "wug", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["br-welder", "u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "u-control", "ub-tempo", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-control", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wug-value", "wur-artifacts", "wurg-artifacts"],
  },
  "7e4cca36-5134-415a-b30a-c4876b58976c": { // Speaker for the Forgotten
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Warrior Combo"],
    colors: ["w", "u", "wu", "ub", "ur", "wub", "wur", "wug", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["br-welder", "u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "u-control", "ub-tempo", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-control", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wug-value", "wur-artifacts", "wurg-artifacts"],
  },
  "867b98cf-171b-497b-9252-9af5dcf70726": { // Crescendo Channeler
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "ub", "ur", "wub", "wur", "wug", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["br-welder", "u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "u-control", "ub-tempo", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-control", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wug-value", "wur-artifacts", "wurg-artifacts"],
  },
  "742a376f-68db-466a-b087-405188634ba4": { // Assault Leader
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wr", "ub", "ur", "br", "wub", "wur", "wbr", "wubr"],
    draftArchetypes: ["br-aristocrats", "u-artifact-control", "u-artifacts", "u-welder", "ub-tempo", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wub-artifact-control", "wur-artifacts", "wurg-artifacts"],
  },
  "6196d53d-a226-490d-a3bb-159a78d1b2b7": { // Null Sphere
    colors: ["wu", "ub", "ur", "ug", "wur", "ubr", "ubg", "wubg", "wubrg"],
    draftArchetypes: ["u-big-mana-artifacts", "ub-tempo", "ubr-control", "ug-ramp", "ur-burn", "ur-spellslinger", "urg-sneak", "urg-storm", "wu-artifact-control", "wu-control", "wub-control", "wubg-lands-soup", "wubg-value-midrange", "wug-value", "wur-artifacts", "wurg-lands-soup"],
  },
  "435ed83c-f7a6-4a73-a684-67fcc4e49bc4": { // Call of Calamity
    tides: ["Discard / Madness"],
    colors: ["r", "ur", "rg", "wrg", "ubr", "urg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-burn", "rg-lands-soup", "ubr-storm", "ubrg-lands-soup", "ubrg-storm", "ug-lands-soup", "ur-burn", "ur-spellslinger", "ur-storm", "wbrg-lands-soup", "wr-aggro", "wr-artifact-aggro", "wubrg-lands-midrange", "wur-artifacts"],
  },
  "c32ef131-d283-4bf1-bf65-2d5e5d232168": { // Harrowing Officiant
    tides: ["Discard / Madness", "Events"],
    colors: ["ug", "rg", "wug", "wbg", "ubg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "brg-lands-monsters", "brg-midrange", "g-big-ramp", "rg-midrange", "ubg-tempo", "ubg-value-midrange", "ug-ramp", "ug-sneak", "wubg-control", "wubrg-value", "wug-big-ramp"],
  },
  "3cc9253a-4db6-4b02-92d6-a37805d192fb": { // Ancient Descent
    tides: ["Events"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wur", "ubr", "urg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["u-big-mana-artifacts", "u-control", "ub-tempo", "ubr-storm", "ubrg-storm", "ug-cheaty-ramp", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wu-artifact-control", "wu-blink", "wu-control", "wug-value", "wur-artifacts", "wur-control"],
  },
  "bc1ffcd7-36c3-43b7-871b-bc2e6b3d0034": { // Dreadweaver
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["b", "wb", "br", "bg", "wub", "wbr", "wbg", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "ub-tempo", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wbrg-aristocrats", "wur-artifacts"],
  },
  "e7c93c3b-14db-4131-ab50-71d152331777": { // Rootbound Witness
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["wr", "ur", "br", "rg", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-burn", "ubr-control", "ubr-storm", "ur-control", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wbrg-lands-soup", "wr-artifact-aggro", "wr-artifacts", "wurg-welder"],
  },
  "dcaba429-6fbc-4ea5-b063-871134ccd03b": { // Skies of Change
    tides: ["Discard / Madness"],
    colors: ["wr", "ur", "br", "rg", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-burn", "ubr-control", "ubr-storm", "ur-control", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wbrg-lands-soup", "wr-artifact-aggro", "wr-artifacts", "wurg-welder"],
  },
  "2a828466-450a-4637-9c68-6b54522450c0": { // Rusted Monolith
    tides: ["Reclaim Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "wbg", "brg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "brg-lands-midrange", "brg-midrange", "r-burn", "ub-tempo", "ubr-control", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wg-value-midrange"],
  },
  "14ac6804-ed1d-4148-aad7-11796b6fff6c": { // Undying Fang
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "urg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "g-big-ramp", "g-ramp", "rg-lands-soup", "ubrg-lands-soup", "ug-big-ramp", "ug-lands-soup", "ug-ramp", "wb-weenie", "wbg-midrange", "wg-big-ramp", "wg-midrange", "wubg-ramp", "wubrg-value", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "44fb30ba-c8a1-40e2-9f33-f2dd1fa96e5e": { // Nineborn Specter
    tides: ["Abandon", "Fading Farewell", "Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wb", "wr", "ub", "br", "wub", "wbr", "wubr", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-welder", "brg-midrange", "u-welder", "ur-welder", "wb-weenie", "wr-artifact-aggro", "wu-academy", "wu-artifact-control", "wub-artifact-control", "wub-control", "wub-weenie"],
  },
  "cd2d4eaf-6295-451d-aaa2-ea74188bac3b": { // Young Beastcaller
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wbg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "rg-midrange", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-lands-soup", "urg-storm", "wbrg-lands-soup", "wg-big-ramp", "wubg-big-ramp", "wubg-lands-soup", "wug-lands-soup", "wug-value"],
  },
  "0be20cfb-595b-4bb1-9cea-f7c2f41fee5a": { // Standard Bearer
    tides: ["Abandon", "Celestial Reverie Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "wg", "ub", "ur", "br", "wub", "wug", "wbr", "wbg", "wrg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-midrange", "u-welder", "ub-storm", "ubg-value-midrange", "w-artifact-aggro", "wb-aristocrats", "wbr-aristocrats", "wbrg-lands-soup", "wg-midrange", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wubg-artifact-control", "wubg-big-ramp", "wur-artifacts"],
  },
  "0269e363-5567-47a4-80cd-8ebc061fe7e1": { // Wasteland Tamer
    tides: ["Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbg", "ubg", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "brg-lands-midrange", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ur-storm", "wb-weenie"],
  },
  "3b4ec013-0e07-4bf8-9879-5fbe3bf318b2": { // Duneveil Vanguard
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["br", "wrg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "brg-midrange", "g-big-ramp", "rg-lands-soup", "rg-midrange", "ubg-ramp", "ubrg-lands-midrange", "ur-storm", "urg-lands-soup", "wubrg-lands-soup", "wubrg-value", "wur-control", "wurg-lands-soup"],
  },
  "a37876f4-08a7-4352-bb3a-6d24f5c9407d": { // Guiding Light
    tides: ["Events"],
    colors: ["u", "wu", "ub", "ur", "wug", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-sneak", "wu-control", "wubrg-value"],
  },
  "70306382-ac0d-4b08-843a-23efb3835c94": { // Cradle of Storms
    tides: ["Discard / Madness", "Wake the Fallen / Shadow March Combo"],
    draftArchetypes: ["br-madness"],
  },
  "72debe2e-1f47-4a66-83c3-71bb72876663": { // Wake the Fallen
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "wu", "wb", "wr", "br", "wur", "wbr", "wbg", "ubr", "brg", "wubg"],
    draftArchetypes: ["g-big-ramp", "rg-lands-soup", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wubrg-lands-soup", "wug-lands-soup", "wur-academy", "wur-artifacts"],
  },
  "6f0b709d-0f57-46de-bfba-6a8b4df2b991": { // Derelict Voyage
    tides: ["Storm"],
    colors: ["r", "wr", "ur", "br", "rg", "wur", "wbr", "ubr", "urg", "brg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "rg-midrange", "ubr-control", "ubr-storm", "ur-burn", "ur-storm", "ur-welder", "wbr-aristocrats", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wr-artifacts"],
  },
  "3b5f5686-f63b-4998-b713-2f6777ecbb5f": { // Dreadcall Warden
    tides: ["Discard / Madness", "Outsiders"],
    colors: ["ub", "wub", "wbr", "ubr", "ubg", "wubr", "wubrg"],
    draftArchetypes: ["ub-tempo", "ubr-control", "ubr-storm", "ubrg-lands-soup", "wub-control", "wubg-value-midrange"],
  },
  "8e003d04-e489-4c55-9c72-fc5612909d07": { // Last Beacon
    tides: ["Outsiders"],
    colors: ["ub", "wub", "wbr", "ubr", "ubg", "wubr", "wubrg"],
    draftArchetypes: ["ub-tempo", "ubr-control", "ubr-storm", "ubrg-lands-soup", "wub-control", "wubg-value-midrange"],
  },
  "41c14462-86b9-42a4-8a61-859d59ffa466": { // Summons of the Bonded
    tides: ["Warrior Aggro"],
    colors: ["rg", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "rg-midrange", "ubr-storm", "ubrg-lands-soup", "ur-burn", "ur-welder", "urg-storm", "wbrg-lands-soup", "wr-aggro", "wubrg-lands-midrange", "wurg-artifacts", "wurg-lands-soup"],
  },
  "f1452b45-51dc-453a-916e-88bd9d29e36e": { // The Calling Night
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbg", "ubg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "br-aristocrats", "br-storm", "ub-tempo", "ubr-control", "ubr-storm", "w-weenie", "wb-weenie", "wbg-value-midrange"],
  },
  "99ca2635-a91a-46ba-a9d3-4d2581c354f3": { // Spirit of the Greenwood
    tides: ["Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    draftArchetypes: ["g-stompy"],
  },
  "2708c635-9332-4cfb-b43d-889ba2e329b6": { // Voidshield Guardian
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wug", "wubrg"],
    draftArchetypes: ["r-aggro", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-aristocrats", "wb-weenie", "wg-big-ramp", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wu-blink", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wug-value"],
  },
  "fc4b06d6-3b30-4769-af98-88fcea5b54dd": { // Cascade of Reflections
    tides: ["Discard / Madness", "Events", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["ur", "ubr", "ubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "brg-midrange", "u-storm", "ubr-storm", "ur-burn", "ur-storm", "urg-lands-soup", "urg-storm", "wr-aggro", "wubrg-value"],
  },
  "4cece464-2fde-483d-af92-04cd0341be5b": { // Collateral Damage
    colors: ["b", "wb", "ub", "ug", "br", "wub", "wbr", "ubr", "brg", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "brg-lands-midrange", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-welder", "wb-aristocrats", "wb-value", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wub-control", "wub-weenie", "wubg-artifact-control", "wubg-control"],
  },
  "edb479be-68a5-45bc-bd19-2602156edb57": { // Mystic Runefish
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "brg", "wubg", "wurg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "g-big-ramp", "g-ramp", "ubg-value-midrange", "ubrg-lands-soup", "ug-big-ramp", "ug-lands-soup", "ug-ramp", "wbg-midrange", "wg-big-ramp", "wg-lands-soup", "wr-aggro", "wubg-big-ramp", "wurg-lands-soup"],
  },
  "4644db03-fbcd-4af5-a229-17962ce093d5": { // Duskreaper
    tides: ["Abandon", "Fading Farewell", "Reclaim Combo", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["wb", "br", "wub", "wbr", "wbg", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wub-artifact-control"],
  },
  "a031eada-2c47-49c6-8c19-d2fe85f8ce97": { // Barrage Specialist
    tides: ["Blink", "Events"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wur", "wug", "ubr", "urg", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-tempo", "ubr-storm", "ubrg-storm", "ug-ramp", "ur-burn", "ur-storm", "urg-storm", "wu-artifact-control", "wu-blink", "wub-control", "wubg-lands-soup", "wubrg-value", "wug-value", "wur-control"],
  },
  "c06b993d-a1f4-42ad-85a9-ebf611d9a129": { // Surge of Fury
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["u", "wu", "ub", "ur", "ug", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["u-control", "u-storm", "ub-storm", "ub-tempo", "ubr-storm", "ubrg-storm", "ug-sneak", "ur-storm", "urg-storm"],
  },
  "15b63630-d9f8-473b-9717-15ad91ff2f16": { // Threadbreaker
    tides: ["Outsiders"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wug", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubr-control", "ug-cheaty-ramp", "ug-ramp", "urg-sneak", "wu-artifacts", "wu-blink", "wu-control", "wug-value"],
  },
  "74e82d0d-e107-4207-ad2a-73d016ea54a9": { // Nightmare
    tides: ["Wake the Fallen / Shadow March Combo"],
    colors: ["w", "wb", "ur", "wub", "wur", "wbr", "wbg", "wubr", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-artifact-control", "wubg-lands-soup", "wubr-artifact-aggro", "wubrg-lands-soup", "wur-control", "wurg-lands-soup"],
  },
  "3e83cbe2-2b21-4804-9906-4b4735db9869": { // Phantom Flotilla
    tides: ["Cheap Characters", "Wake the Fallen / Shadow March Combo"],
    colors: ["w", "wb", "ur", "wub", "wur", "wbr", "wbg", "wubr", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-artifact-control", "wubg-lands-soup", "wubr-artifact-aggro", "wubrg-lands-soup", "wur-control", "wurg-lands-soup"],
  },
  "7d5672d2-c8fa-4837-9e98-8cccdd07ff56": { // Twice-Lit Portal
    tides: ["Events", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["r", "ur", "br", "wug", "ubr", "wubr", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aristocrats", "r-burn", "ubr-storm", "ubrg-storm", "ur-burn", "ur-storm", "urg-lands-soup", "wur-control"],
  },
  "b4838d67-f055-4fd3-a64d-0a4d2b6678cc": { // Torchbearer of the Abyss
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "bg", "rg", "ubr", "brg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "brg-lands-midrange", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wbr-aristocrats", "wr-aggro"],
  },
  "20a6474c-55b8-4b1b-9155-baac62a06f1e": { // Cindermarch
    tides: ["Abandon", "Blink", "Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["g", "wg", "ur", "ug", "bg", "wug", "wbg", "wrg", "ubrg", "wubrg"],
    draftArchetypes: ["g-big-ramp", "ubr-control", "ubrg-lands-soup", "ug-big-ramp", "ug-cheaty-ramp", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbg-midrange", "wbrg-lands-soup", "wg-big-ramp", "wu-artifact-control", "wu-control", "wubg-big-ramp", "wubg-value-midrange", "wubrg-value", "wug-big-ramp", "wug-lands-soup", "wug-value", "wurg-artifacts"],
  },
  "245b49b9-e1e5-4dd0-ae18-718c437b8eb0": { // Conduit of Resonance
    tides: ["Abandon", "Blink", "Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["g", "wg", "ur", "ug", "bg", "wug", "wbg", "wrg", "ubrg", "wubrg"],
    draftArchetypes: ["g-big-ramp", "ubr-control", "ubrg-lands-soup", "ug-big-ramp", "ug-cheaty-ramp", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbg-midrange", "wbrg-lands-soup", "wg-big-ramp", "wu-artifact-control", "wu-control", "wubg-big-ramp", "wubg-value-midrange", "wubrg-value", "wug-big-ramp", "wug-lands-soup", "wug-value", "wurg-artifacts"],
  },
  "174a5909-48e2-4aab-8cc5-fa3292281d1d": { // Twilight Troubadour
    tides: ["Cindermarch / Shadow Soloist Combo", "Events", "Storm", "Warrior Aggro"],
    colors: ["u", "wu", "wr", "ur", "ug", "wub", "wur", "ubr", "wurg", "wubrg"],
    draftArchetypes: ["r-aggro", "r-burn", "u-artifacts", "ubr-control", "ubr-storm", "ur-academy", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "wr-artifacts", "wu-academy", "wubrg-lands-midrange", "wubrg-value", "wur-artifacts", "wurg-artifacts"],
  },
  "ccff822e-e2ae-4d38-9720-6df289dbe4cd": { // Simulacra
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["u", "wu", "wr", "ur", "ug", "wub", "wur", "ubr", "wurg", "wubrg"],
    draftArchetypes: ["r-aggro", "r-burn", "u-artifacts", "ubr-control", "ubr-storm", "ur-academy", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "wr-artifacts", "wu-academy", "wubrg-lands-midrange", "wubrg-value", "wur-artifacts", "wurg-artifacts"],
  },
  "4cec92f2-9bac-4949-a602-cd0a44618aaf": { // The Ringleader
    tides: ["Events", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["ur", "rg", "ubr", "wurg"],
    draftArchetypes: ["br-aristocrats", "brg-midrange", "r-aggro", "r-burn", "ubr-storm", "ubrg-storm", "ur-burn", "ur-spellslinger", "ur-storm"],
  },
  "7dd2214f-8d16-453a-9f28-62712e64eae1": { // Hallowed Stag
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "ubg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "g-big-ramp", "rg-lands-soup", "ubg-value-midrange", "ubrg-lands-midrange", "ug-lands-soup", "wbg-midrange", "wbg-value-midrange", "wg-big-ramp", "wubg-big-ramp", "wubg-lands-soup", "wubg-value-midrange", "wubrg-lands-soup", "wubrg-value", "wurg-lands-soup"],
  },
  "2305722e-59c1-47d7-9e05-dc1c32c946a2": { // Intermezzo Balladeer
    tides: ["Celestial Reverie Combo", "Events", "Storm", "Warrior Combo"],
    colors: ["w", "u", "ub", "ur", "ug", "wub", "wur", "wbr", "wbg", "ubr", "wubg", "wbrg"],
    draftArchetypes: ["u-storm", "ub-storm", "ubr-storm", "ur-storm", "ur-welder", "urg-storm", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wur-artifacts"],
  },
  "f3282494-2fcf-4c06-bfbe-3474b28aa87a": { // Oathbound Pair
    tides: ["Spirit Animals"],
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wug", "wbr", "wbg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-aristocrats", "wb-weenie", "wbg-midrange", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wug-value", "wur-artifacts"],
  },
  "18ff6a45-148a-40bf-85ae-4a51f32f406a": { // Blazing Emberwing
    tides: ["Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "wbg", "wubg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "g-big-ramp", "ug-big-ramp", "ug-ramp", "ug-sneak", "wg-big-ramp", "wg-midrange", "wubg-big-ramp", "wubg-ramp", "wug-value", "wur-artifacts", "wurg-artifacts"],
  },
  "795a7b54-40d5-42f9-bc3a-9e92bc938c2d": { // Crumbling Covenant
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "ubr", "ubrg"],
    draftArchetypes: ["u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-lands-soup", "ubr-control", "ubr-storm", "ug-lands-midrange", "ug-ramp", "ur-burn", "ur-control", "ur-spellslinger", "wu-academy", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubg-artifacts", "wubrg-value", "wug-lands-soup", "wug-value", "wur-artifacts", "wurg-lands-soup"],
  },
  "7c9f3a38-1434-4db4-a856-24fe744e8322": { // Canopy of Stars
    tides: ["Storm"],
    colors: ["r", "ur", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "ubr-storm", "ubrg-storm", "ur-burn", "ur-storm"],
  },
  "1521c06c-f5ac-4d29-a6bd-7030b63a3c3e": { // Doorlight Foundling
    tides: ["Blink", "Celestial Reverie Combo", "Cheap Characters"],
    colors: ["g", "ug", "wug", "wbg", "ubg", "urg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-big-ramp", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-sneak", "wubg-big-ramp", "wubg-lands-soup", "wubrg-value", "wug-lands-soup", "wug-value", "wur-artifacts"],
  },
  "f160fd01-b3c3-4904-b15f-339f6fcf5ca5": { // Luminous Ascent
    tides: ["Celestial Reverie Combo"],
    colors: ["w", "g", "wg", "ug", "bg", "rg", "wug", "wbr", "wbg", "wrg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "g-big-ramp", "ug-ramp", "wbg-midrange", "wbrg-aristocrats", "wg-big-ramp", "wg-midrange", "wubg-big-ramp", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "f9c66b3e-4771-4a3c-8577-9d2f1c987bc7": { // Heavenward Penitent
    tides: ["Celestial Reverie Combo", "Cheap Characters", "Spirit Animals"],
    colors: ["g", "ug", "bg", "rg", "wug", "ubg", "urg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubg-lands-soup", "ubg-ramp", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ur-storm", "urg-lands-soup", "wbrg-lands-soup", "wg-midrange", "wg-value-midrange", "wubg-big-ramp", "wubg-lands-soup", "wug-lands-soup", "wug-value"],
  },
  "920ef495-5560-4fa6-9a95-b9584ef6a4cf": { // Scorched Crusader
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["wg", "bg", "wug", "wbg", "wrg", "brg", "wubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "wbg-value-midrange", "wbg-weenie", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-value-midrange", "wr-artifacts", "wubg-artifact-control", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "b5fbff03-f850-4627-94eb-12ed4dc15334": { // Worldsong Behemoth
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "ubg", "brg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-lands-midrange", "g-big-ramp", "g-ramp", "rg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-ramp", "wbg-midrange", "wg-big-ramp", "wubrg-value", "wug-big-ramp", "wug-value", "wurg-artifacts"],
  },
  "22ebb4fe-483f-4bd2-b0cf-a2d0ea934ebf": { // Cinderblade Legionnaire
    colors: ["b", "wb", "ub", "br", "wub", "ubr", "brg", "wubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "ub-tempo", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wub-control"],
  },
  "87f075b1-b058-4570-a75f-c4f8f544e192": { // Wondrous Clearing
    tides: ["Celestial Reverie Combo", "Cheap Characters"],
    colors: ["g", "wug", "wbg", "wrg", "ubg", "urg", "brg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "g-big-ramp", "rg-lands-soup", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wg-lands-soup", "wg-ramp", "wubg-lands-soup", "wug-big-ramp", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "11b4ae1d-ae2a-41a6-9cdc-70c6d69803d6": { // Fell the Mighty
    core: true,
    colors: ["r", "wr", "ur", "br", "wur", "wbr", "ubr", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "brg-midrange", "r-aggro", "r-burn", "r-welder", "rg-midrange", "ubr-control", "ubr-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wubr-artifact-aggro", "wur-artifact-aggro"],
  },
  "3fdf265c-8aa2-4367-9fee-43e242bdb462": { // Shared Revelation
    tides: ["Discard / Madness"],
    colors: ["u", "wu", "ub", "ur", "wub", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-control", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "urg-sneak", "wu-control", "wur-control"],
  },
  "290ea9db-0340-4838-842a-0dea09b5340a": { // Volcanic Channeler
    tides: ["Abandon", "Fading Farewell", "Reclaim Combo", "Survivors", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-midrange", "ubg-value-midrange", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbrg-aristocrats", "wu-artifact-control", "wub-control", "wub-weenie", "wubrg-value"],
  },
  "85251f03-c873-46d8-81be-ab421c901a53": { // Fractured Vessel
    tides: ["Abandon"],
    colors: ["w", "u", "wu", "wb", "br", "bg", "wub", "wbr", "wbg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-weenie", "br-aristocrats", "urg-artifact-control", "wb-weenie", "wbg-value-midrange"],
  },
  "6cf545ba-b014-4333-a0da-573e8f97d734": { // Clockwork Prodigy
    tides: ["Outsiders"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wur", "wug", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-reanimator", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-sneak", "wu-academy", "wu-artifact-control", "wu-control", "wub-artifact-control", "wub-control", "wubrg-lands-midrange", "wubrg-value", "wug-value", "wur-control"],
  },
  "128d1878-a505-4766-91a2-e5a29498bc4e": { // Echoing Denial
    tides: ["Events", "Outsiders"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wur", "wug", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-reanimator", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-sneak", "wu-academy", "wu-artifact-control", "wu-control", "wub-artifact-control", "wub-control", "wubrg-lands-midrange", "wubrg-value", "wug-value", "wur-control"],
  },
  "fbf725ca-8837-46d4-970c-922153e27b6e": { // Infernal Ascendant
    tides: ["Abandon", "Fading Farewell", "Reclaim Combo", "Storm", "Survivors", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["b", "wu", "wb", "wg", "br", "bg", "wbr", "wbg", "wrg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["b-weenie", "bg-midrange", "br-aristocrats", "brg-midrange", "ur-welder", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-artifact-aggro", "wbrg-aristocrats", "wr-artifacts", "wu-artifacts", "wubg-value", "wur-artifacts"],
  },
  "7762759b-c1df-4c86-9dbb-a49d152f3616": { // Shatter the Frail
    tides: ["Cheap Characters", "Discard / Madness", "Events", "Survivors"],
    colors: ["br", "bg", "ubg", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "ub-tempo", "ubg-value-midrange", "ubrg-storm", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wbrg-aristocrats"],
  },
  "5931e388-1856-4e5a-85f8-a5aa34f867b1": { // Whisper of the Past
    tides: ["Cheap Characters", "Discard / Madness", "Events", "Survivors"],
    colors: ["br", "bg", "ubg", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "ub-tempo", "ubg-value-midrange", "ubrg-storm", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wbrg-aristocrats"],
  },
  "071bcab4-ed02-48a0-93dc-8fd0f36611c8": { // Northlight Maestro
    tides: ["Blink", "Outsiders"],
    colors: ["wu", "ub", "ur", "wurg"],
    draftArchetypes: ["u-big-mana-artifacts", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ubr-control", "ug-ramp", "ur-welder", "wu-blink", "wu-control", "wub-control", "wubg-value-midrange", "wubrg-value"],
  },
  "08fe3190-f559-4152-941d-33ec4180f509": { // Data Pulse
    tides: ["Storm"],
    colors: ["wg", "ur", "ubr", "urg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-aristocrats", "rg-lands-soup", "rg-midrange", "ubr-storm", "ubrg-lands-soup", "ubrg-storm", "ur-spellslinger", "ur-storm", "urg-storm"],
  },
  "8a5d7d67-91c9-41c4-b22e-8287954efa09": { // Dreaming Obelisk
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Storm", "Warrior Aggro", "Warrior Combo"],
    colors: ["r", "wu", "wr", "ub", "ur", "br", "wbr", "ubr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-welder", "ubr-control", "ubr-storm", "ur-academy", "ur-artifacts", "ur-storm", "ur-welder", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wubr-welder", "wur-academy", "wur-artifacts", "wurg-artifacts"],
  },
  "151b80b1-0a3f-48d4-9c85-99a9c274fd7f": { // Radiant Trio
    tides: ["Abandon", "Spirit Animals"],
    colors: ["g", "wg", "ug", "wug", "wbg", "wrg", "ubg", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["bg-lands-midrange", "brg-lands-monsters", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "rg-midrange", "ubrg-lands-soup", "ug-big-ramp", "ug-cheaty-ramp", "ug-lands-soup", "ug-ramp", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-value-midrange", "wubg-lands-soup", "wubg-value", "wubg-value-midrange", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "a30a5fdc-a6ec-4289-89cf-40f5cbe6fbaa": { // Kindred Sparks
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "wbg", "brg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ubr-storm", "wb-weenie", "wbg-weenie", "wub-control"],
  },
  "73fc1b7f-3c2b-4993-9590-924240515c2f": { // Lunar Hart
    tides: ["Celestial Reverie Combo", "Spirit Animals", "Warrior Aggro"],
    core: true,
    colors: ["w", "u", "g", "wu", "wb", "wr", "wg", "ub", "ur", "ug", "bg", "wub", "wbr", "wbg", "ubr", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-lands-soup", "bg-midrange", "br-aristocrats", "g-big-ramp", "g-lands-soup", "r-aggro", "r-burn", "rg-midrange", "u-big-mana-artifacts", "u-storm", "ub-storm", "ub-tempo", "ubg-tempo", "ubr-storm", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "ur-artifacts", "ur-burn", "ur-storm", "ur-welder", "w-weenie", "wb-weenie", "wbg-midrange", "wg-big-ramp", "wg-midrange", "wub-control", "wub-weenie", "wubg-lands-soup", "wubg-value-midrange", "wubrg-lands-soup", "wug-value", "wur-artifacts"],
  },
  "bbdc6ee7-e9b1-488b-90b9-19337b65fee6": { // Dreadlord
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro"],
    colors: ["u", "wu", "wr", "ub", "ur", "wub", "wur", "ubr", "wubr", "ubrg"],
    draftArchetypes: ["u-artifacts", "u-welder", "ub-storm", "ubg-value-midrange", "ubr-storm", "ubr-welder", "ur-artifacts", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubr-welder", "wur-artifacts", "wurg-artifacts"],
  },
  "cd3d8e4a-618e-4c2f-be60-0363b81887f1": { // Echo Technician
    tides: ["Cindermarch / Shadow Soloist Combo", "Events", "Warrior Aggro"],
    colors: ["u", "wu", "wr", "ub", "ur", "wub", "wur", "ubr", "wubr", "ubrg"],
    draftArchetypes: ["u-artifacts", "u-welder", "ub-storm", "ubg-value-midrange", "ubr-storm", "ubr-welder", "ur-artifacts", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubr-welder", "wur-artifacts", "wurg-artifacts"],
  },
  "96e2c30c-930c-47af-abb0-d4fbab454d56": { // Dream Garden Visitor
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["u", "wu", "wr", "ub", "ur", "wub", "wur", "ubr", "wubr", "ubrg"],
    draftArchetypes: ["u-artifacts", "u-welder", "ub-storm", "ubg-value-midrange", "ubr-storm", "ubr-welder", "ur-artifacts", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubr-welder", "wur-artifacts", "wurg-artifacts"],
  },
  "d9434b04-217c-4b37-b763-c46404d8fef9": { // Dreamcatcher's Call
    tides: ["Celestial Reverie Combo"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "ubg", "urg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubg-lands-soup", "ug-big-ramp", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wg-midrange", "wg-ramp", "wubg-lands-soup", "wubg-ramp", "wubrg-lands-midrange", "wubrg-lands-soup", "wubrg-value", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "8624f9c7-dc92-4f4a-9c79-319b9c121b19": { // Cinderheart
    tides: ["Abandon", "Fading Farewell", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["br", "wbr", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "brg-lands-midrange", "wbr-aristocrats", "wr-artifacts", "wub-control", "wubrg-value"],
  },
  "d09a6760-6630-4964-9c77-decc641df713": { // Urban Desperado
    colors: ["w", "wu", "wb", "wr", "wg", "wug", "wbg", "wubr", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-weenie", "wb-value", "wb-weenie", "wbrg-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wug-value", "wur-artifact-aggro"],
  },
  "ae90a3e1-c650-4f21-83af-de3208151b11": { // Verdant Pioneer
    tides: ["Blink", "Cheap Characters"],
    colors: ["w", "wu", "wb", "wr", "wg", "wug", "wbg", "wubr", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-weenie", "wb-value", "wb-weenie", "wbrg-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wug-value", "wur-artifact-aggro"],
  },
  "3e802ecd-a83b-491b-9528-a4672d0e986f": { // Paradox Enforcer
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Survivors"],
    colors: ["b", "br", "bg", "wbg", "ubg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-midrange", "g-big-ramp", "ubg-tempo", "ubrg-lands-soup", "wbg-midrange", "wbg-weenie", "wbrg-aristocrats", "wubg-value-midrange", "wubrg-value", "wug-big-ramp"],
  },
  "0e1209c3-1041-4079-9b1c-f96816a7deb5": { // Wistful Angler
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "ubg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "bg-midrange-reanimator", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "rg-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-ramp", "wubrg-lands-soup", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "db4618f6-121b-4c97-98d3-c29849c5824e": { // Ashen Avenger
    tides: ["Discard / Madness"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "ubg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "bg-midrange-reanimator", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "rg-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-ramp", "wubrg-lands-soup", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "8e7b0eb9-4933-420b-abee-413bf5b3d2fc": { // Liminal Dreamer
    tides: ["Discard / Madness"],
    colors: ["w", "r", "wu", "wr", "br", "rg", "wbr", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "r-welder", "ubr-welder", "ur-welder", "w-artifact-aggro", "w-weenie", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wubrg-value", "wur-artifact-aggro", "wur-artifacts"],
  },
  "b4754e5a-29e6-418c-bdfa-8e0230a21b7b": { // Featherlight Summoner
    tides: ["Blink"],
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wur", "wug", "wbr", "wubr", "wurg", "wubrg"],
    draftArchetypes: ["r-aggro", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wbr-artifact-aggro", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wug-value"],
  },
  "0a19c54c-7a2e-4614-99c9-2c9142729ebb": { // Endless Projection
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["wg", "wug", "wbg", "wubg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["ubrg-lands-soup", "w-weenie", "wb-value", "wbg-midrange", "wbg-weenie", "wbrg-lands-soup", "wg-midrange", "wg-value-midrange", "wubg-big-ramp", "wubrg-value", "wug-big-ramp", "wug-lands-soup"],
  },
  "f38ab9b6-bea7-4c6e-b5db-2609796ba46b": { // Dawnprowler Panther
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wbg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "g-big-ramp", "rg-midrange", "ug-big-ramp", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wubg-big-ramp", "wubg-value-midrange", "wurg-lands-soup"],
  },
  "e72245f2-c153-4e79-ba8e-956d18202b48": { // Forge Inheritor
    colors: ["w", "g", "wu", "wb", "wr", "wg", "ub", "ug", "wub", "wug", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "ub-tempo", "ubrg-lands-soup", "ur-burn", "w-artifact-control", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wg-midrange", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-control", "wub-artifact-control", "wubg-big-ramp", "wubrg-lands-midrange", "wur-artifacts"],
  },
  "22239029-f53c-4ba9-b9b6-29f6592bb722": { // Rift Pilgrim
    tides: ["Blink"],
    colors: ["u", "wu", "ub", "ur", "wur", "wug", "ubr", "wubrg"],
    draftArchetypes: ["u-big-mana-artifacts", "ub-tempo", "ur-burn", "ur-spellslinger", "ur-welder", "urg-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wug-value", "wur-artifacts", "wur-control"],
  },
  "f95cae7b-6502-4dbe-ae26-16853959d9a3": { // Sunset Chronicler
    tides: ["Abandon", "Celestial Reverie Combo", "Fading Farewell", "Wake the Fallen / Shadow March Combo"],
    colors: ["g", "wg", "ug", "rg", "wug", "wrg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-midrange", "urg-lands-soup", "wbg-value-midrange", "wbrg-aristocrats", "wg-big-ramp", "wubrg-value", "wug-big-ramp"],
  },
  "4f29a241-9265-4669-a189-5a2a91923e12": { // Vanishing Inquisitor
    tides: ["Blink", "Outsiders"],
    colors: ["u", "wu", "ub", "ur", "wub", "wubr", "wubrg"],
    draftArchetypes: ["ub-tempo", "ug-ramp", "ug-sneak", "ur-welder", "wu-control", "wub-control", "wug-value"],
  },
  "fed69d6e-acb5-40fb-b416-e6ef6c0e63fb": { // Heroic Rescue
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["wu", "wb", "wr", "bg", "wub", "wbg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "rg-lands-soup", "urg-lands-soup", "w-artifact-aggro", "w-weenie", "wb-weenie", "wbg-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wubg-artifacts", "wug-value", "wur-artifacts"],
  },
  "9d63ba3e-fafb-466e-8418-ce5f8941ba30": { // Dawnrunner
    colors: ["b", "wb", "ub", "br", "bg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ubg-lands-soup", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wubg-value-midrange"],
  },
  "d2a3d344-613c-449e-9a87-0f720a85585d": { // Overstory Explorer
    tides: ["Abandon"],
    colors: ["g", "ug", "bg", "wug", "wbg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "g-big-ramp", "rg-lands-soup", "rg-midrange", "ubg-ramp", "ubrg-lands-soup", "ug-lands-soup", "urg-lands-soup", "wbrg-lands-soup", "wubg-big-ramp"],
  },
  "b1d36337-5668-4f1d-b155-2d07fc00f872": { // Across the Void
    tides: ["Discard / Madness"],
    colors: ["u", "ub", "ur", "ug", "wub", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["ub-storm", "ubg-tempo", "ubr-storm", "ubrg-lands-soup", "ur-burn", "ur-storm", "ur-welder", "urg-lands-soup", "urg-storm", "wub-control", "wubg-lands-soup"],
  },
  "f9a65b32-537b-457c-9eaf-b512cf1f3791": { // Still Dreamer
    tides: ["Blink", "Celestial Reverie Combo", "Outsiders"],
    colors: ["w", "wu", "wb", "wg", "wug", "wbg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["r-aggro", "ubrg-lands-soup", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wg-midrange", "wg-ramp", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-weenie", "wub-control", "wubrg-lands-soup"],
  },
  "41044897-b70a-4e2b-8eb6-baf843a14a43": { // Spellweaver
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "ub", "wub", "wbr", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-artifact-control", "u-artifacts", "ubr-welder", "ur-welder", "w-artifact-control", "wu-academy", "wu-artifact-control", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-control", "wubrg-value", "wur-academy"],
  },
  "1dc8f23e-58bd-47e5-9510-b48315fba1df": { // Lanternhearted
    tides: ["Cindermarch / Shadow Soloist Combo", "Survivors"],
    colors: ["wu", "ur", "ug", "urg", "wubr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["ubrg-lands-soup", "wu-artifact-control", "wubg-value-midrange", "wubrg-value", "wug-big-ramp", "wur-control", "wurg-artifacts"],
  },
  "70716dd8-1133-4966-b01b-757ea627874c": { // Grim Pursuer
    core: true,
  },
  "890970bd-475f-4da4-b835-2fb75882a84d": { // Vortex Claimant
    colors: ["wu", "wub", "wur", "wug", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["w-weenie", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wubg-artifact-control", "wubg-control", "wubr-artifact-aggro", "wubrg-value", "wug-value", "wur-control"],
  },
  "b1bea643-1a7b-4e5e-b072-7174d3405421": { // Silent Observer
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wur", "wug", "wbr", "wubg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-academy", "wu-artifact-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubrg-value", "wug-value", "wur-aggro"],
  },
  "6fa9c440-3912-4b1e-868c-840ae772fe1c": { // The Devourer
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "rg", "wur", "wbr", "ubr", "brg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-aristocrats", "r-burn", "r-welder", "rg-midrange", "ubr-control", "ur-burn", "ur-spellslinger", "ur-welder", "wr-aggro", "wur-aggro", "wur-artifact-aggro", "wur-control"],
  },
  "145f72b9-5ff7-4477-b7f5-55ca89a135ae": { // Defiant Parry
    tides: ["Events", "Outsiders"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wug", "ubr", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-sneak", "urg-storm", "wu-artifact-control", "wu-control", "wub-control", "wubg-value-midrange", "wubr-welder", "wug-value", "wur-control"],
  },
  "017a7b4b-3ccf-4635-9956-28a72b22274e": { // Wraith of Twisting Shadows
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["g", "wug", "wbg", "brg", "wubg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-lands-soup", "rg-lands-soup", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wg-ramp", "wubg-value-midrange", "wug-value", "wurg-lands-soup"],
  },
  "7977748d-02c1-4702-ba68-5c49f7f0759b": { // Light of Emergence
    tides: ["Abandon", "Cheap Characters"],
    colors: ["g", "wug", "wbg", "brg", "wubg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-lands-soup", "rg-lands-soup", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wg-ramp", "wubg-value-midrange", "wug-value", "wurg-lands-soup"],
  },
  "b049ba66-9334-4dd1-a7d8-6d8b32d9a0a9": { // Seeker of the Radiant Wilds
    core: true,
    colors: ["ub", "wub", "ubr", "ubg", "wubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-control", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "wb-artifact-control", "wu-artifact-control", "wu-control", "wub-artifact-control", "wub-control", "wubg-artifact-control", "wubg-ramp", "wubrg-lands-soup"],
  },
  "848b41b3-9f87-45fb-b86f-b52fc913d201": { // Genesis Burst
    tides: ["Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["ub", "ur", "ug", "wub", "ubr", "wubrg"],
    draftArchetypes: ["u-artifact-control", "u-storm", "ub-storm", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wu-artifact-control", "wurg-artifacts"],
  },
  "312e42cb-e8ee-43da-9ef8-173a69583c97": { // Reforged Automaton
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "wu", "wr", "wub", "wur", "wbr", "wubg"],
    draftArchetypes: ["u-artifact-control", "ub-storm", "ur-welder", "w-artifact-control", "w-weenie", "wb-weenie", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubg-control", "wubg-value-midrange", "wubr-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "a36898f6-707e-4b28-89dc-ec896f484203": { // Verdant Pilgrim
    tides: ["Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "urg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "g-big-ramp", "g-lands-soup", "ubg-ramp", "ug-big-ramp", "ug-lands-midrange", "ug-ramp", "wbg-value-midrange", "wg-big-ramp", "wubg-big-ramp", "wubg-ramp"],
  },
  "18979c10-39b8-42fb-ac1d-dd784da498d1": { // Fell Swoop
    tides: ["Discard / Madness"],
    colors: ["r", "ur", "br", "ubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-storm", "r-aggro", "r-burn", "rg-midrange", "ubr-control", "ubr-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wr-aggro"],
  },
  "ce0c8dc8-67ab-4a1f-8c4c-50b211e07b0b": { // Wreckage Prowler
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo"],
    colors: ["ug", "bg", "rg", "urg", "brg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["brg-midrange", "rg-lands-soup", "rg-midrange", "ubg-lands-soup", "ubrg-storm", "ug-lands-soup", "urg-lands-soup", "wbrg-lands-soup", "wg-lands-soup", "wubrg-lands-midrange", "wubrg-lands-soup", "wurg-lands-soup"],
  },
  "9af63811-7fef-4e28-b672-95ea82796f45": { // Astral Angler
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["ug", "bg", "rg", "urg", "brg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["brg-midrange", "rg-lands-soup", "rg-midrange", "ubg-lands-soup", "ubrg-storm", "ug-lands-soup", "urg-lands-soup", "wbrg-lands-soup", "wg-lands-soup", "wubrg-lands-midrange", "wubrg-lands-soup", "wurg-lands-soup"],
  },
  "f7c68226-def4-4eb0-bdfe-b028482e1351": { // Forgotten Titan
    tides: ["Discard / Madness"],
    colors: ["br", "ubr", "brg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "brg-midrange", "r-aggro", "ubr-control", "wb-aristocrats"],
  },
  "956aaeb1-5280-4294-bf80-73079f35c5f6": { // Harborwarden
    tides: ["Abandon", "Discard / Madness", "Warrior Aggro", "Warrior Combo"],
    colors: ["br", "ubr", "brg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "brg-midrange", "r-aggro", "ubr-control", "wb-aristocrats"],
  },
  "625fe37e-8059-481c-99fd-109fd02ceedd": { // Maelstrom Denial
    tides: ["Abandon", "Discard / Madness"],
    colors: ["b", "wb", "ub", "br", "ubr", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "brg-lands-monsters", "ub-tempo", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wubrg-value"],
  },
  "c0edaab0-1e6d-4f0f-8d37-6fc90c8bee7f": { // Junkfield Renegade
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "r", "wr", "ub", "ur", "br", "wur", "wbr", "ubr", "urg", "wubr"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-aggro", "u-artifacts", "u-welder", "ubr-control", "ubr-storm", "ur-artifacts", "ur-spellslinger", "ur-storm", "ur-welder", "urg-artifact-control", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wur-academy", "wur-artifacts"],
  },
  "f256a0e7-e396-492b-8881-284ecd36025b": { // Fern Treader
    colors: ["w", "u", "wu", "wb", "wg", "ub", "bg", "wbr", "ubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "br-welder", "brg-midrange", "ubg-lands-soup", "ubrg-lands-soup", "ug-ramp", "ur-academy", "ur-spellslinger", "ur-storm", "w-artifact-control", "wbg-midrange", "wub-artifact-control", "wubg-value-midrange", "wubrg-value", "wur-artifact-aggro", "wur-artifacts", "wurg-artifacts", "wurg-lands-soup"],
  },
  "0211963d-d097-4427-9d16-5e857621e481": { // Sanctum Awakened
    tides: ["Discard / Madness"],
    colors: ["u", "ub", "ur", "ug", "wub", "wur", "ubr", "ubg", "urg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-burn", "ur-storm", "ur-welder", "urg-sneak", "wu-artifact-control", "wub-control", "wug-lands-soup", "wug-value", "wur-control"],
  },
  "29d25251-8b42-4d3d-97e6-6c3abaabd9a2": { // Hatching Ground
    tides: ["Celestial Reverie Combo", "Spirit Animals", "Storm"],
    colors: ["u", "wu", "ur", "br", "wur", "wbg", "ubr", "urg", "wubr", "wubg", "ubrg"],
    draftArchetypes: ["u-storm", "ub-storm", "ubr-storm", "ubrg-storm", "ug-sneak", "ur-spellslinger", "ur-storm", "urg-storm"],
  },
  "f79c63f6-7cf1-4030-be39-217fd3c2fb7f": { // Fury of the Clan
    tides: ["Abandon", "Warrior Aggro"],
    colors: ["r", "wr", "ur", "br", "rg", "wbr", "ubr"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-burn", "rg-midrange", "ug-ramp", "ur-academy", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wubr-artifact-aggro", "wur-artifact-aggro"],
  },
  "4ef8b2e7-3525-4c25-aa30-f751467f182f": { // Cosmic Puppeteer
    tides: ["Blink", "Outsiders"],
    colors: ["u", "wu", "ub", "ur", "wub", "wur", "ubr", "wubrg"],
    draftArchetypes: ["ub-tempo", "ubg-value-midrange", "ug-ramp", "ur-storm", "w-weenie", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubrg-value", "wug-value", "wur-artifacts"],
  },
  "41d0aa36-f15a-487d-b97c-7fd765973921": { // Sage of the Prelude
    core: true,
    colors: ["g", "wu", "wg", "ug", "wug", "ubg", "urg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["rg-lands-soup", "ubg-value-midrange", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "wg-lands-soup", "wg-ramp", "wu-control", "wubg-value-midrange", "wubrg-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "8b7883ee-a235-4793-aa56-086fb1e28d36": { // Bladefall
    tides: ["Blink"],
    core: true,
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wur", "wug", "wbr", "wbg", "wrg", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "ub-storm", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-value", "wb-weenie", "wbg-weenie", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wubg-value-midrange", "wug-lands-soup", "wug-value", "wur-artifacts", "wur-control"],
  },
  "a5056a4c-542b-4a7c-8fe6-895126c7d4c8": { // Carrion Lord
    tides: ["Abandon"],
    colors: ["g", "wg", "bg", "wub", "wbg", "wrg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-midrange", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "rg-midrange", "ubg-value-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ug-sneak", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wubg-big-ramp", "wubg-lands-soup", "wubrg-lands-soup", "wug-big-ramp", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "45e3d703-7efc-4dc2-b854-33211f8d4f11": { // Gleam Below
    tides: ["Events"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wug", "ubr", "wubr", "wubg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ug-lands-midrange", "ug-ramp", "ug-sneak", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-storm", "wu-blink", "wu-control", "wubrg-value", "wug-lands-soup", "wug-value"],
  },
  "5832785d-fb97-40b5-a12b-bb660f5e04b6": { // Momentum's Edge
    tides: ["Reclaim Combo", "Spirit Animals", "Survivors", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wb", "wg", "ub", "ur", "wub", "wrg", "wubr", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "bg-midrange", "brg-midrange", "g-big-ramp", "w-artifact-control", "w-weenie", "wb-weenie", "wbr-aristocrats", "wr-artifact-aggro", "wub-control", "wubg-big-ramp", "wur-artifacts"],
  },
  "7ecc1da1-dc39-4596-9a1d-262a261ffeea": { // Company Commander
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wug", "wbr", "ubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-welder", "ubg-value-midrange", "ur-academy", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wur-artifacts", "wurg-artifacts"],
  },
  "ed4d5342-0690-40b7-ab48-6b76035466f2": { // Shadowpaw
    tides: ["Discard / Madness"],
    colors: ["br", "rg", "wbr", "ubr", "brg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "br-welder", "u-welder", "wr-artifacts"],
  },
  "bd43b120-2503-406c-8b72-ea3dc55198a0": { // Selfless Rescuer
    tides: ["Reclaim Combo"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "wrg", "ubg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-value-midrange", "ubrg-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wubg-big-ramp", "wubg-lands-soup", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "84fd9c6e-79c6-4b65-878b-1534f3e4b220": { // Ecliptic Vantage
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "ubr", "wubr", "wubg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifacts", "ub-reanimator", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-storm", "ur-welder", "urg-storm", "wbrg-lands-soup", "wu-artifact-control", "wu-blink", "wug-value", "wur-control"],
  },
  "1434440c-c86f-4b7d-83e7-3bd1f7dde63e": { // Pulse of Sacrifice
    tides: ["Abandon", "Discard / Madness", "Storm", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["u", "wu", "wr", "wg", "ub", "ur", "ug", "wub", "wbr", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["br-welder", "brg-midrange", "u-storm", "ub-storm", "ubr-storm", "ur-burn", "ur-storm", "urg-storm", "wr-artifacts"],
  },
  "ca37f80e-8474-4d40-b793-7a900f6ca467": { // Shadow Reflection
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wbr", "wubr"],
    draftArchetypes: ["br-welder", "u-welder", "ubg-value-midrange", "ubr-welder", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wbr-artifact-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wubrg-value", "wur-artifacts"],
  },
  "fd5b3e85-ad7b-4d87-b4db-cd6ba0e6d277": { // Nexus Wayfinder
    tides: ["Abandon", "Blink", "Celestial Reverie Combo", "Cheap Characters", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "wrg", "ubg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["bg-midrange", "g-big-ramp", "g-ramp", "ubg-ramp", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wbg-value-midrange", "wg-big-ramp", "wg-ramp", "wubg-big-ramp", "wubg-ramp", "wubg-value-midrange", "wug-value"],
  },
  "4ccb9bb6-e4db-48c3-a534-b0ab454f0f15": { // Specter of Silent Snow
    tides: ["Abandon", "Cheap Characters", "Discard / Madness", "Warrior Combo"],
    colors: ["wbr", "wbg", "wrg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "brg-midrange", "ubg-value-midrange", "ubrg-lands-soup", "wbrg-aristocrats", "wbrg-lands-soup", "wubrg-lands-midrange", "wug-value", "wurg-lands-soup"],
  },
  "f860e815-3ed9-463d-ac4d-ed8d2778f8ad": { // Lone Castaway
    tides: ["Discard / Madness", "Spirit Animals"],
    colors: ["w", "u", "r", "wu", "wb", "wg", "ub", "ur", "ug", "br", "bg", "wub", "wur", "wbr", "wbg", "ubr", "wubr", "wubg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "br-welder", "rg-lands-soup", "ub-reanimator", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ur-storm", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wug-value", "wurg-lands-soup"],
  },
  "382dafa1-f8ff-47b4-9151-15b84067a5b2": { // Tidecaller
    tides: ["Discard / Madness"],
    colors: ["w", "u", "wb", "wr", "ub", "br", "wub", "wbr", "wubr", "wurg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-aristocrats", "br-aristocrats", "br-welder", "ub-storm", "ub-tempo", "ubr-welder", "ur-welder", "wb-aristocrats", "wb-artifact-control", "wb-weenie", "wbrg-aristocrats", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-artifact-control"],
  },
  "cb2d9f1e-8888-44c7-9918-57b2ec8c78e1": { // Wired Duelist
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wbr"],
    draftArchetypes: ["bg-midrange", "u-artifact-control", "u-artifacts", "ubg-value-midrange", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wubrg-value", "wur-artifact-aggro", "wur-artifacts"],
  },
  "cc21a902-e482-46c0-bf07-e04035f39190": { // Steel Abomination
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["g", "ug", "bg", "wug", "wbg", "ubg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "brg-lands-soup", "g-lands-soup", "rg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-cheaty-ramp", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wubg-big-ramp", "wubg-lands-soup", "wubrg-lands-midrange", "wubrg-value", "wug-lands-soup"],
  },
  "e4ab6a18-c3b2-4149-a446-c7c1e8d66714": { // Marrow Mimic
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "ub", "ur", "ug", "wub", "wbr", "ubr", "wurg", "ubrg"],
    draftArchetypes: ["u-artifacts", "ubr-storm", "ur-academy", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "wb-artifact-control", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubg-big-ramp", "wubg-lands-soup", "wur-artifacts", "wurg-welder"],
  },
  "42427d15-c019-4786-9d7e-285829c4f3cb": { // Signal Resonant
    tides: ["Outsiders", "Storm", "Warrior Aggro"],
    colors: ["ub", "ubr", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "br-aristocrats", "ub-tempo", "wb-weenie"],
  },
  "f4c570d4-c500-4b66-ad97-e8ccbef19392": { // Standoff
    tides: ["Outsiders"],
    colors: ["b", "wb", "ub", "ug", "br", "bg", "ubr", "ubg", "brg", "wubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-tempo", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wub-control", "wubg-artifact-control"],
  },
  "fbf32510-0bad-4567-859f-b3db6d7be5d5": { // Break the Veil
    tides: ["Discard / Madness", "Events", "Survivors"],
    colors: ["bg", "ubg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "ub-tempo", "ubg-value-midrange", "wbr-aristocrats", "wub-artifact-control", "wub-control", "wubrg-value"],
  },
  "8cb543d7-e70b-4526-b473-bb17dcaee2a7": { // Planetgazer
    tides: ["Outsiders"],
    colors: ["u", "wu", "wg", "ub", "ur", "wub", "wug", "ubr", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["ub-tempo", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "ur-storm", "wu-blink", "wu-control", "wubrg-value", "wug-value"],
  },
  "fa036c27-2234-4f76-8857-c242530627ce": { // Clockwork Conductor
    tides: ["Celestial Reverie Combo", "Cheap Characters"],
    colors: ["u", "ug", "bg", "wbr", "wbg", "ubg", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "br-aristocrats", "brg-lands-soup", "brg-midrange", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-ramp", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ur-welder", "urg-lands-soup", "wbg-midrange", "wbrg-lands-soup", "wg-lands-soup", "wr-artifact-aggro", "wu-artifact-control", "wubg-lands-soup", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "c36e67ab-fbee-4d83-b57b-34d34f60e17c": { // Shadowcaller
    tides: ["Abandon", "Discard / Madness", "Fading Farewell", "Survivors"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-midrange", "br-aristocrats", "brg-lands-soup", "brg-midrange", "ubg-tempo", "wbg-weenie", "wr-aggro"],
  },
  "3fab0780-59d4-45f1-8aac-a870ad8729ac": { // Gilded Catalyst
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "wu", "wb", "wr", "br", "wub", "wur", "wbr", "wubg", "wubrg"],
    draftArchetypes: ["ur-artifacts", "urg-artifact-control", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wubg-artifact-control", "wubr-artifact-aggro", "wur-artifact-aggro", "wur-artifacts"],
  },
  "cd7ff671-2317-4a54-b9da-acfefb90e6b0": { // The Rising God
    tides: ["Discard / Madness", "Survivors"],
    colors: ["b", "wb", "br", "bg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie"],
  },
  "48257e3e-9600-4edf-a905-e73a41ab5ec1": { // Ethereal Trailblazer
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wbg", "wrg", "urg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubrg-lands-midrange", "ug-big-ramp", "ug-lands-soup", "ug-ramp", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wubg-ramp", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "66959155-9e79-459e-afdb-eb4c0fbdeb11": { // Aspiring Guardian
    tides: ["Cindermarch / Shadow Soloist Combo", "Fading Farewell", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "wub", "wbr", "wubrg"],
    draftArchetypes: ["br-welder", "brg-midrange", "u-artifacts", "u-welder", "ur-artifacts", "ur-welder", "urg-artifact-control", "w-academy", "w-artifact-control", "w-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-weenie", "wub-artifact-control", "wub-control", "wur-artifacts"],
  },
  "acbc1ace-4f6d-45a3-8bf5-a560d1c8485b": { // Blazepath Traveler
    tides: ["Blink"],
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wur", "wug", "wbg", "wubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wg-midrange", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubrg-value", "wug-value", "wur-artifacts", "wur-control"],
  },
  "31ecf933-c897-41a5-ab94-822ea65898d8": { // Lumen Rover
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wur", "wug", "wbg", "wubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wg-midrange", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubrg-value", "wug-value", "wur-artifacts", "wur-control"],
  },
  "9d14885c-a757-40cc-b43e-87dbec7ec379": { // Forsaken Skyline
    tides: ["Abandon", "Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "rg", "ubr", "brg", "wubr", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-aristocrats", "r-burn", "ubr-control", "ur-burn", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wr-aggro", "wr-artifact-aggro", "wubrg-value", "wur-aggro"],
  },
  "4b2f044c-0afe-432a-a121-2ea785bb1182": { // Tranquil Duelist
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ug", "br", "wbr", "ubr", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "ub-storm", "ur-academy", "ur-artifacts", "ur-welder", "w-academy", "w-artifact-control", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-artifact-control", "wur-academy", "wur-artifacts", "wurg-artifacts"],
  },
  "2a6af0b8-11da-4d4b-8217-3bd7ed399dfa": { // Borrowed Minutes
    tides: ["Abandon", "Cheap Characters", "Reclaim Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["wb", "wg", "wbg", "wubg", "wbrg"],
    draftArchetypes: ["ubr-storm", "w-weenie", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts"],
  },
  "94818862-2875-4ee1-8f72-7c0cdc624202": { // Lumineth
    tides: ["Discard / Madness", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-lands-monsters", "brg-midrange", "g-big-ramp", "rg-midrange", "ubg-value-midrange", "ug-lands-soup", "ug-ramp", "ug-sneak", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wg-midrange", "wg-value-midrange", "wubg-big-ramp", "wubg-value", "wug-big-ramp", "wug-lands-soup"],
  },
  "a7820b34-9fdc-46cc-8357-53c8caa056b1": { // Mirror Protocol
    tides: ["Abandon", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "wr", "br", "wub", "wur", "wbr", "wurg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-artifact-control", "wubg-control", "wubrg-value", "wur-academy", "wur-artifacts"],
  },
  "c73f978e-8196-4589-a432-845265115555": { // Lightningborn
    tides: ["Blink"],
    core: true,
    colors: ["w", "wu", "wb", "wr", "wub", "wur", "wug", "wbr", "wubrg"],
    draftArchetypes: ["u-artifacts", "w-artifact-control", "w-weenie", "wb-value", "wb-weenie", "wbg-weenie", "wbr-aristocrats", "wbr-artifact-aggro", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubrg-lands-soup", "wubrg-value", "wur-artifacts"],
  },
  "31501d09-5dde-44f4-a938-7ca95ad988a0": { // Sorrowful Prince
    tides: ["Discard / Madness", "Warrior Aggro"],
    colors: ["r", "wu", "ur", "br", "ubr", "ubg", "brg", "wurg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ub-tempo", "ubr-control", "ubrg-storm", "ur-burn", "wbr-artifact-aggro", "wur-aggro"],
  },
  "4fe9f53e-149a-4b9f-8fac-f75560c986f2": { // Oblivion Guide
    tides: ["Discard / Madness"],
    colors: ["r", "wu", "ur", "br", "ubr", "ubg", "brg", "wurg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ub-tempo", "ubr-control", "ubrg-storm", "ur-burn", "wbr-artifact-aggro", "wur-aggro"],
  },
  "8904714c-38a9-491f-92ce-5cb5ece26ab1": { // The Grand Heist
    colors: ["w", "wu", "wb", "wub", "wur", "wug", "wbg", "wubr"],
    draftArchetypes: ["u-control", "w-artifact-aggro", "w-weenie", "wb-weenie", "wbr-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-blink", "wu-control", "wu-midrange-weenie", "wu-weenie", "wub-control", "wubg-control", "wubg-lands-soup", "wubrg-lands-soup", "wug-lands-soup", "wug-value", "wur-control"],
  },
  "764b62f6-6af9-40ad-8d1f-653cc1a11030": { // Eclipse Herald
    tides: ["Fading Farewell", "Reclaim Combo", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "ug", "br", "wub", "wbr", "ubr", "wubr", "wubg", "ubrg"],
    draftArchetypes: ["br-welder", "g-big-ramp", "r-welder", "u-artifacts", "ub-storm", "ug-ramp", "ur-artifacts", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-value-midrange", "wg-midrange", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubrg-lands-midrange", "wug-big-ramp", "wur-artifacts", "wurg-welder"],
  },
  "ec4c1ea2-067d-49e4-9d21-9de3f64a05e3": { // Horizon Follower
    tides: ["Fading Farewell", "Reclaim Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "ug", "br", "wub", "wbr", "ubr", "wubr", "wubg", "ubrg"],
    draftArchetypes: ["br-welder", "g-big-ramp", "r-welder", "u-artifacts", "ub-storm", "ug-ramp", "ur-artifacts", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-value-midrange", "wg-midrange", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubrg-lands-midrange", "wug-big-ramp", "wur-artifacts", "wurg-welder"],
  },
  "9d51dca1-28d7-4e8e-bc13-c5b665d6db72": { // Ashen Harbinger
    tides: ["Fading Farewell", "Outsiders", "Reclaim Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "ug", "br", "wub", "wbr", "ubr", "wubr", "wubg", "ubrg"],
    draftArchetypes: ["br-welder", "g-big-ramp", "r-welder", "u-artifacts", "ub-storm", "ug-ramp", "ur-artifacts", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-value-midrange", "wg-midrange", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubrg-lands-midrange", "wug-big-ramp", "wur-artifacts", "wurg-welder"],
  },
  "7def28c4-d75a-47e1-ae86-5b7093cc0419": { // Duskwall Delver
    tides: ["Abandon", "Fading Farewell", "Survivors", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "ub", "br", "bg", "wbr", "wbg", "ubg", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "ubrg-storm", "wb-weenie", "wbr-aristocrats", "wubg-control", "wubrg-value"],
  },
  "629fe4d4-826f-41b9-a913-458a503856a8": { // Saffron Trailblazer
    tides: ["Outsiders", "Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wbr", "ubr", "wubg"],
    draftArchetypes: ["br-aristocrats", "u-welder", "ubg-value-midrange", "ubr-welder", "ug-ramp", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wubrg-value"],
  },
  "76766584-a8fb-41cc-8c4b-09655f478703": { // Ebonwing
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "brg", "wbrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "g-big-ramp", "g-ramp", "ug-big-ramp", "ug-ramp", "urg-storm", "wbg-value-midrange", "wg-big-ramp", "wg-value-midrange", "wubg-big-ramp", "wubrg-lands-soup", "wug-big-ramp", "wug-value", "wurg-lands-soup"],
  },
  "46783333-78f9-4146-a8ec-0d1b81e1bf2f": { // Emerald Guardian
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wrg", "urg", "brg", "wbrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "rg-midrange", "ubrg-lands-soup", "ug-cheaty-ramp", "ug-lands-soup", "ug-ramp", "wg-midrange", "wg-ramp", "wg-value-midrange", "wubg-big-ramp", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "8951e112-92d2-4246-9859-39320620231b": { // Spirit of Smoldering Echoes
    tides: ["Events"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-reanimator", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubg-lands-soup", "wubr-artifact-aggro", "wug-value", "wurg-artifacts"],
  },
  "e26e0ac8-d6c9-4b0c-8672-4f73651f2586": { // Manufactured Abomination
    tides: ["Discard / Madness"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-reanimator", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubg-lands-soup", "wubr-artifact-aggro", "wug-value", "wurg-artifacts"],
  },
  "1bae969b-0bc4-4777-86f3-1e860d601c5c": { // Riftwalker
    tides: ["Outsiders"],
    colors: ["b", "wb", "ub", "br", "wub", "ubr", "ubg", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbr-aristocrats", "wubg-control"],
  },
  "d2c22fdc-bf86-4233-8a6b-c8a4bd418b7c": { // Aftermath Bloom
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "ub", "ur", "ug", "br", "wub", "ubr", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "ub-storm", "ubr-storm", "ur-academy", "ur-storm", "ur-welder", "w-artifact-control", "wb-artifact-control", "wbrg-lands-soup", "wr-artifacts", "wu-academy", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubg-artifacts", "wubr-welder", "wur-artifacts", "wurg-artifacts", "wurg-welder"],
  },
  "d3eb9472-f3e1-4b4c-a32f-b05c49ea4a1d": { // Evacuation Enforcer
    tides: ["Cheap Characters", "Discard / Madness", "Survivors"],
    draftArchetypes: ["br-sacrifice"],
  },
  "ce09ddfa-c349-4b32-b524-fb74444cddcb": { // Pallid Arbiter
    colors: ["w", "u", "wu", "wb", "wr", "ub", "ur", "br", "bg", "wub", "wbr", "wubrg"],
    draftArchetypes: ["u-artifacts", "w-academy", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wbrg-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-lands-soup", "wubrg-value", "wur-aggro", "wur-artifact-aggro"],
  },
  "bc1c7ea9-e47d-49b8-a93a-8185b9cb40f2": { // Melodist of the Finale
    tides: ["Abandon", "Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-lands-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "rg-midrange", "ubg-value-midrange", "ubrg-storm", "ug-big-ramp", "ug-ramp", "ug-sneak", "wbg-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wu-artifact-control", "wubg-lands-soup", "wug-value", "wurg-artifacts", "wurg-lands-soup"],
  },
  "79b37916-c05d-4818-9d67-3b90e340926e": { // Fleeting Reunion
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Storm"],
    colors: ["br", "wrg", "ubr", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-burn", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wr-artifact-aggro", "wubrg-value", "wurg-artifacts"],
  },
  "374ec185-b0f7-40e6-9988-09e96abccebe": { // Celestial Lookout
    tides: ["Abandon"],
    colors: ["g", "wg", "ug", "wug", "ubg", "urg", "wubg", "wurg", "ubrg"],
    draftArchetypes: ["g-big-ramp", "rg-lands-soup", "ubg-ramp", "ubrg-lands-soup", "ug-ramp", "wubg-artifacts", "wubg-big-ramp", "wubrg-lands-midrange", "wug-value", "wurg-artifacts", "wurg-lands-soup", "wurg-welder"],
  },
  "fb967cc1-4199-4a08-8070-724e07cebea5": { // Cascading Detonation
    tides: ["Events", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["ur", "wbr", "ubr", "wubr", "ubrg"],
    draftArchetypes: ["br-storm", "r-burn", "ubr-storm", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wr-artifact-aggro", "wubrg-value"],
  },
  "4dc2a049-d326-463b-85c7-117d5fd5ba72": { // Radiant Convergence
    tides: ["Cheap Characters", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    draftArchetypes: ["wr-vanguard"],
  },
  "2ce84a16-1295-4738-9e2d-1f57590b2269": { // Thundercatcher
    tides: ["Abandon", "Spirit Animals", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "b", "g", "wu", "wb", "wr", "ub", "ur", "br", "bg", "wbr", "wbg", "ubr", "brg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-midrange", "br-aristocrats", "brg-midrange", "g-big-ramp", "r-aggro", "ub-tempo", "ur-control", "ur-welder", "w-weenie", "wb-weenie", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-weenie", "wub-weenie", "wubr-welder", "wug-big-ramp", "wug-value", "wurg-lands-soup"],
  },
  "c97b0a5b-64d0-480f-8db7-3fde93738d86": { // Vaultbreaker
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo"],
    colors: ["wr", "br", "bg", "wrg", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-burn", "rg-lands-soup", "ur-burn", "ur-welder", "wbr-aristocrats", "wbrg-aristocrats", "wbrg-lands-soup", "wr-aggro", "wubg-lands-soup", "wubrg-lands-soup", "wur-artifacts"],
  },
  "d8c90a33-a581-469a-9fd3-9a80d1cc5315": { // Veilseeker
    tides: ["Abandon", "Cheap Characters", "Discard / Madness", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "g-big-ramp", "rg-lands-soup", "ubg-ramp", "ubrg-lands-soup", "ug-cheaty-ramp", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-lands-soup", "wg-lands-soup", "wurg-lands-soup"],
  },
  "c96c6c7f-c0fe-4272-b856-a54ace01f596": { // Veil Shatter
    tides: ["Outsiders"],
    colors: ["w", "wu", "wr", "ug", "wub", "wug", "wbr", "wubr", "wubg", "wbrg"],
    draftArchetypes: ["g-big-ramp", "w-artifact-control", "w-weenie", "wb-weenie", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-blink", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubg-artifact-control", "wubg-value", "wubr-artifact-aggro", "wubrg-value", "wug-value", "wur-artifacts", "wur-control"],
  },
  "1cbbfd57-f510-4a02-a4b3-f043a4fb99d6": { // Ochre Prospector
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "wr", "br", "wub", "wbr", "wbg", "ubr", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-welder", "u-control", "u-welder", "ubr-storm", "ubr-welder", "ur-storm", "ur-welder", "w-academy", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wubg-lands-soup", "wubr-welder", "wubrg-lands-midrange", "wubrg-value", "wur-artifacts", "wurg-welder"],
  },
  "01a8482b-5b4f-4c49-8791-2702cb5dfd3d": { // Inferno's Herald
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Fading Farewell", "Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "g", "wu", "wb", "wr", "ug", "wug", "wbr", "ubr", "urg", "wubg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-welder", "u-artifacts", "ubr-welder", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-midrange", "wbg-value-midrange", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-artifact-control", "wur-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "c6ae1899-c94c-464f-8edb-4a0b1ec2c981": { // Knowledge Restored
    tides: ["Discard / Madness"],
    colors: ["u", "wu", "ub", "ur", "ug", "wur", "ubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wu-control", "wubrg-value", "wug-value", "wur-aggro", "wur-control", "wurg-lands-soup"],
  },
  "7697da0e-d759-4c75-8c9c-477e9058b035": { // Apocalypse Vigilante
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "ub", "br", "wub", "wbr", "wubr", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "br-welder", "u-artifacts", "ubr-storm", "ur-welder", "w-weenie", "wb-weenie", "wbr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-weenie", "wubr-welder"],
  },
  "43628666-2ecd-47a7-b2c0-241cda0de5e8": { // Void Pilgrim
    tides: ["Discard / Madness"],
    colors: ["w", "u", "wu", "wb", "wr", "ub", "br", "wub", "wbr", "wbg", "brg", "wurg", "wubrg"],
    draftArchetypes: ["b-tempo", "br-aristocrats", "br-welder", "r-aggro", "r-burn", "ub-tempo", "ubr-control", "ug-cheaty-ramp", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wg-midrange", "wr-aggro", "wu-artifact-control", "wu-midrange-weenie", "wubr-artifact-aggro", "wubr-welder", "wubrg-value"],
  },
  "b5a5c1ba-4784-4829-aa08-af9f8f41ebb7": { // Starbound Striker
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wur", "wbr", "wubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifact-control", "u-artifacts", "ubg-value-midrange", "ur-academy", "ur-welder", "w-artifact-control", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-weenie", "wur-artifacts"],
  },
  "886c9d49-b25f-4ddd-97f0-2ec4b42eda89": { // Prism Caller
    tides: ["Cheap Characters", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "wr", "wub", "wur", "wbr", "wubg", "wubrg"],
    draftArchetypes: ["ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-value", "wb-weenie", "wbg-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-weenie", "wub-artifact-control", "wubrg-value", "wur-artifacts"],
  },
  "f07dfe42-566c-4e91-a250-9e2781e9d06f": { // Flamestride Rider
    tides: ["Warrior Aggro"],
    colors: ["w", "wu", "wb", "wr", "br", "wub", "wbr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wubg-artifact-control", "wubg-control", "wubr-welder", "wur-academy", "wur-artifacts"],
  },
  "8367b757-c3d2-4c22-9043-8baadee1c5ba": { // Invoker of Myths
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "wu", "wb", "wr", "br", "wub", "wbr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wubg-artifact-control", "wubg-control", "wubr-welder", "wur-academy", "wur-artifacts"],
  },
  "1654d50f-815d-4172-b46b-8baa34a124db": { // Cragfall
    tides: ["Outsiders"],
    colors: ["u", "wu", "ub", "ur", "ug", "bg", "wub", "ubr", "wubrg"],
    draftArchetypes: ["rg-lands-soup", "u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-tempo", "ubg-tempo", "ubr-control", "ubr-storm", "ug-lands-midrange", "ug-ramp", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubg-value", "wubrg-value", "wug-lands-soup", "wug-value", "wur-academy", "wur-control"],
  },
  "f0165a60-df1c-41db-87bb-a784c26835a5": { // Blazebound Sentinel
    tides: ["Spirit Animals"],
    colors: ["g", "ug", "bg", "rg", "wug", "wbg", "brg", "wurg", "wubrg"],
    draftArchetypes: ["bg-aristocrats", "bg-lands-midrange", "bg-midrange", "brg-lands-monsters", "g-big-ramp", "g-lands-soup", "rg-midrange", "ubg-ramp", "ubrg-lands-soup", "ug-big-ramp", "ug-cheaty-ramp", "ug-lands-soup", "ug-ramp", "wg-big-ramp", "wg-ramp", "wubg-ramp", "wubrg-value", "wug-value", "wurg-artifacts"],
  },
  "475fcc5b-c82d-4ef7-8020-90a8aeb2df53": { // Break the Sequence
    tides: ["Outsiders"],
    colors: ["u", "g", "wu", "ub", "ur", "ug", "wub", "wur", "wug", "ubr", "ubg", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-tempo", "ubg-lands-soup", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "wu-blink", "wu-control", "wub-control", "wubg-lands-soup", "wubrg-lands-soup", "wubrg-value", "wug-value"],
  },
  "86fd585b-e9d0-4dc1-bce9-488014b9316d": { // Cloudmantle Ray
    tides: ["Blink", "Cindermarch / Shadow Soloist Combo", "Reclaim Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "urg", "brg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "g-big-ramp", "rg-lands-soup", "rg-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "urg-sneak", "wbg-midrange", "wbrg-lands-soup", "wg-midrange", "wg-ramp", "wubg-big-ramp", "wubg-value-midrange", "wubrg-lands-midrange", "wug-value"],
  },
  "01d53e49-7833-4122-a970-b72c73ad2c28": { // Crimson Pilgrimage
    colors: ["u", "ur", "ubr", "urg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["ubr-control", "ubr-storm", "ubrg-lands-soup", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-storm", "wubrg-value", "wurg-lands-soup"],
  },
  "78599234-6054-4df1-8e79-c38782517f9a": { // Sundown Surfer
    core: true,
    colors: ["w", "r", "wu", "wb", "wr", "ur", "br", "wub", "wur", "wug", "wbr", "wbg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["br-welder", "r-aggro", "ur-welder", "w-academy", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wub-weenie", "wurg-welder"],
  },
  "81074582-dfb3-497c-8c04-f97a24d6b1d4": { // Pit Descender
    tides: ["Abandon", "Cheap Characters", "Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Warrior Aggro", "Warrior Combo"],
    colors: ["u", "r", "wr", "ub", "ur", "br", "wur", "wbr", "ubr"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-aggro", "u-artifacts", "ubr-welder", "ur-artifacts", "ur-welder", "wr-artifact-aggro", "wr-artifacts", "wu-artifacts", "wubg-artifact-control", "wubr-welder", "wur-artifacts", "wurg-artifacts", "wurg-welder"],
  },
  "4a8bdcd7-cf88-48d4-80d0-a83fd6617d81": { // Roots of Rebirth
    tides: ["Blink", "Cheap Characters", "Spirit Animals"],
    colors: ["g", "wg", "ug", "rg", "wug", "wbg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "g-big-ramp", "ubg-value-midrange", "ug-ramp", "wbg-midrange", "wbg-value-midrange", "wg-big-ramp", "wg-midrange", "wubg-artifact-control", "wubg-ramp", "wug-value", "wurg-lands-soup"],
  },
  "7709ea42-d73a-4d6b-b8b3-e3f66f44e9ea": { // Apocalypse
    colors: ["wb", "wub", "wbr", "ubr", "brg", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "bg-midrange", "br-aristocrats", "ub-tempo", "ubrg-lands-soup", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wub-control", "wubg-big-ramp", "wubg-value-midrange"],
  },
  "0f1ac858-a28a-489b-9dd4-4d28f8f1abf5": { // Skyborne Jellyfish
    tides: ["Celestial Reverie Combo", "Cheap Characters", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "urg", "brg", "wubr", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-midrange", "brg-lands-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "ubg-ramp", "ubrg-lands-soup", "ug-big-ramp", "ug-ramp", "urg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-big-ramp", "wubrg-lands-midrange", "wug-value", "wur-artifacts", "wurg-lands-soup"],
  },
  "1b341984-d32e-42a7-ae56-b22059c59737": { // Wreckheap Survivor
    tides: ["Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "ubg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-reanimator", "ub-tempo", "ubr-control", "wb-aristocrats", "wb-weenie", "wbr-aristocrats", "wubg-control"],
  },
  "33874387-2490-48ed-93bc-a47a16e399ad": { // Soulbinder
    tides: ["Abandon", "Discard / Madness", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["r", "ur", "br", "wrg", "ubr", "brg", "wubr", "wbrg"],
    draftArchetypes: ["brg-lands-soup", "rg-lands-soup", "ubrg-lands-soup", "urg-storm", "wbr-aristocrats", "wbrg-lands-soup", "wr-artifacts"],
  },
  "9495f501-f627-4b74-a848-b3d928641229": { // Emberwatch Veteran
    tides: ["Discard / Madness", "Survivors"],
    colors: ["br", "bg", "ubr", "ubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "brg-lands-monsters", "ub-reanimator", "ub-tempo", "wb-weenie", "wbg-weenie", "wg-midrange"],
  },
  "d55d9fd8-ad2d-41f4-aa7f-5958432f00aa": { // Vessel of Echoes
    tides: ["Discard / Madness", "Survivors"],
    colors: ["br", "bg", "ubr", "ubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "brg-lands-monsters", "ub-reanimator", "ub-tempo", "wb-weenie", "wbg-weenie", "wg-midrange"],
  },
  "20896b2e-59cc-4494-942c-eb95b75adaf9": { // Hope's Vanguard
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["br", "bg", "wub", "wbg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "brg-midrange", "wb-weenie", "wbg-weenie", "wbrg-aristocrats", "wubrg-value"],
  },
  "99101fce-f2b4-4032-b999-317ce3e4a6dd": { // Keeper of the Tides
    tides: ["Outsiders"],
    colors: ["u", "wu", "ub", "ur", "wub", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-control", "ub-tempo", "ubr-control", "ug-ramp", "ur-storm", "ur-welder", "wb-weenie", "wu-blink", "wu-control", "wub-control", "wug-value", "wur-artifacts"],
  },
  "123baf70-305a-4583-bdba-a10b5153fbeb": { // Dustborn Veteran
    tides: ["Abandon", "Survivors"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-tempo", "ubr-storm", "wb-weenie", "wbg-weenie", "wbr-aristocrats", "wbrg-aristocrats"],
  },
  "4b20e66e-2466-4518-8ef9-67f580bd6f14": { // Looming Oracle
    tides: ["Blink"],
    core: true,
    colors: ["w", "wu", "wb", "wg", "wub", "wug", "wubg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["ubg-lands-soup", "w-artifact-control", "w-weenie", "wbrg-lands-soup", "wg-midrange", "wg-value-midrange", "wu-academy", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wug-value"],
  },
  "2d0a7c62-29b5-433b-9b0e-c3dd7630ccc7": { // Packcaller of Shadows
    tides: ["Abandon", "Storm"],
    colors: ["g", "wg", "ug", "bg", "rg", "wbg", "ubr", "ubg", "urg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["brg-midrange", "g-big-ramp", "u-storm", "ubr-storm", "ubrg-storm", "ur-storm", "urg-storm", "wbrg-aristocrats", "wurg-artifacts"],
  },
  "7fb4b7f5-0dfc-4151-8a88-82f822960b61": { // Boundless Wanderer
    tides: ["Outsiders", "Spirit Animals", "Storm", "Warrior Aggro"],
    colors: ["w", "wb", "wr", "br", "rg", "wbr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["ur-spellslinger", "w-artifact-control", "w-weenie", "wb-weenie", "wbrg-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-big-ramp", "wug-big-ramp"],
  },
  "4f7cb174-6324-46a8-9973-44adfa7fef9f": { // Field Reverent
    tides: ["Celestial Reverie Combo", "Spirit Animals", "Storm", "Warrior Aggro"],
    colors: ["w", "wb", "wr", "br", "rg", "wbr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["ur-spellslinger", "w-artifact-control", "w-weenie", "wb-weenie", "wbrg-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-big-ramp", "wug-big-ramp"],
  },
  "491e4233-0911-46ed-bced-0498e69b5bba": { // Conjured Zenith
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo"],
    colors: ["w", "wu", "wb", "wr", "br", "wub", "wbr", "wbg", "wubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["b-weenie", "bg-midrange", "w-weenie", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wu-control", "wub-artifact-control", "wub-control", "wubrg-value", "wur-aggro"],
  },
  "691883df-63d8-4664-a1fe-d5f3b5becd11": { // Dawnhorn Elder
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "rg", "wug", "wbg", "ubg", "urg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-lands-monsters", "g-big-ramp", "ubg-ramp", "ug-lands-midrange", "ug-ramp", "wbg-midrange", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-ramp", "wug-value"],
  },
  "680abf68-d7bb-47cf-885a-d808dc0a8e09": { // Embersummoner
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo"],
    colors: ["r", "g", "ug", "bg", "wug", "wbg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-midrange", "g-big-ramp", "ubr-control", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wg-midrange", "wubg-value-midrange", "wubrg-value"],
  },
  "35c3e8cb-dc59-4f5c-98c8-fd764fb36d2b": { // Shardwoven Tyrant
    tides: ["Abandon"],
    colors: ["r", "g", "ug", "bg", "wug", "wbg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-midrange", "g-big-ramp", "ubr-control", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wg-midrange", "wubg-value-midrange", "wubrg-value"],
  },
  "7df5255e-bf23-4c14-b31b-be89fb864ee0": { // Grounded
    tides: ["Events", "Outsiders"],
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wug", "wbg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["brg-lands-soup", "rg-lands-soup", "w-artifact-aggro", "w-weenie", "wb-value", "wb-weenie", "wbg-midrange", "wbrg-lands-soup", "wg-lands-soup", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wu-blink", "wu-control", "wub-control", "wubg-artifact-control", "wubrg-lands-soup", "wubrg-value", "wug-value", "wur-control", "wurg-lands-soup"],
  },
  "3076694f-ffc2-46c9-8e1a-39f3878c73c9": { // Through the Rift
    tides: ["Spirit Animals"],
    colors: ["w", "wu", "wb", "wg", "ug", "wub", "wbr", "wbg", "ubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-aristocrats", "wb-weenie", "wbr-aristocrats", "wbrg-aristocrats", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-big-ramp", "wubg-lands-soup", "wubrg-lands-soup", "wug-lands-soup", "wur-artifacts", "wur-control"],
  },
  "60feb0d0-89b8-48fc-b01a-ce54e2c9941f": { // Twilight Suppressor
    tides: ["Abandon", "Celestial Reverie Combo", "Reclaim Combo", "Warrior Combo"],
    colors: ["wb", "ub", "ur", "br", "wbr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "ur-welder", "w-weenie", "wb-weenie", "wbg-midrange", "wbr-aristocrats", "wu-artifact-control", "wu-artifacts", "wub-control", "wubrg-value", "wurg-artifacts"],
  },
  "b957466e-f748-4a95-89b2-8509dc762223": { // Iconoclast
    tides: ["Discard / Madness", "Storm"],
    colors: ["r", "wr", "ur", "br", "rg", "ubr", "urg", "wurg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "brg-midrange", "r-burn", "ub-storm", "ubr-storm", "ur-academy", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wr-aggro", "wur-academy", "wur-artifacts"],
  },
  "91d9afed-ea29-43af-9021-0f3ecbdc252e": { // Starcatcher
    tides: ["Events", "Storm"],
    colors: ["r", "wr", "ur", "br", "rg", "ubr", "urg", "wurg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "brg-midrange", "r-burn", "ub-storm", "ubr-storm", "ur-academy", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wr-aggro", "wur-academy", "wur-artifacts"],
  },
  "6b1c0e39-0e70-4061-b037-0e10026cfabb": { // Seedling Sage
    tides: ["Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["w", "u", "wu", "wr", "ub", "bg", "wub", "wbr", "wubrg"],
    draftArchetypes: ["u-artifacts", "ubg-value-midrange", "ubrg-lands-soup", "ur-spellslinger", "w-academy", "w-artifact-aggro", "w-weenie", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wub-artifact-control", "wubg-value-midrange", "wubr-welder", "wubrg-value", "wur-academy", "wurg-artifacts"],
  },
  "570895fe-cd21-45d2-89ff-162f46978776": { // Starfall Communion
    tides: ["Discard / Madness"],
    colors: ["wr", "ub", "ur", "br", "rg", "wur", "wbr", "ubr", "brg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "brg-lands-midrange", "brg-midrange", "r-burn", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wr-aggro", "wur-aggro", "wur-artifact-aggro"],
  },
  "06f8cfff-92ec-4668-afbc-f33a274c3b1a": { // Fractured Veil
    tides: ["Discard / Madness"],
    colors: ["u", "wu", "ub", "ur", "ug", "wug", "ubr", "wubg", "ubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "wu-artifact-control", "wu-blink", "wub-control", "wubg-lands-soup", "wubrg-value", "wug-value", "wur-control", "wurg-welder"],
  },
  "cc1c1acd-f0ff-46cc-94d9-401b9daf253f": { // Forgotten Factory Titan
    tides: ["Blink", "Celestial Reverie Combo"],
    colors: ["w", "wu", "wr", "wg", "wub", "wbr", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wbg-weenie", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-blink", "wu-midrange-weenie", "wub-control", "wubrg-value", "wug-value"],
  },
  "f4b34207-2ad4-421b-8798-9c20320607ae": { // The Power Within
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["wu", "ub", "ur", "wub", "wur", "wug", "ubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "g-big-ramp", "u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-storm", "wub-artifact-control", "wub-control", "wug-value", "wur-artifacts", "wur-control"],
  },
  "55340736-7fc5-4555-8f47-081d770a6e8d": { // Ironclad Holdout
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ur", "br", "wub", "wur", "wug", "wbr", "wubg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "ug-sneak", "ur-artifacts", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wubrg-value", "wur-academy"],
  },
  "57bb1572-6075-4efd-a592-102b134132fd": { // Inspiring Templar
    tides: ["Warrior Aggro"],
    colors: ["u", "r", "wu", "wr", "ub", "wub", "ubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "ur-storm", "ur-welder", "urg-artifact-control", "w-academy", "w-artifact-control", "w-weenie", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-artifact-control", "wubr-artifact-aggro", "wur-academy", "wur-artifact-aggro"],
  },
  "ad76c77a-e456-4e59-bbf7-6bcb56f892ee": { // Ethereal Courser
    tides: ["Blink", "Celestial Reverie Combo", "Outsiders"],
    colors: ["g", "wu", "wg", "ur", "ug", "wug", "wbr", "ubr", "wubg", "wurg"],
    draftArchetypes: ["ubg-value-midrange", "ug-ramp", "wb-value", "wu-artifact-control", "wubrg-value", "wug-value", "wur-artifacts", "wur-control"],
  },
  "7f550d4e-c6a1-4e5e-ae0c-1b3edd6f0f4a": { // Stoneborn Eternal
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "brg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "g-big-ramp", "ubg-value-midrange", "ug-ramp", "wbg-midrange", "wg-big-ramp", "wg-midrange", "wu-artifact-control"],
  },
  "f7b135ea-4894-46ab-b41d-ba2f74b070a1": { // A New Adventure
    tides: ["Discard / Madness", "Storm"],
    colors: ["u", "ub", "ur", "ug", "wug", "ubr", "urg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-storm", "ug-ramp", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wubrg-value", "wur-control"],
  },
  "69d9e550-eacc-49f2-8cc5-30b8940c9eed": { // Dragonward
    tides: ["Blink", "Cheap Characters"],
    colors: ["r", "wr", "ur", "br", "rg", "wur", "urg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "r-aggro", "r-aristocrats", "r-burn", "ubr-control", "ubrg-lands-soup", "ur-burn", "ur-control", "ur-spellslinger", "ur-welder", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wurg-lands-soup"],
  },
  "2e8571c0-4faf-4e7a-a702-26952d2035ee": { // Soulreaver
    tides: ["Abandon", "Celestial Reverie Combo", "Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "brg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-tempo", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wubg-control", "wubrg-value"],
  },
  "6b739127-1a23-4c5d-877a-8829dd7a8b8c": { // Entropy Spike
    tides: ["Abandon"],
    colors: ["b", "wb", "br", "bg", "wub", "wbr", "wbg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "wb-aristocrats", "wb-weenie", "wbg-weenie"],
  },
  "1658d9a0-c3b0-4eb7-babc-4933acf362c4": { // Glimpse of Infinity
    tides: ["Cindermarch / Shadow Soloist Combo", "Storm", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "b", "g", "wu", "wb", "wr", "ur", "ug", "br", "wub", "wug", "wbr", "ubr", "ubg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "br-aristocrats", "g-big-ramp", "g-ramp", "r-burn", "rg-midrange", "u-artifacts", "u-control", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "w-artifact-aggro", "w-artifact-control", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbrg-lands-soup", "wg-midrange", "wr-aggro", "wu-academy", "wub-artifact-control", "wub-control", "wubg-big-ramp", "wubrg-value", "wug-lands-soup", "wug-value", "wur-artifacts"],
  },
  "af739e3d-bc61-4fab-bf81-a22e78d7e524": { // Silent Gatherer
    tides: ["Discard / Madness", "Storm"],
    colors: ["ur", "br", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "ubg-value-midrange", "ur-burn", "ur-control", "ur-spellslinger", "wbg-value-midrange", "wubg-value-midrange", "wur-artifacts"],
  },
  "69552516-14bc-42b9-b4b6-3a0cdc29686b": { // Archive of the Forgotten
    tides: ["Events", "Storm"],
    colors: ["ub", "ur", "ubr", "brg", "wubrg"],
    draftArchetypes: ["br-storm", "r-aristocrats", "r-burn", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-storm", "wurg-artifacts"],
  },
  "ccbefadc-aab8-4f8c-a705-07bd70c91731": { // Mirrorlight Architect
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["w", "wu", "wg", "ur", "wur", "wbr", "wbg"],
    draftArchetypes: ["ubg-value-midrange", "ur-burn", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wubg-value-midrange", "wubrg-value", "wug-value"],
  },
  "c11eb833-a45b-4983-949d-848039d0504c": { // Shadowprowler
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "rg", "wbr", "ubr", "brg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "rg-midrange", "ubrg-storm", "ur-burn", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wur-aggro", "wurg-lands-soup"],
  },
  "9a18d375-1b6d-4df4-95ec-c7c5c3f36379": { // Pattern Seeker
    tides: ["Discard / Madness", "Storm"],
    colors: ["r", "wr", "ur", "br", "rg", "wbr", "ubr", "brg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "rg-midrange", "ubrg-storm", "ur-burn", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wur-aggro", "wurg-lands-soup"],
  },
  "54471b31-4449-453d-9a6e-814d6225520a": { // Shadow March
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "wu", "wb", "wr", "wbr", "wbg", "wubg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "u-welder", "urg-lands-soup", "wb-weenie", "wbg-value-midrange", "wbrg-lands-soup", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-lands-soup", "wubrg-lands-soup", "wubrg-value", "wug-value", "wur-artifacts"],
  },
  "2d180bd7-4cc7-49fb-b76c-0990656cedc0": { // Ashborn Necromancer
    tides: ["Abandon", "Reclaim Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "wbr", "wbg", "ubr", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange-reanimator", "br-aristocrats", "brg-midrange", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie"],
  },
  "fb41a90e-279c-419c-80fc-7c3469ba0c74": { // Lord of Hidden Paths
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "br", "wug", "wbg", "wrg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "ug-big-ramp", "ug-ramp", "wbg-weenie", "wbrg-aristocrats", "wbrg-lands-soup", "wg-ramp", "wubg-big-ramp", "wubg-ramp", "wubrg-value", "wug-big-ramp"],
  },
  "5aaf13de-25bc-467f-a4a0-fe2c4373cc9f": { // Prophet of the Consumed
    tides: ["Blink", "Celestial Reverie Combo", "Cheap Characters", "Storm"],
    colors: ["ur", "ug", "bg", "wub", "ubg", "urg", "wubr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-soup", "ug-lands-midrange", "ug-ramp", "ur-storm", "urg-lands-soup", "wg-lands-soup", "wubg-ramp", "wubrg-lands-soup", "wug-value"],
  },
  "37d9165f-2b3a-44a2-848b-401cf4466a7c": { // Silent Avenger
    tides: ["Abandon", "Celestial Reverie Combo", "Discard / Madness", "Fading Farewell", "Reclaim Combo", "Storm", "Survivors", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "wubg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-storm", "w-weenie", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wub-control", "wubg-control"],
  },
  "faadc87f-98fe-4a58-b1a9-a7c0cff70e08": { // Wandering Archivist
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness"],
    colors: ["wr", "wg", "ur", "br", "wbr", "ubr", "urg", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-control", "ur-spellslinger", "ur-storm", "wr-aggro"],
  },
  "d1c25546-dcf2-481e-8f00-9afef3adf24b": { // Rubble Diviner
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness"],
    colors: ["wr", "wg", "ur", "br", "wbr", "ubr", "urg", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-control", "ur-spellslinger", "ur-storm", "wr-aggro"],
  },
  "95d37f76-eb3d-4bcd-a8af-0ae37feabd4d": { // Veilpiercer
    tides: ["Blink"],
    colors: ["wu", "wug", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["ug-ramp", "ur-storm", "wg-midrange", "wu-artifact-control", "wu-artifacts", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wubg-ramp", "wubg-value-midrange", "wug-value", "wur-control", "wurg-lands-soup"],
  },
  "06a4709d-fbef-4ea2-aa5e-caa2beac80ab": { // Ridge Vortex Explorer
    tides: ["Discard / Madness"],
    colors: ["g", "rg", "wug", "wbg", "ubr", "ubg", "brg", "ubrg"],
    draftArchetypes: ["bg-midrange", "brg-lands-midrange", "wubrg-value"],
  },
  "8451340c-02c5-465a-8c25-51efb2dc857a": { // Crumbling Behemoth
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "brg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-lands-monsters", "g-big-ramp", "g-lands-soup", "g-ramp", "ubg-tempo", "ug-ramp", "wg-midrange", "wg-value-midrange", "wubg-lands-soup", "wubg-value", "wug-big-ramp", "wug-value", "wurg-lands-soup"],
  },
  "331e2846-85d1-4667-8c64-dc6c21a418ed": { // Beacon of Tomorrow
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    core: true,
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "brg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-lands-monsters", "g-big-ramp", "g-lands-soup", "g-ramp", "ubg-tempo", "ug-ramp", "wg-midrange", "wg-value-midrange", "wubg-lands-soup", "wubg-value", "wug-big-ramp", "wug-value", "wurg-lands-soup"],
  },
  "4e1c0192-2649-489f-aad3-75ff2887c0a7": { // Twilight Reclaimer
    tides: ["Abandon", "Survivors"],
    colors: ["b", "wb", "br", "bg", "wbg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "wb-weenie", "wbg-weenie", "wbrg-aristocrats"],
  },
  "4733876a-d6b1-48d2-b322-5f71aee9f3d6": { // Cinderfang
    tides: ["Abandon", "Survivors", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "bg", "wbg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "wb-weenie", "wbg-weenie", "wbrg-aristocrats"],
  },
  "49641e8e-93a8-46cb-92a9-246b0fd57899": { // Harvester of Despair
    tides: ["Abandon", "Survivors", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "bg", "wub", "wbg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "br-aristocrats", "brg-lands-midrange", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wg-value-midrange", "wubrg-value"],
  },
  "881e3a5f-280f-413a-b927-352aeb3bda71": { // Emberfang
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "r", "g", "wu", "wb", "wr", "wg", "ub", "ur", "br", "bg", "wub", "wbr", "ubr", "ubrg"],
    draftArchetypes: ["b-tempo", "br-aristocrats", "g-big-ramp", "r-burn", "u-artifacts", "u-big-mana-artifacts", "u-welder", "ubg-value-midrange", "ubr-storm", "ug-ramp", "ur-storm", "ur-welder", "urg-storm", "w-academy", "w-artifact-control", "w-weenie", "wb-aristocrats", "wb-weenie", "wbr-aristocrats", "wg-midrange", "wr-artifact-aggro", "wu-artifact-control", "wub-control", "wub-weenie", "wubr-welder", "wug-value", "wur-artifacts", "wurg-lands-soup"],
  },
  "0637b453-4362-4f01-b3e6-07c27af9c847": { // Herald of the Last Light
    tides: ["Abandon", "Warrior Combo"],
    colors: ["b", "br", "bg", "wbg", "brg", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "ubr-welder", "wb-weenie", "wbg-midrange", "wbg-weenie", "wbrg-aristocrats", "wubg-control", "wubg-value-midrange"],
  },
  "cc98441a-a8f9-421f-9895-423bd7fc31b4": { // Starfall
    tides: ["Storm"],
    colors: ["b", "wb", "ub", "ur", "bg", "wub", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-midrange", "br-aristocrats", "br-storm", "ub-storm", "ub-tempo", "ubr-storm", "ur-storm", "wb-aristocrats", "wb-weenie"],
  },
  "fc0c6f10-8864-4660-904a-8e90d261c6ef": { // Demonbane
    tides: ["Abandon"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wur", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifacts", "ubg-tempo", "ubg-value-midrange", "ug-ramp", "ur-academy", "ur-welder", "w-academy", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-value-midrange", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wubg-artifact-control", "wubrg-value", "wur-academy", "wurg-artifacts"],
  },
  "cd4d689d-1442-4a19-8e6a-182b425d066d": { // Warfield Stalwart
    tides: ["Abandon"],
    colors: ["w", "wb", "br", "wub", "wbr", "wbg", "wubg"],
    draftArchetypes: ["b-weenie", "wb-aristocrats", "wb-value", "wb-weenie", "wbg-value-midrange", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-artifact-control", "wubg-control", "wubrg-value"],
  },
  "a424b91a-8c3c-4f96-8ac9-8bbbbbbd28b5": { // Ambush Operative
    tides: ["Blink", "Outsiders"],
    core: true,
    colors: ["w", "wu", "wb", "wg", "wub", "wbr", "wbg", "wrg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["ur-control", "w-artifact-control", "w-weenie", "wb-aristocrats", "wb-artifact-control", "wb-weenie", "wbg-weenie", "wbr-artifact-aggro", "wg-midrange", "wg-value-midrange", "wr-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubrg-value", "wug-value", "wur-aggro", "wur-control"],
  },
  "1d92e103-8415-433d-97d6-ac8a83660b34": { // Searcher in the Mists
    tides: ["Abandon", "Discard / Madness", "Storm", "Survivors"],
    colors: ["b", "br", "bg", "wub", "wbg", "ubg", "brg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "ub-tempo", "ubg-lands-soup", "ubg-tempo", "wb-weenie", "wbg-weenie", "wub-control", "wubrg-value"],
  },
  "c92a7dc0-04b0-4c54-9485-59a92505eabc": { // Blade of Unity
    tides: ["Reclaim Combo"],
    colors: ["w", "u", "wu", "wb", "wg", "ub", "ur", "ug", "br", "wub", "wug", "wbr", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "brg-midrange", "r-aggro", "u-artifact-control", "u-artifacts", "ub-storm", "ug-ramp", "ur-artifacts", "ur-burn", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wbr-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubr-welder", "wur-academy"],
  },
  "f7084ba7-8c85-4847-80df-b0c98ec77d78": { // Carrion Shepherd
    tides: ["Abandon"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "wbg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "ub-tempo", "ubg-tempo", "wb-weenie", "wbg-value-midrange"],
  },
  "cf173b05-7bf2-465b-91e2-41f213c536d1": { // Phantasmal Recruiter
    tides: ["Abandon", "Warrior Aggro", "Warrior Combo"],
    colors: ["wb", "wg", "br", "wbr", "wbg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["wb-weenie", "wr-artifacts", "wur-artifacts"],
  },
  "58f0dba2-1bf9-4cb3-bb5d-e1b6e3067a6c": { // Duskmount
    tides: ["Blink", "Cindermarch / Shadow Soloist Combo", "Outsiders"],
    colors: ["w", "wu", "wub", "wug", "wubg", "wubrg"],
    draftArchetypes: ["urg-lands-soup", "w-weenie", "wu-blink", "wu-control", "wubg-lands-soup", "wubg-value-midrange", "wug-lands-soup", "wug-value", "wur-artifacts", "wurg-lands-soup"],
  },
  "409147ec-d959-4f66-b126-564702e2cd4a": { // Veil of the Wastes
    tides: ["Discard / Madness", "Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wbr", "wbg", "ubr", "ubg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ubg-tempo", "ubg-value-midrange", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wubg-value-midrange"],
  },
  "29088c75-c2c9-40dc-a77a-65360e464b45": { // Abolish
    core: true,
    colors: ["u", "wu", "ub", "ur", "wub", "wug", "ubr", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "urg-sneak", "urg-storm", "wu-artifact-control", "wu-blink", "wu-control", "wub-control", "wubg-lands-soup", "wubg-value", "wug-value", "wur-control"],
  },
  "bedee263-27b9-4d73-ab77-6b5c747dff69": { // Wasteland Arbitrator
    tides: ["Discard / Madness", "Survivors"],
    colors: ["b", "wb", "br", "bg", "wbr", "ubr", "brg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-tempo", "wb-aristocrats", "wb-weenie", "wubg-lands-soup"],
  },
  "0bddeb19-ff49-4a77-bc06-955377ba3ed1": { // Blade of Oblivion
    tides: ["Abandon", "Discard / Madness"],
    colors: ["r", "wu", "ur", "ug", "ubr", "wubrg"],
    draftArchetypes: ["ub-storm", "ubr-storm", "ur-spellslinger", "ur-storm", "ur-welder", "wr-artifact-aggro", "wu-artifacts", "wubrg-lands-soup", "wubrg-value", "wur-academy", "wurg-welder"],
  },
  "be6a2712-cfe3-4d61-b62c-fab8990786a1": { // Wolfbond Chieftain
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    draftArchetypes: ["wr-warriors"],
  },
  "33cf7dca-d8d2-42b7-854a-b3f503b03488": { // Lumin-Gate Seer
    tides: ["Celestial Reverie Combo", "Cheap Characters"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "ubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "ug-big-ramp", "ug-ramp", "wg-ramp", "wubg-ramp", "wug-value"],
  },
  "77f31db4-0397-49a7-8886-f5459ee960e9": { // Soulrender
    tides: ["Abandon", "Celestial Reverie Combo", "Fading Farewell", "Reclaim Combo", "Survivors", "Warrior Combo"],
    colors: ["b", "ur", "ug", "wbr", "wbg", "brg", "wubr", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "brg-midrange", "ubg-tempo", "ubr-welder", "ur-burn", "ur-welder", "wb-weenie", "wbg-value-midrange", "wr-artifacts", "wu-artifact-control", "wub-control"],
  },
  "426825c7-7259-41af-ac1c-c042b878d69b": { // Burning Revenant
    tides: ["Abandon", "Fading Farewell", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wur", "wbr", "ubr", "wubrg"],
    draftArchetypes: ["br-welder", "u-artifact-control", "u-artifacts", "u-welder", "ubg-tempo", "ubr-welder", "ur-academy", "ur-artifacts", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbr-artifact-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wub-weenie", "wur-artifacts", "wurg-artifacts"],
  },
  "7e2f2ac0-4e3c-4520-80c6-c830581b40de": { // Eternal Sentry
    tides: ["Discard / Madness"],
    colors: ["ub", "ur", "bg", "wub", "ubr", "ubg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["g-big-ramp", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-ramp", "ur-welder", "wub-control"],
  },
  "87aba308-00b4-40d8-a46f-4e6f58a664a8": { // Breach Artist
    tides: ["Blink", "Outsiders"],
    colors: ["u", "ub", "ur", "wub", "ubr", "ubg", "wurg", "wubrg"],
    draftArchetypes: ["ub-tempo", "ubg-value-midrange", "ur-burn", "urg-storm", "wubg-control", "wug-value", "wur-control"],
  },
  "fd355778-abea-4513-844c-91bf75929ebe": { // Dune Reaper
    tides: ["Abandon", "Discard / Madness", "Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "b", "wu", "wb", "ub", "br", "bg", "wub", "wbr", "ubr", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "rg-midrange", "ubg-tempo", "ubg-value-midrange", "w-artifact-control", "w-weenie", "wb-weenie", "wbr-aristocrats", "wbr-artifact-aggro", "wr-artifact-aggro", "wu-weenie", "wub-artifact-control", "wur-artifacts"],
  },
  "0d848dc8-a1a2-410b-b19a-b5f65375e141": { // Path to Redemption
    tides: ["Abandon", "Reclaim Combo", "Storm", "Survivors"],
    colors: ["ur", "wbr", "ubr", "wubg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-aristocrats", "br-aristocrats", "br-storm", "ub-storm", "ubr-storm", "ur-storm", "urg-storm", "wubg-control", "wubg-value-midrange", "wubrg-value"],
  },
  "97b359ee-5a7a-4f54-bd65-e6221a893208": { // Pyrokinetic Surge
    tides: ["Discard / Madness"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbg", "ubr", "ubg", "wubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-midrange", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ubrg-storm", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wubg-value-midrange"],
  },
  "b64f0beb-6ba4-4559-b6ab-091c2f60a613": { // Infernal Cavalier
    tides: ["Abandon", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wr", "ub", "br", "wub", "wbr", "ubr", "wubrg"],
    draftArchetypes: ["br-welder", "ubr-welder", "ur-academy", "ur-welder", "urg-artifact-control", "w-artifact-aggro", "w-artifact-control", "wbg-value-midrange", "wbr-artifact-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-weenie", "wur-artifacts", "wurg-artifacts"],
  },
  "4752fc43-6696-4bc3-88d0-4d5b97622fa8": { // From the Barrow
    tides: ["Discard / Madness", "Events", "Storm"],
    colors: ["ur", "ubr", "wurg", "ubrg"],
    draftArchetypes: ["bg-aristocrats", "br-storm", "brg-midrange", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wur-artifacts"],
  },
  "831bc7cf-e8c9-4943-8156-91b7397ef849": { // Resilient Wanderer
    tides: ["Abandon", "Discard / Madness", "Survivors", "Wake the Fallen / Shadow March Combo"],
    colors: ["wr", "ub", "bg", "ubr", "ubg", "brg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ur-spellslinger", "wub-control", "wubg-big-ramp", "wubg-lands-soup", "wubg-value-midrange", "wubrg-value"],
  },
  "6497d8b1-85b8-486d-99e2-5c141486d508": { // Dreadmount Sovereign
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wr", "ub", "ur", "ug", "wub", "wur", "wbr", "ubr", "wubr"],
    draftArchetypes: ["r-welder", "u-artifact-control", "u-artifacts", "u-welder", "ub-storm", "ur-artifacts", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubr-artifact-aggro", "wubrg-value", "wur-academy", "wur-artifact-aggro", "wur-artifacts"],
  },
  "1b4d2adc-64ab-4020-bae6-b35321898bf0": { // Sigil Analyst
    tides: ["Blink", "Warrior Aggro", "Warrior Combo"],
    core: true,
    colors: ["w", "u", "wu", "wr", "ub", "ur", "ug", "wub", "wur", "wbr", "ubr", "wubr"],
    draftArchetypes: ["r-welder", "u-artifact-control", "u-artifacts", "u-welder", "ub-storm", "ur-artifacts", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubr-artifact-aggro", "wubrg-value", "wur-academy", "wur-artifact-aggro", "wur-artifacts"],
  },
  "a56e0f68-30b6-404e-9b83-a7584177f21e": { // Immolate
    core: true,
    colors: ["w", "wu", "wb", "ub", "ur", "br", "bg", "wub", "wbr", "wbg", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-aristocrats", "bg-midrange", "br-aristocrats", "brg-midrange", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-lands-midrange", "urg-storm", "wb-weenie", "wbg-value-midrange", "wu-control", "wub-control", "wubg-artifact-control", "wubg-value-midrange", "wubr-artifact-aggro"],
  },
  "995c570b-2d86-4f6f-8f02-dd0902e32fcd": { // Ashlight Caller
    tides: ["Discard / Madness", "Events"],
    draftArchetypes: ["ub-madness"],
  },
  "07ceb104-0b27-473a-bc72-e6225479ed83": { // Stoneborn Leviathan
    tides: ["Blink", "Spirit Animals"],
    draftArchetypes: ["gu-blink"],
  },
  "7b55efd1-6d9f-4156-9de7-1c71ccc410cb": { // Stolen Genesis
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "ubr", "ubg", "brg", "wbrg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "bg-midrange", "br-aristocrats", "br-welder", "ub-tempo", "ubr-storm", "ubr-welder", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wbrg-aristocrats", "wub-control", "wubg-big-ramp", "wubg-control", "wubg-value-midrange"],
  },
  "eae700c9-5005-4627-b8d6-a5c2c273e61a": { // Secrets of the Deep
    colors: ["wb", "ub", "br", "wbg", "ubr", "ubg", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["b-weenie", "bg-midrange", "br-aristocrats", "ub-tempo", "ubr-control", "wb-weenie", "wubg-value-midrange", "wubrg-value"],
  },
  "8f69312f-4bec-4671-99da-e752ec6d4cbc": { // Desperation
    colors: ["r", "ur", "ug", "br", "rg", "ubr", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-midrange", "brg-midrange", "r-aristocrats", "r-burn", "ubr-storm", "ubrg-lands-soup", "ur-burn", "ur-spellslinger", "ur-storm", "urg-artifact-control", "wbr-aristocrats", "wur-aggro", "wur-artifacts", "wurg-lands-soup"],
  },
  "56f019a8-6b77-4bcb-bfa6-37b94e188ead": { // Rootspring Summons
    colors: ["u", "ub", "ur", "ug", "wub", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "urg-sneak", "wu-control", "wub-artifact-control", "wub-control"],
  },
  "75bf1aab-dce0-4bbc-8ab0-a3c84b66ae9a": { // Iron Executor
    colors: ["w", "r", "wu", "wb", "wr", "ub", "wub", "wbr", "wrg", "wurg", "wubrg"],
    draftArchetypes: ["bg-midrange", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wub-artifact-control", "wubrg-value", "wur-artifact-aggro"],
  },
  "8a8af982-d1a1-42a0-9229-5e3af13e8dbe": { // Eruption
    colors: ["r", "ur", "rg", "urg", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "br-aristocrats", "r-aggro", "r-burn", "rg-lands-soup", "rg-midrange", "ubr-control", "ur-academy", "ur-spellslinger", "ur-welder", "urg-lands-soup", "urg-sneak", "urg-storm", "wbrg-aristocrats", "wbrg-lands-soup", "wr-aggro", "wr-artifacts", "wubrg-lands-soup"],
  },
  "9e9efbc0-d438-48a9-9551-85c93fb33f3e": { // Lithic Severance
    colors: ["w", "wu", "wb", "wg", "wub", "wug", "wbg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifacts", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wubg-artifact-control", "wubg-value", "wubg-value-midrange", "wubrg-value", "wug-value"],
  },
};
