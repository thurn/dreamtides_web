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
// The top of the screen keeps a reserved band for the filtering/searching
// controls a later pass will add; this first pass renders only the title, the
// card count, and the close control there.
//
// PURE: renders from a view-model and reports dismissal through `onClose`. All
// state here is local presentation state (which card is being peeked). The
// finger-clearing placement math lives in the unit-tested `mobile-deck-peek`
// module, whose guarantee is proven over a full touch-point sweep by
// scripts/deck-peek-clearance-analysis.mjs.

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
  peekWidthForViewport,
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
 * How far (px) the pointer may drift from the touch point before the press is
 * reclassified as a scroll and the zoom is dismissed, letting the grid scroll.
 * The zoom itself appears immediately on press-down; this only tears it back
 * down once a drag is clearly underway.
 */
const MOVE_SLOP_PX = 10;

/**
 * Minimum real top safe-area inset (px) that counts as a center screen cutout
 * (a notch / Dynamic Island). Only then is the centered title dropped below the
 * corner controls to clear the cutout; on flat-top screens it stays up in line
 * with the controls rather than floating down between them.
 */
const CENTER_CUTOUT_MIN_INSET_PX = 24;

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
 * The narrow-viewport deck viewer: a reserved control band, then a
 * press-to-zoom grid of the deck's cards.
 */
export function MobileDeckViewer({ view, onClose }: MobileDeckViewerProps) {
  const [peek, setPeek] = useState<PeekState | null>(null);

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
 * Reads the device's real top safe-area inset (px) off a hidden probe. Zero on
 * flat-top screens; a notch / Dynamic Island reports its height here. Measured
 * rather than assumed so the title only drops below the controls when a genuine
 * center cutout is present. Returns the inset and the ref to mount on the probe.
 */
function useTopSafeInset(): {
  inset: number;
  probeRef: React.RefObject<HTMLDivElement | null>;
} {
  const probeRef = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (probeRef.current === null) return;
    const measured = Number.parseFloat(
      getComputedStyle(probeRef.current).paddingTop,
    );
    if (!Number.isNaN(measured)) setInset(measured);
  }, []);
  return { inset, probeRef };
}

/** Height reserved for a corner control button, matching the close control. */
const CONTROL_BUTTON_PX = 48;

/**
 * The top band: the corner controls, a centered "Deck" title, the card count,
 * and the reserved searching/filtering slot. The top-left corner is left clear
 * for the dreamscape utility menu, which lifts above this overlay while it is
 * open (see `DreamscapeQuestMenu`'s `elevated`); the close control on the right
 * mirrors that menu button's look. The title sits in line with the corner
 * controls, and only drops below them on screens whose center cutout (notch /
 * Dynamic Island) it would otherwise collide with. The band keeps a fixed
 * height so the grid below it does not shift when the real controls arrive.
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
  const { inset: topInset, probeRef } = useTopSafeInset();
  const hasCenterCutout = topInset >= CENTER_CUTOUT_MIN_INSET_PX;
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
      {/* Hidden probe reading the raw top inset, so the cutout test uses the
          device's real safe area rather than the band's own clamped padding. */}
      <div
        ref={probeRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          height: 0,
          paddingTop: "env(safe-area-inset-top, 0px)",
          pointerEvents: "none",
          visibility: "hidden",
        }}
      />

      {/* Header row: the close button anchored at the right corner (the left is
          left empty for the elevated dreamscape menu), with the centered title
          and count sharing the row — dropped below the controls only to clear a
          center cutout. */}
      <div style={{ position: "relative", minHeight: CONTROL_BUTTON_PX }}>
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

        <div
          style={{
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: CONTROL_BUTTON_PX,
            // Drop below the corner controls only when a center cutout would
            // otherwise sit behind the title; on flat-top screens it stays in
            // line with the controls instead of floating down between them.
            paddingTop: hasCenterCutout
              ? `calc(${String(CONTROL_BUTTON_PX)}px + ${token("--space-2")})`
              : 0,
          }}
        >
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
