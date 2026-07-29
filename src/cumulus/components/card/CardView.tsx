import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import "./CardView.css";
import type { CardData, FrozenCardData, Rarity } from "../../../types/cards";
import type { CardId } from "../../../types/card-identity";
import {
  cardIdenticonUri,
  cardImageUrl,
  hasAssignedImage,
} from "../../../data/card-database";
import { GLOSSARY_IDS } from "../../../data/glossary";
import { extractMaterializedFigmentPreviews } from "../../../data/materialized-figments";
import { figmentCardDisplayName } from "../../../data/figment-card-display";
import { identiconsForced } from "../../../runtime/identicon-mode";
import {
  ART_EXTENSION_FRACTION,
  ART_REGION_ASPECT_RATIO_VALUE,
  BATTLEFIELD_CARD_ASPECT_RATIO,
  BATTLEFIELD_CARD_ASPECT_RATIO_VALUE,
  BATTLEFIELD_CARD_CORNER_RADIUS,
  CARD_ASPECT_RATIO,
  CARD_CORNER_RADIUS,
} from "./card-aspect";
import { formatTypeLine } from "./card-text";
import { computeCardTextScale } from "./card-display-scale";
import { BOLT_ICON_CLASS } from "../controls/GlowIcon";
import { InlineGlyph } from "../typography/InlineGlyph";
import { glyph, GLYPHS } from "../../primitives/glyph";
import { type CumulusColor, resolveColor } from "../../primitives/color";
import { CardStatOrb } from "./CardStatOrb";
import { TRANSFIGURATION_ICONS } from "../../../runtime/transfiguration-display";
import type { CardTransfigurationDisplay } from "../../../runtime/transfiguration-display";
import { renderRulesText } from "./RulesText";
import { useFitText } from "../controls/useFitText";
import { DESKTOP_MIN_WIDTH } from "../../screens/use-is-desktop";
import { Pressable } from "../../primitives/Pressable";
import { useRevealSource } from "../../internal/reveal/context";
import {
  DEFAULT_ART_CROP,
  resolveCardArtImageStyle,
} from "./card-art-crop";
import { rulesTextDefinitionCards } from "./rules-text-reveal";
import { glossaryInfoCard } from "./glossary-info-card";

export {
  DEFAULT_ART_CROP,
  artPanStep,
  minArtOffsetY,
  minArtScale,
} from "./card-art-crop";

/**
 * Default chrome accent used for the selection ring fallback. The card's type
 * is conveyed by the text-box accent (neutral black chrome for characters, a
 * purple accent for events) rather than a colored border.
 */
const SELECTION_DEFAULT_COLOR: CumulusColor = "selected";

/** Canonical selection-ring shadows shared by card surfaces and unfiltered overlays. */
export function cardSelectionShadowLayers(
  color: CumulusColor,
): readonly [string, string] {
  const selectionCss = resolveColor(color);
  return [
    `0 0 0 3px ${selectionCss}`,
    `0 0 12px ${selectionCss}`,
  ];
}
const CARD_TIMING_GLOSSARY_IDS = [
  GLOSSARY_IDS.fast,
  GLOSSARY_IDS.interrupt,
] as const;
function cardTimingInfoCards(
  card: Pick<CardData, "isFast" | "isInterrupt">,
) {
  if (card.isInterrupt === true) {
    return [glossaryInfoCard(GLOSSARY_IDS.interrupt)];
  }
  if (card.isFast) {
    return [glossaryInfoCard(GLOSSARY_IDS.fast)];
  }
  return [];
}

function cardRulesTextDefinitionCards(
  card: Pick<CardData, "isFast" | "isInterrupt" | "renderedText">,
  extraExcludedIds: readonly string[] = [],
) {
  return rulesTextDefinitionCards(
    card.renderedText,
    "card",
    [
      ...(card.isFast || card.isInterrupt === true
        ? CARD_TIMING_GLOSSARY_IDS
        : []),
      ...extraExcludedIds,
    ],
  );
}

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
 * Coverage target for the full-bleed figment frame: the art is held covering all
 * the way to the card's bottom edge (a card-height fraction of 1) so there is no
 * fill band. The watermark-clipped art reaches the very bottom, so the figment
 * shows edge-to-edge art with no dark grounding strip.
 */
