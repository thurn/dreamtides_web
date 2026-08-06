import type { DraftData } from "../types/draft-data";
import { CARD_RARITIES } from "../types/cards";

export type { DraftData, DraftRarityCap, Tides4Tuning } from "../types/draft-data";

const PATH = "/draft-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const RARITIES = new Set<string>(CARD_RARITIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    [...expected].sort().every((key, index) => key === actual[index])
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** Validate the normalized JSON artifact at the runtime trust boundary. */
export function parseDraftData(value: unknown): DraftData {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "contentHash",
      "foldHash",
      "offers",
      "rarityCaps",
      "pool",
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.contentHash !== "string" ||
    !SHA256_HEX.test(value.contentHash) ||
    value.foldHash !== value.contentHash ||
    !isRecord(value.offers) ||
    !hasExactKeys(value.offers, ["cardsPerOffer", "picksPerSite"]) ||
    !isPositiveInteger(value.offers.cardsPerOffer) ||
    !isPositiveInteger(value.offers.picksPerSite) ||
    !Array.isArray(value.rarityCaps) ||
    !isRecord(value.pool) ||
    !hasExactKeys(value.pool, ["defaultStrategy", "tides4"]) ||
    value.pool.defaultStrategy !== "tides4" ||
    !isRecord(value.pool.tides4) ||
    !hasExactKeys(value.pool.tides4, ["dealSize", "copyCap", "maxFacets"]) ||
    !isPositiveInteger(value.pool.tides4.dealSize) ||
    !isPositiveInteger(value.pool.tides4.copyCap) ||
    !isPositiveInteger(value.pool.tides4.maxFacets)
  ) {
    throw new Error("Failed to load draft data: malformed draft-data.json");
  }

  const seen = new Set<string>();
  for (const cap of value.rarityCaps) {
    if (
      !isRecord(cap) ||
      !hasExactKeys(cap, ["rarity", "poolCopyCap", "maxPicksPerRun"]) ||
      typeof cap.rarity !== "string" ||
      !RARITIES.has(cap.rarity) ||
      seen.has(cap.rarity) ||
      !isPositiveInteger(cap.poolCopyCap) ||
      cap.poolCopyCap > value.pool.tides4.copyCap ||
      !isPositiveInteger(cap.maxPicksPerRun)
    ) {
      throw new Error("Failed to load draft data: malformed draft-data.json");
    }
    seen.add(cap.rarity);
  }

  if (
    Math.ceil(value.pool.tides4.dealSize / value.pool.tides4.copyCap) <
    value.offers.cardsPerOffer * value.offers.picksPerSite
  ) {
    throw new Error("Failed to load draft data: malformed draft-data.json");
  }
  return value as unknown as DraftData;
}

/** Fetch the strictly compiled draft rules before any room is folded. */
export async function loadDraftData(): Promise<DraftData> {
  const response = await fetch(PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load draft data: ${String(response.status)} ${response.statusText}`,
    );
  }
  return parseDraftData(await response.json());
}
