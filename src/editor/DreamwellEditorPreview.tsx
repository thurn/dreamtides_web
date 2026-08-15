import { assertLocalized } from "@trox/runtime";
import {
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  cardImageUrl,
  cardIdenticonUri,
  hasAssignedImage,
} from "../data/card-database";
import type { ArtCrop } from "../types/cards";
import { CardStatOrb } from "../cumulus/components/card/CardStatOrb";
import { RulesText } from "../cumulus/components/card/RulesText";
import type { DreamwellCardId } from "../types/identifiers";
import { parseDreamwellCardId } from "../types/identifiers";
import { parseDreamwellCardName } from "../types/catalog-names";

/**
 * Optional render overrides for the Dreamwell card's editable regions. Each slot
 * receives the node the card would render by default and returns a replacement,
 * letting the Dreamwell editor wrap the name, rules text, and energy orb in
 * inline {@link import("../editor/EditableField").default} editors while leaving
 * the in-battle card (which passes no slots) untouched. When a `rulesText` slot
 * is supplied the frosted box is always rendered, so a card with no rules text
 * still offers a target to start an inline edit.
 */
/** Editor-only inline-editing surfaces for a Dreamwell card preview. */
export interface DreamwellEditorPreviewSlots {
  name?: (defaultNode: ReactNode) => ReactNode;
  rulesText?: (defaultNode: ReactNode) => ReactNode;
  energy?: (defaultNode: ReactNode) => ReactNode;
}

/**
 * Upper bound for the energy digit's auto-shrink search, as a fraction of the
 * card width — the same `ENERGY_ORB_RATIO` CardView passes as the orb's
 * `numberCapPx` (`widthPx * 0.16`). Computing it from the measured width (rather
 * than a fixed pixel cap) is what keeps the digit at the `9cqw` ceiling on the
 * large Dreamwell card instead of being clamped smaller than its flame.
 */
const ENERGY_ORB_RATIO = 0.16;

/**
 * The data a Dreamwell card needs to render. A subset of
 * {@link import("../battle/types").DreamwellCardDefinition}, kept structural so
 * the component does not depend on the battle module.
 */
export interface DreamwellEditorPreviewData {
  id: DreamwellCardId;
  name: string;
  renderedText: string;
  energyAdded: number;
  imageNumber: number;
  /**
   * Curated pan/zoom crop framing the card art, authored through the Dreamwell
   * editor's focused editor and stored as the inline `art` table in the dreamwell
   * TOML. Absent on cards that have never been framed, in which case the art is
   * shown at its default top-anchored full cover.
   */
  art?: ArtCrop;
}

/**
 * The Dreamwell card's landscape frame is a 3:2 box; the art crop math resolves
 * the source against it so a curated pan/zoom always keeps the frame covered.
 */
const DREAMWELL_FRAME_ASPECT = 3 / 2;

/** Pan/zoom bounds for the Dreamwell art crop, matching the regular card editor:
 *  `x`/`y` are normalized pan in -1..1 (0 = centered) and `scale` is a cover
 *  zoom of at least 1 (1 keeps the frame exactly covered). */
export const DREAMWELL_ART_OFFSET_MIN = -1;
export const DREAMWELL_ART_OFFSET_MAX = 1;
export const DREAMWELL_ART_SCALE_MIN = 1;
export const DREAMWELL_ART_SCALE_MAX = 5;

/** Centered, un-zoomed crop seeded when framing a card for the first time. */
export const DEFAULT_DREAMWELL_ART_CROP: ArtCrop = { x: 0, y: 0, scale: 1 };

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Cover layout for a Dreamwell art crop against the 3:2 frame. The watermark
 * strip is clipped off the source bottom, so the *usable* image is shorter (a
 * wider effective aspect); it is sized to cover the frame at `scale`, and the
 * full element (strip included) is grown back by the crop fraction so the clip
 * removes exactly the strip below the visible window. Pan is expressed as a
 * fraction of each axis's overscan, so any `x`/`y` in -1..1 keeps the frame
 * covered. Returns element box size and top-left placement, all as fractions of
 * the frame.
 */
