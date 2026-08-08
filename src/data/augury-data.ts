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
    !Array.isArray(value.archetypes) || value.archetypes.length !== 17
  ) throw new Error("Failed to load Augury data: malformed augury-data.json");
  const ids = new Set<string>();
  for (const entry of value.archetypes) {
    if (
      !isRecord(entry) || typeof entry.id !== "string" || ids.has(entry.id) ||
      typeof entry.name !== "string" || entry.name.trim() === "" ||
      typeof entry.description !== "string" || entry.description.trim() === "" ||
      typeof entry.enabled !== "boolean" || typeof entry.family !== "string" ||
      typeof entry.weight !== "number" || !Number.isFinite(entry.weight) || entry.weight <= 0 ||
      typeof entry.selectionPolicyId !== "string" || !isRecord(entry.quantities) ||
      Object.values(entry.quantities).some((quantity) => typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0)
    ) throw new Error("Failed to load Augury data: malformed augury-data.json");
    ids.add(entry.id);
  }
  return value as unknown as AuguryData;
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
