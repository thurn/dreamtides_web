// MobileDeckViewer — the narrow-viewport Tango rendering of the player's deck.
//
// The deck is shown as a scrolling grid of full cards, four across. At that
// size the cards' rules text is present but small, so the screen's whole job is
// the press zoom: press a card and a fully legible copy appears instantly at
// the top of the screen, shifted off the finger so its rules text is readable
// while the finger is still down; it snaps away on release. The rest of the
// screen is left untouched (no scrim, no dimming). Dragging past a small slop
// dismisses the zoom so the grid scrolls, so browsing and inspecting never
// fight.
//
// The top of the screen holds a lean control band: a centered "Your Deck" title,
// the corner close control, and two dropdown buttons on one line — a filter
// button
// (All / Characters / Events, plus a per-subtype option for any subtype the deck
// is heavy in) and a sort button (Name, Drafted, Cost, Spark, Subtype — every
// sort low to high). All four buttons (the glass-disc close control, the
// elevated dreamscape menu that floats in from the App shell, and the glass
// filter/sort controls) wear the one shared liquid-glass surface, so the band
// reads as a set. Filter and sort are local presentation state; the pure
// `mobile-deck-filter` module derives both the available filter options and the
// visible grid from the full deck and that state.
//
// PURE: renders from a view-model and reports dismissal through `onClose`. All
// state here is local presentation state (which card is being peeked, the
// filter/sort selection). The
// finger-clearing placement math lives in the unit-tested `mobile-deck-peek`
// module, whose guarantee is proven over a full touch-point sweep by
// scripts/deck-peek-clearance-analysis.mjs.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CardData } from "../../types/cards";
import type { CardTransfigurationDisplay } from "../../runtime/transfiguration-display";
import { GameCard } from "../components/card/CardView";
import { Pressable } from "../primitives/Pressable";
import { glassSurfaceStyle } from "../components/controls/glass-surface";
import { GlowIcon } from "../components/controls/GlowIcon";
import { Select } from "../components/controls/Select";
import { glassIconButtonChrome } from "../components/controls/control-treatment";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { CARD_ASPECT_RATIO_VALUE } from "../components/card/card-aspect";
import {
  computePeekBox,
  peekWidthForViewport,
  type PeekRect,
} from "./mobile-deck-peek";
import {
  type DeckControlOption,
  type DeckFilterSort,
  type DeckSortId,
  type DeckTypeFilter,
  DECK_SORT_OPTIONS,
  DEFAULT_DECK_FILTER_SORT,
  buildDeckTypeFilterOptions,
  deckSortLabel,
  deckTypeFilterLabel,
  filterAndSortDeckCards,
} from "./mobile-deck-filter";

/** One deck card, resolved for display (transfiguration/type/stat applied). */
export interface DeckCardView {
  /** Stable key for the deck entry — unique even across duplicate names. */
  entryId: string;
  /** The fully resolved card data, rendered by `GameCard` (resolved by UUID). */
  card: CardData;
  /** Display descriptor painting the card as transfigured, when it is one. */
  transfiguration?: CardTransfigurationDisplay;
  /** True when the entry is a bane, marked with a corner glyph. */
  isBane: boolean;
}

/** The full view-model the screen renders. */
export interface MobileDeckView {
  /** The deck's cards in display order. */
  cards: DeckCardView[];
}

/** Props for {@link MobileDeckViewer}. */
export interface MobileDeckViewerProps {
  view: MobileDeckView;
  /** Dismiss the whole deck viewer. */
  onClose: () => void;
}

/** Cards per row. Four across is dense enough to scan a deck at a glance. */
const COLUMNS = 4;

/**
 * How far (px) the pointer may drift from the touch point before the press is
 * reclassified as a scroll and the zoom is dismissed, letting the grid scroll.
 * The zoom itself appears immediately on press-down; this only tears it back
 * down once a drag is clearly underway.
 */
const MOVE_SLOP_PX = 10;

