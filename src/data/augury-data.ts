import type { AuguryArchetypeData, AuguryData } from "../types/augury-data";
import type { MerchantArchetypeId } from "../journey_v2/archetypes/types";

export type { AuguryArchetypeData, AuguryData } from "../types/augury-data";

const PATH = "/augury-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAuguryData(value: unknown): AuguryData {
  if (
    !isRecord(value) || value.schemaVersion !== 1 ||
    typeof value.contentHash !== "string" || !SHA256_HEX.test(value.contentHash) || value.foldHash !== value.contentHash ||
    !isRecord(value.encounter) || value.encounter.offerCount !== 2 || value.encounter.distinctFamilies !== true || typeof value.encounter.allowDecline !== "boolean" ||
    !Array.isArray(value.archetypes) || value.archetypes.length !== 13
  ) throw new Error("Failed to load Augury data: malformed augury-data.json");
  const ids = new Set<string>();
  for (const entry of value.archetypes) {
    if (
      !isRecord(entry) || typeof entry.id !== "string" || ids.has(entry.id) ||
      typeof entry.name !== "string" || entry.name.trim() === "" ||
      !isPresentation(entry.presentation) ||
      typeof entry.enabled !== "boolean" || typeof entry.family !== "string" ||
      typeof entry.weight !== "number" || !Number.isFinite(entry.weight) || entry.weight <= 0 ||
      typeof entry.selectionPolicyId !== "string" || !isRecord(entry.quantities) ||
      Object.values(entry.quantities).some((quantity) => typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0)
    ) throw new Error("Failed to load Augury data: malformed augury-data.json");
    ids.add(entry.id);
  }
  return value as unknown as AuguryData;
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPresentationText(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "text") return isNonemptyString(value.text);
  if (value.kind === "count") return isNonemptyString(value.one) && isNonemptyString(value.other);
  return value.kind === "category" &&
    ["character", "event", "cheap", "midCost", "expensive", "fast", "subtype", "package"]
      .every((key) => isNonemptyString(value[key]));
}

function isPresentation(value: unknown): boolean {
  return isRecord(value) && isPresentationText(value.headline) && isPresentationText(value.subtitle);
}

export async function loadAuguryData(): Promise<AuguryData> {
  const response = await fetch(PATH);
  if (!response.ok) throw new Error(`Failed to load Augury data: ${String(response.status)} ${response.statusText}`);
  return parseAuguryData(await response.json());
}

export function auguryArchetype(data: AuguryData, id: MerchantArchetypeId): AuguryArchetypeData {
  const result = data.archetypes.find((entry) => entry.id === id);
  if (result === undefined) throw new Error(`Augury data is missing archetype ${id}`);
  return result;
}
