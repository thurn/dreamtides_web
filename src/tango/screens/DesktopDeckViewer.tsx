// DesktopDeckViewer — the wide-viewport Tango rendering of the player's deck.
//
// On desktop the deck is a FULL-SCREEN viewer: one liquid-glass surface fills
// the whole viewport, so its frosted blur covers everything behind it. The
// deck's content is grouped and centered inside a width cap so it stays readable
// rather than stretching edge-to-edge on an ultrawide display. Clicking the
// blurred margin around the content, or pressing Escape, dismisses it.
//
// The viewer is three regions:
//   - a header naming the screen and carrying the corner close disc;
//   - a LEFT SIDEBAR profiling the run — the Dreamcaller's portrait, name,
//     title, and rules text, then the collected dreamsigns as hoverable art;
//   - the MAIN column: a control bar, then a scrolling grid of the deck's cards.
//
// The desktop control bar spends the room the mobile band lacks on granular,
// separate controls (rather than a bigger copy of the mobile two-dropdown row):
// a card-type segmented switch, a subtype dropdown, a sort-key dropdown, a sort
// DIRECTION toggle, and an S/M/L card-size toggle. Every control wears the one
// shared liquid-glass surface (SegmentedControl / Select), so the whole bar
// reads as a set with the header's glass close disc and the surface it sits on.
//
// A card grows in place on HOVER (HoverZoomCard) — the desktop analog of the
// mobile press-zoom — bringing its rules text to a legible size and stacking the
// glossary definitions beside it, without a separate preview surface.
//
// PURE: renders from a view-model and reports dismissal through `onClose`. The
// filter/sort/size selection is local presentation state, and the derivation
// from "the whole deck + that state" to "the visible grid" lives in the pure,
// tested `desktop-deck-filter` module.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import type { Dreamsign as DreamsignData } from "../../types/quest";
import { GameCard } from "../components/card/CardView";
import { HoverZoomCard } from "../components/card/HoverZoomCard";
import { CARD_ASPECT_RATIO_VALUE } from "../components/card/card-aspect";
import {
  DreamcallerPortrait,
  type DreamcallerVisual,
} from "../components/hud/DreamcallerPortrait";
import { Dreamsign } from "../components/hud/Dreamsign";
import { RulesText } from "../components/card/RulesText";
import { Pressable } from "../primitives/Pressable";
import { Select } from "../components/controls/Select";
import { SegmentedControl } from "../components/controls/SegmentedControl";
import { GlowIcon } from "../components/controls/GlowIcon";
import { glassSurfaceStyle } from "../components/controls/glass-surface";
import { glassIconButtonChrome } from "../components/controls/control-treatment";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type { DeckCardView } from "./MobileDeckViewer";
import {
  type DesktopDeckFilterSort,
  type DeckCardSize,
  DECK_CARD_SIZE_OPTIONS,
  DECK_CARD_SIZE_PX,
  DECK_SORT_OPTIONS,
  DECK_TYPE_TOGGLE_OPTIONS,
  DEFAULT_DESKTOP_DECK_FILTER_SORT,
  SORT_DIRECTION_OPTIONS,
  buildSubtypeFilterOptions,
  filterAndSortDesktopDeckCards,
} from "./desktop-deck-filter";

/** The Dreamcaller shown in the sidebar: the portrait's visual plus rules text. */
export interface DeckDreamcallerView extends DreamcallerVisual {
  /** The Dreamcaller's ability text, rendered through the shared RulesText. */
  renderedText: string;
}

/** The full view-model the desktop viewer renders. */
export interface DesktopDeckView {
  /** The deck's cards in acquisition order. */
  cards: DeckCardView[];
  /** The run's Dreamcaller, or null before one is chosen. */
  dreamcaller: DeckDreamcallerView | null;
  /** The dreamsigns collected so far, in collection order. */
  dreamsigns: DreamsignData[];
  /** The run's dreamsign cap. */
  maxDreamsigns: number;
}

/** Props for {@link DesktopDeckViewer}. */
export interface DesktopDeckViewerProps {
  view: DesktopDeckView;
  /** Dismiss the whole deck viewer. */
  onClose: () => void;
}

/**
 * Content width cap (box measure — content-driven layout, not token spacing).
 * The full-screen glass fills the viewport; this caps the width of the content
 * grouped inside it so it stays readable and centered rather than stretching
 * edge-to-edge on an ultrawide display.
 */
const CONTENT_MAX_WIDTH_PX = 1180;

/** Fixed width of the left profile sidebar. */
const SIDEBAR_WIDTH_PX = 268;

