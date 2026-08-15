import type { DreamsignTemplate } from "../types/content";
import type { Dreamsign } from "../types/journey";
import {
  parseDreamsignId,
  parseTideId,
  type DreamsignId,
} from "../types/identifiers";

const DREAMSIGN_JSON_PATH = "/dreamsign-data.json";

interface RawDreamsign {
  id: unknown;
  name: string;
  imageName: string;
  imageAlt: string;
  effectDescription: string;
  rarity: DreamsignTemplate["rarity"];
  tideIds: unknown;
  tags?: string[];
}

/** Fetches canonical Dreamsign data from the asset pipeline output. */
export async function loadDreamsignTemplates(): Promise<DreamsignTemplate[]> {
  const response = await fetch(DREAMSIGN_JSON_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load Dreamsign data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const raw = (await response.json()) as RawDreamsign[];
  return raw.map((entry) => {
    if (!Array.isArray(entry.tideIds)) {
      throw new Error("Dreamsign tide ids must be an array.");
    }
    return {
      id: parseDreamsignId(entry.id),
      name: entry.name,
      effectDescription: entry.effectDescription,
      imageName: entry.imageName,
      imageAlt: entry.imageAlt,
      rarity: entry.rarity,
      tideIds: entry.tideIds.map(parseTideId),
      tags: entry.tags,
    };
  });
}

/** Instantiates a collectible Dreamsign from a template. */
export function createDreamsign(template: DreamsignTemplate): Dreamsign {
  return {
    id: template.id,
    name: template.name,
    effectDescription: template.effectDescription,
    imageName: template.imageName,
    imageAlt: template.imageAlt,
  };
}

/** Return the stable UUID-backed identifier required for rendering a dreamsign. */
export function requireDreamsignId(
  dreamsign: Pick<Dreamsign, "id">,
  context: string,
): DreamsignId {
  if (dreamsign.id === undefined || dreamsign.id.length === 0) {
    throw new Error(`${context} dreamsign is missing a stable id.`);
  }
  return dreamsign.id;
}
