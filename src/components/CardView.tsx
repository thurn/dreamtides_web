import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import type { CardData, FrozenCardData, Rarity } from "../types/cards";
import {
  cardIdenticonUri,
  cardImageUrl,
  hasAssignedImage,
} from "../data/card-database";
import { identiconsForced } from "../runtime/identicon-mode";
import {
  ART_EXTENSION_FRACTION,
  ART_REGION_ASPECT_RATIO_VALUE,
  CARD_ASPECT_RATIO,
  CARD_CORNER_RADIUS,
} from "./card-aspect";
import { formatTypeLine } from "./card-text";
import { computeCardTextScale } from "./card-display-scale";
import { BOLT_ICON_CLASS } from "./GlowIcon";
import { CardStatOrb } from "./CardStatOrb";
import { TRANSFIGURATION_ICONS } from "../transfiguration/transfiguration-logic";
import type { CardTransfigurationDisplay } from "../transfiguration/transfiguration-logic";
import { renderRulesText } from "./RulesText";
import { useCardTermPopover } from "./useCardTermPopover";
import { useFitText } from "./useFitText";

/**
 * Default chrome accent used for the selection ring fallback. The card's type
 * is conveyed by the text-box accent (neutral black chrome for characters, a
 * purple accent for events) rather than a colored border.
 */
const SELECTION_DEFAULT_COLOR = "#f97316";

/**
 * Tints for a transfiguration-changed corner stat digit. These are chosen for
 * legibility against the orb's own bright glyph — a warm gold reads on the blue
 * energy flame, a bright cyan reads on the amber spark sparkle — rather than to
 * match the transfiguration color (the name gem already carries that hue). Only
 * the digit takes the tint; the glyph keeps its resource color.
 */
const ENERGY_CHANGE_TINT = "#fcd34d";
const SPARK_CHANGE_TINT = "#67e8f9";

/**
 * Fallback art crop for cards that carry no authored `art` setting: centered
 * with a slight cover zoom that hides source letterboxing. The card editor's
 * art-edit mode overrides this per card by writing an `art` table to the card
 * TOML. `x`/`y` are normalized pan positions (-1..1, 0 = centered) and `scale`
 * is the cover zoom.
 */
export const DEFAULT_ART_CROP = { x: 0, y: 0, scale: 1.17 } as const;

/**
 * Fraction of the source image's height, at the very bottom, occupied by a
 * watermark / letterbox strip that must never be shown. The art images are a
 * uniform 280px tall with a ~21px strip, so this crops it off. It is applied as
 * a clip on the art image (which renders the source 1:1 along its height) and
 * excluded from the bottom-color sample so the strip neither shows nor tints the
 * fill.
 */
const ART_SOURCE_BOTTOM_CROP = 21 / 280;

/**
 * Card-height fraction (measured from the card top) the watermark-clipped art
 * bottom is kept covering down to, so the fill band never opens a gap above the
 * rules box. The art is held to just under the box's first text line — the box
 * top plus `ART_SAFE_AREA_OVERLAP` (roughly the box's top padding plus one rules
 * line). The whole pan/zoom envelope is resolved against this target, so it moves
 * with the box: a tall multi-line box (a high top) lets the art zoom out further,
 * while a short box (a low top near the card bottom) holds it more zoomed in.
 */
export const ART_SAFE_AREA_OVERLAP = 0.06;

/**
 * Resolve the safe-area coverage target from the measured rules-box top. Until
 * the box is measured (or for a card with no rules box) the art-region seam is
 * used, matching the fill band's default top. The result is capped just shy of
 * the card bottom so a stray box measurement cannot drive the target off-card.
 */
export function artSafeAreaTarget(boxTopFrac: number | null): number {
  if (boxTopFrac === null) {
    return 1 - ART_EXTENSION_FRACTION;
  }
  return Math.min(0.98, boxTopFrac + ART_SAFE_AREA_OVERLAP);
}

/**
 * Symmetric vertical overscan bound (fraction of the image's own height) for a
 * cover image of over-cover height `renderH` (> 1): at the down extreme the raw
 * image bottom meets the art-region bottom and its top meets the region top, so
 * neither edge opens a gap. Callers must guard `renderH > 1` before calling.
 */
function artMaxPanYFrac(renderH: number): number {
  return (renderH - 1) / (2 * renderH);
}

/**
 * Up-pan bound (fraction of the image's own height) that keeps the
 * watermark-clipped art bottom at or below `target` (a card-height fraction), so
 * panning up never lifts a gap into view above the rules box. The image renders
 * the source 1:1 along its height and the bottom `ART_SOURCE_BOTTOM_CROP` is
 * clipped, so the visible bottom sits at `region/2 + imgH * (p + 0.5 - crop)` for
 * a pan fraction `p`; this solves that for `target`. It is capped at the
 * symmetric down bound so it never asks the art to pan past its own overscan.
 */
function artPanYLowerFrac(renderH: number, target: number): number {
  const region = 1 - ART_EXTENSION_FRACTION;
  const imgH = renderH * region;
  const pMin = (target - region / 2) / imgH - 0.5 + ART_SOURCE_BOTTOM_CROP;
  return Math.min(pMin, artMaxPanYFrac(renderH));
}

/**
 * Cover metrics for an art crop against a frame: the rendered image size (as a
 * multiple of the frame, ≥ 1 on the covered axis) and the pan translate (as a
 * percentage of the image's own size, bounded so |pan| === 1 aligns the image
 * edge with the frame edge — except the up direction, which is bounded by
 * `artPanYLowerFrac` so the art stays covering down to `target`).
 * `frameAspect` is the width-to-height ratio of the box being covered.
 */
function artCoverMetrics(
  art: { x: number; y: number; scale: number },
  imageAspect: number,
  frameAspect: number,
  target: number,
): { renderW: number; renderH: number; panX: number; panY: number } {
  // ratio > 1 means the image is wider than the frame (its sides are cropped by
  // covering); ratio < 1 means it is taller (its top/bottom are cropped).
  const ratio = imageAspect / frameAspect;
  const coverW = ratio >= 1 ? ratio : 1;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const renderW = art.scale * coverW;
  const renderH = art.scale * coverH;
  const panX =
    renderW > 1 ? ((art.x * (renderW - 1)) / (2 * renderW)) * 100 : 0;
  let panY = 0;
  if (renderH > 1) {
    const maxPanYFrac = artMaxPanYFrac(renderH);
    const lowerPanYFrac = artPanYLowerFrac(renderH, target);
    panY = Math.max(art.y * maxPanYFrac, lowerPanYFrac) * 100;
  }
  return { renderW, renderH, panX, panY };
}

/**
 * Lowest (most upward) `art.y` offset that still keeps the watermark-clipped art
 * covering down to `target`, for a given source aspect and zoom. The art crop
 * editor clamps pan to this so the up arrow stops where the fill band would
 * otherwise be exposed above the rules box, and the data-fix script uses it to
 * pull previously over-panned crops back into range. Defaults to the art-region
 * seam when no box-relative target is supplied. Returns 0 when the image has no
 * overscan (`renderH ≤ 1`), so there is no vertical pan to bound.
 */