/** Edge length of a collected-dreamsign art tile in the sidebar. */
const DREAMSIGN_TILE_PX = 62;

/** Fixed width of the Dreamcaller portrait in the sidebar profile. */
const DREAMCALLER_PORTRAIT_PX = 196;

/** Edge length of the corner close disc, matching the glass control height. */
const CLOSE_BUTTON_PX = 40;

/**
 * Hover target widths (px) for each card-size preset. Small keeps the original
 * target so tiny cards still enlarge enough to read; medium steps down to keep
 * MacBook-sized desktop cards from jumping to the max scale.
 */
const HOVER_TARGET_WIDTH_PX: Readonly<Record<DeckCardSize, number>> = {
  small: 340,
  medium: 300,
  large: 340,
};

/**
 * The desktop deck viewer: a full-screen liquid-glass surface whose frosted
 * blur covers the whole viewport, with the run's deck — a header, a profile
 * sidebar, and a filtered, sortable, resizable grid — grouped and centered
 * inside a width cap. An outside press (the blurred margin) or Escape closes it.
 */
export function DesktopDeckViewer({ view, onClose }: DesktopDeckViewerProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [filterSort, setFilterSort] = useState<DesktopDeckFilterSort>(
    DEFAULT_DESKTOP_DECK_FILTER_SORT,
  );

  const subtypeOptions = useMemo(
    () => buildSubtypeFilterOptions(view.cards),
    [view.cards],
  );

  const visibleCards = useMemo(
    () => filterAndSortDesktopDeckCards(view.cards, filterSort),
    [view.cards, filterSort],
  );

  // Escape closes the whole viewer.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = useCallback((patch: Partial<DesktopDeckFilterSort>) => {
    setFilterSort((prev) => ({ ...prev, ...patch }));
  }, []);

  return (
    <div
      ref={stageRef}
      className="tango"
      // A transparent host: the frosted glass is a separate sibling backdrop
      // layer (GlassBackdrop) so the filter/sort controls, which are its
      // siblings, sample the raw scene through their own backdrop-filter and
      // frost it once — matching the mobile viewer. An ancestor glass surface
      // would double-frost the controls (its plum tint stacked twice), reading
      // as a deep-plum fill instead of the warm scene-tinted glass. An outside
      // press — on the blurred margin around the centered content — dismisses
      // the viewer.
      onPointerDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "grid",
        placeItems: "center",
        padding: token("--space-7"),
      }}
    >
      <GlassBackdrop />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your deck"
        // Presses inside the content never reach the surface, so only an outside
        // press closes.
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        style={{
          // Lift the content above the z0 backdrop layer so it is not itself
          // frosted by the backdrop.
          position: "relative",
          zIndex: 1,
          // Group the content toward the center inside a width cap so it stays
          // readable rather than stretching edge-to-edge on an ultrawide display.
          width: `min(${String(CONTENT_MAX_WIDTH_PX)}px, 100%)`,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Header count={view.cards.length} onClose={onClose} />
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <Sidebar
            dreamcaller={view.dreamcaller}
            dreamsigns={view.dreamsigns}
            maxDreamsigns={view.maxDreamsigns}
            stageRef={stageRef}
          />
          <main
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <ControlBar
              filterSort={filterSort}
              subtypeOptions={subtypeOptions}
              onChange={update}
            />
            <DeckGrid
              cards={view.cards}
              visible={visibleCards}
              size={filterSort.size}
            />
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * The full-bleed frosted-glass backdrop behind the deck. Takes only the fill
 * and blur/saturate backdrop from the shared liquid-glass recipe — the rim,
 * radius, and drop shadow are dropped for an edge-to-edge surface. Kept a
 * separate z0 sibling of the content (rather than a style on the host
 * container) so the filter/sort controls frost the scene directly instead of
 * double-frosting an ancestor glass surface.
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

/** A small uppercase monospaced section eyebrow. */
function Eyebrow({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "primary" | "secondary";
}) {
  return (
    <div
      style={{
        font: token("--t-eyebrow"),
        letterSpacing: token("--tracking-eyebrow"),
        textTransform: "uppercase",
        color: token(tone === "primary" ? "--text-on-accent" : "--text-secondary"),
      }}
    >
      {children}
    </div>
  );
}

/** The sidebar's consistent section header: label first, metadata tucked right. */
function SidebarSectionHeader({
  label,
  meta,
}: {
  label: string;
  meta?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: token("--space-3"),
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      {meta !== undefined && (
        <div style={{ font: token("--t-caption"), color: token("--text-secondary") }}>
          {meta}
        </div>
      )}
    </div>
  );
}

/**
 * The panel header: the "Your Deck" title with a card-count eyebrow, and the
 * corner close disc wearing the shared glass surface.
 */
function Header({ count, onClose }: { count: number; onClose: () => void }) {
  return (
    <header
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: token("--space-5"),
        padding: `${token("--space-6")} ${token("--space-7")}`,
      }}
    >
      <div
        style={{ display: "flex", flexDirection: "column", gap: token("--space-1") }}
      >
        <h2
          style={{ margin: 0, font: token("--t-title"), color: token("--text-primary") }}
        >
          Your Deck
        </h2>
        <Eyebrow>
          {count} {count === 1 ? "Card" : "Cards"}
        </Eyebrow>
      </div>
      <Pressable
        as="button"
        aria-label="Close deck"
        onClick={onClose}
        style={{
          width: CLOSE_BUTTON_PX,
          height: CLOSE_BUTTON_PX,
          display: "grid",
          placeItems: "center",
          fontSize: 22,
          color: token("--text-primary"),
          cursor: "pointer",
          ...glassIconButtonChrome(),
        }}
      >
        <GlowIcon iconClass={GLYPHS.close} color="text-primary" size="1em" />
      </Pressable>
    </header>
  );
}

