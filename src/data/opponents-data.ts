import type { OpponentsData } from "../types/opponents-data";

export type { OpponentsData } from "../types/opponents-data";

const PATH = "/opponents-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;

/** Fetches the strictly compiled opponent configuration used by every battle. */
export async function loadOpponentsData(): Promise<OpponentsData> {
  const response = await fetch(PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load opponent data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const value: unknown = await response.json();
  const candidate = value as Partial<OpponentsData>;
  if (
    typeof value !== "object" ||
    value === null ||
    candidate.schemaVersion !== 1 ||
    !SHA256_HEX.test(candidate.contentHash ?? "") ||
    !SHA256_HEX.test(candidate.foldHash ?? "") ||
    candidate.battle === undefined ||
    candidate.dreamwell === undefined ||
    candidate.progression === undefined ||
    candidate.coherentDraft === undefined ||
    candidate.corpusSelection === undefined ||
    candidate.ai === undefined ||
    !Array.isArray(candidate.journeyAiDeck)
  ) {
    throw new Error(
      "Failed to load opponent data: malformed opponents-data.json",
    );
  }
  return value as OpponentsData;
}
