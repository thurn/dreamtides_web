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
import { CardStatOrb } from "./CardStatOrb";
import { renderRulesText } from "./RulesText";

/**
 * Default chrome accent used for the selection ring fallback. The card's type
 * is conveyed by the text-box accent (neutral black chrome for characters, a
 * purple accent for events) rather than a colored border.
 */
const SELECTION_DEFAULT_COLOR = "#f97316";

/** Card name / type / rules text colors and fonts, as CSS-var references so the
 * `.card-view` rule in `index.css` is the single place these are tuned. */
const NAME_COLOR = "var(--cv-name-color)";
const TYPE_COLOR = "var(--cv-type-color)";
const NAME_FONT_FAMILY = "var(--cv-name-font-family)";
const RULES_COLOR = "var(--cv-rules-color)";
const RULES_FONT_FAMILY = "var(--cv-rules-font-family)";

/**
 * Orb diameters as a fraction of the rendered card width, used to size the
 * digit auto-shrink search. The rendered orb size is the `--cv-*-orb-size` CSS
 * var; these mirror its defaults.
 */
const ENERGY_ORB_RATIO = 0.156;
const SPARK_ORB_RATIO = 0.132;

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
 * Renders a Dreamtides card: full-bleed art covering the whole 2:3 portrait
 * frame, with all chrome floating over it as translucent, blurred elements.
 * The energy cost and spark orbs share a column in the top-left corner; a
 * single bottom-anchored text box carries a name / type title band over the
 * rules body and auto-sizes to the amount of rules text. Top and bottom
 * gradient scrims keep the chrome legible over any illustration.
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
      style={{
        flex: "1 1 0",
        minWidth: 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        color: NAME_COLOR,
        fontFamily: NAME_FONT_FAMILY,
        fontWeight: 600,
        letterSpacing: "0.01em",
        textShadow: "0 1px 2px rgba(0, 0, 0, 0.7)",
        fontSize: "var(--cv-name-font-size)",
        lineHeight: 1.1,
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
        data-testid="card-type-line"
        style={{
          flex: "0 1 auto",
          minWidth: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textAlign: "right",
          color: TYPE_COLOR,
          fontFamily: NAME_FONT_FAMILY,
          fontStyle: "italic",
          fontWeight: 500,
          letterSpacing: "0.01em",
          textShadow: "0 1px 1px rgba(0, 0, 0, 0.65)",
          fontSize: "var(--cv-type-font-size)",
          lineHeight: 1.1,
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
      style={{
        padding: "var(--cv-rules-pad)",
        textAlign: "left",
        color: tintColor ?? RULES_COLOR,
        fontFamily: RULES_FONT_FAMILY,
        fontSize: "var(--cv-rules-font-size)",
        lineHeight: "var(--cv-rules-line-height)",
        textShadow: "0 1px 1px rgba(0, 0, 0, 0.55)",
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
      data-card-type={card.cardType}
      style={{
        aspectRatio: "2 / 3",
        borderRadius: "var(--cv-radius)",
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
        <img
          src={cardImageUrl(card.imageNumber)}
          alt={card.name}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "center 46%" }}
          draggable={false}
          onError={() => {
            setImageError(true);
          }}
          loading="lazy"
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

      {/* Legibility scrims: behind the orb column (top) and text box (bottom). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: "var(--cv-vignette-top-height)",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.26) 52%, rgba(0,0,0,0) 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: "var(--cv-vignette-bottom-height)",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.48) 42%, rgba(0,0,0,0.08) 80%, rgba(0,0,0,0) 100%)",
        }}
      />

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
        Bottom-anchored text box: a name / type title band over the rules body.
        Height is automatic so the box grows or shrinks with the rules text,
        capped by `--cv-textbox-max-height`. The blur + translucent gradient
        let the art read through while keeping text legible.
      */}
      <div
        style={
          {
            position: "absolute",
            left: "var(--cv-textbox-inset)",
            right: "var(--cv-textbox-inset)",
            bottom: "var(--cv-textbox-inset)",
            zIndex: 4,
            maxHeight: "var(--cv-textbox-max-height)",
            overflow: "hidden",
            borderRadius: "var(--cv-textbox-radius)",
            background: "var(--cv-textbox-bg)",
            backdropFilter: "blur(var(--cv-textbox-blur)) saturate(1)",
            WebkitBackdropFilter: "blur(var(--cv-textbox-blur)) saturate(1)",
            border: "1px solid var(--cv-textbox-border)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.07) inset, 0 12px 28px rgba(0,0,0,0.5)",
          } satisfies CSSProperties
        }
      >
        {/* Title band: name (left) and type (right) share one baseline. */}
        <div
          style={
            {
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "var(--cv-name-type-gap)",
              padding: "var(--cv-titleband-pad)",
              background: "var(--cv-titleband-bg)",
              borderBottom: "1px solid var(--cv-titleband-border)",
              boxShadow: "0 1px 0 rgba(255,255,255,0.06) inset",
              overflow: "hidden",
            } satisfies CSSProperties
          }
        >
          {renderedNameNode}
          {renderedTypeLineNode}
        </div>

        {/* Rules body. */}
        {renderedRulesNode}
      </div>

      {/* Cost / spark orb column, top-left (spark stacked beneath the cost). */}
      <div
        className="absolute z-10"
        style={{
          top: "var(--cv-energy-orb-top)",
          left: "var(--cv-energy-orb-left)",
        }}
      >
        {slots.energy?.(slotContext, energyNode) ?? energyNode}
      </div>

      {hasSparkContent ? (
        <div
          className="absolute z-10"
          style={{
            top: "var(--cv-spark-orb-top)",
            left: "var(--cv-spark-orb-left)",
          }}
        >
          {renderedSparkContent}
        </div>
      ) : null}
    </div>
  );
}
