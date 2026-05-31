import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import type { CardData, FrozenCardData, Rarity } from "../types/cards";
import {
  cardIdenticonUri,
  cardImageUrl,
  hasAssignedImage,
} from "../data/card-database";
import { formatTypeLine } from "./card-text";
import { computeCardTextScale } from "./card-display-scale";
import {
  CARD_ART_ASPECT_RATIO,
  CARD_FRAME_ASPECT_RATIO,
  cardFrameUrl,
} from "./card-assets";
import { CardStatOrb } from "./CardStatOrb";
import { useFitText } from "./useFitText";
import { renderRulesText } from "./RulesText";

/**
 * Default chrome accent used for the selection ring fallback. The card's type
 * is conveyed by the parchment frame art (a dark drape for characters, a
 * purple drape for events) rather than a colored border.
 */
const SELECTION_DEFAULT_COLOR = "#f97316";

/** Card name / type / rules text colors and fonts, as CSS-var references so the
 * `.card-view` rule in `index.css` is the single place these are tuned. */
const NAME_COLOR = "var(--cv-name-color)";
const NAME_FONT_FAMILY = "var(--cv-name-font-family)";
const RULES_COLOR = "var(--cv-rules-color)";
const RULES_FONT_FAMILY = "var(--cv-rules-font-family)";

/**
 * Upper bound for the font auto-shrink search, as a fraction of the rendered
 * card width. The real font ceiling is the `--cv-*-font-max` CSS var, applied
 * via `min()`; this cap only needs to sit above every ceiling so that short
 * text settles on the var rather than being clamped here.
 */
const FIT_SEARCH_CAP_RATIO = 0.22;

/**
 * Orb diameters as a fraction of the rendered card width, used to size the
 * digit auto-shrink search. The rendered orb size is the `--cv-*-orb-size` CSS
 * var; these mirror its defaults.
 */
const ENERGY_ORB_RATIO = 0.18;
const SPARK_ORB_RATIO = 0.2;

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
 * An inline glyph that surfaces a boolean card attribute on the type/subtype
 * row (e.g. `↯ Explorer`). Chips read as part of the same typographic row as
 * the type label and are colored to match the inline rules-text rendering for
 * the same symbol.
 */
interface AttributeChip {
  key: string;
  glyph: string;
  color: string;
  ariaLabel: string;
  applies(card: Pick<CardData, "isFast">): boolean;
}

const ATTRIBUTE_CHIPS: readonly AttributeChip[] = [
  {
    key: "fast",
    glyph: "↯",
    color: "#facc15",
    ariaLabel: "fast",
    applies: (card) => card.isFast,
  },
];

function buildAttributeChips(card: Pick<CardData, "isFast">): AttributeChip[] {
  return ATTRIBUTE_CHIPS.filter((chip) => chip.applies(card));
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
      const nextWidth = measuredElement.getBoundingClientRect().width;
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
  typeLine?: (context: CardViewSlotContext, defaultNode: ReactNode) => ReactNode;
  rulesText?: (context: CardViewSlotContext, defaultNode: ReactNode) => ReactNode;
  spark?: (context: CardViewSlotContext, defaultNode: ReactNode) => ReactNode;
}

/** Props for the shared CardView component. */
export interface CardViewProps {
  card: CardData | FrozenCardData;
  onClick?: () => void;
  selected?: boolean;
  selectionColor?: string;
  /** When set, tints the card's rules text in this color. */
  tintColor?: string;
  /** Additional CSS class name for the root element. */
  className?: string;
  /** Use larger text sizes for rules text, name, type line, and stats. */
  large?: boolean;
  /** Hide rules text for dense card surfaces that show identity and stats. */
  hideRulesText?: boolean;
  /**
   * When true, the corner stat tooltips and inline glossary-term popovers are
   * suppressed. Surfaces that show many cards at once (the card editor) use
   * this to keep hover behavior calm and non-distracting.
   */
  suppressHoverHelp?: boolean;
  /** Optional editor wrappers for individual rendered card slots. */
  slots?: CardViewSlots;
}

/**
 * Renders a Dreamtides card: full-width art at the native 0.87 art aspect
 * ratio anchored to the top, a parchment frame overlay across the lower
 * portion carrying the name / type / rules text, and glowing energy (top-left)
 * and spark (bottom-right) stat orbs. The card box itself stays 2:3 portrait.
 */
