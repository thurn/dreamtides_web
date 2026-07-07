// AtlasHoverCard — the large desktop hover card revealed over a Dream Atlas
// node on the Tango desktop atlas. It keeps the fullBleed InfoCard aesthetic —
// the one shared liquid-glass material, the same serif / mono / rules type
// voices, a scene-art hero, and a drop-shadowed transparent character render —
// but recomposes them at a larger, legacy-atlas layout: the scene fills the
// card, the resident Dream Guide (or the boss) stands prominently on the RIGHT,
// and a glass text panel along the bottom-left carries the place, its guide,
// the site, the site bonus, and the affiliation.
//
// The design's guiding constraint is typographic restraint: the legacy atlas
// card stacked six type styles and two icon families to label every field. This
// card carries the same information in FOUR voices — a display serif (the lead
// name), an accent serif (the secondary name), one uppercase mono eyebrow, and
// the rules-text body — with the affiliation reusing the mono voice inside a
// subtle tag. Nothing is labelled ("SITE", "BONUS", "AFFILIATION"); position and
// weight carry the meaning.
//
// ── An exploratory screen-local fork ────────────────────────────────────────
// This is the "requested divergence" the tango design system allows while a
// design is in motion (see the tango skill, "Requested divergence must
// converge"): the card is tuned live through the Dream Atlas dev tweaks panel
// against a schema of box measures and two information-hierarchy proposals. It
// reuses InfoCard's glass material and press engine and is structured as a
// future InfoCard variant body, so once the values and hierarchy settle it
// promotes into `InfoCard variant="atlasReveal"`. The convergence decision is
// tracked in pre-existing-issues.txt.

import * as React from "react";
import { token } from "../../primitives/tokens";
import { type ArtRef, resolveArtRef } from "../../primitives/art";
import { resolveImageCrop } from "../../primitives/media";
import { renderRichText, richText } from "../card/rich-text";
import { glassSurfaceStyle } from "../controls/glass-surface";

/** Which field leads the card — the two information-hierarchy proposals. */
export type AtlasHoverHierarchy = "place-forward" | "guide-forward";

/**
 * The live-tunable geometry and hierarchy of the desktop atlas hover card. Every
 * value is a box measure (px / fraction) or a display toggle outside the token
 * system, so the Dream Atlas dev tweaks panel settles them by eye. The exported
 * defaults are the current design constants; production renders from those.
 */
export interface AtlasHoverTweaks {
  /**
   * PROPOSAL — which field the card leads with. `place-forward` mirrors the
   * legacy card (the dreamscape is the hero, its guide the accent line);
   * `guide-forward` leads with the resident guide (the figure that already
   * dominates the card), with the dreamscape as the overline.
   */
  hierarchy: AtlasHoverHierarchy;
  /** Overall card width (px) — large, near the legacy card. */
  cardWidth: number;
  /** Height (px) of the scene image band shown above the glass text panel. */
  heroHeight: number;
  /** Dream Guide / boss figure height (px). */
  figureHeight: number;
  /** How far (px) the figure's base sits above the card's bottom edge. */
  figureFootInset: number;
  /** Inset (px) of the figure from the card's right edge. */
  figureRightInset: number;
  /** Fraction (0–1) of the panel width the text column occupies; the remainder
   * is the clear zone the figure stands over. */
  textColumnFraction: number;
  /** Show the site name as the mono eyebrow. */
  showSite: boolean;
  /** Show the affiliation as a subtle tag. */
  showAffiliation: boolean;
}

/** The current design constants — the baked hover-card geometry and hierarchy. */
export const ATLAS_HOVER_DEFAULTS: AtlasHoverTweaks = {
  hierarchy: "place-forward",
  cardWidth: 440,
  heroHeight: 208,
  figureHeight: 320,
  figureFootInset: 0,
  figureRightInset: 6,
  textColumnFraction: 0.64,
  showSite: true,
  showAffiliation: true,
};

/**
 * The resolved copy + art the hover card renders. Plain display data (strings
 * and {@link ArtRef}s); the view-model builder resolves names, the site label,
 * and the boss incarnation into these fields.
 */
export interface AtlasHoverContent {
  /** The looming boss node — suppresses the site / affiliation, and the
   * incarnation title stands in as the guide name. */
  isBoss: boolean;
  /** The scene hero art (the dreamscape scene, or Limbo for the boss). */
  sceneArt: ArtRef;
  /** The character render standing on the right (the guide, or the boss); null
   * for a guideless place (the starter). */
  figureArt: ArtRef | null;
  /** The place name (dreamscape, or "Limbo"). */
  placeName: string;
  /** The resident guide's name, or the boss incarnation title; null for the
   * starter. */
  guideName: string | null;
  /** The signature site's display name (e.g. "Dream Augury"); null for the
   * starter / boss. */
  siteName: string | null;
  /** The site bonus, starter blurb, or boss incarnation description. */
  body: string;
  /** The dreamscape's affiliation name; null for the starter / boss. */
  affiliation: string | null;
}

/* ---- the four type voices — the whole point of the redesign. All sizes /
   faces come from tokens; the card carries no fifth or sixth style. ---- */