export function minArtOffsetY(
  imageAspect: number,
  scale: number,
  target: number = 1 - ART_EXTENSION_FRACTION,
): number {
  const ratio = imageAspect / ART_REGION_ASPECT_RATIO_VALUE;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const renderH = scale * coverH;
  if (renderH <= 1) {
    return 0;
  }
  const maxPanYFrac = artMaxPanYFrac(renderH);
  const lowerPanYFrac = artPanYLowerFrac(renderH, target);
  // Convert the clamped pan fraction back to an `art.y` in [-1, 1].
  return Math.max(-1, Math.min(1, lowerPanYFrac / maxPanYFrac));
}

/**
 * Smallest cover zoom for which the art can still be panned to keep its
 * watermark-clipped bottom at `target` while also covering the art region's top
 * and full width. Zooming out below this leaves the source too small to reach the
 * safe area at any pan (the gap the fill band would paint above the rules box), so
 * the editor floors zoom-out here and the renderer clamps stored crops up to it.
 *
 * At the down-most pan the visible bottom reduces to `renderH * region *
 * (1 - crop)` (the top is simultaneously flush), so the height that just reaches
 * `target` is `target / (region * (1 - crop))`; `renderH` is floored at 1 so the
 * image never sits shorter than the region, and the width floor `1 / coverW`
 * guards the horizontal cover for a source narrower than the region.
 */
export function minArtScale(imageAspect: number, target: number): number {
  const ratio = imageAspect / ART_REGION_ASPECT_RATIO_VALUE;
  const coverW = ratio >= 1 ? ratio : 1;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const region = 1 - ART_EXTENSION_FRACTION;
  const renderHForTarget = target / (region * (1 - ART_SOURCE_BOTTOM_CROP));
  const renderHMin = Math.max(1, renderHForTarget);
  return Math.max(1 / coverW, renderHMin / coverH);
}

/**
 * Per-axis `art` offset delta that nudges the image by `cardFraction` of the
 * card on each press, for a given source aspect and zoom. The crop offset is
 * normalized to each axis's pan range (|offset| === 1 is the image edge), so a
 * fixed offset step slides a wide source much further across than down — it has
 * far more horizontal overscan than vertical. Scaling the step by each axis's
 * overscan (and, on Y, the art region's shorter height) makes one press travel
 * the same visible distance on both axes. An axis with no overscan reports 0
 * (nothing to pan); steps are capped at the full range so a near-flush axis
 * traverses in a single press rather than returning an absurd multiplier.
 */
export function artPanStep(
  imageAspect: number,
  scale: number,
  cardFraction: number,
): { x: number; y: number } {
  const ratio = imageAspect / ART_REGION_ASPECT_RATIO_VALUE;
  const coverW = ratio >= 1 ? ratio : 1;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const renderW = scale * coverW;
  const renderH = scale * coverH;
  const x = renderW > 1 ? Math.min(1, (2 * cardFraction) / (renderW - 1)) : 0;
  const y =
    renderH > 1
      ? Math.min(
          1,
          (2 * cardFraction) / ((renderH - 1) * (1 - ART_EXTENSION_FRACTION)),
        )
      : 0;
  return { x, y };
}

/**
 * Resolve an art crop into CSS for the art image, placed inside a full-card
 * container so the image keeps its art-region size and position yet is free to
 * extend below the seam into the fill band. Used for both the crisp artwork and
 * the blurred band copy, so the two share an identical placement and the blur is
 * a pure defocus of the same pixels rather than a ghosted second copy. The
 * image's content below the art-region crop window is the real source pixels
 * just under it — a genuine downward continuation, so the blurred copy reads as
 * a defocus of the artwork rather than a reflection (no fold or symmetry seam).
 * For a source that does not reach the card's bottom edge (a short/landscape
 * crop), the band's dark base shows through the unreached sliver. `imageAspect`
 * is null until the image loads, in which case a centered cover fallback is used.
 */
function artImageStyleExtended(
  art: { x: number; y: number; scale: number },
  imageAspect: number | null,
  target: number,
): CSSProperties {
  // Clip the watermark strip off the source bottom (the image renders the source
  // 1:1 along its own height, so the clipped sliver falls behind the fill/box).
  const clipPath = `inset(0 0 ${(ART_SOURCE_BOTTOM_CROP * 100).toFixed(3)}% 0)`;
  if (imageAspect === null) {
    return {
      position: "absolute",
      inset: 0,
      height: "100%",
      width: "100%",
      objectFit: "cover",
      transform: `scale(${art.scale})`,
      clipPath,
    };
  }

  const region = 1 - ART_EXTENSION_FRACTION;
  // Floor the zoom at the safe-area minimum so a stored (or in-flight) crop that
  // is too zoomed out can never leave the source short of the box; this is what
  // keeps existing under-zoomed cards rendering inside the safe area.
  const safeScale = Math.max(art.scale, minArtScale(imageAspect, target));
  const { renderW, renderH, panX, panY } = artCoverMetrics(
    { x: art.x, y: art.y, scale: safeScale },
    imageAspect,
    ART_REGION_ASPECT_RATIO_VALUE,
    target,
  );
  // Heights are fractions of the art region; scale them to fractions of the
  // full card, and center on the art region's center (not the card's), so the
  // placement is identical to the crisp art region above and the image simply
  // continues past the seam.
  return {
    position: "absolute",
    left: "50%",
    top: `${(region / 2) * 100}%`,
    width: `${renderW * 100}%`,
    height: `${renderH * region * 100}%`,
    maxWidth: "none",
    maxHeight: "none",
    objectFit: "cover",
    transform: `translate(-50%, -50%) translate(${panX}%, ${panY}%)`,
    clipPath,
  };
}

/**
 * Art-extension treatment for the bottom fill band. The crisp artwork is drawn
 * full-card (a single extended copy of the crop, watermark-clipped). A blurred
 * copy of the *same* crop is laid over it and masked so the blur is absent above
 * the band, feathers in across a short ramp, and then fully fills the band from
 * the seam down. Because the blur is the artwork's genuine downward continuation
 * (not a reflection) and shares the crisp copy's exact placement, the band reads
 * as a pure defocus of the art with no fold or ghost. A gradient in the art's
 * own (darkened) bottom color then grounds the band so it ends dark and
 * on-palette rather than as a light gray bar.
 *
 * The band is sized per card from the rules text box: the feather starts at the
 * box's measured top and the seam sits a short fixed distance below it, so the
 * darkened fill always tucks behind the box and scales with it — a one-line box
 * yields a small band low on the card, a wordy box a taller one. Anchoring the
 * feather to the measured box top (rather than a fixed card position) is what
 * keeps the blur from spilling onto the crisp art above a short box.
 */
/**
 * Band top (card-height %) used until the rules box has been measured (and for
 * cards with no rules box). Matches the `ART_EXTENSION_FRACTION` baseline so the
 * first paint is already close to the resolved band.
 */
