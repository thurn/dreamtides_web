// DesktopDeckViewer — the wide-viewport Cumulus rendering of the player's deck.
//
// On desktop the deck is a FULL-SCREEN viewer: one black alpha scrim fills the
// whole viewport while leaving the unblurred scene visible beneath it. The
// deck's content is grouped and centered inside a width cap so it stays readable
// rather than stretching edge-to-edge on an ultrawide display. Clicking the
// dark margin around the content, or pressing Escape, dismisses it.
//
// The viewer is three regions:
//   - a header naming the screen and carrying the corner close disc;
//   - a LEFT SIDEBAR profiling the run — the DreamAvatar as a bare portrait
//     that reveals its name, title, and ability on hover / press through the
//     shared InfoCard (the same reveal the quest status bar's DreamAvatar bust
//     uses), then the collected dreamsigns as hoverable art;
//   - the MAIN column: a control bar, then a scrolling grid of the deck's cards.
//
// The desktop control bar spends the room the mobile band lacks on granular,
// separate controls (rather than a bigger copy of the mobile two-dropdown row):
// a card-type segmented switch, a subtype dropdown, a sort-key dropdown, a sort
// DIRECTION switch, and an S/M/L card-size toggle. Every control wears the one
// shared liquid-glass surface (SegmentedControl / Select), so the whole bar
// reads as a set with the header's glass close disc and the surface it sits on.
//
// A card grows in place on hover, bringing its rules text to a legible size and
// stacking the glossary definitions beside it, without a separate preview
// surface.
//
// PURE: renders from a view-model and reports dismissal through `onClose`. The
// filter/sort/size selection is local presentation state, and the derivation
// from "the whole deck + that state" to "the visible grid" lives in the pure,
// tested `desktop-deck-filter` module.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { requireDreamsignId } from "../../data/dreamsigns";
import type { Dreamsign as DreamsignData } from "../../types/quest";
import { GameCard } from "../components/card/CardView";
import { CARD_ASPECT_RATIO_VALUE } from "../components/card/card-aspect";
import {
  DreamAvatarPortrait,
  type DreamAvatarVisual,
} from "../components/hud/DreamAvatarPortrait";
import { Dreamsign } from "../components/hud/Dreamsign";
import { Select } from "../components/controls/Select";
import { SegmentedControl } from "../components/controls/SegmentedControl";
import { IconButton } from "../components/controls/IconButton";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type { DeckCardView } from "./MobileDeckViewer";
import { DeckViewerBackdrop, GridPlaceholder } from "./deck-viewer-shared";
import {
  type DesktopDeckFilterSort,
  type DeckCardSize,
  DECK_CARD_SIZE_OPTIONS,
  DECK_CARD_SIZE_PX,
  DECK_SORT_OPTIONS,
  DECK_TYPE_TOGGLE_OPTIONS,
  DEFAULT_DESKTOP_DECK_FILTER_SORT,
  buildSubtypeFilterOptions,
  filterAndSortDesktopDeckCards,
} from "./desktop-deck-filter";

/** The DreamAvatar shown in the sidebar: the portrait's visual plus rules text. */
export interface DeckDreamAvatarView extends DreamAvatarVisual {
  /** Stable DreamAvatar UUID. */
  id: string;
  /** The DreamAvatar's ability text, revealed through the shared InfoCard. */
  renderedText: string;
}

