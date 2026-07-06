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
import type { TangoColor } from "../../primitives/color";
import { token } from "../../primitives/tokens";

/**
 * The closed set of control-surface materials. Each is a distinct answer to
 * "how should a filter/sort control read over scene art":
 *
 *  - `sprite`  — the ornate beveled gray RPG button sprite (a filled CSS 9-patch)
 *                worn as a solid button surface, with flat light text sitting
 *                directly on the metal. The most tactile, game-object treatment.
 *                In the deck viewer it drives dropdown buttons rather than a
 *                segmented slider — a sprite button that opens a menu.
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
   * material as the track for the track-based treatments, the outlined pill for
   * `outline`, and the filled sprite button for `sprite`. Carries its own border
   * radius.
   */
  trigger: CSSProperties;
  /**
   * Horizontal padding override for a Select trigger, when the surface material
   * needs different breathing room than the size default (e.g. the sprite
   * button's bevel already insets its content). Omitted for treatments that use
   * the size default.
   */
  triggerPadding?: string;
  /**
   * Text color + optional shadow applied to the WHOLE Select trigger content
   * (eyebrow, value, glyphs inherit it) when the surface needs one flat ink —
   * the sprite button paints its label in light ink with a shadow over the
   * metal. Omitted for treatments whose trigger text follows the per-part token
   * colors (muted eyebrow, primary value).
   */
  triggerText?: CSSProperties;
  /** Fill color for the Select trigger's leading glyph and chevron. */
  triggerGlyphColor: TangoColor;
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
 * Bevel thickness (px) of the sprite button's frame — the border region where
 * the chamfered metal edge is drawn, with the sprite's center slice filling
 * behind the label. Matches Button's small size (a 42px-tall sprite button), so
 * a control-height sprite button reads as a member of the same button family.
 */
const SPRITE_BORDER_WIDTH = 13;

/**
 * The gray RPG sprite drawn as a FILLED 9-patch button surface: the beveled
 * metal frame in the border region, the sprite's center slice filling behind
 * the label (`fill`). This is the sprite button both a Select trigger and a
 * selected segment wear — flat text sits directly on the metal, no dark overlay.
 */
function spriteButton(): CSSProperties {
  return {
    background: "transparent",
    borderStyle: "solid",
    borderWidth: SPRITE_BORDER_WIDTH,
    borderColor: "transparent",
    borderImageSource: `url(${buttonGray})`,
    borderImageSlice: `${String(SPRITE_SLICE)} fill`,
    borderImageWidth: `${String(SPRITE_BORDER_WIDTH)}px`,
    borderImageRepeat: "stretch",
    boxSizing: "border-box",
  };
}

/** Flat light ink with a dark shadow — the sprite button's label over metal. */
const SPRITE_TEXT: CSSProperties = {
  color: token("--text-on-accent"),
  textShadow: "0 1px 3px rgba(20, 2, 38, 0.85)",
};

/**
 * Resolve a control treatment to its concrete appearance. The ONE place each
 * material is defined; both SegmentedControl and Select render from the result
 * so a treatment reads identically wherever it is used.
 */
export function controlChrome(treatment: ControlTreatment): ControlChrome {
  switch (treatment) {
    case "sprite":
      return {
        // The sprite treatment is button-shaped, not a slider: it has no track
        // frame. A SegmentedControl on this treatment paints only its SELECTED
        // segment as a sprite button (unselected segments are flat text), and a
        // Select trigger is a sprite button — the deck viewer uses the latter.
        track: {},
        trigger: spriteButton(),
        triggerPadding: "0 12px",
        triggerText: SPRITE_TEXT,
        triggerGlyphColor: "text-on-accent",
        trackPadding: 0,
        segmentGap: 4,
        segmentRadius: token("--radius-inset"),
        segmentBase: {},
        segmentActive: { ...spriteButton(), ...SPRITE_TEXT },
        segmentInactive: { color: token("--text-secondary") },
      };
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
        triggerGlyphColor: "text-secondary",
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
        triggerGlyphColor: "text-secondary",
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
        triggerGlyphColor: "text-secondary",
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
        triggerGlyphColor: "text-secondary",
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
