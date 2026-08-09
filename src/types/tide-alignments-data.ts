import type { Tides4Color } from "../draft/pool/tides4-io";

export type TideAlignmentId = "ember" | "valor" | "vision" | "wild" | "shadow";

export type TideAlignmentGlyph =
  "tideEmber" | "tideValor" | "tideVision" | "tideWild" | "tideShadow";

export interface TideAlignmentDefinition {
  readonly id: TideAlignmentId;
  readonly deckColor: Tides4Color;
  readonly displayName: string;
  readonly glyph: TideAlignmentGlyph;
  readonly accentColor: `#${string}`;
  readonly chipBackground: `#${string}`;
  readonly chipBorder: string;
  readonly accessibilityName: string;
}

export interface TideAlignmentsData {
  readonly schemaVersion: 1;
  readonly contentHash: string;
  readonly alignments: readonly TideAlignmentDefinition[];
}
