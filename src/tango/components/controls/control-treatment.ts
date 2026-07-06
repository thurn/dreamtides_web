// control-treatment — the shared surface vocabulary for Tango's interactive
// filter/sort controls (SegmentedControl, Select).
//
// A "control" here is a resting piece of chrome the player taps to filter or
// sort a collection — the type filter over a deck, the sort dropdown beside it.
// These controls sit over painterly scene art, so their surface material is a
// deliberate design choice, not a per-call-site knob. This module names the
// closed set of materials once, so every control renders from the SAME
// vocabulary rather than each inventing its own inset.
//
// A treatment is chosen for a whole control cluster (a bar of filter + sort
// controls reads as one material), passed down as a single `treatment` prop.
// The `controlChrome(treatment)` function is the one source of truth for what
// each material looks like: the track/trigger surface, the segment radius, and
// the resting / selected segment styles. SegmentedControl and Select both read
// their appearance from it, so a material can never drift between the two.

import type { CSSProperties } from "react";
import buttonGray from "../../assets/Button_Gray.png";
import { token } from "../../primitives/tokens";

/**
 * The closed set of control-surface materials. Each is a distinct answer to
 * "how should a filter/sort control read over scene art":
 *
 *  - `sprite`  — an ornate beveled gray metal frame (a CSS 9-patch of the RPG
 *                button sprite) around a dark control interior. The most
 *                tactile, game-object treatment.
 *  - `flat`    — a solid raised fill with a hairline edge. The plainest,
 *                highest-contrast treatment; reads as flat modern UI.
 *  - `glass`   — a liquid-glass pane that blurs and refracts the scene behind
 *                it, with a neutral frosted selected segment (no brand violet).
 *  - `accent`  — the same liquid glass, but the selected segment carries the
 *                violet accent gradient and glow. The brand-forward treatment.
 *  - `outline` — no track at all; each segment is an individually outlined
 *                pill floating over the art. The lightest-chrome treatment.
 */
export type ControlTreatment =
  | "sprite"
  | "flat"
  | "glass"
  | "accent"
  | "outline";

/** Every treatment, in display order — drives the docs demo and the QA sweep. */
export const CONTROL_TREATMENTS: readonly ControlTreatment[] = [
  "sprite",
  "flat",
  "glass",
  "accent",
  "outline",
] as const;

/** The resolved appearance of one control treatment. */
export interface ControlChrome {
  /**
   * Style for the resting track / trigger surface — the always-visible chrome
   * a SegmentedControl draws behind its segments and a Select draws behind its
   * label. Includes its own border/border-image, fill, and radius.
   */
  track: CSSProperties;
  /** Inner padding of the track around its segments (the frame breathing room). */
  trackPadding: number;
  /**
   * Gap (px) between segments. Small for the connected-track treatments where
   * segments abut inside one surface; wider for `outline`, whose segments are
   * separate floating pills.
   */
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
   * material as the track for the track-based treatments, and the outlined pill
   * for `outline`, which has no track. Carries its own border radius.
   */
  trigger: CSSProperties;
}