const ART_BAND_DEFAULT_TOP_PCT = (1 - ART_EXTENSION_FRACTION) * 100;
/**
 * Clamp on the measured box-top %, so a stray measurement cannot collapse the
 * band to nothing or grow it past half the card. The max keeps a small band even
 * under the shortest box; the min caps the tallest band.
 */
const ART_BAND_MIN_TOP_PCT = 55;
const ART_BAND_MAX_TOP_PCT = 94;
/**
 * Feather geometry (card-height %). The fill band's seam — where the crisp art
 * fully gives way to the dark band — is anchored a fixed distance below the
 * measured box top: `ART_SAFE_AREA_OVERLAP`, the box's first text-line baseline,
 * the same target the art-coverage envelope is held to. So on every card the art
 * extends the same fixed amount under the box, whatever the box height. The blur
 * ramps in over `FEATHER_ABOVE_PCT` of card height ending at the seam, so the
 * transition eases up from the crisp art over a long, gentle gradient (no hard
 * line where it shows beside the box) and the solid dark band holds from the
 * seam down.
 */
const ART_EXTENSION_FEATHER_ABOVE_PCT = 10;
/** Card-height % over which the dark tint ramps in, ending at the seam. */
const ART_EXTENSION_TINT_ABOVE_PCT = 7;
/** Blur radius as a fraction of the rendered card width. */
const ART_EXTENSION_BLUR_RATIO = 0.06;
/**
 * Brightness multiplier on the blurred continuation. The source below the crop
 * window is often lighter than the art at the seam (e.g. dark rocks over a hazy
 * background), which would make the band read as a light blur. Pulling it down
 * proportionally keeps the continuation from ever being lighter than the
 * connecting art, while leaving already-dark bands dark.
 */
const ART_EXTENSION_BLUR_BRIGHTNESS = 0.6;
/**
 * Uniform dark color of the fill band. It both backs the art (so any sliver the
 * extended art does not reach matches) and is the tint gradient's color, so the
 * band grounds out to one consistent near-black gray on every card.
 */
const ART_BAND_COLOR = { r: 16, g: 16, b: 19 };
const ART_BAND_COLOR_CSS = `rgb(${ART_BAND_COLOR.r}, ${ART_BAND_COLOR.g}, ${ART_BAND_COLOR.b})`;
/**
 * Tint alpha at the seam (lets the blurred art read through) and at the bottom
 * edge (nearly solid, so the band grounds out dark).
 */
const ART_EXTENSION_TINT_SEAM_ALPHA = 0.5;
const ART_EXTENSION_TINT_EDGE_ALPHA = 0.92;

/**
 * The full-bleed card art: the crisp source artwork fitted into the top region,
 * with a blurred, extended copy feathered over the bottom to fill the band. The
 * primary image carries the load/error handlers (so the parent learns the source
 * aspect); the blurred copy uses the identical crop, so the feather is a pure
 * defocus of the same pixels rather than a ghost. The band is tinted with a
 * darkened version of the art's own bottom color so it grounds out dark and
 * matches the palette instead of reading as a light gray bar.
 */
