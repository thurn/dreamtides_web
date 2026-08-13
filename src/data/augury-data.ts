import type { AuguryArchetypeData, AuguryData } from "../types/augury-data";
import type { MerchantArchetypeId } from "../journey_v2/archetypes/types";
import { hydrateSourceTransport } from "../runtime/localization/runtime";
import { LocalizedString, SourceMessage } from "@trox/runtime";

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
    !isRecord(value.selection) || !Number.isInteger(value.selection.subtypeMinPoolCards) ||
    !isRecord(value.selection.costBands) ||
    Object.values(value.selection.costBands).some((entry) => !Number.isInteger(entry) || Number(entry) < 0) ||
    !isRecord(value.encounter) || typeof value.encounter.allowDecline !== "boolean" ||
    !Array.isArray(value.archetypes) || value.archetypes.length < 2
  ) throw new Error("Failed to load Augury data: malformed augury-data.json");
  const ids = new Set<string>();
  const families = new Set<string>();
  for (const entry of value.archetypes) {
    const presentation = isRecord(entry) && isRecord(entry.presentation) ? entry.presentation : undefined;
    const requiresBackgroundArt = isRecord(entry) && (entry.id === "dreamsign" || entry.id === "add_site");
    if (
      !isRecord(entry) || typeof entry.id !== "string" || ids.has(entry.id) ||
      typeof entry.name !== "string" || entry.name.trim() === "" ||
      !isPresentation(entry.presentation) ||
      (presentation?.backgroundArt !== undefined) !== requiresBackgroundArt ||
      typeof entry.enabled !== "boolean" || typeof entry.family !== "string" ||
      typeof entry.weight !== "number" || !Number.isFinite(entry.weight) || entry.weight <= 0 ||
      typeof entry.selectionPolicyId !== "string" || !isRecord(entry.quantities) ||
      Object.values(entry.quantities).some((quantity) => typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0)
    ) throw new Error("Failed to load Augury data: malformed augury-data.json");
    ids.add(entry.id);
    if (entry.enabled) families.add(entry.family);
  }
  if (
    value.archetypes.filter((entry) => isRecord(entry) && entry.enabled === true).length < 2 ||
    families.size < 2
  ) throw new Error("Failed to load Augury data: malformed augury-data.json");
  const raw = value as unknown as AuguryData;
  return {
    ...raw,
    archetypes: raw.archetypes.map((entry) => ({
      ...entry,
      presentation: {
        ...entry.presentation,
        headline: hydratePresentationText(entry.presentation.headline),
        subtitle: hydratePresentationText(entry.presentation.subtitle),
      },
    })),
  };
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isSourceMessageRef(value: unknown): boolean {
  return isRecord(value) &&
    value.format === "trox-source-message-ref" &&
    typeof value.entry_id === "string" &&
    typeof value.source_signature === "string" &&
    typeof value.contract_signature === "string";
}

function isLocalizedTransport(value: unknown): boolean {
  return isNonemptyString(value) || isSourceMessageRef(value) ||
    value instanceof LocalizedString || value instanceof SourceMessage;
}

function isPresentationText(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "text") return isLocalizedTransport(value.text);
  if (value.kind === "count") return isLocalizedTransport(value.one) && isLocalizedTransport(value.other);
  return value.kind === "category" &&
    ["character", "event", "cheap", "midCost", "expensive", "fast", "subtype", "package"]
      .every((key) => isLocalizedTransport(value[key]));
}

function isPresentation(value: unknown): boolean {
  return isRecord(value) && isPresentationText(value.headline) && isPresentationText(value.subtitle) &&
    (value.backgroundArt === undefined ||
      (isRecord(value.backgroundArt) && value.backgroundArt.source === "card" &&
        typeof value.backgroundArt.imageNumber === "number" &&
        Number.isInteger(value.backgroundArt.imageNumber) && value.backgroundArt.imageNumber > 0));
}

function hydratePresentationText(
  value: AuguryArchetypeData["presentation"]["headline"],
): AuguryArchetypeData["presentation"]["headline"] {
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [
    key,
    key === "kind"
      ? field
      : hydrateSourceTransport(field, `Augury presentation ${key}`),
  ])) as AuguryArchetypeData["presentation"]["headline"];
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
