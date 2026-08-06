import type { AtlasData } from "../types/atlas-data";
import type { SiteType } from "../types/site-type";
import { requireGlossaryEntry } from "./glossary";

export type { AtlasData } from "../types/atlas-data";

const ATLAS_DATA_JSON_PATH = "/atlas-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;

/** Fetches the validated Dream Atlas document emitted by the asset pipeline. */
export async function loadAtlasData(): Promise<AtlasData> {
  const response = await fetch(ATLAS_DATA_JSON_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load Atlas data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const value: unknown = await response.json();
  if (
    typeof value !== "object" ||
    value === null ||
    (value as Partial<AtlasData>).schemaVersion !== 1 ||
    !SHA256_HEX.test((value as Partial<AtlasData>).contentHash ?? "") ||
    !SHA256_HEX.test((value as Partial<AtlasData>).foldHash ?? "") ||
    !Array.isArray((value as Partial<AtlasData>).layers)
  ) {
    throw new Error("Failed to load Atlas data: malformed atlas-data.json");
  }
  return value as AtlasData;
}

function siteTypeData(atlasData: AtlasData, siteType: SiteType) {
  return (atlasData.siteTypes as Partial<AtlasData["siteTypes"]>)[siteType];
}

/** Returns the authored icon class for a site, with the legacy-safe fallback. */
export function siteTypeIcon(
  atlasData: AtlasData,
  siteType: SiteType,
): string {
  return siteTypeData(atlasData, siteType)?.icon ?? atlasData.fallbackSiteType.icon;
}

/** Returns the glossary-authored display name for a site. */
export function siteTypeName(
  atlasData: AtlasData,
  siteType: SiteType,
): string {
  const metadata = siteTypeData(atlasData, siteType);
  return metadata === undefined
    ? atlasData.fallbackSiteType.name
    : requireGlossaryEntry(metadata.glossaryId).term;
}

/** Returns the glossary-authored one-line description for a site. */
export function siteTypeDescription(
  atlasData: AtlasData,
  siteType: SiteType,
): string {
  const metadata = siteTypeData(atlasData, siteType);
  return metadata === undefined
    ? atlasData.fallbackSiteType.description
    : requireGlossaryEntry(metadata.glossaryId).definition;
}

/** Expands one validated Atlas presentation template. */
export function atlasTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{([^{}]+)\}/gu, (_match, key: string) => values[key] ?? "");
}
