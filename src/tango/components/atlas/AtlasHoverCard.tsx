// AtlasHoverCard — the large desktop hover card revealed over a Dream Atlas
// node on the Tango desktop atlas. It keeps the fullBleed InfoCard aesthetic —
// the one shared liquid-glass material, the same serif / mono / rules type
// voices, a scene-art hero, and a drop-shadowed transparent character render —
// but recomposes them at a larger, legacy-atlas layout: the scene fills the
// card, the resident Dream Guide (or the boss) stands prominently on the RIGHT,
// and a glass text panel along the bottom-left carries the place, its guide,
// and the resident guide's home-site bonus.
//
// The design's guiding constraint is typographic restraint: the legacy atlas
// card stacked six type styles and two icon families to label every field. This
// card carries the main place information in three voices — a display serif
// (the place), an accent serif (the resident guide), and the rules-text body.
// The site mechanic is a separate standard site InfoCard beside it, so this card
// keeps one job and stays quiet.
//
// This is a screen-local atlas reveal card that reuses InfoCard's glass material
// and press engine. The convergence decision is tracked in pre-existing-issues.txt.

import * as React from "react";
import { token } from "../../primitives/tokens";
import { type ArtRef, resolveArtRef } from "../../primitives/art";
import { resolveImageCrop } from "../../primitives/media";
import { renderRichText, richText } from "../card/rich-text";
import { glassSurfaceStyle } from "../controls/glass-surface";

/** Overall card width (px), matched to the settled desktop atlas hover scale. */
const CARD_WIDTH = 360;
/** Height (px) of the scene image band shown above the glass text panel. */
const HERO_HEIGHT = 160;
/** Dream Guide / boss figure height (px). */
const FIGURE_HEIGHT = 248;
/** Inset (px) of the figure from the card's right edge. */
const FIGURE_RIGHT_INSET = 4;
/** Text-column width inside the glass panel; the right side stays clear for the figure. */
const TEXT_COLUMN_FRACTION = 0.68;

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

/* ---- the three type voices — the card keeps one quiet hierarchy. ---- */
const V_DISPLAY: React.CSSProperties = {
  margin: 0,
  fontFamily: token("--font-title"),
  fontSize: "22px",
  fontWeight: 600,
  lineHeight: 1.14,
  letterSpacing: 0,
  color: token("--text-primary"),
};
const V_ACCENT: React.CSSProperties = {
  margin: 0,
  fontFamily: token("--font-title"),
  fontSize: "14px",
  fontWeight: 500,
  lineHeight: 1.25,
  color: token("--accent-bright"),
};
const V_BODY: React.CSSProperties = {
  fontFamily: token("--font-rules-text"),
  fontSize: "12.5px",
  fontWeight: 500,
  lineHeight: 1.46,
  color: token("--text-primary"),
};

/** The bottom-left field stack the card lays out. */
interface FieldStack {
  /** The display-serif lead name. */
  display: string;
  /** The accent-serif secondary line, or null when absent. */
  accent: string | null;
}

/** Resolves the place-forward display stack for the settled atlas hover card. */
export function resolveFieldStack(content: AtlasHoverContent): FieldStack {
  // place-forward: the place is the hero, its guide the accent line.
  return {
    display: content.placeName,
    accent: content.guideName,
  };
}

interface AtlasHoverCardProps {
  content: AtlasHoverContent;
}

/**
 * The large desktop Dream Atlas hover card. Renders the scene as a full-bleed
 * glass-refracted hero with the resident figure standing on the right and a
 * bottom-left glass text panel carrying the place, guide, and bonus. Pure and props-driven; positioned by the shared
 * InfoCard press engine (`InfoCard.PressPopover`) exactly like every other
 * Tango reveal.
 */
export function AtlasHoverCard({
  content,
}: AtlasHoverCardProps): React.ReactElement {
  const stack = resolveFieldStack(content);

  return (
    <div
      style={{
        position: "relative",
        width: CARD_WIDTH,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        // The scene image is inset from the card edge on all sides, matching the
        // fullBleed variant's floating-hero treatment.
        padding: 10,
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
            right: FIGURE_RIGHT_INSET,
            bottom: 0,
            height: FIGURE_HEIGHT,
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
      <div style={{ height: HERO_HEIGHT, flex: "none" }} />

      {/* The glass text panel: full width so the figure stands over its right,
          with the copy constrained to the left text column. */}
      <div
        style={{
          ...glassSurfaceStyle(),
          background:
            "linear-gradient(150deg, rgba(255,255,255,0.07), rgba(255,255,255,0) 42%), rgba(18,14,28,0.5)",
          position: "relative",
          padding: "13px 15px",
          boxSizing: "border-box",
          whiteSpace: "normal",
          overflowWrap: "break-word",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: `${String(Math.round(TEXT_COLUMN_FRACTION * 100))}%`,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={V_DISPLAY}>{stack.display}</div>
            {stack.accent !== null && stack.accent !== "" && (
              <div style={V_ACCENT}>{stack.accent}</div>
            )}
          </div>
          <div style={V_BODY}>{renderRichText(richText.plain(content.body))}</div>
        </div>
      </div>
    </div>
  );
}
