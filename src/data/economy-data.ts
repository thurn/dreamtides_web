import type { EconomyData } from "../types/economy-data";
import { economyDocument } from "../content/documents";
import { parseContentHash, parseFoldHash } from "../types/content-hash";

export type { EconomyData } from "../types/economy-data";

const SHA256_HEX = /^[0-9a-f]{64}$/u;

/** Validates the economy document assembled from the content modules. */
export function loadEconomyData(): EconomyData {
  return parseEconomyData(economyDocument());
}

/** Validates an economy document. */
export function parseEconomyData(value: unknown): EconomyData {
  const candidate = value as Partial<EconomyData>;
  if (
    typeof value !== "object" ||
    value === null ||
    candidate.schemaVersion !== 1 ||
    !SHA256_HEX.test(candidate.contentHash ?? "") ||
    !SHA256_HEX.test(candidate.foldHash ?? "") ||
    candidate.journey === undefined ||
    candidate.shop === undefined ||
    "gamble" in candidate
  ) {
    throw new Error("Failed to load economy data: malformed economy document");
  }
  return {
    ...(value as Omit<EconomyData, "contentHash" | "foldHash">),
    contentHash: parseContentHash(candidate.contentHash),
    foldHash: parseFoldHash(candidate.foldHash),
  };
}