/**
 * Reads a length token's resolved pixel value off the `.tango` root, for the
 * finger-avoidance math (which needs real numbers, not `var()` strings). The
 * safe-area and spacing tokens used here all resolve to plain `px`.
 */
function readLengthToken(name: `--${string}`): number {
  if (typeof window === "undefined") return 0;
  const host = document.querySelector(".tango") ?? document.documentElement;
  const raw = getComputedStyle(host).getPropertyValue(name);
  return Number.parseFloat(raw) || 0;
}

/** The card currently being pressed, with the geometry to render its zoom. */
interface PeekState {
  view: DeckCardView;
  box: PeekRect;
  /** The touch point that summoned it, tracked so a drag can dismiss it. */
  pointerId: number;
  startX: number;
  startY: number;
}

/**
 * The narrow-viewport deck viewer: a control band (title, count, close, and the
 * filter/sort controls), then a press-to-zoom grid of the deck's cards.
 */
export function MobileDeckViewer({ view, onClose }: MobileDeckViewerProps) {
  const [peek, setPeek] = useState<PeekState | null>(null);
  const [filterSort, setFilterSort] = useState<DeckFilterSort>(
    DEFAULT_DECK_FILTER_SORT,
  );

  // The type-filter menu is derived from the deck itself, so a deck heavy in one
  // subtype gains a one-tap filter down to it (see buildDeckTypeFilterOptions).
  const typeFilterOptions = useMemo(
    () => buildDeckTypeFilterOptions(view.cards),
    [view.cards],
  );

  const visibleCards = useMemo(
    () => filterAndSortDeckCards(view.cards, filterSort),
    [view.cards, filterSort],
  );

  const dismissPeek = useCallback(() => {
    setPeek(null);
  }, []);

  // Release anywhere dismisses the zoom and ends the press.
  useEffect(() => {
    function onUp(): void {
      dismissPeek();
    }
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dismissPeek]);

  // Escape closes the whole viewer (a zoom, if held, is released by pointerup).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Show the enlarged card the instant a card is pressed — no hold, no grow.
  // The card jumps to the top of the screen and shifts off the finger so the
  // rules text is readable while the finger is still down.
  const handleTilePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, cardView: DeckCardView) => {
      if (peek !== null || typeof window === "undefined") return;
      const sideMargin = readLengthToken("--gutter");
      const width = peekWidthForViewport({
        viewportWidth: window.innerWidth,
        sideMargin,
        columns: COLUMNS,
        columnGap: readLengthToken("--space-4"),
      });
      // Anchor the finger to the pressed card's center: the modelled occlusion
      // circle covers the whole tile, so the placement clears it wherever on the
      // card the finger actually landed.
      const tile = e.currentTarget.getBoundingClientRect();
      const box = computePeekBox({
        viewport: { width: window.innerWidth, height: window.innerHeight },
        safeTop: readLengthToken("--safe-top"),
        safeBottom: readLengthToken("--safe-bottom"),
        sideMargin,
        aspect: CARD_ASPECT_RATIO_VALUE,
        width,
        finger: { x: tile.left + tile.width / 2, y: tile.top + tile.height / 2 },
      });
      setPeek({
        view: cardView,
        box,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
      });
    },
    [peek],
  );

  // A drift past the slop means the finger is scrolling, not inspecting — drop
  // the zoom and let the grid scroll.
  const handleGridPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (peek === null || peek.pointerId !== e.pointerId) return;
      const dx = e.clientX - peek.startX;
      const dy = e.clientY - peek.startY;
      if (Math.hypot(dx, dy) > MOVE_SLOP_PX) dismissPeek();
    },
    [peek, dismissPeek],
  );

  return (
    <div
      className="tango"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Frosted-glass backdrop: the dreamscape behind blurs through, the same
          liquid-glass recipe GroupPanel uses (fill + blur/saturate only — the
          card's rim/radius/shadow are dropped for a full-bleed surface). Kept a
          separate, un-faded layer so an ancestor opacity never flattens the
          subtree and starves the backdrop-filter of a scene to sample. */}
      <GlassBackdrop />

      <TopBand
        onClose={onClose}
        controls={
          <DeckControls
            filterSort={filterSort}
            typeFilterOptions={typeFilterOptions}
            onFilterSortChange={setFilterSort}
          />
        }
      />

      <div
        onPointerMove={handleGridPointerMove}
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: `${token("--space-5")} ${token("--gutter")} calc(${token(
            "--safe-bottom",
          )} + ${token("--space-6")})`,
        }}
      >
        {view.cards.length === 0 ? (
          <EmptyDeck />
        ) : visibleCards.length === 0 ? (
          <NoMatches />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${String(COLUMNS)}, 1fr)`,
              gap: token("--space-4"),
            }}
          >
            {visibleCards.map((cardView) => (
              <DeckTile
                key={cardView.entryId}
                cardView={cardView}
                onPointerDown={handleTilePointerDown}
              />
            ))}
          </div>
        )}
      </div>

      {peek !== null && <PeekOverlay peek={peek} />}
    </div>
  );
}

/**
 * The full-bleed frosted-glass backdrop behind the deck. Reuses the shared
 * liquid-glass recipe but takes only its fill and blur/saturate backdrop — the
 * card's rim, radius, and drop shadow are card affordances that do not belong
 * on an edge-to-edge surface — so the dreamscape behind refracts through as
 * glass without a floating panel border at the screen edges.
 */
function GlassBackdrop() {
  const glass = glassSurfaceStyle();
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: glass.background,
        backdropFilter: glass.backdropFilter,
        WebkitBackdropFilter: glass.WebkitBackdropFilter,
      }}
    />
  );
}

/** Height reserved for a corner control button, matching the close control. */
const CONTROL_BUTTON_PX = 48;

/**
 * The top band: a centered "Your Deck" title, the corner close control, and the
 * filter/sort `controls` row. The top-left corner is left clear for the
 * dreamscape utility menu, which lifts above this overlay while it is open (see
 * `DreamscapeQuestMenu`'s `elevated`) and wears the same glass surface; the
 * close control on the right is a matching glass disc. The title sits centered
 * between them, dropping in just below the device's screen cutout (notch /
 * Dynamic Island / punch-hole) — the band's top padding already clears the
 * cutout — so it names the screen without fighting the hardware. A neutral
 * hairline at the strong step closes the band.
 */
function TopBand({
  onClose,
  controls,
}: {
  onClose: () => void;
  controls: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        flexShrink: 0,
        // Align the corner controls with the floating utility menu: clear the
        // notch on notched hardware, else a small top margin (no dead band on a
        // no-notch phone like the SE).
        paddingTop: `max(env(safe-area-inset-top, ${token("--gutter")}), ${token(
          "--gutter",
        )})`,
        paddingLeft: token("--gutter"),
        paddingRight: token("--gutter"),
        paddingBottom: token("--space-4"),
        // A neutral hairline closing the band, at the strong step so it reads
        // clearly over the scene art the deck floats on.
        borderBottom: `1px solid ${token("--border-strong")}`,
      }}
    >
      {/* Corner row: the "Your Deck" title centered under the screen cutout, the
          close control anchored at the right corner, and the left corner left
          empty for the elevated dreamscape menu. */}
      <div style={{ position: "relative", minHeight: CONTROL_BUTTON_PX }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            font: token("--t-title-sm"),
            color: token("--text-primary"),
            pointerEvents: "none",
          }}
        >
          Your Deck
        </div>
        <Pressable
          as="button"
          aria-label="Close deck"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: CONTROL_BUTTON_PX,
            height: CONTROL_BUTTON_PX,
            color: token("--text-primary"),
            display: "grid",
            placeItems: "center",
            fontSize: 26,
            cursor: "pointer",
            ...glassIconButtonChrome(),
          }}
        >
          <GlowIcon iconClass={GLYPHS.close} color="text-primary" size="1em" />
        </Pressable>
      </div>

      {/* The filter/sort control row. */}
      <div style={{ marginTop: token("--space-5") }}>{controls}</div>
    </div>
  );
}

/**
 * The deck's filter + sort controls: two glass dropdown buttons on a single
 * line — a filter button (a funnel glyph and the current type) at the leading
 * edge and a sort button (up/down arrows and the current order) at the trailing
 * edge. There is no segmented slider: a mobile band has room for two compact
 * buttons, not a three-way switch plus a dropdown.
 */
function DeckControls({
  filterSort,
  typeFilterOptions,
  onFilterSortChange,
}: {
  filterSort: DeckFilterSort;
  typeFilterOptions: DeckControlOption<DeckTypeFilter>[];
  onFilterSortChange: (next: DeckFilterSort) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "nowrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: token("--space-3"),
      }}
    >
      <Select
        size="sm"
        leadingGlyph={GLYPHS.filter}
        align="start"
        ariaLabel={`Filter: ${deckTypeFilterLabel(
          filterSort.typeFilter,
          typeFilterOptions,
        )}`}
        options={typeFilterOptions.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        value={filterSort.typeFilter}
        onChange={(value) =>
          onFilterSortChange({
            ...filterSort,
            typeFilter: value as DeckTypeFilter,
          })
        }
      />
      <Select
        size="sm"
        leadingGlyph={GLYPHS.sort}
        align="end"
        ariaLabel={`Sort: ${deckSortLabel(filterSort.sort)}`}
        options={DECK_SORT_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          triggerLabel: option.triggerLabel,
        }))}
        value={filterSort.sort}
        onChange={(value) =>
          onFilterSortChange({ ...filterSort, sort: value as DeckSortId })
        }
      />
    </div>
  );
}

/** One grid tile: the full card (rules text and all) that pops the zoom the
 *  instant it is pressed, enlarged to a comfortably legible size. */
function DeckTile({
  cardView,
  onPointerDown,
}: {
  cardView: DeckCardView;
  onPointerDown: (
    e: React.PointerEvent<HTMLElement>,
    cardView: DeckCardView,
  ) => void;
}) {
  return (
    <Pressable
      as="button"
      aria-label={cardView.card.name}
      onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
        onPointerDown(e, cardView);
      }}
      onContextMenu={(e: React.MouseEvent) => {
        // Suppress the OS long-press callout so a held press reads as a zoom.
        e.preventDefault();
      }}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        borderRadius: token("--radius-card"),
        // A bane card wears a danger ring so a corrupted card is legible even at
        // tile size, without inventing a new glyph.
        boxShadow: cardView.isBane
          ? `0 0 0 2px ${token("--danger")}`
          : "none",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        touchAction: "pan-y",
      }}
    >
      <GameCard
        card={cardView.card}
        transfiguration={cardView.transfiguration}
        suppressHoverHelp
      />
    </Pressable>
  );
}

/**
 * The held zoom: just the enlarged card, portaled above the grid and shown
 * instantly at its placed box — no grow, no fade. Nothing else on screen is
 * touched (no scrim, no dimming), so the deck stays fully visible behind it.
 * Purely visual (`pointer-events: none`) so the finger that summoned it is never
 * intercepted; the press is tracked entirely on the grid underneath.
 */
function PeekOverlay({ peek }: { peek: PeekState }) {
  return createPortal(
    <div
      className="tango"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: peek.box.left,
          top: peek.box.top,
          width: peek.box.width,
          filter: `drop-shadow(${token("--shadow-card")})`,
        }}
      >
        <GameCard
          card={peek.view.card}
          transfiguration={peek.view.transfiguration}
          large
          suppressHoverHelp
        />
      </div>
    </div>,
    document.body,
  );
}

/** Shown when the deck has no cards. */
function EmptyDeck() {
  return <GridPlaceholder message="Your deck is empty." />;
}

/** Shown when a filter hides every card in a non-empty deck. */
function NoMatches() {
  return <GridPlaceholder message="No cards match this filter." />;
}

/** The centered muted message shared by the empty / no-match grid states. */
function GridPlaceholder({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "40vh",
        font: token("--t-body"),
        color: token("--text-muted"),
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}