function dreamwellCoverLayout(
  art: ArtCrop,
  imageAspect: number,
): { boxW: number; boxH: number; visH: number; left: number; top: number } {
  const usableAspect = imageAspect / (1 - ART_SOURCE_BOTTOM_CROP);
  const ratio = usableAspect / DREAMWELL_FRAME_ASPECT;
  const coverW = ratio >= 1 ? ratio : 1;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const visW = art.scale * coverW;
  const visH = art.scale * coverH;
  const boxW = visW;
  const boxH = visH / (1 - ART_SOURCE_BOTTOM_CROP);
  const overscanX = Math.max(0, boxW - 1);
  const overscanY = Math.max(0, visH - 1);
  const panX = clampNumber(art.x, -1, 1) * (overscanX / 2);
  const panY = clampNumber(art.y, -1, 1) * (overscanY / 2);
  return {
    boxW,
    boxH,
    visH,
    left: 0.5 - boxW / 2 + panX,
    top: 0.5 - visH / 2 + panY,
  };
}

/**
 * Per-axis `art` offset delta that nudges the art by `cardFraction` of the card
 * on each editor press, for a given source aspect and zoom. The offset is
 * normalized to each axis's overscan, so a fixed delta would slide a wide source
 * much further across than down; scaling by the overscan makes one press travel
 * the same visible distance on both axes. An axis with no overscan reports 0
 * (nothing to pan); steps are capped at the full range so a near-flush axis
 * traverses in a single press.
 */
export function dreamwellArtPanStep(
  imageAspect: number,
  scale: number,
  cardFraction: number,
): { x: number; y: number } {
  const usableAspect = imageAspect / (1 - ART_SOURCE_BOTTOM_CROP);
  const ratio = usableAspect / DREAMWELL_FRAME_ASPECT;
  const coverW = ratio >= 1 ? ratio : 1;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const boxW = scale * coverW;
  const visH = scale * coverH;
  const overscanX = boxW - 1;
  const overscanY = visH - 1;
  const x = overscanX > 0 ? Math.min(1, (2 * cardFraction) / overscanX) : 0;
  const y = overscanY > 0 ? Math.min(1, (2 * cardFraction) / overscanY) : 0;
  return { x, y };
}

/**
 * Fraction of the source image's height, at the very bottom, taken up by the
 * watermark / letterbox strip that must never be shown. The art sources are a
 * uniform 280px tall with a ~21px strip; cropping it matches the regular card
 * (`CardView`'s `ART_SOURCE_BOTTOM_CROP`). The art image is rendered into a box
 * grown taller by this fraction and top-anchored, so the strip falls below the
 * card's bottom edge and is clipped by the card's `overflow: hidden`.
 */
const ART_SOURCE_BOTTOM_CROP = 21 / 280;

/**
 * Art-extension band tokens, ported from CardView's `ArtLayers`. The crisp art
 * holds down to a seam set just under the text box's top — at the end of the
 * box's top corner-radius curve — and from that seam a blurred copy of the art
 * and a dark tint ramp to a *fully opaque* near-black base, reached a short
 * distance below the seam. So the art reads crisply above and only just under the
 * box's top corner, then becomes solid dark behind and below the rest of the box
 * rather than bleeding through the translucent panel.
 */
/**
 * Default distance the crisp art slips under the box top before the dark
 * fadeout, in card-height %. Exposed as the `--dreamwell-art-underlap` CSS
 * variable so it can be tuned without touching code (override it on the card or
 * an ancestor). The default matches the text box's top corner-radius depth — the
 * box's `2cqw` radius is ~3% of the 3:2 card's height — so the art reaches just
 * to the end of that corner curve.
 */
