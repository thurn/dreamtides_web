import type { AtlasConfig } from "../types/quest";

export type { AtlasConfig } from "../types/quest";

const ATLAS_CONFIG_JSON_PATH = "/atlas-config-data.json";

/** Fetches the Dream Atlas generation tuning from the asset pipeline output. */
export async function loadAtlasConfig(): Promise<AtlasConfig> {
  const response = await fetch(ATLAS_CONFIG_JSON_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load atlas config: ${String(response.status)} ${response.statusText}`,
    );
  }
  return (await response.json()) as AtlasConfig;
}
