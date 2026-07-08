// InfoCard — the ONE press-to-reveal information card for Tango. Every
// reveal-on-interaction popup — tide descriptions, the Dreamcaller profile,
// dreamsign abilities, site descriptions, essence — renders through this single
// component so the vocabulary is identical everywhere.
//
// The shell is fixed and shared (a liquid-glass pane, not a scrim):
//   - no colored border, no arrow / caret pointing back at the origin
//   - one glass material       — the shared glassSurfaceStyle chrome recipe
//   - one corner radius         — --radius-popover
//   - one shadow/rim treatment  — glassSurfaceStyle's layered glass edge
//   - one type scale            — headline (serif) / body (rules) / meta (mono)
// Only the MEDIA treatment varies by content, via `variant`:
//   - object      — a centered framed portrait OR contained transparent object
//   - fullBleed   — a square hero image with a glass text card laid on TOP of it:
//                   the image IS the card, with meta / name / epithet / body
//                   revealed on the shared glass, floating over the lower image
//   - atlasReveal — the large desktop Dream Atlas reveal: scene hero, prominent
//                   right-side figure, and place / guide / bonus glass panel
//   - icon        — a glyph disc beside the title
//   - tide        — a tide's own colored disc + alignment label
//   - text        — an optional small lead glyph + title, with an optional epithet
//                   (a smaller serif subtitle in white) under the name
//
// The placement / timing engine ships alongside it and is attached as
// statics: `InfoCard.PressPopover / PressInfo / usePressReveal / anchorRect /
// setRevealDelay / SITE_DISC`.
//
// ── The reveal contract ──────────────────────────────────────────────────
//   - no close button, no scrim; anchored to the trigger/pointer (never
//     centered, never under the finger), clamped fully on-screen, and
//     pointerEvents:none on the popover so it can't eat the release.
//   - a ~300ms click-window separates a TAP-to-enter from a HOLD-to-read.
//
// THE ONE DELIBERATE GENERALIZATION from the touch-first design source is the
// input-adaptive reveal (see `useFinePointer` / `usePressReveal`): on a fine
// pointer (mouse/desktop) HOVER reveals and a press only gives its press
// feedback (never reveals); on a coarse pointer (touch) press-down reveals and
// release dismisses. The popover contract above is identical in both modes.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/overlays/InfoCard.jsx / .d.ts), generalized from touch-only to
// Tango's input-adaptive pointer model.

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Pressable,
  PRESS_SCALE,
  HOVER_SCALE,
} from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { type Glyph } from "../../primitives/glyph";
import { type ArtRef, resolveArtRef } from "../../primitives/art";
import {
  type ImageCrop,
  type MediaFilter,
  resolveImageCrop,
  resolveMediaFilter,
} from "../../primitives/media";
import { renderRichText, type RichText } from "../card/rich-text";
import { glassSurfaceStyle } from "../controls/glass-surface";
import { tideVisual, tideAlignmentLabel, type Tide } from "../hud/tide-spec";

/* ---- faithfully-copied layout literals from the design source (not tokens:
   these are the info-card's own fixed geometry, not design-system scale) ---- */
const CARD_W = 248; // every info card is this wide
const EDGE_PX = 12; // never within 12px of a screen edge
const GAP_PX = 14; // uniform distance from the pressed object
const CLICK_WINDOW_MS = 300; // release within this → still counts as a tap/click
// Radius (px) of the fingertip disc kept clear of the card on touch. A press
// reveals beside — never under — the finger, so a 36px-diameter disc centered on
// the actual press point must not overlap the popover. The clamp treats that
// disc as part of the obstacle the card clears, so pressing near a large node's
// top edge still pushes the card fully clear of the finger. Fine-pointer hover
// has no finger, so it never applies (the press point is only captured on a
// touch press-down).
const FINGER_RADIUS_PX = 18;
const PADX = 15;
const PADY = 14;
// Inset (px) of the fullBleed variant's floating glass text card from the square
// hero image's edges — how much of the image shows around the card. Its own
// fixed geometry, not a design-system scale step.
const FULL_BLEED_INSET = 12;
// Height (px) of the fullBleed variant's centered foreground `figure` — the
// transparent character render (a Dream Guide, the boss) that stands prominently
// over the hero image, above the glass text card. Its own fixed geometry, not a
// design-system scale step. Sized to nearly fill the square hero so the figure
// reads as the card's subject; its lower body falls behind the glass text card.
const FULL_BLEED_FIGURE_HEIGHT = 208;
/** Overall width (px) of the desktop atlas-reveal card's authored layout. */
const ATLAS_REVEAL_CARD_W = 360;
/** Scene-image band height (px) above the atlas-reveal glass text panel. */
const ATLAS_REVEAL_HERO_H = 160;
/** Dream Guide / boss figure height (px) in the atlas-reveal card. */
const ATLAS_REVEAL_FIGURE_H = 248;
/** Inset (px) of the atlas-reveal figure from the card's right edge. */
const ATLAS_REVEAL_FIGURE_RIGHT = 4;
/** Fraction of the atlas-reveal glass panel reserved for text. */
const ATLAS_REVEAL_TEXT_FRACTION = 0.68;
const INFO_CARD_GLASS_FILL = "rgba(18,14,28,0.5)";
const INFO_CARD_GLASS_BACKGROUND = `linear-gradient(150deg, rgba(255,255,255,0.07), rgba(255,255,255,0) 42%), ${INFO_CARD_GLASS_FILL}`;
const geometryPx = (px: number): string =>
  `calc(${String(px)}px * var(--info-card-geometry-scale, 1))`;

/**
 * The fixed width (px) of every InfoCard — its own geometry, not a design-system
 * scale step. Exported so a surface that stacks InfoCards (a glossary-definition
 * column) can size its container to hug the cards exactly, reading the one width
 * from here instead of re-declaring the literal.
 */
export const INFO_CARD_WIDTH = CARD_W;

/**
 * On a narrow (mobile) viewport every info card lays out at this fraction of
 * the screen width. The width is capped at the native card width, so desktop
 * keeps the authored popover geometry.
 */
