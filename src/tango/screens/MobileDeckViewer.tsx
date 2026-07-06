// MobileDeckViewer — the narrow-viewport Tango rendering of the player's deck.
//
// The deck is shown as a scrolling grid of full cards, four across. At that
// size the cards' rules text is present but small, so the screen's whole job is
// the press-and-hold
// zoom: hold a card and a large, fully legible copy expands out of the tile
// into the half of the screen the finger is NOT covering, over a focus scrim;
// release and it collapses back. A quick flick still scrolls the grid — the
// zoom only arms after a short hold — so browsing and inspecting never fight.
//
// The top of the screen keeps a reserved band for the filtering/searching
// controls a later pass will add; this first pass renders only the title, the
// card count, and the close control there.
//
// PURE: renders from a view-model and reports dismissal through `onClose`. All
// state here is local presentation state (which card is being peeked, and the
// expand animation phase). The finger-avoidance placement math lives in the
// unit-tested `mobile-deck-peek` module.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CardData } from "../../types/cards";
import type { CardTransfigurationDisplay } from "../../runtime/transfiguration-display";
import { GameCard } from "../components/card/CardView";
import { Pressable } from "../primitives/Pressable";
import { groupPanelStyle } from "../components/controls/GroupPanel";
import { GlowIcon } from "../components/controls/GlowIcon";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { CARD_ASPECT_RATIO_VALUE } from "../components/card/card-aspect";
import {
  computePeekBox,
  peekOriginTransform,
  type PeekRect,
} from "./mobile-deck-peek";

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
  /** The heading shown in the top band (e.g. "Deck"). */
  title: string;
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
 * How long (ms) a press must be held before the zoom arms. Below this a touch
 * is treated as the start of a scroll, so flicking through the grid never
 * summons a card. A box measure of interaction feel, not a spacing token.
 */
const HOLD_MS = 150;

/**
 * How far (px) the pointer may drift during the arming window before the press
 * is reclassified as a scroll and the zoom is cancelled.
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
  /** Transform mapping the zoom box back onto the pressed tile, for the grow. */
  originTransform: string;
}

/**
 * The narrow-viewport deck viewer: a reserved control band, then a
 * press-to-zoom grid of the deck's cards.
 */
