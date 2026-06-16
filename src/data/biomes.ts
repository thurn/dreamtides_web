import type { SiteType } from "../types/quest";

/**
 * A cosmetic label for a dreamscape node, paired with the colour shown on the
 * Atlas and the site type that dreamscape enhances.
 */
export interface Biome {
  name: string;
  color: string;
  enhancedSiteType: SiteType;
}

/**
 * A thematic family of dreamscapes. Each theme is tied to one enhanced site
 * type and carries the vocabulary used to build evocative, varied dreamscape
 * names. A name is formed as `${adjective} ${noun}`, so a theme with `A`
 * adjectives and `N` nouns yields `A × N` distinct names. The theme also owns a
 * small palette of colours so that two dreamscapes from the same family still
 * differ visually on the Atlas.
 */
export interface BiomeTheme {
  enhancedSiteType: SiteType;
  colors: readonly string[];
  adjectives: readonly string[];
  nouns: readonly string[];
}

/**
 * The 6 dreamscape themes, one per enhanced site type from the design document:
 * Shop, Dreamsign Offering/Draft, Purge, Essence, Transfiguration, and
 * Duplication. Each theme's vocabulary is chosen to evoke its enhancement: lush
 * abundance for Shops, the night sky for Dreamsign Offerings, fire and ash for
 * Purge, crystalline light for Essence, forge and shadow for Transfiguration,
 * and reflection for Duplication.
 */