export const FIGMENT_ART_SAFE_AREA_TARGET = 1;

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
  fullBleed = false,
  frameAspect = ART_REGION_ASPECT_RATIO_VALUE,
  region = 1 - ART_EXTENSION_FRACTION,
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
  /**
   * When set, the art covers the whole card with no bottom fill band: the
   * blurred, darkened continuation and the dark tint gradient are dropped, and
   * the caller is expected to pass a `safeAreaTarget` that holds the crisp art
   * covering to the very bottom edge. Used by the figment frame, which is
   * full-bleed art rather than art-over-a-grounded-band.
   */
  fullBleed?: boolean;
  /** Width-to-height ratio of the art viewport. */
  frameAspect?: number;
  /** Height of the art viewport as a fraction of the rendered card. */
  region?: number;
  onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  onError: () => void;
}) {
  const extendedStyle = resolveCardArtImageStyle(
    artCrop,
    imageAspect,
    safeAreaTarget,
    frameAspect,
    region,
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
  const featherStartPct = Math.max(
    0,
    seamPct - ART_EXTENSION_FEATHER_ABOVE_PCT,
  );
  const featherMask = `linear-gradient(to bottom, rgba(0,0,0,0) ${featherStartPct.toFixed(2)}%, rgba(0,0,0,1) ${seamPct.toFixed(2)}%, rgba(0,0,0,1) 100%)`;
  const tintStartPct = Math.max(0, seamPct - ART_EXTENSION_TINT_ABOVE_PCT);
  const tintGradient = `linear-gradient(to bottom, rgba(${tintRgb}, 0) ${tintStartPct.toFixed(2)}%, rgba(${tintRgb}, ${ART_EXTENSION_TINT_SEAM_ALPHA}) ${seamPct.toFixed(2)}%, rgba(${tintRgb}, ${ART_EXTENSION_TINT_EDGE_ALPHA}) 100%)`;
  return (
    <>
      {/* Base behind the band: the uniform dark band color, so any sliver the
          extended art does not reach matches the band rather than going neutral. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: ART_BAND_COLOR_CSS,
        }}
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
        band shows the blurred continuation). The figment frame is full-bleed art
        with no band, so it drops this layer (and the tint gradient below).
      */}
      {fullBleed ? null : (
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
            <img
              src={imageUrl}
              alt=""
              style={extendedStyle}
              draggable={false}
            />
          </div>
        </div>
      )}

      {/* Color-matched darkening: a gradient in the art's own (darkened) bottom
          color that ramps in just above the seam and grounds the band's edge
          nearly solid, so the fill is dark and on-palette and the rules text
          stays legible. Dropped for the full-bleed figment frame. */}
      {fullBleed ? null : (
        <div
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, background: tintGradient }}
        />
      )}
    </>
  );
}

/** Card name / type / rules text colors and fonts, as CSS-var references so the
 * component-owned `.card-view` rule in `CardView.css` is the single place these
 * are tuned. */
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
 * the `--cv-rules-font-cap` display cap in `CardView.css`. The fitter writes the
 * chosen size straight onto the element, so this ceiling is the size a card
 * whose text fits renders at; the fit only drops below it when the text
 * overflows the reserved area. The text box reserves three lines at the larger
 * `--cv-rules-font-size`, so text up to a little over three capped lines still
 * holds the cap before the fitter shrinks it. The floor fraction bounds how
 * small a wordy card may shrink before its overflow is clipped.
 *
 * Mobile viewports use a larger ceiling (`RULES_FONT_RATIO_MOBILE`, matching
 * the raised `--cv-rules-font-cap` in the `.card-view` mobile media query):
 * card frame sizes are all `cqw`, so a card reads at a fixed physical size for
 * its width on any device, which leaves the ability text hard to read on the
 * small cards a phone renders. The raised ceiling feeds the same auto-shrink
 * fit into the taller mobile box, lifting the whole rules body a couple
 * notches. Both ratios must track their CSS counterparts so the JS search
 * ceiling and the CSS render cap stay equal at each breakpoint.
 */
