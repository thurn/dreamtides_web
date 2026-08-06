// InfoCard — strict visual content variants for Cumulus entity reveals.
//
// The shell is fixed and shared (a liquid-glass pane, not a scrim):
//   - no colored border, no arrow / caret pointing back at the origin
//   - one glass material       — the shared glassSurfaceStyle chrome recipe
//   - one corner radius         — --radius-compact
//   - one shadow/rim treatment  — glassSurfaceStyle's layered glass edge
//   - one type scale            — headline (serif) / body (rules)
// Only the MEDIA treatment varies by content, via `variant`:
//   - object      — a centered contained transparent object
//   - fullBleed   — a square hero image with a glass text card laid on TOP of it:
//                   the image IS the card, with name / epithet / body
//                   revealed on the shared glass, floating over the lower image
//   - atlasReveal — the large desktop Dream Atlas reveal: scene hero, prominent
//                   right-side figure, and place / guide / bonus glass panel
//   - icon        — a glyph disc beside the title
//   - tide        — a tide's own colored disc + alignment label
//   - text        — a title with an optional epithet
//                   (a smaller serif subtitle in white) under the name
//
import * as React from "react";
import { token, type TokenName } from "../../primitives/tokens";
import { type Glyph } from "../../primitives/glyph";
import { type ArtRef, resolveArtRef } from "../../primitives/art";
import { type ImageCrop, resolveImageCrop } from "../../primitives/media";
import { renderRichText, type RichText } from "../card/rich-text";
import { renderRulesSymbolsInline } from "../card/RulesText";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { controlChrome } from "../../internal/control-treatment";
import { applySymbolReplacements } from "../../primitives/symbol-replacements";
import { tideVisual, tideAlignmentLabel, type Tide } from "../hud/tide-spec";

/* ---- authored component geometry ---- */
const CARD_W = 248; // every info card is this wide
type SpacingTokenName = Extract<TokenName, `--space-${string}`>;
const PADX = "--space-l" satisfies SpacingTokenName;
const PADY = "--space-l" satisfies SpacingTokenName;
// Inset of the fullBleed variant's floating glass text card from the square
// hero image's edges — how much of the image shows around the card.
const FULL_BLEED_INSET = "--space-m" satisfies SpacingTokenName;
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
/** Fraction of a guideless atlas-reveal glass panel reserved for text. */
const ATLAS_REVEAL_TEXT_FRACTION = 0.68;
/**
 * Fraction of the atlas-reveal glass panel reserved for text when a figure is
 * present. The narrower measure keeps copy out of the figure's visible body
 * while preserving readable name and body wrapping on scaled mobile cards.
 */
const ATLAS_REVEAL_FIGURE_TEXT_FRACTION = 0.56;
const INFO_CARD_GLASS_FILL = token("--glass-fill-popover");
const INFO_CARD_GLASS_BACKGROUND = `${token("--glass-sheen")}, ${INFO_CARD_GLASS_FILL}`;
const geometryPx = (px: number): string =>
  `calc(${String(px)}px * var(--info-card-geometry-scale, 1))`;
const geometrySpace = (name: SpacingTokenName): string =>
  `calc(${token(name)} * var(--info-card-geometry-scale, 1))`;

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
// epithet and body text proportionally.
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
 * The shared typography multiplier for the same viewport. It changes at the
 * standard 248px card's width cutoff, independently of the wider atlasReveal
 * geometry and the reveal coordinator's input-layout breakpoint. PURE.
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
 * The icon variant's violet-glow disc. Its fill is --badge-disc-gradient, the
 * shared dark material also worn by `.ds-disc` and atlas badges; this variant
 * adds its own accent inset ring and glow for an information-card treatment.
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
  /**
   * The card's headline. Resolve names before display; canonical rules symbols
   * render as their inline icons.
   */
  title?: string;
  /**
   * The reveal copy, as a structured {@link RichText} value. Canonical rules
   * symbols and explicit glyph parts render as cap-height-aligned inline icons.
   */
  body?: RichText;
}

