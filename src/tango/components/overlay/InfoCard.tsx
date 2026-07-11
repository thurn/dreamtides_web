// InfoCard — strict visual content variants for Tango entity reveals.
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
import * as React from "react";
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
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { tideVisual, tideAlignmentLabel, type Tide } from "../hud/tide-spec";

/* ---- faithfully-copied layout literals from the design source (not tokens:
   these are the info-card's own fixed geometry, not design-system scale) ---- */
const CARD_W = 248; // every info card is this wide
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
const INFO_CARD_GLASS_FILL = token("--glass-fill-popover");
const INFO_CARD_GLASS_BACKGROUND = `${token("--glass-sheen")}, ${INFO_CARD_GLASS_FILL}`;
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
// Mobile InfoCards keep a modestly reduced internal type scale while preserving
// a 12px floor for the 14px body voice. The larger copy wraps into natural
// height inside the fixed 45%-viewport width, giving every reveal more readable
// vertical room without widening it. Tune this one constant to adjust title,
// epithet, meta, and body text proportionally.
const MOBILE_TEXT_SCALE = 0.86;

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

function useViewportWidth(): number {
  const [width, setWidth] = React.useState<number>(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = (): void => setWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
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
  // a HUD chip — is itself `white-space: nowrap`; without this reset
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
  color: token("--text-on-glass-muted"),
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
  color: token("--text-on-glass"),
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
 * so the disc reads identically in both. The disc fill is --badge-disc-gradient,
 * the shared token that the dark `.ds-disc` and the atlas badges also wear, so a
 * rebrand of the badge material propagates here; its inset ring is the --accent
 * token so an accent rebrand propagates too.
 */
const siteDiscStyle: React.CSSProperties = {
  background: token("--badge-disc-gradient"),
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
              ...siteDiscStyle,
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
 */
export function InfoCard(props: InfoCardProps): React.ReactElement {
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
