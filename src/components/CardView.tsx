import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { CardData, FrozenCardData, Rarity } from "../types/cards";
import { cardImageUrl } from "../data/card-database";
import { formatTypeLine } from "./card-text";
import { computeCardTextScale } from "./card-display-scale";
import { PipBadge } from "./PipBadge";
import { renderRulesText } from "./RulesText";

const EVENT_CHROME_COLOR = "#c084fc";
const CHARACTER_CHROME_COLOR = "#facc15";

/**
 * Visual treatment for a rarity bucket. A rarity adds an outer "frame layer"
 * on top of the base card chrome — a colored ring stacked as a spread-only
 * `box-shadow` so it composes with the existing 1px border and rounded
 * corners, plus an optional shimmer overlay controlled via a CSS class
 * defined in `index.css`. The shimmer keyframes honor
 * `prefers-reduced-motion`: the sweep is paused and a static highlight
 * gradient stays in place.
 *
 * The map is the single extension point for future rarities (Mythic /
 * Ascendant / …). Add an entry here, and the frame, animation, and
 * accessibility behavior fall out without further branching in render code.
 */
interface RarityStyle {
  /** Outer accent ring color. */
  outlineColor: string;
  /** Soft glow color stacked beneath the outline. */
  glowColor: string;
  /** Width of the accent ring (px). 0 means no rarity frame. */
  outlineWidthPx: number;
  /** Test-id suffix and CSS hook for the shimmer overlay. */
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
  // Bane content (Special rarity) renders with the bane indicator chrome in
  // the deck viewer rather than a rarity frame. No additional outline / glow.
  Special: null,
};

function rarityStyleFor(card: { rarity?: Rarity }): RarityStyle | null {
  if (card.rarity === undefined) {
    return null;
  }
  // A rarity outside RARITY_STYLES (such as the empty rarity carried by some
  // source records) has no rarity frame.
  return RARITY_STYLES[card.rarity] ?? null;
}

/**
 * An inline glyph that surfaces a boolean card attribute on the type/subtype
 * row (e.g. `↯ Explorer`). Chips read as part of the same typographic row as
 * the type label — same font size, same opacity wrapper — and are colored to
 * match the inline rules-text rendering for the same symbol.
 *
 * Adding a new attribute (unstoppable, deployed, ...) is two lines: extend
 * `ATTRIBUTE_CHIPS` with another entry. The render code below picks them up
 * automatically.
 */
