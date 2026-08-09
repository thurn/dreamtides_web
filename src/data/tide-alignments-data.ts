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

function isAlignmentAtIndex(value: unknown, index: number): boolean {
  if (!isRecord(value) || value.displayOrder !== undefined) return false;
  switch (index) {
    case 0:
      return (
        value.id === "ember" &&
        value.deckColor === "orange" &&
        value.glyph === "tideEmber"
      );
    case 1:
      return (
        value.id === "valor" &&
        value.deckColor === "yellow" &&
        value.glyph === "tideValor"
      );
    case 2:
      return (
        value.id === "vision" &&
        value.deckColor === "blue" &&
        value.glyph === "tideVision"
      );
    case 3:
      return (
        value.id === "wild" &&
        value.deckColor === "green" &&
        value.glyph === "tideWild"
      );
    case 4:
      return (
        value.id === "shadow" &&
        value.deckColor === "purple" &&
        value.glyph === "tideShadow"
      );
    default:
      return false;
  }
}

export function parseTideAlignmentsData(value: unknown): TideAlignmentsData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !HASH.test(String(value.contentHash)) ||
    !Array.isArray(value.alignments) ||
    value.alignments.length !== 5 ||
    !value.alignments.every(
      (alignment, index) =>
        isAlignmentAtIndex(alignment, index) &&
        isRecord(alignment) &&
        typeof alignment.displayName === "string" &&
        alignment.displayName.trim() !== "" &&
        COLOR.test(String(alignment.accentColor)) &&
        COLOR.test(String(alignment.chipBackground)) &&
        typeof alignment.chipBorder === "string" &&
        alignment.chipBorder.startsWith("rgba(") &&
        typeof alignment.accessibilityName === "string" &&
        alignment.accessibilityName.trim() !== "",
    )
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
