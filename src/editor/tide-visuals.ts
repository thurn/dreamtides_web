import { resonance } from "../data/resonance-data";
import type { Resonance } from "../types/resonance-data";
import { GLYPHS, type Glyph } from "../cumulus/primitives/glyph";

export interface TideColorChip {
  readonly background: string;
  readonly border: string;
  readonly icon: Glyph;
}

export function tideColorChip(id: Resonance): TideColorChip {
  const definition = resonance(id);
  return {
    background: definition.chipBackground,
    border: definition.chipBorder,
    icon: GLYPHS[definition.glyph],
  };
}

export function tideAccentColor(id: Resonance): string {
  return resonance(id).accentColor;
}
