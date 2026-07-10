// CardGalleryPanel — the shared card-browser surface.
//
// A card-gallery surface is the recurring "title + subtitle, trailing action,
// scrolling GameCard grid" pattern used by the starting-deck reveal and card
// selection sites. The component owns the frame material, header row, body
// scroll, screen-aware row peeking, and fixed card grid modes. A floating frame
// is glass; a full-bleed frame is the standard alpha scrim. Callers choose the
// frame and column contract and provide resolved card models keyed by deck entry
// id / UUID.

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { CardData } from "../../../types/cards";
import type { CardTransfigurationDisplay } from "../../../runtime/transfiguration-display";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import type { TangoColor } from "../../primitives/color";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import type { Glyph } from "../../primitives/glyph";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { EssenceValue } from "../hud/EssenceValue";
import {
  GlassButton,
  type GlassButtonVariant,
  type GlassButtonWidthReservation,
} from "../controls/GlassButton";
import { IconButton, type IconButtonSize } from "../controls/IconButton";
import { CARD_ASPECT_RATIO_VALUE } from "./card-aspect";
import { GameCard } from "./CardView";
import {
  renderMobileCardPeekOverlay,
  useMobileCardPeek,
} from "./MobileCardPeek";

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
  /** Small uncontained line rendered directly below the card. */
  caption?: CardGalleryCaption;
  /** Visually recede this card while preserving press-preview behavior. */
  muted?: boolean;
}

/** The small white line shown beneath a gallery item. */
export type CardGalleryCaption =
  | { kind: "essence"; amount: number }
  | { kind: "text"; text: string };

/** A card-sized action appended to the gallery grid. */
export interface CardGalleryActionView {
  /** Stable action id reported through `onEndActionPress`. */
  entryId: string;
  /** Large glyph that carries the action's visual identity. */
  glyph: Glyph;
  /** Accessible action label. */
  label: string;
  /** Small uncontained line rendered directly below the glyph. */
  caption: CardGalleryCaption;
  /** Detach interaction and visually recede the action. */
  disabled?: boolean;
  /** Optional stable test id on the action button. */
  testId?: string;
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
      /** Dynamic label/cost states whose widest footprint is reserved. */
      widthReservations?: readonly GlassButtonWidthReservation[];
      /** Semantic surface treatment for the action. */
      variant?: GlassButtonVariant;
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

/** The grid column count for the card body. */
export type CardGalleryColumns = "auto" | "two" | "three" | "four" | "five";

/** The `auto` grid's minimum card column width. */
export type CardGalleryCardSize = "standard" | "roomy";

/** The panel frame geometry. */
export type CardGalleryFrame = "floating" | "fullBleed";

/** The gallery's internal spacing scale. */
export type CardGallerySpacing = "regular" | "medium" | "compact";

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
  /** Card size preset. Defaults to `standard`. */
  cardSize?: CardGalleryCardSize;
  /**
   * Panel frame geometry and material. `floating` uses liquid glass;
   * `fullBleed` fills its parent edge-to-edge with the standard alpha scrim
   * and no floating rim or shadow. Defaults to `floating`.
   */
  frame?: CardGalleryFrame;
  /** Internal padding and grid gap scale. Defaults to `regular`. */
  spacing?: CardGallerySpacing;
  /** Draw each tile with GameCard's larger readable type scale. */
  largeCards?: boolean;
  /** Test id for the panel root. */
  testId?: string;
  /**
   * When a screen-cutout box is known, float the accessory beside the device
   * island instead of sharing the header row.
   */
  cutoutAwareAccessory?: boolean;
  /** Fires when an enabled card tile is activated. */
  onCardPress?: (entryId: string) => void;
  /** Optional card-sized action appended after the cards. */
  endAction?: CardGalleryActionView;
  /** Fires with the appended action's stable id when it is activated. */
  onEndActionPress?: (entryId: string) => void;
  /**
   * Enables the shared mobile Deck Viewer press preview for compact galleries:
   * hold a tile and a large readable card is placed clear of the finger;
   * quick taps still activate selectable tiles, while held previews suppress
   * their trailing click. First-row sources pin the card and its definitions
   * to the visual viewport's top edge, preserving only a physical safe-area
   * inset.
   */
  mobilePressPreview?: boolean;
}