const MOBILE_WIDTH_FRACTION = 0.45;
// Mobile InfoCards keep a smaller internal type scale so the overlaid glass
// text block covers less of image-led reveals. Tune this one constant to adjust
// title, epithet, meta, and body text proportionally.
const MOBILE_TEXT_SCALE = 0.666;

/**
 * The laid-out width (px) for an info card on a `viewportWidth`-px screen:
 * narrow screens use `fraction` of the viewport, capped at native size so
 * desktop stays unchanged. PURE.
 */
export function infoCardWidth(
  viewportWidth: number,
  fraction: number = MOBILE_WIDTH_FRACTION,
  nativeWidth: number = CARD_W,
): number {
  if (!(viewportWidth > 0)) {
    return nativeWidth;
  }
  return Math.min(nativeWidth, fraction * viewportWidth);
}

/**
 * The internal typography multiplier for the same viewport: mobile-sized cards
 * use the shared mobile text scale, while native-width cards use the token
 * type scale. PURE.
 */
export function infoCardTextScale(
  viewportWidth: number,
  mobileTextScale: number = MOBILE_TEXT_SCALE,
): number {
  return infoCardWidth(viewportWidth) < CARD_W ? mobileTextScale : 1;
}

/** Screen inset (px): the popover is clamped to never come within this of any
 * viewport edge. Exported for the clamp tests. */
export const EDGE = EDGE_PX;
/** Default uniform gap (px) between the popover and its anchor. Exported for
 * the clamp tests. */
export const GAP = GAP_PX;
/** Default click window (ms) separating a tap from a hold. Exported for the
 * tap-vs-hold tests. */
export const CLICK_WINDOW = CLICK_WINDOW_MS;
/** Radius (px) of the fingertip disc a touch reveal keeps clear of the card.
 * Exported for the finger-clearance clamp tests. */
export const FINGER_RADIUS = FINGER_RADIUS_PX;

/**
 * The ONE global reveal delay (ms). Module-scoped (NOT a per-call prop) and read
 * live on each press, so a press target literally cannot be wired up without it —
 * there is no delay argument to forget. Default 0 — immediate, never a
 * long-press. Set via `InfoCard.setRevealDelay(ms)`.
 */
let revealDelayMs = 0;

/** Set the ONE global reveal delay (ms). Default 0 — immediate, never long-press. */
export function setRevealDelay(ms: number): void {
  revealDelayMs = Math.max(0, Math.round(Number(ms) || 0));
}

/* ---- the shared shell + type scale (the coherent vocabulary) ---- */
const shell: React.CSSProperties = {
  ...glassSurfaceStyle(),
  background: INFO_CARD_GLASS_BACKGROUND,
  width: "var(--info-card-width)",
  boxSizing: "border-box",
  textAlign: "left",
  overflow: "hidden",
  // Reset text wrapping at the shell so an InfoCard ALWAYS wraps its copy to the
  // fixed CARD_W, no matter what its trigger inherits down. A common trigger —
  // TidePill, a HUD chip — is itself `white-space: nowrap`; without this reset
  // that nowrap cascades into the standalone popover and the body clips at the
  // card edge instead of wrapping. Making the shell authoritative means it is
  // impossible to mount an InfoCard whose text doesn't wrap. Inline units that
  // must stay on one line (essence `50◆`, an energy `2●`) set their own nowrap
  // inside rich text and are unaffected.
  whiteSpace: "normal",
  overflowWrap: "break-word",
};
const tHeadline: React.CSSProperties = {
  margin: 0,
  fontFamily: token("--font-title"),
  fontSize: "calc(19px * var(--info-card-text-scale, 1))",
  fontWeight: 600,
  lineHeight: 1.18,
  color: token("--text-primary"),
  letterSpacing: "-0.01em",
};
const tEpithet: React.CSSProperties = {
  margin: 0,
  fontFamily: token("--font-title"),
  fontSize: "calc(14px * var(--info-card-text-scale, 1))",
  fontWeight: 500,
  lineHeight: 1.25,
  color: token("--text-primary"),
};
const tBody: React.CSSProperties = {
  fontFamily: token("--font-rules-text"),
  fontSize: "calc(14px * var(--info-card-text-scale, 1))",
  fontWeight: 500,
  lineHeight: 1.45,
  color: token("--text-primary"),
};
const tMeta: React.CSSProperties = {
  fontFamily: token("--font-meta"),
  fontSize: "calc(10.5px * var(--info-card-text-scale, 1))",
  fontWeight: 700,
  lineHeight: 1,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: token("--text-faint"),
};
const tAtlasHeadline: React.CSSProperties = {
  margin: 0,
  fontFamily: token("--font-title"),
  fontSize: "calc(22px * var(--info-card-text-scale, 1))",
  fontWeight: 600,
  lineHeight: 1.14,
  letterSpacing: 0,
  color: token("--text-primary"),
};
const tAtlasSubtitle: React.CSSProperties = {
  margin: 0,
  fontFamily: token("--font-title"),
  fontSize: "calc(14px * var(--info-card-text-scale, 1))",
  fontWeight: 500,
  lineHeight: 1.25,
  color: token("--accent-bright"),
};
const tAtlasBody: React.CSSProperties = {
  fontFamily: token("--font-rules-text"),
  fontSize: "calc(12.5px * var(--info-card-text-scale, 1))",
  fontWeight: 500,
  lineHeight: 1.46,
  color: token("--text-primary"),
};

/**
 * The violet-glow disc shared by the icon variant AND the dreamscape SiteNode,
 * so the disc reads identically in both. The gradient stops and glow are the
 * design source's own faithfully-copied literals; the inset ring is the
 * --accent token so a rebrand propagates.
 */
export const SITE_DISC: React.CSSProperties = {
  background: "radial-gradient(circle at 50% 34%, #23212b, #0a0910 82%)",
  boxShadow: `inset 0 0 0 2.5px ${token("--accent")}, 0 0 14px 1px rgba(168,85,247,0.45)`,
};

/** Which media treatment an InfoCard renders. */
export type InfoCardVariant =
  | "object"
  | "fullBleed"
  | "atlasReveal"
  | "icon"
  | "tide"
  | "text";

