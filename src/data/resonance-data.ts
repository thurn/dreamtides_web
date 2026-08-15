import rawResonanceData from "../generated/config/resonance-data.json";
import type {
  Resonance,
  ResonanceData,
  ResonanceDefinition,
} from "../types/resonance-data";
import { parseContentHash } from "../types/content-hash";

const HASH = /^[0-9a-f]{64}$/u;
const COLOR = /^#[0-9a-f]{6}$/u;

function isColor(value: unknown): value is `#${string}` {
  return typeof value === "string" && COLOR.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const RESONANCE_CONTRACT = {
  ember: { glyph: "tideEmber" },
  valor: { glyph: "tideValor" },
  vision: { glyph: "tideVision" },
  wild: { glyph: "tideWild" },
  shadow: { glyph: "tideShadow" },
} as const;

export function isResonance(value: unknown): value is Resonance {
  return (
    typeof value === "string" &&
    RESONANCE_CONTRACT[value as keyof typeof RESONANCE_CONTRACT] !== undefined
  );
}

function resonanceDefinitionFromUnknown(
  value: unknown,
): ResonanceDefinition | null {
  if (!isRecord(value) || !isResonance(value.id)) return null;
  const contract = RESONANCE_CONTRACT[value.id];
  if (
    value.glyph !== contract.glyph ||
    typeof value.displayName !== "string" ||
    value.displayName.trim() === "" ||
    !isColor(value.accentColor) ||
    !isColor(value.chipBackground) ||
    typeof value.chipBorder !== "string" ||
    !value.chipBorder.startsWith("rgba(") ||
    typeof value.accessibilityName !== "string" ||
    value.accessibilityName.trim() === ""
  ) {
    return null;
  }
  return {
    id: value.id,
    displayName: value.displayName,
    glyph: contract.glyph,
    accentColor: value.accentColor,
    chipBackground: value.chipBackground,
    chipBorder: value.chipBorder,
    accessibilityName: value.accessibilityName,
  };
}

export function parseResonanceData(value: unknown): ResonanceData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.contentHash !== "string" ||
    !HASH.test(value.contentHash) ||
    !Array.isArray(value.resonances)
  ) {
    throw new Error("Failed to load resonance: malformed resonance-data.json");
  }
  const resonances = value.resonances.map(resonanceDefinitionFromUnknown);
  if (
    resonances.some((resonance) => resonance === null) ||
    new Set(resonances.map((resonance) => resonance?.id)).size !==
      Object.keys(RESONANCE_CONTRACT).length
  ) {
    throw new Error("Failed to load resonance: malformed resonance-data.json");
  }
  return {
    schemaVersion: 1,
    contentHash: parseContentHash(value.contentHash),
    resonances: resonances.filter(
      (resonance): resonance is ResonanceDefinition => resonance !== null,
    ),
  };
}

export const RESONANCE_DATA = parseResonanceData(rawResonanceData);

export function resonance(
  id: Resonance,
  data: ResonanceData = RESONANCE_DATA,
): ResonanceDefinition {
  const result = data.resonances.find((definition) => definition.id === id);
  if (result === undefined) throw new Error(`Missing resonance ${id}`);
  return result;
}
