// Shared implementation for the two public card-panel roles.
//
// The public components encode the product role instead of exposing independent
// spacing, frame, sizing, and column knobs. They share one private fitted-grid
// renderer so card geometry and scrolling stay consistent.

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactElement,
  type Ref,
} from "react";
import type { DomTestId } from "../../types/dom";
import { type LocalizedString, tx } from "@trox/runtime";
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
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import {
  CardChoiceGrid,
  type CardChoiceGridActionView,
  type CardChoiceGridCaption,
  type CardChoiceGridCardView,
  type CardChoiceGridColumns,
} from "./CardChoiceGrid";
import type { DeckEntryId } from "../../../types/identifiers";

/** One resolved card in a {@link CardBrowserPanel} or {@link CardPickerPanel}. */
export type CardGalleryCardView<EntryId extends string = DeckEntryId> =
  CardChoiceGridCardView<EntryId>;

/** The small white line shown beneath a gallery item. */
export type CardGalleryCaption = CardChoiceGridCaption;

/** A card-sized action appended to the gallery grid. */
export type CardGalleryActionView<EntryId extends string = DeckEntryId> =
  CardChoiceGridActionView<EntryId>;

/** The trailing header action rendered by either card-panel role. */
export type CardPanelAccessory =
  GlassPanelGlassButtonAccessory | GlassPanelIconButtonAccessory;

export type CardPickerFooterVariant = Exclude<GlassButtonVariant, "danger">;

/** A labeled action rendered in the picker footer. */
export interface CardPickerFooterAction extends Omit<
  GlassButtonAction,
  "variant"
> {
  /** Semantic surface treatment for the action. */
  variant?: CardPickerFooterVariant;
}

/** Controlled search field shown in the gallery's browser toolbar. */
export interface CardBrowserSearchControl {
  /** Localized visible label for the search field. */
  label: LocalizedString;
  /** Current search text. */
  value: string;
  /** Reports search edits. */
  onChange: (value: string) => void;
  /** Optional empty-field hint. */
  placeholder?: LocalizedString;
  /** Optional stable test id for the native input. */
  testId?: DomTestId;
  /** Optional ref used by an overlay to focus search on open. */
  inputRef?: Ref<HTMLInputElement>;
}

/** Controlled dropdown shown in the gallery's browser toolbar. */
export interface CardBrowserSelectControl {
  /** Localized accessible name for the dropdown trigger. */
  ariaLabel: LocalizedString;
  /** Current option value. */
  value: string;
  /** Dropdown choices. */
  options: readonly SelectOption[];
  /** Reports selection changes. */
  onChange: (value: string) => void;
}

/** Controlled mode switch shown across the top of a browser gallery. */
export interface CardBrowserSegmentedControl {
  /** Segments represented by stable values and visible labels. */
  options: readonly SegmentedOption[];
  /** Currently selected segment value. */
  value: string;
  /** Reports segment changes. */
  onChange: (value: string) => void;
}

/** Structured mode, search, sort, and filter controls for browser galleries. */
export interface CardBrowserToolbar {
  /** Optional primary mode switch rendered on its own toolbar row. */
  segmented?: CardBrowserSegmentedControl;
  /** Search-by-name control. */
  search?: CardBrowserSearchControl;
  /** Sort-order control. */
  sort?: CardBrowserSelectControl;
  /** Type-filter control. */
  filter?: CardBrowserSelectControl;
}

/** How a card browser integrates with its host surface. */
export type CardBrowserPresentation = "embedded" | "overlay" | "fullScreen";

/** How a transactional card picker integrates with its host surface. */
export type CardPickerPresentation = "embedded" | "overlay";

interface CardPanelBaseProps<EntryId extends string> {
  /** Header title, rendered as an `<h2>`. */
  title: LocalizedString;
  /** Optional intro line under the title. */
  subtitle?: LocalizedString;
  /** Optional trailing header action. */
  rightAccessory?: CardPanelAccessory;
  /** Resolved cards rendered in order. */
  cards: readonly CardGalleryCardView<EntryId>[];
  /** Empty-state copy shown when `cards` is empty. */
  emptyLabel?: LocalizedString;
  /** Test id for the panel root. */
  testId?: DomTestId;
}

export interface CardBrowserPanelProps<
  EntryId extends string = DeckEntryId,