export function MobileDeckViewer({ view, onClose }: MobileDeckViewerProps) {
  const [peek, setPeek] = useState<PeekState | null>(null);
  // The expand animation phase: false paints the zoom collapsed onto its tile,
  // then a frame later it flips true and the CSS transition grows it out.
  const [expanded, setExpanded] = useState(false);

  // Press bookkeeping. Kept in refs so the window-level release/scroll handlers
  // read live values without re-subscribing.
  const holdTimerRef = useRef<number | null>(null);
  const pressRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    tileRect: PeekRect;
    view: DeckCardView;
  } | null>(null);

  const clearHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    pressRef.current = null;
  }, []);

  const dismissPeek = useCallback(() => {
    clearHold();
    setPeek(null);
    setExpanded(false);
  }, [clearHold]);

  // Grow the zoom out of its tile one frame after it mounts, so the transition
  // has a collapsed start state to animate from.
  useEffect(() => {
    if (peek === null) return;
    const raf = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(raf);
  }, [peek]);

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

  const armPeek = useCallback(() => {
    const press = pressRef.current;
    holdTimerRef.current = null;
    if (press === null || typeof window === "undefined") return;
    const box = computePeekBox({
      tile: press.tileRect,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      safeTop: readLengthToken("--safe-top"),
      safeBottom: readLengthToken("--safe-bottom"),
      gap: readLengthToken("--space-7"),
      sideMargin: readLengthToken("--gutter"),
      aspect: CARD_ASPECT_RATIO_VALUE,
    });
    setExpanded(false);
    setPeek({
      view: press.view,
      box,
      originTransform: peekOriginTransform(box, press.tileRect),
    });
  }, []);

  const handleTilePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, cardView: DeckCardView) => {
      if (peek !== null) return;
      clearHold();
      pressRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        tileRect: e.currentTarget.getBoundingClientRect(),
        view: cardView,
      };
      holdTimerRef.current = window.setTimeout(armPeek, HOLD_MS);
    },
    [armPeek, clearHold, peek],
  );

  // During the arming window, a drift past the slop means the finger is
  // scrolling, not inspecting — cancel the pending zoom and let the grid scroll.
  const handleGridPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const press = pressRef.current;
      if (press === null || holdTimerRef.current === null) return;
      if (press.pointerId !== e.pointerId) return;
      const dx = e.clientX - press.startX;
      const dy = e.clientY - press.startY;
      if (Math.hypot(dx, dy) > MOVE_SLOP_PX) clearHold();
    },
    [clearHold],
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
        title={view.title}
        count={view.cards.length}
        onClose={onClose}
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
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${String(COLUMNS)}, 1fr)`,
              gap: token("--space-4"),
            }}
          >
            {view.cards.map((cardView) => (
              <DeckTile
                key={cardView.entryId}
                cardView={cardView}
                dimmed={peek !== null && peek.view.entryId !== cardView.entryId}
                onPointerDown={handleTilePointerDown}
              />
            ))}
          </div>
        )}
      </div>

      {peek !== null && (
        <PeekOverlay peek={peek} expanded={expanded} />
      )}
    </div>
  );
}

/**
 * The full-bleed frosted-glass backdrop behind the deck. Reuses GroupPanel's
 * liquid-glass recipe but takes only its fill and blur/saturate backdrop — the
 * card's rim, radius, and drop shadow are card affordances that do not belong
 * on an edge-to-edge surface — so the dreamscape behind refracts through as
 * glass without a floating panel border at the screen edges.
 */
function GlassBackdrop() {
  const glass = groupPanelStyle();
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

/**
 * The top band: a centered "Deck" title beneath the corner controls, the card
 * count, and the reserved searching/filtering slot. The top-left corner is left
 * clear for the dreamscape utility menu, which lifts above this overlay while it
 * is open (see `DreamscapeQuestMenu`'s `elevated`); the close control on the
 * right mirrors that menu button's look. The band keeps a fixed height so the
 * grid below it does not shift when the real controls arrive.
 */
function TopBand({
  title,
  count,
  onClose,
}: {
  title: string;
  count: number;
  onClose: () => void;
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
        borderBottom: `1px solid ${token("--border-soft")}`,
      }}
    >
      {/* Corner control row: the top-left is left empty for the elevated
          dreamscape menu; the close button sits at the right, matching that
          menu button's rounded-glass look. */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          minHeight: 48,
        }}
      >
        <Pressable
          as="button"
          aria-label="Close deck"
          onClick={onClose}
          style={{
            width: 48,
            height: 48,
            borderRadius: token("--radius-control"),
            background: token("--surface-glass-strong"),
            border: `1px solid ${token("--border-soft")}`,
            boxShadow: token("--shadow-md"),
            color: token("--text-primary"),
            display: "grid",
            placeItems: "center",
            fontSize: 26,
            cursor: "pointer",
          }}
        >
          <GlowIcon iconClass={GLYPHS.close} color="text-primary" size="1em" />
        </Pressable>
      </div>

      {/* Centered title, shifted below the corner controls, with the count as a
          quiet subtitle. */}
      <div style={{ textAlign: "center", marginTop: token("--space-2") }}>
        <div
          style={{
            font: token("--t-title"),
            color: token("--text-primary"),
            textShadow: token("--text-outline-media"),
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: token("--space-1"),
            font: token("--t-body-sm"),
            color: token("--text-muted"),
            textShadow: token("--text-outline-media"),
          }}
        >
          {String(count)} {count === 1 ? "card" : "cards"}
        </div>
      </div>

      {/* Reserved control slot: the searching/filtering controls land here in a
          later pass. Rendered as a visible field so the space reads as a control
          slot, and held at a fixed height so the grid start point stays put. */}
      <div
        aria-hidden="true"
        style={{
          marginTop: token("--space-5"),
          height: token("--control-h"),
          borderRadius: token("--radius-control"),
          background: token("--surface-glass-strong"),
          border: `1px solid ${token("--border-soft")}`,
          display: "flex",
          alignItems: "center",
          paddingLeft: token("--space-6"),
          paddingRight: token("--space-6"),
          font: token("--t-body"),
          color: token("--text-muted"),
        }}
      >
        Search &amp; Filter
      </div>
    </div>
  );
}

/** One grid tile: the full card (rules text and all) that arms the zoom on
 *  press-and-hold, where it enlarges to a comfortably legible size. */
function DeckTile({
  cardView,
  dimmed,
  onPointerDown,
}: {
  cardView: DeckCardView;
  dimmed: boolean;
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
        // Suppress the OS long-press callout so the hold reads as a zoom.
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
        // The finger stays on the touched card while its zoom is up, so the
        // touched tile keeps full opacity and the rest recede.
        opacity: dimmed ? 0.5 : 1,
        transition: `opacity ${token("--dur-fast")} ${token("--ease-out")}`,
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
 * The held zoom: a focus scrim plus the enlarged card, portaled above the grid
 * and grown out of the pressed tile via a container transform. Purely visual —
 * `pointer-events: none` — so the finger that summoned it is never intercepted;
 * the press is tracked entirely on the grid underneath.
 */
function PeekOverlay({ peek, expanded }: { peek: PeekState; expanded: boolean }) {
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
          inset: 0,
          background: token("--scrim-strong"),
          opacity: expanded ? 1 : 0,
          transition: `opacity ${token("--dur-fast")} ${token("--ease-out")}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: peek.box.left,
          top: peek.box.top,
          width: peek.box.width,
          transformOrigin: "top left",
          transform: expanded ? "none" : peek.originTransform,
          transition: `transform ${token("--motion-container-transform")}`,
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
      Your deck is empty.
    </div>
  );
}
