import rawTideAlignmentsData from "../generated/config/tide-alignments-data.json";
import type { Tides4Color } from "../draft/pool/tides4-io";
import type {
  TideAlignmentDefinition,
  TideAlignmentId,
  TideAlignmentsData,
} from "../types/tide-alignments-data";

const HASH = /^[0-9a-f]{64}$/u;
const COLOR = /^#[0-9a-f]{6}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ALIGNMENT_CONTRACT = {
  ember: { deckColor: "orange", glyph: "tideEmber" },
  valor: { deckColor: "yellow", glyph: "tideValor" },
  vision: { deckColor: "blue", glyph: "tideVision" },
  wild: { deckColor: "green", glyph: "tideWild" },
  shadow: { deckColor: "purple", glyph: "tideShadow" },
} as const;

function isAlignment(value: unknown): value is TideAlignmentDefinition {
  if (!isRecord(value) || typeof value.id !== "string") return false;
  const contract = ALIGNMENT_CONTRACT[value.id as keyof typeof ALIGNMENT_CONTRACT];
  return contract !== undefined && value.deckColor === contract.deckColor && value.glyph === contract.glyph;
}

export function parseTideAlignmentsData(value: unknown): TideAlignmentsData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !HASH.test(String(value.contentHash)) ||
    !Array.isArray(value.alignments) ||
    !value.alignments.every(
      (alignment) =>
        isAlignment(alignment) &&
        isRecord(alignment) &&
        typeof alignment.displayName === "string" &&
        alignment.displayName.trim() !== "" &&
        COLOR.test(String(alignment.accentColor)) &&
        COLOR.test(String(alignment.chipBackground)) &&
        typeof alignment.chipBorder === "string" &&
        alignment.chipBorder.startsWith("rgba(") &&
        typeof alignment.accessibilityName === "string" &&
        alignment.accessibilityName.trim() !== "",
    ) ||
    new Set(value.alignments.map((alignment) => isRecord(alignment) ? alignment.id : null)).size !==
      Object.keys(ALIGNMENT_CONTRACT).length
  ) {
    throw new Error(
      "Failed to load tide alignments: malformed tide-alignments-data.json",
    );
  }
  return value as unknown as TideAlignmentsData;
}

export const TIDE_ALIGNMENTS_DATA = parseTideAlignmentsData(
  rawTideAlignmentsData,
);

export function tideAlignment(
  id: TideAlignmentId,
  data: TideAlignmentsData = TIDE_ALIGNMENTS_DATA,
): TideAlignmentDefinition {
  const result = data.alignments.find((alignment) => alignment.id === id);
  if (result === undefined) throw new Error(`Missing tide alignment ${id}`);
  return result;
}

export function tideAlignmentForDeckColor(
  color: Tides4Color,
  data: TideAlignmentsData = TIDE_ALIGNMENTS_DATA,
): TideAlignmentDefinition {
  const result = data.alignments.find(
    (alignment) => alignment.deckColor === color,
  );
  if (result === undefined)
    throw new Error(`Missing tide alignment for deck color ${color}`);
  return result;
}