const STANDARD_CARD_MIN_WIDTH_PX = 96;
const STANDARD_CARD_MAX_WIDTH_PX = 176;
const ROOMY_CARD_MIN_WIDTH_PX = 126;
const ROOMY_CARD_MAX_WIDTH_PX = 188;
const FLOATING_ACCESSORY_PX = 48;
const DEFAULT_COLUMN_COUNT = 5;
const CARD_WIDTH_FLOOR_PX = 64;
// One caption voice plus its gap below each card/action. This is a content box
// measure used by the gallery fitter so two captioned rows remain fully visible.
const CAPTION_BLOCK_PX = 22;

interface GalleryMeasure {
  cardWidthPx: number;
  visibleRows: number;
  visibleGapSlots: number;
}

function accessoryNode(
  accessory: CardGalleryAccessory,
  placement: GlassControlPlacement,
): ReactElement {
  if (accessory.kind === "glassButton") {
    return (
      <GlassButton
        placement={placement}
        label={accessory.label}
        glyph={accessory.glyph}
        disabled={accessory.disabled}
        cost={accessory.cost}
        widthReservations={accessory.widthReservations}
        variant={accessory.variant}
        testId={accessory.testId}
        onPress={accessory.onPress}
      />
    );
  }
  return (
    <IconButton
      placement={placement}
      glyph={accessory.glyph}
      size={accessory.size}
      label={accessory.label}
      disabled={accessory.disabled}
      testId={accessory.testId}
      onPress={accessory.onPress}
    />
  );
}

function configuredColumnCount(columns: CardGalleryColumns): number {
  if (columns === "two") return 2;
  if (columns === "three") return 3;
  if (columns === "four") return 4;
  return DEFAULT_COLUMN_COUNT;
}

function renderedColumnCount(columns: CardGalleryColumns): number {
  return configuredColumnCount(columns);
}

function rowCountFor(cardCount: number, columnCount: number): number {
  if (cardCount === 0) return 1;
  return Math.max(1, Math.ceil(cardCount / columnCount));
}

function plannedVisibleRows(rowCount: number): number {
  return rowCount > 2 ? 2.5 : rowCount;
}

function gapSlotsFor(visibleRows: number): number {
  return Number.isInteger(visibleRows)
    ? Math.max(0, visibleRows - 1)
    : Math.max(0, Math.floor(visibleRows));
}

function maxCardWidth(cardSize: CardGalleryCardSize): number {
  return cardSize === "roomy"
    ? ROOMY_CARD_MAX_WIDTH_PX
    : STANDARD_CARD_MAX_WIDTH_PX;
}

function minCardWidth(cardSize: CardGalleryCardSize): number {
  return cardSize === "roomy"
    ? ROOMY_CARD_MIN_WIDTH_PX
    : STANDARD_CARD_MIN_WIDTH_PX;
}

function fallbackCardWidth(
  frame: CardGalleryFrame,
  cardSize: CardGalleryCardSize,
  columnCount: number,
  spacing: CardGallerySpacing,
): string {
  const minWidth = minCardWidth(cardSize);
  const maxWidth = maxCardWidth(cardSize);
  const edgeReserve =
    frame === "floating"
      ? spacing === "compact"
        ? token("--space-1")
        : spacing === "medium"
          ? token("--space-4")
          : token("--space-8")
      : "0px";
  const gapSlots = Math.max(0, columnCount - 1);
  const padding = bodyPaddingFor(spacing);
  const gap = gridGapFor(spacing);
  return `clamp(${String(minWidth)}px, calc((100vw - ${edgeReserve} - ${edgeReserve} - (${padding} * 2) - (${gap} * ${String(gapSlots)})) / ${String(columnCount)}), ${String(maxWidth)}px)`;
}

function gridTemplate(columns: number, cardWidth: string): string {
  return `repeat(${String(columns)}, ${cardWidth})`;
}

function captionNode(caption: CardGalleryCaption): ReactElement {
  return (
    <p
      data-gallery-caption={caption.kind}
      style={{
        minHeight: CAPTION_BLOCK_PX,
        margin: 0,
        display: "grid",
        placeItems: "center",
        font: token("--t-caption"),
        color: token("--text-on-glass"),
        textAlign: "center",
      }}
    >
      {caption.kind === "essence" ? (
        <EssenceValue amount={caption.amount} tone="inherit" />
      ) : (
        caption.text
      )}
    </p>
  );
}

