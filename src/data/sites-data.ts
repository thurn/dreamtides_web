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

const GAME_IDS = [
  "gravok-three-gate-wager",
  "tidemark-ladder-climb",
  "starway-stairs",
  "four-suit-reprise",
  "blackjack",
] as const;
const FALLBACK_GAME_IDS = [
  "gravok-three-gate-wager",
  "starway-stairs",
] as const;
const GATE_IDS = ["six", "nine", "jack"] as const;
const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;
const SUITS = ["spades", "diamonds", "hearts", "clubs"] as const;
const FOUR_SUIT_OUTCOMES = [
  "transfiguration",
  "essence",
  "duplication",
  "purge",
] as const;
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

function isOdds(numerator: unknown, denominator: unknown): numerator is number {
  return isInteger(numerator, { min: 0 }) && isInteger(denominator, { min: 1 });
}

function isChoiceLimit(value: unknown): value is number | null {
  return value === null || isInteger(value, { min: 1 });
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
  if (
    !hasExactKeys(value.siteTypes, SITE_TYPES) ||
    !hasExactKeys(value.fallbackSiteType, ["icon", "name", "description"]) ||
    !hasExactKeys(value.randomSite, [
      "destinations",
      "homeChoiceCount",
      "awayChoiceCount",
      "insufficientDestinations",
      "guideId",
    ]) ||
    !hasExactKeys(value.cardChoices, ["transfiguration", "duplication"]) ||
    !hasExactKeys(value.gamble, [
      "selection",
      "threeGate",
      "ladderClimb",
      "starwayStairs",
      "fourSuitReprise",
    ]) ||
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
    random.destinations.length < 3 ||
    random.destinations.some(
      (destination) =>
        !RANDOM_SITE_DESTINATION_TYPES.includes(
          destination as (typeof RANDOM_SITE_DESTINATION_TYPES)[number],
        ),
    ) ||
    new Set(random.destinations).size !== random.destinations.length ||
    random.homeChoiceCount !== 3 ||
    random.homeChoiceCount > random.destinations.length ||
    random.awayChoiceCount !== 1 ||
    random.insufficientDestinations !== "fail" ||
    !isNonEmptyString(random.guideId)
  )
    return false;

  for (const kind of ["transfiguration", "duplication"] as const) {
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

  const gamble = value.gamble;
  if (
    !isRecord(gamble.selection) ||
    !hasExactKeys(gamble.selection, ["fallbackGame", "games"]) ||
    !Array.isArray(gamble.selection.games) ||
    gamble.selection.games.length !== GAME_IDS.length ||
    !isRecord(gamble.threeGate) ||
    !hasExactKeys(gamble.threeGate, ["maxRetries", "gates"]) ||
    !Array.isArray(gamble.threeGate.gates) ||
    gamble.threeGate.gates.length !== 3 ||
    !isRecord(gamble.ladderClimb) ||
    !hasExactKeys(gamble.ladderClimb, ["strongPoolLimit", "attempts"]) ||
    !Array.isArray(gamble.ladderClimb.attempts) ||
    gamble.ladderClimb.attempts.length !== 4 ||
    !isRecord(gamble.starwayStairs) ||
    !hasExactKeys(gamble.starwayStairs, ["maxRetries", "tiers"]) ||
    !Array.isArray(gamble.starwayStairs.tiers) ||
    gamble.starwayStairs.tiers.length !== 3 ||
    !isRecord(gamble.fourSuitReprise) ||
    !hasExactKeys(gamble.fourSuitReprise, [
      "maxRounds",
      "oddsNumerator",
      "oddsDenominator",
      "outcomes",
    ]) ||
    !Array.isArray(gamble.fourSuitReprise.outcomes) ||
    gamble.fourSuitReprise.outcomes.length !== 4
  )
    return false;

  if (
    !FALLBACK_GAME_IDS.includes(
      gamble.selection.fallbackGame as (typeof FALLBACK_GAME_IDS)[number],
    ) ||
    !gamble.selection.games.every((game, index) => {
      return (
        isRecord(game) &&
        hasExactKeys(game, ["id", "weight"]) &&
        game.id === GAME_IDS[index] &&
        isInteger(game.weight, { min: 1 })
      );
    })
  ) {
    return false;
  }

  if (
    !isInteger(gamble.threeGate.maxRetries, { min: 0 }) ||
    !gamble.threeGate.gates.every((gate, index) => {
      return (
        isRecord(gate) &&
        hasExactKeys(gate, [
          "id",
          "name",
          "threshold",
          "oddsNumerator",
          "oddsDenominator",
          "awardsDreamsign",
        ]) &&
        gate.id === GATE_IDS[index] &&
        isNonEmptyString(gate.name) &&
        RANKS.includes(gate.threshold as (typeof RANKS)[number]) &&
        isOdds(gate.oddsNumerator, gate.oddsDenominator) &&
        typeof gate.awardsDreamsign === "boolean"
      );
    })
  ) {
    return false;
  }

  if (
    !isInteger(gamble.ladderClimb.strongPoolLimit, { min: 1 }) ||
    !gamble.ladderClimb.attempts.every((attempt, index) => {
      return (
        isRecord(attempt) &&
        hasExactKeys(attempt, [
          "attempt",
          "threshold",
          "oddsNumerator",
          "oddsDenominator",
        ]) &&
        attempt.attempt === index + 1 &&
        RANKS.includes(attempt.threshold as (typeof RANKS)[number]) &&
        isOdds(attempt.oddsNumerator, attempt.oddsDenominator)
      );
    })
  ) {
    return false;
  }

  if (
    !isInteger(gamble.starwayStairs.maxRetries, { min: 0 }) ||
    !gamble.starwayStairs.tiers.every((tier, index) => {
      return (
        isRecord(tier) &&
        hasExactKeys(tier, [
          "tier",
          "highestBustRank",
          "bustOddsNumerator",
          "oddsDenominator",
        ]) &&
        tier.tier === index + 1 &&
        RANKS.includes(tier.highestBustRank as (typeof RANKS)[number]) &&
        isOdds(tier.bustOddsNumerator, tier.oddsDenominator)
      );
    })
  ) {
    return false;
  }

  if (
    !isInteger(gamble.fourSuitReprise.maxRounds, { min: 1, max: 3 }) ||
    !isOdds(
      gamble.fourSuitReprise.oddsNumerator,
      gamble.fourSuitReprise.oddsDenominator,
    ) ||
    !gamble.fourSuitReprise.outcomes.every((outcome, index) => {
      return (
        isRecord(outcome) &&
        hasExactKeys(outcome, ["suit", "outcome", "label"]) &&
        outcome.suit === SUITS[index] &&
        outcome.outcome === FOUR_SUIT_OUTCOMES[index] &&
        isNonEmptyString(outcome.label)
      );
    })
  ) {
    return false;
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