/**
 * The copy every InfoCard carries, shared across all media variants. The
 * MEDIA a variant renders lives on the per-variant interfaces below, NEVER
 * here — so the type can require the media that a given `variant` renders
 * (see {@link InfoCardProps}).
 */
interface InfoCardCommonProps {
  /** The card's headline. Plain text — resolve names before display. */
  title?: string;
  /** The reveal copy, as a {@link RichText} value (plain / rules / note / stack). */
  body?: RichText;
}

/**
 * object variant — a centered media block (a framed portrait OR a contained
 * transparent object) above the title + body. An object card IS its media, so
 * `image` is required: there is no object card without one.
 */
export interface InfoCardObjectProps extends InfoCardCommonProps {
  variant: "object";
  /** The media the card is built around, as an {@link ArtRef}. Required. */
  image: ArtRef;
  /** How the media is cropped. Default `"top"`. */
  imageCrop?: ImageCrop;
  /** A named media {@link MediaFilter} (e.g. a drop-shadow for a transparent object). */
  imageFilter?: MediaFilter;
  /** true = framed portrait, false = contained transparent object. Default false. */
  frame?: boolean;
}

/**
 * fullBleed variant — a square hero image with a glass text card laid on TOP of
 * it: the image fills the whole card (rounded corners), and the shared
 * liquid-glass text card floats over its lower portion carrying the meta / name
 * / epithet / body. It is literally "an image, with a text info card placed on
 * top of it". Built for the Dreamcaller profile reveal and the atlas node
 * reveals. The image IS its media, so `image` is required.
 */
export interface InfoCardFullBleedProps extends InfoCardCommonProps {
  variant: "fullBleed";
  /** The square hero image the card is built on, as an {@link ArtRef}. Required. */
  image: ArtRef;
  /** How the hero image is cropped. Default `"center"`. */
  imageCrop?: ImageCrop;
  /** A named media {@link MediaFilter} (e.g. a spark glow). */
  imageFilter?: MediaFilter;
  /**
   * An optional foreground character render (a transparent full-body cutout —
   * a Dream Guide, the boss) laid centered and prominent OVER the hero image,
   * standing above the glass text card. Its own subject of the card; omit for a
   * scene-only hero. An {@link ArtRef}, resolved by the component.
   */
  figure?: ArtRef;
  /** Small mono/uppercase overline above the title, on the glass card. */
  meta?: string;
  /**
   * An epithet under the name — a smaller serif line in white, mirroring the
   * Dreamcaller-select name/epithet pairing. Plain text; resolve before display.
   */
  subtitle?: string;
}

/**
 * atlasReveal variant — the large desktop Dream Atlas reveal: scene art fills
 * the card, an optional transparent figure stands on the right, and the place /
 * guide / body copy lives in the shared glass text panel. The geometry is a
 * strict InfoCard variant so atlas screens do not copy the shell or material.
 */
export interface InfoCardAtlasRevealProps extends InfoCardCommonProps {
  variant: "atlasReveal";
  /** The scene hero image the card is built on, as an {@link ArtRef}. Required. */
  image: ArtRef;
  /** How the hero image is cropped. Default `"center"`. */
  imageCrop?: ImageCrop;
  /** A named media {@link MediaFilter} for the scene image. */
  imageFilter?: MediaFilter;
  /** Optional transparent full-body figure standing on the card's right side. */
  figure?: ArtRef;
  /** The resident guide / boss title under the place headline. */
  subtitle?: string;
}

/**
 * icon variant — a glyph disc beside the title, body below. The disc IS its
 * glyph, so `glyph` is required.
 */
export interface InfoCardIconProps extends InfoCardCommonProps {
  variant: "icon";
  /** The {@link Glyph} the disc renders. Required. */
  glyph: Glyph;
}

/**
 * tide variant — a tide's own colored disc beside the title, the tide's
 * alignment name (Valor, Shadow, …) in that tide's color below the title, then
 * the body. The named `tide` fixes the disc color, mark, and alignment label —
 * the caller picks a tide, never a raw color — so every tide reveal reads
 * identically to that tide's disc on screen.
 */
export interface InfoCardTideProps extends InfoCardCommonProps {
  variant: "tide";
  /** Which of the five tides. Fixes the disc color/mark and the alignment label. */
  tide: Tide;
}

/**
 * text variant (the default) — an optional small lead glyph + title, an
 * optional epithet under the name, then the body. Carries no required media;
 * its lead glyph is decorative.
 */
export interface InfoCardTextProps extends InfoCardCommonProps {
  /** Which media treatment. Omit — or pass 'text' — for the text variant. */
  variant?: "text";
  /** Small mono/uppercase overline above the title. */
  meta?: string;
  /** A small leading {@link Glyph}. */
  leadGlyph?: Glyph;
  /**
   * An epithet under the name — a smaller serif subtitle in white, mirroring
   * the Dreamcaller-select name/epithet pairing. Plain text; resolve before
   * display.
   */
  subtitle?: string;
}

/**
 * InfoCard props — a discriminated union on `variant`. Each media variant
 * carries (and REQUIRES) exactly the media it renders, so it is a compile
 * error to construct an object card without an `image` or an icon card
 * without a `glyph`. An InfoCard can therefore never render an empty `<img>`
 * or an empty disc — the type guarantees a valid, complete card. Narrow on
 * `variant` to read a variant's media.
 */
export type InfoCardProps =
  | InfoCardObjectProps
  | InfoCardFullBleedProps
  | InfoCardAtlasRevealProps
  | InfoCardIconProps
  | InfoCardTideProps
  | InfoCardTextProps;

/* ================================================================
   InfoCard — content, media variants, one shell.
   ================================================================ */
/**
 * The info card's variant body (object / fullBleed / icon / tide / text) on the
 * one fixed liquid-glass shell. Rendered at its native geometry; the exported
 * {@link InfoCard} supplies the viewport-driven width and text-scale variables
 * so the body never has to read screen size.
 */
