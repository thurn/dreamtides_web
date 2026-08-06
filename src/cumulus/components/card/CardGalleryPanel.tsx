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
  type DragEvent,
  type MouseEvent,
  type ReactElement,
  type Ref,
} from "react";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import type { Glyph } from "../../primitives/glyph";
import { GLYPHS } from "../../primitives/glyph";
import { DOUBLE_TAP_WINDOW_MS } from "../../primitives/pointer-gesture";
import { token } from "../../primitives/tokens";
import {
  GlassButton,
  type GlassButtonAction,
  type GlassButtonVariant,
} from "../controls/GlassButton";
import {
  SegmentedControl,
  type SegmentedOption,
} from "../controls/SegmentedControl";
import { Select, type SelectOption } from "../controls/Select";
import { TextField } from "../controls/TextField";
import {
  GlassPanel,
  type GlassPanelGlassButtonAccessory,
  type GlassPanelHeaderSpacing,
  type GlassPanelIconButtonAccessory,
} from "../overlay/GlassPanel";
import { CARD_ASPECT_RATIO_VALUE } from "./card-aspect";
import {
  CardChoiceGrid,
  type CardChoiceGridActionView,
  type CardChoiceGridCaption,
  type CardChoiceGridCardView,
  type CardChoiceGridColumns,
} from "./CardChoiceGrid";

/** One resolved card in a {@link CardGalleryPanel}. */
export type CardGalleryCardView = CardChoiceGridCardView;

/** The small white line shown beneath a gallery item. */
export type CardGalleryCaption = CardChoiceGridCaption;

/** A card-sized action appended to the gallery grid. */
export type CardGalleryActionView = CardChoiceGridActionView;

/** The trailing header action rendered by a {@link CardGalleryPanel}. */
export type CardGalleryAccessory =
  | GlassPanelGlassButtonAccessory
  | GlassPanelIconButtonAccessory;

export type CardGalleryFooterVariant = Exclude<GlassButtonVariant, "danger">;

/** A centered labeled action rendered below the card grid. */
export interface CardGalleryFooterAction
  extends Omit<GlassButtonAction, "variant"> {
  /** Semantic surface treatment for the action. */
  variant?: CardGalleryFooterVariant;
}

/** Controlled search field shown in the gallery's browser toolbar. */
export interface CardGallerySearchControl {
  /** Visible label for the search field. */
  label: string;
  /** Current search text. */
  value: string;
  /** Reports search edits. */
  onChange: (value: string) => void;
  /** Optional empty-field hint. */
  placeholder?: string;
  /** Optional stable test id for the native input. */
  testId?: string;
  /** Optional ref used by an overlay to focus search on open. */
  inputRef?: Ref<HTMLInputElement>;
}

/** Controlled dropdown shown in the gallery's browser toolbar. */
export interface CardGallerySelectControl {
  /** Accessible name for the dropdown trigger. */
  ariaLabel: string;
  /** Current option value. */
  value: string;
  /** Dropdown choices. */
  options: readonly SelectOption[];
  /** Reports selection changes. */
  onChange: (value: string) => void;
}

/** Controlled mode switch shown across the top of a browser gallery. */
export interface CardGallerySegmentedControl {
  /** Segments represented by stable values and visible labels. */
  options: readonly (string | SegmentedOption)[];
  /** Currently selected segment value. */
  value: string;
  /** Reports segment changes. */
  onChange: (value: string) => void;
}

/** Structured mode, search, sort, and filter controls for browser galleries. */
export interface CardGalleryToolbar {
  /** Optional primary mode switch rendered on its own toolbar row. */
  segmented?: CardGallerySegmentedControl;
  /** Search-by-name control. */
  search?: CardGallerySearchControl;
  /** Sort-order control. */
  sort?: CardGallerySelectControl;
  /** Type-filter control. */
  filter?: CardGallerySelectControl;
}

/** The grid column count for the card body. */
export type CardGalleryColumns = "auto" | "two" | "three" | "four" | "five";

/**
 * The gallery card-size preset. Desktop galleries showing two or three cards
 * should use `showcase` so cards reach the 240px reading width when space permits.
 */
export type CardGalleryCardSize = "compact" | "standard" | "roomy" | "showcase";

/** The panel frame geometry. */
export type CardGalleryFrame = "floating" | "fullBleed";

/** The gallery's internal spacing scale. */
export type CardGallerySpacing = "spacious" | "regular" | "medium" | "compact";

/** Whether a floating gallery hugs its grid or fills the caller's width. */
export type CardGalleryWidthMode = "content" | "fill";

