// CardGalleryPanel — the shared glass card-browser surface.
//
// A card-gallery surface is the recurring "title + subtitle, trailing action,
// scrolling GameCard grid" pattern used by the starting-deck reveal and card
// selection sites. The component owns one rounded glass frame, the header row,
// body scroll, and fixed card grid modes; callers wrap it for placement and
// provide resolved card models keyed by deck entry id / UUID.

import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { CardData } from "../../../types/cards";
import type { CardTransfigurationDisplay } from "../../../runtime/transfiguration-display";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import type { TangoColor } from "../../primitives/color";
import type { Glyph } from "../../primitives/glyph";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { GlassButton } from "../controls/GlassButton";
import { IconButton, type IconButtonSize } from "../controls/IconButton";
import { GameCard } from "./CardView";

/** One resolved card in a {@link CardGalleryPanel}. */
export interface CardGalleryCardView {
  /** Stable id for the card tile; deck surfaces use the deck-entry id. */
  entryId: string;
  /** The fully resolved card data to paint. */
  card: CardData;
  /** Optional test id on the tile wrapper. */
  testId?: string;
  /** Display descriptor painting the card as transfigured, when it is one. */
  transfiguration?: CardTransfigurationDisplay;
  /** Draw the card's selection ring. */
  selected?: boolean;
  /** Detach card interaction and dim the tile. */
  disabled?: boolean;
  /** Selection-ring color. Defaults to `selected`. */
  selectionColor?: TangoColor;
  /** Optional danger outline for always-free purge targets such as Banes. */
  emphasis?: "danger";
}

/** The trailing header action rendered by a {@link CardGalleryPanel}. */
export type CardGalleryAccessory =
  | {
      kind: "glassButton";
      label: string;
      onPress: () => void;
      glyph?: Glyph;
      disabled?: boolean;
      /** Optional inline essence cost rendered after the label. */
      cost?: number | null;
      /** A `data-testid` for selecting the button in tests. */
      testId?: string;
    }
  | {
      kind: "iconButton";
      glyph: Glyph;
      label: string;
      onPress: () => void;
      disabled?: boolean;
      size?: IconButtonSize;
      /** A `data-testid` for selecting the disc in tests. */
      testId?: string;
    };

/** The grid algorithm for the card body. */
export type CardGalleryColumns = "auto" | "four" | "five";

/** The `auto` grid's minimum card column width. */
export type CardGalleryCardSize = "standard" | "roomy";

export interface CardGalleryPanelProps {
  /** Header title, rendered as an `<h2>`. */
  title: string;
  /** Optional intro line under the title. */
  subtitle?: string;
  /** Optional trailing header action. */
  rightAccessory?: CardGalleryAccessory;
  /** Resolved cards rendered in order. */
  cards: readonly CardGalleryCardView[];
  /** Empty-state copy shown when `cards` is empty. */
  emptyLabel?: string;
  /** Card grid mode. Defaults to `auto`. */
  columns?: CardGalleryColumns;
  /** Minimum auto-grid card width. Defaults to `standard`. */
  cardSize?: CardGalleryCardSize;
  /** Test id for the panel root. */
  testId?: string;
  /**
   * When a screen-cutout box is known, float the accessory beside the device
   * island instead of sharing the header row.
   */
  cutoutAwareAccessory?: boolean;
  /** Fires when an enabled card tile is activated. */
  onCardPress?: (entryId: string) => void;
}

const STANDARD_CARD_MIN_WIDTH_PX = 140;
const ROOMY_CARD_MIN_WIDTH_PX = 208;
const FLOATING_ACCESSORY_PX = 48;

function accessoryNode(accessory: CardGalleryAccessory): ReactElement {
  if (accessory.kind === "glassButton") {
    return (
      <GlassButton
        label={accessory.label}
        glyph={accessory.glyph}
        disabled={accessory.disabled}
        cost={accessory.cost}
        testId={accessory.testId}
        onPress={accessory.onPress}
      />
    );
  }
  return (
    <IconButton
      glyph={accessory.glyph}
      size={accessory.size}
      label={accessory.label}
      disabled={accessory.disabled}
      testId={accessory.testId}
      onPress={accessory.onPress}
    />
  );
}

