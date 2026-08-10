import rawResonanceData from "../generated/config/resonance-data.json";
import type {
  Resonance,
  ResonanceData,
  ResonanceDefinition,
} from "../types/resonance-data";

const HASH = /^[0-9a-f]{64}$/u;
const COLOR = /^#[0-9a-f]{6}$/u;

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

function isResonanceDefinition(value: unknown): value is ResonanceDefinition {
  if (!isRecord(value) || typeof value.id !== "string") return false;
  const contract =
    RESONANCE_CONTRACT[value.id as keyof typeof RESONANCE_CONTRACT];
  return contract !== undefined && value.glyph === contract.glyph;
}

export function parseResonanceData(value: unknown): ResonanceData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !HASH.test(String(value.contentHash)) ||
    !Array.isArray(value.resonances) ||
    !value.resonances.every(
      (resonance) =>
        isResonanceDefinition(resonance) &&
        isRecord(resonance) &&
        typeof resonance.displayName === "string" &&
        resonance.displayName.trim() !== "" &&
        COLOR.test(String(resonance.accentColor)) &&
        COLOR.test(String(resonance.chipBackground)) &&
        typeof resonance.chipBorder === "string" &&
        resonance.chipBorder.startsWith("rgba(") &&
        typeof resonance.accessibilityName === "string" &&
        resonance.accessibilityName.trim() !== "",
    ) ||
    new Set(
      value.resonances.map((resonance) =>
        isRecord(resonance) ? resonance.id : null,
      ),
    ).size !== Object.keys(RESONANCE_CONTRACT).length
  ) {
    throw new Error("Failed to load resonance: malformed resonance-data.json");
  }
  return value as unknown as ResonanceData;
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