/** Whether a floating gallery hugs its content or fills the caller's height. */
export type CardGalleryHeightMode = "content" | "fill";

export interface CardGalleryPanelProps {
  /** Header title, rendered as an `<h2>`. */
  title: string;
  /** Optional intro line under the title. */
  subtitle?: string;
  /** Optional trailing header action. */
  rightAccessory?: CardGalleryAccessory;
  /** Optional one-or-two-action GlassButton footer below the card grid. */
  footerActions?:
    | readonly [CardGalleryFooterAction]
    | readonly [CardGalleryFooterAction, CardGalleryFooterAction];
  /** Optional structured search, sort, and filter toolbar above the card grid. */
  toolbar?: CardGalleryToolbar;
  /** Resolved cards rendered in order. */
  cards: readonly CardGalleryCardView[];
  /** Empty-state copy shown when `cards` is empty. */
  emptyLabel?: string;
  /** Card grid mode. Defaults to `auto`. */
  columns?: CardGalleryColumns;
  /**
   * Card size preset. Defaults to `standard`. Use `showcase` for low-count
   * desktop choices; compact multi-row collections may use a denser preset.
   */
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
  /**
   * Transparent layout-wrapper height behavior. Defaults to `content`.
   * `fill` may reserve caller-owned stage space for card fitting, but the
   * floating glass surface still hugs its rendered header, grid, and footer
   * and centers vertically within that reserved space.
   */
  heightMode?: CardGalleryHeightMode;
  /** Reserve the fanned-copy footprint before any card displays its copy. */
  reserveStackedCopySpace?: boolean;
  /** Test id for the panel root. */
  testId?: string;
  /**
   * When a screen-cutout box is known, float the accessory beside the device
   * island instead of sharing the header row.
   */
  cutoutAwareAccessory?: boolean;
  /** Fires when an enabled card tile is activated. */
  onCardPress?: (entryId: string) => void;
  /** Fires when a draggable card entry begins a native drag. */
  onCardDragStart?: (entryId: string, event: DragEvent<HTMLDivElement>) => void;
  /** Fires when a draggable card entry's native drag ends. */
  onCardDragEnd?: (entryId: string, event: DragEvent<HTMLDivElement>) => void;
  /** Fires when a card entry requests its contextual actions. */
  onCardContextMenu?: (entryId: string, event: MouseEvent<HTMLDivElement>) => void;
  /**
   * Fires when a card receives two quick activations. While present, a primary
   * card press waits briefly so a second tap can take precedence.
   */
  onCardDoubleTap?: (entryId: string) => void;
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
// Low-count choice surfaces should render a complete reading card whenever
// their stage has room, which also lets desktop reveal keep the source in place.
const SHOWCASE_CARD_MIN_WIDTH_PX = ROOMY_CARD_MIN_WIDTH_PX;
const SHOWCASE_CARD_MAX_WIDTH_PX = 240;
const DEFAULT_COLUMN_COUNT = 5;
const CARD_WIDTH_FLOOR_PX = 64;
// One caption voice plus its gap below each card/action. This is a content box
// measure used by the gallery fitter so two captioned rows remain fully visible.
const CAPTION_BLOCK_PX = 22;
// An offset, slightly fanned card needs a real footprint beyond its primary.
// Reserving the rotated bounds keeps the copy clear of the next tile and the
// gallery footer instead of relying on overflow that a scroll body will clip.
const STACKED_COPY_RESERVE_PX = 40;
interface GalleryMeasure {
  cardWidthPx: number;
  visibleRows: number;
  visibleGapSlots: number;
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

function choiceGridColumns(columns: CardGalleryColumns): CardChoiceGridColumns {
  return columns === "auto" ? "five" : columns;
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
  if (cardSize === "showcase") return SHOWCASE_CARD_MAX_WIDTH_PX;
  return cardSize === "roomy"
    ? ROOMY_CARD_MAX_WIDTH_PX
    : STANDARD_CARD_MAX_WIDTH_PX;
}

function minCardWidth(cardSize: CardGalleryCardSize): number {
  if (cardSize === "compact") return COMPACT_CARD_MIN_WIDTH_PX;
  if (cardSize === "showcase") return SHOWCASE_CARD_MIN_WIDTH_PX;
  return cardSize === "roomy"
    ? ROOMY_CARD_MIN_WIDTH_PX
    : STANDARD_CARD_MIN_WIDTH_PX;
}

function fallbackCardWidth(
  frame: CardGalleryFrame,
  cardSize: CardGalleryCardSize,
  columnCount: number,
  spacing: CardGallerySpacing,
  columnGap: string,
): string {
  const minWidth = minCardWidth(cardSize);
  const maxWidth = maxCardWidth(cardSize);
  const edgeReserve =
    frame === "floating"
      ? spacing === "compact"
        ? token("--space-xxs")
        : spacing === "medium"
          ? token("--space-s")
          : token("--space-2xl")
      : "0px";
  const gapSlots = Math.max(0, columnCount - 1);
  const padding = bodyPaddingFor(spacing);
  return `clamp(${String(minWidth)}px, calc((100vw - ${edgeReserve} - ${edgeReserve} - (${padding} * 2) - (${columnGap} * ${String(gapSlots)})) / ${String(columnCount)}), ${String(maxWidth)}px)`;
}

function finitePositive(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parsePixel(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bodyPaddingFor(spacing: CardGallerySpacing): string {
  if (spacing === "compact") return token("--space-s");
  if (spacing === "medium") return token("--space-m");
  return token("--space-2xl");
}

function panelHeaderSpacingFor(
  spacing: CardGallerySpacing,
): GlassPanelHeaderSpacing {
  if (spacing === "compact") return "compact";
  if (spacing === "medium") return "medium";
  if (spacing === "spacious") return "spacious";
  return "regular";
}

function gridGapFor(spacing: CardGallerySpacing): string {
  if (spacing === "spacious") return token("--space-l");
  return spacing === "compact" ? token("--space-xs") : token("--space-s");
}

function useGalleryMeasure({
  frame,
  columnCount,
  cardSize,
  spacing,
  fallbackVisibleRows,
  rowSupplementPx,
  trailingReservePx,
}: {
  readonly frame: CardGalleryFrame;
  readonly columnCount: number;
  readonly cardSize: CardGalleryCardSize;
  readonly spacing: CardGallerySpacing;
  readonly fallbackVisibleRows: number;
  readonly rowSupplementPx: number;
  readonly trailingReservePx: number;
}): {
  readonly rootRef: React.RefObject<HTMLElement | null>;
  readonly bodyRef: React.RefObject<HTMLDivElement | null>;
  readonly measure: GalleryMeasure | null;
} {
  const rootRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [measure, setMeasure] = useState<GalleryMeasure | null>(null);

  useEffect(() => {
    function nextMeasure(): GalleryMeasure | null {
      const root = rootRef.current;
      const body = bodyRef.current;
      const header = root?.querySelector<HTMLElement>(
        "[data-glass-panel-header]",
      );
      if (
        root === null ||
        body === null ||
        header === null ||
        header === undefined
      ) {
        return null;
      }

      const bodyStyle = window.getComputedStyle(body);
      const grid = body.querySelector<HTMLElement>("[data-card-choice-grid]");
      const gridStyle = grid === null ? bodyStyle : window.getComputedStyle(grid);
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
      const toolbarHeight =
        root.querySelector<HTMLElement>("[data-gallery-toolbar]")
          ?.getBoundingClientRect().height ?? 0;
      const footerHeight =
        root.querySelector<HTMLElement>("[data-glass-panel-footer]")
          ?.getBoundingClientRect().height ?? 0;
      const chromeHeight = headerHeight + toolbarHeight + footerHeight;
      const availableBodyHeight =
        frame === "fullBleed"
          ? (finitePositive(body.clientHeight) ??
            Math.max(0, window.innerHeight - chromeHeight))
          : parentHeight !== null
            ? Math.max(0, parentHeight - chromeHeight)
            : Math.max(0, window.innerHeight - chromeHeight);
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
          rowSupplementPx * visibleRows -
          trailingReservePx) *
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
      const header = root?.querySelector<HTMLElement>(
        "[data-glass-panel-header]",
      );
      if (header !== null && header !== undefined)
        resizeObserver.observe(header);
      const toolbar = root?.querySelector<HTMLElement>(
        "[data-gallery-toolbar]",
      );
      if (toolbar !== null && toolbar !== undefined)
        resizeObserver.observe(toolbar);
      const footer = root?.querySelector<HTMLElement>(
        "[data-glass-panel-footer]",
      );
      if (footer !== null && footer !== undefined)
        resizeObserver.observe(footer);
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
    trailingReservePx,
  ]);

  return { rootRef, bodyRef, measure };
}

function cardGalleryFooterButton(
  action: CardGalleryFooterAction,
  placement: GlassControlPlacement,
  key?: string,
): ReactElement {
  const glyph: Glyph | undefined = action.glyph;
  return (
    <GlassButton key={key} {...action} glyph={glyph} placement={placement} />
  );
}

/** Shared card-gallery surface with a header accessory and scrolling grid. */
export function CardGalleryPanel({
  title,
  subtitle,
  rightAccessory,
  footerActions,
  toolbar,
  cards,
  emptyLabel = "No cards.",
  columns = "auto",
  cardSize = "standard",
  frame = "floating",
  spacing = "regular",
  widthMode = "content",
  heightMode = "content",
  reserveStackedCopySpace = false,
  testId,
  cutoutAwareAccessory = false,
  onCardPress,
  onCardDragStart,
  onCardDragEnd,
  onCardContextMenu,
  onCardDoubleTap,
  endAction,
  onEndActionPress,
}: CardGalleryPanelProps): ReactElement {
  const pendingCardTapsRef = useRef(new Map<string, number>());
  const cancelPendingCardTap = (entryId: string): void => {
    const timer = pendingCardTapsRef.current.get(entryId);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    pendingCardTapsRef.current.delete(entryId);
  };
  const handleCardActivate = (entryId: string): void => {
    if (onCardDoubleTap === undefined) {
      onCardPress?.(entryId);
      return;
    }
    if (pendingCardTapsRef.current.has(entryId)) {
      cancelPendingCardTap(entryId);
      onCardDoubleTap(entryId);
      return;
    }
    const timer = window.setTimeout(() => {
      pendingCardTapsRef.current.delete(entryId);
      onCardPress?.(entryId);
    }, DOUBLE_TAP_WINDOW_MS);
    pendingCardTapsRef.current.set(entryId, timer);
  };
  useEffect(() => () => {
    for (const timer of pendingCardTapsRef.current.values()) {
      window.clearTimeout(timer);
    }
    pendingCardTapsRef.current.clear();
  }, []);
  const accessoryPlacement: GlassControlPlacement =
    frame === "fullBleed" ? "onMedia" : "onGlass";
  const columnCount = renderedColumnCount(columns);
  const itemCount = cards.length + (endAction === undefined ? 0 : 1);
  const rowCount = rowCountFor(itemCount, columnCount);
  const fallbackVisibleRows = plannedVisibleRows(rowCount);
  const fallbackVisibleGapSlots = gapSlotsFor(fallbackVisibleRows);
  const hasCaptions =
    endAction !== undefined || cards.some((card) => card.caption !== undefined);
  const hasStackedCopy =
    reserveStackedCopySpace || cards.some((card) => card.stackedCopy === true);
  const rowSupplementPx = hasCaptions ? CAPTION_BLOCK_PX : 0;
  const trailingReservePx = hasStackedCopy ? STACKED_COPY_RESERVE_PX : 0;
  const { rootRef, bodyRef, measure } = useGalleryMeasure({
    frame,
    columnCount,
    cardSize,
    spacing,
    fallbackVisibleRows,
    rowSupplementPx,
    trailingReservePx,
  });
  const visibleRows = measure?.visibleRows ?? fallbackVisibleRows;
  const visibleGapSlots = measure?.visibleGapSlots ?? fallbackVisibleGapSlots;
  const galleryBaseGap = gridGapFor(spacing);
  const galleryColumnGap = hasStackedCopy
    ? `calc(${galleryBaseGap} + ${token("--space-xl")})`
    : galleryBaseGap;
  const galleryRowGap = hasStackedCopy
    ? `calc(${galleryBaseGap} + ${String(STACKED_COPY_RESERVE_PX)}px)`
    : galleryBaseGap;
  const cardWidth =
    measure === null
      ? fallbackCardWidth(
          frame,
          cardSize,
          columnCount,
          spacing,
          galleryColumnGap,
        )
      : `${String(Math.max(1, Math.floor(measure.cardWidthPx)))}px`;
  const galleryPadding = bodyPaddingFor(spacing);
  const cardHeight = `calc(${cardWidth} / ${String(CARD_ASPECT_RATIO_VALUE)})`;
  const bodyHeight = `calc(((${cardHeight} + ${String(rowSupplementPx)}px) * ${String(visibleRows)}) + (${galleryRowGap} * ${String(visibleGapSlots)}) + (${galleryPadding} * 2) + ${String(trailingReservePx)}px)`;
  const panelWidth = `calc((${cardWidth} * ${String(columnCount)}) + (${galleryColumnGap} * ${String(Math.max(0, columnCount - 1))}) + (${galleryPadding} * 2))`;
  const footerNode =
    footerActions !== undefined ? (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          paddingTop: galleryPadding,
          paddingRight: galleryPadding,
          paddingBottom: galleryPadding,
          paddingLeft: galleryPadding,
        }}
      >
        {footerActions.length === 2 ? (
          <div
            data-gallery-footer-actions=""
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: token("--space-s"),
              width: "min(100%, 360px)",
            }}
          >
            {footerActions.map((action) =>
              cardGalleryFooterButton(
                action,
                accessoryPlacement,
                action.testId ?? action.label,
              ),
            )}
          </div>
        ) : (
          cardGalleryFooterButton(footerActions[0], accessoryPlacement)
        )}
      </div>
    ) : undefined;

