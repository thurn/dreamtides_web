import type { SitesData } from "../types/sites-data";
import {
  RANDOM_SITE_DESTINATION_TYPES,
  SITE_TYPES,
  type SiteType,
} from "../types/site-type";
import { requireGlossaryEntry } from "./glossary";
import { hydrateSourceTransport } from "../runtime/localization/runtime";
import {
  dreamscapeIdFromUnknown,
  guideIdFromUnknown,
  type DreamscapeId,
  type GuideId,
} from "../types/identifiers";
import { parseContentHash, parseFoldHash } from "../types/content-hash";

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

function isSourceMessageRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.format === "trox-source-message-ref" &&
    typeof value.entry_id === "string" &&
    typeof value.source_signature === "string" &&
    typeof value.contract_signature === "string"
  );
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

function isRange(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["min", "max"]) &&
    isInteger(value.min, { min: 0 }) &&
    isInteger(value.max, { min: value.min })
  );
}

function isRewards(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["essence", "reward", "dreamsignRevelation"]) &&
    isRecord(value.essence) &&
    hasExactKeys(value.essence, ["standard", "enhanced"]) &&
    isRange(value.essence.standard) &&
    isRange(value.essence.enhanced) &&
    isRecord(value.reward) &&
    hasExactKeys(value.reward, ["fallbackEssence"]) &&
    isRange(value.reward.fallbackEssence) &&
    isRecord(value.dreamsignRevelation) &&
    hasExactKeys(value.dreamsignRevelation, [
      "standardOfferCount",
      "enhancedOfferCount",
    ]) &&
    isInteger(value.dreamsignRevelation.standardOfferCount, { min: 0 }) &&
    isInteger(value.dreamsignRevelation.enhancedOfferCount, { min: 0 })
  );
}

function isPurge(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["marginalCosts", "enhancedDiscountPercent"]) &&
    Array.isArray(value.marginalCosts) &&
    value.marginalCosts.length > 0 &&
    value.marginalCosts.every((cost) => isInteger(cost, { min: 0 })) &&
    isInteger(value.enhancedDiscountPercent, { min: 0, max: 100 })
  );
}

const PRESENTATION_KIND_BY_SITE: Readonly<Partial<Record<SiteType, string>>> = {
  Battle: "battle",
  Draft: "draft",
  Shop: "shop",
  Purge: "purge",
  DreamsignBazaar: "dreamsign-bazaar",
};
const PRESENTATION_KEYS: Readonly<Record<string, readonly string[]>> = {
  battle: ["kind", "label", "finalBossLabel"],
  draft: ["kind", "label"],
  shop: ["kind", "title"],
  purge: ["kind", "title"],
  "dreamsign-bazaar": ["kind", "title"],
};

function isSitePresentation(value: unknown, siteType: SiteType): boolean {
  const expectedKind = PRESENTATION_KIND_BY_SITE[siteType];
  if (expectedKind === undefined) return value === null;
  if (
    !isRecord(value) ||
    value.kind !== expectedKind ||
    !hasExactKeys(value, PRESENTATION_KEYS[expectedKind])
  )
    return false;
  return Object.entries(value).every(
    ([key, field]) =>
      key === "kind" || isNonEmptyString(field) || isSourceMessageRef(field),
  );
}

function isSiteRules(value: unknown, siteType: SiteType): boolean {
  if (siteType !== "Duplication") return value === null;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["kind", "cardChoices"]) ||
    value.kind !== "duplication" ||
    !isRecord(value.cardChoices) ||
    !hasExactKeys(value.cardChoices, ["standardLimit", "enhancedLimit"])
  ) {
    return false;
  }
  return (
    isInteger(value.cardChoices.standardLimit, { min: 1 }) &&
    isChoiceLimit(value.cardChoices.enhancedLimit)
  );
}