const ART_UNDERLAP_DEFAULT_PCT = 0;
/**
 * Card-height % over which the fadeout ramps from clear (at the seam) to the
 * fully opaque dark base. Kept short so the band reaches solid black just below
 * the box's top corner and the panel sits on a clean dark ground.
 */
const ART_FADE_LENGTH_PCT = 7;
/** Blur radius of the continuation, as a fraction of the rendered card width. */
const ART_EXTENSION_BLUR_RATIO = 0.06;
/** Brightness multiplier on the blurred continuation so it never reads lighter than the art. */
const ART_EXTENSION_BLUR_BRIGHTNESS = 0.6;
/** Uniform near-black band color: the base behind the art and the tint gradient's color. */
const ART_BAND_COLOR_CSS = "rgb(16, 16, 19)";
/** Band top (card-height %) used until the box is measured; clamps on the measured value. */
const ART_BAND_DEFAULT_TOP_PCT = 72;
const ART_BAND_MIN_TOP_PCT = 50;
const ART_BAND_MAX_TOP_PCT = 92;

/**
 * Default amount the art is lifted up the frame, as a card-*width* length
 * (`cqw`). Lifting the art moves its content up so the lower part of the scene
 * (otherwise hidden behind the panel) rises into view and the art's bottom edge
 * ends near the text box top, leaving the area behind and below the box as the
 * dark base. Exposed as the `--dreamwell-art-rise` CSS variable so it can be
 * tuned without code (override it on the card or an ancestor). It is a width
 * length so it scales with the card; `14.5cqw` is ~22% of the 3:2 card's height.
 * Larger lifts the art higher (revealing more of its lower content, cropping more
 * off the top); `0cqw` fills the frame full-bleed.
 */
const ART_RISE_DEFAULT_CQW = 14.5;

/**
 * An editor-owned Dreamwell card preview, rendered in landscape (3:2) with the
 * editor's inline-editing affordances over its full-bleed art and floating,
 * frosted panel. The Dreamwell energy orb (the energy flame in **purple**, white
 * number) floats in the top-right corner the way a regular card's energy cost orb
 * does; the `energy-added` value is the orb's number. A bottom-anchored frosted
 * box carries the card name at its head (a larger serif heading) followed by the
 * rules text, sharing the regular card's symbol highlighting. With the box pinned to the
 * bottom edge, the upper band of art reads clearly above it.
 *
 * Sizing is driven by container queries (`container-type: inline-size`), so the
 * card scales to whatever width its container gives it; every length below is in
 * `cqw` (1% of the card's own width) so the layout holds at any size. The corner
 * radius is the one exception: it is set in `%` (`3.6% / 5.4%`) so it resolves
 * against the card's own box, matching the regular card's `CARD_CORNER_RADIUS`
 * (a circular 3.6% of width). A `cqw` radius would resolve against an ancestor
 * container and blow the corner up on wide layouts.
 */