export function CardView({
  card,
  onClick,
  selected = false,
  selectionColor = SELECTION_DEFAULT_COLOR,
  tintColor,
  className,
  large = false,
  hideRulesText = false,
  suppressHoverHelp = false,
  slots = {},
}: CardViewProps) {
  const [imageError, setImageError] = useState(false);
  const { cardRef, textScale, widthPx } = useCardMetrics(large);

  useEffect(() => {
    setImageError(false);
  }, [card.imageNumber]);

  const hasImage = hasAssignedImage(card.imageNumber);
  const identiconUri = hasImage
    ? null
    : cardIdenticonUri(card.id !== "" ? card.id : card.name);

  const typeLine = formatTypeLine(card);
  const rarityStyle = rarityStyleFor(card);
  const attributeChips = buildAttributeChips(card);

  // Search caps for the auto-shrink fits. The displayed size is the smaller of
  // the CSS-var ceiling and the fitted size (see `min(...)` below), so these
  // caps only bound the search.
  const energyOrbCapPx = widthPx * ENERGY_ORB_RATIO;
  const sparkOrbCapPx = widthPx * SPARK_ORB_RATIO;
  const fitCapPx = widthPx * FIT_SEARCH_CAP_RATIO;

  const nameFit = useFitText(fitCapPx, 7, [card.name, fitCapPx]);
  const typeFit = useFitText(fitCapPx, 6, [typeLine, fitCapPx]);
  const rulesFit = useFitText(fitCapPx, 6, [card.renderedText, fitCapPx]);

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

  const energyNode = (
    <CardStatOrb
      variant="energy"
      value={card.energyCost !== null ? String(card.energyCost) : "X"}
      sizeVar="var(--cv-energy-orb-size)"
      numberCapPx={energyOrbCapPx}
      tooltip={suppressHoverHelp ? undefined : ENERGY_PIP_TOOLTIP}
    />
  );

  const nameNode = (
    <div
      ref={nameFit.ref}
      className="font-bold"
      style={{
        flex: "1 1 0",
        minWidth: 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
        color: NAME_COLOR,
        fontFamily: NAME_FONT_FAMILY,
        fontSize: `min(var(--cv-name-font-max), ${String(nameFit.fontSize)}px)`,
        lineHeight: 1,
      }}
    >
      {card.name}
    </div>
  );

  const typeLineContentNode =
    typeLine !== "" ? <span>{typeLine}</span> : null;
  const renderedTypeLineContent =
    slots.typeLineContent?.(slotContext, typeLineContentNode) ??
    typeLineContentNode;
  const hasTypeLineContent =
    renderedTypeLineContent !== null &&
    renderedTypeLineContent !== undefined &&
    renderedTypeLineContent !== false;
  const typeLineNode =
    hasTypeLineContent || attributeChips.length > 0 ? (
      <div
        ref={typeFit.ref}
        data-testid="card-type-line"
        style={{
          flex: "0 1 auto",
          minWidth: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textAlign: "right",
          color: NAME_COLOR,
          fontFamily: NAME_FONT_FAMILY,
          fontSize: `min(var(--cv-type-font-max), ${String(typeFit.fontSize)}px)`,
          lineHeight: 1,
        }}
      >
        {attributeChips.map((chip) => (
          <span
            key={chip.key}
            data-attribute-chip={chip.key}
            aria-label={chip.ariaLabel}
            style={{ color: chip.color }}
          >
            {chip.glyph}
          </span>
        ))}
        {renderedTypeLineContent}
      </div>
    ) : null;

  const rulesTextNode = showRulesText ? (
    <div
      ref={rulesFit.ref}
      style={{
        position: "absolute",
        left: "var(--cv-rules-side-pad)",
        right: "var(--cv-rules-side-pad)",
        top: "var(--cv-rules-top)",
        bottom: "var(--cv-rules-bottom)",
        overflow: "hidden",
        textAlign: "left",
        color: tintColor ?? RULES_COLOR,
        fontFamily: RULES_FONT_FAMILY,
        fontSize: `min(var(--cv-rules-font-max), ${String(rulesFit.fontSize)}px)`,
        lineHeight: "var(--cv-rules-line-height)",
      }}
    >
      {renderRulesText(card.renderedText, {
        pipScale: textScale,
        disableGlossary: suppressHoverHelp,
      })}
    </div>
  ) : null;

  const sparkOrbNode =
    card.spark !== null ? (
      <CardStatOrb
        variant="spark"
        value={String(card.spark)}
        sizeVar="var(--cv-spark-orb-size)"
        numberCapPx={sparkOrbCapPx}
        tooltip={suppressHoverHelp ? undefined : SPARK_PIP_TOOLTIP}
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

  return (
    <div
      ref={cardRef}
      className={`card-view relative overflow-hidden rounded-lg transition-transform duration-200${large ? " card-view--large" : ""}${isInteractive ? " cursor-pointer hover:scale-[1.02]" : ""}${rarityClass}${className ? ` ${className}` : ""}`}
      data-card-text-scale={textScale.toFixed(2)}
      data-rarity={rarityAttr}
      style={{
        aspectRatio: "2 / 3",
        boxShadow: shadowLayers.join(", "),
      }}
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
      {/* Card art — full width at the native art aspect ratio, anchored top. */}
      <div
        className="absolute inset-x-0 top-0"
        style={{ aspectRatio: String(CARD_ART_ASPECT_RATIO) }}
      >
        {identiconUri !== null ? (
          <img
            src={identiconUri}
            alt={`${card.name} identicon`}
            className="h-full w-full object-contain"
            draggable={false}
            loading="lazy"
          />
        ) : !imageError ? (
          <img
            src={cardImageUrl(card.imageNumber)}
            alt={card.name}
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => {
              setImageError(true);
            }}
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center p-2"
            style={{ background: "rgba(255, 255, 255, 0.04)" }}
          >
            <span
              className="text-center font-medium opacity-70"
              style={{
                color: NAME_COLOR,
                fontFamily: NAME_FONT_FAMILY,
                fontSize: "var(--cv-name-font-max)",
                lineHeight: 1.15,
              }}
            >
              {card.name}
            </span>
          </div>
        )}
      </div>

      {/*
        Rarity shimmer overlay. Rendered only when the card has a rarity
        treatment that defines a CSS hook; the keyframe animation lives in
        `index.css` so `prefers-reduced-motion` can pause the sweep while
        keeping the static highlight gradient visible.
      */}
      {rarityStyle?.cssClass !== undefined && rarityStyle?.cssClass !== null && (
        <div
          data-testid="card-rarity-shimmer"
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-lg ${rarityStyle.cssClass}__shimmer`}
        />
      )}

      {/* Parchment frame overlay across the lower portion of the card. */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          aspectRatio: String(CARD_FRAME_ASPECT_RATIO),
          backgroundImage: `url(${cardFrameUrl(card.cardType)})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/*
          Name + type, baseline-aligned on the dark drape band. Anchored by
          its bottom edge (just above the parchment) rather than a top/height
          box, so the shared baseline stays pinned to the drape regardless of
          how far either label auto-shrinks. `line-height: 1` keeps glyphs
          within the row so descenders are not clipped by `overflow: hidden`.
        */}
        <div
          style={
            {
              position: "absolute",
              left: "var(--cv-name-side-pad)",
              right: "var(--cv-name-side-pad)",
              bottom: "var(--cv-name-row-bottom)",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "var(--cv-name-type-gap)",
              lineHeight: 1,
              overflow: "hidden",
            } satisfies CSSProperties
          }
        >
          {renderedNameNode}
          {renderedTypeLineNode}
        </div>

        {/* Rules text confined to the parchment region. */}
        {renderedRulesNode}
      </div>

      {/* Energy cost orb (top-left). */}
      <div
        className="absolute z-10"
        style={{ top: "var(--cv-corner-inset)", left: "var(--cv-corner-inset)" }}
      >
        {slots.energy?.(slotContext, energyNode) ?? energyNode}
      </div>

      {/* Spark orb (bottom-right) for characters. */}
      {hasSparkContent ? (
        <div
          className="absolute z-10"
          style={{
            bottom: "var(--cv-corner-inset)",
            right: "var(--cv-spark-corner-inset-x)",
          }}
        >
          {renderedSparkContent}
        </div>
      ) : null}
    </div>
  );
}