const RULES_FONT_RATIO = 0.042;
const RULES_FONT_RATIO_MOBILE = 0.0485;
const RULES_MIN_FONT_FRACTION = 0.5;

/**
 * Below this viewport width a card lifts its rules-text sizing. Mirrors the
 * app's desktop/mobile line (`DESKTOP_MIN_WIDTH` / `useIsDesktop`, 900px) and
 * the `@media (max-width: 899.98px)` block on `.card-view` in `CardView.css` that
 * raises the matching box + render-cap CSS vars; the query and that media block
 * must move together so the JS fit ceiling and the CSS cap agree.
 *
 * Derived from the shared `DESKTOP_MIN_WIDTH` (900) so the two can't drift:
 * 900 − 0.02 = 899.98 is the sub-pixel step below the shared desktop/mobile
 * line, so the JS fit ceiling and the CSS cap land on the same boundary.
 * `(900 - 0.02).toString() === "899.98"`, so the emitted query is byte-identical
 * to the literal it replaced.
 */
const MOBILE_CARD_TEXT_QUERY = `(max-width: ${DESKTOP_MIN_WIDTH - 0.02}px)`;

/**
 * True on mobile-width viewports, where a card renders its larger rules-text
 * sizing. Live via matchMedia so resizing or rotating re-evaluates, mirroring
 * InfoCard's `useFinePointer` idiom.
 */