/**
 * The left profile sidebar: the run's Dreamcaller (portrait, name, title, rules
 * text) above the collected dreamsigns as hoverable art tiles.
 */
function Sidebar({
  dreamcaller,
  dreamsigns,
  maxDreamsigns,
  stageRef,
}: {
  dreamcaller: DeckDreamcallerView | null;
  dreamsigns: DreamsignData[];
  maxDreamsigns: number;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <aside
      style={{
        width: SIDEBAR_WIDTH_PX,
        flex: "none",
        overflowY: "auto",
        padding: token("--space-6"),
        display: "flex",
        flexDirection: "column",
        gap: token("--space-7"),
      }}
    >
      {dreamcaller !== null && <DreamcallerBlock dreamcaller={dreamcaller} />}
      <DreamsignsBlock
        dreamsigns={dreamsigns}
        maxDreamsigns={maxDreamsigns}
        stageRef={stageRef}
      />
    </aside>
  );
}

/** The Dreamcaller profile: portrait, name, title, and rules text. */
function DreamcallerBlock({ dreamcaller }: { dreamcaller: DeckDreamcallerView }) {
  return (
    <section
      style={{ display: "flex", flexDirection: "column", gap: token("--space-3") }}
    >
      <SidebarSectionHeader label="Dreamcaller" />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <DreamcallerPortrait
          dreamcaller={dreamcaller}
          variant="panel"
          size={DREAMCALLER_PORTRAIT_PX}
        />
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", gap: token("--space-1") }}
      >
        <div style={{ font: token("--t-title-sm"), color: token("--text-primary") }}>
          {dreamcaller.name}
        </div>
        <div style={{ font: token("--t-caption"), color: token("--text-secondary") }}>
          {dreamcaller.title}
        </div>
      </div>
      {dreamcaller.renderedText.trim() !== "" && (
        <div style={{ font: token("--t-body-sm"), color: token("--text-on-accent") }}>
          <RulesText text={dreamcaller.renderedText} />
        </div>
      )}
    </section>
  );
}

