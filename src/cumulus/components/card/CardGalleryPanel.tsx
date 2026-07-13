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
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import type { CumulusColor } from "../../primitives/color";
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
import { CardView, GameCard, type GameCardModel } from "./CardView";
import { GalleryActionCard } from "./GalleryActionCard";

/** One resolved card in a {@link CardGalleryPanel}. */
export interface CardGalleryCardView {
  /** Stable id for the card tile; deck surfaces use the deck-entry id. */
  entryId: string;
  /** Canonical semantic model rendered by GameCard. */
  model: GameCardModel;
  /** Optional test id on the tile wrapper. */
  testId?: string;
  /** Draw the card's selection ring. */
  selected?: boolean;
  /** Detach card interaction and dim the tile. */
  disabled?: boolean;
  /** Selection-ring color. Defaults to `selected`. */
  selectionColor?: CumulusColor;
  /** Optional danger outline for always-free purge targets such as Banes. */
  emphasis?: "danger";
  /** Small uncontained line rendered directly below the card. */
  caption?: CardGalleryCaption;
  /** Visually recede this card while preserving press-preview behavior. */
  muted?: boolean;
  /** Preserve this card's grid footprint while hiding all of its content. */
  reserved?: boolean;
  /** Render a noninteractive offset copy beneath the primary card. */
  stackedCopy?: boolean;
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
  /** Interaction motion for the action surface. Defaults to `responsive`. */
  interactionFeedback?: "responsive" | "stationary";
  /** Optional stable test id on the action button. */
  testId?: string;
}

function CardGalleryAction({
  action,
  cardWidth,
  onActivate,
}: {
  readonly action: CardGalleryActionView;
  readonly cardWidth: string;
  readonly onActivate?: () => void;
}): ReactElement {
  const lastPointerType = useRef<string | null>(null);
  const binding = useRevealSource({
    identity: {
      entityType: "gallery-action",
      entityId: revealEntityId("gallery-action", action.entryId),
    },
    spec: {
      primary: {
        kind: "galleryAction",
        action: { glyph: action.glyph, label: action.label },
      },
      secondaries: [],
    },
    onActivate: action.disabled === true ? undefined : onActivate,
  });
  const pointerDown = binding.sourceProps.onPointerDown;
  return (
    <Pressable
      as="button"
      ref={binding.ref}
      {...binding.sourceProps}
      aria-label={action.label}
      aria-disabled={action.disabled || undefined}
      disabled={action.disabled}
      pressFeedback={
        action.interactionFeedback === "stationary" ? "stationary" : "scale"
      }
      data-press-feedback={action.interactionFeedback ?? "responsive"}
      data-testid={action.testId}
      data-reveal-complete-game-card="false"
      onPointerDown={(event) => {
        lastPointerType.current = event.pointerType;
        pointerDown?.(event);
      }}
      onClick={() => {
        if (action.disabled !== true && lastPointerType.current !== "touch") {
          onActivate?.();
        }
      }}
      style={{
        ...binding.sourceProps.style,
        width: "100%",
        display: "block",
        appearance: "none",
        padding: 0,
        border: 0,
        background: "transparent",
      }}
    >
      <GalleryActionCard
        action={{ glyph: action.glyph, label: action.label }}
        width={cardWidth}
      />
    </Pressable>
  );
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

/** A centered labeled action rendered below the card grid. */
export interface CardGalleryFooterAction {
  /** Resolved button label. */
  label: string;
  /** Fires when the footer action is activated. */
  onPress: () => void;
  /** Optional leading glyph. */
  glyph?: Glyph;
  /** Optional inline essence cost. */
  cost?: number | null;
  /** Detach interaction and visually recede the action. */
  disabled?: boolean;
  /** Semantic surface treatment for the action. */
  variant?: GlassButtonVariant;
  /** A `data-testid` for selecting the footer action in tests. */
  testId?: string;
}

/** The grid column count for the card body. */
export type CardGalleryColumns = "auto" | "two" | "three" | "four" | "five";

/** The `auto` grid's minimum card column width. */
export type CardGalleryCardSize = "compact" | "standard" | "roomy";

/** The panel frame geometry. */
export type CardGalleryFrame = "floating" | "fullBleed";

/** The gallery's internal spacing scale. */
export type CardGallerySpacing =
  | "spacious"
  | "regular"
  | "medium"
  | "compact";

/** Whether a floating gallery hugs its grid or fills the caller's width. */
export type CardGalleryWidthMode = "content" | "fill";

export interface CardGalleryPanelProps {
  /** Header title, rendered as an `<h2>`. */
  title: string;
  /** Optional intro line under the title. */
  subtitle?: string;
  /** Optional trailing header action. */
  rightAccessory?: CardGalleryAccessory;
  /** Optional centered GlassButton rendered below the card grid. */
  footerAction?: CardGalleryFooterAction;
  /** Optional equal-width pair of GlassButtons rendered below the card grid. */
  footerActions?: readonly [CardGalleryFooterAction, CardGalleryFooterAction];
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
  /** Floating-frame width behavior. Defaults to `content`. */
  widthMode?: CardGalleryWidthMode;
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
}

const STANDARD_CARD_MIN_WIDTH_PX = 96;
const STANDARD_CARD_MAX_WIDTH_PX = 176;
// Short phone screens may need a much smaller card to keep a fixed two-row
// choice surface wholly visible; this is a fit floor, not a caller size knob.
const COMPACT_CARD_MIN_WIDTH_PX = 44;
const COMPACT_CARD_MAX_WIDTH_PX = 176;
const ROOMY_CARD_MIN_WIDTH_PX = 126;
const ROOMY_CARD_MAX_WIDTH_PX = 188;
const FLOATING_ACCESSORY_PX = 48;
const DEFAULT_COLUMN_COUNT = 5;
const CARD_WIDTH_FLOOR_PX = 64;
// One caption voice plus its gap below each card/action. This is a content box
// measure used by the gallery fitter so two captioned rows remain fully visible.
const CAPTION_LINE_PX = 18;
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
  if (cardSize === "compact") return COMPACT_CARD_MAX_WIDTH_PX;
  return cardSize === "roomy"
    ? ROOMY_CARD_MAX_WIDTH_PX
    : STANDARD_CARD_MAX_WIDTH_PX;
}

