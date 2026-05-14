import type { SiteType } from "../types/quest";

/** A cosmetic label for dreamscape nodes with an enhanced site type. */
export interface Biome {
  name: string;
  color: string;
  enhancedSiteType: SiteType;
}

/**
 * The 6 biomes, one per enhanced site type from the design document: Shop,
 * Dreamsign Offering/Draft, Purge, Essence, Transfiguration, and Duplication.
 */
export const BIOMES: readonly Biome[] = [
  {
    name: "Verdant Hollow",
    color: "#2dd4bf",
    enhancedSiteType: "Shop",
  },
  {
    name: "Starfall Glade",
    color: "#c084fc",
    enhancedSiteType: "DreamsignOffering",
  },
  {
    name: "Ashfall Basin",
    color: "#f87171",
    enhancedSiteType: "Purge",
  },
  {
    name: "Crystal Spire",
    color: "#38bdf8",
    enhancedSiteType: "Essence",
  },
  {
    name: "Shadowforge",
    color: "#a78bfa",
    enhancedSiteType: "Transfiguration",
  },
  {
    name: "Hall of Echoes",
    color: "#34d399",
    enhancedSiteType: "Duplication",
  },
] as const;
