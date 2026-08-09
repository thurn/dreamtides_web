import type { JourneyData } from "../types/journey-data";

const PATH = "/journey-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    [...expected].sort().every((key, index) => key === actual[index])
  );
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function textTable(value: unknown, expected: readonly string[]): boolean {
  return (
    record(value) && exact(value, expected) && Object.values(value).every(text)
  );
}

export function parseJourneyData(value: unknown): JourneyData {
  if (
    !record(value) ||
    !exact(value, ["schemaVersion", "contentHash", "presentation"]) ||
    value.schemaVersion !== 1 ||
    typeof value.contentHash !== "string" ||
    !SHA256_HEX.test(value.contentHash) ||
    !record(value.presentation) ||
    !exact(value.presentation, [
      "start",
      "startingDeck",
      "dreamsignReplacement",
    ]) ||
    !textTable(value.presentation.start, [
      "title",
      "chooseAction",
      "rerollAction",
    ]) ||
    !textTable(value.presentation.startingDeck, [
      "title",
      "subtitle",
      "emptyState",
      "beginAction",
    ]) ||
    !textTable(value.presentation.dreamsignReplacement, [
      "title",
      "newDreamsignLabel",
      "replaceAction",
      "keepCurrentAction",
    ])
  ) {
    throw new Error("Failed to load Journey data: malformed journey-data.json");
  }
  return value as unknown as JourneyData;
}

export async function loadJourneyData(): Promise<JourneyData> {
  const response = await fetch(PATH);
  if (!response.ok)
    throw new Error(
      `Failed to load Journey data: ${String(response.status)} ${response.statusText}`,
    );
  return parseJourneyData(await response.json());
}
