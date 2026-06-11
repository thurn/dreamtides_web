import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  cardImageUrl,
  cardIdenticonUri,
  hasAssignedImage,
} from "../data/card-database";
import { CardStatOrb } from "./CardStatOrb";
import { renderRulesText } from "./RulesText";
import { useCardTermPopover } from "./useCardTermPopover";

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
export interface DreamwellCardViewData {
  id: string;
  name: string;
  renderedText: string;
  energyAdded: number;
  imageNumber: number;
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
 * A Dreamwell card, rendered in landscape (3:2) but wearing the same chrome as a
 * regular {@link import("./CardView").CardView}: full-bleed art under a floating,
 * frosted panel. The Dreamwell energy orb (the energy flame in **purple**, white
 * number) floats in the top-right corner the way a regular card's energy cost orb
 * does; the `energy-added` value is the orb's number. A bottom-anchored frosted
 * box carries the card name at its head (a larger serif heading) followed by the
 * rules text, sharing the regular card's symbol highlighting and on-hover
 * glossary panel (see {@link useCardTermPopover}). With the box pinned to the
 * bottom edge, the upper band of art reads clearly above it.
 *
 * Sizing is driven by container queries (`container-type: inline-size`), so the
 * card scales to whatever width its container gives it; every length below is in
 * `cqw` (1% of the card's own width) so the layout holds at any size. The corner
 * radius pairs a horizontal `cqw` with a larger vertical `cqw` so the rendered
 * corner stays uniform on the 3:2 frame (the vertical component is the same
 * fraction of height as the horizontal is of width).
 */
export function DreamwellCardView({
  card,
  className,
  style,
}: {
  card: DreamwellCardViewData;
  className?: string;
  style?: CSSProperties;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { triggerHandlers, popoverPortal } = useCardTermPopover({
    anchorRef: rootRef,
    text: card.renderedText,
    enabled: true,
  });

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

  const artUrl = hasAssignedImage(card.imageNumber)
    ? cardImageUrl(card.imageNumber)
    : cardIdenticonUri(card.id);

  const showRulesText = card.renderedText.trim() !== "";

  // The purple accent used on the regular card's Event frame, reused here so the
  // Dreamwell card's frosted panel reads as the same material.
  const panelBackground =
    "linear-gradient(180deg, rgba(40, 16, 56, 0.82) 0%, rgba(19, 8, 30, 0.88) 100%)";
  const panelBorder = "1px solid rgba(178, 132, 226, 0.32)";
  const panelBlur = "blur(11px) saturate(1)";

  return (
    <div
      ref={rootRef}
      data-dreamwell-card={card.id}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "3 / 2",
        containerType: "inline-size",
        // Horizontal 3.2% of width, vertical 4.8% of width (= 3.2% of height on
        // a 3:2 frame), so the rendered corner is a uniform 3.2% on every side.
        borderRadius: "3.2cqw / 4.8cqw",
        overflow: "hidden",
        boxShadow:
          "0 0.8cqw 2.4cqw rgba(0, 0, 0, 0.55), 0 0 0 0.18cqw rgba(168, 85, 247, 0.5)",
        userSelect: "none",
        ...style,
      }}
      {...triggerHandlers}
    >
      {/* Card art covers the whole frame. The image box is grown taller by the
          watermark fraction and top-anchored, so the source's bottom strip
          extends past the card's bottom edge and is clipped (the card's
          `overflow: hidden`), matching how the regular card hides it. */}
      <img
        src={artUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: `calc(100% / ${String(1 - ART_SOURCE_BOTTOM_CROP)})`,
          objectFit: "cover",
          objectPosition: "center top",
        }}
      />

      {/* A gentle bottom-up scrim keeps the text box legible over bright art
          without darkening the upper band the art is read from. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(10, 6, 18, 0.55) 0%, rgba(10, 6, 18, 0.18) 28%, rgba(10, 6, 18, 0) 48%)",
        }}
      />

      {/* Soft inner rim so the card edge reads against any art, matching the
          regular card treatment. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "3.2cqw / 4.8cqw",
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
          <CardStatOrb
            variant="dreamwellEnergy"
            value={String(card.energyAdded)}
            sizeVar="12cqw"
            numberSizeVar="9cqw"
            numberCapPx={energyOrbCapPx}
            ariaLabel={`${String(card.energyAdded)} energy added`}
          />
        </div>
      </div>

      {/* Bottom-anchored box: the card name as a heading, then the rules text. */}
      <div
        style={{
          position: "absolute",
          left: "3.5cqw",
          right: "3.5cqw",
          bottom: "3.5cqw",
          padding: "2.8cqw 3.2cqw",
          borderRadius: "2cqw",
          background: panelBackground,
          backdropFilter: panelBlur,
          WebkitBackdropFilter: panelBlur,
          border: panelBorder,
          boxShadow:
            "0 0.2cqw 0 rgba(255, 255, 255, 0.07) inset, 0 1.6cqw 4cqw rgba(0, 0, 0, 0.5)",
          color: "#f1f1f0",
          fontFamily: '"Fira Sans Condensed", "Inter", sans-serif',
          fontSize: "3.3cqw",
          lineHeight: 1.2,
          textShadow: "0 0.15cqw 0.15cqw rgba(0, 0, 0, 0.55)",
        }}
      >
        <span
          style={{
            display: "block",
            color: "#f6f6f5",
            fontFamily: '"EB Garamond", Georgia, serif',
            fontWeight: 600,
            fontSize: "5cqw",
            lineHeight: 1.08,
            letterSpacing: "0.01em",
            marginBottom: showRulesText ? "1.2cqw" : 0,
            textShadow: "0 0.2cqw 0.35cqw rgba(0, 0, 0, 0.7)",
          }}
        >
          {card.name}
        </span>
        {showRulesText ? renderRulesText(card.renderedText) : null}
      </div>
      {popoverPortal}
    </div>
  );
}