interface AttributeChip {
  /** Stable React key + `data-attribute-chip` hook for tests. */
  key: string;
  /** Glyph rendered inline at type-line typography. */
  glyph: string;
  /** Color applied to the glyph; matches the inline symbol color in rules text. */
  color: string;
  /** Accessible label so screen readers announce the attribute. */
  ariaLabel: string;
  /** Predicate that decides whether this chip applies to a card. */
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

function buildAttributeChips(
  card: Pick<CardData, "isFast">,
): AttributeChip[] {
  return ATTRIBUTE_CHIPS.filter((chip) => chip.applies(card));
}

/**
 * Hover tooltip copy for the corner pip badges. Kept short and plain-language
 * so a new player can learn what each pip means after a 1-second hover.
 *
 * Phrasing intentionally mirrors the glossary entries for "Spark" and
 * "Essence"/energy in `src/data/glossary.ts` so a player who hovers a pip
 * sees the same wording they'd see hovering the term inline in rules text.
 */
const ENERGY_PIP_TOOLTIP =
  "Energy cost. Spend this much energy to play the card.";
const SPARK_PIP_TOOLTIP =
  "Spark. A character's combat power — higher spark wins combat.";

function useCardTextScale(large: boolean): {
  cardRef: RefObject<HTMLDivElement | null>;
  textScale: number;
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
  /** When set, tints the card's stat values and rules text in this color. */
  tintColor?: string;
  /** Additional CSS class name for the root element. */
  className?: string;
  /** Use larger text sizes for rules text, name, type line, and stats. */
  large?: boolean;
  /** Hide rules text for dense card surfaces that show identity and stats. */
  hideRulesText?: boolean;
  /**
   * When true, the corner pip tooltips and inline glossary-term popovers are
   * suppressed. Surfaces that show many editable cards at once (the card
   * editor) use this to keep hover behavior calm and non-distracting.
   */
  suppressHoverHelp?: boolean;
  /** Optional editor wrappers for individual rendered card slots. */
  slots?: CardViewSlots;
}

/**
 * Renders a Dreamtides card with rarity-driven chrome.
 */
export function CardView({
  card,
  onClick,
  selected = false,
  selectionColor = "#f97316",
  tintColor,
  className,
  large = false,
  hideRulesText = false,
  suppressHoverHelp = false,
  slots = {},
}: CardViewProps) {
  const [imageError, setImageError] = useState(false);
  const { cardRef, textScale } = useCardTextScale(large);

  useEffect(() => {
    setImageError(false);
  }, [card.cardNumber]);

  const accentColor = CHARACTER_CHROME_COLOR;
  const chromeColor =
    card.cardType === "Event" ? EVENT_CHROME_COLOR : accentColor;
  const borderColor = chromeColor;
  const nameColor = "#f8fafc";
  const typeLine = formatTypeLine(card);
  const rarityStyle = rarityStyleFor(card);
  const attributeChips = buildAttributeChips(card);

  // Compose the box-shadow: base soft chrome glow + optional rarity ring
  // (stacked as a wider outer glow) + selection overlay if set. The rarity
  // ring uses a spread-only box-shadow rather than `outline` so it composes
  // cleanly with the existing border and rounded corners.
  const shadowLayers: string[] = [];
  if (selected) {
    shadowLayers.push(
      `0 0 0 3px ${selectionColor}`,
      `0 0 12px ${selectionColor}`,
    );
  } else {
    shadowLayers.push(`0 0 18px ${chromeColor}26`);
  }
  if (rarityStyle !== null && !selected) {
    shadowLayers.push(
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
  const nameFontSize = (large ? 20 : 14) * textScale;
  const typeFontSize = (large ? 14 : 10) * textScale;
  const rulesFontSize = (large ? 16 : 10) * textScale;
  const fallbackFontSize = 14 * textScale;
  const showRulesText = !hideRulesText && card.renderedText.trim() !== "";
  const slotContext: CardViewSlotContext = {
    card,
    large,
    textScale,
    typeLine,
  };
  const energyNode = (
    <PipBadge
      variant="energy"
      value={card.energyCost !== null ? String(card.energyCost) : "X"}
      size={large ? "md" : "sm"}
      scale={textScale}
      tooltip={suppressHoverHelp ? undefined : ENERGY_PIP_TOOLTIP}
    />
  );
  const nameNode = (
    <h3
      className="font-bold"
      style={{
        color: nameColor,
        display: "-webkit-box",
        fontSize: `${String(nameFontSize)}px`,
        lineHeight: 1.08,
        overflow: "hidden",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: 2,
      }}
    >
      {card.name}
    </h3>
  );
  const typeLineContentNode =
    typeLine !== "" ? <span className="truncate">{typeLine}</span> : null;
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
        className="mt-0.5 flex items-center gap-1 opacity-50"
        style={{
          color: "#e2e8f0",
          fontSize: `${String(typeFontSize)}px`,
          lineHeight: 1.1,
          minHeight: `${String(typeFontSize * 1.1)}px`,
          overflow: "hidden",
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
      className="mt-1 min-h-0 flex-1 overflow-y-auto opacity-80"
      style={{
        color: tintColor ?? "#e2e8f0",
        fontSize: `${String(rulesFontSize)}px`,
        lineHeight: large ? 1.35 : 1.18,
      }}
    >
      {renderRulesText(card.renderedText, {
        pipScale: textScale,
        disableGlossary: suppressHoverHelp,
      })}
    </div>
  ) : (
    <div aria-hidden="true" className="min-h-0 flex-1" />
  );
  const sparkBadgeNode =
    card.spark !== null ? (
      <PipBadge
        variant="spark"
        value={String(card.spark)}
        size={large ? "md" : "sm"}
        scale={textScale}
        tooltip={suppressHoverHelp ? undefined : SPARK_PIP_TOOLTIP}
      />
    ) : null;
  // The spark corner container is owned by CardView (like the energy corner)
  // so the badge — and any editor input a slot swaps in — stays pinned to the
  // bottom-right. Slots receive the bare badge as their default node.
  const renderedSparkContent = slots.spark?.(slotContext, sparkBadgeNode) ?? sparkBadgeNode;
  const hasSparkContent =
    renderedSparkContent !== null &&
    renderedSparkContent !== undefined &&
    renderedSparkContent !== false;

  return (
    <div
      ref={cardRef}
      className={`relative flex flex-col overflow-hidden rounded-lg transition-transform duration-200${isInteractive ? " cursor-pointer hover:scale-[1.02]" : ""}${rarityClass}${className ? ` ${className}` : ""}`}
      data-card-text-scale={textScale.toFixed(2)}
      data-rarity={rarityAttr}
      style={{
        aspectRatio: "2 / 3",
        background: "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
        border: `1px solid ${borderColor}`,
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
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0%, ${chromeColor} 50%, rgba(255, 255, 255, 0.08) 100%)`,
          opacity: 0.8,
        }}
      />

      {/*
        Rarity shimmer overlay. Rendered only when the card has a rarity
        treatment that defines a CSS hook; the keyframe animation lives in
        `index.css` so `prefers-reduced-motion` can pause the sweep while
        keeping the static highlight gradient visible. Pointer-events-none
        keeps the overlay transparent to clicks.
      */}
      {rarityStyle?.cssClass !== undefined && rarityStyle?.cssClass !== null && (
        <div
          data-testid="card-rarity-shimmer"
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-lg ${rarityStyle.cssClass}__shimmer`}
        />
      )}

      {/* Energy cost badge */}
      <div
        className={`absolute ${large ? "top-2 left-2" : "top-1.5 left-1.5"} z-10 flex flex-col items-center gap-1`}
      >
        {slots.energy?.(slotContext, energyNode) ?? energyNode}
      </div>

      {/* Card art area */}
      <div className="relative w-full" style={{ height: "45%" }}>
        {!imageError ? (
          <img
            src={cardImageUrl(card.cardNumber)}
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
            style={{
              background: `linear-gradient(135deg, ${accentColor}24, rgba(255, 255, 255, 0.05))`,
            }}
          >
            <span
              className="text-center font-medium opacity-60"
              style={{
                color: nameColor,
                fontSize: `${String(fallbackFontSize)}px`,
                lineHeight: 1.15,
              }}
            >
              {card.name}
            </span>
          </div>
        )}
        {/* Gradient overlay at bottom of art */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-4"
          style={{
            background: "linear-gradient(transparent, #1a1025)",
          }}
        />
      </div>

      {/* Card info area */}
      <div
        className={`flex min-h-0 flex-1 flex-col ${large ? "px-3 pt-2 pb-2" : "px-2 pt-1 pb-1.5"}`}
      >
        {slots.name?.(slotContext, nameNode) ?? nameNode}
        {slots.typeLine?.(slotContext, typeLineNode) ?? typeLineNode}

        {/* Rules text */}
        {slots.rulesText?.(slotContext, rulesTextNode) ?? rulesTextNode}

        {/* Spark badge for Characters */}
        {hasSparkContent ? (
          <div className="mt-auto flex items-center justify-end pt-0.5">
            {renderedSparkContent}
          </div>
        ) : null}
      </div>

      {/* Bottom accent */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{ background: borderColor }}
      />
    </div>
  );
}