function gridTemplate(
  columns: CardGalleryColumns,
  cardSize: CardGalleryCardSize,
): string {
  if (columns === "four") {
    return "repeat(4, minmax(0, 1fr))";
  }
  if (columns === "five") {
    return "repeat(5, minmax(0, 1fr))";
  }
  const minWidth =
    cardSize === "roomy" ? ROOMY_CARD_MIN_WIDTH_PX : STANDARD_CARD_MIN_WIDTH_PX;
  return `repeat(auto-fill, minmax(${String(minWidth)}px, 1fr))`;
}

/** Shared glass card-gallery surface with a header accessory and scrolling grid. */
export function CardGalleryPanel({
  title,
  subtitle,
  rightAccessory,
  cards,
  emptyLabel = "No cards.",
  columns = "auto",
  cardSize = "standard",
  testId,
  cutoutAwareAccessory = false,
  onCardPress,
}: CardGalleryPanelProps): ReactElement {
  const [besideCutout, setBesideCutout] = useState(false);
  useEffect(() => {
    setBesideCutout(cutoutAwareAccessory && hasInjectedDisplayCutout());
  }, [cutoutAwareAccessory]);

  const accessory =
    rightAccessory !== undefined ? accessoryNode(rightAccessory) : null;

  return (
    <section
      data-testid={testId}
      style={{
        ...glassSurfaceStyle(),
        background: `${token("--glass-sheen")}, ${token("--glass-fill-popover")}`,
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        pointerEvents: "auto",
      }}
    >
      {besideCutout && accessory !== null && (
        <div
          style={{
            position: "absolute",
            top: `calc(var(--display-cutout-top) + (var(--display-cutout-height) - ${String(
              FLOATING_ACCESSORY_PX,
            )}px) / 2)`,
            right: token("--gutter"),
            zIndex: 1,
          }}
        >
          {accessory}
        </div>
      )}
      <header
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: token("--space-4"),
          borderBottom: `1px solid ${token("--border-strong")}`,
          padding: token("--space-6"),
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: token("--space-1"),
            minWidth: 0,
          }}
        >
          <h2
            style={{
              margin: 0,
              font: token("--t-title-sm"),
              color: token("--text-on-glass"),
              textAlign: "left",
              letterSpacing: 0,
            }}
          >
            {title}
          </h2>
          {subtitle !== undefined && (
            <p
              style={{
                margin: 0,
                font: token("--t-body"),
                color: token("--text-on-glass-muted"),
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {!besideCutout && accessory}
      </header>
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: token("--space-5"),
        }}
      >
        {cards.length === 0 ? (
          <div
            style={{
              display: "grid",
              minHeight: "100%",
              placeItems: "center",
            }}
          >
            <p
              style={{
                margin: 0,
                font: token("--t-body"),
                color: token("--text-on-glass"),
              }}
            >
              {emptyLabel}
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridTemplate(columns, cardSize),
              gap: token("--space-4"),
            }}
          >
            {cards.map((card) => {
              const disabled = card.disabled === true;
              const interactive = onCardPress !== undefined;
              const tile = (
                <GameCard
                  card={card.card}
                  transfiguration={card.transfiguration}
                  selected={card.selected}
                  selectionColor={card.selectionColor}
                  termDefinitions={interactive ? "none" : "card"}
                />
              );
              const tileStyle: CSSProperties = {
                position: "relative",
                display: "block",
                width: "100%",
                borderRadius: token("--radius-card"),
                opacity: disabled ? 0.42 : 1,
                boxShadow:
                  card.emphasis === "danger"
                    ? `0 0 0 2px ${token("--danger")}`
                    : "none",
                WebkitTouchCallout: "none",
                WebkitUserSelect: "none",
                userSelect: "none",
                touchAction: "manipulation",
              };

              if (!interactive) {
                return (
                  <div
                    key={card.entryId}
                    data-testid={card.testId}
                    style={tileStyle}
                  >
                    {tile}
                  </div>
                );
              }

              return (
                <Pressable
                  key={card.entryId}
                  as="button"
                  aria-label={card.card.name}
                  aria-pressed={card.selected}
                  disabled={disabled}
                  data-testid={card.testId}
                  onClick={() => onCardPress(card.entryId)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                  }}
                  style={tileStyle}
                >
                  {tile}
                </Pressable>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