function useMobileCardText(): boolean {
  const [mobile, setMobile] = useState<boolean>(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia(MOBILE_CARD_TEXT_QUERY).matches,
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const query = window.matchMedia(MOBILE_CARD_TEXT_QUERY);
    const onChange = (): void => setMobile(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return mobile;
}

/**
 * Visual treatment for a rarity bucket. A rarity adds a shimmer overlay
 * controlled via a CSS class in `CardView.css`. The shimmer keyframes honor
 * `prefers-reduced-motion`.
 */
interface RarityStyle {
  cssClass: string | null;
}

const RARITY_STYLES: Readonly<Record<Rarity, RarityStyle | null>> = {
  Starter: null,
  Legendary: {
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
      // `scale()` — e.g. the built-in hover enlargement, which portals this card
      // and scales it up. Reading the transformed width there would re-derive a
      // larger `textScale` (and rules font px) on top of the uniform visual
      // scale, making the rules text balloon out of proportion with the rest of
      // the card. Layout width keeps the auto-scale stable so the whole card
      // grows uniformly. jsdom reports `offsetWidth` as 0, so fall back to the
      // measured rect there (test environments stub `getBoundingClientRect`).
      const nextWidth =
        measuredElement.offsetWidth ||
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

/** Strict visual treatments for the semantic card source. */
export type GameCardPresentation = "full" | "battlefield";

/** Props for the shared CardView component. */
export interface CardViewProps {
  card: CardData | FrozenCardData;
  onClick?: () => void;
  selected?: boolean;
  /** The selection-ring {@link CumulusColor}. Default the `"selected"` role. */
  selectionColor?: CumulusColor;
  /**
   * When set, paints the card as transfigured: a small colored gem follows the
   * name, changed corner stats gain their Empowered/Kindled shape badges, and
   * only the added/changed rules text is tinted (driven by the descriptor's
   * marked text). The card
   * itself should already carry the transfigured stats and rules text — pass the
   * `card` and `display` from `buildTransfigurationDisplay` together.
   */
  transfiguration?: CardTransfigurationDisplay;
  /** Use larger text sizes for rules text, name, type line, and stats. */
  large?: boolean;
  /**
   * Render the figment frame (rules §Figments): no energy orb, a canonical
   * `"<Identity> Figment"` title bar, and a black-on-light frosted rules box.
   */
  figment?: boolean;
  /** Hide rules text for dense card surfaces that show identity and stats. */
  hideRulesText?: boolean;
  /**
   * Visual treatment for the source card. `"battlefield"` uses a rounded square
   * frame that widens the art viewport at its existing vertical scale, keeping
   * only the art and an enlarged top-right spark mark; the shared reveal remains
   * complete.
   */
  presentation?: GameCardPresentation;
  /** Optional editor wrappers for individual rendered card slots. */
  slots?: CardViewSlots;
  /**
   * Reveal glossary Info Cards on hover for editor and inspector surfaces.
   * Player-facing cards use {@link GameCard}, which always carries its complete
   * semantic reveal contract.
   */
  glossaryInfoOnHover?: boolean;
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
function GameCardSurface(props: CardViewProps) {
  const {
    card: sourceCard,
    onClick,
    selected = false,
    selectionColor = SELECTION_DEFAULT_COLOR,
    transfiguration,
    large = false,
    figment = false,
    hideRulesText = false,
    presentation = "full",
    slots = {},
    onRulesFontSizeChange,
    onBoxTopFracChange,
    eagerRulesFit = false,
    rulesTextboxExpanded = false,
  } = props;
  const card = figment
    ? {
        ...sourceCard,
        name: figmentCardDisplayName(sourceCard.name, sourceCard.subtype),
      }
    : sourceCard;
  const [imageError, setImageError] = useState(false);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  // Top of the rules text box as a fraction of card height, measured live so the
  // art fill band can size itself to the box (null until measured / no box).
  const [boxTopFrac, setBoxTopFrac] = useState<number | null>(null);
  const bandBoxRef = useRef<HTMLDivElement | null>(null);
  const { cardRef, textScale, widthPx } = useCardMetrics(large);

  // Auto-shrink the rules body so a card needing more than the reserved three
  // lines still fits the fixed text box. The ceiling sits just above the
  // `--cv-rules-font-cap` display cap (text that fits keeps the shared type
  // scale); the fitted size only drops below the cap when the text overflows
  // the reserved area. Mobile viewports raise both the ceiling and the CSS box
  // + cap together, so the same fit lands a couple notches larger.
  const mobileCardText = useMobileCardText();
  const rulesFontRatio = mobileCardText
    ? RULES_FONT_RATIO_MOBILE
    : RULES_FONT_RATIO;
  const rulesMaxFontPx = widthPx * rulesFontRatio;
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

  // Selection ring, stacked as box-shadows so it composes with the rounded
  // corners.
  const shadowLayers: string[] = ["0 4px 14px rgba(0, 0, 0, 0.55)"];
  if (selected) {
    shadowLayers.unshift(...cardSelectionShadowLayers(selectionColor));
  }

  const isInteractive = onClick !== undefined;
  const respondsToPointer = isInteractive;
  // Heuristic: if the rules text is already readable without zoom, use only a
  // minor in-place hover zoom for emphasis, about 5%, instead of opening the
  // larger reading preview.
  const pointerFeedbackClass = respondsToPointer
    ? large
      ? " cursor-pointer hover:scale-[1.05] active:scale-[1.03]"
      : " cursor-pointer hover:scale-[1.02] active:scale-[0.97]"
    : "";
  const rarityClass =
    rarityStyle !== null && rarityStyle.cssClass !== null
      ? ` ${rarityStyle.cssClass}`
      : "";
  const rarityAttr = card.rarity !== undefined ? card.rarity : undefined;

  const battlefieldPresentation = presentation === "battlefield";
  const showRulesText =
    !battlefieldPresentation &&
    !hideRulesText &&
    card.renderedText.trim() !== "";
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
      changeBadge={
        transfiguration?.energyChanged === true ? "empowered" : undefined
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
  // for a fast card, two for an interrupt).
  const attributeChipNodes = attributeChips.map((chip) => (
    <span
      key={chip.key}
      data-attribute-chip={chip.key}
      aria-label={chip.ariaLabel}
      style={{
        color:
          transfiguration?.fastChanged === true
            ? transfiguration.color
            : "#ffffff",
      }}
    >
      {Array.from({ length: chip.boltCount }, (_, index) => (
        <span
          key={index}
          style={{
            // The bolt glyph carries a wide left side-bearing; trim it on the
            // first bolt so the mark starts at the name's text edge rather than
            // floating in from it. Pull each later bolt (an interrupt's second
            // mark) further in so the two bolts almost touch.
            marginLeft: index === 0 ? "-0.4em" : "-0.35em",
          }}
        >
          <InlineGlyph glyph={BOLT_ICON_CLASS} />
        </span>
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
        textShadow: "var(--cv-name-text-shadow)",
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
          className={glyph(
            `bxf ${TRANSFIGURATION_ICONS[transfiguration.type]}`,
          )}
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
        textShadow: "var(--cv-rules-text-shadow)",
      }}
    >
      {renderRulesText(transfiguration?.markedText ?? card.renderedText, {
        pipScale: textScale,
        highlightColor: transfiguration?.color,
        interactiveTerms: false,
      })}
    </div>
  ) : null;

  // Battlefield cards enlarge the spark; full figments seat the ordinary spark
  // at the canonical title bar's right edge.
  const sparkSizeVar = battlefieldPresentation
    ? "calc(var(--cv-spark-orb-size) * 2.5)"
    : "var(--cv-spark-orb-size)";
  const sparkFontVar = battlefieldPresentation
    ? "calc(var(--cv-spark-orb-font-size) * 2.5)"
    : "var(--cv-spark-orb-font-size)";
  const sparkCapPx = battlefieldPresentation
    ? sparkOrbCapPx * 2.5
    : sparkOrbCapPx;
  const sparkOrbNode =
    card.spark !== null || card.sparkVariable === true ? (
      <CardStatOrb
        variant="spark"
        value={card.spark !== null ? String(card.spark) : "X"}
        sizeVar={sparkSizeVar}
        numberSizeVar={sparkFontVar}
        numberCapPx={sparkCapPx}
        changeBadge={
          !battlefieldPresentation && transfiguration?.sparkChanged === true
            ? "kindled"
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
  const renderedTypeLineNode = battlefieldPresentation
    ? null
    : (slots.typeLine?.(slotContext, typeLineNode) ?? typeLineNode);
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
  // watermark-clipped bottom always tucks under the box's first text line. The
  // figment frame is full-bleed (no fill band), so its art is instead held
  // covering to the very bottom edge.
  const safeAreaTarget = figment || battlefieldPresentation
    ? FIGMENT_ART_SAFE_AREA_TARGET
    : artSafeAreaTarget(boxTopFrac);

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
  const renderedArtCrop = battlefieldPresentation
    ? {
        ...artCrop,
        // The battlefield frame grows sideways from the portrait card's
        // existing height. Preserve the artwork's physical vertical scale so
        // the added square area reveals the sides instead of zooming in.
        scale: artCrop.scale * (1 - ART_EXTENSION_FRACTION),
      }
    : artCrop;

  return (
    <div
      ref={cardRef}
      className={`card-view relative overflow-hidden rounded-lg transition-transform duration-200${large ? " card-view--large" : ""}${pointerFeedbackClass}${rarityClass}`}
      data-card-id={card.id}
      data-card-text-scale={textScale.toFixed(2)}
      data-rarity={rarityAttr}
      data-card-type={card.cardType}
      data-card-presentation={presentation}
      data-figment={figment ? "true" : undefined}
      style={
        {
          aspectRatio: battlefieldPresentation
            ? BATTLEFIELD_CARD_ASPECT_RATIO
            : CARD_ASPECT_RATIO,
          "--cv-radius": battlefieldPresentation
            ? BATTLEFIELD_CARD_CORNER_RADIUS
            : CARD_CORNER_RADIUS,
          borderRadius: "var(--cv-radius)",
          boxShadow: shadowLayers.join(", "),
        } as CSSProperties
      }
      onClick={onClick}
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
          artCrop={renderedArtCrop}
          imageAspect={imageAspect}
          safeAreaTarget={safeAreaTarget}
          widthPx={widthPx}
          bandTopPct={bandTopPct}
          fullBleed={figment || battlefieldPresentation}
          frameAspect={
            battlefieldPresentation
              ? BATTLEFIELD_CARD_ASPECT_RATIO_VALUE
              : undefined
          }
          region={battlefieldPresentation ? 1 : undefined}
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
        `CardView.css` so `prefers-reduced-motion` can pause the sweep while
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

      {battlefieldPresentation ? (
        hasSparkContent ? (
          <div
            className="absolute"
            data-card-battlefield-spark=""
            style={{
              top: "var(--cv-battlefield-spark-top)",
              right: "var(--cv-battlefield-spark-right)",
              display: "flex",
              zIndex: 6,
            }}
          >
            {renderedSparkContent}
          </div>
        ) : null
      ) : figment ? (
        <>
          {/*
            Figment top chrome. Every figment uses the canonical title bar so
            its identity and object kind remain legible at every call site. The
            spark stat sits at the right edge on the figment's black-on-light
            frosted material.
          */}
          <div
            data-testid="figment-title-bar"
            style={
              {
                position: "absolute",
                top: "var(--cv-namebar-top)",
                // No energy orb on a figment, so the bar runs symmetrically
                // inset from both sides rather than offset to clear an orb.
                left: "var(--cv-header-inset)",
                right: "var(--cv-header-inset)",
                height: "var(--cv-namebar-height)",
                zIndex: 5,
                display: "flex",
                alignItems: "center",
                gap: "var(--cv-namebar-gap)",
                paddingLeft: "var(--cv-figment-titlebar-pad)",
                paddingRight: "var(--cv-namebar-pad-right)",
                // Visible so the spark orb, taller than the bar, protrudes
                // above and below it exactly as on a regular card.
                overflow: "visible",
                borderRadius: "var(--cv-namebar-radius)",
                background: "var(--cv-textbox-bg)",
                backdropFilter: "blur(var(--cv-textbox-blur)) saturate(1)",
                WebkitBackdropFilter:
                  "blur(var(--cv-textbox-blur)) saturate(1)",
                border: "1px solid var(--cv-textbox-border)",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.5) inset, 0 4px 12px rgba(18,28,58,0.22)",
              } satisfies CSSProperties
            }
          >
            {renderedNameNode}
            {hasSparkContent ? renderedSparkContent : null}
          </div>
        </>
      ) : (
        <>
          {/*
            Top name bar: the card name (left, flexes to fill) with the spark orb
            at its right edge. The bar's left padding clears the energy orb that
            floats over its left end.
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
                // Visible so the spark orb, which is taller than the bar,
                // protrudes above and below it (like the energy orb) instead of
                // being clipped. The card name truncates via its own overflow
                // rule.
                overflow: "visible",
                borderRadius: "var(--cv-namebar-radius)",
                background: "var(--cv-namebar-bg)",
                backdropFilter: "blur(var(--cv-textbox-blur)) saturate(1)",
                WebkitBackdropFilter:
                  "blur(var(--cv-textbox-blur)) saturate(1)",
                border: "1px solid var(--cv-namebar-border)",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.16) inset, 0 -6px 14px rgba(0,0,0,0.30) inset, 0 6px 16px rgba(0,0,0,0.34)",
              } satisfies CSSProperties
            }
          >
            {renderedNameNode}
            {hasSparkContent ? renderedSparkContent : null}
          </div>

          {/* Energy cost orb, floating over the name bar's left end and
              protruding above and below it. `display: flex` (rather than the
              default block) so the inline-flex orb does not sit in a text line
              box: a line box would add baseline leading above the orb from the
              inherited `line-height`, which is a fixed px value and therefore a
              larger fraction of small cards than large ones — dropping the orb
              noticeably on the smallest surfaces (e.g. the starting-deck grid).
              Flex lays the orb flush to the wrapper's `2cqw` top so the position
              stays card-proportional. */}
          <div
            className="absolute"
            data-card-energy-anchor=""
            style={{
              top: "var(--cv-energy-orb-top)",
              left: "var(--cv-energy-orb-left)",
              display: "flex",
              zIndex: 10,
            }}
          >
            {slots.energy?.(slotContext, energyNode) ?? energyNode}
          </div>
        </>
      )}
    </div>
  );
}

/** Canonical semantic data consumed by the player-facing {@link GameCard}. */
export interface GameCardModel {
  /** Stable catalog UUID used for reveal identity and diagnostics. */
  readonly cardId: CardId;
  /** Complete resolved display data whose `id` matches `cardId`. */
  readonly displaySnapshot: FrozenCardData;
  /** Optional presentation of a transfigured card. */
  readonly transfiguration?: CardTransfigurationDisplay;
}

/** Strict player-facing GameCard props. Reveal mechanics are library-owned. */
export interface GameCardProps {
  /** Canonical card semantics and resolved display snapshot. */
  readonly model: GameCardModel;
  /** Player action invoked by a quick activation. */
  readonly onActivate?: () => void;
  /** Whether the action is unavailable while the card remains informative. */
  readonly unavailable?: boolean;
  /** Draw the semantic selection state. */
  readonly selected?: boolean;
  /** Selection-ring color. Defaults to the shared selected role. */
  readonly selectionColor?: CumulusColor;
  /** Hide source rules on dense surfaces; the reveal stays complete. */
  readonly hideRulesText?: boolean;
  /** Whether this card is currently exhausted in battle. */
  readonly exhausted?: boolean;
  /**
   * Visual treatment for the source card. `"battlefield"` uses a rounded square
   * frame that widens the art viewport at its existing vertical scale, showing
   * only art and an enlarged top-right spark value while preserving the complete
   * reveal.
   */
  readonly presentation?: GameCardPresentation;
  /** Render the figment frame with its canonical `"<Identity> Figment"` title bar. */
  readonly figment?: boolean;
  /** Optional stable test id for the semantic source. */
  readonly testId?: string;
}

/**
 * Player-facing card entity. It derives its complete reading copy and glossary
 * secondaries from semantic card data and registers them with the root reveal
 * coordinator. Callers provide meaning and activation only. Desktop layouts
 * showing two or three cards should size their wrappers to at least 240px when
 * space permits, keeping the complete source in place during reveal. Dense
 * collections may render smaller cards and rely on the reading copy.
 */
export function GameCard({
  model,
  onActivate,
  unavailable = false,
  selected = false,
  selectionColor,
  hideRulesText = false,
  exhausted = false,
  presentation = "full",
  figment = false,
  testId,
}: GameCardProps) {
  const lastPointerType = useRef<string | null>(null);
  const displaySnapshot = figment
    ? {
        ...model.displaySnapshot,
        name: figmentCardDisplayName(
          model.displaySnapshot.name,
          model.displaySnapshot.subtype,
        ),
      }
    : model.displaySnapshot;
  const timingCards = cardTimingInfoCards(displaySnapshot);
  const glossaryCards = cardRulesTextDefinitionCards(
    displaySnapshot,
    figment ? [GLOSSARY_IDS.figment] : [],
  );
  const statusCards = exhausted
    ? [
        glossaryInfoCard(GLOSSARY_IDS.exhausted, {
          variant: "text",
          leadGlyph: GLYPHS.exhaust,
        }),
      ]
    : [];
  const figmentStatusCards = figment
    ? [glossaryInfoCard(GLOSSARY_IDS.figment)]
    : [];
  const figmentCards = extractMaterializedFigmentPreviews(
    displaySnapshot.renderedText,
  ).map((preview) => ({
    kind: "gameCard" as const,
    cardId: preview.card.id,
    displaySnapshot: preview.card,
    figment: true,
    selected: true,
    selectionColor: "accent-bright" as const,
  }));
  const binding = useRevealSource({
    identity: { entityType: "game-card", entityId: model.cardId },
    spec: {
      primary: {
        kind: "gameCard",
        cardId: model.cardId,
        displaySnapshot,
        ...(model.transfiguration === undefined
          ? {}
          : { transfiguration: model.transfiguration }),
        ...(selected ? { selected: true, selectionColor } : {}),
        ...(figment ? { figment: true } : {}),
      },
      secondaries: [
        ...statusCards,
        ...figmentStatusCards,
        ...timingCards,
        ...glossaryCards,
      ],
      adjacentCards: figmentCards,
    },
    onActivate: unavailable ? undefined : onActivate,
  });
  const pointerDown = binding.sourceProps.onPointerDown;
  const interactive = onActivate !== undefined;
  return (
    <Pressable
      as="div"
      hoverFeedback={presentation === "battlefield" ? "stationary" : "scale"}
      snapFeedbackExit
      ref={binding.ref}
      {...binding.sourceProps}
      role={interactive ? "button" : undefined}
      tabIndex={0}
      aria-disabled={unavailable || undefined}
      aria-label={displaySnapshot.name}
      data-testid={testId}
      data-game-card-source=""
      data-game-card-presentation={presentation}
      data-card-id={model.cardId}
      data-reveal-complete-game-card={
        hideRulesText || presentation === "battlefield" ? "false" : "true"
      }
      onPointerDown={(event) => {
        lastPointerType.current = event.pointerType;
        pointerDown?.(event);
      }}
      onClick={() => {
        if (!unavailable && lastPointerType.current !== "touch") onActivate?.();
      }}
      onKeyDown={(event) => {
        if (!unavailable && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onActivate?.();
        }
      }}
      style={{
        ...binding.sourceProps.style,
        display: "block",
        width: "100%",
        appearance: "none",
        padding: 0,
        border: 0,
        background: "transparent",
      }}
    >
      <GameCardSurface
        card={displaySnapshot}
        transfiguration={model.transfiguration}
        selected={selected}
        selectionColor={selectionColor}
        hideRulesText={hideRulesText}
        presentation={presentation}
        figment={figment}
      />
    </Pressable>
  );
}

function GlossaryInfoCardView(props: CardViewProps) {
  const binding = useRevealSource({
    identity: { entityType: "game-card", entityId: props.card.id },
    spec: {
      primary: {
        kind: "gameCard",
        cardId: props.card.id,
        displaySnapshot: props.card,
      },
      secondaries: [
        ...cardTimingInfoCards(props.card),
        ...cardRulesTextDefinitionCards(props.card),
      ],
    },
    feedback: "stationary",
  });

  return (
    <div
      ref={binding.ref}
      {...binding.sourceProps}
      data-card-view-glossary-hover-source="true"
      data-reveal-complete-game-card="true"
      style={{ ...binding.sourceProps.style, display: "block" }}
    >
      <GameCardSurface {...props} />
    </div>
  );
}

/** Visual editor surface; player UI uses {@link GameCard}. */
export function CardView(props: CardViewProps) {
  return props.glossaryInfoOnHover ? (
    <GlossaryInfoCardView {...props} />
  ) : (
    <GameCardSurface {...props} />
  );
}