  const toolbarGap = spacing === "spacious"
    ? token("--space-l")
    : token("--space-s");
  const toolbarNode = toolbar === undefined ? null : (
    <div
      data-gallery-toolbar=""
      style={{
        flexShrink: 0,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: toolbarGap,
        paddingTop: galleryPadding,
        paddingRight: galleryPadding,
        paddingBottom: token("--space-s"),
        paddingLeft: galleryPadding,
      }}
    >
      {toolbar.segmented === undefined ? null : (
        <div
          data-gallery-toolbar-segmented=""
          style={{ flex: "1 0 100%", minWidth: 0 }}
        >
          <SegmentedControl
            options={[...toolbar.segmented.options]}
            value={toolbar.segmented.value}
            onChange={toolbar.segmented.onChange}
            full
          />
        </div>
      )}
      {toolbar.search === undefined ? null : (
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <TextField
            label={toolbar.search.label}
            value={toolbar.search.value}
            onChange={toolbar.search.onChange}
            kind="search"
            placeholder={toolbar.search.placeholder}
            testId={toolbar.search.testId}
            inputRef={toolbar.search.inputRef}
          />
        </div>
      )}
      <div
        style={{
          display: "flex",
          flex: "0 1 auto",
          alignItems: "center",
          gap: toolbarGap,
          height: token("--touch-min"),
          minWidth: 0,
        }}
      >
        {toolbar.sort === undefined ? null : (
          <Select
            leadingGlyph={GLYPHS.sort}
            ariaLabel={toolbar.sort.ariaLabel}
            options={[...toolbar.sort.options]}
            value={toolbar.sort.value}
            onChange={toolbar.sort.onChange}
            size="md"
          />
        )}
        {toolbar.filter === undefined ? null : (
          <Select
            leadingGlyph={GLYPHS.filter}
            ariaLabel={toolbar.filter.ariaLabel}
            options={[...toolbar.filter.options]}
            value={toolbar.filter.value}
            onChange={toolbar.filter.onChange}
            size="md"
            align="end"
          />
        )}
      </div>
    </div>
  );