function minCardWidth(cardSize: CardGalleryCardSize): number {
  if (cardSize === "compact") return COMPACT_CARD_MIN_WIDTH_PX;
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
        minHeight: CAPTION_LINE_PX,
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
  if (spacing === "spacious") return token("--space-6");
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
      const parentHeight = finitePositive(
        root.parentElement?.clientHeight ?? 0,
      );
      const headerHeight = header.getBoundingClientRect().height;
      const availableBodyHeight =
        frame === "fullBleed"
          ? (finitePositive(body.clientHeight) ??
            Math.max(0, window.innerHeight - headerHeight))
          : parentHeight !== null
            ? Math.max(0, parentHeight - headerHeight)
            : Math.max(0, window.innerHeight - headerHeight);
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
  footerAction,
  footerActions,
  cards,
  emptyLabel = "No cards.",
  columns = "auto",
  cardSize = "standard",
  frame = "floating",
  spacing = "regular",
  widthMode = "content",
  testId,
  cutoutAwareAccessory = false,
  onCardPress,
  endAction,
  onEndActionPress,
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
        data-gallery-card-size={cardSize}
        data-gallery-width-mode={widthMode}
        style={{
          ...materialStyle,
          position: "relative",
          boxSizing: "border-box",
          width:
            frame === "fullBleed" || widthMode === "fill"
              ? "100%"
              : panelWidth,
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
              {cards.map((card) => {
                const reserved = card.reserved === true;
                const disabled = card.disabled === true || reserved;
                const interactive = onCardPress !== undefined;
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
                  touchAction: "pan-y",
                };
                const cardNode = (
                  <div style={tileStyle}>
                    {card.stackedCopy === true && (
                      <div
                        aria-hidden="true"
                        data-gallery-stacked-copy=""
                        style={{
                          position: "absolute",
                          inset: 0,
                          zIndex: 0,
                          pointerEvents: "none",
                          transform: `translate(${token("--space-4")}, ${token("--space-4")})`,
                        }}
                      >
                        <CardView
                          card={card.model.displaySnapshot}
                          transfiguration={card.model.transfiguration}
                        />
                      </div>
                    )}
                    <div style={{ position: "relative", zIndex: 1 }}>
                      <GameCard
                        model={card.model}
                        selected={card.selected}
                        selectionColor={card.selectionColor}
                        unavailable={disabled}
                        testId={card.testId}
                        onActivate={
                          interactive
                            ? () => onCardPress(card.entryId)
                            : undefined
                        }
                      />
                    </div>
                  </div>
                );

                return (
                  <div
                    key={card.entryId}
                    data-gallery-entry-id={card.entryId}
                    data-gallery-reserved={reserved || undefined}
                    aria-hidden={reserved || undefined}
                    style={{
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: card.caption === undefined ? 0 : token("--space-1"),
                      opacity: card.muted === true ? 0.52 : 1,
                      visibility: reserved ? "hidden" : undefined,
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
                  <CardGalleryAction
                    action={endAction}
                    cardWidth={cardWidth}
                    onActivate={() => onEndActionPress?.(endAction.entryId)}
                  />
                  {captionNode(endAction.caption)}
                </div>
              )}
            </div>
          )}
        </div>
        {(footerAction !== undefined || footerActions !== undefined) && (
          <footer
            style={{
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              paddingRight: galleryPadding,
              paddingBottom: galleryPadding,
              paddingLeft: galleryPadding,
            }}
          >
            {footerActions !== undefined ? (
              <div
                data-gallery-footer-actions=""
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: token("--space-4"),
                  width: "min(100%, 360px)",
                }}
              >
                {footerActions.map((action) => (
                  <GlassButton
                    key={action.testId ?? action.label}
                    placement={accessoryPlacement}
                    label={action.label}
                    glyph={action.glyph}
                    cost={action.cost}
                    disabled={action.disabled}
                    variant={action.variant}
                    testId={action.testId}
                    onPress={action.onPress}
                  />
                ))}
              </div>
            ) : footerAction !== undefined ? (
              <GlassButton
                placement={accessoryPlacement}
                label={footerAction.label}
                glyph={footerAction.glyph}
                cost={footerAction.cost}
                disabled={footerAction.disabled}
                variant={footerAction.variant}
                testId={footerAction.testId}
                onPress={footerAction.onPress}
              />
            ) : null}
          </footer>
        )}
      </section>
    </>
  );
}
