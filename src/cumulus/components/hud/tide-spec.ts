import { RESONANCE_DATA, resonance } from "../../../data/resonance-data";
import type {
  Resonance,
  ResonanceData,
  ResonanceDefinition,
} from "../../../types/resonance-data";
import { GLYPHS, type Glyph } from "../../primitives/glyph";

export type Tide = Resonance;

export interface TideSpec {
  icon: Glyph;
  bg: string;
  fg: string;
  bd: string;
}

function visualFromResonance(definition: ResonanceDefinition): TideSpec {
  const accent = definition.accentColor;
  return {
    icon: GLYPHS[definition.glyph],
    fg: accent,
    bg: `color-mix(in srgb, ${accent} 18%, transparent)`,
    bd: `color-mix(in srgb, ${accent} 45%, transparent)`,
  };
}

export function tideVisual(
  tide: Tide,
  data: ResonanceData = RESONANCE_DATA,
): TideSpec {
  return visualFromResonance(resonance(tide, data));
}

export function tideResonanceLabel(
  tide: Tide,
  data: ResonanceData = RESONANCE_DATA,
): string {
  return resonance(tide, data).displayName;
}

export function tideAccessibilityName(
  tide: Tide,
  data: ResonanceData = RESONANCE_DATA,
): string {
  return resonance(tide, data).accessibilityName;
}

export function resonances(): readonly ResonanceDefinition[] {
  return RESONANCE_DATA.resonances;
}
