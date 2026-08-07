import type { SitesData } from "../types/sites-data";
import { SITE_TYPES, type SiteType } from "../types/site-type";
import { requireGlossaryEntry } from "./glossary";

const SITES_DATA_JSON_PATH = "/sites-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSitesData(value: unknown): value is SitesData {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== 1 ||
    typeof value.contentHash !== "string" ||
    !SHA256_HEX.test(value.contentHash) ||
    typeof value.foldHash !== "string" ||
    !SHA256_HEX.test(value.foldHash) ||
    !isRecord(value.siteTypes) ||
    !isRecord(value.fallbackSiteType) ||
    !isRecord(value.randomSite) ||
    !isRecord(value.cardChoices) ||
    !isRecord(value.gamble) ||
    !isRecord(value.guideAssignments)
  )
    return false;
  for (const siteType of SITE_TYPES) {
    const metadata = value.siteTypes[siteType];
    if (
      !isRecord(metadata) ||
      typeof metadata.icon !== "string" ||
      typeof metadata.glossaryId !== "string"
    ) {
      return false;
    }
  }
  const random = value.randomSite;
  if (
    !Array.isArray(random.destinations) ||
    random.destinations.length === 0 ||
    !Number.isInteger(random.homeChoiceCount) ||
    random.awayChoiceCount !== 1 ||
    random.insufficientDestinations !== "fail" ||
    typeof random.guideId !== "string"
  )
    return false;
  const gamble = value.gamble;
  if (
    !isRecord(gamble.selection) ||
    !Array.isArray(gamble.selection.games) ||
    gamble.selection.games.length !== 4 ||
    !isRecord(gamble.threeGate) ||
    !Array.isArray(gamble.threeGate.gates) ||
    gamble.threeGate.gates.length !== 3 ||
    !isRecord(gamble.ladderClimb) ||
    !Array.isArray(gamble.ladderClimb.attempts) ||
    gamble.ladderClimb.attempts.length !== 4 ||
    !isRecord(gamble.starwayStairs) ||
    !Array.isArray(gamble.starwayStairs.tiers) ||
    gamble.starwayStairs.tiers.length !== 3 ||
    !isRecord(gamble.fourSuitReprise) ||
    !Array.isArray(gamble.fourSuitReprise.outcomes) ||
    gamble.fourSuitReprise.outcomes.length !== 4
  )
    return false;
  return true;
}

/** Fetches the validated site registry emitted by the asset pipeline. */
export async function loadSitesData(): Promise<SitesData> {
  const response = await fetch(SITES_DATA_JSON_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load Sites data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const value: unknown = await response.json();
  if (!isSitesData(value)) {
    throw new Error("Failed to load Sites data: malformed sites-data.json");
  }
  return value;
}

function siteTypeData(sitesData: SitesData, siteType: SiteType) {
  return (sitesData.siteTypes as Partial<SitesData["siteTypes"]>)[siteType];
}

export function siteTypeIcon(sitesData: SitesData, siteType: SiteType): string {
  return (
    siteTypeData(sitesData, siteType)?.icon ?? sitesData.fallbackSiteType.icon
  );
}

export function siteTypeName(sitesData: SitesData, siteType: SiteType): string {
  const metadata = siteTypeData(sitesData, siteType);
  return metadata === undefined
    ? sitesData.fallbackSiteType.name
    : requireGlossaryEntry(metadata.glossaryId).term;
}

export function siteTypeDescription(
  sitesData: SitesData,
  siteType: SiteType,
): string {
  const metadata = siteTypeData(sitesData, siteType);
  return metadata === undefined
    ? sitesData.fallbackSiteType.description
    : requireGlossaryEntry(metadata.glossaryId).definition;
}
