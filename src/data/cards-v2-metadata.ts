// Draft-pool metadata for the experimental cards_v2 pool, keyed by card name.
//
// The `idf3` pool variant (the standard algorithm) reads none of this — it works
// from the bundled real decklists plus each Dreamcaller's signature alone. These
// fields exist only for the other `?algo=` variants (`default`, `diverse`,
// `decklists`, `merged`): `core` flags an always-included staple, `tides` supply
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
  "Gatebound Warden": {
    colors: ["w", "wu", "wb", "wr", "wub", "wur", "wug", "wbr", "wbg", "wurg", "wubrg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-weenie", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-control", "wub-artifact-control", "wub-control", "wubrg-value", "wug-value", "wur-control"],
  },
  "Starlight Guide": {
    tides: ["Blink", "Outsiders"],
    colors: ["w", "wu", "wb", "wr", "wub", "wur", "wug", "wbr", "wbg", "wurg", "wubrg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-weenie", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-control", "wub-artifact-control", "wub-control", "wubrg-value", "wug-value", "wur-control"],
  },
  "Miraculous Arrival": {
    colors: ["u", "wu", "ub", "ur", "wur", "wug", "ubr", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-storm", "ub-tempo", "ubr-storm", "ur-spellslinger", "ur-storm", "urg-storm", "wur-control"],
  },
  "Driftcaller Sovereign": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["w", "g", "wg", "ug", "bg", "rg", "wub", "wug", "wbg", "ubg", "urg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "g-big-ramp", "g-ramp", "rg-midrange", "ubg-value-midrange", "ubrg-lands-midrange", "ug-big-ramp", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-big-ramp", "wubg-value", "wubrg-lands-midrange", "wug-lands-soup", "wug-value", "wurg-artifacts"],
  },
  "Passage Through Oblivion": {
    tides: ["Blink", "Spirit Animals"],
    colors: ["w", "wu", "wr", "wg", "wub", "wug", "wbg", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wr-aggro", "wu-artifact-control", "wu-blink", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubg-value", "wug-value"],
  },
  "Graywatch": {
    tides: ["Survivors"],
    colors: ["b", "br", "bg", "ubg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-tempo", "ubg-value-midrange", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wubg-value-midrange"],
  },
  "Wheel of the Heavens": {
    tides: ["Discard / Madness"],
    colors: ["w", "u", "g", "wu", "ub", "ur", "ug", "wub", "ubr", "urg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "urg-storm", "wu-academy", "wu-artifact-control", "wu-control", "wub-control", "wubg-lands-soup", "wug-value"],
  },
  "Chronicle Reclaimer": {
    tides: ["Discard / Madness"],
    colors: ["u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wug", "wbr", "ubr", "wubr", "ubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "brg-midrange", "u-artifacts", "w-artifact-aggro", "w-weenie", "wb-artifact-control", "wbrg-lands-soup", "wg-ramp", "wu-artifact-control", "wub-artifact-control", "wubg-artifacts", "wubr-artifact-aggro"],
  },
  "Radiants' Captain": {
    tides: ["Discard / Madness"],
    colors: ["u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wug", "wbr", "ubr", "wubr", "ubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "brg-midrange", "u-artifacts", "w-artifact-aggro", "w-weenie", "wb-artifact-control", "wbrg-lands-soup", "wg-ramp", "wu-artifact-control", "wub-artifact-control", "wubg-artifacts", "wubr-artifact-aggro"],
  },
  "The Deathsworn": {
    tides: ["Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "br", "ubr", "brg", "wubr", "wubrg"],
    draftArchetypes: ["br-welder", "u-artifacts", "ur-artifacts", "ur-welder", "urg-artifact-control", "w-academy", "w-artifact-control", "wb-artifact-control", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-artifact-control", "wur-artifacts"],
  },
  "Arc Gate Opening": {
    tides: ["Storm"],
    colors: ["ur", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "ubr-storm", "ubrg-storm", "ur-burn", "ur-storm", "urg-storm", "wr-aggro"],
  },
  "Moonlit Voyage": {
    core: true,
    colors: ["b", "wb", "ub", "ur", "br", "wub", "wbr", "wbg", "ubr", "ubg", "brg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "br-welder", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ur-storm", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wubrg-value"],
  },
  "Spirit Bond": {
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "br", "bg", "wbg", "ubg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "ubrg-lands-soup", "ug-big-ramp", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wg-midrange", "wug-big-ramp"],
  },
  "Fading Farewell": {
    tides: ["Abandon", "Fading Farewell"],
    colors: ["w", "wu", "wb", "wr", "ur", "wur", "wubr", "wubrg"],
    draftArchetypes: ["w-weenie", "wbr-aristocrats", "wbrg-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-control", "wu-weenie", "wubg-lands-soup", "wubrg-value"],
  },
  "Luminwings": {
    tides: ["Spirit Animals"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "br", "wub", "wbr", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifact-control", "u-artifacts", "ubr-storm", "ubr-welder", "ur-burn", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-aristocrats", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-artifacts", "wubr-artifact-aggro", "wubrg-lands-soup", "wur-artifacts", "wurg-artifacts"],
  },
  "Gearwright": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Events", "Storm"],
    colors: ["wur", "wbr", "wubg", "wubrg"],
    draftArchetypes: ["ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wbrg-aristocrats", "wr-aggro", "wubr-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "Shadow Soloist": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Events", "Storm"],
    colors: ["wur", "wbr", "wubg", "wubrg"],
    draftArchetypes: ["ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wbrg-aristocrats", "wr-aggro", "wubr-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "Moonlit Dancer": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Events", "Storm"],
    colors: ["wur", "wbr", "wubg", "wubrg"],
    draftArchetypes: ["ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wbrg-aristocrats", "wr-aggro", "wubr-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "Call to the Unknown": {
    tides: ["Blink", "Celestial Reverie Combo"],
    colors: ["w", "wb", "wr", "wg", "wub", "wug", "wbg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["w-weenie", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wu-control", "wub-artifact-control", "wubg-lands-soup", "wubg-ramp", "wubrg-value"],
  },
  "Door to Possibility": {
    tides: ["Abandon", "Events", "Reclaim Combo"],
    colors: ["b", "ub", "br", "bg", "wub", "wbg", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-weenie", "br-aristocrats", "ub-storm", "ub-tempo", "ubr-storm", "ur-storm", "urg-lands-soup", "wb-aristocrats", "wb-weenie", "wub-control"],
  },
  "Reclaimer of Lost Paths": {
    tides: ["Cheap Characters", "Reclaim Combo"],
    colors: ["w", "wu", "wb", "wr", "wg", "wbr", "wbg", "wubg", "wubrg"],
    draftArchetypes: ["w-weenie", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wub-control", "wubg-value", "wubrg-value", "wug-value", "wur-artifacts"],
  },
  "Flagbearer of Decay": {
    tides: ["Discard / Madness"],
    colors: ["wu", "wr", "ub", "ur", "br", "wub", "ubr", "brg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "br-welder", "ur-spellslinger", "ur-storm", "ur-welder", "wr-aggro", "wu-artifact-control", "wub-artifact-control", "wubg-value-midrange", "wubrg-value"],
  },
  "Pathwalker": {
    tides: ["Abandon", "Cheap Characters", "Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Events", "Survivors"],
    colors: ["ug", "bg", "ubg", "urg", "brg", "wubg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "bg-midrange", "brg-lands-midrange", "g-lands-soup", "rg-lands-soup", "ubg-lands-soup", "ubg-ramp", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wg-lands-soup", "wg-ramp", "wubg-lands-soup", "wubrg-lands-midrange"],
  },
  "Scrap Reclaimer": {
    tides: ["Cheap Characters", "Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Survivors"],
    colors: ["ug", "bg", "ubg", "urg", "brg", "wubg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "bg-midrange", "brg-lands-midrange", "g-lands-soup", "rg-lands-soup", "ubg-lands-soup", "ubg-ramp", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wg-lands-soup", "wg-ramp", "wubg-lands-soup", "wubrg-lands-midrange"],
  },
  "Arc Disciple": {
    tides: ["Abandon", "Fading Farewell", "Reclaim Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "wg", "ub", "ur", "wub", "wug", "wbr", "wbg", "ubr", "wubr", "wubg"],
    draftArchetypes: ["br-aristocrats", "brg-midrange", "ur-welder", "wb-weenie", "wbg-weenie", "wbrg-aristocrats", "wg-value-midrange", "wr-artifact-aggro", "wu-academy", "wub-artifact-control", "wubg-control", "wubg-value-midrange", "wur-artifacts"],
  },
  "Echo Architect": {
    tides: ["Events", "Storm"],
    colors: ["r", "ur", "wbr", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "r-burn", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wr-aggro", "wubrg-value"],
  },
  "Oracle of Shifting Skies": {
    tides: ["Events", "Outsiders", "Storm"],
    colors: ["wr", "ur", "br", "wur", "ubr", "urg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "r-welder", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wbr-aristocrats", "wr-aggro", "wubr-artifact-aggro", "wur-aggro"],
  },
  "Architect of Memory": {
    tides: ["Discard / Madness"],
    colors: ["wr", "ur", "br", "wur", "ubr", "urg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "r-welder", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wbr-aristocrats", "wr-aggro", "wubr-artifact-aggro", "wur-aggro"],
  },
  "Dusk Duelist": {
    tides: ["Blink"],
    core: true,
    colors: ["g", "wg", "ug", "bg", "rg", "wbg", "ubg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "g-big-ramp", "rg-lands-soup", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-big-ramp", "ug-ramp", "wbg-value-midrange", "wg-midrange", "wg-ramp", "wug-lands-soup", "wug-value"],
  },
  "Molten Duel": {
    tides: ["Abandon", "Events", "Outsiders", "Reclaim Combo", "Spirit Animals", "Storm"],
    core: true,
    colors: ["w", "r", "wb", "wr", "ub", "ur", "br", "rg", "wur", "wbr", "ubr", "urg", "brg", "wubr", "wubg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "r-welder", "rg-midrange", "ubr-control", "ubr-storm", "ubrg-storm", "ur-academy", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wubrg-value", "wur-control"],
  },
  "Unbroken": {
    tides: ["Discard / Madness"],
    colors: ["ur", "br", "rg", "wbr", "ubr", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "r-aggro", "r-aristocrats", "r-burn", "ubr-control", "ubr-storm", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "wr-aggro", "wubrg-value"],
  },
  "Bloomweaver": {
    tides: ["Celestial Reverie Combo", "Cheap Characters"],
    colors: ["g", "wg", "ug", "bg", "rg", "wbg", "wrg", "urg", "brg", "wubr", "wubg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-lands-monsters", "brg-lands-soup", "brg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "u-storm", "ubg-value-midrange", "ubr-storm", "ug-lands-soup", "ug-ramp", "ur-storm", "urg-lands-soup", "urg-storm", "wbrg-lands-soup", "wg-lands-soup", "wg-midrange", "wg-ramp", "wubg-lands-soup", "wubrg-lands-soup"],
  },
  "Spirit Field Reclaimer": {
    colors: ["w", "wu", "wb", "wr", "wg", "wbr", "wbg", "wubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["r-welder", "ur-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-artifact-control", "wubg-value-midrange", "wurg-welder"],
  },
  "Pathfinder Adrift": {
    tides: ["Discard / Madness", "Events"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "ubr", "ubrg"],
    draftArchetypes: ["b-tempo", "u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-ramp", "ug-sneak", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "urg-sneak", "urg-storm", "wr-aggro", "wu-blink", "wu-control", "wub-control", "wubg-control", "wubg-value-midrange", "wur-control"],
  },
  "Woodland Apparition": {
    colors: ["r", "wr", "br", "rg", "ubr", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "r-welder", "rg-midrange", "ubr-control", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "wr-aggro", "wr-artifact-aggro", "wubrg-value"],
  },
  "Wasteland Holdout": {
    colors: ["w", "wu", "wb", "wr", "wbr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-value", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wbr-artifact-aggro", "wg-midrange", "wg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wub-artifact-control", "wubr-artifact-aggro", "wubrg-value", "wurg-artifacts"],
  },
  "Curio Dealer": {
    tides: ["Discard / Madness", "Reclaim Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "g-big-ramp", "ubg-ramp", "ubrg-lands-soup", "ug-big-ramp", "ug-ramp", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wg-value-midrange", "wub-control", "wubg-big-ramp", "wubg-control", "wubg-value", "wubg-value-midrange", "wug-value"],
  },
  "Moment Rewound": {
    core: true,
    colors: ["u", "g", "wu", "ub", "ur", "ug", "wub", "wug", "wbr", "ubr", "ubg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "g-big-ramp", "r-burn", "u-artifacts", "ub-tempo", "ubg-lands-soup", "ubr-control", "ubr-storm", "ug-lands-soup", "ug-ramp", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "w-weenie", "wbrg-lands-soup", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-artifacts", "wubg-big-ramp", "wubg-value", "wubrg-value", "wug-lands-soup", "wug-value", "wur-control"],
  },
  "Starsea Traveler": {
    tides: ["Celestial Reverie Combo", "Cheap Characters"],
    colors: ["g", "wg", "ug", "bg", "rg", "wbg", "wrg", "ubg", "urg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "bg-midrange", "brg-lands-monsters", "brg-midrange", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-ramp", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wubg-lands-soup", "wubrg-lands-soup", "wug-big-ramp", "wug-lands-soup", "wug-value"],
  },
  "The Waking Titan": {
    tides: ["Events"],
    colors: ["r", "wu", "ur", "wbr", "ubr", "wubg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ubrg-storm", "ug-sneak", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wub-control", "wur-control"],
  },
  "Duskshore Virtuoso": {
    tides: ["Events"],
    colors: ["r", "wu", "ur", "wbr", "ubr", "wubg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ubrg-storm", "ug-sneak", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wub-control", "wur-control"],
  },
  "Sylvan Matriarch": {
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "ubg-value-midrange", "ug-big-ramp", "ug-lands-soup", "ug-ramp", "wbg-midrange", "wbg-value-midrange", "wg-big-ramp", "wg-midrange", "wubg-big-ramp", "wubrg-value", "wug-lands-soup", "wug-value", "wurg-welder"],
  },
  "Starshot Gunner": {
    tides: ["Abandon", "Warrior Combo"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "ur-welder", "w-academy", "wu-artifact-control", "wub-artifact-control", "wub-control", "wur-academy", "wur-artifacts", "wur-control", "wurg-artifacts"],
  },
  "Desolation's Edge": {
    tides: ["Cheap Characters"],
    colors: ["u", "wg", "wbr", "wbg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifact-control", "ubr-control", "ubrg-storm", "ur-burn", "ur-storm", "ur-welder", "urg-lands-soup", "wbrg-aristocrats", "wr-artifacts", "wu-artifacts", "wub-artifact-control", "wubg-control", "wubrg-lands-midrange", "wur-control"],
  },
  "Soulflame Predator": {
    colors: ["w", "wu", "wr", "wg", "wubg", "wubrg"],
    draftArchetypes: ["w-weenie", "wb-weenie", "wr-aggro", "wr-artifacts", "wu-blink", "wu-midrange-weenie", "wub-control", "wubg-control", "wubrg-value", "wug-value"],
  },
  "Nomad of Endless Paths": {
    tides: ["Blink", "Celestial Reverie Combo", "Outsiders"],
    core: true,
    colors: ["w", "wu", "wr", "wg", "wubg", "wubrg"],
    draftArchetypes: ["w-weenie", "wb-weenie", "wr-aggro", "wr-artifacts", "wu-blink", "wu-midrange-weenie", "wub-control", "wubg-control", "wubrg-value", "wug-value"],
  },
  "Conduit of Ashes": {
    tides: ["Abandon", "Cheap Characters", "Cindermarch / Shadow Soloist Combo", "Fading Farewell", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "wr", "ub", "ur", "ug", "br", "wub", "wbr", "wbg", "ubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "u-artifacts", "ub-storm", "ubr-storm", "ur-academy", "ur-storm", "ur-welder", "w-artifact-control", "w-weenie", "wb-weenie", "wu-artifact-control", "wub-artifact-control", "wubrg-value", "wur-artifacts", "wurg-artifacts"],
  },
  "Ghostlight Wolves": {
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "wrg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "ug-lands-soup", "ug-ramp", "wbrg-lands-soup", "wg-big-ramp", "wubg-big-ramp", "wubg-ramp", "wubrg-value", "wurg-lands-soup"],
  },
  "Eternal Stag": {
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "wrg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "ug-lands-soup", "ug-ramp", "wbrg-lands-soup", "wg-big-ramp", "wubg-big-ramp", "wubg-ramp", "wubrg-value", "wurg-lands-soup"],
  },
  "Avatar of Cosmic Reckoning": {
    tides: ["Abandon", "Fading Farewell", "Reclaim Combo", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["b", "wb", "br", "wub", "wbr", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "br-welder", "ubg-value-midrange", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wbrg-aristocrats", "wu-artifacts", "wub-artifact-control", "wubg-artifact-control", "wubg-value-midrange"],
  },
  "Ashen Remnant": {
    tides: ["Abandon", "Discard / Madness", "Reclaim Combo", "Spirit Animals", "Survivors"],
    colors: ["b", "g", "wb", "ug", "br", "bg", "rg", "wbr", "wbg", "wrg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-big-ramp", "bg-lands-midrange", "bg-midrange", "bg-midrange-reanimator", "brg-lands-monsters", "ub-storm", "ubg-tempo", "wb-aristocrats", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wub-control", "wubg-artifact-control", "wubg-big-ramp", "wubg-control", "wubg-value"],
  },
  "The Dread Sovereign": {
    tides: ["Abandon", "Reclaim Combo", "Spirit Animals"],
    colors: ["b", "g", "wb", "ug", "br", "bg", "rg", "wbr", "wbg", "wrg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-big-ramp", "bg-lands-midrange", "bg-midrange", "bg-midrange-reanimator", "brg-lands-monsters", "ub-storm", "ubg-tempo", "wb-aristocrats", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wub-control", "wubg-artifact-control", "wubg-big-ramp", "wubg-control", "wubg-value"],
  },
  "Spent Courier": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["r", "wr", "ub", "ur", "br", "wbr", "ubr", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-welder", "ubr-welder", "ur-academy", "ur-burn", "ur-control", "ur-welder", "wbr-aristocrats", "wubg-artifact-control", "wubrg-value", "wur-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "Ironclad Marksman": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["u", "wu", "wr", "ub", "ur", "ug", "wur", "wbr", "ubr", "urg", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifacts", "ur-storm", "ur-welder", "urg-artifact-control", "wu-academy", "wu-artifact-control", "wu-artifacts", "wu-control", "wub-artifact-control", "wur-artifacts"],
  },
  "Last Light Herald": {
    tides: ["Outsiders", "Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wur", "wbr", "ubr", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "br-welder", "r-welder", "u-artifact-control", "u-artifacts", "u-welder", "ur-artifacts", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-weenie", "wubg-artifacts", "wubr-artifact-aggro", "wubr-welder", "wur-academy", "wur-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "Skyflame Commander": {
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wur", "wbr", "ubr", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "br-welder", "r-welder", "u-artifact-control", "u-artifacts", "u-welder", "ur-artifacts", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-weenie", "wubg-artifacts", "wubr-artifact-aggro", "wubr-welder", "wur-academy", "wur-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "Verdant Wayfarer": {
    tides: ["Blink", "Discard / Madness", "Survivors"],
    colors: ["r", "wg", "ur", "br", "rg", "ubr", "brg", "wbrg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "ubg-tempo", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wubrg-value", "wur-aggro"],
  },
  "Urban Cipher": {
    tides: ["Blink", "Discard / Madness", "Survivors"],
    colors: ["r", "wg", "ur", "br", "rg", "ubr", "brg", "wbrg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "ubg-tempo", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wubrg-value", "wur-aggro"],
  },
  "Crucible Warlord": {
    tides: ["Warrior Aggro"],
    colors: ["w", "wu", "wb", "wr", "wub", "wug", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubg-value", "wubr-welder", "wug-value", "wur-artifacts"],
  },
  "Stargazer Adrift": {
    tides: ["Abandon", "Reclaim Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "wbr", "wbg", "brg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wubg-value", "wubrg-value"],
  },
  "Starrunner": {
    tides: ["Abandon", "Reclaim Combo", "Spirit Animals", "Wake the Fallen / Shadow March Combo"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-big-ramp", "g-ramp", "ubg-ramp", "ubrg-storm", "ug-lands-soup", "ug-ramp", "wbg-midrange", "wg-big-ramp", "wubg-value", "wug-big-ramp", "wug-value"],
  },
  "Weblight Waif": {
    tides: ["Events"],
    colors: ["r", "wr", "ur", "ubr", "urg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wbr-artifact-aggro", "wr-aggro", "wubrg-value", "wur-aggro"],
  },
  "Scuttled Fortune": {
    tides: ["Abandon"],
    colors: ["b", "br", "bg", "wbr", "wbg", "brg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-storm", "ubrg-lands-soup", "wb-weenie", "wbg-value-midrange", "wbrg-aristocrats", "wubg-value"],
  },
  "Key to the Moment": {
    tides: ["Blink", "Celestial Reverie Combo", "Warrior Aggro"],
    colors: ["u", "wu", "ub", "ur", "ug", "wbr", "ubr", "urg", "wubg", "wubrg"],
    draftArchetypes: ["u-artifact-control", "ub-storm", "ub-tempo", "ubr-storm", "ur-storm", "wubrg-value", "wur-artifacts", "wurg-artifacts"],
  },
  "Momentum of the Fallen": {
    tides: ["Events"],
    colors: ["u", "wu", "ub", "ur", "wub", "wur", "wug", "ubr", "wubr", "wubg"],
    draftArchetypes: ["u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wu-artifact-control", "wu-blink", "wu-control", "wug-value", "wur-control"],
  },
  "Abomination of Memory": {
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["g", "ug", "bg", "rg", "wug", "wbg", "wrg", "urg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-soup", "brg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubg-ramp", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wubg-lands-soup", "wubrg-lands-soup", "wug-big-ramp", "wug-lands-soup"],
  },
  "Fathomless Maw": {
    tides: ["Abandon", "Cheap Characters", "Fading Farewell", "Reclaim Combo", "Storm", "Survivors", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["r", "br", "wbr", "ubr", "brg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "brg-lands-monsters", "brg-lands-soup", "brg-midrange"],
  },
  "Kindlehorn": {
    tides: ["Abandon", "Cheap Characters", "Reclaim Combo", "Storm", "Survivors", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["r", "br", "wbr", "ubr", "brg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "brg-lands-monsters", "brg-lands-soup", "brg-midrange"],
  },
  "Headtaker Wurm": {
    tides: ["Outsiders"],
    colors: ["wu", "ub", "ur", "wub", "ubr", "ubg", "urg"],
    draftArchetypes: ["u-artifacts", "u-storm", "ub-tempo", "ubg-value-midrange", "ubrg-lands-soup", "ubrg-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-sneak", "wu-blink", "wu-control", "wub-control", "wubg-lands-soup", "wug-value", "wur-control"],
  },
  "Skull Weaver": {
    tides: ["Abandon", "Fading Farewell", "Reclaim Combo", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["b", "wb", "br", "bg", "wbr", "brg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "wb-weenie", "wubg-control", "wubg-value-midrange"],
  },
  "Fragments of Vision": {
    tides: ["Events"],
    core: true,
    colors: ["wu", "ub", "ur", "ug", "wub", "ubr", "ubg", "urg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-storm", "wug-lands-soup", "wug-value"],
  },
  "Sunken Radiance": {
    tides: ["Discard / Madness", "Events", "Survivors"],
    colors: ["r", "wr", "ur", "br", "rg", "wub", "wrg", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-spellslinger", "ur-storm", "wr-artifacts", "wur-control"],
  },
  "Salvage Engine": {
    tides: ["Discard / Madness"],
    colors: ["ub", "br", "wub", "ubg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "ub-tempo", "ubg-tempo", "ubrg-lands-soup", "wb-weenie"],
  },
  "Cosmonaut of Tides": {
    tides: ["Events", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["wu", "ub", "ur", "ug", "wub", "ubr", "wubg", "wurg"],
    draftArchetypes: ["u-big-mana-artifacts", "u-storm", "ubr-storm", "ug-ramp", "ur-academy", "ur-burn", "ur-spellslinger", "ur-storm", "wr-artifact-aggro", "wu-control", "wubg-value-midrange", "wur-control"],
  },
  "Thronebound Arbiter": {
    tides: ["Blink", "Outsiders"],
    colors: ["ub", "wub", "ubr", "brg", "wubrg"],
    draftArchetypes: ["brg-midrange", "ub-storm", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "wub-control", "wur-control"],
  },
  "Epiphany Unfolded": {
    tides: ["Events", "Storm"],
    core: true,
    colors: ["w", "u", "g", "wu", "ub", "ur", "ug", "wub", "wug", "ubr", "ubg", "urg", "brg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["brg-lands-soup", "g-big-ramp", "g-ramp", "u-big-mana-artifacts", "u-welder", "ub-reanimator", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ug-ramp", "ug-sneak", "ur-artifacts", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "urg-artifact-control", "w-weenie", "wb-weenie", "wu-artifact-control", "wu-artifacts", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wubg-lands-soup", "wubrg-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "Scorched Reckoning": {
    tides: ["Events"],
    core: true,
    colors: ["r", "wr", "ur", "br", "rg", "wur", "ubr", "urg", "brg", "wubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-aristocrats", "r-burn", "rg-midrange", "ubr-control", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wr-aggro", "wur-academy"],
  },
  "Saltless Mariner": {
    tides: ["Abandon", "Reclaim Combo", "Survivors", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["b", "wr", "ur", "br", "wub", "wbr", "wbg", "brg", "wubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "r-aggro", "r-burn", "ubr-welder", "ur-burn", "ur-storm", "wbr-aristocrats", "wbr-artifact-aggro", "wbrg-aristocrats", "wr-aggro", "wu-artifacts"],
  },
  "Obliterator of Worlds": {
    tides: ["Abandon", "Reclaim Combo", "Survivors", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["b", "wr", "ur", "br", "wub", "wbr", "wbg", "brg", "wubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "r-aggro", "r-burn", "ubr-welder", "ur-burn", "ur-storm", "wbr-aristocrats", "wbr-artifact-aggro", "wbrg-aristocrats", "wr-aggro", "wu-artifacts"],
  },
  "Vault Infiltrator": {
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "wu", "wr", "wub", "wbr", "wubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wubr-artifact-aggro", "wubr-welder", "wur-artifacts", "wurg-artifacts"],
  },
  "Grim Reclaimer": {
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Warrior Combo"],
    colors: ["u", "r", "wu", "wr", "ub", "ur", "ug", "wub", "wubrg"],
    draftArchetypes: ["r-welder", "u-artifacts", "u-welder", "ur-storm", "ur-welder", "w-artifact-control", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wubg-artifact-control", "wubg-control", "wur-academy", "wur-artifact-aggro", "wur-artifacts", "wurg-welder"],
  },
  "Voidsire": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["u", "r", "wu", "wr", "ub", "ur", "ug", "wub", "wubrg"],
    draftArchetypes: ["r-welder", "u-artifacts", "u-welder", "ur-storm", "ur-welder", "w-artifact-control", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wubg-artifact-control", "wubg-control", "wur-academy", "wur-artifact-aggro", "wur-artifacts", "wurg-welder"],
  },
  "Pilgrim of Old Stones": {
    tides: ["Blink", "Outsiders"],
    core: true,
    colors: ["wu", "ub", "ur", "ug", "wug", "ubr", "wubg", "ubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-tempo", "ubrg-lands-soup", "ug-ramp", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "wu-academy", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wug-value", "wur-control"],
  },
  "Echoes of the Journey": {
    tides: ["Events", "Storm"],
    colors: ["u", "ur", "ug", "wub", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["ub-storm", "ubr-storm", "ur-storm", "ur-welder", "urg-storm", "wu-artifact-control"],
  },
  "Torn Circuit Feeder": {
    tides: ["Reclaim Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["g", "wb", "wg", "ug", "wug", "wbg", "wrg", "ubg", "brg", "wubg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-midrange", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wbrg-lands-soup", "wg-midrange", "wg-value-midrange", "wr-aggro", "wubg-big-ramp", "wubg-lands-soup", "wubrg-lands-soup", "wubrg-value", "wug-big-ramp"],
  },
  "Mother of Flames": {
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["brg-lands-midrange", "brg-lands-soup", "g-big-ramp", "rg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ug-ramp", "urg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-ramp", "wug-value", "wur-control"],
  },
  "Dreadwood Emissary": {
    tides: ["Events", "Outsiders", "Storm"],
    colors: ["wu", "ub", "ur", "ug", "wub", "ubr", "ubg", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wu-blink", "wu-control", "wub-control", "wubrg-value", "wug-value", "wur-aggro"],
  },
  "Part the Veil": {
    tides: ["Discard / Madness", "Survivors"],
    colors: ["ur", "br", "ubr", "brg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aristocrats", "r-burn", "ubr-control", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm"],
  },
  "Grotto Seer": {
    tides: ["Discard / Madness", "Survivors"],
    colors: ["ur", "br", "ubr", "brg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aristocrats", "r-burn", "ubr-control", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm"],
  },
  "Ordained Collapse": {
    tides: ["Cheap Characters", "Warrior Combo"],
    colors: ["br", "wbr", "ubr", "urg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "g-big-ramp", "rg-lands-soup", "ubrg-lands-soup", "ug-lands-midrange", "ur-spellslinger", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wg-ramp", "wubg-artifact-control", "wubg-control", "wug-lands-soup", "wur-control"],
  },
  "Annular Recall": {
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "ubr", "urg", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-storm", "ub-tempo", "ubr-storm", "ug-ramp", "ug-sneak", "ur-burn", "ur-storm", "urg-sneak", "wug-value", "wur-control"],
  },
  "Seeker for the Way": {
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "wbr", "ubg", "brg", "wubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-aggro", "r-burn", "r-welder", "ur-welder", "wbr-artifact-aggro", "wr-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wurg-welder"],
  },
  "Inverted Reflection": {
    tides: ["Events"],
    colors: ["u", "ub", "ur", "ug", "bg", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-artifact-control", "u-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wu-artifact-control", "wub-artifact-control", "wur-artifacts"],
  },
  "Minstrel of Falling Light": {
    tides: ["Discard / Madness", "Events"],
    colors: ["ur", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wubrg-value", "wurg-welder"],
  },
  "Key Sifter": {
    tides: ["Discard / Madness"],
    colors: ["ur", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wubrg-value", "wurg-welder"],
  },
  "Return to Nowhere": {
    core: true,
    colors: ["wr", "ur", "wur", "ubr", "wbrg", "wubrg"],
    draftArchetypes: ["br-storm", "r-burn", "ub-storm", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ubrg-storm", "ug-lands-midrange", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "urg-sneak", "wubg-lands-soup", "wubrg-lands-soup", "wur-academy", "wur-artifacts", "wur-control"],
  },
  "Terminus": {
    tides: ["Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals", "Storm", "Warrior Combo"],
    colors: ["wu", "ub", "ur", "ug", "wub", "wur", "ubr", "wubg", "ubrg"],
    draftArchetypes: ["rg-lands-soup", "ub-storm", "ub-tempo", "ubg-tempo", "ubr-storm", "ur-storm", "wubg-ramp", "wur-control"],
  },
  "Enginespeaker": {
    tides: ["Outsiders", "Reclaim Combo", "Wake the Fallen / Shadow March Combo", "Warrior Aggro"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "br-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wu-artifact-control", "wub-control", "wubg-value-midrange"],
  },
  "Starchaser": {
    tides: ["Spirit Animals"],
    colors: ["w", "g", "wu", "wg", "ug", "bg", "wug", "wbg", "wrg", "urg", "brg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubrg-lands-soup", "ug-ramp", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wg-ramp", "wg-value-midrange", "wubg-big-ramp", "wubg-value", "wug-lands-soup", "wug-value", "wurg-artifacts"],
  },
  "Sunset Chapel Rest": {
    core: true,
    colors: ["u", "wu", "ur", "ug", "wur", "ubr"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-control", "u-storm", "ub-tempo", "ubr-storm", "ug-lands-midrange", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wu-academy", "wu-blink", "wub-control", "wubrg-lands-soup", "wur-artifacts"],
  },
  "Shadowbinder": {
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo"],
    colors: ["r", "ur", "br", "wbr", "ubr", "brg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "ur-burn", "ur-storm", "wr-aggro", "wr-artifact-aggro", "wur-artifacts"],
  },
  "Keeper of the Lightpath": {
    tides: ["Events"],
    colors: ["r", "ur", "br", "wbr", "ubr", "brg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "ur-burn", "ur-storm", "wr-aggro", "wr-artifact-aggro", "wur-artifacts"],
  },
  "Pyrewatcher": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "ur", "rg", "wub", "wur", "wbg", "ubr", "wubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["br-storm", "br-welder", "ubr-storm", "ubrg-storm", "ur-storm", "ur-welder", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wur-artifacts", "wurg-artifacts"],
  },
  "Unleash Ruin": {
    tides: ["Events", "Survivors"],
    core: true,
    colors: ["bg", "wbg", "ubg", "brg", "wubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-lands-monsters", "g-big-ramp", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-soup", "wb-weenie", "wbg-value-midrange", "wbrg-aristocrats", "wubg-lands-soup", "wug-value"],
  },
  "Blightmaw": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["u", "wu", "wr", "ub", "ur", "wub", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "ubr-storm", "ur-storm", "ur-welder", "urg-storm", "wg-value-midrange", "wr-artifacts", "wu-artifact-control", "wub-control"],
  },
  "Moonbound Wolf": {
    tides: ["Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wubr", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-midrange", "g-big-ramp", "rg-midrange", "ub-storm", "ubg-ramp", "ug-big-ramp", "ug-ramp", "ug-sneak", "wbg-value-midrange", "wg-big-ramp", "wubg-big-ramp", "wubrg-value", "wug-big-ramp", "wug-lands-soup", "wug-value"],
  },
  "Somber Flockmaster": {
    tides: ["Events"],
    colors: ["r", "wr", "ur", "br", "rg", "ubr", "urg", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "r-aggro", "r-burn", "rg-midrange", "ubr-control", "ubr-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "wr-aggro", "wr-artifact-aggro", "wur-artifacts"],
  },
  "Worldbreacher": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wbr", "wubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifact-control", "u-artifacts", "u-welder", "ub-tempo", "ur-artifacts", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wu-academy", "wu-artifact-control", "wub-artifact-control", "wubr-welder", "wur-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "Sundown Ronin": {
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "wr", "ub", "ur", "wub", "wur", "wbr", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-welder", "ub-tempo", "ur-academy", "ur-artifacts", "ur-welder", "w-artifact-control", "w-weenie", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubr-artifact-aggro", "wubr-welder", "wur-academy", "wur-artifacts"],
  },
  "Petal-Seer": {
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "urg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wg-midrange", "wubg-big-ramp", "wubg-lands-soup", "wubg-value", "wubrg-lands-soup", "wug-value"],
  },
  "Ashfront Lieutenant": {
    colors: ["ur", "bg", "wbg", "ubg", "brg", "wubg", "ubrg"],
    draftArchetypes: ["bg-midrange", "bg-midrange-reanimator", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wr-artifacts", "wubg-artifact-control", "wubrg-value"],
  },
  "Marrow Drinker": {
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["ur", "bg", "wbg", "ubg", "brg", "wubg", "ubrg"],
    draftArchetypes: ["bg-midrange", "bg-midrange-reanimator", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wr-artifacts", "wubg-artifact-control", "wubrg-value"],
  },
  "Sunshadow Eagle": {
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "ubg-ramp", "ug-ramp", "ug-sneak", "wg-big-ramp", "wg-midrange", "wubg-ramp", "wubrg-lands-midrange", "wug-big-ramp"],
  },
  "Vertiginous Leap": {
    tides: ["Events", "Storm", "Survivors"],
    core: true,
    colors: ["b", "wb", "ub", "ur", "br", "bg", "wub", "wbr", "wbg", "ubr", "ubg", "brg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-monsters", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wub-control"],
  },
  "Tethered Hollow": {
    tides: ["Warrior Aggro", "Warrior Combo"],
    draftArchetypes: ["wr-warriors"],
  },
  "Call of the Lost": {
    tides: ["Abandon", "Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Storm"],
    colors: ["r", "ur", "br", "wur", "ubr", "urg", "brg", "wbrg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "ub-storm", "ubr-control", "ubr-storm", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-lands-soup", "urg-storm"],
  },
  "Spirit Reaping": {
    tides: ["Abandon", "Fading Farewell", "Storm", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "wub", "wbr", "ubr", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "u-artifacts", "ubr-storm", "ur-academy", "ur-storm", "ur-welder", "w-artifact-control", "wbr-aristocrats", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wubg-control", "wubg-value-midrange", "wur-artifacts"],
  },
  "Toll of Passage": {
    tides: ["Events", "Outsiders"],
    colors: ["u", "wu", "ub", "ur", "wub", "wur", "wug", "wbg", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-big-mana-artifacts", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ubr-control", "ubrg-storm", "ug-ramp", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-sneak", "urg-storm", "wu-artifact-control", "wu-blink", "wu-control", "wub-control", "wubrg-value", "wug-value", "wur-control"],
  },
  "Keeper of Forgotten Light": {
    tides: ["Celestial Reverie Combo", "Cheap Characters", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["g", "wrg", "urg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["brg-lands-midrange", "r-aristocrats", "rg-lands-soup", "rg-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ur-burn", "ur-spellslinger", "urg-lands-soup", "wbrg-lands-soup", "wubg-lands-soup", "wubrg-lands-soup", "wur-control", "wurg-lands-soup"],
  },
  "Wreckland Maverick": {
    tides: ["Outsiders"],
    colors: ["wb", "wub", "wbg", "wubrg"],
    draftArchetypes: ["ubr-storm", "wb-aristocrats", "wb-artifact-control", "wb-weenie", "wbg-weenie", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-lands-soup", "wubg-ramp", "wubrg-value"],
  },
  "Fangbound": {
    tides: ["Spirit Animals"],
    colors: ["w", "wu", "wr", "wg", "ub", "ur", "ug", "br", "rg", "wub", "wbg", "ubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-aristocrats", "ub-storm", "ubr-storm", "ug-cheaty-ramp", "ur-spellslinger", "ur-storm", "ur-welder", "w-weenie", "wb-weenie", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-midrange-weenie", "wub-artifact-control", "wur-artifacts"],
  },
  "Ashwalker": {
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["b", "bg", "wub", "ubg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ubg-lands-soup", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wub-control", "wubg-value-midrange"],
  },
  "Frost Visionary": {
    tides: ["Blink", "Warrior Aggro"],
    core: true,
    colors: ["w", "wu", "wb", "wr", "wg", "wug", "wbg", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["w-weenie", "wb-weenie", "wr-aggro", "wu-blink", "wu-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wubrg-value", "wug-value"],
  },
  "Aurora Confluence": {
    tides: ["Discard / Madness"],
    colors: ["wr", "ur", "br", "ubr", "urg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "r-burn", "ubr-control", "ubr-storm", "ur-spellslinger", "ur-storm", "wr-artifact-aggro", "wur-aggro"],
  },
  "Dawnblade Wanderer": {
    tides: ["Celestial Reverie Combo", "Wake the Fallen / Shadow March Combo", "Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ur", "ug", "br", "wub", "wbr", "wbg", "wubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "g-big-ramp", "r-welder", "ub-tempo", "ubr-storm", "ur-academy", "ur-storm", "w-artifact-control", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wur-artifact-aggro"],
  },
  "Nebula's Wake": {
    tides: ["Storm"],
    colors: ["ur", "wub", "ubr", "wubg", "ubrg"],
    draftArchetypes: ["b-tempo", "br-aristocrats", "br-storm", "ub-tempo", "ubr-storm", "ur-storm", "wubrg-value"],
  },
  "Driftrider": {
    tides: ["Outsiders"],
    colors: ["wr", "ub", "wub", "ubr", "wubr", "wubg"],
    draftArchetypes: ["b-tempo", "ub-tempo", "ubg-tempo", "ubr-control", "wub-control"],
  },
  "Unleashed Destruction": {
    tides: ["Events"],
    colors: ["r", "wr", "ur", "br", "wub", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "br-welder", "brg-midrange", "r-aggro", "r-burn", "rg-midrange", "ubr-storm", "ubrg-lands-soup", "ur-burn", "ur-spellslinger", "urg-lands-soup", "wr-aggro", "wr-artifact-aggro", "wur-artifacts"],
  },
  "Ossuary Overlord": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wr", "ub", "wbr", "ubr", "wubg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "u-artifacts", "ubr-welder", "ur-welder", "wb-artifact-control", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wubg-value-midrange", "wur-artifacts"],
  },
  "Forsaken Pact": {
    tides: ["Abandon", "Cheap Characters", "Discard / Madness", "Wake the Fallen / Shadow March Combo"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "ubg", "urg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-value-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "urg-lands-soup", "wbrg-lands-soup", "wubg-big-ramp", "wubg-lands-soup", "wubrg-lands-soup", "wug-lands-soup", "wurg-lands-soup"],
  },
  "Burst of Obliteration": {
    tides: ["Cheap Characters", "Storm", "Warrior Combo"],
    colors: ["r", "ur", "br", "bg", "rg", "wur", "ubr", "urg", "brg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "brg-midrange", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wbr-artifact-aggro", "wr-artifact-aggro", "wubrg-value", "wur-aggro", "wurg-lands-soup"],
  },
  "Ripple of Defiance": {
    tides: ["Outsiders"],
    colors: ["wu", "ub", "ur", "ug", "wub", "wug", "ubr"],
    draftArchetypes: ["u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-sneak", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wug-value", "wur-control"],
  },
  "Rebirth Ritualist": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "ub", "ur", "wub", "wug", "wbr", "ubr", "wubg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-aggro", "u-artifacts", "ubr-control", "ubr-storm", "ug-ramp", "ur-storm", "ur-welder", "w-academy", "w-weenie", "wg-value-midrange", "wu-artifact-control", "wub-artifact-control", "wub-control", "wub-weenie", "wubrg-value", "wur-artifacts", "wurg-artifacts"],
  },
  "Sorrow Watcher": {
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "ubg", "brg", "wbrg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-reanimator", "ubg-tempo", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wbrg-aristocrats", "wub-control", "wubrg-value"],
  },
  "Tidewreck Navigator": {
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "ubg", "brg", "wbrg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-reanimator", "ubg-tempo", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wbrg-aristocrats", "wub-control", "wubrg-value"],
  },
  "Sandglider": {
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "wr", "ub", "ur", "ug", "br", "wub", "wur", "wug", "wbr", "ubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifact-control", "u-artifacts", "ur-spellslinger", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wbr-artifact-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wur-academy", "wur-artifacts"],
  },
  "Together Against the Tide": {
    tides: ["Abandon"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "wbg", "ubr", "brg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "bg-midrange", "br-aristocrats", "r-aristocrats", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wu-artifact-control", "wub-control", "wubr-welder", "wubrg-lands-soup"],
  },
  "Fargazer": {
    colors: ["r", "wr", "br", "wbr", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "r-welder", "ur-burn", "ur-welder", "wr-aggro", "wr-artifact-aggro", "wurg-welder"],
  },
  "Angel of the Eclipse": {
    tides: ["Celestial Reverie Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["r", "wr", "br", "wbr", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "r-welder", "ur-burn", "ur-welder", "wr-aggro", "wr-artifact-aggro", "wurg-welder"],
  },
  "Frostbound Defiant": {
    colors: ["g", "ug", "bg", "rg", "wbg", "ubg", "urg", "brg", "wubr", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-midrange", "g-big-ramp", "g-ramp", "rg-lands-soup", "ubg-ramp", "ubrg-lands-midrange", "ubrg-lands-soup", "ubrg-storm", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wbrg-lands-soup", "wg-lands-soup", "wg-midrange", "wubg-ramp"],
  },
  "Emberwolf Triad": {
    tides: ["Spirit Animals"],
    colors: ["g", "ug", "bg", "rg", "wbg", "ubg", "urg", "brg", "wubr", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-midrange", "g-big-ramp", "g-ramp", "rg-lands-soup", "ubg-ramp", "ubrg-lands-midrange", "ubrg-lands-soup", "ubrg-storm", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wbrg-lands-soup", "wg-lands-soup", "wg-midrange", "wubg-ramp"],
  },
  "Blight Weaver": {
    colors: ["w", "u", "g", "wu", "wb", "wr", "ub", "ur", "ug", "br", "wub", "wur", "wug", "ubr", "brg", "wubg"],
    draftArchetypes: ["brg-lands-midrange", "g-big-ramp", "rg-lands-soup", "u-artifacts", "ub-tempo", "ubr-storm", "ur-storm", "urg-artifact-control", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wbr-artifact-aggro", "wr-aggro", "wr-artifacts", "wu-artifact-control", "wu-control", "wub-artifact-control", "wub-weenie", "wubrg-value", "wur-artifacts"],
  },
  "Nocturne": {
    tides: ["Reclaim Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["w", "g", "wu", "wb", "wg", "wbg", "brg", "wubg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "ubg-ramp", "ubrg-lands-soup", "w-weenie", "wb-aristocrats", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wu-weenie", "wub-control", "wubg-value", "wug-value"],
  },
  "Shattering Gambit": {
    tides: ["Storm"],
    colors: ["w", "wu", "wb", "wr", "wub", "wur", "wug", "wbr", "wbg", "wubg", "wubrg"],
    draftArchetypes: ["r-aggro", "ur-control", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-value", "wb-weenie", "wbg-midrange", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-value-midrange", "wubr-welder", "wug-value", "wur-artifacts", "wur-control", "wurg-lands-soup"],
  },
  "Charnel Seraph": {
    tides: ["Warrior Aggro"],
    colors: ["w", "wu", "wb", "wr", "ub", "ur", "br", "rg", "wbr", "wbg", "wubg", "wubrg"],
    draftArchetypes: ["b-tempo", "br-aristocrats", "r-burn", "w-artifact-aggro", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wub-artifact-control", "wur-artifacts"],
  },
  "Seer of the Fallen": {
    tides: ["Abandon", "Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "bg-midrange", "br-aristocrats", "brg-lands-midrange", "wb-weenie", "wubrg-value"],
  },
  "Winterbough Monk": {
    tides: ["Blink", "Celestial Reverie Combo", "Spirit Animals", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["g", "ug", "bg", "rg", "wug", "wbr", "wbg", "wrg", "ubg", "urg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "rg-midrange", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-soup", "ug-ramp", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wg-ramp", "wug-value"],
  },
  "Mountainwatch Alpha": {
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "ubg", "urg", "brg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-big-ramp", "wubg-lands-soup", "wubg-ramp", "wug-big-ramp"],
  },
  "Glimmerwood Scout": {
    tides: ["Blink", "Outsiders"],
    core: true,
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wur", "wug", "wbg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wbg-weenie", "wr-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wubg-control", "wug-value", "wur-artifacts"],
  },
  "Virtuoso of Harmony": {
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["bg", "wbg", "ubr", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "bg-midrange", "br-aristocrats", "brg-midrange", "rg-lands-soup", "ubg-ramp", "ubg-tempo", "ubrg-lands-soup", "urg-lands-soup", "wbg-value-midrange", "wbrg-lands-soup", "wr-artifacts", "wubg-lands-soup", "wubrg-lands-midrange", "wubrg-lands-soup", "wurg-lands-soup"],
  },
  "Augur Crow": {
    colors: ["g", "wu", "wg", "ug", "ubg", "urg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["brg-lands-midrange", "g-big-ramp", "ubg-lands-soup", "ubrg-lands-soup", "ug-cheaty-ramp", "ug-lands-soup", "ug-ramp", "urg-sneak", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wubg-lands-soup", "wubg-value", "wubrg-lands-midrange", "wubrg-value", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "Flash of Power": {
    tides: ["Storm"],
    colors: ["ur", "wbr", "ubr", "urg", "wubr", "ubrg"],
    draftArchetypes: ["br-aristocrats", "ubr-storm", "ur-burn", "ur-storm", "wubg-lands-soup", "wur-aggro"],
  },
  "Nightmare Manifest": {
    tides: ["Abandon", "Warrior Combo"],
    draftArchetypes: ["br-sacrifice"],
  },
  "Wreckborn": {
    tides: ["Abandon", "Fading Farewell"],
    colors: ["r", "wr", "br", "wbr", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-aristocrats", "r-burn", "ubrg-storm", "ur-burn", "ur-welder", "wbrg-aristocrats", "wr-aggro", "wr-artifact-aggro"],
  },
  "Gloomantler": {
    tides: ["Discard / Madness", "Wake the Fallen / Shadow March Combo"],
    draftArchetypes: ["br-madness"],
  },
  "Revenant of the Lost": {
    tides: ["Cheap Characters", "Reclaim Combo"],
    colors: ["b", "wu", "wb", "wub", "wbr", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "br-aristocrats", "ubr-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wr-artifact-aggro", "wu-artifact-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-value-midrange", "wubr-artifact-aggro"],
  },
  "Dreaming Groves": {
    tides: ["Outsiders"],
    colors: ["u", "b", "ub", "br", "bg", "wub", "wbr", "wbg", "ubr", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-midrange", "br-aristocrats", "brg-midrange", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ubrg-storm", "ur-storm", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wbrg-lands-soup", "wub-control", "wubg-artifact-control", "wubrg-value"],
  },
  "Dreamvale Monarch": {
    tides: ["Blink", "Celestial Reverie Combo", "Spirit Animals"],
    core: true,
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "g-big-ramp", "ubg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-soup", "ug-big-ramp", "ug-lands-soup", "ug-ramp", "urg-sneak", "wbg-value-midrange", "wg-midrange", "wug-big-ramp", "wug-value"],
  },
  "Sky Voyager": {
    tides: ["Blink", "Outsiders", "Spirit Animals", "Survivors", "Warrior Aggro"],
    colors: ["g", "wg", "ug", "rg", "ubg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "g-big-ramp", "ubrg-lands-soup", "ug-ramp", "wbg-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wubg-big-ramp", "wubg-value-midrange"],
  },
  "Voidcaller": {
    tides: ["Blink", "Outsiders", "Spirit Animals", "Survivors", "Warrior Aggro"],
    colors: ["g", "wg", "ug", "rg", "ubg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "g-big-ramp", "ubrg-lands-soup", "ug-ramp", "wbg-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wubg-big-ramp", "wubg-value-midrange"],
  },
  "Harvest the Forgotten": {
    colors: ["wu", "ub", "ur", "wub", "ubr", "urg", "wubg", "ubrg"],
    draftArchetypes: ["u-artifacts", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm"],
  },
  "Lurking Dread": {
    tides: ["Events", "Outsiders"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbg", "ubr", "ubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-tempo", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wub-control", "wubrg-value"],
  },
  "Soulkindler": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Spirit Animals", "Survivors"],
    colors: ["ur", "br", "rg", "wbr", "ubr", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wubg-lands-soup", "wubrg-value", "wurg-artifacts"],
  },
  "Unquenched": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Spirit Animals", "Survivors"],
    colors: ["ur", "br", "rg", "wbr", "ubr", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wubg-lands-soup", "wubrg-value", "wurg-artifacts"],
  },
  "Pyrestone Avatar": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Spirit Animals"],
    colors: ["ur", "br", "rg", "wbr", "ubr", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wubg-lands-soup", "wubrg-value", "wurg-artifacts"],
  },
  "Pinnacle Ascendant": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Spirit Animals", "Survivors"],
    colors: ["ur", "br", "rg", "wbr", "ubr", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wubg-lands-soup", "wubrg-value", "wurg-artifacts"],
  },
  "Ferryman's Tithe": {
    colors: ["b", "wb", "ub", "br", "bg", "wbr", "ubr", "brg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-tempo", "ubg-tempo", "ubr-control", "wb-weenie", "wbg-weenie", "wubg-value-midrange"],
  },
  "Meadowlight Charger": {
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ur", "wub", "wbr", "wubrg"],
    draftArchetypes: ["r-aggro", "u-artifacts", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-weenie", "wub-artifact-control", "wubrg-value", "wur-artifacts"],
  },
  "Gleamharvester": {
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "wub", "wur", "ubr", "brg", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-spellslinger", "ur-storm", "ur-welder", "wb-weenie", "wr-aggro"],
  },
  "Shoreline Penitent": {
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "wub", "wur", "ubr", "brg", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-spellslinger", "ur-storm", "ur-welder", "wb-weenie", "wr-aggro"],
  },
  "Fathomscourge": {
    tides: ["Abandon", "Warrior Aggro", "Warrior Combo"],
    colors: ["r", "ub", "br", "wbr", "ubr", "wbrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "br-welder", "r-welder", "u-welder", "ur-artifacts", "ur-burn", "ur-welder", "wb-aristocrats", "wbr-aristocrats", "wbr-artifact-aggro", "wr-artifacts", "wubr-welder", "wur-artifacts"],
  },
  "Smoldering Ancient": {
    tides: ["Abandon", "Warrior Combo"],
    colors: ["r", "ub", "br", "wbr", "ubr", "wbrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "br-welder", "r-welder", "u-welder", "ur-artifacts", "ur-burn", "ur-welder", "wb-aristocrats", "wbr-aristocrats", "wbr-artifact-aggro", "wr-artifacts", "wubr-welder", "wur-artifacts"],
  },
  "Collapse Protocol": {
    colors: ["wb", "ub", "br", "wub", "wbg", "ubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "br-aristocrats", "ub-tempo", "ubr-control", "wb-aristocrats", "wb-weenie"],
  },
  "The Thinning": {
    colors: ["wb", "ub", "br", "wub", "wbg", "ubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "br-aristocrats", "ub-tempo", "ubr-control", "wb-aristocrats", "wb-weenie"],
  },
  "Spiral Offering": {
    tides: ["Discard / Madness"],
    colors: ["r", "ur", "br", "rg", "ubr", "brg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wubrg-value", "wur-aggro"],
  },
  "Gateweaver": {
    tides: ["Events", "Storm"],
    colors: ["r", "wr", "ur", "br", "wur", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ug-sneak", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wr-aggro", "wur-aggro"],
  },
  "Reunion": {
    tides: ["Discard / Madness", "Storm"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wug", "ubr", "ubg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "ubg-ramp", "ubr-storm", "ug-lands-soup", "ug-ramp", "ur-storm", "wu-artifact-control", "wu-control", "wubrg-value"],
  },
  "Dread Arbiter": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "ub", "ur", "br", "wub", "wrg", "ubr", "wubr"],
    draftArchetypes: ["b-aristocrats", "bg-aristocrats", "bg-midrange", "br-aristocrats", "br-welder", "r-burn", "u-artifact-control", "u-artifacts", "ubr-control", "ubr-storm", "ubrg-storm", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wu-academy", "wu-artifact-control", "wu-weenie", "wub-artifact-control", "wubg-control", "wur-artifacts"],
  },
  "Ferryman of the Falls": {
    tides: ["Abandon", "Cheap Characters"],
    colors: ["bg", "wbg", "ubg", "urg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-lands-soup", "rg-lands-soup", "ubg-lands-soup", "ubrg-lands-soup", "ubrg-storm", "ug-lands-midrange", "ug-lands-soup", "wbrg-lands-soup", "wg-lands-soup", "wubg-lands-soup", "wubrg-lands-soup", "wubrg-value"],
  },
  "Dreamborne Leviathan": {
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wbg", "wrg", "brg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-midrange", "g-big-ramp", "ubg-value-midrange", "ug-ramp", "urg-artifact-control", "wbrg-lands-soup", "wg-ramp", "wubrg-value"],
  },
  "Spiritbound Alpha": {
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wbg", "wrg", "brg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-midrange", "g-big-ramp", "ubg-value-midrange", "ug-ramp", "urg-artifact-control", "wbrg-lands-soup", "wg-ramp", "wubrg-value"],
  },
  "Burning Pursuit": {
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "ubr", "ubg", "brg", "wubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-reanimator", "ub-tempo", "wb-weenie", "wbg-weenie", "wbr-aristocrats", "wubrg-lands-soup"],
  },
  "Rite of Summoning": {
    tides: ["Abandon"],
    colors: ["u", "b", "wr", "ub", "ur", "br", "bg", "ubr", "ubg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "br-aristocrats", "br-welder", "u-artifacts", "ub-tempo", "ubg-ramp", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ubrg-storm", "ur-storm", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbrg-lands-soup", "wub-artifact-control", "wubrg-value"],
  },
  "Defiant Holdout": {
    tides: ["Abandon", "Survivors"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "wubg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie"],
  },
  "Shatterpoint Agent": {
    tides: ["Discard / Madness"],
    colors: ["g", "wg", "ur", "ug", "bg", "rg", "wbr", "wbg", "brg", "wubg", "ubrg"],
    draftArchetypes: ["bg-midrange", "brg-lands-monsters", "g-big-ramp", "g-lands-soup", "rg-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbg-value-midrange", "wbrg-aristocrats", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-big-ramp", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "Cloaked Sentinel": {
    colors: ["w", "wu", "wb", "wr", "br", "wub", "wbg", "wubg", "wbrg"],
    draftArchetypes: ["w-weenie", "wb-weenie", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-value", "wubr-artifact-aggro", "wug-value"],
  },
  "Veil Crosser": {
    tides: ["Abandon", "Survivors"],
    colors: ["bg", "wbg", "ubg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-monsters", "brg-midrange", "ubg-ramp", "ubr-control", "ubrg-lands-soup", "ug-lands-soup", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wubg-big-ramp", "wubrg-lands-soup"],
  },
  "Rooftop Prophet": {
    tides: ["Discard / Madness", "Survivors"],
    colors: ["bg", "wbg", "ubg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-monsters", "brg-midrange", "ubg-ramp", "ubr-control", "ubrg-lands-soup", "ug-lands-soup", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wubg-big-ramp", "wubrg-lands-soup"],
  },
  "Ripple Through Reality": {
    colors: ["u", "wu", "ub", "ur", "ug", "wug", "ubr", "ubg", "wubg", "ubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ug-lands-midrange", "ug-ramp", "ur-spellslinger", "urg-artifact-control", "urg-storm", "wr-aggro", "wu-blink", "wu-control", "wub-control", "wubg-artifact-control", "wubr-welder", "wubrg-value", "wug-lands-soup", "wur-aggro", "wur-control"],
  },
  "Titan of Forgotten Echoes": {
    tides: ["Reclaim Combo"],
    colors: ["wu", "wb", "wg", "wug", "wbg", "brg", "wubr", "wbrg", "wubrg"],
    draftArchetypes: ["w-weenie", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wg-big-ramp", "wg-midrange", "wg-value-midrange", "wr-artifact-aggro", "wubg-value", "wubg-value-midrange", "wur-artifacts"],
  },
  "Scrapyard Custodian": {
    tides: ["Fading Farewell", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-tempo", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wubrg-value"],
  },
  "Exiles of the Last Light": {
    tides: ["Survivors"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "ub-storm", "ubg-tempo", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wbrg-aristocrats", "wub-control"],
  },
  "Pyre Challenger": {
    tides: ["Warrior Aggro"],
    colors: ["wr", "ur", "br", "rg", "wbr", "ubr", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["bg-lands-midrange", "br-aristocrats", "brg-lands-midrange", "r-aggro", "r-aristocrats", "r-burn", "ubr-storm", "ur-spellslinger", "ur-storm", "w-weenie", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control"],
  },
  "Thornwood Delver": {
    tides: ["Reclaim Combo"],
    colors: ["wr", "ur", "br", "rg", "wbr", "ubr", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["bg-lands-midrange", "br-aristocrats", "brg-lands-midrange", "r-aggro", "r-aristocrats", "r-burn", "ubr-storm", "ur-spellslinger", "ur-storm", "w-weenie", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control"],
  },
  "Infernal Rest": {
    tides: ["Events", "Outsiders"],
    colors: ["w", "wu", "wb", "wr", "ur", "wub", "wur", "wug", "wubr", "wubg", "wurg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wbrg-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wubr-artifact-aggro", "wubrg-value"],
  },
  "Dreamscatter": {
    colors: ["r", "ur", "wur", "wbr", "ubr", "urg", "wubr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "ubr-storm", "ubrg-storm", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm"],
  },
  "Echoes of Eternity": {
    tides: ["Events", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["r", "ur", "wur", "wbr", "ubr", "urg", "wubr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "ubr-storm", "ubrg-storm", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm"],
  },
  "Weight of Memory": {
    colors: ["wr", "ur", "br", "rg", "wur", "wbr", "ubr", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "br-welder", "brg-lands-midrange", "r-aggro", "r-burn", "rg-midrange", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ur-burn", "ur-storm", "ur-welder", "urg-sneak", "wbrg-aristocrats", "wbrg-lands-soup", "wr-aggro", "wur-artifact-aggro"],
  },
  "The Forsaker": {
    tides: ["Abandon", "Cheap Characters", "Reclaim Combo", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["g", "ug", "bg", "wrg", "ubr", "brg", "wubg", "wurg", "wbrg", "ubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-big-ramp", "rg-lands-soup", "ubg-ramp", "ug-lands-soup", "ug-ramp", "ur-welder", "urg-artifact-control", "urg-lands-soup", "urg-storm", "wbg-midrange", "wbrg-lands-soup", "wg-lands-soup", "wubg-lands-soup", "wug-lands-soup", "wurg-lands-soup"],
  },
  "Ruptured Dynamo": {
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["g", "ug", "bg", "wrg", "ubr", "brg", "wubg", "wurg", "wbrg", "ubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-big-ramp", "rg-lands-soup", "ubg-ramp", "ug-lands-soup", "ug-ramp", "ur-welder", "urg-artifact-control", "urg-lands-soup", "urg-storm", "wbg-midrange", "wbrg-lands-soup", "wg-lands-soup", "wubg-lands-soup", "wug-lands-soup", "wurg-lands-soup"],
  },
  "Liminal Striker": {
    tides: ["Warrior Aggro"],
    draftArchetypes: ["wr-vanguard"],
  },
  "Ride of the Vanguard": {
    tides: ["Warrior Aggro"],
    colors: ["w", "wu", "wr", "wg", "br", "wub", "wbr", "wubr", "wurg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wbg-midrange", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wubrg-value", "wur-academy", "wur-artifact-aggro", "wur-control"],
  },
  "Broadcast Array": {
    tides: ["Celestial Reverie Combo", "Events", "Storm"],
    colors: ["ur", "br", "wub", "ubr", "wubg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["brg-midrange", "ub-storm", "ubr-storm", "ubrg-storm", "ur-storm"],
  },
  "Ruin Scavenger": {
    tides: ["Survivors"],
    colors: ["g", "ug", "bg", "rg", "wug", "wbg", "ubg", "urg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "bg-big-ramp", "bg-lands-midrange", "bg-lands-soup", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "brg-midrange", "g-big-ramp", "g-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-soup", "ug-ramp", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbrg-aristocrats", "wbrg-lands-soup", "wg-big-ramp", "wu-control", "wubg-big-ramp", "wubg-value-midrange", "wug-lands-soup"],
  },
  "Deathwalker": {
    tides: ["Abandon", "Survivors"],
    colors: ["b", "wb", "br", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-reanimator", "ub-tempo", "wb-aristocrats", "wb-weenie", "wug-big-ramp"],
  },
  "Sanctum Approach": {
    tides: ["Discard / Madness"],
    colors: ["wu", "ub", "ur", "ug", "wub", "ubr", "urg", "wubrg"],
    draftArchetypes: ["u-big-mana-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ubrg-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "wu-control", "wubr-artifact-aggro", "wug-value", "wur-artifacts", "wur-control"],
  },
  "Gateway Defender": {
    tides: ["Reclaim Combo"],
    colors: ["u", "r", "wu", "ub", "ur", "ug", "br", "wub", "wbr", "ubr", "wubr"],
    draftArchetypes: ["brg-midrange", "u-welder", "ub-storm", "ubr-welder", "ubrg-storm", "ug-cheaty-ramp", "ug-ramp", "wbr-artifact-aggro", "wr-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubg-artifact-control", "wubg-ramp", "wur-academy", "wur-control", "wurg-lands-soup", "wurg-welder"],
  },
  "Abyssal Enforcer": {
    tides: ["Blink"],
    core: true,
    colors: ["wu", "wub", "wur", "wug", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["ubrg-lands-soup", "ur-spellslinger", "ur-storm", "w-weenie", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wu-weenie", "wub-control", "wubg-artifact-control", "wubg-ramp", "wubg-value-midrange", "wubrg-lands-midrange", "wubrg-value", "wug-value", "wur-control"],
  },
  "Celestial Reverie": {
    tides: ["Celestial Reverie Combo", "Spirit Animals", "Storm"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "wurg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "g-big-ramp", "g-lands-soup", "ubg-ramp", "ubg-value-midrange", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wg-ramp", "wug-value", "wurg-lands-soup"],
  },
  "Depthwalker": {
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["b", "g", "ug", "bg", "wbg", "ubg", "brg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "bg-midrange-reanimator", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "rg-midrange", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-midrange", "ug-lands-soup", "ug-ramp", "ug-sneak", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-value-midrange", "wubg-big-ramp", "wubrg-lands-soup"],
  },
  "Lanternwood Scout": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo"],
    colors: ["r", "br", "wur", "wbr", "ubr", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "ur-burn", "ur-storm", "ur-welder", "wbrg-aristocrats", "wr-artifact-aggro"],
  },
  "Immolate and Rise": {
    tides: ["Survivors"],
    colors: ["b", "wb", "ub", "bg", "wub", "wbg", "ubr", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "br-aristocrats", "ub-tempo", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wubrg-value", "wur-control"],
  },
  "Peak Plunder": {
    tides: ["Events", "Survivors"],
    colors: ["b", "wb", "ub", "bg", "wub", "wbg", "ubr", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "br-aristocrats", "ub-tempo", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wubrg-value", "wur-control"],
  },
  "Seaside Requiem": {
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "wbr", "ubr", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "r-welder", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wubr-welder", "wubrg-value"],
  },
  "Ridgecutter": {
    tides: ["Outsiders"],
    colors: ["wu", "ub", "ur", "ug", "wur", "ubr", "urg", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-storm", "ub-tempo", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-spellslinger", "ur-storm", "urg-storm", "wbg-midrange", "wu-artifacts", "wu-blink", "wug-value", "wurg-lands-soup"],
  },
  "Colossal Convergence": {
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "wub", "wur", "wbr", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-welder", "u-artifact-control", "u-artifacts", "ubr-welder", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-value-midrange", "wur-artifact-aggro", "wur-artifacts", "wurg-welder"],
  },
  "Forsworn Champion": {
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "wub", "wur", "wbr", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-welder", "u-artifact-control", "u-artifacts", "ubr-welder", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-value-midrange", "wur-artifact-aggro", "wur-artifacts", "wurg-welder"],
  },
  "Forge-Twin": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "ub", "ur", "wub", "wur", "wug", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["br-welder", "u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "u-control", "ub-tempo", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-control", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wug-value", "wur-artifacts", "wurg-artifacts"],
  },
  "Speaker for the Forgotten": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Warrior Combo"],
    colors: ["w", "u", "wu", "ub", "ur", "wub", "wur", "wug", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["br-welder", "u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "u-control", "ub-tempo", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-control", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wug-value", "wur-artifacts", "wurg-artifacts"],
  },
  "Crescendo Channeler": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "ub", "ur", "wub", "wur", "wug", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["br-welder", "u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "u-control", "ub-tempo", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-control", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wug-value", "wur-artifacts", "wurg-artifacts"],
  },
  "Assault Leader": {
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wr", "ub", "ur", "br", "wub", "wur", "wbr", "wubr"],
    draftArchetypes: ["br-aristocrats", "u-artifact-control", "u-artifacts", "u-welder", "ub-tempo", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wub-artifact-control", "wur-artifacts", "wurg-artifacts"],
  },
  "Null Sphere": {
    colors: ["wu", "ub", "ur", "ug", "wur", "ubr", "ubg", "wubg", "wubrg"],
    draftArchetypes: ["u-big-mana-artifacts", "ub-tempo", "ubr-control", "ug-ramp", "ur-burn", "ur-spellslinger", "urg-sneak", "urg-storm", "wu-artifact-control", "wu-control", "wub-control", "wubg-lands-soup", "wubg-value-midrange", "wug-value", "wur-artifacts", "wurg-lands-soup"],
  },
  "Call of Calamity": {
    tides: ["Discard / Madness"],
    colors: ["r", "ur", "rg", "wrg", "ubr", "urg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-burn", "rg-lands-soup", "ubr-storm", "ubrg-lands-soup", "ubrg-storm", "ug-lands-soup", "ur-burn", "ur-spellslinger", "ur-storm", "wbrg-lands-soup", "wr-aggro", "wr-artifact-aggro", "wubrg-lands-midrange", "wur-artifacts"],
  },
  "Harrowing Officiant": {
    tides: ["Discard / Madness", "Events"],
    colors: ["ug", "rg", "wug", "wbg", "ubg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "brg-lands-monsters", "brg-midrange", "g-big-ramp", "rg-midrange", "ubg-tempo", "ubg-value-midrange", "ug-ramp", "ug-sneak", "wubg-control", "wubrg-value", "wug-big-ramp"],
  },
  "Ancient Descent": {
    tides: ["Events"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wur", "ubr", "urg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["u-big-mana-artifacts", "u-control", "ub-tempo", "ubr-storm", "ubrg-storm", "ug-cheaty-ramp", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wu-artifact-control", "wu-blink", "wu-control", "wug-value", "wur-artifacts", "wur-control"],
  },
  "Dreadweaver": {
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["b", "wb", "br", "bg", "wub", "wbr", "wbg", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "ub-tempo", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wbrg-aristocrats", "wur-artifacts"],
  },
  "Rootbound Witness": {
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["wr", "ur", "br", "rg", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-burn", "ubr-control", "ubr-storm", "ur-control", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wbrg-lands-soup", "wr-artifact-aggro", "wr-artifacts", "wurg-welder"],
  },
  "Skies of Change": {
    tides: ["Discard / Madness"],
    colors: ["wr", "ur", "br", "rg", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-burn", "ubr-control", "ubr-storm", "ur-control", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wbrg-lands-soup", "wr-artifact-aggro", "wr-artifacts", "wurg-welder"],
  },
  "Rusted Monolith": {
    tides: ["Reclaim Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "wbg", "brg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "brg-lands-midrange", "brg-midrange", "r-burn", "ub-tempo", "ubr-control", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wg-value-midrange"],
  },
  "Undying Fang": {
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "urg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "g-big-ramp", "g-ramp", "rg-lands-soup", "ubrg-lands-soup", "ug-big-ramp", "ug-lands-soup", "ug-ramp", "wb-weenie", "wbg-midrange", "wg-big-ramp", "wg-midrange", "wubg-ramp", "wubrg-value", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "Nineborn Specter": {
    tides: ["Abandon", "Fading Farewell", "Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wb", "wr", "ub", "br", "wub", "wbr", "wubr", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-welder", "brg-midrange", "u-welder", "ur-welder", "wb-weenie", "wr-artifact-aggro", "wu-academy", "wu-artifact-control", "wub-artifact-control", "wub-control", "wub-weenie"],
  },
  "Young Beastcaller": {
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wbg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "rg-midrange", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-lands-soup", "urg-storm", "wbrg-lands-soup", "wg-big-ramp", "wubg-big-ramp", "wubg-lands-soup", "wug-lands-soup", "wug-value"],
  },
  "Standard Bearer": {
    tides: ["Abandon", "Celestial Reverie Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "wg", "ub", "ur", "br", "wub", "wug", "wbr", "wbg", "wrg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-midrange", "u-welder", "ub-storm", "ubg-value-midrange", "w-artifact-aggro", "wb-aristocrats", "wbr-aristocrats", "wbrg-lands-soup", "wg-midrange", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wubg-artifact-control", "wubg-big-ramp", "wur-artifacts"],
  },
  "Wasteland Tamer": {
    tides: ["Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbg", "ubg", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "brg-lands-midrange", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ur-storm", "wb-weenie"],
  },
  "Duneveil Vanguard": {
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["br", "wrg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "brg-midrange", "g-big-ramp", "rg-lands-soup", "rg-midrange", "ubg-ramp", "ubrg-lands-midrange", "ur-storm", "urg-lands-soup", "wubrg-lands-soup", "wubrg-value", "wur-control", "wurg-lands-soup"],
  },
  "Guiding Light": {
    tides: ["Events"],
    colors: ["u", "wu", "ub", "ur", "wug", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-sneak", "wu-control", "wubrg-value"],
  },
  "Cradle of Storms": {
    tides: ["Discard / Madness", "Wake the Fallen / Shadow March Combo"],
    draftArchetypes: ["br-madness"],
  },
  "Wake the Fallen": {
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "wu", "wb", "wr", "br", "wur", "wbr", "wbg", "ubr", "brg", "wubg"],
    draftArchetypes: ["g-big-ramp", "rg-lands-soup", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wubrg-lands-soup", "wug-lands-soup", "wur-academy", "wur-artifacts"],
  },
  "Derelict Voyage": {
    tides: ["Storm"],
    colors: ["r", "wr", "ur", "br", "rg", "wur", "wbr", "ubr", "urg", "brg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-aristocrats", "r-burn", "rg-midrange", "ubr-control", "ubr-storm", "ur-burn", "ur-storm", "ur-welder", "wbr-aristocrats", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wr-artifacts"],
  },
  "Dreadcall Warden": {
    tides: ["Discard / Madness", "Outsiders"],
    colors: ["ub", "wub", "wbr", "ubr", "ubg", "wubr", "wubrg"],
    draftArchetypes: ["ub-tempo", "ubr-control", "ubr-storm", "ubrg-lands-soup", "wub-control", "wubg-value-midrange"],
  },
  "Last Beacon": {
    tides: ["Outsiders"],
    colors: ["ub", "wub", "wbr", "ubr", "ubg", "wubr", "wubrg"],
    draftArchetypes: ["ub-tempo", "ubr-control", "ubr-storm", "ubrg-lands-soup", "wub-control", "wubg-value-midrange"],
  },
  "Summons of the Bonded": {
    tides: ["Warrior Aggro"],
    colors: ["rg", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "rg-midrange", "ubr-storm", "ubrg-lands-soup", "ur-burn", "ur-welder", "urg-storm", "wbrg-lands-soup", "wr-aggro", "wubrg-lands-midrange", "wurg-artifacts", "wurg-lands-soup"],
  },
  "The Calling Night": {
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbg", "ubg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "br-aristocrats", "br-storm", "ub-tempo", "ubr-control", "ubr-storm", "w-weenie", "wb-weenie", "wbg-value-midrange"],
  },
  "Spirit of the Greenwood": {
    tides: ["Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    draftArchetypes: ["g-stompy"],
  },
  "Voidshield Guardian": {
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wug", "wubrg"],
    draftArchetypes: ["r-aggro", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-aristocrats", "wb-weenie", "wg-big-ramp", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wu-blink", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wug-value"],
  },
  "Cascade of Reflections": {
    tides: ["Discard / Madness", "Events", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["ur", "ubr", "ubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "brg-midrange", "u-storm", "ubr-storm", "ur-burn", "ur-storm", "urg-lands-soup", "urg-storm", "wr-aggro", "wubrg-value"],
  },
  "Collateral Damage": {
    colors: ["b", "wb", "ub", "ug", "br", "wub", "wbr", "ubr", "brg", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "brg-lands-midrange", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-welder", "wb-aristocrats", "wb-value", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wub-control", "wub-weenie", "wubg-artifact-control", "wubg-control"],
  },
  "Mystic Runefish": {
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "brg", "wubg", "wurg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "g-big-ramp", "g-ramp", "ubg-value-midrange", "ubrg-lands-soup", "ug-big-ramp", "ug-lands-soup", "ug-ramp", "wbg-midrange", "wg-big-ramp", "wg-lands-soup", "wr-aggro", "wubg-big-ramp", "wurg-lands-soup"],
  },
  "Duskreaper": {
    tides: ["Abandon", "Fading Farewell", "Reclaim Combo", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["wb", "br", "wub", "wbr", "wbg", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wub-artifact-control"],
  },
  "Barrage Specialist": {
    tides: ["Blink", "Events"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wur", "wug", "ubr", "urg", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-tempo", "ubr-storm", "ubrg-storm", "ug-ramp", "ur-burn", "ur-storm", "urg-storm", "wu-artifact-control", "wu-blink", "wub-control", "wubg-lands-soup", "wubrg-value", "wug-value", "wur-control"],
  },
  "Surge of Fury": {
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["u", "wu", "ub", "ur", "ug", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["u-control", "u-storm", "ub-storm", "ub-tempo", "ubr-storm", "ubrg-storm", "ug-sneak", "ur-storm", "urg-storm"],
  },
  "Threadbreaker": {
    tides: ["Outsiders"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wug", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubr-control", "ug-cheaty-ramp", "ug-ramp", "urg-sneak", "wu-artifacts", "wu-blink", "wu-control", "wug-value"],
  },
  "Nightmare": {
    tides: ["Wake the Fallen / Shadow March Combo"],
    colors: ["w", "wb", "ur", "wub", "wur", "wbr", "wbg", "wubr", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-artifact-control", "wubg-lands-soup", "wubr-artifact-aggro", "wubrg-lands-soup", "wur-control", "wurg-lands-soup"],
  },
  "Phantom Flotilla": {
    tides: ["Cheap Characters", "Wake the Fallen / Shadow March Combo"],
    colors: ["w", "wb", "ur", "wub", "wur", "wbr", "wbg", "wubr", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-artifact-control", "wubg-lands-soup", "wubr-artifact-aggro", "wubrg-lands-soup", "wur-control", "wurg-lands-soup"],
  },
  "Twice-Lit Portal": {
    tides: ["Events", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["r", "ur", "br", "wug", "ubr", "wubr", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aristocrats", "r-burn", "ubr-storm", "ubrg-storm", "ur-burn", "ur-storm", "urg-lands-soup", "wur-control"],
  },
  "Torchbearer of the Abyss": {
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "bg", "rg", "ubr", "brg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "brg-lands-midrange", "ubr-control", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wbr-aristocrats", "wr-aggro"],
  },
  "Cindermarch": {
    tides: ["Abandon", "Blink", "Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["g", "wg", "ur", "ug", "bg", "wug", "wbg", "wrg", "ubrg", "wubrg"],
    draftArchetypes: ["g-big-ramp", "ubr-control", "ubrg-lands-soup", "ug-big-ramp", "ug-cheaty-ramp", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbg-midrange", "wbrg-lands-soup", "wg-big-ramp", "wu-artifact-control", "wu-control", "wubg-big-ramp", "wubg-value-midrange", "wubrg-value", "wug-big-ramp", "wug-lands-soup", "wug-value", "wurg-artifacts"],
  },
  "Conduit of Resonance": {
    tides: ["Abandon", "Blink", "Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["g", "wg", "ur", "ug", "bg", "wug", "wbg", "wrg", "ubrg", "wubrg"],
    draftArchetypes: ["g-big-ramp", "ubr-control", "ubrg-lands-soup", "ug-big-ramp", "ug-cheaty-ramp", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbg-midrange", "wbrg-lands-soup", "wg-big-ramp", "wu-artifact-control", "wu-control", "wubg-big-ramp", "wubg-value-midrange", "wubrg-value", "wug-big-ramp", "wug-lands-soup", "wug-value", "wurg-artifacts"],
  },
  "Twilight Troubadour": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Events", "Storm", "Warrior Aggro"],
    colors: ["u", "wu", "wr", "ur", "ug", "wub", "wur", "ubr", "wurg", "wubrg"],
    draftArchetypes: ["r-aggro", "r-burn", "u-artifacts", "ubr-control", "ubr-storm", "ur-academy", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "wr-artifacts", "wu-academy", "wubrg-lands-midrange", "wubrg-value", "wur-artifacts", "wurg-artifacts"],
  },
  "Simulacra": {
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["u", "wu", "wr", "ur", "ug", "wub", "wur", "ubr", "wurg", "wubrg"],
    draftArchetypes: ["r-aggro", "r-burn", "u-artifacts", "ubr-control", "ubr-storm", "ur-academy", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "wr-artifacts", "wu-academy", "wubrg-lands-midrange", "wubrg-value", "wur-artifacts", "wurg-artifacts"],
  },
  "The Ringleader": {
    tides: ["Events", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["ur", "rg", "ubr", "wurg"],
    draftArchetypes: ["br-aristocrats", "brg-midrange", "r-aggro", "r-burn", "ubr-storm", "ubrg-storm", "ur-burn", "ur-spellslinger", "ur-storm"],
  },
  "Hallowed Stag": {
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "ubg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "g-big-ramp", "rg-lands-soup", "ubg-value-midrange", "ubrg-lands-midrange", "ug-lands-soup", "wbg-midrange", "wbg-value-midrange", "wg-big-ramp", "wubg-big-ramp", "wubg-lands-soup", "wubg-value-midrange", "wubrg-lands-soup", "wubrg-value", "wurg-lands-soup"],
  },
  "Intermezzo Balladeer": {
    tides: ["Celestial Reverie Combo", "Events", "Storm", "Warrior Combo"],
    colors: ["w", "u", "ub", "ur", "ug", "wub", "wur", "wbr", "wbg", "ubr", "wubg", "wbrg"],
    draftArchetypes: ["u-storm", "ub-storm", "ubr-storm", "ur-storm", "ur-welder", "urg-storm", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wur-artifacts"],
  },
  "Oathbound Pair": {
    tides: ["Spirit Animals"],
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wug", "wbr", "wbg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-aristocrats", "wb-weenie", "wbg-midrange", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wug-value", "wur-artifacts"],
  },
  "Blazing Emberwing": {
    tides: ["Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "wbg", "wubg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "g-big-ramp", "ug-big-ramp", "ug-ramp", "ug-sneak", "wg-big-ramp", "wg-midrange", "wubg-big-ramp", "wubg-ramp", "wug-value", "wur-artifacts", "wurg-artifacts"],
  },
  "Crumbling Covenant": {
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "ubr", "ubrg"],
    draftArchetypes: ["u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-lands-soup", "ubr-control", "ubr-storm", "ug-lands-midrange", "ug-ramp", "ur-burn", "ur-control", "ur-spellslinger", "wu-academy", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubg-artifacts", "wubrg-value", "wug-lands-soup", "wug-value", "wur-artifacts", "wurg-lands-soup"],
  },
  "Canopy of Stars": {
    tides: ["Storm"],
    colors: ["r", "ur", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "ubr-storm", "ubrg-storm", "ur-burn", "ur-storm"],
  },
  "Doorlight Foundling": {
    tides: ["Blink", "Celestial Reverie Combo", "Cheap Characters"],
    colors: ["g", "ug", "wug", "wbg", "ubg", "urg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-big-ramp", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-sneak", "wubg-big-ramp", "wubg-lands-soup", "wubrg-value", "wug-lands-soup", "wug-value", "wur-artifacts"],
  },
  "Luminous Ascent": {
    tides: ["Celestial Reverie Combo"],
    colors: ["w", "g", "wg", "ug", "bg", "rg", "wug", "wbr", "wbg", "wrg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "g-big-ramp", "ug-ramp", "wbg-midrange", "wbrg-aristocrats", "wg-big-ramp", "wg-midrange", "wubg-big-ramp", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "Heavenward Penitent": {
    tides: ["Celestial Reverie Combo", "Cheap Characters", "Spirit Animals"],
    colors: ["g", "ug", "bg", "rg", "wug", "ubg", "urg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubg-lands-soup", "ubg-ramp", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ur-storm", "urg-lands-soup", "wbrg-lands-soup", "wg-midrange", "wg-value-midrange", "wubg-big-ramp", "wubg-lands-soup", "wug-lands-soup", "wug-value"],
  },
  "Scorched Crusader": {
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["wg", "bg", "wug", "wbg", "wrg", "brg", "wubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "wbg-value-midrange", "wbg-weenie", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-value-midrange", "wr-artifacts", "wubg-artifact-control", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "Worldsong Behemoth": {
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "ubg", "brg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-lands-midrange", "g-big-ramp", "g-ramp", "rg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-ramp", "wbg-midrange", "wg-big-ramp", "wubrg-value", "wug-big-ramp", "wug-value", "wurg-artifacts"],
  },
  "Cinderblade Legionnaire": {
    colors: ["b", "wb", "ub", "br", "wub", "ubr", "brg", "wubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "ub-tempo", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wub-control"],
  },
  "Wondrous Clearing": {
    tides: ["Celestial Reverie Combo", "Cheap Characters"],
    colors: ["g", "wug", "wbg", "wrg", "ubg", "urg", "brg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "g-big-ramp", "rg-lands-soup", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wg-lands-soup", "wg-ramp", "wubg-lands-soup", "wug-big-ramp", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "Fell the Mighty": {
    core: true,
    colors: ["r", "wr", "ur", "br", "wur", "wbr", "ubr", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "brg-midrange", "r-aggro", "r-burn", "r-welder", "rg-midrange", "ubr-control", "ubr-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wubr-artifact-aggro", "wur-artifact-aggro"],
  },
  "Shared Revelation": {
    tides: ["Discard / Madness"],
    colors: ["u", "wu", "ub", "ur", "wub", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-control", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "urg-sneak", "wu-control", "wur-control"],
  },
  "Volcanic Channeler": {
    tides: ["Abandon", "Fading Farewell", "Reclaim Combo", "Survivors", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-midrange", "ubg-value-midrange", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbrg-aristocrats", "wu-artifact-control", "wub-control", "wub-weenie", "wubrg-value"],
  },
  "Fractured Vessel": {
    tides: ["Abandon"],
    colors: ["w", "u", "wu", "wb", "br", "bg", "wub", "wbr", "wbg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-weenie", "br-aristocrats", "urg-artifact-control", "wb-weenie", "wbg-value-midrange"],
  },
  "Clockwork Prodigy": {
    tides: ["Outsiders"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wur", "wug", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-reanimator", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-sneak", "wu-academy", "wu-artifact-control", "wu-control", "wub-artifact-control", "wub-control", "wubrg-lands-midrange", "wubrg-value", "wug-value", "wur-control"],
  },
  "Echoing Denial": {
    tides: ["Events", "Outsiders"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wur", "wug", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-reanimator", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-sneak", "wu-academy", "wu-artifact-control", "wu-control", "wub-artifact-control", "wub-control", "wubrg-lands-midrange", "wubrg-value", "wug-value", "wur-control"],
  },
  "Infernal Ascendant": {
    tides: ["Abandon", "Fading Farewell", "Reclaim Combo", "Storm", "Survivors", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["b", "wu", "wb", "wg", "br", "bg", "wbr", "wbg", "wrg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["b-weenie", "bg-midrange", "br-aristocrats", "brg-midrange", "ur-welder", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-artifact-aggro", "wbrg-aristocrats", "wr-artifacts", "wu-artifacts", "wubg-value", "wur-artifacts"],
  },
  "Shatter the Frail": {
    tides: ["Cheap Characters", "Discard / Madness", "Events", "Survivors"],
    colors: ["br", "bg", "ubg", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "ub-tempo", "ubg-value-midrange", "ubrg-storm", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wbrg-aristocrats"],
  },
  "Whisper of the Past": {
    tides: ["Cheap Characters", "Discard / Madness", "Events", "Survivors"],
    colors: ["br", "bg", "ubg", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "ub-tempo", "ubg-value-midrange", "ubrg-storm", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wbrg-aristocrats"],
  },
  "Northlight Maestro": {
    tides: ["Blink", "Outsiders"],
    colors: ["wu", "ub", "ur", "wurg"],
    draftArchetypes: ["u-big-mana-artifacts", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ubr-control", "ug-ramp", "ur-welder", "wu-blink", "wu-control", "wub-control", "wubg-value-midrange", "wubrg-value"],
  },
  "Data Pulse": {
    tides: ["Storm"],
    colors: ["wg", "ur", "ubr", "urg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-aristocrats", "rg-lands-soup", "rg-midrange", "ubr-storm", "ubrg-lands-soup", "ubrg-storm", "ur-spellslinger", "ur-storm", "urg-storm"],
  },
  "Dreaming Obelisk": {
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Storm", "Warrior Aggro", "Warrior Combo"],
    colors: ["r", "wu", "wr", "ub", "ur", "br", "wbr", "ubr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-welder", "ubr-control", "ubr-storm", "ur-academy", "ur-artifacts", "ur-storm", "ur-welder", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wubr-welder", "wur-academy", "wur-artifacts", "wurg-artifacts"],
  },
  "Radiant Trio": {
    tides: ["Abandon", "Spirit Animals"],
    colors: ["g", "wg", "ug", "wug", "wbg", "wrg", "ubg", "brg", "wubr", "wbrg", "ubrg"],
    draftArchetypes: ["bg-lands-midrange", "brg-lands-monsters", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "rg-midrange", "ubrg-lands-soup", "ug-big-ramp", "ug-cheaty-ramp", "ug-lands-soup", "ug-ramp", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-value-midrange", "wubg-lands-soup", "wubg-value", "wubg-value-midrange", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "Kindred Sparks": {
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "wbg", "brg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ubr-storm", "wb-weenie", "wbg-weenie", "wub-control"],
  },
  "Lunar Hart": {
    tides: ["Celestial Reverie Combo", "Spirit Animals", "Warrior Aggro"],
    core: true,
    colors: ["w", "u", "g", "wu", "wb", "wr", "wg", "ub", "ur", "ug", "bg", "wub", "wbr", "wbg", "ubr", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-lands-soup", "bg-midrange", "br-aristocrats", "g-big-ramp", "g-lands-soup", "r-aggro", "r-burn", "rg-midrange", "u-big-mana-artifacts", "u-storm", "ub-storm", "ub-tempo", "ubg-tempo", "ubr-storm", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "ur-artifacts", "ur-burn", "ur-storm", "ur-welder", "w-weenie", "wb-weenie", "wbg-midrange", "wg-big-ramp", "wg-midrange", "wub-control", "wub-weenie", "wubg-lands-soup", "wubg-value-midrange", "wubrg-lands-soup", "wug-value", "wur-artifacts"],
  },
  "Dreadlord": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro"],
    colors: ["u", "wu", "wr", "ub", "ur", "wub", "wur", "ubr", "wubr", "ubrg"],
    draftArchetypes: ["u-artifacts", "u-welder", "ub-storm", "ubg-value-midrange", "ubr-storm", "ubr-welder", "ur-artifacts", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubr-welder", "wur-artifacts", "wurg-artifacts"],
  },
  "Echo Technician": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Events", "Warrior Aggro"],
    colors: ["u", "wu", "wr", "ub", "ur", "wub", "wur", "ubr", "wubr", "ubrg"],
    draftArchetypes: ["u-artifacts", "u-welder", "ub-storm", "ubg-value-midrange", "ubr-storm", "ubr-welder", "ur-artifacts", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubr-welder", "wur-artifacts", "wurg-artifacts"],
  },
  "Dream Garden Visitor": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["u", "wu", "wr", "ub", "ur", "wub", "wur", "ubr", "wubr", "ubrg"],
    draftArchetypes: ["u-artifacts", "u-welder", "ub-storm", "ubg-value-midrange", "ubr-storm", "ubr-welder", "ur-artifacts", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubr-welder", "wur-artifacts", "wurg-artifacts"],
  },
  "Dreamcatcher's Call": {
    tides: ["Celestial Reverie Combo"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "ubg", "urg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubg-lands-soup", "ug-big-ramp", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wg-midrange", "wg-ramp", "wubg-lands-soup", "wubg-ramp", "wubrg-lands-midrange", "wubrg-lands-soup", "wubrg-value", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "Cinderheart": {
    tides: ["Abandon", "Fading Farewell", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["br", "wbr", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "brg-lands-midrange", "wbr-aristocrats", "wr-artifacts", "wub-control", "wubrg-value"],
  },
  "Urban Desperado": {
    colors: ["w", "wu", "wb", "wr", "wg", "wug", "wbg", "wubr", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-weenie", "wb-value", "wb-weenie", "wbrg-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wug-value", "wur-artifact-aggro"],
  },
  "Verdant Pioneer": {
    tides: ["Blink", "Cheap Characters"],
    colors: ["w", "wu", "wb", "wr", "wg", "wug", "wbg", "wubr", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-weenie", "wb-value", "wb-weenie", "wbrg-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wug-value", "wur-artifact-aggro"],
  },
  "Paradox Enforcer": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Survivors"],
    colors: ["b", "br", "bg", "wbg", "ubg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-midrange", "g-big-ramp", "ubg-tempo", "ubrg-lands-soup", "wbg-midrange", "wbg-weenie", "wbrg-aristocrats", "wubg-value-midrange", "wubrg-value", "wug-big-ramp"],
  },
  "Wistful Angler": {
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "ubg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "bg-midrange-reanimator", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "rg-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-ramp", "wubrg-lands-soup", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "Ashen Avenger": {
    tides: ["Discard / Madness"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "ubg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "bg-midrange-reanimator", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "rg-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-lands-soup", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-ramp", "wubrg-lands-soup", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "Liminal Dreamer": {
    tides: ["Discard / Madness"],
    colors: ["w", "r", "wu", "wr", "br", "rg", "wbr", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "r-welder", "ubr-welder", "ur-welder", "w-artifact-aggro", "w-weenie", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wubrg-value", "wur-artifact-aggro", "wur-artifacts"],
  },
  "Featherlight Summoner": {
    tides: ["Blink"],
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wur", "wug", "wbr", "wubr", "wurg", "wubrg"],
    draftArchetypes: ["r-aggro", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wbr-artifact-aggro", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wug-value"],
  },
  "Endless Projection": {
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["wg", "wug", "wbg", "wubg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["ubrg-lands-soup", "w-weenie", "wb-value", "wbg-midrange", "wbg-weenie", "wbrg-lands-soup", "wg-midrange", "wg-value-midrange", "wubg-big-ramp", "wubrg-value", "wug-big-ramp", "wug-lands-soup"],
  },
  "Dawnprowler Panther": {
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wbg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "g-big-ramp", "rg-midrange", "ug-big-ramp", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wubg-big-ramp", "wubg-value-midrange", "wurg-lands-soup"],
  },
  "Forge Inheritor": {
    colors: ["w", "g", "wu", "wb", "wr", "wg", "ub", "ug", "wub", "wug", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "ub-tempo", "ubrg-lands-soup", "ur-burn", "w-artifact-control", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wg-midrange", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-control", "wub-artifact-control", "wubg-big-ramp", "wubrg-lands-midrange", "wur-artifacts"],
  },
  "Rift Pilgrim": {
    tides: ["Blink"],
    colors: ["u", "wu", "ub", "ur", "wur", "wug", "ubr", "wubrg"],
    draftArchetypes: ["u-big-mana-artifacts", "ub-tempo", "ur-burn", "ur-spellslinger", "ur-welder", "urg-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wug-value", "wur-artifacts", "wur-control"],
  },
  "Sunset Chronicler": {
    tides: ["Abandon", "Celestial Reverie Combo", "Fading Farewell", "Wake the Fallen / Shadow March Combo"],
    colors: ["g", "wg", "ug", "rg", "wug", "wrg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-midrange", "urg-lands-soup", "wbg-value-midrange", "wbrg-aristocrats", "wg-big-ramp", "wubrg-value", "wug-big-ramp"],
  },
  "Vanishing Inquisitor": {
    tides: ["Blink", "Outsiders"],
    colors: ["u", "wu", "ub", "ur", "wub", "wubr", "wubrg"],
    draftArchetypes: ["ub-tempo", "ug-ramp", "ug-sneak", "ur-welder", "wu-control", "wub-control", "wug-value"],
  },
  "Heroic Rescue": {
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["wu", "wb", "wr", "bg", "wub", "wbg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "rg-lands-soup", "urg-lands-soup", "w-artifact-aggro", "w-weenie", "wb-weenie", "wbg-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wubg-artifacts", "wug-value", "wur-artifacts"],
  },
  "Dawnrunner": {
    colors: ["b", "wb", "ub", "br", "bg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ubg-lands-soup", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wubg-value-midrange"],
  },
  "Overstory Explorer": {
    tides: ["Abandon"],
    colors: ["g", "ug", "bg", "wug", "wbg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "g-big-ramp", "rg-lands-soup", "rg-midrange", "ubg-ramp", "ubrg-lands-soup", "ug-lands-soup", "urg-lands-soup", "wbrg-lands-soup", "wubg-big-ramp"],
  },
  "Across the Void": {
    tides: ["Discard / Madness"],
    colors: ["u", "ub", "ur", "ug", "wub", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["ub-storm", "ubg-tempo", "ubr-storm", "ubrg-lands-soup", "ur-burn", "ur-storm", "ur-welder", "urg-lands-soup", "urg-storm", "wub-control", "wubg-lands-soup"],
  },
  "Still Dreamer": {
    tides: ["Blink", "Celestial Reverie Combo", "Outsiders"],
    colors: ["w", "wu", "wb", "wg", "wug", "wbg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["r-aggro", "ubrg-lands-soup", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wg-midrange", "wg-ramp", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-weenie", "wub-control", "wubrg-lands-soup"],
  },
  "Spellweaver": {
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "ub", "wub", "wbr", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-artifact-control", "u-artifacts", "ubr-welder", "ur-welder", "w-artifact-control", "wu-academy", "wu-artifact-control", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-control", "wubrg-value", "wur-academy"],
  },
  "Lanternhearted": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Survivors"],
    colors: ["wu", "ur", "ug", "urg", "wubr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["ubrg-lands-soup", "wu-artifact-control", "wubg-value-midrange", "wubrg-value", "wug-big-ramp", "wur-control", "wurg-artifacts"],
  },
  "Grim Pursuer": {
    core: true,
  },
  "Vortex Claimant": {
    colors: ["wu", "wub", "wur", "wug", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["w-weenie", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wubg-artifact-control", "wubg-control", "wubr-artifact-aggro", "wubrg-value", "wug-value", "wur-control"],
  },
  "Silent Observer": {
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wur", "wug", "wbr", "wubg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-academy", "wu-artifact-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubrg-value", "wug-value", "wur-aggro"],
  },
  "The Devourer": {
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "rg", "wur", "wbr", "ubr", "brg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-aristocrats", "r-burn", "r-welder", "rg-midrange", "ubr-control", "ur-burn", "ur-spellslinger", "ur-welder", "wr-aggro", "wur-aggro", "wur-artifact-aggro", "wur-control"],
  },
  "Defiant Parry": {
    tides: ["Events", "Outsiders"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wug", "ubr", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-sneak", "urg-storm", "wu-artifact-control", "wu-control", "wub-control", "wubg-value-midrange", "wubr-welder", "wug-value", "wur-control"],
  },
  "Wraith of Twisting Shadows": {
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["g", "wug", "wbg", "brg", "wubg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-lands-soup", "rg-lands-soup", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wg-ramp", "wubg-value-midrange", "wug-value", "wurg-lands-soup"],
  },
  "Light of Emergence": {
    tides: ["Abandon", "Cheap Characters"],
    colors: ["g", "wug", "wbg", "brg", "wubg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-lands-soup", "rg-lands-soup", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wbg-value-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wg-ramp", "wubg-value-midrange", "wug-value", "wurg-lands-soup"],
  },
  "Seeker of the Radiant Wilds": {
    core: true,
    colors: ["ub", "wub", "ubr", "ubg", "wubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-control", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "wb-artifact-control", "wu-artifact-control", "wu-control", "wub-artifact-control", "wub-control", "wubg-artifact-control", "wubg-ramp", "wubrg-lands-soup"],
  },
  "Genesis Burst": {
    tides: ["Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["ub", "ur", "ug", "wub", "ubr", "wubrg"],
    draftArchetypes: ["u-artifact-control", "u-storm", "ub-storm", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wu-artifact-control", "wurg-artifacts"],
  },
  "Reforged Automaton": {
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "wu", "wr", "wub", "wur", "wbr", "wubg"],
    draftArchetypes: ["u-artifact-control", "ub-storm", "ur-welder", "w-artifact-control", "w-weenie", "wb-weenie", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubg-control", "wubg-value-midrange", "wubr-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "Verdant Pilgrim": {
    tides: ["Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "urg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "g-big-ramp", "g-lands-soup", "ubg-ramp", "ug-big-ramp", "ug-lands-midrange", "ug-ramp", "wbg-value-midrange", "wg-big-ramp", "wubg-big-ramp", "wubg-ramp"],
  },
  "Fell Swoop": {
    tides: ["Discard / Madness"],
    colors: ["r", "ur", "br", "ubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-storm", "r-aggro", "r-burn", "rg-midrange", "ubr-control", "ubr-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wr-aggro"],
  },
  "Wreckage Prowler": {
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo"],
    colors: ["ug", "bg", "rg", "urg", "brg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["brg-midrange", "rg-lands-soup", "rg-midrange", "ubg-lands-soup", "ubrg-storm", "ug-lands-soup", "urg-lands-soup", "wbrg-lands-soup", "wg-lands-soup", "wubrg-lands-midrange", "wubrg-lands-soup", "wurg-lands-soup"],
  },
  "Astral Angler": {
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["ug", "bg", "rg", "urg", "brg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["brg-midrange", "rg-lands-soup", "rg-midrange", "ubg-lands-soup", "ubrg-storm", "ug-lands-soup", "urg-lands-soup", "wbrg-lands-soup", "wg-lands-soup", "wubrg-lands-midrange", "wubrg-lands-soup", "wurg-lands-soup"],
  },
  "Forgotten Titan": {
    tides: ["Discard / Madness"],
    colors: ["br", "ubr", "brg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "brg-midrange", "r-aggro", "ubr-control", "wb-aristocrats"],
  },
  "Harborwarden": {
    tides: ["Abandon", "Discard / Madness", "Warrior Aggro", "Warrior Combo"],
    colors: ["br", "ubr", "brg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "brg-midrange", "r-aggro", "ubr-control", "wb-aristocrats"],
  },
  "Maelstrom Denial": {
    tides: ["Abandon", "Discard / Madness"],
    colors: ["b", "wb", "ub", "br", "ubr", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "brg-lands-monsters", "ub-tempo", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wubrg-value"],
  },
  "Junkfield Renegade": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "r", "wr", "ub", "ur", "br", "wur", "wbr", "ubr", "urg", "wubr"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-aggro", "u-artifacts", "u-welder", "ubr-control", "ubr-storm", "ur-artifacts", "ur-spellslinger", "ur-storm", "ur-welder", "urg-artifact-control", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wur-academy", "wur-artifacts"],
  },
  "Fern Treader": {
    colors: ["w", "u", "wu", "wb", "wg", "ub", "bg", "wbr", "ubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "br-welder", "brg-midrange", "ubg-lands-soup", "ubrg-lands-soup", "ug-ramp", "ur-academy", "ur-spellslinger", "ur-storm", "w-artifact-control", "wbg-midrange", "wub-artifact-control", "wubg-value-midrange", "wubrg-value", "wur-artifact-aggro", "wur-artifacts", "wurg-artifacts", "wurg-lands-soup"],
  },
  "Sanctum Awakened": {
    tides: ["Discard / Madness"],
    colors: ["u", "ub", "ur", "ug", "wub", "wur", "ubr", "ubg", "urg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ug-cheaty-ramp", "ug-ramp", "ur-burn", "ur-storm", "ur-welder", "urg-sneak", "wu-artifact-control", "wub-control", "wug-lands-soup", "wug-value", "wur-control"],
  },
  "Hatching Ground": {
    tides: ["Celestial Reverie Combo", "Spirit Animals", "Storm"],
    colors: ["u", "wu", "ur", "br", "wur", "wbg", "ubr", "urg", "wubr", "wubg", "ubrg"],
    draftArchetypes: ["u-storm", "ub-storm", "ubr-storm", "ubrg-storm", "ug-sneak", "ur-spellslinger", "ur-storm", "urg-storm"],
  },
  "Fury of the Clan": {
    tides: ["Abandon", "Warrior Aggro"],
    colors: ["r", "wr", "ur", "br", "rg", "wbr", "ubr"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "r-aggro", "r-burn", "rg-midrange", "ug-ramp", "ur-academy", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wubr-artifact-aggro", "wur-artifact-aggro"],
  },
  "Cosmic Puppeteer": {
    tides: ["Blink", "Outsiders"],
    colors: ["u", "wu", "ub", "ur", "wub", "wur", "ubr", "wubrg"],
    draftArchetypes: ["ub-tempo", "ubg-value-midrange", "ug-ramp", "ur-storm", "w-weenie", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubrg-value", "wug-value", "wur-artifacts"],
  },
  "Sage of the Prelude": {
    core: true,
    colors: ["g", "wu", "wg", "ug", "wug", "ubg", "urg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["rg-lands-soup", "ubg-value-midrange", "ubrg-lands-soup", "ug-lands-midrange", "ug-lands-soup", "ug-ramp", "wg-lands-soup", "wg-ramp", "wu-control", "wubg-value-midrange", "wubrg-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "Bladefall": {
    tides: ["Blink"],
    core: true,
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wur", "wug", "wbr", "wbg", "wrg", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "ub-storm", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-value", "wb-weenie", "wbg-weenie", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wubg-value-midrange", "wug-lands-soup", "wug-value", "wur-artifacts", "wur-control"],
  },
  "Carrion Lord": {
    tides: ["Abandon"],
    colors: ["g", "wg", "bg", "wub", "wbg", "wrg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-lands-midrange", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "rg-midrange", "ubg-value-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ug-sneak", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wubg-big-ramp", "wubg-lands-soup", "wubrg-lands-soup", "wug-big-ramp", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "Gleam Below": {
    tides: ["Events"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "wug", "ubr", "wubr", "wubg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ug-lands-midrange", "ug-ramp", "ug-sneak", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-storm", "wu-blink", "wu-control", "wubrg-value", "wug-lands-soup", "wug-value"],
  },
  "Momentum's Edge": {
    tides: ["Reclaim Combo", "Spirit Animals", "Survivors", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wb", "wg", "ub", "ur", "wub", "wrg", "wubr", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "bg-midrange", "brg-midrange", "g-big-ramp", "w-artifact-control", "w-weenie", "wb-weenie", "wbr-aristocrats", "wr-artifact-aggro", "wub-control", "wubg-big-ramp", "wur-artifacts"],
  },
  "Company Commander": {
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wug", "wbr", "ubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-welder", "ubg-value-midrange", "ur-academy", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wur-artifacts", "wurg-artifacts"],
  },
  "Shadowpaw": {
    tides: ["Discard / Madness"],
    colors: ["br", "rg", "wbr", "ubr", "brg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "br-welder", "u-welder", "wr-artifacts"],
  },
  "Selfless Rescuer": {
    tides: ["Reclaim Combo"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "wrg", "ubg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-lands-soup", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-value-midrange", "ubrg-lands-midrange", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wubg-big-ramp", "wubg-lands-soup", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "Ecliptic Vantage": {
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "ubr", "wubr", "wubg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifacts", "ub-reanimator", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-storm", "ur-welder", "urg-storm", "wbrg-lands-soup", "wu-artifact-control", "wu-blink", "wug-value", "wur-control"],
  },
  "Pulse of Sacrifice": {
    tides: ["Abandon", "Discard / Madness", "Storm", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["u", "wu", "wr", "wg", "ub", "ur", "ug", "wub", "wbr", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["br-welder", "brg-midrange", "u-storm", "ub-storm", "ubr-storm", "ur-burn", "ur-storm", "urg-storm", "wr-artifacts"],
  },
  "Shadow Reflection": {
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wbr", "wubr"],
    draftArchetypes: ["br-welder", "u-welder", "ubg-value-midrange", "ubr-welder", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wbr-artifact-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wubrg-value", "wur-artifacts"],
  },
  "Nexus Wayfinder": {
    tides: ["Abandon", "Blink", "Celestial Reverie Combo", "Cheap Characters", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "wrg", "ubg", "brg", "wubg", "wubrg"],
    draftArchetypes: ["bg-midrange", "g-big-ramp", "g-ramp", "ubg-ramp", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbg-midrange", "wbg-value-midrange", "wg-big-ramp", "wg-ramp", "wubg-big-ramp", "wubg-ramp", "wubg-value-midrange", "wug-value"],
  },
  "Specter of Silent Snow": {
    tides: ["Abandon", "Cheap Characters", "Discard / Madness", "Warrior Combo"],
    colors: ["wbr", "wbg", "wrg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "brg-midrange", "ubg-value-midrange", "ubrg-lands-soup", "wbrg-aristocrats", "wbrg-lands-soup", "wubrg-lands-midrange", "wug-value", "wurg-lands-soup"],
  },
  "Lone Castaway": {
    tides: ["Discard / Madness", "Spirit Animals"],
    colors: ["w", "u", "r", "wu", "wb", "wg", "ub", "ur", "ug", "br", "bg", "wub", "wur", "wbr", "wbg", "ubr", "wubr", "wubg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "br-welder", "rg-lands-soup", "ub-reanimator", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ur-storm", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wug-value", "wurg-lands-soup"],
  },
  "Tidecaller": {
    tides: ["Discard / Madness"],
    colors: ["w", "u", "wb", "wr", "ub", "br", "wub", "wbr", "wubr", "wurg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-aristocrats", "br-aristocrats", "br-welder", "ub-storm", "ub-tempo", "ubr-welder", "ur-welder", "wb-aristocrats", "wb-artifact-control", "wb-weenie", "wbrg-aristocrats", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-artifact-control"],
  },
  "Wired Duelist": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wbr"],
    draftArchetypes: ["bg-midrange", "u-artifact-control", "u-artifacts", "ubg-value-midrange", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wubrg-value", "wur-artifact-aggro", "wur-artifacts"],
  },
  "Steel Abomination": {
    tides: ["Cheap Characters", "Discard / Madness"],
    colors: ["g", "ug", "bg", "wug", "wbg", "ubg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "brg-lands-soup", "g-lands-soup", "rg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-cheaty-ramp", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "wbrg-lands-soup", "wubg-big-ramp", "wubg-lands-soup", "wubrg-lands-midrange", "wubrg-value", "wug-lands-soup"],
  },
  "Marrow Mimic": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "ub", "ur", "ug", "wub", "wbr", "ubr", "wurg", "ubrg"],
    draftArchetypes: ["u-artifacts", "ubr-storm", "ur-academy", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "wb-artifact-control", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubg-big-ramp", "wubg-lands-soup", "wur-artifacts", "wurg-welder"],
  },
  "Signal Resonant": {
    tides: ["Outsiders", "Storm", "Warrior Aggro"],
    colors: ["ub", "ubr", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "br-aristocrats", "ub-tempo", "wb-weenie"],
  },
  "Standoff": {
    tides: ["Outsiders"],
    colors: ["b", "wb", "ub", "ug", "br", "bg", "ubr", "ubg", "brg", "wubr", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-tempo", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbg-weenie", "wub-control", "wubg-artifact-control"],
  },
  "Break the Veil": {
    tides: ["Discard / Madness", "Events", "Survivors"],
    colors: ["bg", "ubg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "ub-tempo", "ubg-value-midrange", "wbr-aristocrats", "wub-artifact-control", "wub-control", "wubrg-value"],
  },
  "Planetgazer": {
    tides: ["Outsiders"],
    colors: ["u", "wu", "wg", "ub", "ur", "wub", "wug", "ubr", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["ub-tempo", "ubr-control", "ubr-storm", "ug-cheaty-ramp", "ur-storm", "wu-blink", "wu-control", "wubrg-value", "wug-value"],
  },
  "Clockwork Conductor": {
    tides: ["Celestial Reverie Combo", "Cheap Characters"],
    colors: ["u", "ug", "bg", "wbr", "wbg", "ubg", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "br-aristocrats", "brg-lands-soup", "brg-midrange", "g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-ramp", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "ur-welder", "urg-lands-soup", "wbg-midrange", "wbrg-lands-soup", "wg-lands-soup", "wr-artifact-aggro", "wu-artifact-control", "wubg-lands-soup", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "Shadowcaller": {
    tides: ["Abandon", "Discard / Madness", "Fading Farewell", "Survivors"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-midrange", "br-aristocrats", "brg-lands-soup", "brg-midrange", "ubg-tempo", "wbg-weenie", "wr-aggro"],
  },
  "Gilded Catalyst": {
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "wu", "wb", "wr", "br", "wub", "wur", "wbr", "wubg", "wubrg"],
    draftArchetypes: ["ur-artifacts", "urg-artifact-control", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wubg-artifact-control", "wubr-artifact-aggro", "wur-artifact-aggro", "wur-artifacts"],
  },
  "The Rising God": {
    tides: ["Discard / Madness", "Survivors"],
    colors: ["b", "wb", "br", "bg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie"],
  },
  "Ethereal Trailblazer": {
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wbg", "wrg", "urg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "bg-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "ubrg-lands-midrange", "ug-big-ramp", "ug-lands-soup", "ug-ramp", "wbrg-lands-soup", "wg-big-ramp", "wg-lands-soup", "wg-midrange", "wubg-ramp", "wubrg-value", "wug-value", "wurg-lands-soup"],
  },
  "Aspiring Guardian": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Fading Farewell", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "wub", "wbr", "wubrg"],
    draftArchetypes: ["br-welder", "brg-midrange", "u-artifacts", "u-welder", "ur-artifacts", "ur-welder", "urg-artifact-control", "w-academy", "w-artifact-control", "w-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-weenie", "wub-artifact-control", "wub-control", "wur-artifacts"],
  },
  "Blazepath Traveler": {
    tides: ["Blink"],
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wur", "wug", "wbg", "wubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wg-midrange", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubrg-value", "wug-value", "wur-artifacts", "wur-control"],
  },
  "Lumen Rover": {
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wur", "wug", "wbg", "wubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wg-midrange", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubrg-value", "wug-value", "wur-artifacts", "wur-control"],
  },
  "Forsaken Skyline": {
    tides: ["Abandon", "Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "rg", "ubr", "brg", "wubr", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-aristocrats", "r-burn", "ubr-control", "ur-burn", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wr-aggro", "wr-artifact-aggro", "wubrg-value", "wur-aggro"],
  },
  "Tranquil Duelist": {
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ug", "br", "wbr", "ubr", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "ub-storm", "ur-academy", "ur-artifacts", "ur-welder", "w-academy", "w-artifact-control", "wb-artifact-control", "wb-weenie", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-artifact-control", "wur-academy", "wur-artifacts", "wurg-artifacts"],
  },
  "Borrowed Minutes": {
    tides: ["Abandon", "Cheap Characters", "Reclaim Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["wb", "wg", "wbg", "wubg", "wbrg"],
    draftArchetypes: ["ubr-storm", "w-weenie", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wbr-aristocrats", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts"],
  },
  "Lumineth": {
    tides: ["Discard / Madness", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-lands-monsters", "brg-midrange", "g-big-ramp", "rg-midrange", "ubg-value-midrange", "ug-lands-soup", "ug-ramp", "ug-sneak", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wg-midrange", "wg-value-midrange", "wubg-big-ramp", "wubg-value", "wug-big-ramp", "wug-lands-soup"],
  },
  "Mirror Protocol": {
    tides: ["Abandon", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "wr", "br", "wub", "wur", "wbr", "wurg"],
    draftArchetypes: ["w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-artifact-control", "wubg-control", "wubrg-value", "wur-academy", "wur-artifacts"],
  },
  "Lightningborn": {
    tides: ["Blink"],
    core: true,
    colors: ["w", "wu", "wb", "wr", "wub", "wur", "wug", "wbr", "wubrg"],
    draftArchetypes: ["u-artifacts", "w-artifact-control", "w-weenie", "wb-value", "wb-weenie", "wbg-weenie", "wbr-aristocrats", "wbr-artifact-aggro", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubrg-lands-soup", "wubrg-value", "wur-artifacts"],
  },
  "Sorrowful Prince": {
    tides: ["Discard / Madness", "Warrior Aggro"],
    colors: ["r", "wu", "ur", "br", "ubr", "ubg", "brg", "wurg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ub-tempo", "ubr-control", "ubrg-storm", "ur-burn", "wbr-artifact-aggro", "wur-aggro"],
  },
  "Oblivion Guide": {
    tides: ["Discard / Madness"],
    colors: ["r", "wu", "ur", "br", "ubr", "ubg", "brg", "wurg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-monsters", "r-aggro", "r-burn", "ub-tempo", "ubr-control", "ubrg-storm", "ur-burn", "wbr-artifact-aggro", "wur-aggro"],
  },
  "The Grand Heist": {
    colors: ["w", "wu", "wb", "wub", "wur", "wug", "wbg", "wubr"],
    draftArchetypes: ["u-control", "w-artifact-aggro", "w-weenie", "wb-weenie", "wbr-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-blink", "wu-control", "wu-midrange-weenie", "wu-weenie", "wub-control", "wubg-control", "wubg-lands-soup", "wubrg-lands-soup", "wug-lands-soup", "wug-value", "wur-control"],
  },
  "Eclipse Herald": {
    tides: ["Fading Farewell", "Reclaim Combo", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "ug", "br", "wub", "wbr", "ubr", "wubr", "wubg", "ubrg"],
    draftArchetypes: ["br-welder", "g-big-ramp", "r-welder", "u-artifacts", "ub-storm", "ug-ramp", "ur-artifacts", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-value-midrange", "wg-midrange", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubrg-lands-midrange", "wug-big-ramp", "wur-artifacts", "wurg-welder"],
  },
  "Horizon Follower": {
    tides: ["Fading Farewell", "Reclaim Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "ug", "br", "wub", "wbr", "ubr", "wubr", "wubg", "ubrg"],
    draftArchetypes: ["br-welder", "g-big-ramp", "r-welder", "u-artifacts", "ub-storm", "ug-ramp", "ur-artifacts", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-value-midrange", "wg-midrange", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubrg-lands-midrange", "wug-big-ramp", "wur-artifacts", "wurg-welder"],
  },
  "Ashen Harbinger": {
    tides: ["Fading Farewell", "Outsiders", "Reclaim Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "ug", "br", "wub", "wbr", "ubr", "wubr", "wubg", "ubrg"],
    draftArchetypes: ["br-welder", "g-big-ramp", "r-welder", "u-artifacts", "ub-storm", "ug-ramp", "ur-artifacts", "ur-storm", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-value-midrange", "wg-midrange", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubrg-lands-midrange", "wug-big-ramp", "wur-artifacts", "wurg-welder"],
  },
  "Duskwall Delver": {
    tides: ["Abandon", "Fading Farewell", "Survivors", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "ub", "br", "bg", "wbr", "wbg", "ubg", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "ubrg-storm", "wb-weenie", "wbr-aristocrats", "wubg-control", "wubrg-value"],
  },
  "Saffron Trailblazer": {
    tides: ["Outsiders", "Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wbr", "ubr", "wubg"],
    draftArchetypes: ["br-aristocrats", "u-welder", "ubg-value-midrange", "ubr-welder", "ug-ramp", "ur-storm", "ur-welder", "urg-artifact-control", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wubrg-value"],
  },
  "Ebonwing": {
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "brg", "wbrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "g-big-ramp", "g-ramp", "ug-big-ramp", "ug-ramp", "urg-storm", "wbg-value-midrange", "wg-big-ramp", "wg-value-midrange", "wubg-big-ramp", "wubrg-lands-soup", "wug-big-ramp", "wug-value", "wurg-lands-soup"],
  },
  "Emerald Guardian": {
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wrg", "urg", "brg", "wbrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "rg-midrange", "ubrg-lands-soup", "ug-cheaty-ramp", "ug-lands-soup", "ug-ramp", "wg-midrange", "wg-ramp", "wg-value-midrange", "wubg-big-ramp", "wug-lands-soup", "wug-value", "wurg-lands-soup"],
  },
  "Spirit of Smoldering Echoes": {
    tides: ["Events"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-reanimator", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubg-lands-soup", "wubr-artifact-aggro", "wug-value", "wurg-artifacts"],
  },
  "Manufactured Abomination": {
    tides: ["Discard / Madness"],
    colors: ["u", "wu", "ub", "ur", "ug", "wub", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-reanimator", "ub-storm", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubg-lands-soup", "wubr-artifact-aggro", "wug-value", "wurg-artifacts"],
  },
  "Riftwalker": {
    tides: ["Outsiders"],
    colors: ["b", "wb", "ub", "br", "wub", "ubr", "ubg", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "wb-aristocrats", "wb-weenie", "wbr-aristocrats", "wubg-control"],
  },
  "Aftermath Bloom": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "ub", "ur", "ug", "br", "wub", "ubr", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "ub-storm", "ubr-storm", "ur-academy", "ur-storm", "ur-welder", "w-artifact-control", "wb-artifact-control", "wbrg-lands-soup", "wr-artifacts", "wu-academy", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wubg-artifacts", "wubr-welder", "wur-artifacts", "wurg-artifacts", "wurg-welder"],
  },
  "Evacuation Enforcer": {
    tides: ["Cheap Characters", "Discard / Madness", "Survivors"],
    draftArchetypes: ["br-sacrifice"],
  },
  "Pallid Arbiter": {
    colors: ["w", "u", "wu", "wb", "wr", "ub", "ur", "br", "bg", "wub", "wbr", "wubrg"],
    draftArchetypes: ["u-artifacts", "w-academy", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wbrg-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-lands-soup", "wubrg-value", "wur-aggro", "wur-artifact-aggro"],
  },
  "Melodist of the Finale": {
    tides: ["Abandon", "Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-lands-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "g-ramp", "rg-lands-soup", "rg-midrange", "ubg-value-midrange", "ubrg-storm", "ug-big-ramp", "ug-ramp", "ug-sneak", "wbg-midrange", "wbrg-lands-soup", "wg-big-ramp", "wg-midrange", "wu-artifact-control", "wubg-lands-soup", "wug-value", "wurg-artifacts", "wurg-lands-soup"],
  },
  "Fleeting Reunion": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Storm"],
    colors: ["br", "wrg", "ubr", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-burn", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wr-artifact-aggro", "wubrg-value", "wurg-artifacts"],
  },
  "Celestial Lookout": {
    tides: ["Abandon"],
    colors: ["g", "wg", "ug", "wug", "ubg", "urg", "wubg", "wurg", "ubrg"],
    draftArchetypes: ["g-big-ramp", "rg-lands-soup", "ubg-ramp", "ubrg-lands-soup", "ug-ramp", "wubg-artifacts", "wubg-big-ramp", "wubrg-lands-midrange", "wug-value", "wurg-artifacts", "wurg-lands-soup", "wurg-welder"],
  },
  "Cascading Detonation": {
    tides: ["Events", "Storm", "Wake the Fallen / Shadow March Combo"],
    colors: ["ur", "wbr", "ubr", "wubr", "ubrg"],
    draftArchetypes: ["br-storm", "r-burn", "ubr-storm", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "wr-artifact-aggro", "wubrg-value"],
  },
  "Radiant Convergence": {
    tides: ["Cheap Characters", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    draftArchetypes: ["wr-vanguard"],
  },
  "Thundercatcher": {
    tides: ["Abandon", "Spirit Animals", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "b", "g", "wu", "wb", "wr", "ub", "ur", "br", "bg", "wbr", "wbg", "ubr", "brg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-midrange", "br-aristocrats", "brg-midrange", "g-big-ramp", "r-aggro", "ub-tempo", "ur-control", "ur-welder", "w-weenie", "wb-weenie", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-weenie", "wub-weenie", "wubr-welder", "wug-big-ramp", "wug-value", "wurg-lands-soup"],
  },
  "Vaultbreaker": {
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo"],
    colors: ["wr", "br", "bg", "wrg", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-burn", "rg-lands-soup", "ur-burn", "ur-welder", "wbr-aristocrats", "wbrg-aristocrats", "wbrg-lands-soup", "wr-aggro", "wubg-lands-soup", "wubrg-lands-soup", "wur-artifacts"],
  },
  "Veilseeker": {
    tides: ["Abandon", "Cheap Characters", "Discard / Madness", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-lands-soup", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "g-big-ramp", "rg-lands-soup", "ubg-ramp", "ubrg-lands-soup", "ug-cheaty-ramp", "ug-lands-soup", "ug-ramp", "ug-sneak", "urg-lands-soup", "wg-lands-soup", "wurg-lands-soup"],
  },
  "Veil Shatter": {
    tides: ["Outsiders"],
    colors: ["w", "wu", "wr", "ug", "wub", "wug", "wbr", "wubr", "wubg", "wbrg"],
    draftArchetypes: ["g-big-ramp", "w-artifact-control", "w-weenie", "wb-weenie", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-blink", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubg-artifact-control", "wubg-value", "wubr-artifact-aggro", "wubrg-value", "wug-value", "wur-artifacts", "wur-control"],
  },
  "Ochre Prospector": {
    tides: ["Abandon", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "wu", "wr", "br", "wub", "wbr", "wbg", "ubr", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-welder", "u-control", "u-welder", "ubr-storm", "ubr-welder", "ur-storm", "ur-welder", "w-academy", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wubg-lands-soup", "wubr-welder", "wubrg-lands-midrange", "wubrg-value", "wur-artifacts", "wurg-welder"],
  },
  "Inferno's Herald": {
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Fading Farewell", "Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "g", "wu", "wb", "wr", "ug", "wug", "wbr", "ubr", "urg", "wubg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-welder", "u-artifacts", "ubr-welder", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbg-midrange", "wbg-value-midrange", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-artifact-control", "wur-artifact-aggro", "wur-artifacts", "wurg-artifacts"],
  },
  "Knowledge Restored": {
    tides: ["Discard / Madness"],
    colors: ["u", "wu", "ub", "ur", "ug", "wur", "ubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-storm", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "wu-control", "wubrg-value", "wug-value", "wur-aggro", "wur-control", "wurg-lands-soup"],
  },
  "Apocalypse Vigilante": {
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "ub", "br", "wub", "wbr", "wubr", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "br-welder", "u-artifacts", "ubr-storm", "ur-welder", "w-weenie", "wb-weenie", "wbr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-weenie", "wubr-welder"],
  },
  "Void Pilgrim": {
    tides: ["Discard / Madness"],
    colors: ["w", "u", "wu", "wb", "wr", "ub", "br", "wub", "wbr", "wbg", "brg", "wurg", "wubrg"],
    draftArchetypes: ["b-tempo", "br-aristocrats", "br-welder", "r-aggro", "r-burn", "ub-tempo", "ubr-control", "ug-cheaty-ramp", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wg-midrange", "wr-aggro", "wu-artifact-control", "wu-midrange-weenie", "wubr-artifact-aggro", "wubr-welder", "wubrg-value"],
  },
  "Starbound Striker": {
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wur", "wbr", "wubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifact-control", "u-artifacts", "ubg-value-midrange", "ur-academy", "ur-welder", "w-artifact-control", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-weenie", "wur-artifacts"],
  },
  "Prism Caller": {
    tides: ["Cheap Characters", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wb", "wr", "wub", "wur", "wbr", "wubg", "wubrg"],
    draftArchetypes: ["ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-value", "wb-weenie", "wbg-weenie", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wu-weenie", "wub-artifact-control", "wubrg-value", "wur-artifacts"],
  },
  "Flamestride Rider": {
    tides: ["Warrior Aggro"],
    colors: ["w", "wu", "wb", "wr", "br", "wub", "wbr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wubg-artifact-control", "wubg-control", "wubr-welder", "wur-academy", "wur-artifacts"],
  },
  "Invoker of Myths": {
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "wu", "wb", "wr", "br", "wub", "wbr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wubg-artifact-control", "wubg-control", "wubr-welder", "wur-academy", "wur-artifacts"],
  },
  "Cragfall": {
    tides: ["Outsiders"],
    colors: ["u", "wu", "ub", "ur", "ug", "bg", "wub", "ubr", "wubrg"],
    draftArchetypes: ["rg-lands-soup", "u-artifact-control", "u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-tempo", "ubg-tempo", "ubr-control", "ubr-storm", "ug-lands-midrange", "ug-ramp", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "ur-welder", "wu-artifact-control", "wu-blink", "wu-control", "wub-artifact-control", "wub-control", "wubg-value", "wubrg-value", "wug-lands-soup", "wug-value", "wur-academy", "wur-control"],
  },
  "Blazebound Sentinel": {
    tides: ["Spirit Animals"],
    colors: ["g", "ug", "bg", "rg", "wug", "wbg", "brg", "wurg", "wubrg"],
    draftArchetypes: ["bg-aristocrats", "bg-lands-midrange", "bg-midrange", "brg-lands-monsters", "g-big-ramp", "g-lands-soup", "rg-midrange", "ubg-ramp", "ubrg-lands-soup", "ug-big-ramp", "ug-cheaty-ramp", "ug-lands-soup", "ug-ramp", "wg-big-ramp", "wg-ramp", "wubg-ramp", "wubrg-value", "wug-value", "wurg-artifacts"],
  },
  "Break the Sequence": {
    tides: ["Outsiders"],
    colors: ["u", "g", "wu", "ub", "ur", "ug", "wub", "wur", "wug", "ubr", "ubg", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-tempo", "ubg-lands-soup", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "wu-blink", "wu-control", "wub-control", "wubg-lands-soup", "wubrg-lands-soup", "wubrg-value", "wug-value"],
  },
  "Cloudmantle Ray": {
    tides: ["Blink", "Cindermarch / Shadow Soloist Combo", "Reclaim Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "wrg", "urg", "brg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "brg-lands-soup", "g-big-ramp", "rg-lands-soup", "rg-midrange", "ubrg-lands-midrange", "ubrg-lands-soup", "ug-lands-soup", "ug-ramp", "urg-lands-soup", "urg-sneak", "wbg-midrange", "wbrg-lands-soup", "wg-midrange", "wg-ramp", "wubg-big-ramp", "wubg-value-midrange", "wubrg-lands-midrange", "wug-value"],
  },
  "Crimson Pilgrimage": {
    colors: ["u", "ur", "ubr", "urg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["ubr-control", "ubr-storm", "ubrg-lands-soup", "ubrg-storm", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-storm", "wubrg-value", "wurg-lands-soup"],
  },
  "Sundown Surfer": {
    core: true,
    colors: ["w", "r", "wu", "wb", "wr", "ur", "br", "wub", "wur", "wug", "wbr", "wbg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["br-welder", "r-aggro", "ur-welder", "w-academy", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wbr-aristocrats", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-blink", "wu-midrange-weenie", "wu-weenie", "wub-artifact-control", "wub-weenie", "wurg-welder"],
  },
  "Pit Descender": {
    tides: ["Abandon", "Cheap Characters", "Cindermarch / Shadow Soloist Combo", "Discard / Madness", "Warrior Aggro", "Warrior Combo"],
    colors: ["u", "r", "wr", "ub", "ur", "br", "wur", "wbr", "ubr"],
    draftArchetypes: ["br-aristocrats", "br-welder", "r-aggro", "u-artifacts", "ubr-welder", "ur-artifacts", "ur-welder", "wr-artifact-aggro", "wr-artifacts", "wu-artifacts", "wubg-artifact-control", "wubr-welder", "wur-artifacts", "wurg-artifacts", "wurg-welder"],
  },
  "Roots of Rebirth": {
    tides: ["Blink", "Cheap Characters", "Spirit Animals"],
    colors: ["g", "wg", "ug", "rg", "wug", "wbg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-midrange", "bg-midrange", "g-big-ramp", "ubg-value-midrange", "ug-ramp", "wbg-midrange", "wbg-value-midrange", "wg-big-ramp", "wg-midrange", "wubg-artifact-control", "wubg-ramp", "wug-value", "wurg-lands-soup"],
  },
  "Apocalypse": {
    colors: ["wb", "wub", "wbr", "ubr", "brg", "wubg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "bg-midrange", "br-aristocrats", "ub-tempo", "ubrg-lands-soup", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wub-control", "wubg-big-ramp", "wubg-value-midrange"],
  },
  "Skyborne Jellyfish": {
    tides: ["Celestial Reverie Combo", "Cheap Characters", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "urg", "brg", "wubr", "wubrg"],
    draftArchetypes: ["bg-lands-midrange", "bg-midrange", "brg-lands-midrange", "brg-midrange", "g-big-ramp", "g-lands-soup", "ubg-ramp", "ubrg-lands-soup", "ug-big-ramp", "ug-ramp", "urg-lands-soup", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-big-ramp", "wubrg-lands-midrange", "wug-value", "wur-artifacts", "wurg-lands-soup"],
  },
  "Wreckheap Survivor": {
    tides: ["Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "ubg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-reanimator", "ub-tempo", "ubr-control", "wb-aristocrats", "wb-weenie", "wbr-aristocrats", "wubg-control"],
  },
  "Soulbinder": {
    tides: ["Abandon", "Discard / Madness", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["r", "ur", "br", "wrg", "ubr", "brg", "wubr", "wbrg"],
    draftArchetypes: ["brg-lands-soup", "rg-lands-soup", "ubrg-lands-soup", "urg-storm", "wbr-aristocrats", "wbrg-lands-soup", "wr-artifacts"],
  },
  "Emberwatch Veteran": {
    tides: ["Discard / Madness", "Survivors"],
    colors: ["br", "bg", "ubr", "ubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "brg-lands-monsters", "ub-reanimator", "ub-tempo", "wb-weenie", "wbg-weenie", "wg-midrange"],
  },
  "Vessel of Echoes": {
    tides: ["Discard / Madness", "Survivors"],
    colors: ["br", "bg", "ubr", "ubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "brg-lands-monsters", "ub-reanimator", "ub-tempo", "wb-weenie", "wbg-weenie", "wg-midrange"],
  },
  "Hope's Vanguard": {
    tides: ["Abandon", "Discard / Madness", "Survivors"],
    colors: ["br", "bg", "wub", "wbg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "bg-midrange", "br-aristocrats", "brg-midrange", "wb-weenie", "wbg-weenie", "wbrg-aristocrats", "wubrg-value"],
  },
  "Keeper of the Tides": {
    tides: ["Outsiders"],
    colors: ["u", "wu", "ub", "ur", "wub", "ubr", "wubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-control", "ub-tempo", "ubr-control", "ug-ramp", "ur-storm", "ur-welder", "wb-weenie", "wu-blink", "wu-control", "wub-control", "wug-value", "wur-artifacts"],
  },
  "Dustborn Veteran": {
    tides: ["Abandon", "Survivors"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-tempo", "ubr-storm", "wb-weenie", "wbg-weenie", "wbr-aristocrats", "wbrg-aristocrats"],
  },
  "Looming Oracle": {
    tides: ["Blink"],
    core: true,
    colors: ["w", "wu", "wb", "wg", "wub", "wug", "wubg", "wurg", "wbrg", "wubrg"],
    draftArchetypes: ["ubg-lands-soup", "w-artifact-control", "w-weenie", "wbrg-lands-soup", "wg-midrange", "wg-value-midrange", "wu-academy", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wug-value"],
  },
  "Packcaller of Shadows": {
    tides: ["Abandon", "Storm"],
    colors: ["g", "wg", "ug", "bg", "rg", "wbg", "ubr", "ubg", "urg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["brg-midrange", "g-big-ramp", "u-storm", "ubr-storm", "ubrg-storm", "ur-storm", "urg-storm", "wbrg-aristocrats", "wurg-artifacts"],
  },
  "Boundless Wanderer": {
    tides: ["Outsiders", "Spirit Animals", "Storm", "Warrior Aggro"],
    colors: ["w", "wb", "wr", "br", "rg", "wbr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["ur-spellslinger", "w-artifact-control", "w-weenie", "wb-weenie", "wbrg-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-big-ramp", "wug-big-ramp"],
  },
  "Field Reverent": {
    tides: ["Celestial Reverie Combo", "Spirit Animals", "Storm", "Warrior Aggro"],
    colors: ["w", "wb", "wr", "br", "rg", "wbr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["ur-spellslinger", "w-artifact-control", "w-weenie", "wb-weenie", "wbrg-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubg-big-ramp", "wug-big-ramp"],
  },
  "Conjured Zenith": {
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo"],
    colors: ["w", "wu", "wb", "wr", "br", "wub", "wbr", "wbg", "wubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["b-weenie", "bg-midrange", "w-weenie", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wr-aggro", "wr-artifact-aggro", "wu-control", "wub-artifact-control", "wub-control", "wubrg-value", "wur-aggro"],
  },
  "Dawnhorn Elder": {
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "rg", "wug", "wbg", "ubg", "urg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-lands-soup", "bg-midrange", "brg-lands-monsters", "g-big-ramp", "ubg-ramp", "ug-lands-midrange", "ug-ramp", "wbg-midrange", "wg-big-ramp", "wg-midrange", "wg-ramp", "wubg-ramp", "wug-value"],
  },
  "Embersummoner": {
    tides: ["Abandon", "Cindermarch / Shadow Soloist Combo"],
    colors: ["r", "g", "ug", "bg", "wug", "wbg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-midrange", "g-big-ramp", "ubr-control", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wg-midrange", "wubg-value-midrange", "wubrg-value"],
  },
  "Shardwoven Tyrant": {
    tides: ["Abandon"],
    colors: ["r", "g", "ug", "bg", "wug", "wbg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-midrange", "g-big-ramp", "ubr-control", "wbg-midrange", "wbg-value-midrange", "wbg-weenie", "wbrg-aristocrats", "wg-midrange", "wubg-value-midrange", "wubrg-value"],
  },
  "Grounded": {
    tides: ["Events", "Outsiders"],
    colors: ["w", "wu", "wb", "wr", "wg", "wub", "wug", "wbg", "wubg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["brg-lands-soup", "rg-lands-soup", "w-artifact-aggro", "w-weenie", "wb-value", "wb-weenie", "wbg-midrange", "wbrg-lands-soup", "wg-lands-soup", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wu-blink", "wu-control", "wub-control", "wubg-artifact-control", "wubrg-lands-soup", "wubrg-value", "wug-value", "wur-control", "wurg-lands-soup"],
  },
  "Through the Rift": {
    tides: ["Spirit Animals"],
    colors: ["w", "wu", "wb", "wg", "ug", "wub", "wbr", "wbg", "ubr", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-aristocrats", "wb-weenie", "wbr-aristocrats", "wbrg-aristocrats", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wubg-big-ramp", "wubg-lands-soup", "wubrg-lands-soup", "wug-lands-soup", "wur-artifacts", "wur-control"],
  },
  "Twilight Suppressor": {
    tides: ["Abandon", "Celestial Reverie Combo", "Reclaim Combo", "Warrior Combo"],
    colors: ["wb", "ub", "ur", "br", "wbr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "brg-midrange", "ur-welder", "w-weenie", "wb-weenie", "wbg-midrange", "wbr-aristocrats", "wu-artifact-control", "wu-artifacts", "wub-control", "wubrg-value", "wurg-artifacts"],
  },
  "Iconoclast": {
    tides: ["Discard / Madness", "Storm"],
    colors: ["r", "wr", "ur", "br", "rg", "ubr", "urg", "wurg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "brg-midrange", "r-burn", "ub-storm", "ubr-storm", "ur-academy", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wr-aggro", "wur-academy", "wur-artifacts"],
  },
  "Starcatcher": {
    tides: ["Events", "Storm"],
    colors: ["r", "wr", "ur", "br", "rg", "ubr", "urg", "wurg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "brg-midrange", "r-burn", "ub-storm", "ubr-storm", "ur-academy", "ur-spellslinger", "ur-storm", "urg-lands-soup", "wr-aggro", "wur-academy", "wur-artifacts"],
  },
  "Seedling Sage": {
    tides: ["Celestial Reverie Combo", "Cindermarch / Shadow Soloist Combo", "Spirit Animals"],
    colors: ["w", "u", "wu", "wr", "ub", "bg", "wub", "wbr", "wubrg"],
    draftArchetypes: ["u-artifacts", "ubg-value-midrange", "ubrg-lands-soup", "ur-spellslinger", "w-academy", "w-artifact-aggro", "w-weenie", "wbr-artifact-aggro", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wub-artifact-control", "wubg-value-midrange", "wubr-welder", "wubrg-value", "wur-academy", "wurg-artifacts"],
  },
  "Starfall Communion": {
    tides: ["Discard / Madness"],
    colors: ["wr", "ub", "ur", "br", "rg", "wur", "wbr", "ubr", "brg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-storm", "brg-lands-midrange", "brg-midrange", "r-burn", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "wr-aggro", "wur-aggro", "wur-artifact-aggro"],
  },
  "Fractured Veil": {
    tides: ["Discard / Madness"],
    colors: ["u", "wu", "ub", "ur", "ug", "wug", "ubr", "wubg", "ubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-lands-soup", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "wu-artifact-control", "wu-blink", "wub-control", "wubg-lands-soup", "wubrg-value", "wug-value", "wur-control", "wurg-welder"],
  },
  "Forgotten Factory Titan": {
    tides: ["Blink", "Celestial Reverie Combo"],
    colors: ["w", "wu", "wr", "wg", "wub", "wbr", "wbrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wbg-weenie", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wu-blink", "wu-midrange-weenie", "wub-control", "wubrg-value", "wug-value"],
  },
  "The Power Within": {
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["wu", "ub", "ur", "wub", "wur", "wug", "ubr", "wubrg"],
    draftArchetypes: ["br-aristocrats", "br-welder", "g-big-ramp", "u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-storm", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-control", "ur-spellslinger", "ur-storm", "urg-storm", "wub-artifact-control", "wub-control", "wug-value", "wur-artifacts", "wur-control"],
  },
  "Ironclad Holdout": {
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ur", "br", "wub", "wur", "wug", "wbr", "wubg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "ug-sneak", "ur-artifacts", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wub-artifact-control", "wubrg-value", "wur-academy"],
  },
  "Inspiring Templar": {
    tides: ["Warrior Aggro"],
    colors: ["u", "r", "wu", "wr", "ub", "wub", "ubr", "wubrg"],
    draftArchetypes: ["u-artifacts", "ur-storm", "ur-welder", "urg-artifact-control", "w-academy", "w-artifact-control", "w-weenie", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-artifact-control", "wubr-artifact-aggro", "wur-academy", "wur-artifact-aggro"],
  },
  "Ethereal Courser": {
    tides: ["Blink", "Celestial Reverie Combo", "Outsiders"],
    colors: ["g", "wu", "wg", "ur", "ug", "wug", "wbr", "ubr", "wubg", "wurg"],
    draftArchetypes: ["ubg-value-midrange", "ug-ramp", "wb-value", "wu-artifact-control", "wubrg-value", "wug-value", "wur-artifacts", "wur-control"],
  },
  "Stoneborn Eternal": {
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "brg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "g-big-ramp", "ubg-value-midrange", "ug-ramp", "wbg-midrange", "wg-big-ramp", "wg-midrange", "wu-artifact-control"],
  },
  "A New Adventure": {
    tides: ["Discard / Madness", "Storm"],
    colors: ["u", "ub", "ur", "ug", "wug", "ubr", "urg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-storm", "ug-ramp", "ug-sneak", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wubrg-value", "wur-control"],
  },
  "Dragonward": {
    tides: ["Blink", "Cheap Characters"],
    colors: ["r", "wr", "ur", "br", "rg", "wur", "urg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "r-aggro", "r-aristocrats", "r-burn", "ubr-control", "ubrg-lands-soup", "ur-burn", "ur-control", "ur-spellslinger", "ur-welder", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wurg-lands-soup"],
  },
  "Soulreaver": {
    tides: ["Abandon", "Celestial Reverie Combo", "Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "brg", "wubr", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-tempo", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wubg-control", "wubrg-value"],
  },
  "Entropy Spike": {
    tides: ["Abandon"],
    colors: ["b", "wb", "br", "bg", "wub", "wbr", "wbg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "wb-aristocrats", "wb-weenie", "wbg-weenie"],
  },
  "Glimpse of Infinity": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Storm", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "u", "b", "g", "wu", "wb", "wr", "ur", "ug", "br", "wub", "wug", "wbr", "ubr", "ubg", "wubr", "ubrg", "wubrg"],
    draftArchetypes: ["b-tempo", "br-aristocrats", "g-big-ramp", "g-ramp", "r-burn", "rg-midrange", "u-artifacts", "u-control", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "w-artifact-aggro", "w-artifact-control", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbrg-lands-soup", "wg-midrange", "wr-aggro", "wu-academy", "wub-artifact-control", "wub-control", "wubg-big-ramp", "wubrg-value", "wug-lands-soup", "wug-value", "wur-artifacts"],
  },
  "Silent Gatherer": {
    tides: ["Discard / Madness", "Storm"],
    colors: ["ur", "br", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "ubg-value-midrange", "ur-burn", "ur-control", "ur-spellslinger", "wbg-value-midrange", "wubg-value-midrange", "wur-artifacts"],
  },
  "Archive of the Forgotten": {
    tides: ["Events", "Storm"],
    colors: ["ub", "ur", "ubr", "brg", "wubrg"],
    draftArchetypes: ["br-storm", "r-aristocrats", "r-burn", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-storm", "wurg-artifacts"],
  },
  "Mirrorlight Architect": {
    tides: ["Cindermarch / Shadow Soloist Combo"],
    colors: ["w", "wu", "wg", "ur", "wur", "wbr", "wbg"],
    draftArchetypes: ["ubg-value-midrange", "ur-burn", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wr-aggro", "wr-artifact-aggro", "wu-artifact-control", "wubg-value-midrange", "wubrg-value", "wug-value"],
  },
  "Shadowprowler": {
    tides: ["Discard / Madness"],
    colors: ["r", "wr", "ur", "br", "rg", "wbr", "ubr", "brg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "rg-midrange", "ubrg-storm", "ur-burn", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wur-aggro", "wurg-lands-soup"],
  },
  "Pattern Seeker": {
    tides: ["Discard / Madness", "Storm"],
    colors: ["r", "wr", "ur", "br", "rg", "wbr", "ubr", "brg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "rg-midrange", "ubrg-storm", "ur-burn", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wur-aggro", "wurg-lands-soup"],
  },
  "Shadow March": {
    tides: ["Abandon", "Cheap Characters", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["w", "wu", "wb", "wr", "wbr", "wbg", "wubg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "u-welder", "urg-lands-soup", "wb-weenie", "wbg-value-midrange", "wbrg-lands-soup", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-lands-soup", "wubrg-lands-soup", "wubrg-value", "wug-value", "wur-artifacts"],
  },
  "Ashborn Necromancer": {
    tides: ["Abandon", "Reclaim Combo", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "wbr", "wbg", "ubr", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange-reanimator", "br-aristocrats", "brg-midrange", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie"],
  },
  "Lord of Hidden Paths": {
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    colors: ["g", "wg", "ug", "br", "wug", "wbg", "wrg", "wurg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "ug-big-ramp", "ug-ramp", "wbg-weenie", "wbrg-aristocrats", "wbrg-lands-soup", "wg-ramp", "wubg-big-ramp", "wubg-ramp", "wubrg-value", "wug-big-ramp"],
  },
  "Prophet of the Consumed": {
    tides: ["Blink", "Celestial Reverie Combo", "Cheap Characters", "Storm"],
    colors: ["ur", "ug", "bg", "wub", "ubg", "urg", "wubr", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["g-big-ramp", "g-lands-soup", "rg-lands-soup", "ubg-lands-soup", "ubg-ramp", "ubg-value-midrange", "ubrg-lands-soup", "ug-lands-midrange", "ug-ramp", "ur-storm", "urg-lands-soup", "wg-lands-soup", "wubg-ramp", "wubrg-lands-soup", "wug-value"],
  },
  "Silent Avenger": {
    tides: ["Abandon", "Celestial Reverie Combo", "Discard / Madness", "Fading Farewell", "Reclaim Combo", "Storm", "Survivors", "Wake the Fallen / Shadow March Combo", "Warrior Combo"],
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "brg", "wubg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ub-storm", "w-weenie", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wub-control", "wubg-control"],
  },
  "Wandering Archivist": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness"],
    colors: ["wr", "wg", "ur", "br", "wbr", "ubr", "urg", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-control", "ur-spellslinger", "ur-storm", "wr-aggro"],
  },
  "Rubble Diviner": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Discard / Madness"],
    colors: ["wr", "wg", "ur", "br", "wbr", "ubr", "urg", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "r-aggro", "r-burn", "ubr-control", "ubr-storm", "ur-control", "ur-spellslinger", "ur-storm", "wr-aggro"],
  },
  "Veilpiercer": {
    tides: ["Blink"],
    colors: ["wu", "wug", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["ug-ramp", "ur-storm", "wg-midrange", "wu-artifact-control", "wu-artifacts", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wubg-ramp", "wubg-value-midrange", "wug-value", "wur-control", "wurg-lands-soup"],
  },
  "Ridge Vortex Explorer": {
    tides: ["Discard / Madness"],
    colors: ["g", "rg", "wug", "wbg", "ubr", "ubg", "brg", "ubrg"],
    draftArchetypes: ["bg-midrange", "brg-lands-midrange", "wubrg-value"],
  },
  "Crumbling Behemoth": {
    tides: ["Spirit Animals"],
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "brg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-lands-monsters", "g-big-ramp", "g-lands-soup", "g-ramp", "ubg-tempo", "ug-ramp", "wg-midrange", "wg-value-midrange", "wubg-lands-soup", "wubg-value", "wug-big-ramp", "wug-value", "wurg-lands-soup"],
  },
  "Beacon of Tomorrow": {
    tides: ["Celestial Reverie Combo", "Spirit Animals"],
    core: true,
    colors: ["g", "wg", "ug", "bg", "wug", "wbg", "ubg", "brg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-lands-monsters", "g-big-ramp", "g-lands-soup", "g-ramp", "ubg-tempo", "ug-ramp", "wg-midrange", "wg-value-midrange", "wubg-lands-soup", "wubg-value", "wug-big-ramp", "wug-value", "wurg-lands-soup"],
  },
  "Twilight Reclaimer": {
    tides: ["Abandon", "Survivors"],
    colors: ["b", "wb", "br", "bg", "wbg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "wb-weenie", "wbg-weenie", "wbrg-aristocrats"],
  },
  "Cinderfang": {
    tides: ["Abandon", "Survivors", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "bg", "wbg", "brg", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "wb-weenie", "wbg-weenie", "wbrg-aristocrats"],
  },
  "Harvester of Despair": {
    tides: ["Abandon", "Survivors", "Wake the Fallen / Shadow March Combo"],
    colors: ["b", "wb", "br", "bg", "wub", "wbg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-aristocrats", "bg-midrange", "br-aristocrats", "brg-lands-midrange", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wg-value-midrange", "wubrg-value"],
  },
  "Emberfang": {
    tides: ["Warrior Aggro"],
    colors: ["w", "u", "r", "g", "wu", "wb", "wr", "wg", "ub", "ur", "br", "bg", "wub", "wbr", "ubr", "ubrg"],
    draftArchetypes: ["b-tempo", "br-aristocrats", "g-big-ramp", "r-burn", "u-artifacts", "u-big-mana-artifacts", "u-welder", "ubg-value-midrange", "ubr-storm", "ug-ramp", "ur-storm", "ur-welder", "urg-storm", "w-academy", "w-artifact-control", "w-weenie", "wb-aristocrats", "wb-weenie", "wbr-aristocrats", "wg-midrange", "wr-artifact-aggro", "wu-artifact-control", "wub-control", "wub-weenie", "wubr-welder", "wug-value", "wur-artifacts", "wurg-lands-soup"],
  },
  "Herald of the Last Light": {
    tides: ["Abandon", "Warrior Combo"],
    colors: ["b", "br", "bg", "wbg", "brg", "wubg", "wurg", "wubrg"],
    draftArchetypes: ["bg-midrange", "brg-lands-midrange", "brg-lands-monsters", "ubr-welder", "wb-weenie", "wbg-midrange", "wbg-weenie", "wbrg-aristocrats", "wubg-control", "wubg-value-midrange"],
  },
  "Starfall": {
    tides: ["Storm"],
    colors: ["b", "wb", "ub", "ur", "bg", "wub", "ubr", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-midrange", "br-aristocrats", "br-storm", "ub-storm", "ub-tempo", "ubr-storm", "ur-storm", "wb-aristocrats", "wb-weenie"],
  },
  "Demonbane": {
    tides: ["Abandon"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wur", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "u-artifacts", "ubg-tempo", "ubg-value-midrange", "ug-ramp", "ur-academy", "ur-welder", "w-academy", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-value-midrange", "wr-artifact-aggro", "wu-artifact-control", "wu-artifacts", "wu-midrange-weenie", "wub-artifact-control", "wubg-artifact-control", "wubrg-value", "wur-academy", "wurg-artifacts"],
  },
  "Warfield Stalwart": {
    tides: ["Abandon"],
    colors: ["w", "wb", "br", "wub", "wbr", "wbg", "wubg"],
    draftArchetypes: ["b-weenie", "wb-aristocrats", "wb-value", "wb-weenie", "wbg-value-midrange", "wub-artifact-control", "wub-control", "wub-weenie", "wubg-artifact-control", "wubg-control", "wubrg-value"],
  },
  "Ambush Operative": {
    tides: ["Blink", "Outsiders"],
    core: true,
    colors: ["w", "wu", "wb", "wg", "wub", "wbr", "wbg", "wrg", "wubr", "wubg", "wubrg"],
    draftArchetypes: ["ur-control", "w-artifact-control", "w-weenie", "wb-aristocrats", "wb-artifact-control", "wb-weenie", "wbg-weenie", "wbr-artifact-aggro", "wg-midrange", "wg-value-midrange", "wr-aggro", "wu-artifact-control", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-artifact-control", "wub-control", "wubg-control", "wubrg-value", "wug-value", "wur-aggro", "wur-control"],
  },
  "Searcher in the Mists": {
    tides: ["Abandon", "Discard / Madness", "Storm", "Survivors"],
    colors: ["b", "br", "bg", "wub", "wbg", "ubg", "brg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "ub-tempo", "ubg-lands-soup", "ubg-tempo", "wb-weenie", "wbg-weenie", "wub-control", "wubrg-value"],
  },
  "Blade of Unity": {
    tides: ["Reclaim Combo"],
    colors: ["w", "u", "wu", "wb", "wg", "ub", "ur", "ug", "br", "wub", "wug", "wbr", "wubrg"],
    draftArchetypes: ["bg-midrange", "br-aristocrats", "brg-midrange", "r-aggro", "u-artifact-control", "u-artifacts", "ub-storm", "ug-ramp", "ur-artifacts", "ur-burn", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-weenie", "wbr-aristocrats", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubr-welder", "wur-academy"],
  },
  "Carrion Shepherd": {
    tides: ["Abandon"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbr", "wbg", "brg", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-lands-midrange", "brg-lands-monsters", "ub-tempo", "ubg-tempo", "wb-weenie", "wbg-value-midrange"],
  },
  "Phantasmal Recruiter": {
    tides: ["Abandon", "Warrior Aggro", "Warrior Combo"],
    colors: ["wb", "wg", "br", "wbr", "wbg", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["wb-weenie", "wr-artifacts", "wur-artifacts"],
  },
  "Duskmount": {
    tides: ["Blink", "Cindermarch / Shadow Soloist Combo", "Outsiders"],
    colors: ["w", "wu", "wub", "wug", "wubg", "wubrg"],
    draftArchetypes: ["urg-lands-soup", "w-weenie", "wu-blink", "wu-control", "wubg-lands-soup", "wubg-value-midrange", "wug-lands-soup", "wug-value", "wur-artifacts", "wurg-lands-soup"],
  },
  "Veil of the Wastes": {
    tides: ["Discard / Madness", "Survivors"],
    colors: ["b", "wb", "ub", "br", "bg", "wbr", "wbg", "ubr", "ubg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "ubg-tempo", "ubg-value-midrange", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wubg-value-midrange"],
  },
  "Abolish": {
    core: true,
    colors: ["u", "wu", "ub", "ur", "wub", "wug", "ubr", "wubg", "wubrg"],
    draftArchetypes: ["u-artifacts", "u-big-mana-artifacts", "u-storm", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "ur-storm", "ur-welder", "urg-lands-soup", "urg-sneak", "urg-storm", "wu-artifact-control", "wu-blink", "wu-control", "wub-control", "wubg-lands-soup", "wubg-value", "wug-value", "wur-control"],
  },
  "Wasteland Arbitrator": {
    tides: ["Discard / Madness", "Survivors"],
    colors: ["b", "wb", "br", "bg", "wbr", "ubr", "brg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "ub-tempo", "wb-aristocrats", "wb-weenie", "wubg-lands-soup"],
  },
  "Blade of Oblivion": {
    tides: ["Abandon", "Discard / Madness"],
    colors: ["r", "wu", "ur", "ug", "ubr", "wubrg"],
    draftArchetypes: ["ub-storm", "ubr-storm", "ur-spellslinger", "ur-storm", "ur-welder", "wr-artifact-aggro", "wu-artifacts", "wubrg-lands-soup", "wubrg-value", "wur-academy", "wurg-welder"],
  },
  "Wolfbond Chieftain": {
    tides: ["Cindermarch / Shadow Soloist Combo", "Warrior Aggro", "Warrior Combo"],
    draftArchetypes: ["wr-warriors"],
  },
  "Lumin-Gate Seer": {
    tides: ["Celestial Reverie Combo", "Cheap Characters"],
    colors: ["g", "wg", "ug", "bg", "rg", "wug", "wbg", "ubg", "wbrg", "wubrg"],
    draftArchetypes: ["bg-big-ramp", "bg-midrange", "brg-midrange", "g-big-ramp", "rg-lands-soup", "ug-big-ramp", "ug-ramp", "wg-ramp", "wubg-ramp", "wug-value"],
  },
  "Soulrender": {
    tides: ["Abandon", "Celestial Reverie Combo", "Fading Farewell", "Reclaim Combo", "Survivors", "Warrior Combo"],
    colors: ["b", "ur", "ug", "wbr", "wbg", "brg", "wubr", "wbrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "br-aristocrats", "brg-midrange", "ubg-tempo", "ubr-welder", "ur-burn", "ur-welder", "wb-weenie", "wbg-value-midrange", "wr-artifacts", "wu-artifact-control", "wub-control"],
  },
  "Burning Revenant": {
    tides: ["Abandon", "Fading Farewell", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wb", "wr", "ub", "ur", "br", "wub", "wur", "wbr", "ubr", "wubrg"],
    draftArchetypes: ["br-welder", "u-artifact-control", "u-artifacts", "u-welder", "ubg-tempo", "ubr-welder", "ur-academy", "ur-artifacts", "ur-welder", "w-academy", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbr-artifact-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-control", "wub-weenie", "wur-artifacts", "wurg-artifacts"],
  },
  "Eternal Sentry": {
    tides: ["Discard / Madness"],
    colors: ["ub", "ur", "bg", "wub", "ubr", "ubg", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["g-big-ramp", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ug-ramp", "ur-welder", "wub-control"],
  },
  "Breach Artist": {
    tides: ["Blink", "Outsiders"],
    colors: ["u", "ub", "ur", "wub", "ubr", "ubg", "wurg", "wubrg"],
    draftArchetypes: ["ub-tempo", "ubg-value-midrange", "ur-burn", "urg-storm", "wubg-control", "wug-value", "wur-control"],
  },
  "Dune Reaper": {
    tides: ["Abandon", "Discard / Madness", "Wake the Fallen / Shadow March Combo", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "b", "wu", "wb", "ub", "br", "bg", "wub", "wbr", "ubr", "brg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "b-weenie", "bg-midrange", "br-aristocrats", "rg-midrange", "ubg-tempo", "ubg-value-midrange", "w-artifact-control", "w-weenie", "wb-weenie", "wbr-aristocrats", "wbr-artifact-aggro", "wr-artifact-aggro", "wu-weenie", "wub-artifact-control", "wur-artifacts"],
  },
  "Path to Redemption": {
    tides: ["Abandon", "Reclaim Combo", "Storm", "Survivors"],
    colors: ["ur", "wbr", "ubr", "wubg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-aristocrats", "br-aristocrats", "br-storm", "ub-storm", "ubr-storm", "ur-storm", "urg-storm", "wubg-control", "wubg-value-midrange", "wubrg-value"],
  },
  "Pyrokinetic Surge": {
    tides: ["Discard / Madness"],
    colors: ["b", "wb", "ub", "br", "bg", "wub", "wbg", "ubr", "ubg", "wubr", "wubg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "b-weenie", "bg-midrange", "bg-midrange-reanimator", "br-aristocrats", "brg-midrange", "ub-tempo", "ubg-value-midrange", "ubr-storm", "ubrg-storm", "wb-weenie", "wbg-value-midrange", "wbg-weenie", "wubg-value-midrange"],
  },
  "Infernal Cavalier": {
    tides: ["Abandon", "Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "r", "wu", "wr", "ub", "br", "wub", "wbr", "ubr", "wubrg"],
    draftArchetypes: ["br-welder", "ubr-welder", "ur-academy", "ur-welder", "urg-artifact-control", "w-artifact-aggro", "w-artifact-control", "wbg-value-midrange", "wbr-artifact-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifact-control", "wu-artifacts", "wub-artifact-control", "wub-weenie", "wur-artifacts", "wurg-artifacts"],
  },
  "From the Barrow": {
    tides: ["Discard / Madness", "Events", "Storm"],
    colors: ["ur", "ubr", "wurg", "ubrg"],
    draftArchetypes: ["bg-aristocrats", "br-storm", "brg-midrange", "ubr-storm", "ur-burn", "ur-spellslinger", "ur-storm", "urg-storm", "wur-artifacts"],
  },
  "Resilient Wanderer": {
    tides: ["Abandon", "Discard / Madness", "Survivors", "Wake the Fallen / Shadow March Combo"],
    colors: ["wr", "ub", "bg", "ubr", "ubg", "brg", "ubrg"],
    draftArchetypes: ["br-aristocrats", "ub-tempo", "ubg-tempo", "ubg-value-midrange", "ur-spellslinger", "wub-control", "wubg-big-ramp", "wubg-lands-soup", "wubg-value-midrange", "wubrg-value"],
  },
  "Dreadmount Sovereign": {
    tides: ["Warrior Aggro", "Warrior Combo"],
    colors: ["w", "u", "wu", "wr", "ub", "ur", "ug", "wub", "wur", "wbr", "ubr", "wubr"],
    draftArchetypes: ["r-welder", "u-artifact-control", "u-artifacts", "u-welder", "ub-storm", "ur-artifacts", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubr-artifact-aggro", "wubrg-value", "wur-academy", "wur-artifact-aggro", "wur-artifacts"],
  },
  "Sigil Analyst": {
    tides: ["Blink", "Warrior Aggro", "Warrior Combo"],
    core: true,
    colors: ["w", "u", "wu", "wr", "ub", "ur", "ug", "wub", "wur", "wbr", "ubr", "wubr"],
    draftArchetypes: ["r-welder", "u-artifact-control", "u-artifacts", "u-welder", "ub-storm", "ur-artifacts", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wu-artifact-control", "wub-artifact-control", "wub-control", "wubr-artifact-aggro", "wubrg-value", "wur-academy", "wur-artifact-aggro", "wur-artifacts"],
  },
  "Immolate": {
    core: true,
    colors: ["w", "wu", "wb", "ub", "ur", "br", "bg", "wub", "wbr", "wbg", "ubr", "brg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["b-aristocrats", "b-tempo", "bg-aristocrats", "bg-midrange", "br-aristocrats", "brg-midrange", "ub-tempo", "ubg-value-midrange", "ubr-control", "ubr-storm", "ubrg-lands-midrange", "urg-storm", "wb-weenie", "wbg-value-midrange", "wu-control", "wub-control", "wubg-artifact-control", "wubg-value-midrange", "wubr-artifact-aggro"],
  },
  "Ashlight Caller": {
    tides: ["Discard / Madness", "Events"],
    draftArchetypes: ["ub-madness"],
  },
  "Stoneborn Leviathan": {
    tides: ["Blink", "Spirit Animals"],
    draftArchetypes: ["gu-blink"],
  },
  "Stolen Genesis": {
    colors: ["b", "wb", "br", "bg", "wbr", "wbg", "ubr", "ubg", "brg", "wbrg", "ubrg"],
    draftArchetypes: ["b-aristocrats", "b-midrange-reanimator", "b-tempo", "bg-midrange", "br-aristocrats", "br-welder", "ub-tempo", "ubr-storm", "ubr-welder", "wb-aristocrats", "wb-weenie", "wbg-value-midrange", "wbr-aristocrats", "wbrg-aristocrats", "wub-control", "wubg-big-ramp", "wubg-control", "wubg-value-midrange"],
  },
  "Secrets of the Deep": {
    colors: ["wb", "ub", "br", "wbg", "ubr", "ubg", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["b-weenie", "bg-midrange", "br-aristocrats", "ub-tempo", "ubr-control", "wb-weenie", "wubg-value-midrange", "wubrg-value"],
  },
  "Desperation": {
    colors: ["r", "ur", "ug", "br", "rg", "ubr", "brg", "wubrg"],
    draftArchetypes: ["br-aristocrats", "brg-lands-midrange", "brg-midrange", "r-aristocrats", "r-burn", "ubr-storm", "ubrg-lands-soup", "ur-burn", "ur-spellslinger", "ur-storm", "urg-artifact-control", "wbr-aristocrats", "wur-aggro", "wur-artifacts", "wurg-lands-soup"],
  },
  "Rootspring Summons": {
    colors: ["u", "ub", "ur", "ug", "wub", "ubr", "urg", "ubrg", "wubrg"],
    draftArchetypes: ["u-artifacts", "ub-tempo", "ubr-control", "ubr-storm", "ug-ramp", "ur-burn", "ur-spellslinger", "urg-sneak", "wu-control", "wub-artifact-control", "wub-control"],
  },
  "Iron Executor": {
    colors: ["w", "r", "wu", "wb", "wr", "ub", "wub", "wbr", "wrg", "wurg", "wubrg"],
    draftArchetypes: ["bg-midrange", "ur-welder", "w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-weenie", "wbg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-academy", "wu-artifact-control", "wub-artifact-control", "wubrg-value", "wur-artifact-aggro"],
  },
  "Eruption": {
    colors: ["r", "ur", "rg", "urg", "brg", "wurg", "wbrg", "ubrg", "wubrg"],
    draftArchetypes: ["bg-lands-soup", "br-aristocrats", "r-aggro", "r-burn", "rg-lands-soup", "rg-midrange", "ubr-control", "ur-academy", "ur-spellslinger", "ur-welder", "urg-lands-soup", "urg-sneak", "urg-storm", "wbrg-aristocrats", "wbrg-lands-soup", "wr-aggro", "wr-artifacts", "wubrg-lands-soup"],
  },
  "Lithic Severance": {
    colors: ["w", "wu", "wb", "wg", "wub", "wug", "wbg", "wubg", "wbrg", "wubrg"],
    draftArchetypes: ["w-artifact-aggro", "w-artifact-control", "w-weenie", "wb-artifact-control", "wb-weenie", "wg-midrange", "wr-aggro", "wr-artifact-aggro", "wr-artifacts", "wu-artifacts", "wu-blink", "wu-control", "wu-midrange-weenie", "wub-control", "wubg-artifact-control", "wubg-value", "wubg-value-midrange", "wubrg-value", "wug-value"],
  },
};