  return (
    <section
      ref={rootRef}
      data-testid={testId}
      data-gallery-frame={frame}
      data-gallery-columns={columnCount}
      data-gallery-visible-rows={visibleRows}
      data-gallery-spacing={spacing}
      data-gallery-card-size={cardSize}
      data-gallery-width-mode={widthMode}
      data-gallery-height-mode={heightMode}
      data-gallery-reserves-stacked-copy={reserveStackedCopySpace || undefined}
      style={{
        position: "relative",
        boxSizing: "border-box",
        display:
          frame === "floating" && heightMode === "fill" ? "grid" : undefined,
        alignItems:
          frame === "floating" && heightMode === "fill"
            ? "center"
            : undefined,
        width:
          frame === "fullBleed" || widthMode === "fill" ? "100%" : panelWidth,
        maxWidth: "100%",
        height:
          frame === "fullBleed" || heightMode === "fill" ? "100%" : undefined,
        maxHeight: "100%",
        minHeight: 0,
        pointerEvents: "auto",
      }}
    >
      <GlassPanel
        title={title}
        subtitle={subtitle}
        rightAccessory={rightAccessory}
        cutoutAwareAccessory={cutoutAwareAccessory}
        frame={frame}
        radius="popover"
        tint="popover"
        headerSpacing={panelHeaderSpacingFor(spacing)}
        footer={footerNode}
      >
        {toolbarNode}
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
            <CardChoiceGrid
              cards={cards}
              columns={choiceGridColumns(columns)}
              layout={{
                kind: "gallery",
                cardWidth,
                columnGap: galleryColumnGap,
                rowGap: galleryRowGap,
              }}
              endAction={endAction}
              onCardPress={
                onCardPress === undefined && onCardDoubleTap === undefined
                  ? undefined
                  : handleCardActivate
              }
              onCardDragStart={onCardDragStart}
              onCardDragEnd={onCardDragEnd}
              onCardContextMenu={(entryId, event) => {
                cancelPendingCardTap(entryId);
                onCardContextMenu?.(entryId, event);
              }}
              onEndActionPress={onEndActionPress}
            />
          )}
        </div>
      </GlassPanel>
    </section>
  );
}