function InfoCardBody(props: InfoCardProps): React.ReactElement {
  const { title, body } = props;
  // `variant` is optional only on the text member; resolve the default once for
  // the shared body/title styling. The per-variant branches below narrow on the
  // discriminant directly so each reads only the media its interface carries.
  const variant: InfoCardVariant = props.variant ?? "text";
  const Body =
    body == null ? null : (
      <div
        style={{
          ...tBody,
          textAlign: variant === "object" ? "center" : "left",
        }}
      >
        {renderRichText(body)}
      </div>
    );
  const titleContent = title;

  /* --- object: a centered media block (framed portrait OR contained
     transparent object) above its name + text. --- */
  if (props.variant === "object") {
    const { image, imageCrop = "top", imageFilter, frame = false } = props;
    const imageUrl = resolveArtRef(image);
    const media = frame ? (
      <div
        style={{
          width: geometryPx(124),
          height: geometryPx(150),
          flex: "none",
          position: "relative",
          overflow: "hidden",
          borderRadius: token("--radius-control"),
          // shadow token + a faithfully-copied inset hairline highlight
          boxShadow: `${token("--shadow-md")}, inset 0 0 0 1px rgba(255,255,255,0.08)`,
        }}
      >
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: resolveImageCrop(imageCrop),
            userSelect: "none",
          }}
        />
      </div>
    ) : (
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        style={{
          width: geometryPx(96),
          height: geometryPx(96),
          objectFit: "contain",
          display: "block",
          filter: imageFilter ? resolveMediaFilter(imageFilter) : undefined,
        }}
      />
    );
    return (
      <div
        style={{
          ...shell,
          padding: `${geometryPx(18)} ${geometryPx(16)} ${geometryPx(16)}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: geometryPx(12),
          textAlign: "center",
        }}
      >
        {media}
        <div style={{ ...tHeadline, textAlign: "center" }}>{titleContent}</div>
        {Body}
      </div>
    );
  }

  /* --- fullBleed: a square hero image that fills the whole card, with the
     shared liquid-glass text card laid on TOP of it — floating over the lower
     portion, inset from the image edges, so it reads as "a text info card
     placed on top of an image". The glass backdrop-filter samples the image
     behind it, blurring it through the card exactly like the popover shell. The
     image layer clips itself to the popover radius (and lifts off the scene with
     the hero shadow); the glass card is a sibling so its own drop shadow is not
     clipped. A long body simply grows the card taller and the image grows with
     it, so the image always fills behind the card. --- */
  if (props.variant === "fullBleed") {
    const {
      image,
      imageCrop = "center",
      imageFilter,
      figure,
      meta,
      subtitle,
    } = props;
    const Meta = meta ? (
      <div style={{ ...tMeta, marginBottom: 7 }}>{meta}</div>
    ) : null;
    return (
      <div
        style={{
          position: "relative",
          width: "var(--info-card-width)",
          // A square hero by default; grows only if the glass card is taller
          // than the square, in which case the image layer grows with it.
          minHeight: "var(--info-card-width)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: geometryPx(FULL_BLEED_INSET),
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: token("--radius-popover"),
            overflow: "hidden",
            // Lift the hero image off the scene, plus the faithfully-copied
            // inset hairline highlight shared by the other media frames.
            boxShadow: `${token("--shadow-lg")}, inset 0 0 0 1px rgba(255,255,255,0.08)`,
          }}
        >
          <img
            src={resolveArtRef(image)}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: resolveImageCrop(imageCrop),
              userSelect: "none",
              filter: imageFilter ? resolveMediaFilter(imageFilter) : undefined,
            }}
          />
        </div>
        {figure !== undefined && (
          // The foreground character render, centered and prominent over the
          // hero image. Absolutely placed so it floats above the scene without
          // displacing the glass text card; its lower body falls behind the
          // card (which paints after it in DOM order). A drop shadow lifts the
          // transparent cutout off the scene for legibility (the on-media
          // legibility ladder).
          <img
            src={resolveArtRef(figure)}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: "50%",
              top: geometryPx(FULL_BLEED_INSET),
              transform: "translateX(-50%)",
              height: geometryPx(FULL_BLEED_FIGURE_HEIGHT),
              width: "auto",
              maxWidth: `calc(100% - ${geometryPx(FULL_BLEED_INSET * 2)})`,
              objectFit: "contain",
              filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.62))",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        )}
        <div
          style={{
            ...glassSurfaceStyle(),
            background: INFO_CARD_GLASS_BACKGROUND,
            position: "relative",
            padding: `${geometryPx(PADY)} ${geometryPx(PADX)}`,
            boxSizing: "border-box",
            textAlign: "left",
            // Same wrapping reset as the shell so on-image copy always wraps to
            // the card width no matter what the trigger inherits down.
            whiteSpace: "normal",
            overflowWrap: "break-word",
          }}
        >
          {Meta}
          <div
            style={{ ...tHeadline, marginBottom: subtitle ? 2 : body ? 7 : 0 }}
          >
            {titleContent}
          </div>
          {subtitle !== undefined && subtitle !== "" && (
            <div style={{ ...tEpithet, marginBottom: body ? 7 : 0 }}>
              {subtitle}
            </div>
          )}
          {body != null && (
            <div style={{ ...tBody }}>{renderRichText(body)}</div>
          )}
        </div>
      </div>
    );
  }

  /* --- atlasReveal: the desktop Dream Atlas reveal geometry. It shares the
     full-bleed hero material with InfoCard, but uses a wider scene-led layout:
     place headline, guide subtitle, and body copy sit in a left text column
     while the resident figure stands over the panel's right side. --- */
  if (props.variant === "atlasReveal") {
    const {
      image,
      imageCrop = "center",
      imageFilter,
      figure,
      subtitle,
    } = props;
    return (
      <div
        style={{
          position: "relative",
          width: "var(--info-card-width)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: geometryPx(10),
          boxSizing: "border-box",
        }}
      >
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
            src={resolveArtRef(image)}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: resolveImageCrop(imageCrop),
              userSelect: "none",
              filter: imageFilter ? resolveMediaFilter(imageFilter) : undefined,
            }}
          />
        </div>
        {figure !== undefined && (
          <img
            src={resolveArtRef(figure)}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              right: geometryPx(ATLAS_REVEAL_FIGURE_RIGHT),
              bottom: 0,
              height: geometryPx(ATLAS_REVEAL_FIGURE_H),
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
        <div
          style={{ height: geometryPx(ATLAS_REVEAL_HERO_H), flex: "none" }}
        />
        <div
          style={{
            ...glassSurfaceStyle(),
            background: INFO_CARD_GLASS_BACKGROUND,
            position: "relative",
            padding: `${geometryPx(13)} ${geometryPx(15)}`,
            boxSizing: "border-box",
            whiteSpace: "normal",
            overflowWrap: "break-word",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: `${String(
                Math.round(ATLAS_REVEAL_TEXT_FRACTION * 100),
              )}%`,
              display: "flex",
              flexDirection: "column",
              gap: geometryPx(5),
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: geometryPx(2),
              }}
            >
              <div style={tAtlasHeadline}>{titleContent}</div>
              {subtitle !== undefined && subtitle !== "" && (
                <div style={tAtlasSubtitle}>{subtitle}</div>
              )}
            </div>
            {body != null && (
              <div style={tAtlasBody}>{renderRichText(body)}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* --- icon: a glyph disc beside the title, description below --- */
  if (props.variant === "icon") {
    const { glyph } = props;
    return (
      <div
        style={{ ...shell, padding: `${geometryPx(PADY)} ${geometryPx(PADX)}` }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: geometryPx(12),
          }}
        >
          <span
            style={{
              width: geometryPx(44),
              height: geometryPx(44),
              flex: "none",
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              ...SITE_DISC,
            }}
          >
            <i
              className={glyph}
              aria-hidden="true"
              style={{
                fontSize: geometryPx(21),
                color: token("--text-on-accent"),
              }}
            />
          </span>
          <div style={tHeadline}>{titleContent}</div>
        </div>
        {body != null && (
          <div style={{ ...tBody, marginTop: 11 }}>{renderRichText(body)}</div>
        )}
      </div>
    );
  }

  /* --- tide: the tide's OWN colored disc + mark beside the title, the tide's
     alignment name in its color below, description below that --- */
  if (props.variant === "tide") {
    const { tide } = props;
    const v = tideVisual(tide);
    return (
      <div
        style={{ ...shell, padding: `${geometryPx(PADY)} ${geometryPx(PADX)}` }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: geometryPx(12),
          }}
        >
          <span
            style={{
              width: geometryPx(44),
              height: geometryPx(44),
              flex: "none",
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: v.bg,
              border: `1px solid ${v.bd}`,
            }}
          >
            <i
              className={v.icon}
              aria-hidden="true"
              style={{
                fontSize: geometryPx(21),
                color: v.fg,
              }}
            />
          </span>
          <div>
            <div style={tHeadline}>{titleContent}</div>
            <div style={{ ...tMeta, color: v.fg, marginTop: 3 }}>
              {tideAlignmentLabel(tide)}
            </div>
          </div>
        </div>
        {body != null && (
          <div style={{ ...tBody, marginTop: 11 }}>{renderRichText(body)}</div>
        )}
      </div>
    );
  }

  /* --- text: optional small lead glyph + title, an optional epithet under the
     name, description below --- */
  const { meta, leadGlyph, subtitle } = props;
  const Meta = meta ? (
    <div style={{ ...tMeta, marginBottom: 7 }}>{meta}</div>
  ) : null;
  return (
    <div
      style={{ ...shell, padding: `${geometryPx(PADY)} ${geometryPx(PADX)}` }}
    >
      {Meta}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: geometryPx(9),
          marginBottom: subtitle ? 2 : body ? 7 : 0,
        }}
      >
        {leadGlyph !== undefined && (
          <i
            className={leadGlyph}
            aria-hidden="true"
            style={{
              fontSize: geometryPx(20),
              color: token("--text-secondary"),
            }}
          />
        )}
        <div style={tHeadline}>{titleContent}</div>
      </div>
      {subtitle !== undefined && subtitle !== "" && (
        <div style={{ ...tEpithet, marginBottom: body ? 7 : 0 }}>
          {subtitle}
        </div>
      )}
      {Body}
    </div>
  );
}

/**
 * InfoCard — the one press-to-reveal information card. Its media treatment
 * varies (object / fullBleed / atlasReveal / icon / tide / text) on one fixed
 * liquid-glass shell (no caret, one GroupPanel material + type scale).
 *
 * Wraps the variant body in the ONE viewport-driven mobile layout rule (see
 * {@link infoCardWidth}): on a phone every info card lays out at the same
 * fraction of the screen; on desktop it renders at native size. The internal
 * type scale is a separate shared mobile multiplier so title, epithet, meta,
 * and body text keep their proportions while the glass text blocks naturally
 * grow or shrink from the text they contain.
 *
 * The placement/timing engine is attached as statics:
 * `InfoCard.PressPopover / PressInfo / usePressReveal / anchorRect /
 * setRevealDelay / SITE_DISC`.
 */
function InfoCardComponent(props: InfoCardProps): React.ReactElement {
  const viewportWidth = useViewportWidth();
  const nativeWidth =
    props.variant === "atlasReveal" ? ATLAS_REVEAL_CARD_W : CARD_W;
  const cardWidth = infoCardWidth(
    viewportWidth,
    MOBILE_WIDTH_FRACTION,
    nativeWidth,
  );
  const geometryScale = cardWidth / nativeWidth;
  const textScale = infoCardTextScale(viewportWidth);
  const style: React.CSSProperties &
    Record<
      | "--info-card-width"
      | "--info-card-geometry-scale"
      | "--info-card-text-scale",
      string
    > = {
    "--info-card-width": `${String(cardWidth)}px`,
    "--info-card-geometry-scale": String(geometryScale),
    "--info-card-text-scale": String(textScale),
    width: cardWidth,
  };
  return (
    <div style={style}>
      <InfoCardBody {...props} />
    </div>
  );
}

/* ================================================================
   Pure engine logic (factored out for direct unit testing).
   ================================================================ */

/** A target element's box in stage-native px (frame scale divided out). */
export interface AnchorRect {
  x: number;
  top: number;
  bottom: number;
  w: number;
  h: number;
  /**
   * The anchor box's own left / right edges in stage-native px. When present,
   * the clamp knows the trigger's horizontal extent, so a card that cannot sit
   * above the press can be shifted clear of it sideways instead of dropping
   * below. Absent for a point-only anchor (older call sites), where the clamp
   * falls back to treating the anchor as a zero-width point at `x`.
   */
  spanLeft?: number;
  spanRight?: number;
  /**
   * The actual press point's Y in stage-native px, captured on a touch
   * press-down. When present, the clamp keeps a fingertip disc around it clear
   * of the card so the finger holding the trigger down never occludes the
   * reveal. Absent on a fine-pointer hover (no finger to clear).
   */
  pointerY?: number;
  /**
   * The actual press point's X in stage-native px, captured on a touch
   * press-down alongside `pointerY`. Folds the fingertip disc into the
   * horizontal obstacle a sideways-shifted card must clear. Absent on a
   * fine-pointer hover.
   */
  pointerX?: number;
}

/**
 * The tap-vs-hold discriminator. PURE. A press released strictly WITHIN
 * `clickWindow` of the down time is a TAP (returns false → the child's onClick
 * is allowed to fire); a press whose duration reaches or exceeds the window is
 * a HOLD (returns true → reveal only, the child click is swallowed on touch).
 */
export function isHold(
  downT: number,
  upT: number,
  clickWindow: number,
): boolean {
  return upT - downT >= clickWindow;
}

/**
 * The on-screen clamp. PURE. Places a `width`×`height` popover a uniform
 * `gap` from `anchor` and clamps it to stay at least `edge` px from every
 * viewport side (the viewport dims travel on the anchor as `w`/`h`). Returns the
 * popover's { left, top } in stage-native px.
 *
 * The reveal sits ABOVE the pressed object and is NEVER placed below it: a card
 * that cannot fit above is pinned to the top of the screen and shifted sideways
 * to clear the press area, rather than dropping beneath the finger. The vertical
 * placement tries, in order:
 *   1. above at the full uniform gap (the ideal) — centered over the anchor.
 *   2. pinned to the top screen inset with a reduced gap, whenever the card
 *      still clears the obstacle there — centered over the anchor.
 *   3. pinned to the top screen inset and shifted horizontally so the card sits
 *      beside the press area (to its left or right, whichever has room), when a
 *      top-pinned card would otherwise overlap the obstacle vertically.
 * When neither side has room for the card beside a touch press area (a
 * wide-enough card against a centered top trigger), the card moves to whichever
 * screen edge puts its center farthest from the finger. Fine-pointer hover has
 * no finger to avoid, so that fallback stays centered at the top.
 *
 * The horizontal obstacle the shift clears is the UNION of the anchor box
 * (`spanLeft`..`spanRight`, or the point `x` when absent) and, on a touch press,
 * a `FINGER_RADIUS_PX` disc around `pointerX`. The vertical obstacle is likewise
 * the union of the anchor box and a disc around `pointerY`, so a touch reveal
 * never covers the finger.
 *
 * A card larger than the viewport cannot satisfy every edge; it is pinned to
 * the leading (top-left) inset so at least its title/corner stays reachable.
 */
export function computePopoverPosition(
  anchor: AnchorRect,
  width: number,
  height: number,
  gap: number,
  edge: number,
): { left: number; top: number } {
  const { x, top, w, spanLeft, spanRight, pointerY, pointerX } = anchor;

  const minLeft = edge;
  const maxLeft = Math.max(edge, w - width - edge);
  const clampX = (l: number): number => Math.max(minLeft, Math.min(l, maxLeft));
  const centeredLeft = clampX(x - width / 2);

  const obstacleTop =
    pointerY == null ? top : Math.min(top, pointerY - FINGER_RADIUS_PX);
  const aboveTop = obstacleTop - gap - height;

  // 1. Fits fully above at the uniform gap — the ideal. Centered over the anchor.
  if (aboveTop >= edge) {
    return { left: centeredLeft, top: aboveTop };
  }

  // 2. Doesn't fit above at the full gap, but a top-pinned card still clears the
  //    obstacle vertically (a reduced gap). Centered over the anchor.
  if (edge + height <= obstacleTop) {
    return { left: centeredLeft, top: edge };
  }

  // 3. A top-pinned card would overlap the obstacle vertically. Keep it pinned to
  //    the top of the screen and shift it sideways to clear the press area — the
  //    reveal never drops below. The horizontal obstacle folds in the finger disc
  //    on a touch press. Prefer the side of the obstacle with the emptier half of
  //    the screen; fall back to the other side, or — when the card fits beside
  //    neither — leave it centered at the top (overlap is then unavoidable).
  const anchorLeft = spanLeft ?? x;
  const anchorRight = spanRight ?? x;
  const obstacleLeft =
    pointerX == null
      ? anchorLeft
      : Math.min(anchorLeft, pointerX - FINGER_RADIUS_PX);
  const obstacleRight =
    pointerX == null
      ? anchorRight
      : Math.max(anchorRight, pointerX + FINGER_RADIUS_PX);

  const leftOfObstacle = obstacleLeft - gap - width;
  const rightOfObstacle = obstacleRight + gap;
  const fitsLeft = leftOfObstacle >= minLeft;
  const fitsRight = rightOfObstacle <= maxLeft;
  const preferRight = (obstacleLeft + obstacleRight) / 2 <= w / 2;

  let left: number;
  if (fitsLeft && fitsRight) {
    left = preferRight ? rightOfObstacle : leftOfObstacle;
  } else if (fitsLeft) {
    left = leftOfObstacle;
  } else if (fitsRight) {
    left = rightOfObstacle;
  } else if (pointerX != null) {
    const leftEdgeDistance = Math.abs(pointerX - (minLeft + width / 2));
    const rightEdgeDistance = Math.abs(pointerX - (maxLeft + width / 2));
    left =
      rightEdgeDistance >= leftEdgeDistance
        ? maxLeft
        : minLeft;
  } else {
    left = centeredLeft;
  }
  return { left, top: edge };
}

/* ================================================================
   anchorRect — a target element's box in stage-native px. `stageEl` is the
   screen root; we divide out any frame scale so the anchor lives in the
   popover's coordinate space. Returns { x (center), top, bottom, w, h }.
   ================================================================ */
export function anchorRect(
  stageEl: HTMLElement,
  targetEl: HTMLElement,
  pointer?: { clientX: number; clientY: number } | null,
): AnchorRect {
  const sr = stageEl.getBoundingClientRect();
  const r = targetEl.getBoundingClientRect();
  const k = sr.width ? stageEl.clientWidth / sr.width : 1;
  return {
    x: (r.left - sr.left + r.width / 2) * k,
    top: (r.top - sr.top) * k,
    bottom: (r.bottom - sr.top) * k,
    // The anchor box's own horizontal edges, so a card that cannot sit above the
    // press can be shifted clear of the trigger sideways rather than dropped
    // below it.
    spanLeft: (r.left - sr.left) * k,
    spanRight: (r.right - sr.left) * k,
    w: stageEl.clientWidth,
    h: stageEl.clientHeight,
    // The press point (touch only) in the same stage-native space, so the clamp
    // can keep the fingertip disc clear of the card on both axes.
    ...(pointer != null
      ? {
          pointerY: (pointer.clientY - sr.top) * k,
          pointerX: (pointer.clientX - sr.left) * k,
        }
      : {}),
  };
}

/* ================================================================
   useFinePointer — THE input-mode detector for the input-adaptive reveal.
   True on a fine pointer with real hover (mouse / trackpad / desktop), false
   on a coarse pointer (touch). Live via matchMedia so plugging in a mouse or
   switching to touch emulation re-evaluates.
   ================================================================ */
const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

export function useFinePointer(): boolean {
  const [fine, setFine] = React.useState<boolean>(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia(FINE_POINTER_QUERY).matches,
  );

  React.useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const query = window.matchMedia(FINE_POINTER_QUERY);
    const onChange = (): void => setFine(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return fine;
}

/* ================================================================
   useViewportWidth — live viewport width driving mobile layout, tracking
   resize / rotate the same way useFinePointer tracks pointer-mode changes.
   ================================================================ */
function useViewportWidth(): number {
  const [width, setWidth] = React.useState<number>(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const onResize = (): void => setWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return width;
}

export interface UsePressRevealResult {
  /** true from pointer-down to release (drive the immediate press scale). */
  pressed: boolean;
  /**
   * true while a fine pointer hovers the trigger (drive the shared
   * HOVER_SCALE enlargement; press takes precedence). Always false on touch.
   */
  hovered: boolean;
  /** true while the InfoCard should be revealed (gate the popover on this). */
  shown: boolean;
  /** true on a fine pointer / mouse (hover reveals); false on touch (press reveals). */
  fine: boolean;
  /** onPointerDown — begins the press; on touch it also reveals. */
  begin: (event?: React.PointerEvent) => void;
  /** onPointerUp / onPointerCancel — ends the press; on touch it dismisses. */
  end: () => void;
  /** onPointerEnter — reveals on a fine pointer (hover); no-op on touch. */
  enter: () => void;
  /** onPointerLeave — hides the reveal and releases the press (both modes). */
  leave: () => void;
  /** true once the press has outlasted the click window (a deliberate hold). */
  heldPastTap: () => boolean;
  /**
   * The live press point captured on the last touch press-down (`begin(event)`),
   * or null on a fine-pointer hover. Pass it to `anchorRect` so the popover
   * clamp keeps the fingertip disc clear of the card. A ref, so reading it in a
   * layout effect never lags a render.
   */
  pointerRef: React.MutableRefObject<{
    clientX: number;
    clientY: number;
  } | null>;
}

/* ================================================================
   usePressReveal — THE single press-reveal engine, generalized to Tango's
   input-adaptive model. EVERY reveal target drives its show/hide through this
   one hook so the reveal delay + click window apply identically everywhere.

   Fine pointer (mouse/desktop): HOVER reveals (enter shows, leave hides).
   pointerdown only compresses (pressed) — it never reveals; a click is a click,
   never a "hold".

   Coarse pointer (touch): pointerdown reveals (immediately — delay defaults to
   0, never a long-press) and compresses; pointerup/cancel/leave dismisses. The
   click window discriminates a TAP (child onClick fires) from a HOLD
   (reveal only).
   ================================================================ */
export function usePressReveal({
  clickWindow = CLICK_WINDOW,
}: { clickWindow?: number } = {}): UsePressRevealResult {
  const fine = useFinePointer();
  const [pressed, setPressed] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [shown, setShown] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const downAt = React.useRef(0);
  const pointerRef = React.useRef<{ clientX: number; clientY: number } | null>(
    null,
  );

  const clear = (): void => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const reveal = (): void => {
    clear();
    if (revealDelayMs > 0) {
      timer.current = setTimeout(() => setShown(true), revealDelayMs);
    } else {
      setShown(true);
    }
  };

  const begin = (event?: React.PointerEvent): void => {
    event?.stopPropagation();
    // Capture the actual press point so the popover clamp can keep a fingertip
    // disc around it clear of the card (touch only — a fine pointer reveals on
    // hover, with no finger to occlude the reveal).
    pointerRef.current =
      event && !fine
        ? { clientX: event.clientX, clientY: event.clientY }
        : null;
    downAt.current = Date.now();
    setPressed(true);
    // Touch: press-down reveals. Fine pointer: press only compresses (hover
    // owns the reveal) — nothing reveals on press.
    if (!fine) {
      reveal();
    }
  };

  const end = (): void => {
    setPressed(false);
    // Touch: release dismisses. Fine pointer: keep the hover reveal up (a
    // pointerup while still hovering must not hide the card); leave() hides it.
    if (!fine) {
      clear();
      setShown(false);
    }
  };

  const enter = (): void => {
    // Fine pointer only: hover reveals and enlarges. On touch, enter fires
    // right before down and must NOT double-drive the reveal (or leave the
    // trigger stuck enlarged after the finger lifts).
    if (fine) {
      // A hover has no finger to clear, so drop any stale touch press point.
      pointerRef.current = null;
      setHovered(true);
      reveal();
    }
  };

  const leave = (): void => {
    clear();
    setPressed(false);
    setHovered(false);
    setShown(false);
  };

  const heldPastTap = (): boolean =>
    isHold(downAt.current, Date.now(), clickWindow);

  React.useEffect(() => clear, []);

  return {
    pressed,
    hovered,
    shown,
    fine,
    begin,
    end,
    enter,
    leave,
    heldPastTap,
    pointerRef,
  };
}

/* ================================================================
   PressPopover — positions its child a uniform GAP from the anchored object and
   clamps it fully on-screen. Measures its own height after mount, so it never
   guesses. pointerEvents:none so it can't intercept the release. Anchored to
   the trigger/pointer — never centered.
   ================================================================ */
export interface PressPopoverProps {
  anchor: AnchorRect | null;
  gap?: number;
  children?: React.ReactNode;
}

export function PressPopover({
  anchor,
  gap = GAP,
  children,
}: PressPopoverProps): React.ReactElement {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(
    null,
  );

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) {
      return;
    }
    // Measure the card's ACTUAL rendered box. The card lays itself out at its
    // mobile or desktop width, so its live `offsetWidth`/`offsetHeight` are the
    // real on-screen dimensions the clamp positions against.
    setPos(
      computePopoverPosition(
        anchor,
        el.offsetWidth,
        el.offsetHeight,
        gap,
        EDGE,
      ),
    );
  }, [anchor, gap]);

  return (
    // `.tango` re-establishes the design-system token scope. The popover portals
    // OUT of its trigger's subtree (into a screen root or `document.body`), which
    // in the production app is not under a `.tango` ancestor, so without this the
    // InfoCard shell's glass, radius, and text tokens resolve to nothing and
    // the card renders without its intended surface.
    // The class only declares custom properties, so it adds no styling of its own.
    <div
      ref={ref}
      className="tango"
      style={{
        position: "absolute",
        // Hug the card so `offsetWidth` is the card's real layout width.
        width: "max-content",
        zIndex: 90,
        pointerEvents: "none",
        left: pos ? pos.left : anchor ? anchor.x : 0,
        top: pos ? pos.top : 0,
        // Keep the portal wrapper out of opacity/transform animation layers so
        // the InfoCard shell's backdrop-filter samples the scene like GroupPanel.
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {children}
    </div>
  );
}

/* ================================================================
   PressInfo — a trigger wrapper for inline objects (tide pills, the menu
   button, essence value). Drives the shared usePressReveal engine, measures
   itself against `stageRef` once the reveal fires, and portals a PressPopover
   into the stage so placement / clamping use stage coords.

   Input-adaptive: on a fine pointer it reveals on HOVER; on touch it reveals on
   press-down and dismisses on release. For bespoke press logic (sites,
   dreamsigns, HUD) call usePressReveal directly + anchorRect.

   `holdStillClicks` — what happens to the child's click when a TOUCH press
   OUTLASTS the click window (a deliberate hold-to-read, not a tap):
     - false (default) — the click is swallowed. Use for NAVIGATION or
       one-way / destructive triggers.
     - true — the click still fires after the hold. Use for triggers that merely
       OPEN A MENU or TOGGLE UI STATE on the same screen.
   On a fine pointer a click is always a click (hover is not a hold), so this
   flag has no effect there.
   ================================================================ */
export interface PressInfoProps {
  stageRef: React.RefObject<HTMLElement | null>;
  gap?: number;
  /** The InfoCard (or any node) to reveal while pressed/hovered. */
  card?: React.ReactNode;
  children?: React.ReactNode;
  as?: React.ElementType;
  /** true = a touch hold still fires the child's click (menu / UI toggle). */
  holdStillClicks?: boolean;
}

export function PressInfo({
  stageRef,
  gap = GAP,
  card,
  children,
  as = "span",
  holdStillClicks = false,
}: PressInfoProps): React.ReactElement {
  const { shown, fine, begin, end, enter, leave, heldPastTap, pointerRef } =
    usePressReveal();
  const elRef = React.useRef<HTMLElement>(null);
  const [anchor, setAnchor] = React.useState<AnchorRect | null>(null);

  React.useLayoutEffect(() => {
    if (shown && stageRef.current && elRef.current) {
      setAnchor(
        anchorRect(stageRef.current, elRef.current, pointerRef.current),
      );
    } else {
      setAnchor(null);
    }
  }, [shown, stageRef, pointerRef]);

  const onClickCapture = (event: React.MouseEvent): void => {
    // Only a TOUCH hold swallows the click; a mouse click is always a click.
    if (!fine && !holdStillClicks && heldPastTap()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <Pressable
      as={as}
      ref={elRef}
      onPointerEnter={enter}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerLeave={leave}
      onPointerCancel={end}
      onClickCapture={onClickCapture}
      style={{ display: "inline-flex" }}
    >
      {children}
      {anchor &&
        stageRef.current &&
        createPortal(
          <PressPopover anchor={anchor} gap={gap}>
            {card}
          </PressPopover>,
          stageRef.current,
        )}
    </Pressable>
  );
}

/**
 * The engine statics attached to InfoCard, so any component reaches the whole
 * placement/timing engine through the one capitalized path:
 * `const { usePressReveal, PressPopover, PressInfo, anchorRect, SITE_DISC,
 * setRevealDelay } = InfoCard;`
 */
interface InfoCardStatics {
  PressPopover: typeof PressPopover;
  PressInfo: typeof PressInfo;
  usePressReveal: typeof usePressReveal;
  anchorRect: typeof anchorRect;
  setRevealDelay: typeof setRevealDelay;
  SITE_DISC: React.CSSProperties;
  PRESS_SCALE: number;
  HOVER_SCALE: number;
  CLICK_WINDOW: number;
}

/**
 * InfoCard — the component plus its engine statics. Attaching the engine with a
 * single typed `Object.assign` (no `any`) means the exported symbol both renders
 * the variants and exposes `InfoCard.PressPopover / PressInfo /
 * usePressReveal / anchorRect / setRevealDelay / SITE_DISC` to callers.
 */
export const InfoCard: typeof InfoCardComponent & InfoCardStatics =
  Object.assign(InfoCardComponent, {
    PressPopover,
    PressInfo,
    usePressReveal,
    anchorRect,
    setRevealDelay,
    SITE_DISC,
    PRESS_SCALE,
    HOVER_SCALE,
    CLICK_WINDOW,
  });
