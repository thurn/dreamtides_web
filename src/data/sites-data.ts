import type { SitesData } from "../types/sites-data";
import {
  RANDOM_SITE_DESTINATION_TYPES,
  SITE_TYPES,
  type SiteType,
} from "../types/site-type";
import { requireGlossaryEntry } from "./glossary";

const SITES_DATA_JSON_PATH = "/sites-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const GUIDE_SITE_TYPES = SITE_TYPES.filter(
  (siteType) =>
    !(["Battle", "Draft", "Essence", "Reward"] as const).includes(
      siteType as "Battle" | "Draft" | "Essence" | "Reward",
    ),
);

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === [...keys].sort()[index])
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isInteger(
  value: unknown,
  { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {},
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isChoiceLimit(value: unknown): value is number | null {
  return value === null || isInteger(value, { min: 1 });
}

function isSitesData(value: unknown): value is SitesData {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      "schemaVersion",
      "contentHash",
      "foldHash",
      "siteTypes",
      "fallbackSiteType",
      "randomSite",
      "cardChoices",
      "guideAssignments",
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.contentHash !== "string" ||
    !SHA256_HEX.test(value.contentHash) ||
    typeof value.foldHash !== "string" ||
    !SHA256_HEX.test(value.foldHash) ||
    !isRecord(value.siteTypes) ||
    !isRecord(value.fallbackSiteType) ||
    !isRecord(value.randomSite) ||
    !isRecord(value.cardChoices) ||
    !isRecord(value.guideAssignments)
  )
    return false;
  if (
    !hasExactKeys(value.siteTypes, SITE_TYPES) ||
    !hasExactKeys(value.fallbackSiteType, ["icon", "name", "description"]) ||
    !hasExactKeys(value.randomSite, [
      "destinations",
      "homeChoiceCount",
      "insufficientDestinations",
      "guideId",
    ]) ||
    !hasExactKeys(value.cardChoices, ["duplication"]) ||
    !hasExactKeys(value.guideAssignments, GUIDE_SITE_TYPES)
  ) {
    return false;
  }
  for (const siteType of SITE_TYPES) {
    const metadata = value.siteTypes[siteType];
    if (
      !isRecord(metadata) ||
      !hasExactKeys(metadata, ["icon", "glossaryId"]) ||
      !isNonEmptyString(metadata.icon) ||
      !isNonEmptyString(metadata.glossaryId)
    ) {
      return false;
    }
  }
  if (
    !isNonEmptyString(value.fallbackSiteType.icon) ||
    !isNonEmptyString(value.fallbackSiteType.name) ||
    !isNonEmptyString(value.fallbackSiteType.description)
  ) {
    return false;
  }
  const random = value.randomSite;
  if (
    !Array.isArray(random.destinations) ||
    random.destinations.length < 1 ||
    random.destinations.some(
      (destination) =>
        !RANDOM_SITE_DESTINATION_TYPES.includes(
          destination as (typeof RANDOM_SITE_DESTINATION_TYPES)[number],
        ),
    ) ||
    new Set(random.destinations).size !== random.destinations.length ||
    !isInteger(random.homeChoiceCount, { min: 2, max: 3 }) ||
    random.homeChoiceCount > random.destinations.length ||
    random.insufficientDestinations !== "fail" ||
    !isNonEmptyString(random.guideId)
  )
    return false;

  for (const kind of ["duplication"] as const) {
    const choice = value.cardChoices[kind];
    if (
      !isRecord(choice) ||
      !hasExactKeys(choice, ["standardLimit", "enhancedLimit"]) ||
      !isInteger(choice.standardLimit, { min: 1 }) ||
      !isChoiceLimit(choice.enhancedLimit)
    ) {
      return false;
    }
  }

  const guideIds = new Set<string>();
  const homeDreamscapeIds = new Set<string>();
  for (const siteType of GUIDE_SITE_TYPES) {
    const assignment = value.guideAssignments[siteType];
    if (
      !isRecord(assignment) ||
      !hasExactKeys(assignment, ["guideId", "homeDreamscapeId"]) ||
      !isNonEmptyString(assignment.guideId) ||
      !isNonEmptyString(assignment.homeDreamscapeId) ||
      guideIds.has(assignment.guideId) ||
      homeDreamscapeIds.has(assignment.homeDreamscapeId)
    ) {
      return false;
    }
    guideIds.add(assignment.guideId);
    homeDreamscapeIds.add(assignment.homeDreamscapeId);
  }
  const randomAssignment = value.guideAssignments.RandomSite;
  const gambleAssignment = value.guideAssignments.Gamble;
  if (
    !isRecord(randomAssignment) ||
    randomAssignment.guideId !== random.guideId ||
    !isRecord(gambleAssignment) ||
    !isNonEmptyString(gambleAssignment.guideId)
  ) {
    return false;
  }
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
  try {
    for (const siteType of SITE_TYPES) {
      requireGlossaryEntry(value.siteTypes[siteType].glossaryId);
    }
  } catch {
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