export const BIOME_THEMES: readonly BiomeTheme[] = [
  {
    // Shop — lush, abundant, green.
    enhancedSiteType: "Shop",
    colors: ["#2dd4bf", "#34d399", "#22c55e", "#4ade80", "#10b981"],
    adjectives: [
      "Verdant",
      "Emerald",
      "Blooming",
      "Lush",
      "Fertile",
      "Mossgrown",
      "Sunlit",
      "Thriving",
      "Honeyed",
      "Overgrown",
      "Wildflower",
      "Tangled",
      "Dewbright",
      "Greenwood",
      "Flourishing",
      "Brambled",
      "Petalled",
      "Orchard",
      "Vineswept",
      "Meadowed",
    ],
    nouns: [
      "Hollow",
      "Glen",
      "Grove",
      "Vale",
      "Thicket",
      "Bower",
      "Meadow",
      "Garden",
      "Dell",
      "Bazaar",
      "Wilds",
      "Orchard",
      "Pasture",
      "Coppice",
      "Heath",
      "Bramblewood",
      "Greenway",
      "Arbor",
      "Glade",
      "Fenlands",
    ],
  },
  {
    // Dreamsign Offering — celestial, starlit, violet.
    enhancedSiteType: "DreamsignOffering",
    colors: ["#c084fc", "#a855f7", "#818cf8", "#d8b4fe", "#7c3aed"],
    adjectives: [
      "Starfall",
      "Astral",
      "Twilit",
      "Moonlit",
      "Celestial",
      "Glimmering",
      "Nightborn",
      "Silvered",
      "Lustrous",
      "Comet",
      "Dusklit",
      "Stardrift",
      "Aurora",
      "Wandering",
      "Nebular",
      "Gleaming",
      "Midnight",
      "Cometfall",
      "Spangled",
      "Auroral",
    ],
    nouns: [
      "Glade",
      "Expanse",
      "Reach",
      "Veil",
      "Spire",
      "Steppe",
      "Horizon",
      "Drift",
      "Firmament",
      "Vault",
      "Skyfield",
      "Lookout",
      "Terrace",
      "Overlook",
      "Plateau",
      "Crest",
      "Span",
      "Heights",
      "Beacon",
      "Threshold",
    ],
  },
  {
    // Purge — fire, ash, ember, red.
    enhancedSiteType: "Purge",
    colors: ["#f87171", "#ef4444", "#fb923c", "#f97316", "#dc2626"],
    adjectives: [
      "Ashfall",
      "Smouldering",
      "Ember",
      "Scorched",
      "Cindered",
      "Blazing",
      "Charred",
      "Molten",
      "Searing",
      "Sootveiled",
      "Pyre",
      "Burnt",
      "Glowing",
      "Furnace",
      "Kindled",
      "Wildfire",
      "Cinderfall",
      "Smoking",
      "Brimstone",
      "Emberlit",
    ],
    nouns: [
      "Basin",
      "Crater",
      "Wastes",
      "Caldera",
      "Hollow",
      "Reach",
      "Flats",
      "Pyre",
      "Barrens",
      "Scar",
      "Ashlands",
      "Furnace",
      "Cinderfield",
      "Ravine",
      "Expanse",
      "Hearth",
      "Ridge",
      "Ruin",
      "Fault",
      "Ashpit",
    ],
  },
  {
    // Essence — crystalline, icy, luminous, blue.
    enhancedSiteType: "Essence",
    colors: ["#38bdf8", "#0ea5e9", "#7dd3fc", "#06b6d4", "#22d3ee"],
    adjectives: [
      "Crystal",
      "Glacial",
      "Prismatic",
      "Frostbound",
      "Shimmering",
      "Icebound",
      "Lucent",
      "Glassen",
      "Frozen",
      "Radiant",
      "Crystalline",
      "Glittering",
      "Hoarfrost",
      "Translucent",
      "Aquiline",
      "Iceveined",
      "Brilliant",
      "Snowlit",
      "Diamond",
      "Crystallight",
    ],
    nouns: [
      "Spire",
      "Cavern",
      "Geode",
      "Pinnacle",
      "Grotto",
      "Shard",
      "Reach",
      "Glacier",
      "Lattice",
      "Prism",
      "Hollow",
      "Frostvault",
      "Crag",
      "Crevasse",
      "Aerie",
      "Sanctum",
      "Wellspring",
      "Cascade",
      "Obelisk",
      "Cathedral",
    ],
  },
  {
    // Transfiguration — forge, shadow, arcane, deep violet.
    enhancedSiteType: "Transfiguration",
    colors: ["#a78bfa", "#8b5cf6", "#6d28d9", "#9333ea", "#7e22ce"],
    adjectives: [
      "Shadow",
      "Runebound",
      "Arcane",
      "Wrought",
      "Sablebound",
      "Veiled",
      "Hexwoven",
      "Umbral",
      "Spellforged",
      "Gloaming",
      "Cinderforged",
      "Duskbound",
      "Warped",
      "Eldritch",
      "Obsidian",
      "Sigilmarked",
      "Mutable",
      "Twisting",
      "Glyphbound",
      "Nightforged",
    ],
    nouns: [
      "Forge",
      "Crucible",
      "Sanctum",
      "Foundry",
      "Workshop",
      "Atelier",
      "Anvil",
      "Reliquary",
      "Vault",
      "Smithy",
      "Loom",
      "Cauldron",
      "Furnace",
      "Athenaeum",
      "Conclave",
      "Spire",
      "Bastion",
      "Reach",
      "Catacomb",
      "Mantle",
    ],
  },
  {
    // Duplication — echo, mirror, reflection, emerald.
    enhancedSiteType: "Duplication",
    colors: ["#34d399", "#10b981", "#2dd4bf", "#14b8a6", "#5eead4"],
    adjectives: [
      "Echoing",
      "Mirrored",
      "Reflecting",
      "Twinned",
      "Resonant",
      "Doubled",
      "Whispering",
      "Repeating",
      "Reverberant",
      "Glassbound",
      "Hollowed",
      "Recurring",
      "Mirrorbright",
      "Echobound",
      "Manifold",
      "Refracted",
      "Looping",
      "Reflected",
      "Endless",
      "Reechoing",
    ],
    nouns: [
      "Hall",
      "Echoes",
      "Gallery",
      "Chamber",
      "Reflection",
      "Atrium",
      "Colonnade",
      "Cloister",
      "Rotunda",
      "Labyrinth",
      "Mirrorlake",
      "Hallway",
      "Vault",
      "Antechamber",
      "Reach",
      "Corridor",
      "Concourse",
      "Sanctum",
      "Refrain",
      "Mirrorwell",
    ],
  },
] as const;

/**
 * Total number of distinct dreamscape names the themes can produce, summed
 * across every theme (`adjectives × nouns`). Used for logging and sanity
 * checks.
 */
export const BIOME_NAME_COMBINATIONS = BIOME_THEMES.reduce(
  (total, theme) => total + theme.adjectives.length * theme.nouns.length,
  0,
);

/** Builds a dreamscape name from a theme's vocabulary. */
export function biomeName(
  theme: BiomeTheme,
  adjectiveIndex: number,
  nounIndex: number,
): string {
  return `${theme.adjectives[adjectiveIndex]} ${theme.nouns[nounIndex]}`;
}
