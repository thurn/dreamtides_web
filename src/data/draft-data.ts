import type { DraftData, DraftRarityCap } from "../types/draft-data";
import { CARD_RARITIES, type Rarity } from "../types/cards";
import generatedDraftData from "../generated/config/draft-data.json";
import { SourceMessage } from "@trox/runtime";
import { hydrateSourceTransport } from "../runtime/localization/runtime";
import { parseContentHash, parseFoldHash } from "../types/content-hash";

export type {
  DraftData,
  DraftRarityCap,
  Tides4Tuning,
} from "../types/draft-data";

const PATH = "/draft-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const RARITIES: ReadonlySet<Rarity> = new Set(CARD_RARITIES);

function isRarity(value: unknown): value is Rarity {
  return typeof value === "string" &&
    (RARITIES as ReadonlySet<string>).has(value);
}

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
      "presentation",
      "offers",
      "rarityCaps",
      "pool",
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.contentHash !== "string" ||
    !SHA256_HEX.test(value.contentHash) ||
    typeof value.foldHash !== "string" ||
    !SHA256_HEX.test(value.foldHash) ||
    !isRecord(value.presentation) ||
    !hasExactKeys(value.presentation, ["progress"]) ||
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
  let progress;
  try {
    progress = hydrateSourceTransport(
      value.presentation.progress,
      "Draft progress presentation",
    );
  } catch {
    throw new Error("Failed to load draft data: malformed draft-data.json");
  }
  if (progress instanceof SourceMessage) {
    const schemas = progress.argumentSchemas;
    if (
      Object.keys(schemas).sort().join(",") !== "pick_number,pick_total" ||
      Object.values(schemas).some((schema) => schema.kind !== "scalar")
    ) {
      throw new Error("Failed to load draft data: malformed draft-data.json");
    }
  } else if (
    typeof progress === "string" &&
    [...progress.matchAll(/\{([^{}]+)\}/gu)]
      .map((match) => match[1])
      .sort()
      .join(",") !== "pick_number,pick_total"
  ) {
    throw new Error("Failed to load draft data: malformed draft-data.json");
  }

  const seen = new Set<Rarity>();
  const rarityCaps: DraftRarityCap[] = [];
  for (const cap of value.rarityCaps) {
    if (
      !isRecord(cap) ||
      !hasExactKeys(cap, ["rarity", "poolCopyCap", "maxPicksPerRun"]) ||
      !isRarity(cap.rarity) ||
      seen.has(cap.rarity) ||
      !isPositiveInteger(cap.poolCopyCap) ||
      cap.poolCopyCap > value.pool.tides4.copyCap ||
      !isPositiveInteger(cap.maxPicksPerRun)
    ) {
      throw new Error("Failed to load draft data: malformed draft-data.json");
    }
    seen.add(cap.rarity);
    rarityCaps.push({
      rarity: cap.rarity,
      poolCopyCap: cap.poolCopyCap,
      maxPicksPerRun: cap.maxPicksPerRun,
    });
  }

  if (
    Math.ceil(value.pool.tides4.dealSize / value.pool.tides4.copyCap) <
    value.offers.cardsPerOffer * value.offers.picksPerSite
  ) {
    throw new Error("Failed to load draft data: malformed draft-data.json");
  }
  return {
    schemaVersion: 1,
    contentHash: parseContentHash(value.contentHash),
    foldHash: parseFoldHash(value.foldHash),
    presentation: { progress },
    offers: {
      cardsPerOffer: value.offers.cardsPerOffer,
      picksPerSite: value.offers.picksPerSite,
    },
    rarityCaps,
    pool: {
      defaultStrategy: "tides4",
      tides4: {
        dealSize: value.pool.tides4.dealSize,
        copyCap: value.pool.tides4.copyCap,
        maxFacets: value.pool.tides4.maxFacets,
      },
    },
  };
}

/** Generated compatibility view for code paths that need RON-owned defaults. */
export const DEFAULT_DRAFT_DATA = parseDraftData(generatedDraftData);

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