/** The collected dreamsigns as hoverable art tiles. */
function DreamsignsBlock({
  dreamsigns,
  maxDreamsigns,
  stageRef,
}: {
  dreamsigns: DreamsignData[];
  maxDreamsigns: number;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <section
      style={{ display: "flex", flexDirection: "column", gap: token("--space-4") }}
    >
      <SidebarSectionHeader
        label="Dreamsigns"
        meta={`${String(dreamsigns.length)} / ${String(maxDreamsigns)}`}
      />
      {dreamsigns.length === 0 ? (
        <div style={{ font: token("--t-body-sm"), color: token("--text-muted") }}>
          None collected yet.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(3, ${String(DREAMSIGN_TILE_PX)}px)`,
            gap: token("--space-3"),
            justifyContent: "center",
            justifyItems: "center",
          }}
        >
          {dreamsigns.map((sign, index) => (
            <Dreamsign
              key={sign.id ?? `dreamsign-${String(index)}`}
              dreamsign={sign}
              sizePx={DREAMSIGN_TILE_PX}
              stageRef={stageRef}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The desktop control bar: a single tightly-packed, left-aligned toolbar rather
 * than a widely-spaced pair of clusters — filter controls (type switch, subtype
 * dropdown) run into the sort control (sort key + direction bound as one unit),
 * and the card-size toggle is pushed to the trailing edge where a view-density
 * control conventionally lives. Every control wears the shared glass surface at
 * the compact `sm` scale, the desktop density.
 */
function ControlBar({
  filterSort,
  subtypeOptions,
  onChange,
}: {
  filterSort: DesktopDeckFilterSort;
  subtypeOptions: { value: string; label: string }[];
  onChange: (patch: Partial<DesktopDeckFilterSort>) => void;
}) {
  const showSubtypeFilter = filterSort.type !== "Event";

  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        // One even gutter between every control, so the bar packs tightly
        // instead of floating two clusters against the panel edges.
        gap: token("--space-4"),
        padding: `${token("--space-4")} ${token("--space-6")}`,
      }}
    >
      <SegmentedControl
        size="sm"
        options={DECK_TYPE_TOGGLE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        value={filterSort.type}
        onChange={(value) => {
          const type = value as DesktopDeckFilterSort["type"];
          onChange({ type, subtype: type === "Event" ? "all" : filterSort.subtype });
        }}
      />
      {showSubtypeFilter && (
        <Select
          size="sm"
          leadingGlyph={GLYPHS.filter}
          align="start"
          ariaLabel="Filter by subtype"
          options={subtypeOptions}
          value={filterSort.subtype}
          onChange={(value) => onChange({ subtype: value })}
        />
      )}
      {/* Sort key + direction bound with a tighter inner gap than the bar's, so
          the pair reads as one sort control rather than two loose buttons. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: token("--space-2"),
        }}
      >
        <Select
          size="sm"
          leadingGlyph={GLYPHS.sort}
          align="start"
          ariaLabel="Sort order"
          options={DECK_SORT_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            triggerLabel: option.triggerLabel,
          }))}
          value={filterSort.sort}
          onChange={(value) =>
            onChange({ sort: value as DesktopDeckFilterSort["sort"] })
          }
        />
        <SegmentedControl
          size="sm"
          options={SORT_DIRECTION_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={filterSort.direction}
          onChange={(value) =>
            onChange({ direction: value as DesktopDeckFilterSort["direction"] })
          }
        />
      </div>
      {/* View density lives at the trailing edge — the auto margin is the one
          deliberate gap in the bar, separating "what to show" from "how big". */}
      <div style={{ marginLeft: "auto" }}>
        <SegmentedControl
          size="sm"
          options={DECK_CARD_SIZE_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={filterSort.size}
          onChange={(value) => onChange({ size: value as DeckCardSize })}
        />
      </div>
    </div>
  );
}

/** The scrolling deck grid, or an empty / no-match placeholder. */
function DeckGrid({
  cards,
  visible,
  size,
}: {
  cards: DeckCardView[];
  visible: DeckCardView[];
  size: DeckCardSize;
}) {
  const tileWidth = DECK_CARD_SIZE_PX[size];
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: token("--space-6"),
      }}
    >
      {cards.length === 0 ? (
        <GridPlaceholder message="Your deck is empty." />
      ) : visible.length === 0 ? (
        <GridPlaceholder message="No cards match these filters." />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${String(tileWidth)}px, 1fr))`,
            gap: token("--space-5"),
            alignItems: "start",
          }}
        >
          {visible.map((cardView) => (
            <DeckTile key={cardView.entryId} cardView={cardView} size={size} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One deck card in the grid: the full card, grown in place on hover with its
 * glossary definitions stacked beside it. A bane card wears a danger ring so a
 * corrupted card is legible at tile size.
 */
function DeckTile({
  cardView,
  size,
}: {
  cardView: DeckCardView;
  size: DeckCardSize;
}) {
  const tileStyle: CSSProperties = {
    // A fixed aspect box so the filling card resolves a height from the grid's
    // column width; the ring (if any) traces that box.
    width: "100%",
    aspectRatio: String(CARD_ASPECT_RATIO_VALUE),
    borderRadius: token("--radius-card"),
    boxShadow: cardView.isBane ? `0 0 0 2px ${token("--danger")}` : undefined,
  };
  return (
    <div style={tileStyle}>
      <HoverZoomCard
        fill
        glossaryText={cardView.card.renderedText}
        logSurface="desktop-deck-viewer"
        targetWidthPx={HOVER_TARGET_WIDTH_PX[size]}
      >
        <GameCard
          card={cardView.card}
          transfiguration={cardView.transfiguration}
          suppressHoverHelp
        />
      </HoverZoomCard>
    </div>
  );
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
