import type { EconomyData } from "../types/economy-data";

export type { EconomyData } from "../types/economy-data";

const ECONOMY_DATA_JSON_PATH = "/economy-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;

/** Fetches the validated economy document emitted by the asset pipeline. */
export async function loadEconomyData(): Promise<EconomyData> {
  const response = await fetch(ECONOMY_DATA_JSON_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load economy data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const value: unknown = await response.json();
  const candidate = value as Partial<EconomyData>;
  if (
    typeof value !== "object" ||
    value === null ||
    candidate.schemaVersion !== 1 ||
    !SHA256_HEX.test(candidate.contentHash ?? "") ||
    !SHA256_HEX.test(candidate.foldHash ?? "") ||
    candidate.journey === undefined ||
    candidate.shop === undefined ||
    candidate.transfiguration === undefined ||
    candidate.exploration === undefined ||
    "gamble" in candidate
  ) {
    throw new Error("Failed to load economy data: malformed economy-data.json");
  }
  return value as EconomyData;
}