export function DreamwellEditorPreview({
  card,
  slots,
}: {
  card: DreamwellEditorPreviewData;
  slots?: DreamwellEditorPreviewSlots;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  // `DreamwellEditorPreview` renders on editor routes that are not wrapped in an
  // error boundary, so a `card` whose `renderedText` is missing (malformed or
  // stale data) would otherwise take down the whole route with an uncaught
  // throw. Normalize the field once so every consumer below sees a string.
  const renderedText = card.renderedText ?? "";

  // Measure the rendered card width so the energy digit's auto-shrink cap is
  // `widthPx * ENERGY_ORB_RATIO`, exactly as CardView computes it — the digit
  // then renders at its `9cqw` ceiling at any card size.
  const [widthPx, setWidthPx] = useState<number | null>(null);
  useEffect(() => {
    const element = rootRef.current;
    if (element === null) {
      return;
    }
    const update = (): void => {
      const next = element.getBoundingClientRect().width;
      if (Number.isFinite(next) && next > 0) {
        setWidthPx(next);
      }
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => {
        window.removeEventListener("resize", update);
      };
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const energyOrbCapPx = (widthPx ?? 220) * ENERGY_ORB_RATIO;

  // Measure the text box's top as a fraction of card height so the art-extension
  // seam can sit just under its first line, exactly as CardView anchors its band.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxTopFrac, setBoxTopFrac] = useState<number | null>(null);
  useEffect(() => {
    const cardEl = rootRef.current;
    const boxEl = boxRef.current;
    if (cardEl === null || boxEl === null) {
      setBoxTopFrac(null);
      return;
    }
    const measure = (): void => {
      const cardRect = cardEl.getBoundingClientRect();
      if (cardRect.height <= 0) {
        return;
      }
      const boxRect = boxEl.getBoundingClientRect();
      const frac = (boxRect.top - cardRect.top) / cardRect.height;
      setBoxTopFrac((prev) =>
        prev !== null && Math.abs(prev - frac) < 0.002 ? prev : frac,
      );
    };
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
  }, [card.renderedText, card.name]);

  // A Dreamwell card without keyed art (or whose keyed image fails to load)
  // falls back to a deterministic identicon rather than a broken-image glyph.
  // The identicon is a self-contained data URI, so it never fails in turn.
  const [artErrored, setArtErrored] = useState(false);
  // The source aspect drives the art crop's cover math (and is unknown until the
  // image loads), so it is re-measured whenever the displayed image changes.
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  useEffect(() => {
    setArtErrored(false);
    setImageAspect(null);
  }, [card.id, card.imageNumber]);
  const identiconUrl = cardIdenticonUri(
    card.id !== ""
      ? parseDreamwellCardId(card.id)
      : parseDreamwellCardName(card.name),
  );
  const usingAssignedArt = hasAssignedImage(card.imageNumber) && !artErrored;
  const artUrl = usingAssignedArt
    ? cardImageUrl(card.imageNumber)
    : identiconUrl;

  // The editor (which supplies a `rulesText` slot) always shows the frosted box
  // so an empty-rules card still offers a target to start an inline edit; the
  // in-battle card shows it only when there is text.
  const showRulesText = renderedText.trim() !== "" || slots?.rulesText != null;

  // Resolve the band geometry from the measured box top. The crisp art holds
  // down to a seam set below the measured box top; from the seam the blur and
  // tint ramp over `ART_FADE_LENGTH_PCT` to a fully opaque dark base that holds
  // to the bottom edge, so the art turns solid dark just under the text box.
  const bandTopPct =
    boxTopFrac !== null ? boxTopFrac * 100 : ART_BAND_DEFAULT_TOP_PCT;
  const bandTop = Math.min(
    Math.max(bandTopPct, ART_BAND_MIN_TOP_PCT),
    ART_BAND_MAX_TOP_PCT,
  );
  const boxTopCss = `${bandTop.toFixed(2)}%`;
  const seamCss = `calc(${boxTopCss} + ${String(ART_UNDERLAP_DEFAULT_PCT)}%)`;
  const fadeEndCss = `calc(${seamCss} + ${String(ART_FADE_LENGTH_PCT)}%)`;
  const featherMask = `linear-gradient(to bottom, rgba(0,0,0,0) ${seamCss}, rgba(0,0,0,1) ${fadeEndCss}, rgba(0,0,0,1) 100%)`;
  const tintGradient = `linear-gradient(to bottom, rgba(16,16,19,0) ${seamCss}, rgba(16,16,19,1) ${fadeEndCss}, rgba(16,16,19,1) 100%)`;
  const blurPx = Math.max(2, (widthPx ?? 220) * ART_EXTENSION_BLUR_RATIO);

  // Shared placement for the crisp art and its blurred continuation, so the band
  // is a pure defocus of the same pixels. Without a curated crop the image box is
  // grown taller by the watermark fraction and top-anchored, so the source's
  // bottom strip extends past the card's bottom edge and is clipped (the card's
  // `overflow: hidden`). With a crop, the source is panned/zoomed to the curated
  // framing once its aspect is known, clipping the watermark strip in image space
  // so it stays hidden at any pan and zoom.
  // Lift the art up the frame so its lower content
  // rises into view and its bottom edge ends near the text box top. Applied to
  // both art layers (crisp and blurred) so they stay aligned; the watermark stays
  // clipped in image space (`clipPath`) so lifting never reveals it. The fallback
  const riseTranslate = `translateY(-${String(ART_RISE_DEFAULT_CQW)}cqw)`;
  const artImgStyle: CSSProperties =
    card.art !== undefined && imageAspect !== null
      ? (() => {
          const { boxW, boxH, left, top } = dreamwellCoverLayout(
            card.art,
            imageAspect,
          );
          return {
            position: "absolute",
            left: `${(left * 100).toFixed(4)}%`,
            top: `${(top * 100).toFixed(4)}%`,
            width: `${(boxW * 100).toFixed(4)}%`,
            height: `${(boxH * 100).toFixed(4)}%`,
            maxWidth: "none",
            maxHeight: "none",
            objectFit: "cover",
            clipPath: `inset(0 0 ${(ART_SOURCE_BOTTOM_CROP * 100).toFixed(3)}% 0)`,
            transform: riseTranslate,
          } satisfies CSSProperties;
        })()
      : {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: `calc(100% / ${String(1 - ART_SOURCE_BOTTOM_CROP)})`,
          objectFit: "cover",
          objectPosition: "center top",
          // Clip the watermark strip in image space so the lift never brings it
          // into view (the card's own `overflow: hidden` only clips it at the
          // unlifted bottom edge).
          clipPath: `inset(0 0 ${(ART_SOURCE_BOTTOM_CROP * 100).toFixed(3)}% 0)`,
          // Lift the art, and — while a crop is set but the source aspect is still
          // loading — apply the zoom so the first paint is close to the framing.
          transform:
            card.art !== undefined
              ? `${riseTranslate} scale(${String(card.art.scale)})`
              : riseTranslate,
        };

  const handleArtLoad = (event: SyntheticEvent<HTMLImageElement>): void => {
    const img = event.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setImageAspect(img.naturalWidth / img.naturalHeight);
    }
  };

  // The purple accent used on the regular card's Event frame, reused here so the
  // Dreamwell card's frosted panel reads as the same material.
  const panelBackground =
    "linear-gradient(180deg, rgba(40, 16, 56, 0.82) 0%, rgba(19, 8, 30, 0.88) 100%)";
  const panelBorder = "1px solid rgba(178, 132, 226, 0.32)";
  const panelBlur = "blur(var(--cv-textbox-blur)) saturate(1)";

  return (
    <div
      ref={rootRef}
      data-dreamwell-card={card.id}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "3 / 2",
        containerType: "inline-size",
        // Circular corner of 3.6% of the card width, matching the regular card.
        // Set in `%` (not `cqw`) so it resolves against the card's own box; the
        // vertical 5.4% of height equals 3.6% of width on the 3:2 frame.
        borderRadius: "3.6% / 5.4%",
        overflow: "hidden",
        // Plain drop shadow, matching the regular card's default (no colored
        // outer ring); the card edge reads from the soft inner rim below.
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.55)",
        userSelect: "none",
      }}
    >
      {/* Dark base behind the band, so any sliver the extended art does not
          reach matches the band rather than going neutral. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: ART_BAND_COLOR_CSS,
        }}
      />

      {/* Crisp art covering the whole frame (watermark-clipped via the grown,
          top-anchored box). The blurred layer below masks it from the seam down. */}
      <img
        src={artUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={artImgStyle}
        onLoad={handleArtLoad}
        onError={usingAssignedArt ? () => setArtErrored(true) : undefined}
      />

      {/* Blurred continuation: a second copy of the art, blurred and darkened,
          masked so it is absent above the feather zone, ramps in across it, and
          holds opaque from the seam down — the art defocuses into the dark band. */}
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
            filter: `blur(${blurPx.toFixed(2)}px) brightness(${String(ART_EXTENSION_BLUR_BRIGHTNESS)})`,
          }}
        >
          <img
            src={artUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={artImgStyle}
          />
        </div>
      </div>

      {/* Color-matched darkening: a gradient in the band color that ramps in just
          above the seam and grounds the bottom edge nearly solid, so the card
          fades to a dark color behind and below the text box. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: tintGradient }}
      />

      {/* Soft inner rim so the card edge reads against any art, matching the
          regular card treatment. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "3.6% / 5.4%",
          pointerEvents: "none",
          boxShadow:
            "0 0 0 0.2cqw rgba(255, 255, 255, 0.05) inset, 0 0 6cqw 0.6cqw rgba(0, 0, 0, 0.5) inset",
        }}
      />

      {/* Energy-added orb: purple flame, white number, floating in the top-right
          corner over a soft dark backing so it reads on bright art the way the
          regular card's cost orb reads over its name bar. */}
      <div
        style={{
          position: "absolute",
          top: "3cqw",
          right: "3.4cqw",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-22%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(8, 4, 14, 0.55) 0%, rgba(8, 4, 14, 0.4) 42%, rgba(8, 4, 14, 0) 70%)",
          }}
        />
        <div style={{ position: "relative" }}>
          {(() => {
            const energyNode = (
              <CardStatOrb
                variant="dreamwellEnergy"
                value={String(card.energyAdded)}
                sizeVar="9cqw"
                numberSizeVar="6.4cqw"
                numberCapPx={energyOrbCapPx}
                ariaLabel={assertLocalized(
                  `${String(card.energyAdded)} energy added`,
                )}
              />
            );
            return slots?.energy ? slots.energy(energyNode) : energyNode;
          })()}
        </div>
      </div>

      {/* Bottom-anchored box: the card name as a heading, then the rules text. */}
      <div
        ref={boxRef}
        style={{
          position: "absolute",
          left: "3.5cqw",
          right: "3.5cqw",
          bottom: "3.5cqw",
          padding: "2.2cqw 2.8cqw",
          borderRadius: "2cqw",
          background: panelBackground,
          backdropFilter: panelBlur,
          WebkitBackdropFilter: panelBlur,
          border: panelBorder,
          boxShadow:
            "0 0.2cqw 0 rgba(255, 255, 255, 0.07) inset, 0 1.6cqw 4cqw rgba(0, 0, 0, 0.5)",
          color: "#f1f1f0",
          fontFamily: '"Fira Sans Condensed", "Inter", sans-serif',
          fontSize: "2.9cqw",
          lineHeight: 1.2,
          // Pin the alignment so the box never inherits centering from an editor
          // wrapper (e.g. edit mode's clickable `<button>`).
          textAlign: "left",
          textShadow: "0 0.15cqw 0.15cqw rgba(0, 0, 0, 0.55)",
        }}
      >
        <span
          style={{
            display: "block",
            color: "#f6f6f5",
            fontFamily: '"EB Garamond", Georgia, serif',
            fontWeight: 600,
            fontSize: "3.7cqw",
            lineHeight: 1.08,
            letterSpacing: "0.01em",
            marginBottom: showRulesText ? "0.8cqw" : 0,
            textShadow: "0 0.2cqw 0.35cqw rgba(0, 0, 0, 0.7)",
          }}
        >
          {slots?.name ? slots.name(card.name) : card.name}
        </span>
        {showRulesText
          ? (() => {
              const rulesNode =
                renderedText.trim() !== "" ? (
                  <RulesText
                    text={assertLocalized(renderedText)}
                    owner={{ kind: "dreamwellCard", id: card.id }}
                  />
                ) : null;
              return slots?.rulesText ? slots.rulesText(rulesNode) : rulesNode;
            })()
          : null}
      </div>
    </div>
  );
}