function isSitesData(value: unknown): value is SitesData {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      "schemaVersion",
      "contentHash",
      "foldHash",
      "encounterSites",
      "rewards",
      "purge",
      "siteTypes",
      "randomSite",
      "guideAssignments",
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.contentHash !== "string" ||
    !SHA256_HEX.test(value.contentHash) ||
    typeof value.foldHash !== "string" ||
    !SHA256_HEX.test(value.foldHash) ||
    !isRecord(value.encounterSites) ||
    !isInteger(value.encounterSites.minDeckForPurge, { min: 1 }) ||
    !Array.isArray(value.encounterSites.placeableSites) ||
    value.encounterSites.placeableSites.length === 0 ||
    value.encounterSites.placeableSites.some(
      (entry) => !SITE_TYPES.includes(entry as SiteType),
    ) ||
    !isRewards(value.rewards) ||
    !isPurge(value.purge) ||
    !isRecord(value.siteTypes) ||
    !isRecord(value.randomSite) ||
    !isRecord(value.guideAssignments)
  )
    return false;
  if (
    !hasExactKeys(value.siteTypes, SITE_TYPES) ||
    !hasExactKeys(value.randomSite, [
      "destinations",
      "homeChoiceCount",
      "insufficientDestinations",
      "guideId",
    ]) ||
    !hasExactKeys(value.guideAssignments, GUIDE_SITE_TYPES)
  ) {
    return false;
  }
  for (const siteType of SITE_TYPES) {
    const metadata = value.siteTypes[siteType];
    if (
      !isRecord(metadata) ||
      !hasExactKeys(metadata, [
        "icon",
        "glossaryId",
        "presentation",
        "rules",
      ]) ||
      !isNonEmptyString(metadata.icon) ||
      !isNonEmptyString(metadata.glossaryId) ||
      !isSitePresentation(metadata.presentation, siteType) ||
      !isSiteRules(metadata.rules, siteType)
    ) {
      return false;
    }
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

  const guideIds = new Set<GuideId>();
  const homeDreamscapeIds = new Set<DreamscapeId>();
  for (const siteType of GUIDE_SITE_TYPES) {
    const assignment = value.guideAssignments[siteType];
    const guideId = isRecord(assignment)
      ? guideIdFromUnknown(assignment.guideId)
      : null;
    const homeDreamscapeId = isRecord(assignment)
      ? dreamscapeIdFromUnknown(assignment.homeDreamscapeId)
      : null;
    if (
      !isRecord(assignment) ||
      !hasExactKeys(assignment, ["guideId", "homeDreamscapeId"]) ||
      guideId === null ||
      homeDreamscapeId === null ||
      guideIds.has(guideId) ||
      homeDreamscapeIds.has(homeDreamscapeId)
    ) {
      return false;
    }
    guideIds.add(guideId);
    homeDreamscapeIds.add(homeDreamscapeId);
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

export function parseSitesData(value: unknown): SitesData {
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
  return {
    ...value,
    contentHash: parseContentHash(value.contentHash),
    foldHash: parseFoldHash(value.foldHash),
    siteTypes: Object.fromEntries(
      SITE_TYPES.map((siteType) => {
        const metadata = value.siteTypes[siteType];
        const presentation = metadata.presentation;
        return [
          siteType,
          {
            ...metadata,
            glossaryId: metadata.glossaryId,
            presentation:
              presentation === null
                ? null
                : Object.fromEntries(
                    Object.entries(presentation).map(([key, field]) => [
                      key,
                      key === "kind"
                        ? field
                        : hydrateSourceTransport(
                            field,
                            `${siteType} presentation ${key}`,
                          ),
                    ]),
                  ),
          },
        ];
      }),
    ) as SitesData["siteTypes"],
  };
}

/** Fetches the validated site registry emitted by the asset pipeline. */
export async function loadSitesData(): Promise<SitesData> {
  const response = await fetch(SITES_DATA_JSON_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load Sites data: ${String(response.status)} ${response.statusText}`,
    );
  }
  return parseSitesData(await response.json());
}

function requireSiteTypeData(sitesData: SitesData, siteType: SiteType) {
  const metadata = (sitesData.siteTypes as Partial<SitesData["siteTypes"]>)[
    siteType
  ];
  if (metadata === undefined) {
    throw new Error(`Missing Sites metadata for ${siteType}`);
  }
  return metadata;
}

export function siteTypeIcon(sitesData: SitesData, siteType: SiteType): string {
  return requireSiteTypeData(sitesData, siteType).icon;
}

export function siteTypeName(sitesData: SitesData, siteType: SiteType): string {
  const metadata = requireSiteTypeData(sitesData, siteType);
  return requireGlossaryEntry(metadata.glossaryId).term;
}

export function siteTypeDescription(
  sitesData: SitesData,
  siteType: SiteType,
): string {
  const metadata = requireSiteTypeData(sitesData, siteType);
  return requireGlossaryEntry(metadata.glossaryId).definition;
}
