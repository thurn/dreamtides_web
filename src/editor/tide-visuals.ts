import { tideAlignmentForDeckColor } from "../data/tide-alignments-data";
import type { Tides4Color } from "../draft/pool/tides4-io";
import { GLYPHS, type Glyph } from "../cumulus/primitives/glyph";

export interface TideColorChip {
  readonly background: string;
  readonly border: string;
  readonly icon: Glyph;
}

export function tideColorChip(color: Tides4Color): TideColorChip {
  const alignment = tideAlignmentForDeckColor(color);
  return {
    background: alignment.chipBackground,
    border: alignment.chipBorder,
    icon: GLYPHS[alignment.glyph],
  };
}

export function tideAccentColor(color: Tides4Color): string {
  return tideAlignmentForDeckColor(color).accentColor;
}