/** The liquid-glass track shared by the `glass` and `accent` treatments. */
function glassTrack(): CSSProperties {
  return {
    // The same liquid-glass recipe GroupPanel uses (fill + specular sheen +
    // blur/saturate backdrop + layered rim/wash/drop shadow), inlined here so
    // the control surface reads as a member of the one grouping-surface family.
    background:
      "linear-gradient(150deg, rgba(255,255,255,0.07), rgba(255,255,255,0) 42%), rgba(18,14,28,0.58)",
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

/** The violet accent-gradient selected segment shared by `sprite`/`flat`/`accent`. */
function accentActive(): CSSProperties {
  return {
    background: token("--gradient-accent"),
    boxShadow: token("--glow-accent-soft"),
    color: token("--text-on-accent"),
  };
}

/** Border-image slice matching Button_Gray.png's (742x256) bevel + chamfer. */
const SPRITE_SLICE = 56;
/**
 * Frame thickness (px) drawn from the gray sprite around the control interior.
 * Kept thin so a short control bar keeps enough interior height for legible
 * segments while the beveled corners still read as metal.
 */
const SPRITE_BORDER_WIDTH = 9;

/**
 * Resolve a control treatment to its concrete appearance. The ONE place each
 * material is defined; both SegmentedControl and Select render from the result
 * so a treatment reads identically wherever it is used.
 */
export function controlChrome(treatment: ControlTreatment): ControlChrome {
  switch (treatment) {
    case "sprite": {
      const track: CSSProperties = {
        // Only the ornate gray frame is drawn from the sprite (no `fill`); the
        // interior is a dark chrome fill so light segment text stays legible
        // inside the metal frame.
        background: token("--surface-glass-strong"),
        borderStyle: "solid",
        borderWidth: SPRITE_BORDER_WIDTH,
        borderColor: "transparent",
        borderImageSource: `url(${buttonGray})`,
        borderImageSlice: String(SPRITE_SLICE),
        borderImageWidth: `${String(SPRITE_BORDER_WIDTH)}px`,
        borderImageRepeat: "stretch",
        borderRadius: token("--radius-control"),
        boxSizing: "border-box",
      };
      return {
        track,
        trigger: track,
        trackPadding: 2,
        segmentGap: 2,
        segmentRadius: token("--radius-inset"),
        segmentBase: {},
        segmentActive: accentActive(),
        segmentInactive: { color: token("--text-secondary") },
      };
    }
    case "flat": {
      const track: CSSProperties = {
        background: token("--surface-raised"),
        border: `1px solid ${token("--border-soft")}`,
        borderRadius: token("--radius-control"),
        boxShadow: token("--shadow-sm"),
      };
      return {
        track,
        trigger: track,
        trackPadding: 4,
        segmentGap: 2,
        segmentRadius: token("--radius-inset"),
        segmentBase: {},
        segmentActive: accentActive(),
        segmentInactive: { color: token("--text-muted") },
      };
    }
    case "glass": {
      const track: CSSProperties = {
        ...glassTrack(),
        borderRadius: token("--radius-control"),
      };
      return {
        track,
        trigger: track,
        trackPadding: 4,
        segmentGap: 2,
        segmentRadius: token("--radius-inset"),
        segmentBase: {},
        // A neutral frosted well — this treatment reads as glass, not brand.
        segmentActive: {
          background: token("--surface-hover"),
          border: `1px solid ${token("--border-mid")}`,
          boxShadow: token("--inset-top"),
          color: token("--text-primary"),
        },
        segmentInactive: { color: token("--text-muted") },
      };
    }
    case "accent": {
      const track: CSSProperties = {
        ...glassTrack(),
        borderRadius: token("--radius-pill"),
      };
      return {
        track,
        trigger: track,
        trackPadding: 3,
        segmentGap: 2,
        segmentRadius: token("--radius-pill"),
        segmentBase: {},
        segmentActive: accentActive(),
        segmentInactive: { color: token("--text-muted") },
      };
    }
    case "outline":
      return {
        // No track surface — the segments themselves carry the outline.
        track: {},
        // A lone Select trigger still needs an outline to read as a control, so
        // it borrows the resting segment pill.
        trigger: {
          borderStyle: "solid",
          borderWidth: 1,
          borderColor: token("--border-soft"),
          background: "transparent",
          borderRadius: token("--radius-pill"),
        },
        trackPadding: 0,
        segmentGap: 6,
        segmentRadius: token("--radius-pill"),
        segmentBase: {
          borderStyle: "solid",
          borderWidth: 1,
          background: "transparent",
        },
        segmentActive: {
          borderColor: token("--border-accent"),
          background: token("--color-essence-glow-soft"),
          boxShadow: token("--glow-accent-soft"),
          color: token("--text-primary"),
        },
        segmentInactive: {
          borderColor: token("--border-soft"),
          color: token("--text-muted"),
        },
      };
  }
}