const V_DISPLAY: React.CSSProperties = {
  margin: 0,
  fontFamily: token("--font-title"),
  fontSize: "26px",
  fontWeight: 600,
  lineHeight: 1.14,
  letterSpacing: "-0.01em",
  color: token("--text-primary"),
};
const V_ACCENT: React.CSSProperties = {
  margin: 0,
  fontFamily: token("--font-title"),
  fontSize: "16px",
  fontWeight: 500,
  lineHeight: 1.25,
  color: token("--accent-bright"),
};
const V_EYEBROW: React.CSSProperties = {
  fontFamily: token("--font-meta"),
  fontSize: "10.5px",
  fontWeight: 700,
  lineHeight: 1,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color: token("--text-faint"),
};
const V_BODY: React.CSSProperties = {
  fontFamily: token("--font-rules-text"),
  fontSize: "14px",
  fontWeight: 500,
  lineHeight: 1.46,
  color: token("--text-primary"),
};

/** The bottom-left field stack the card lays out from the active hierarchy. */
interface FieldStack {
  /** The uppercase mono overline, or null when suppressed / redundant. */
  eyebrow: string | null;
  /** The display-serif lead name. */
  display: string;
  /** The accent-serif secondary line, or null when absent. */
  accent: string | null;
}

/**
 * Resolves the eyebrow / display / accent lines for the active hierarchy. PURE.
 * `place-forward` leads with the place and drops the guide beneath it;
 * `guide-forward` leads with the guide and lifts the place into the overline.
 * The eyebrow never repeats the display line (the starter, with no guide, falls
 * back to its place name as the lead).
 */
export function resolveFieldStack(
  content: AtlasHoverContent,
  tweaks: AtlasHoverTweaks,
): FieldStack {
  const site = tweaks.showSite ? content.siteName : null;
  if (tweaks.hierarchy === "guide-forward") {
    const display = content.guideName ?? content.placeName;
    // Place rides the overline; suppress it when it already IS the lead line.
    const eyebrow = display === content.placeName ? site : content.placeName;
    const accent = display === content.placeName ? null : site;
    return { eyebrow, display, accent };
  }
  // place-forward: the place is the hero, its guide the accent line.
  return {
    eyebrow: site,
    display: content.placeName,
    accent: content.guideName,
  };
}

interface AtlasHoverCardProps {
  content: AtlasHoverContent;
  tweaks?: AtlasHoverTweaks;
}

/**
 * The large desktop Dream Atlas hover card. Renders the scene as a full-bleed
 * glass-refracted hero with the resident figure standing on the right and a
 * bottom-left glass text panel carrying the resolved field stack, site bonus,
 * and affiliation tag. Pure and props-driven; positioned by the shared
 * InfoCard press engine (`InfoCard.PressPopover`) exactly like every other
 * Tango reveal.
 */
export function AtlasHoverCard({
  content,
  tweaks = ATLAS_HOVER_DEFAULTS,
}: AtlasHoverCardProps): React.ReactElement {
  const stack = resolveFieldStack(content, tweaks);
  const showAffiliation =
    tweaks.showAffiliation && content.affiliation !== null;

  return (
    <div
      style={{
        position: "relative",
        width: tweaks.cardWidth,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        // The scene image is inset from the card edge on all sides, matching the
        // fullBleed variant's floating-hero treatment.
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      {/* Full-bleed scene hero behind everything: the glass panel samples it. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: token("--radius-popover"),
          overflow: "hidden",
          boxShadow: `${token("--shadow-lg")}, inset 0 0 0 1px rgba(255,255,255,0.08)`,
        }}
      >
        <img
          src={resolveArtRef(content.sceneArt)}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: resolveImageCrop("center"),
            userSelect: "none",
          }}
        />
      </div>

      {/* The resident figure, standing prominent on the right and straddling the
          hero / glass seam. Painted after the panel in DOM order so its feet
          fall in FRONT of the glass, exactly like the legacy guide. */}
      {content.figureArt !== null && (
        <img
          src={resolveArtRef(content.figureArt)}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            right: tweaks.figureRightInset,
            bottom: tweaks.figureFootInset,
            height: tweaks.figureHeight,
            width: "auto",
            maxWidth: "56%",
            objectFit: "contain",
            objectPosition: "bottom",
            filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.66))",
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 2,
          }}
        />
      )}

      {/* Reserve the top image band so the scene reads above the glass panel. */}
      <div style={{ height: tweaks.heroHeight, flex: "none" }} />

      {/* The glass text panel: full width so the figure stands over its right,
          with the copy constrained to the left text column. */}
      <div
        style={{
          ...glassSurfaceStyle(),
          background:
            "linear-gradient(150deg, rgba(255,255,255,0.07), rgba(255,255,255,0) 42%), rgba(18,14,28,0.5)",
          position: "relative",
          padding: "16px 18px",
          boxSizing: "border-box",
          whiteSpace: "normal",
          overflowWrap: "break-word",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: `${String(Math.round(tweaks.textColumnFraction * 100))}%`,
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          {stack.eyebrow !== null && stack.eyebrow !== "" && (
            <div style={V_EYEBROW}>{stack.eyebrow}</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={V_DISPLAY}>{stack.display}</div>
            {stack.accent !== null && stack.accent !== "" && (
              <div style={V_ACCENT}>{stack.accent}</div>
            )}
          </div>
          <div style={V_BODY}>{renderRichText(richText.plain(content.body))}</div>
          {showAffiliation && (
            <div style={{ display: "flex", marginTop: 3 }}>
              <span
                style={{
                  ...V_EYEBROW,
                  color: token("--accent-bright"),
                  padding: "5px 10px",
                  borderRadius: token("--radius-control"),
                  border: "1px solid rgba(168,85,247,0.4)",
                  background: token("--accent-tint"),
                }}
              >
                {content.affiliation}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