function ArtLayers({
  imageUrl,
  alt,
  artCrop,
  imageAspect,
  safeAreaTarget,
  widthPx,
  bandTopPct,
  onLoad,
  onError,
}: {
  imageUrl: string;
  alt: string;
  artCrop: { x: number; y: number; scale: number };
  imageAspect: number | null;
  safeAreaTarget: number;
  widthPx: number;
  bandTopPct: number;
  onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  onError: () => void;
}) {
  const extendedStyle = artImageStyleExtended(
    artCrop,
    imageAspect,
    safeAreaTarget,
  );
  const blurPx = Math.max(2, widthPx * ART_EXTENSION_BLUR_RATIO);
  // The band is one uniform dark color: it backs the art and is the tint
  // gradient's color, so the fill grounds out to the same near-black gray on
  // every card.
  const tintRgb = `${ART_BAND_COLOR.r}, ${ART_BAND_COLOR.g}, ${ART_BAND_COLOR.b}`;

  // Resolve the band geometry from the measured rules-box top. The seam — where
  // the crisp art fully gives way to the dark band — sits a fixed distance below
  // the box top (`ART_SAFE_AREA_OVERLAP`, the box's first text-line baseline),
  // so the art extends the same fixed amount under the box on every card whatever
  // its height. The blur and tint ramp up to the seam from above, so the
  // transition is a long gentle gradient rather than a hard line.
  const bandTop = Math.min(
    Math.max(bandTopPct, ART_BAND_MIN_TOP_PCT),
    ART_BAND_MAX_TOP_PCT,
  );
  const seamPct = Math.min(100, bandTop + ART_SAFE_AREA_OVERLAP * 100);
  const featherStartPct = Math.max(0, seamPct - ART_EXTENSION_FEATHER_ABOVE_PCT);
  const featherMask = `linear-gradient(to bottom, rgba(0,0,0,0) ${featherStartPct.toFixed(2)}%, rgba(0,0,0,1) ${seamPct.toFixed(2)}%, rgba(0,0,0,1) 100%)`;
  const tintStartPct = Math.max(0, seamPct - ART_EXTENSION_TINT_ABOVE_PCT);
  const tintGradient = `linear-gradient(to bottom, rgba(${tintRgb}, 0) ${tintStartPct.toFixed(2)}%, rgba(${tintRgb}, ${ART_EXTENSION_TINT_SEAM_ALPHA}) ${seamPct.toFixed(2)}%, rgba(${tintRgb}, ${ART_EXTENSION_TINT_EDGE_ALPHA}) 100%)`;
  return (
    <>
      {/* Base behind the band: the uniform dark band color, so any sliver the
          extended art does not reach matches the band rather than going neutral. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: ART_BAND_COLOR_CSS }}
      />

      {/* Crisp artwork, drawn full-card (watermark-clipped) so the blurred band
          has no clip line for the dark base to show through. The blurred layer
          masks it from the band down. */}
      <img
        src={imageUrl}
        alt={alt}
        style={extendedStyle}
        draggable={false}
        onLoad={onLoad}
        onError={onError}
        loading="lazy"
      />

      {/*
        Blurred continuation. A second copy of the art, extended past the seam so
        it shows the real source below the crop window, blurred. The mask hides it
        above the feather zone (the box top), ramps it in across the feather (the
        art defocuses into the band), and holds it opaque from the seam down (the
        band shows the blurred continuation).
      */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          maskImage: featherMask,
          WebkitMaskImage: featherMask,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            filter: `blur(${blurPx.toFixed(2)}px) brightness(${ART_EXTENSION_BLUR_BRIGHTNESS})`,
          }}
        >
          <img src={imageUrl} alt="" style={extendedStyle} draggable={false} />
        </div>
      </div>

      {/* Color-matched darkening: a gradient in the art's own (darkened) bottom
          color that ramps in just above the seam and grounds the band's edge
          nearly solid, so the fill is dark and on-palette and the rules text
          stays legible. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: tintGradient }}
      />
    </>
  );
}

/** Card name / type / rules text colors and fonts, as CSS-var references so the
 * `.card-view` rule in `index.css` is the single place these are tuned. */
const NAME_COLOR = "var(--cv-name-color)";
const TYPE_COLOR = "var(--cv-type-color)";
const NAME_FONT_FAMILY = "var(--cv-name-font-family)";
const RULES_COLOR = "var(--cv-rules-color)";
const RULES_FONT_FAMILY = "var(--cv-rules-font-family)";

/**
 * Outline + shadow for the floating type label, which sits directly on the art
 * above the text box with no plate behind it, so its legibility comes entirely
 * from a faux outline rather than a background. A single `text-shadow` only
 * offsets one way, so the outline is stamped as eight zero-blur copies (four
 * cardinals + four diagonals) forming a hard ring around the glyphs. The
 * diagonals over-reach the cardinals by a factor of √2, so the ring alone is
 * slightly lumpy; a true `-webkit-text-stroke` paints a uniform vector outline
 * underneath to even it out (with `paint-order: stroke fill` so the stroke sits
 * outside the fill instead of eating into the letterforms), and a soft ambient
 * halo gap-fills the remaining pinholes. A downward drop grounds the label as
 * if floating just above the art. Offsets are in `cqw` so the whole treatment
 * scales with the rendered card width. See the
 * `Card A Corner Type Label - Implementation.md` design handoff for the
 * derivation.
 */
const TYPE_LABEL_RING_RADIUS_CQW = 0.62;
const TYPE_LABEL_OUTLINE_COLOR = "rgba(0, 0, 0, 0.95)";
const TYPE_LABEL_RING_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const TYPE_LABEL_TEXT_SHADOW = [
  // Eight zero-blur copies: blur must stay 0 or the ring smears and stops
  // reading as a crisp edge.
  ...TYPE_LABEL_RING_DIRECTIONS.map(
    ([x, y]) =>
      `${(x * TYPE_LABEL_RING_RADIUS_CQW).toFixed(3)}cqw ${(y * TYPE_LABEL_RING_RADIUS_CQW).toFixed(3)}cqw 0 ${TYPE_LABEL_OUTLINE_COLOR}`,
  ),
  // Ambient halo: a centered blur that lifts the text off light or busy art and
  // fills the thin gaps the eight-spoke ring leaves between its offsets.
  "0 0 1.6cqw rgba(0, 0, 0, 0.85)",
  // Grounding drop: a slight downward shadow giving the label a hair of depth.
  "0 0.4cqw 1.2cqw rgba(0, 0, 0, 0.8)",
].join(", ");
const TYPE_LABEL_TEXT_STROKE = `0.34cqw ${TYPE_LABEL_OUTLINE_COLOR}`;

/**
 * Orb diameters as a fraction of the rendered card width, used to size the
 * digit auto-shrink search. The rendered orb size is the `--cv-*-orb-size` CSS
 * var; these mirror its defaults.
 */
const ENERGY_ORB_RATIO = 0.16;
const SPARK_ORB_RATIO = 0.16;

/**
 * Rules-text ceiling size as a fraction of the rendered card width, matching
 * the `--cv-rules-font-cap` (4.2cqw) display cap in `index.css`. The fitter
 * writes the chosen size straight onto the element, so this ceiling is the
 * size a card whose text fits renders at; the fit only drops below it when the
 * text overflows the reserved area. The text box reserves three lines at the
 * larger `--cv-rules-font-size`, so text up to a little over three capped lines
 * still holds the cap before the fitter shrinks it. The floor fraction bounds
 * how small a wordy card may shrink before its overflow is clipped.
 */
const RULES_FONT_RATIO = 0.042;
const RULES_MIN_FONT_FRACTION = 0.5;

/**
 * Visual treatment for a rarity bucket. A rarity adds an outer accent ring
 * stacked as a spread-only `box-shadow` so it composes with the rounded
 * corners, plus an optional shimmer overlay controlled via a CSS class in
 * `index.css`. The shimmer keyframes honor `prefers-reduced-motion`.
 */
interface RarityStyle {
  outlineColor: string;
  glowColor: string;
  outlineWidthPx: number;
  cssClass: string | null;
}

const RARITY_STYLES: Readonly<Record<Rarity, RarityStyle | null>> = {
  Starter: null,
  Legendary: {
    outlineColor: "#f5c542",
    glowColor: "rgba(245, 197, 66, 0.55)",
    outlineWidthPx: 2,
    cssClass: "card-rarity-legendary",
  },
  Special: null,
};

function rarityStyleFor(card: { rarity?: Rarity }): RarityStyle | null {
  if (card.rarity === undefined) {
    return null;
  }
  return RARITY_STYLES[card.rarity] ?? null;
}

/**
 * An inline glyph that surfaces a card attribute before the card name (e.g. a
 * bolt before the name). `boltCount` lightning bolts render as the filled
 * Boxicons bolt mark: one for a fast card, two for an interrupt.
 */
interface AttributeChip {
  key: string;
  boltCount: number;
  ariaLabel: string;
}

/**
 * Builds the attribute chips for a card. An interrupt is always also a fast
 * card, so it takes precedence and renders a double bolt rather than stacking a
 * separate single-bolt fast chip.
 */
function buildAttributeChips(
  card: Pick<CardData, "isFast" | "isInterrupt">,
): AttributeChip[] {
  if (card.isInterrupt === true) {
    return [{ key: "interrupt", boltCount: 2, ariaLabel: "interrupt" }];
  }
  if (card.isFast) {
    return [{ key: "fast", boltCount: 1, ariaLabel: "fast" }];
  }
  return [];
}

const ENERGY_PIP_TOOLTIP =
  "Energy cost. Spend this much energy to play the card.";
const SPARK_PIP_TOOLTIP =
  "Spark. A character's combat power — higher spark wins combat.";

/**
 * Tracks the rendered card width. The width drives both the legacy text-scale
 * metadata (`data-card-text-scale`, still asserted by tests and used as the
 * baseline font ceiling) and the pixel sizes of the orbs and frame text.
 */
function useCardMetrics(large: boolean): {
  cardRef: RefObject<HTMLDivElement | null>;
  textScale: number;
  widthPx: number;
} {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [widthPx, setWidthPx] = useState<number | null>(null);

  useEffect(() => {
    const element = cardRef.current;
    if (element === null) {
      return;
    }
    const measuredElement = element;

    function updateWidth(): void {
      // `offsetWidth` is the card's layout width, immune to CSS transforms on
      // ancestors. `getBoundingClientRect().width` would fold in any ancestor
      // `scale()` — e.g. the HoverZoomCard enlargement, which portals this card
      // and scales it up. Reading the transformed width there would re-derive a
      // larger `textScale` (and rules font px) on top of the uniform visual
      // scale, making the rules text balloon out of proportion with the rest of
      // the card. Layout width keeps the auto-scale stable so the whole card
      // grows uniformly. jsdom reports `offsetWidth` as 0, so fall back to the
      // measured rect there (test environments stub `getBoundingClientRect`).
      const nextWidth = measuredElement.offsetWidth ||
        measuredElement.getBoundingClientRect().width;
      if (Number.isFinite(nextWidth) && nextWidth > 0) {
        setWidthPx(nextWidth);
      }
    }

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => {
        window.removeEventListener("resize", updateWidth);
      };
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(measuredElement);
    return () => {
      observer.disconnect();
    };
  }, [large]);

  return {
    cardRef,
    textScale: computeCardTextScale(widthPx, large),
    widthPx: widthPx ?? (large ? 220 : 156),
  };
}

export interface CardViewSlotContext {
  card: CardData | FrozenCardData;
  large: boolean;
  textScale: number;
  typeLine: string;
}

export interface CardViewSlots {
  energy?: (context: CardViewSlotContext, defaultNode: ReactNode) => ReactNode;
  name?: (context: CardViewSlotContext, defaultNode: ReactNode) => ReactNode;
  typeLineContent?: (
    context: CardViewSlotContext,
    defaultNode: ReactNode,
  ) => ReactNode;
  typeLine?: (
    context: CardViewSlotContext,
    defaultNode: ReactNode,
  ) => ReactNode;
  rulesText?: (
    context: CardViewSlotContext,
    defaultNode: ReactNode,
  ) => ReactNode;
  spark?: (context: CardViewSlotContext, defaultNode: ReactNode) => ReactNode;
}

/** Props for the shared CardView component. */
export interface CardViewProps {
  card: CardData | FrozenCardData;
  onClick?: () => void;
  selected?: boolean;
  selectionColor?: string;
  /**
   * When set, paints the card as transfigured: a small colored gem follows the
   * name, the changed corner stat(s) take the tint, and only the added/changed
   * rules text is tinted (driven by the descriptor's marked text). The card
   * itself should already carry the transfigured stats and rules text — pass the
   * `card` and `display` from `buildTransfigurationDisplay` together.
   */
  transfiguration?: CardTransfigurationDisplay;
  /** Additional CSS class name for the root element. */
  className?: string;
  /** Use larger text sizes for rules text, name, type line, and stats. */
  large?: boolean;
  /** Hide rules text for dense card surfaces that show identity and stats. */
  hideRulesText?: boolean;
  /**
   * When true, the corner stat tooltips and the card's term-definition hover
   * panel are suppressed. The card editor uses this to keep hover behavior calm
   * across a dense grid, and the card-preview surfaces
   * (`CardHoverPreview` / `BattleCardHoverPreview`) use it on the enlarged card
   * because they render their own definitions panel alongside the preview.
   */
  suppressHoverHelp?: boolean;
  /** Optional editor wrappers for individual rendered card slots. */
  slots?: CardViewSlots;
  /**
   * Called with the rules-text font size (in px) the auto-shrink fitter
   * computed to fit the rules box, whenever it changes. The card editor uses
   * this to drive its font-size overlay and font-size sort.
   */
  onRulesFontSizeChange?: (fontSizePx: number) => void;
  /**
   * Called with the rules text box's top as a fraction of card height (null when
   * the card has no rules box or it is not yet measured), whenever it changes.
   * The art-crop editor uses this to floor zoom-out and pan against the same
   * box-relative safe area the card renders with.
   */
  onBoxTopFracChange?: (boxTopFrac: number | null) => void;
  /**
   * Measure the rules-text fit immediately instead of deferring until the card
   * nears the viewport. The card editor sets this while sorting by font size so
   * every card reports a stable fitted size up front; without it the sort would
   * reshuffle endlessly as off-screen cards measured only after being moved.
   */
  eagerRulesFit?: boolean;
  /**
   * Grow the rules text box to a taller editing height. The card editor sets
   * this while its rules-text field is open so the inline textarea has room to
   * show and edit several lines at once instead of being clipped to the
   * three-line display cap.
   */
  rulesTextboxExpanded?: boolean;
}

/**
 * Renders a Dreamtides card: full-bleed art covering the whole 2:3 portrait
 * frame, with all chrome floating over it as translucent, blurred elements.
 * A frosted name bar runs across the top holding the card name (with the spark
 * orb at its right edge), and the large energy cost orb floats over the bar's
 * left end, protruding above and below it. The italic type/subtype label floats
 * directly on the art at the card's bottom-right, just above a bottom-anchored
 * text box that holds the rules body and auto-sizes to the amount of rules text.
 */
export function CardView({
  card,
  onClick,
  selected = false,
  selectionColor = SELECTION_DEFAULT_COLOR,
  transfiguration,
  className,
  large = false,
  hideRulesText = false,
  suppressHoverHelp = false,
  slots = {},
  onRulesFontSizeChange,
  onBoxTopFracChange,
  eagerRulesFit = false,
  rulesTextboxExpanded = false,
}: CardViewProps) {
  const [imageError, setImageError] = useState(false);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  // Top of the rules text box as a fraction of card height, measured live so the
  // art fill band can size itself to the box (null until measured / no box).
  const [boxTopFrac, setBoxTopFrac] = useState<number | null>(null);
  const bandBoxRef = useRef<HTMLDivElement | null>(null);
  const { cardRef, textScale, widthPx } = useCardMetrics(large);

  // Hover help: while the card is hovered, a panel defining every glossary
  // term on it portals in beside the card (never on top). Suppressed for the
  // card editor and for the enlarged card inside the hover-preview surfaces,
  // which render their own definitions panel. Dense surfaces that hide rules
  // text have no terms to explain, so they opt out too.
  const termPopover = useCardTermPopover({
    anchorRef: cardRef,
    text: card.renderedText,
    enabled: !suppressHoverHelp && !hideRulesText,
  });

  // Auto-shrink the rules body so a card needing more than the reserved three
  // lines still fits the fixed text box. The ceiling sits just above the
  // `--cv-rules-font-cap` display cap (text that fits keeps the shared type
  // scale); the fitted size only drops below the cap when the text overflows
  // the reserved area.
  const rulesMaxFontPx = widthPx * RULES_FONT_RATIO;
  const rulesMinFontPx = rulesMaxFontPx * RULES_MIN_FONT_FRACTION;
  const { ref: rulesFitRef, fontSize: rulesFontPx } = useFitText(
    rulesMaxFontPx,
    rulesMinFontPx,
    [card.renderedText, textScale],
    { eager: eagerRulesFit },
  );

  // Surface the fitted rules-text font size to interested callers (the card
  // editor's font-size overlay and sort). A ref holds the latest callback so a
  // fresh callback identity each render cannot retrigger the effect.
  const rulesFontSizeCallbackRef = useRef(onRulesFontSizeChange);
  rulesFontSizeCallbackRef.current = onRulesFontSizeChange;
  useEffect(() => {
    rulesFontSizeCallbackRef.current?.(rulesFontPx);
  }, [rulesFontPx]);

  useEffect(() => {
    setImageError(false);
    setImageAspect(null);
  }, [card.imageNumber]);

  // `identicons=1` forces the generated identicon for every card; otherwise it
  // is the art fallback for cards without an assigned image.
  const hasImage = !identiconsForced() && hasAssignedImage(card.imageNumber);
  const identiconUri = hasImage
    ? null
    : cardIdenticonUri(card.id !== "" ? card.id : card.name);

  const typeLine = formatTypeLine(card);
  const rarityStyle = rarityStyleFor(card);
  const attributeChips = buildAttributeChips(card);

  // Search caps for the corner-orb digit auto-shrink. The displayed size is
  // the smaller of the CSS-var ceiling and the fitted size (see `min(...)` in
  // CardStatOrb), so these caps only bound the search. The name / type / rules
  // text use fixed `cqw` sizes (no per-card auto-shrink) so every card on a
  // surface shares one type scale, matching the design spec.
  const energyOrbCapPx = widthPx * ENERGY_ORB_RATIO;
  const sparkOrbCapPx = widthPx * SPARK_ORB_RATIO;

  // Selection / rarity rings, stacked as box-shadows so they compose with the
  // rounded corners.
  const shadowLayers: string[] = ["0 4px 14px rgba(0, 0, 0, 0.55)"];
  if (selected) {
    shadowLayers.unshift(
      `0 0 0 3px ${selectionColor}`,
      `0 0 12px ${selectionColor}`,
    );
  } else if (rarityStyle !== null) {
    shadowLayers.unshift(
      `0 0 0 ${String(rarityStyle.outlineWidthPx)}px ${rarityStyle.outlineColor}`,
      `0 0 22px ${rarityStyle.glowColor}`,
    );
  }

  const isInteractive = onClick !== undefined;
  const rarityClass =
    rarityStyle !== null && rarityStyle.cssClass !== null
      ? ` ${rarityStyle.cssClass}`
      : "";
  const rarityAttr = card.rarity !== undefined ? card.rarity : undefined;

  const showRulesText = !hideRulesText && card.renderedText.trim() !== "";
  const slotContext: CardViewSlotContext = {
    card,
    large,
    textScale,
    typeLine,
  };

  // Multi-cost cards (e.g. an "X" spell with a fixed base, stored as `"2,X"`)
  // lay one orb per cost in a horizontal row; the common single-cost card shows
  // one orb derived from `energyCost`.
  const stackedEnergyCosts =
    card.energyCosts !== undefined && card.energyCosts.length > 1
      ? card.energyCosts
      : null;
  const energyOrb = (label: string, key?: string) => (
    <CardStatOrb
      key={key}
      variant="energy"
      value={label}
      sizeVar="var(--cv-energy-orb-size)"
      numberSizeVar="var(--cv-energy-orb-font-size)"
      numberCapPx={energyOrbCapPx}
      tooltip={suppressHoverHelp ? undefined : ENERGY_PIP_TOOLTIP}
      tintColor={
        transfiguration?.energyChanged === true
          ? ENERGY_CHANGE_TINT
          : undefined
      }
    />
  );
  const energyNode =
    stackedEnergyCosts !== null ? (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {stackedEnergyCosts.map((label, index) => (
          <div
            key={`${label}-${String(index)}`}
            style={{
              position: "relative",
              // Each orb after the first slides left to tuck behind the one
              // before it; the earlier orb keeps the higher z-index so the later
              // orb passes *under* it rather than over.
              marginLeft:
                index === 0
                  ? undefined
                  : "calc(-1 * var(--cv-energy-orb-overlap))",
              zIndex: stackedEnergyCosts.length - index,
            }}
          >
            {energyOrb(label)}
          </div>
        ))}
      </div>
    ) : (
      energyOrb(card.energyCost !== null ? String(card.energyCost) : "X")
    );

  // Fast/interrupt bolts ride inline immediately before the card name (one bolt
  // for a fast card, two for an interrupt). The bolt's mass sits low in its em
  // box, so a small upward nudge centers it on the name text.
  const attributeChipNodes = attributeChips.map((chip) => (
    <span
      key={chip.key}
      data-attribute-chip={chip.key}
      aria-label={chip.ariaLabel}
      style={{ color: "#ffffff" }}
    >
      {Array.from({ length: chip.boltCount }, (_, index) => (
        <i
          key={index}
          className={`${BOLT_ICON_CLASS} align-middle`}
          style={{
            transform: "translateY(-0.05em)",
            // The bolt glyph carries a wide left side-bearing; trim it on the
            // first bolt so the mark starts at the name's text edge rather than
            // floating in from it. Pull each later bolt (an interrupt's second
            // mark) further in so the two bolts almost touch.
            marginLeft: index === 0 ? "-0.4em" : "-0.35em",
          }}
          aria-hidden="true"
        />
      ))}
    </span>
  ));

  // The bolts sit in their own flex cell beside the name rather than inside it,
  // so the leading bolt can be nudged left to align with the name's text edge
  // without the name box's `overflow: hidden` (which drives the ellipsis on
  // long names) clipping the mark.
  const nameNode = (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        color: NAME_COLOR,
        fontFamily: NAME_FONT_FAMILY,
        fontWeight: 600,
        letterSpacing: "0.01em",
        textShadow: "0 1px 2px rgba(0, 0, 0, 0.7)",
        fontSize: "var(--cv-name-font-size)",
        lineHeight: 1.1,
      }}
    >
      {attributeChipNodes.length > 0 ? (
        <span
          style={{
            flex: "0 0 auto",
            whiteSpace: "nowrap",
            marginRight: "0.1em",
          }}
        >
          {attributeChipNodes}
        </span>
      ) : null}
      <span
        style={{
          flex: "1 1 0",
          minWidth: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {card.name}
      </span>
      {transfiguration !== undefined ? (
        <i
          className={`bxf ${TRANSFIGURATION_ICONS[transfiguration.type]}`}
          aria-label={`${transfiguration.type} transfiguration`}
          title={`${transfiguration.type} Transfiguration`}
          style={{
            flex: "0 0 auto",
            marginLeft: "0.35em",
            // The transfiguration's emblem glyph in its tint color, ringed by a
            // soft glow of the same hue and a dark drop shadow so it reads
            // against any art behind the name bar.
            fontSize: "1.05em",
            lineHeight: 1,
            color: transfiguration.color,
            textShadow: `0 0 0.3em ${transfiguration.color}, 0 1px 1px rgba(0, 0, 0, 0.7)`,
          }}
        />
      ) : null}
    </div>
  );

  const typeLineContentNode = typeLine !== "" ? <span>{typeLine}</span> : null;
  const renderedTypeLineContent =
    slots.typeLineContent?.(slotContext, typeLineContentNode) ??
    typeLineContentNode;
  const hasTypeLineContent =
    renderedTypeLineContent !== null &&
    renderedTypeLineContent !== undefined &&
    renderedTypeLineContent !== false;
  // The label floats on the art directly above the text box as the top row of
  // the bottom-anchored column below. `paddingRight` pulls its right edge in by
  // the box's corner radius so it lines up with where the box's flat top edge
  // ends and the rounded corner begins; `marginBottom` is the gap it rides above
  // the box. Because the column is bottom-anchored and the box shrinks to its
  // text, the label tracks the box's actual top however tall the box is.
  const typeLineNode = hasTypeLineContent ? (
    <div
      data-testid="card-type-line"
      style={{
        textAlign: "right",
        paddingRight: "var(--cv-textbox-radius)",
        marginBottom: "var(--cv-typelabel-gap)",
        // No background plate, so legibility comes from the faux outline (eight
        // zero-blur shadow copies), a uniform vector stroke painted outside the
        // fill, and the soft halo/drop layers.
        color: TYPE_COLOR,
        fontFamily: NAME_FONT_FAMILY,
        fontStyle: "italic",
        fontWeight: 500,
        letterSpacing: "0.02em",
        WebkitTextStroke: TYPE_LABEL_TEXT_STROKE,
        paintOrder: "stroke fill",
        textShadow: TYPE_LABEL_TEXT_SHADOW,
        fontSize: "var(--cv-type-font-size)",
        lineHeight: "var(--cv-type-line-height)",
        // A single line floating over the art. No `overflow: hidden` here: the
        // box shrink-wraps the text, so clipping would crop the outline and
        // halo at the left/right edges. Over-long labels extend leftward over
        // the art instead of truncating.
        whiteSpace: "nowrap",
      }}
    >
      {renderedTypeLineContent}
    </div>
  ) : null;

  const rulesTextNode = showRulesText ? (
    <div
      ref={rulesFitRef}
      style={{
        // The box shrinks to this element, so its height is the rules text up to
        // a three-line cap: shorter text makes a shorter box, while text longer
        // than three lines auto-shrinks its font (the `maxHeight` cap bounds the
        // element's client height, which is what lets `useFitText` detect the
        // overflow and size down) until it fits the three-line area.
        maxHeight: "var(--cv-textbox-rules-area-height)",
        overflow: "hidden",
        textAlign: "left",
        color: RULES_COLOR,
        fontFamily: RULES_FONT_FAMILY,
        fontSize: `min(var(--cv-rules-font-cap), ${String(rulesFontPx)}px)`,
        lineHeight: "var(--cv-rules-line-height)",
        textShadow: "0 1px 1px rgba(0, 0, 0, 0.55)",
      }}
    >
      {renderRulesText(transfiguration?.markedText ?? card.renderedText, {
        pipScale: textScale,
        highlightColor: transfiguration?.color,
      })}
    </div>
  ) : null;

  const sparkOrbNode =
    card.spark !== null || card.sparkVariable === true ? (
      <CardStatOrb
        variant="spark"
        value={card.spark !== null ? String(card.spark) : "X"}
        sizeVar="var(--cv-spark-orb-size)"
        numberSizeVar="var(--cv-spark-orb-font-size)"
        numberCapPx={sparkOrbCapPx}
        tooltip={suppressHoverHelp ? undefined : SPARK_PIP_TOOLTIP}
        tintColor={
          transfiguration?.sparkChanged === true
            ? SPARK_CHANGE_TINT
            : undefined
        }
      />
    ) : null;
  const renderedSparkContent =
    slots.spark?.(slotContext, sparkOrbNode) ?? sparkOrbNode;
  const hasSparkContent =
    renderedSparkContent !== null &&
    renderedSparkContent !== undefined &&
    renderedSparkContent !== false;

  const renderedNameNode = slots.name?.(slotContext, nameNode) ?? nameNode;
  const renderedTypeLineNode =
    slots.typeLine?.(slotContext, typeLineNode) ?? typeLineNode;
  const renderedRulesNode =
    slots.rulesText?.(slotContext, rulesTextNode) ?? rulesTextNode;
  const hasTextboxContent = Boolean(renderedRulesNode);
  const hasBottomChrome = hasTextboxContent || Boolean(renderedTypeLineNode);

  // Measure the rules box's top edge relative to the card so the fill band can
  // scale to the box. Measuring the box itself (not the bottom chrome, which
  // includes the floating type label's fixed offset) is what surfaces the
  // per-line height difference. The band draws behind the box and never changes
  // its size, so writing the band from a box measurement cannot loop; a small
  // dead-band absorbs observer jitter.
  //
  // The effect re-subscribes only when the box's existence or card identity
  // changes, never on the live measured values (`widthPx`, `rulesFontPx`,
  // `large`) it could influence. Those settle over several frames — the width
  // observer resolves null→px, `useFitText` re-fits on font load — so listing
  // them here would re-run the effect every frame, and its synchronous
  // `setBoxTopFrac` would compound into React's nested-update guard ("Maximum
  // update depth exceeded"). Any geometry change from a width or font shift
  // resizes `cardEl`/`boxEl`, so the ResizeObserver below re-measures from its
  // own (async, post-commit) callback instead.
  useEffect(() => {
    const cardEl = cardRef.current;
    const boxEl = bandBoxRef.current;
    if (cardEl === null || boxEl === null) {
      setBoxTopFrac(null);
      return;
    }

    function measure(): void {
      if (cardEl === null || boxEl === null) {
        return;
      }
      const cardRect = cardEl.getBoundingClientRect();
      if (cardRect.height <= 0) {
        return;
      }
      const boxRect = boxEl.getBoundingClientRect();
      const frac = (boxRect.top - cardRect.top) / cardRect.height;
      setBoxTopFrac((prev) =>
        prev !== null && Math.abs(prev - frac) < 0.002 ? prev : frac,
      );
    }

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        window.removeEventListener("resize", measure);
      };
    }
    const observer = new ResizeObserver(measure);
    observer.observe(cardEl);
    observer.observe(boxEl);
    return () => {
      observer.disconnect();
    };
  }, [hasTextboxContent, card.renderedText]);

  const bandTopPct =
    boxTopFrac !== null ? boxTopFrac * 100 : ART_BAND_DEFAULT_TOP_PCT;
  // The art's pan/zoom envelope is held against this card-height target so its
  // watermark-clipped bottom always tucks under the box's first text line.
  const safeAreaTarget = artSafeAreaTarget(boxTopFrac);

  // Report the measured box top so the art-crop editor can floor zoom-out and
  // pan against the same box-relative safe area the card renders with.
  useEffect(() => {
    onBoxTopFracChange?.(boxTopFrac);
  }, [boxTopFrac, onBoxTopFracChange]);

  // The box shrinks to its rules text, bottom-aligned, capped at the three-line
  // height (`--cv-textbox-height`): a short card gets a short box, while text
  // beyond three lines auto-shrinks to the cap. A type-only editor box (no rules
  // text) keeps the larger `--cv-textbox-max-height` cap. While the editor's
  // rules-text field is open the box takes a fixed, taller editing height so the
  // inline textarea has room to show several lines at once; the column is
  // bottom-anchored, so the box grows upward over the art.
  const textboxSizing: CSSProperties = showRulesText
    ? rulesTextboxExpanded
      ? {
          height: "var(--cv-textbox-expanded-height)",
          maxHeight: "var(--cv-textbox-expanded-height)",
        }
      : { maxHeight: "var(--cv-textbox-height)" }
    : { maxHeight: "var(--cv-textbox-max-height)" };

  const artCrop = card.art ?? DEFAULT_ART_CROP;

  return (
    <div
      ref={cardRef}
      className={`card-view relative overflow-hidden rounded-lg transition-transform duration-200${large ? " card-view--large" : ""}${isInteractive ? " cursor-pointer hover:scale-[1.02]" : ""}${rarityClass}${className ? ` ${className}` : ""}`}
      data-card-text-scale={textScale.toFixed(2)}
      data-rarity={rarityAttr}
      data-card-type={card.cardType}
      style={
        {
          aspectRatio: CARD_ASPECT_RATIO,
          "--cv-radius": CARD_CORNER_RADIUS,
          borderRadius: "var(--cv-radius)",
          boxShadow: shadowLayers.join(", "),
        } as CSSProperties
      }
      onClick={onClick}
      {...termPopover.triggerHandlers}
      {...(isInteractive
        ? {
            role: "button" as const,
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                onClick();
              }
            },
          }
        : {})}
    >
      {termPopover.popoverPortal}
      {/* Full-bleed art covering the entire card. */}
      {identiconUri !== null ? (
        <img
          src={identiconUri}
          alt={`${card.name} identicon`}
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
          loading="lazy"
        />
      ) : !imageError ? (
        <ArtLayers
          imageUrl={cardImageUrl(card.imageNumber)}
          alt={card.name}
          artCrop={artCrop}
          imageAspect={imageAspect}
          safeAreaTarget={safeAreaTarget}
          widthPx={widthPx}
          bandTopPct={bandTopPct}
          onLoad={(event) => {
            const image = event.currentTarget;
            const { naturalWidth, naturalHeight } = image;
            if (naturalWidth > 0 && naturalHeight > 0) {
              setImageAspect(naturalWidth / naturalHeight);
            }
          }}
          onError={() => {
            setImageError(true);
          }}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center p-2"
          style={{ background: "rgba(255, 255, 255, 0.04)" }}
        >
          <span
            className="text-center font-medium opacity-70"
            style={{
              color: NAME_COLOR,
              fontFamily: NAME_FONT_FAMILY,
              fontSize: "var(--cv-name-font-size)",
              lineHeight: 1.15,
            }}
          >
            {card.name}
          </span>
        </div>
      )}

      {/*
        Rarity shimmer overlay. Rendered only when the card has a rarity
        treatment that defines a CSS hook; the keyframe animation lives in
        `index.css` so `prefers-reduced-motion` can pause the sweep while
        keeping the static highlight gradient visible.
      */}
      {rarityStyle?.cssClass !== undefined &&
        rarityStyle?.cssClass !== null && (
          <div
            data-testid="card-rarity-shimmer"
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${rarityStyle.cssClass}__shimmer`}
            style={{ borderRadius: "var(--cv-radius)" }}
          />
        )}

      {/* Soft inner rim so the card edge reads against any art. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: "var(--cv-radius)",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 5cqw 0.4cqw rgba(0,0,0,0.5) inset",
        }}
      />

      {/*
        Bottom-anchored chrome column: the floating type/subtype label sits on
        the art as the top row, with the rules text box stacked below it. The
        column is pinned to the card's bottom and sizes to its content, so the
        box shrinks to its rules text (bottom-aligned, capped at three lines) and
        the label always rides a constant gap above the box's actual top. The
        label has no plate — its legibility comes from the faux outline +
        halo/drop treatment; the box's blur + translucent gradient let the art
        read through while keeping the rules text legible.
      */}
      {hasBottomChrome ? (
        <div
          style={{
            position: "absolute",
            left: "var(--cv-textbox-inset)",
            right: "var(--cv-textbox-inset)",
            bottom: "var(--cv-textbox-inset)",
            zIndex: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
          }}
        >
          {renderedTypeLineNode}
          {hasTextboxContent ? (
            <div
              ref={bandBoxRef}
              style={
                {
                  ...textboxSizing,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  padding: "var(--cv-textbox-pad)",
                  borderRadius: "var(--cv-textbox-radius)",
                  background: "var(--cv-textbox-bg)",
                  backdropFilter: "blur(var(--cv-textbox-blur)) saturate(1)",
                  WebkitBackdropFilter:
                    "blur(var(--cv-textbox-blur)) saturate(1)",
                  border: "1px solid var(--cv-textbox-border)",
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.07) inset, 0 12px 28px rgba(0,0,0,0.5)",
                } satisfies CSSProperties
              }
            >
              {renderedRulesNode}
            </div>
          ) : null}
        </div>
      ) : null}

      {/*
        Top name bar: the card name (left, flexes to fill) with the spark orb at
        its right edge. The bar's left padding clears the energy orb that floats
        over its left end.
      */}
      <div
        style={
          {
            position: "absolute",
            top: "var(--cv-namebar-top)",
            left: "var(--cv-namebar-left)",
            right: "var(--cv-header-inset)",
            height: "var(--cv-namebar-height)",
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            gap: "var(--cv-namebar-gap)",
            paddingLeft:
              stackedEnergyCosts !== null
                ? "var(--cv-namebar-pad-left-multi)"
                : "var(--cv-namebar-pad-left)",
            paddingRight: "var(--cv-namebar-pad-right)",
            // Visible so the spark orb, which is taller than the bar, protrudes
            // above and below it (like the energy orb) instead of being
            // clipped. The card name truncates via its own overflow rule.
            overflow: "visible",
            borderRadius: "var(--cv-namebar-radius)",
            background: "var(--cv-textbox-bg)",
            backdropFilter: "blur(var(--cv-textbox-blur)) saturate(1)",
            WebkitBackdropFilter: "blur(var(--cv-textbox-blur)) saturate(1)",
            border: "1px solid var(--cv-textbox-border)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.16) inset, 0 -6px 14px rgba(0,0,0,0.30) inset, 0 6px 16px rgba(0,0,0,0.34)",
          } satisfies CSSProperties
        }
      >
        {renderedNameNode}
        {hasSparkContent ? renderedSparkContent : null}
      </div>

      {/* Energy cost orb, floating over the name bar's left end and protruding
          above and below it. `display: flex` (rather than the default block) so
          the inline-flex orb does not sit in a text line box: a line box would
          add baseline leading above the orb from the inherited `line-height`,
          which is a fixed px value and therefore a larger fraction of small
          cards than large ones — dropping the orb noticeably on the smallest
          surfaces (e.g. the starting-deck grid). Flex lays the orb flush to the
          wrapper's `2cqw` top so the position stays card-proportional. */}
      <div
        className="absolute"
        style={{
          top: "var(--cv-energy-orb-top)",
          left: "var(--cv-energy-orb-left)",
          display: "flex",
          zIndex: 10,
        }}
      >
        {slots.energy?.(slotContext, energyNode) ?? energyNode}
      </div>
    </div>
  );
}