> extends CardPanelBaseProps<EntryId> {
  /** Optional structured search, sort, and filter toolbar above the card grid. */
  toolbar?: CardBrowserToolbar;
  /** Host integration. `overlay` is floating on desktop and full-bleed on mobile. */
  presentation?: CardBrowserPresentation;
  /** Fires when an enabled card tile is activated. */
  onCardPress?: (entryId: EntryId) => void;
  /** Fires when a draggable card entry begins a native drag. */
  onCardDragStart?: (
    entryId: EntryId,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  /** Fires when a draggable card entry's native drag ends. */
  onCardDragEnd?: (entryId: EntryId, event: DragEvent<HTMLDivElement>) => void;
  /** Fires when a card entry requests its contextual actions. */
  onCardContextMenu?: (
    entryId: EntryId,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  /**
   * Fires when a card receives two quick activations. While present, a primary
   * card press waits briefly so a second tap can take precedence.
   */
  onCardDoubleTap?: (entryId: EntryId) => void;
}

export interface CardPickerPanelProps<
  EntryId extends string = DeckEntryId,
> extends CardPanelBaseProps<EntryId> {
  /** Host integration. `overlay` is floating on desktop and full-bleed on mobile. */
  presentation?: CardPickerPresentation;
  /** Optional one-or-two-action GlassButton footer below the card grid. */
  footerActions?:
    | readonly [CardPickerFooterAction]
    | readonly [CardPickerFooterAction, CardPickerFooterAction];
  /** Fires when an enabled card tile is activated. */
  onCardPress?: (entryId: EntryId) => void;
  /** Optional card-sized action appended after the cards. */
  endAction?: CardGalleryActionView<EntryId>;
  /** Fires with the appended action's stable id when it is activated. */
  onEndActionPress?: (entryId: EntryId) => void;
}

type GalleryColumns = "two" | "three" | "four" | "five";
type GalleryCardSize = "compact" | "standard" | "reading";
type GalleryFrame = "floating" | "fullBleed";
type GallerySpacing = "regular" | "compact";
type GalleryHeightMode = "content" | "fill";

interface CardGallerySurfaceProps<
  EntryId extends string,
> extends CardPanelBaseProps<EntryId> {
  toolbar?: CardBrowserToolbar;
  footerActions?:
    | readonly [CardPickerFooterAction]
    | readonly [CardPickerFooterAction, CardPickerFooterAction];
  columns: GalleryColumns;
  cardSize: GalleryCardSize;
  frame: GalleryFrame;
  spacing: GallerySpacing;
  heightMode: GalleryHeightMode;
  role: "browser" | "picker";
  onCardPress?: (entryId: EntryId) => void;
  onCardDragStart?: (
    entryId: EntryId,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  onCardDragEnd?: (entryId: EntryId, event: DragEvent<HTMLDivElement>) => void;
  onCardContextMenu?: (
    entryId: EntryId,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  onCardDoubleTap?: (entryId: EntryId) => void;
  endAction?: CardGalleryActionView<EntryId>;
  onEndActionPress?: (entryId: EntryId) => void;
}

const STANDARD_CARD_MIN_WIDTH_PX = 96;
const STANDARD_CARD_MAX_WIDTH_PX = 176;
// Short phone screens may need a much smaller card to keep a fixed two-row
// choice surface wholly visible; this is a fit floor, not a caller size knob.
const COMPACT_CARD_MIN_WIDTH_PX = 44;
const COMPACT_CARD_MAX_WIDTH_PX = 176;
// Low-count desktop pickers should render at the complete physical reading
// width whenever their stage has room. The picker selects this tier from card
// count; it is not a public appearance choice.
const READING_CARD_MIN_WIDTH_PX = 126;
const READING_CARD_MAX_WIDTH_PX = 240;
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

function configuredColumnCount(columns: GalleryColumns): number {
  if (columns === "two") return 2;
  if (columns === "three") return 3;
  if (columns === "four") return 4;
  return 5;
}

function renderedColumnCount(columns: GalleryColumns): number {
  return configuredColumnCount(columns);
}

function choiceGridColumns(columns: GalleryColumns): CardChoiceGridColumns {
  return columns;
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

function maxCardWidth(cardSize: GalleryCardSize): number {
  if (cardSize === "reading") return READING_CARD_MAX_WIDTH_PX;
  return cardSize === "compact"
    ? COMPACT_CARD_MAX_WIDTH_PX
    : STANDARD_CARD_MAX_WIDTH_PX;
}

function minCardWidth(cardSize: GalleryCardSize): number {
  if (cardSize === "reading") return READING_CARD_MIN_WIDTH_PX;
  return cardSize === "compact"
    ? COMPACT_CARD_MIN_WIDTH_PX
    : STANDARD_CARD_MIN_WIDTH_PX;
}

function fallbackCardWidth(
  frame: GalleryFrame,
  cardSize: GalleryCardSize,
  columnCount: number,
  spacing: GallerySpacing,
  columnGap: string,
): string {
  const minWidth = minCardWidth(cardSize);
  const maxWidth = maxCardWidth(cardSize);
  const edgeReserve =
    frame === "floating"
      ? spacing === "compact"
        ? token("--space-xxs")
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

function bodyPaddingFor(spacing: GallerySpacing): string {
  if (spacing === "compact") return token("--space-s");
  return token("--space-2xl");
}

function panelHeaderSpacingFor(
  spacing: GallerySpacing,
): GlassPanelHeaderSpacing {
  if (spacing === "compact") return "compact";
  return "regular";
}

function gridGapFor(spacing: GallerySpacing): string {
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
  readonly frame: GalleryFrame;
  readonly columnCount: number;
  readonly cardSize: GalleryCardSize;
  readonly spacing: GallerySpacing;
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
      const gridStyle =
        grid === null ? bodyStyle : window.getComputedStyle(grid);
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
        root
          .querySelector<HTMLElement>("[data-gallery-toolbar]")
          ?.getBoundingClientRect().height ?? 0;
      const footerHeight =
        root
          .querySelector<HTMLElement>("[data-glass-panel-footer]")
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

function cardPickerFooterButton(
  action: CardPickerFooterAction,
  placement: GlassControlPlacement,
  key?: string,
): ReactElement {
  const glyph: Glyph | undefined = action.glyph;
  return (
    <GlassButton key={key} {...action} glyph={glyph} placement={placement} />
  );
}

/** Private fitted card-gallery surface shared by the two public product roles. */
function CardGallerySurface<EntryId extends string>({
  title,
  subtitle,
  rightAccessory,
  footerActions,
  toolbar,
  cards,
  emptyLabel,
  columns,
  cardSize,
  frame,
  spacing,
  heightMode,
  role,
  testId,
  onCardPress,
  onCardDragStart,
  onCardDragEnd,
  onCardContextMenu,
  onCardDoubleTap,
  endAction,
  onEndActionPress,
}: CardGallerySurfaceProps<EntryId>): ReactElement {
  const resolve = useLocalizer();
  const pendingCardTapsRef = useRef(new Map<EntryId, number>());
  const cancelPendingCardTap = (entryId: EntryId): void => {
    const timer = pendingCardTapsRef.current.get(entryId);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    pendingCardTapsRef.current.delete(entryId);
  };
  const handleCardActivate = (entryId: EntryId): void => {
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
  useEffect(
    () => () => {
      for (const timer of pendingCardTapsRef.current.values()) {
        window.clearTimeout(timer);
      }
      pendingCardTapsRef.current.clear();
    },
    [],
  );
  const accessoryPlacement: GlassControlPlacement =
    frame === "fullBleed" ? "onMedia" : "onGlass";
  const columnCount = renderedColumnCount(columns);
  const itemCount = cards.length + (endAction === undefined ? 0 : 1);
  const rowCount = rowCountFor(itemCount, columnCount);
  const fallbackVisibleRows = plannedVisibleRows(rowCount);
  const fallbackVisibleGapSlots = gapSlotsFor(fallbackVisibleRows);
  const hasCaptions =
    endAction !== undefined || cards.some((card) => card.caption !== undefined);
  const hasStackedCopy = cards.some((card) => card.stackedCopy !== undefined);
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
              cardPickerFooterButton(action, accessoryPlacement, action.testId),
            )}
          </div>
        ) : (
          cardPickerFooterButton(footerActions[0], accessoryPlacement)
        )}
      </div>
    ) : undefined;

  const toolbarGap = token("--space-s");
  const toolbarNode =
    toolbar === undefined ? null : (
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
      data-gallery-role={role}
      data-gallery-frame={frame}
      data-gallery-columns={columnCount}
      data-gallery-visible-rows={visibleRows}
      data-gallery-spacing={spacing}
      data-gallery-card-size={cardSize}
      data-gallery-height-mode={heightMode}
      data-gallery-reserves-stacked-copy={hasStackedCopy || undefined}
      style={{
        position: "relative",
        boxSizing: "border-box",
        display:
          frame === "floating" && heightMode === "fill" ? "grid" : undefined,
        alignItems:
          frame === "floating" && heightMode === "fill" ? "center" : undefined,
        width: frame === "fullBleed" ? "100%" : `min(${panelWidth}, 100%)`,
        maxWidth: "100%",
        minWidth: 0,
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
        cutoutAwareAccessory={frame === "fullBleed"}
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
                {resolve(
                  emptyLabel ??
                    tx(
                      "No cards.",
                      "[battle] Empty state shared by card galleries and battle-zone browsers.",
                    ),
                )}
              </p>
            </div>
          ) : (
            <CardChoiceGrid<EntryId>
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

/** @internal Shared renderer used by the public role components. */
export const cardGallerySurface = CardGallerySurface;
