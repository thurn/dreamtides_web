// control-treatment — the resting surface material for Tango's interactive
// filter/sort controls (SegmentedControl, Select) and the matching glass icon
// button.
//
// A "control" here is a resting piece of chrome the player taps to filter or
// sort a collection — the type filter over a deck, the sort dropdown beside it.
// These controls sit over painterly scene art, so their surface material is a
// deliberate, single design choice: liquid glass. `controlChrome()` is the one
// source of truth for what a control looks like — the track/trigger surface,
// the segment radius, and the resting / selected segment styles — so
// SegmentedControl and Select render from the SAME material and it can never
// drift between the two. `glassIconButtonChrome()` gives the corner icon
// buttons (a deck viewer's close control, the dreamscape menu) that same glass
// surface as a fully-round disc, so a control cluster and its corner buttons
// read as one family.

import type { CSSProperties } from "react";
import type { TangoColor } from "../../primitives/color";
import { token } from "../../primitives/tokens";

/** The resolved appearance of the control surface. */
export interface ControlChrome {
  /**
   * Style for the resting track / trigger surface — the always-visible chrome
   * a SegmentedControl draws behind its segments and a Select draws behind its
   * label. Includes its own border, fill, and radius.
   */
  track: CSSProperties;
  /** Inner padding of the track around its segments (the frame breathing room). */
  trackPadding: number;
  /** Gap (px) between segments abutting inside the track. */
  segmentGap: number;
  /** Corner radius (token string) for segments / chips within the track. */
  segmentRadius: string;
  /** Style applied to every segment before the active/inactive overlay. */
  segmentBase: CSSProperties;
  /** Style overlaid on the selected segment. */
  segmentActive: CSSProperties;
  /** Style overlaid on an unselected segment. */
  segmentInactive: CSSProperties;
  /**
   * Resting surface for a single-surface control (a Select trigger) — the same
   * glass material as the track. Carries its own border radius.
   */
  trigger: CSSProperties;
  /** Fill color for the Select trigger's leading glyph and dropdown caret. */
  triggerGlyphColor: TangoColor;
}

/**
 * The liquid-glass surface shared by the controls and the glass icon button:
 * the same recipe as the shared glassSurfaceStyle material (fill + specular
 * sheen + blur/saturate backdrop + layered rim/wash/drop shadow), inlined here
 * so the control surface reads as a member of the one glass-surface family.
 * Returns the material without a border radius; the caller supplies that.
 */
export function glassTrack(): CSSProperties {
  return {
    background:
      "linear-gradient(150deg, rgba(255,255,255,0.07), rgba(255,255,255,0) 42%), rgba(18,14,28,0.5)",
    backdropFilter: "blur(22px) saturate(1.5)",
    WebkitBackdropFilter: "blur(22px) saturate(1.5)",
    border: `1px solid ${token("--border-soft")}`,
    boxShadow: [
      "inset 0 1px 1px rgba(255,255,255,0.22)",
      "inset 0 -18px 30px rgba(120,70,170,0.10)",
      "0 10px 34px rgba(6,2,14,0.5)",
    ].join(", "),
  };
}

/**
 * Resolve the control surface to its concrete appearance — the ONE place the
 * glass material is defined. Both SegmentedControl and Select render from the
 * result so a control cluster reads as one liquid-glass surface, with a neutral
 * frosted selected segment (no brand violet).
 */
export function controlChrome(): ControlChrome {
  const track: CSSProperties = {
    ...glassTrack(),
    borderRadius: token("--radius-control"),
  };
  return {
    track,
    trigger: track,
    // White so the leading glyph and dropdown caret read crisply against the
    // frosted glass.
    triggerGlyphColor: "text-primary",
    trackPadding: 4,
    segmentGap: 2,
    segmentRadius: token("--radius-inset"),
    segmentBase: {},
    // A neutral frosted well — this surface reads as glass, not brand.
    segmentActive: {
      background: token("--surface-hover"),
      border: `1px solid ${token("--border-mid")}`,
      boxShadow: token("--inset-top"),
      color: token("--text-primary"),
    },
    segmentInactive: { color: token("--text-muted") },
  };
}

/**
 * The glass corner icon-button surface — the material worn by a deck viewer's
 * close control and the dreamscape menu button. The same liquid glass as the
 * controls, made a fully-round disc (`--radius-pill`) so a square icon button
 * reads as "fully round" alongside the pill-shaped filter/sort controls. Fully
 * specifies the surface (fill, border, radius, elevation); the caller supplies
 * only layout (size, centering, glyph color).
 */
export function glassIconButtonChrome(): CSSProperties {
  return { ...glassTrack(), borderRadius: token("--radius-pill") };
}