function finitePositive(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parsePixel(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bodyPaddingFor(spacing: CardGallerySpacing): string {
  if (spacing === "compact") return token("--space-4");
  if (spacing === "medium") return token("--space-5");
  return token("--space-8");
}

function headerPaddingFor(spacing: CardGallerySpacing): string {
  if (spacing === "compact") return token("--space-5");
  if (spacing === "medium") return token("--space-6");
  return token("--space-8");
}

function gridGapFor(spacing: CardGallerySpacing): string {
  return spacing === "compact" ? token("--space-3") : token("--space-4");
}

function useGalleryMeasure({
  frame,
  columnCount,
  cardSize,
  spacing,
  fallbackVisibleRows,
  rowSupplementPx,
}: {
  readonly frame: CardGalleryFrame;
  readonly columnCount: number;
  readonly cardSize: CardGalleryCardSize;
  readonly spacing: CardGallerySpacing;
  readonly fallbackVisibleRows: number;
  readonly rowSupplementPx: number;
}): {
  readonly rootRef: React.RefObject<HTMLElement | null>;
  readonly headerRef: React.RefObject<HTMLElement | null>;
  readonly bodyRef: React.RefObject<HTMLDivElement | null>;
  readonly gridRef: React.RefObject<HTMLDivElement | null>;
  readonly measure: GalleryMeasure | null;
} {
  const rootRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [measure, setMeasure] = useState<GalleryMeasure | null>(null);

  useEffect(() => {
    function nextMeasure(): GalleryMeasure | null {
      const root = rootRef.current;
      const body = bodyRef.current;
      const header = headerRef.current;
      if (root === null || body === null || header === null) return null;

      const bodyStyle = window.getComputedStyle(body);
      const gridStyle =
        gridRef.current !== null
          ? window.getComputedStyle(gridRef.current)
          : bodyStyle;
      const inlinePadding =
        parsePixel(bodyStyle.paddingLeft) + parsePixel(bodyStyle.paddingRight);
      const blockPadding =
        parsePixel(bodyStyle.paddingTop) + parsePixel(bodyStyle.paddingBottom);
      const gap = parsePixel(gridStyle.rowGap);
      const availableWidth =
        (frame === "fullBleed"
          ? finitePositive(root.clientWidth)
          : finitePositive(root.parentElement?.clientWidth ?? 0)) ??
        finitePositive(window.innerWidth) ??
        0;
      const bodyHeight =
        frame === "fullBleed"
          ? finitePositive(body.clientHeight)
          : finitePositive(root.parentElement?.clientHeight ?? 0);
      const availableBodyHeight =
        bodyHeight ??
        Math.max(0, window.innerHeight - header.getBoundingClientRect().height);
      const maxWidthByInline =
        (availableWidth - inlinePadding - gap * (columnCount - 1)) /
        columnCount;
      const widthCap = Math.max(
        CARD_WIDTH_FLOOR_PX,
        Math.min(maxCardWidth(cardSize), maxWidthByInline),
      );
      const minWidth = Math.min(minCardWidth(cardSize), widthCap);
      const visibleRows = fallbackVisibleRows;
      const visibleGapSlots = gapSlotsFor(visibleRows);
      const maxWidthByBlock =
        ((availableBodyHeight -
          blockPadding -
          gap * visibleGapSlots -
          rowSupplementPx * visibleRows) *
          CARD_ASPECT_RATIO_VALUE) /
        visibleRows;
      const cardWidthPx = Math.max(
        minWidth,
        Math.min(widthCap, maxWidthByBlock),
      );

      return {
        cardWidthPx,
        visibleRows,
        visibleGapSlots,
      };
    }

    function update(): void {
      const next = nextMeasure();
      if (next === null) return;
      setMeasure((current) =>
        current !== null &&
        Math.abs(current.cardWidthPx - next.cardWidthPx) < 0.5 &&
        current.visibleRows === next.visibleRows &&
        current.visibleGapSlots === next.visibleGapSlots
          ? current
          : next,
      );
    }

    update();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => update());
    const root = rootRef.current;
    const parent = root?.parentElement ?? null;
    if (resizeObserver !== null) {
      if (root !== null) resizeObserver.observe(root);
      if (parent !== null) resizeObserver.observe(parent);
      if (bodyRef.current !== null) resizeObserver.observe(bodyRef.current);
      if (headerRef.current !== null) resizeObserver.observe(headerRef.current);
    }
    window.addEventListener("resize", update);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [
    cardSize,
    columnCount,
    fallbackVisibleRows,
    frame,
    rowSupplementPx,
    spacing,
  ]);

  return { rootRef, headerRef, bodyRef, gridRef, measure };
}

/** Shared card-gallery surface with a header accessory and scrolling grid. */
export function CardGalleryPanel({
  title,
  subtitle,
  rightAccessory,
  cards,
  emptyLabel = "No cards.",
  columns = "auto",
  cardSize = "standard",
  frame = "floating",
  spacing = "regular",
  largeCards = false,
  testId,
  cutoutAwareAccessory = false,
  onCardPress,
  endAction,
  onEndActionPress,
  mobilePressPreview = false,
}: CardGalleryPanelProps): ReactElement {
  const [besideCutout, setBesideCutout] = useState(false);
  useEffect(() => {
    setBesideCutout(cutoutAwareAccessory && hasInjectedDisplayCutout());
  }, [cutoutAwareAccessory]);

  const accessoryPlacement: GlassControlPlacement =
    frame === "fullBleed" ? "onMedia" : "onGlass";
  const accessory =
    rightAccessory !== undefined
      ? accessoryNode(rightAccessory, accessoryPlacement)
      : null;
  const columnCount = renderedColumnCount(columns);
  const itemCount = cards.length + (endAction === undefined ? 0 : 1);
  const rowCount = rowCountFor(itemCount, columnCount);
  const fallbackVisibleRows = plannedVisibleRows(rowCount);
  const fallbackVisibleGapSlots = gapSlotsFor(fallbackVisibleRows);
  const hasCaptions =
    endAction !== undefined || cards.some((card) => card.caption !== undefined);
  const rowSupplementPx = hasCaptions ? CAPTION_BLOCK_PX : 0;
  const { rootRef, headerRef, bodyRef, gridRef, measure } = useGalleryMeasure({
    frame,
    columnCount,
    cardSize,
    spacing,
    fallbackVisibleRows,
    rowSupplementPx,
  });
  const visibleRows = measure?.visibleRows ?? fallbackVisibleRows;
  const visibleGapSlots = measure?.visibleGapSlots ?? fallbackVisibleGapSlots;
  const cardWidth =
    measure === null
      ? fallbackCardWidth(frame, cardSize, columnCount, spacing)
      : `${String(Math.max(1, Math.floor(measure.cardWidthPx)))}px`;
  const galleryGap = gridGapFor(spacing);
  const mobilePeek = useMobileCardPeek({
    columns: columnCount,
    columnGapToken: spacing === "compact" ? "--space-3" : "--space-4",
  });
  const mobilePeekEnabled = mobilePressPreview && cards.length > 0;
  const galleryPadding = bodyPaddingFor(spacing);
  const headerPadding = headerPaddingFor(spacing);
  const cardHeight = `calc(${cardWidth} / ${String(CARD_ASPECT_RATIO_VALUE)})`;
  const bodyHeight = `calc(((${cardHeight} + ${String(rowSupplementPx)}px) * ${String(visibleRows)}) + (${galleryGap} * ${String(visibleGapSlots)}) + (${galleryPadding} * 2))`;
  const panelWidth = `calc((${cardWidth} * ${String(columnCount)}) + (${galleryGap} * ${String(Math.max(0, columnCount - 1))}) + (${galleryPadding} * 2))`;
  const materialStyle: CSSProperties =
    frame === "fullBleed"
      ? {
          background: token("--scrim-gallery"),
          // The viewport surface has no floating-panel perimeter.
          border: "none",
          boxShadow: "none",
        }
      : {
          ...glassSurfaceStyle(),
          background: `${token("--glass-sheen")}, ${token("--glass-fill-popover")}`,
        };

  return (
    <>
      <section
        ref={rootRef}
        data-testid={testId}
        data-gallery-frame={frame}
        data-gallery-columns={columnCount}
        data-gallery-visible-rows={visibleRows}
        data-gallery-spacing={spacing}
        style={{
          ...materialStyle,
          position: "relative",
          boxSizing: "border-box",
          width: frame === "fullBleed" ? "100%" : panelWidth,
          maxWidth: "100%",
          height: frame === "fullBleed" ? "100%" : undefined,
          maxHeight: "100%",
          borderRadius: frame === "fullBleed" ? 0 : token("--radius-popover"),
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
          ref={headerRef}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: token("--space-4"),
            borderBottom: `1px solid ${token("--border-strong")}`,
            padding: headerPadding,
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
          ref={bodyRef}
          onPointerMove={
            mobilePeekEnabled ? mobilePeek.handlePointerMove : undefined
          }
          onScroll={mobilePeekEnabled ? mobilePeek.handleScroll : undefined}
          style={{
            flex: frame === "fullBleed" ? "1 1 auto" : `0 1 ${bodyHeight}`,
            minHeight: 0,
            height: frame === "fullBleed" ? undefined : bodyHeight,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            overscrollBehaviorY: "contain",
            padding: galleryPadding,
          }}
        >
          {itemCount === 0 ? (
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
              ref={gridRef}
              style={{
                display: "grid",
                gridTemplateColumns: gridTemplate(columnCount, cardWidth),
                gap: galleryGap,
                justifyContent: "center",
              }}
            >
              {cards.map((card, index) => {
                const disabled = card.disabled === true;
                const interactive = onCardPress !== undefined;
                const peekable = mobilePeekEnabled && !disabled;
                const tile = (
                  <GameCard
                    card={card.card}
                    transfiguration={card.transfiguration}
                    selected={card.selected}
                    selectionColor={card.selectionColor}
                    large={largeCards}
                    termDefinitions={peekable ? "none" : "card"}
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
                  touchAction: peekable ? "pan-y" : "manipulation",
                };

                let cardNode: ReactElement;
                if (!interactive) {
                  if (peekable) {
                    cardNode = (
                      <Pressable
                        as="div"
                        data-testid={card.testId}
                        onPointerDown={(event) => {
                          mobilePeek.openPeek(event, card, {
                            pinToTop: index < columnCount,
                          });
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                        }}
                        style={tileStyle}
                      >
                        {tile}
                      </Pressable>
                    );
                  } else {
                    cardNode = (
                      <div data-testid={card.testId} style={tileStyle}>
                        {tile}
                      </div>
                    );
                  }
                } else {
                  cardNode = (
                    <Pressable
                      as="button"
                      aria-label={card.card.name}
                      aria-pressed={card.selected}
                      disabled={disabled}
                      data-testid={card.testId}
                      onPointerDown={
                        peekable
                          ? (event) => {
                              mobilePeek.openPeek(event, card, {
                                pinToTop: index < columnCount,
                              });
                            }
                          : undefined
                      }
                      onClick={() => onCardPress(card.entryId)}
                      onClickCapture={
                        peekable ? mobilePeek.handleClickCapture : undefined
                      }
                      onContextMenu={(event) => {
                        event.preventDefault();
                      }}
                      style={tileStyle}
                    >
                      {tile}
                    </Pressable>
                  );
                }

                return (
                  <div
                    key={card.entryId}
                    style={{
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: card.caption === undefined ? 0 : token("--space-1"),
                      opacity: card.muted === true ? 0.52 : 1,
                    }}
                  >
                    {cardNode}
                    {card.caption !== undefined && captionNode(card.caption)}
                  </div>
                );
              })}
              {endAction !== undefined && (
                <div
                  key={endAction.entryId}
                  style={{
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: token("--space-1"),
                    opacity: endAction.disabled === true ? 0.42 : 1,
                  }}
                >
                  <Pressable
                    as="button"
                    aria-label={endAction.label}
                    disabled={endAction.disabled}
                    data-testid={endAction.testId}
                    onClick={() => onEndActionPress?.(endAction.entryId)}
                    style={{
                      width: "100%",
                      aspectRatio: String(CARD_ASPECT_RATIO_VALUE),
                      display: "grid",
                      placeItems: "center",
                      appearance: "none",
                      padding: 0,
                      border: "none",
                      background: "transparent",
                    }}
                  >
                    <i
                      className={endAction.glyph}
                      aria-hidden="true"
                      data-gallery-action-glyph=""
                      style={{
                        fontSize: `calc(${cardWidth} * 0.58)`,
                        color: token("--text-on-glass"),
                        textShadow: token("--text-outline-media"),
                      }}
                    />
                  </Pressable>
                  {captionNode(endAction.caption)}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
      {mobilePeek.peek !== null && renderMobileCardPeekOverlay(mobilePeek.peek)}
    </>
  );
}
