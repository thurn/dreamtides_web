import {
  TIDE_ALIGNMENTS_DATA,
  tideAlignment,
} from "../../../data/tide-alignments-data";
import type {
  TideAlignmentDefinition,
  TideAlignmentId,
  TideAlignmentsData,
} from "../../../types/tide-alignments-data";
import { GLYPHS, type Glyph } from "../../primitives/glyph";

export type Tide = TideAlignmentId;

export interface TideSpec {
  icon: Glyph;
  bg: string;
  fg: string;
  bd: string;
}

function visualFromAlignment(alignment: TideAlignmentDefinition): TideSpec {
  const accent = alignment.accentColor;
  return {
    icon: GLYPHS[alignment.glyph],
    fg: accent,
    bg: `color-mix(in srgb, ${accent} 18%, transparent)`,
    bd: `color-mix(in srgb, ${accent} 45%, transparent)`,
  };
}

export function tideVisual(
  tide: Tide,
  data: TideAlignmentsData = TIDE_ALIGNMENTS_DATA,
): TideSpec {
  return visualFromAlignment(tideAlignment(tide, data));
}

export function tideAlignmentLabel(
  tide: Tide,
  data: TideAlignmentsData = TIDE_ALIGNMENTS_DATA,
): string {
  return tideAlignment(tide, data).displayName;
}

export function tideAccessibilityName(
  tide: Tide,
  data: TideAlignmentsData = TIDE_ALIGNMENTS_DATA,
): string {
  return tideAlignment(tide, data).accessibilityName;
}

export function tideAlignments(): readonly TideAlignmentDefinition[] {
  return TIDE_ALIGNMENTS_DATA.alignments;
}
