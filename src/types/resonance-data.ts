export type Resonance = "ember" | "valor" | "vision" | "wild" | "shadow";

export type ResonanceGlyph =
  | "tideEmber"
  | "tideValor"
  | "tideVision"
  | "tideWild"
  | "tideShadow";

export interface ResonanceDefinition {
  readonly id: Resonance;
  readonly displayName: string;
  readonly glyph: ResonanceGlyph;
  readonly accentColor: `#${string}`;
  readonly chipBackground: `#${string}`;
  readonly chipBorder: string;
  readonly accessibilityName: string;
}

export interface ResonanceData {
  readonly schemaVersion: 1;
  readonly contentHash: ContentHash;
  readonly resonances: readonly ResonanceDefinition[];
}
import type { ContentHash } from "./content-hash";