/** The full view-model the desktop viewer renders. */
export interface DesktopDeckView {
  /** The deck's cards in acquisition order. */
  cards: DeckCardView[];
  /** The run's DreamAvatar, or null before one is chosen. */
  dreamAvatar: DeckDreamAvatarView | null;
  /** The dreamsigns collected so far, in collection order. */
  dreamsigns: DreamsignData[];
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

/**
 * Edge length of a collected-dreamsign art tile in the sidebar. Two tiles sit
 * side by side in one row of the left-aligned two-column grid, hugging the
 * sidebar's left edge with room to spare.
 */
const DREAMSIGN_TILE_PX = 92;

/**
 * Edge length of the DreamAvatar portrait in the sidebar. Matched to a
 * dreamsign tile so the run's collectibles — the DreamAvatar and its
 * dreamsigns — read at one consistent scale down the column.
 */
const DREAM_AVATAR_PORTRAIT_PX = DREAMSIGN_TILE_PX;

/**
 * The desktop deck viewer: a full-screen alpha scrim over the unblurred scene,
 * with the run's deck — a header, a profile sidebar, and a filtered, sortable,
 * resizable grid — grouped and centered inside a width cap. An outside press
 * (the dark margin) or Escape closes it.
 */
export function DesktopDeckViewer({ view, onClose }: DesktopDeckViewerProps) {
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
      className="cumulus"
      // A transparent host: the black alpha scrim is a separate sibling layer,
      // leaving the scene unblurred while the controls retain their own glass
      // treatment. An outside press on the dark margin around the centered
      // content dismisses the viewer.
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
      <DeckViewerBackdrop />
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
          // Lift the content above the z0 backdrop layer.
          position: "relative",
          zIndex: 1,
          // Group the content toward the center inside a width cap so it stays
          // readable rather than stretching edge-to-edge on an ultrawide display.
          width: `min(${String(CONTENT_MAX_WIDTH_PX)}px, 100%)`,
          height: "100%",
          // Override the flex/grid automatic min-height (min-content) so the
          // full-height content honours `height: 100%` instead of growing to fit
          // the whole deck — that overflow pushed the card grid past the viewport
          // bottom and left it unable to scroll. With this the inner grid is
          // bounded and scrolls within the viewport.
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Header count={view.cards.length} onClose={onClose} />
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <Sidebar
            dreamAvatar={view.dreamAvatar}
            dreamsigns={view.dreamsigns}
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

/** The sidebar's consistent section header: an uppercase eyebrow label. */
function SidebarSectionHeader({ label }: { label: string }) {
  return <Eyebrow>{label}</Eyebrow>;
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
      <IconButton
        placement="onGlass"
        glyph={GLYPHS.close}
        size="sm"
        label="Close deck"
        onPress={onClose}
      />
    </header>
  );
}

/**
 * The left profile sidebar: the run's DreamAvatar (portrait, name, title, rules
 * text) above the collected dreamsigns as hoverable art tiles.
 */
function Sidebar({
  dreamAvatar,
  dreamsigns,
}: {
  dreamAvatar: DeckDreamAvatarView | null;
  dreamsigns: DreamsignData[];
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
      {dreamAvatar !== null && (
        <DreamAvatarBlock dreamAvatar={dreamAvatar} />
      )}
      <DreamsignsBlock dreamsigns={dreamsigns} />
    </aside>
  );
}

/**
 * The DreamAvatar profile: a bare portrait alone, with its name, title, and
 * ability tucked into a hover / press reveal instead of laid out beneath it.
 * The reveal is the shared InfoCard `fullBleed` variant driven by the one
 * press-reveal engine (hover on a fine pointer, press-hold on touch) and
 * portalled into the screen stage — the same reveal the quest status bar's
 * DreamAvatar bust uses, so the two read identically.
 */
function DreamAvatarBlock({
  dreamAvatar,
}: {
  dreamAvatar: DeckDreamAvatarView;
}) {
  return (
    <section
      style={{ display: "flex", flexDirection: "column", gap: token("--space-6") }}
    >
      <SidebarSectionHeader label="Avatar" />
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        {/* The portrait itself is the reveal trigger: Pressable owns the one
            shared press/hover scale, while the reveal coordinator (its pointer handlers
            chained through) owns the show/hide of the portalled InfoCard. The
            button carries the accent frame — the same 2px violet border, glow,
            and control radius the quest status bar's DreamAvatar bust wears — so
            the two portraits read as the same object; `overflow: hidden` clips
            the art to that rounded frame. */}
        <div
          style={{
            padding: 0,
            background: "none",
            borderRadius: token("--radius-control"),
            border: `2px solid ${token("--border-accent")}`,
            boxShadow: token("--glow-accent-soft"),
            overflow: "hidden",
            lineHeight: 0,
          }}
        >
          <DreamAvatarPortrait
            dreamAvatar={dreamAvatar}
            variant="panel"
            size={DREAM_AVATAR_PORTRAIT_PX}
            profile={{ id: dreamAvatar.id, ability: dreamAvatar.renderedText }}
          />
        </div>
      </div>
    </section>
  );
}

/** The collected dreamsigns as hoverable art tiles. */
function DreamsignsBlock({
  dreamsigns,
}: {
  dreamsigns: DreamsignData[];
}) {
  return (
    <section
      style={{ display: "flex", flexDirection: "column", gap: token("--space-6") }}
    >
      <SidebarSectionHeader label="Dreamsigns" />
      {dreamsigns.length === 0 ? (
        <div style={{ font: token("--t-body-sm"), color: token("--text-muted") }}>
          None collected yet.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(2, ${String(DREAMSIGN_TILE_PX)}px)`,
            gap: token("--space-3"),
            justifyContent: "start",
            justifyItems: "start",
          }}
        >
          {dreamsigns.map((sign) => (
            <Dreamsign
              key={requireDreamsignId(sign, "Desktop deck viewer dreamsign")}
              dreamsign={sign}
              sizePx={DREAMSIGN_TILE_PX}
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
        options={[
          { value: "asc", label: "↑", ariaLabel: "Sort ascending" },
          { value: "desc", label: "↓", ariaLabel: "Sort descending" },
        ]}
        value={filterSort.direction}
        onChange={(value) =>
          onChange({ direction: value as DesktopDeckFilterSort["direction"] })
        }
      />
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
  const lowCount = visible.length > 0 && visible.length <= 3;
  const lowCountTileWidth = Math.max(
    tileWidth,
    DECK_CARD_SIZE_PX.large,
  );
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
          data-deck-card-grid=""
          data-deck-card-grid-low-count={lowCount || undefined}
          style={{
            display: "grid",
            gridTemplateColumns: lowCount
              ? `repeat(${String(visible.length)}, ${String(lowCountTileWidth)}px)`
              : `repeat(auto-fill, minmax(${String(tileWidth)}px, 1fr))`,
            gap: token("--space-5"),
            alignItems: "start",
            justifyContent: lowCount ? "center" : undefined,
          }}
        >
          {visible.map((cardView) => (
            <DeckTile key={cardView.entryId} cardView={cardView} />
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
}: {
  cardView: DeckCardView;
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
      <GameCard model={cardView.model} />
    </div>
  );
}