/**
 * object variant — a centered contained transparent object above the title +
 * body. An object card IS its media, so
 * `image` is required: there is no object card without one.
 */
export interface InfoCardObjectProps extends InfoCardCommonProps {
  variant: "object";
  /** The media the card is built around, as an {@link ArtRef}. Required. */
  image: ArtRef;
}

/**
 * fullBleed variant — a square hero image with a glass text card laid on TOP of
 * it: the image fills the whole card (rounded corners), and the shared
 * liquid-glass text card floats over its lower portion carrying the name,
 * epithet, and body. It is literally "an image, with a text info card placed on
 * top of it". Built for the Dream Avatar profile reveal and the atlas node
 * reveals. The image IS its media, so `image` is required.
 */
export interface InfoCardFullBleedProps extends InfoCardCommonProps {
  variant: "fullBleed";
  /** The square hero image the card is built on, as an {@link ArtRef}. Required. */
  image: ArtRef;
  /** How the hero image is cropped. Default `"center"`. */
  imageCrop?: ImageCrop;
  /**
   * An optional foreground character render (a transparent full-body cutout —
   * a Dream Guide, the boss) laid centered and prominent OVER the hero image,
   * standing above the glass text card. Its own subject of the card; omit for a
   * scene-only hero. An {@link ArtRef}, resolved by the component.
   */
  figure?: ArtRef;
  /**
   * An epithet under the name — a smaller serif line in white, mirroring the
   * Dream Avatar-select name/epithet pairing. Resolve before display; rules
   * symbols render as icons.
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
  /** Optional transparent full-body figure standing on the card's right side. */
  figure?: ArtRef;
  /** The resident guide / boss title; rules symbols render as icons. */
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
 * text variant (the default) — a title, an optional epithet under the name,
 * then the body. Carries no required media.
 */
export interface InfoCardTextProps extends InfoCardCommonProps {
  /** Which media treatment. Omit — or pass 'text' — for the text variant. */
  variant?: "text";
  /**
   * An epithet under the name — a smaller serif subtitle in white, mirroring
   * the Dream Avatar-select name/epithet pairing. Resolve before display;
   * rules symbols render as icons.
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

/**
 * Returns the authored desktop width for an InfoCard variant. Reveal placement
 * uses this same contract so a wide strict variant cannot overflow the geometry
 * reserved for it.
 */
export function infoCardNativeWidth(
  variant: InfoCardProps["variant"],
): number {
  return variant === "atlasReveal" ? ATLAS_REVEAL_CARD_W : CARD_W;
}

/* ================================================================
   InfoCard — content, media variants, one shell.
   ================================================================ */
/**
 * The info card's variant body (object / fullBleed / icon / tide / text) on the
 * one fixed liquid-glass shell. Rendered at its native geometry; the exported
 * {@link InfoCard} supplies the viewport-driven width and text-scale variables
 * so the body never has to read screen size.
 */
interface InfoCardContentOverride {
  readonly title?: React.ReactNode;
  readonly body?: React.ReactNode;
}

function InfoCardBody(
  props: InfoCardProps,
  contentOverride?: InfoCardContentOverride,
): React.ReactElement {
  const { title, body } = props;
  // `variant` is optional only on the text member; resolve the default once for
  // the shared body/title styling. The per-variant branches below narrow on the
  // discriminant directly so each reads only the media its interface carries.
  const variant: InfoCardVariant = props.variant ?? "text";
  const renderedTitle =
    title === undefined ? undefined : renderRulesSymbolsInline(title);
  const titleContent = contentOverride?.title ?? renderedTitle;
  const bodyContent =
    body == null
      ? null
      : (contentOverride?.body ??
        renderRichText(body, 0, { substituteRulesSymbols: true }));
  const Body =
    body == null ? null : (
      <div
        style={{
          ...tBody,
          textAlign: variant === "object" ? "center" : "left",
        }}
      >
        {bodyContent}
      </div>
    );

  /* --- object: a centered media block (framed portrait OR contained
     transparent object) above its name + text. --- */
  if (props.variant === "object") {
    const { image } = props;
    const imageUrl = resolveArtRef(image);
    const media = (
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        style={{
          width: geometryPx(96),
          height: geometryPx(96),
          objectFit: "contain",
          display: "block",
        }}
      />
    );
    return (
      <div
        style={{
          ...shell,
          padding: `${geometrySpace("--space-xl")} ${geometrySpace("--space-l")} ${geometrySpace("--space-l")}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: geometrySpace("--space-m"),
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
      figure,
      subtitle,
    } = props;
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
          padding: geometrySpace(FULL_BLEED_INSET),
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: token("--radius-compact"),
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
              top: geometrySpace(FULL_BLEED_INSET),
              transform: "translateX(-50%)",
              height: geometryPx(FULL_BLEED_FIGURE_HEIGHT),
              width: "auto",
              maxWidth: `calc(100% - ${geometrySpace(FULL_BLEED_INSET)} - ${geometrySpace(FULL_BLEED_INSET)})`,
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
            padding: `${geometrySpace(PADY)} ${geometrySpace(PADX)}`,
            boxSizing: "border-box",
            textAlign: "left",
            // Same wrapping reset as the shell so on-image copy always wraps to
            // the card width no matter what the trigger inherits down.
            whiteSpace: "normal",
            overflowWrap: "break-word",
          }}
        >
          <div
            style={{ ...tHeadline, marginBottom: subtitle ? token("--space-xxs") : body ? token("--space-s") : 0 }}
          >
            {titleContent}
          </div>
          {subtitle !== undefined && subtitle !== "" && (
            <div style={{ ...tEpithet, marginBottom: body ? token("--space-s") : 0 }}>
              {renderRulesSymbolsInline(subtitle)}
            </div>
          )}
          {body != null && (
            <div style={{ ...tBody }}>{bodyContent}</div>
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
          padding: geometrySpace("--space-s"),
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: token("--radius-compact"),
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
            padding: `${geometrySpace("--space-m")} ${geometrySpace("--space-l")}`,
            boxSizing: "border-box",
            whiteSpace: "normal",
            overflowWrap: "break-word",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: `${String(
                Math.round(
                  (figure === undefined
                    ? ATLAS_REVEAL_TEXT_FRACTION
                    : ATLAS_REVEAL_FIGURE_TEXT_FRACTION) * 100,
                ),
              )}%`,
              display: "flex",
              flexDirection: "column",
              gap: geometrySpace("--space-xs"),
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: geometrySpace("--space-xxs"),
              }}
            >
              <div style={tAtlasHeadline}>{titleContent}</div>
              {subtitle !== undefined && subtitle !== "" && (
                <div style={tAtlasSubtitle}>
                  {renderRulesSymbolsInline(subtitle)}
                </div>
              )}
            </div>
            {body != null && (
              <div style={tAtlasBody}>{bodyContent}</div>
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
        style={{ ...shell, padding: `${geometrySpace(PADY)} ${geometrySpace(PADX)}` }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: geometrySpace("--space-m"),
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
          <div style={{ ...tBody, marginTop: token("--space-m") }}>{bodyContent}</div>
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
        style={{ ...shell, padding: `${geometrySpace(PADY)} ${geometrySpace(PADX)}` }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: geometrySpace("--space-m"),
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
            <div style={{ ...tMeta, color: v.fg, marginTop: token("--space-xs") }}>
              {tideAlignmentLabel(tide)}
            </div>
          </div>
        </div>
        {body != null && (
          <div style={{ ...tBody, marginTop: token("--space-m") }}>{bodyContent}</div>
        )}
      </div>
    );
  }

  /* --- text: title, an optional epithet under the name, description below --- */
  const { subtitle } = props;
  const hasHeadline = title !== undefined;
  return (
    <div
      style={{ ...shell, padding: `${geometrySpace(PADY)} ${geometrySpace(PADX)}` }}
    >
      {hasHeadline && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: geometrySpace("--space-s"),
            marginBottom: subtitle ? token("--space-xxs") : body ? token("--space-s") : 0,
          }}
        >
          <div style={tHeadline}>{titleContent}</div>
        </div>
      )}
      {subtitle !== undefined && subtitle !== "" && (
        <div style={{ ...tEpithet, marginBottom: body ? token("--space-s") : 0 }}>
          {renderRulesSymbolsInline(subtitle)}
        </div>
      )}
      {Body}
    </div>
  );
}

type InfoCardFrameStyle = React.CSSProperties &
  Record<
    | "--info-card-width"
    | "--info-card-geometry-scale"
    | "--info-card-text-scale",
    string
  >;

/** Shared responsive frame contract for display and authoring cards. */
function useInfoCardFrameStyle(nativeWidth: number): InfoCardFrameStyle {
  const viewportWidth = useViewportWidth();
  const cardWidth = infoCardWidth(
    viewportWidth,
    MOBILE_WIDTH_FRACTION,
    nativeWidth,
  );
  return {
    "--info-card-width": `${String(cardWidth)}px`,
    "--info-card-geometry-scale": String(cardWidth / nativeWidth),
    "--info-card-text-scale": String(infoCardTextScale(viewportWidth)),
    width: cardWidth,
  };
}

/**
 * InfoCard — the strict information-card presentation. Its media treatment
 * varies (object / fullBleed / atlasReveal / icon / tide / text) on one fixed
 * liquid-glass shell (no caret, shared card type scale).
 *
 * Wraps the variant body in the viewport-driven width rule (see
 * {@link infoCardWidth}): every variant lays out at the same fraction of the
 * screen until reaching its own native width. The internal type scale changes
 * at the standard-card cutoff, so title, epithet, and body text keep
 * their proportions while the glass text blocks naturally grow or shrink from
 * the text they contain.
 *
 */
export function InfoCard(props: InfoCardProps): React.ReactElement {
  const style = useInfoCardFrameStyle(infoCardNativeWidth(props.variant));
  return (
    <div style={style}>
      <InfoCardBody {...props} />
    </div>
  );
}

/** A single copy field controlled by an Info Card authoring surface. */
export interface EditableInfoCardField {
  /** Confirmed copy rendered when the field is idle. */
  readonly value: string;
  /** Controlled draft rendered by the native editor. */
  readonly draftValue: string;
  /** Whether the card is currently showing this field's editor. */
  readonly isEditing: boolean;
  /** Validation message shown beneath the native editor. */
  readonly error?: string;
  readonly onBeginEdit: () => void;
  readonly onDraftChange: (value: string) => void;
  readonly onCancel: () => void;
  /** Explicit Enter submission; invalid drafts may remain in edit mode. */
  readonly onSubmit: (value: string) => void;
  /** Blur submission; the owner decides whether invalid copy is discarded. */
  readonly onBlur: (value: string) => void;
}

export interface EditableInfoCardProps {
  /** Optional editable headline. Omit for definition-only cards. */
  readonly title?: EditableInfoCardField;
  /** Editable definition copy. */
  readonly body: EditableInfoCardField;
  /** Semantic renderer used for the definition while it is idle. */
  readonly bodyFormat: "plain" | "rules";
}

function EditableInfoCardCopy({
  field,
  mode,
  children,
  value,
}: {
  readonly field: "title" | "description";
  readonly mode: "single-line" | "multiline";
  readonly children: React.ReactNode;
  readonly value: EditableInfoCardField;
}): React.ReactElement {
  const editorRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(
    null,
  );
  const closingRef = React.useRef(false);
  const pendingCaretRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!value.isEditing) return;
    closingRef.current = false;
    editorRef.current?.focus();
    editorRef.current?.select();
  }, [value.isEditing]);

  React.useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) return;
    pendingCaretRef.current = null;
    editorRef.current?.setSelectionRange(caret, caret);
  }, [value.draftValue]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void => {
    const raw = event.currentTarget.value;
    const rawCaret = event.currentTarget.selectionStart ?? raw.length;
    const replacement = applySymbolReplacements(raw, rawCaret);
    pendingCaretRef.current = replacement.value === raw ? null : replacement.caret;
    value.onDraftChange(replacement.value);
  };
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void => {
    if (event.key === "Enter" && (mode === "single-line" || !event.shiftKey)) {
      event.preventDefault();
      closingRef.current = true;
      value.onSubmit(value.draftValue);
      queueMicrotask(() => {
        closingRef.current = false;
      });
    } else if (event.key === "Escape") {
      event.preventDefault();
      closingRef.current = true;
      value.onCancel();
      queueMicrotask(() => {
        closingRef.current = false;
      });
    }
  };
  const handleBlur = (): void => {
    if (closingRef.current) {
      closingRef.current = false;
      return;
    }
    value.onBlur(value.draftValue);
  };
  const chrome = controlChrome("onGlass");
  const editorStyle: React.CSSProperties = {
    ...chrome.trigger,
    boxSizing: "border-box",
    width: "100%",
    minHeight: mode === "multiline" ? "5.8em" : "1.6em",
    padding: `${token("--space-xxs")} ${token("--space-xs")}`,
    color: token("--text-primary"),
    font: "inherit",
    fontWeight: "inherit",
    lineHeight: "inherit",
    resize: "none",
  };
  const editor =
    mode === "multiline" ? (
      <textarea
        ref={(element) => {
          editorRef.current = element;
        }}
        aria-label={`${field} editor`}
        aria-invalid={value.error === undefined ? undefined : true}
        data-editor-input-field={field}
        rows={4}
        value={value.draftValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={editorStyle}
      />
    ) : (
      <input
        ref={(element) => {
          editorRef.current = element;
        }}
        aria-label={`${field} editor`}
        aria-invalid={value.error === undefined ? undefined : true}
        data-editor-input-field={field}
        type="text"
        value={value.draftValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={editorStyle}
      />
    );

  return (
    <span
      data-editor-field={field}
      data-editor-save-status={value.isEditing ? "editing" : "idle"}
      onClick={value.isEditing ? undefined : value.onBeginEdit}
      style={{ display: "contents", cursor: "text" }}
    >
      {value.isEditing ? editor : children}
      {value.isEditing && value.error !== undefined ? (
        <span
          role="alert"
          style={{
            display: "block",
            marginTop: token("--space-xxs"),
            color: token("--danger"),
            font: token("--t-caption"),
          }}
        >
          {value.error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Authoring-only Info Card with closed, controlled title and body fields.
 * The component owns its native inputs, interaction states, typography, and
 * shell; callers supply strings and lifecycle callbacks, never render nodes.
 */
export function EditableInfoCard({
  title,
  body,
  bodyFormat,
}: EditableInfoCardProps): React.ReactElement {
  const bodyModel: RichText =
    bodyFormat === "rules"
      ? { kind: "rules", text: body.value }
      : { kind: "plain", text: body.value };
  const props: InfoCardTextProps = {
    variant: "text",
    title: title?.value,
    body: bodyModel,
  };
  const titleContent =
    title === undefined ? undefined : (
      <EditableInfoCardCopy
        field="title"
        mode="single-line"
        value={title}
      >
        {renderRulesSymbolsInline(title.value)}
      </EditableInfoCardCopy>
    );
  const bodyContent = (
    <EditableInfoCardCopy
      field="description"
      mode="multiline"
      value={body}
    >
      {renderRichText(bodyModel, 0, { substituteRulesSymbols: true })}
    </EditableInfoCardCopy>
  );
  const style = useInfoCardFrameStyle(CARD_W);
  return (
    <div style={style} data-editable-info-card="">
      {InfoCardBody(props, { title: titleContent, body: bodyContent })}
    </div>
  );
}
