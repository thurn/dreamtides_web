// MobileDeckViewer — the narrow-viewport Tango rendering of the player's deck.
//
// The deck is shown as a scrolling grid of full cards, four across. At that
// size the cards' rules text is present but small, so the screen's whole job is
// the press zoom: hold a card stationary and a fully legible copy appears at
// the top of the screen, shifted off the finger so its rules text is readable
// while the finger is still down; it snaps away on release. The rest of the
// screen is left untouched (no scrim, no dimming). Dragging past a small slop
// cancels before the zoom mounts so the grid scrolls without preview work.
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
// finger-clearing placement math lives in the unit-tested shared card peek
// module, whose guarantee is proven over a full touch-point sweep by
// scripts/deck-peek-clearance-analysis.mjs.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CardData } from "../../types/cards";
import type { CardTransfigurationDisplay } from "../../runtime/transfiguration-display";
import { GameCard } from "../components/card/CardView";
import {
  renderMobileCardPeekOverlay,
  useMobileCardPeek,
} from "../components/card/MobileCardPeek";
import { Pressable } from "../primitives/Pressable";
import { IconButton } from "../components/controls/IconButton";
import { Select } from "../components/controls/Select";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
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
import { DeckViewerBackdrop, GridPlaceholder } from "./deck-viewer-shared";

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
 * The narrow-viewport deck viewer: a control band (title, count, close, and the
 * filter/sort controls), then a press-to-zoom grid of the deck's cards.
 */
export function MobileDeckViewer({ view, onClose }: MobileDeckViewerProps) {
  const {
    peek,
    openPeek,
    handlePointerMove: handleGridPointerMove,
    handleScroll: handleGridScroll,
  } = useMobileCardPeek({ columns: COLUMNS, columnGapToken: "--space-4" });
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

  // Escape closes the whole viewer (a zoom, if held, is released by pointerup).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleTilePointerDown = useCallback(
    (
      e: React.PointerEvent<HTMLElement>,
      cardView: DeckCardView,
      pinToTop: boolean,
    ) => {
      openPeek(e, cardView, { pinToTop });
    },
    [openPeek],
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
      {/* Standard alpha scrim: the dreamscape remains visible without blur. */}
      <DeckViewerBackdrop />

      <TopBand
        onClose={onClose}
        count={view.cards.length}
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
        onScroll={handleGridScroll}
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          overscrollBehaviorY: "contain",
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
            {visibleCards.map((cardView, index) => (
              <DeckTile
                key={cardView.entryId}
                cardView={cardView}
                pinToTop={index < COLUMNS}
                onPointerDown={handleTilePointerDown}
              />
            ))}
          </div>
        )}
      </div>

      {peek !== null && renderMobileCardPeekOverlay(peek)}
    </div>
  );
}

/** Height reserved for a corner control button, matching the close control. */
const CONTROL_BUTTON_PX = 48;

/**
 * The top band: a centered "Your Deck" title with a card-count eyebrow beneath
 * it, the corner close control, and the filter/sort `controls` row. The top-left
 * corner is left clear for the dreamscape utility menu, which lifts above this
 * overlay while it is open (see `DreamscapeQuestMenu`'s `elevated`) and wears the
 * same glass surface; the close control on the right is a matching glass disc.
 * The title sits centered between them, dropping in just below the device's
 * screen cutout (notch / Dynamic Island / punch-hole) — the band's top padding
 * already clears the cutout — so it names the screen without fighting the
 * hardware. The count reads the whole deck (`view.cards.length`), unaffected by
 * the filter, matching the desktop header's count eyebrow. A neutral hairline at
 * the strong step closes the band.
 */
function TopBand({
  onClose,
  count,
  controls,
}: {
  onClose: () => void;
  count: number;
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
        // no-notch phone like the SE). `--safe-area-inset-top` carries the real
        // inset on device and the simulated one in a screenshot mock-up.
        //
        // This reads the *hardware inset* channel, not a design floor: it must
        // reflect the actual notch so a no-notch phone reserves nothing extra
        // (the `max(…, --gutter)` supplies the minimum). The shared mobile card
        // peek deliberately reads the `--safe-top`/`--safe-bottom` design floors
        // instead.
        paddingTop: `max(var(--safe-area-inset-top), ${token("--gutter")})`,
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
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: token("--space-1"),
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              font: token("--t-title-sm"),
              color: token("--text-primary"),
            }}
          >
            Your Deck
          </div>
          {/* Card-count eyebrow: the whole deck's size, styled with the shared
              eyebrow tokens and pluralized exactly as the desktop header's count
              is. Reads `view.cards.length`, so the filter never changes it. */}
          <div
            style={{
              font: token("--t-eyebrow"),
              letterSpacing: token("--tracking-eyebrow"),
              textTransform: "uppercase",
              color: token("--text-secondary"),
            }}
          >
            {count} {count === 1 ? "Card" : "Cards"}
          </div>
        </div>
        <div style={{ position: "absolute", top: 0, right: 0 }}>
          <IconButton
            placement="onGlass"
            glyph={GLYPHS.close}
            size="md"
            label="Close deck"
            onPress={onClose}
          />
        </div>
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

/** One grid tile: a stationary hold reveals a comfortably legible zoom. */
function DeckTile({
  cardView,
  pinToTop,
  onPointerDown,
}: {
  cardView: DeckCardView;
  pinToTop: boolean;
  onPointerDown: (
    e: React.PointerEvent<HTMLElement>,
    cardView: DeckCardView,
    pinToTop: boolean,
  ) => void;
}) {
  return (
    <Pressable
      as="button"
      aria-label={cardView.card.name}
      data-card-id={cardView.card.id}
      data-deck-entry-id={cardView.entryId}
      onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
        onPointerDown(e, cardView, pinToTop);
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
        boxShadow: cardView.isBane ? `0 0 0 2px ${token("--danger")}` : "none",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        touchAction: "pan-y",
      }}
    >
      <GameCard
        card={cardView.card}
        transfiguration={cardView.transfiguration}
        termDefinitions="none"
      />
    </Pressable>
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
