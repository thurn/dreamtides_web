// MobileCardPeek — shared press-to-read card preview for compact mobile grids.
//
// The mobile deck viewer and any deck-like gallery that renders cards four
// across use this one interaction: press a compact card and a large, readable
// copy appears near the pressed card while keeping the rules text clear of the
// finger. The geometry lives in mobile-card-peek-geometry.ts and is unit-tested
// independently; this module owns the React state, pointer dismissal, portal,
// and supplemental keyword definitions.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactElement } from "react";
import { createPortal } from "react-dom";
import type { CardData } from "../../../types/cards";
import type { CardTransfigurationDisplay } from "../../../runtime/transfiguration-display";
import { infoCardWidth } from "../overlay/InfoCard";
import { token } from "../../primitives/tokens";
import { CARD_ASPECT_RATIO_VALUE } from "./card-aspect";
import { CardTermDefinitions } from "./CardTermDefinitions";
import { GameCard } from "./CardView";
import {
  computePeekBox,
  peekWidthForViewport,
  type PeekRect,
} from "./mobile-card-peek-geometry";

const DEFAULT_COLUMN_GAP_TOKEN = "--space-4";
const DEFAULT_SIDE_MARGIN_TOKEN = "--gutter";
const MOVE_SLOP_PX = 10;
const SUPPLEMENTAL_INFO_GAP_PX = 10;
const SUPPLEMENTAL_INFO_EDGE_PX = 6;

/** A held card press reads as inspection rather than activating the tile. */
export const MOBILE_CARD_PEEK_HOLD_MS = 300;

/** One card that can be shown in the shared mobile press preview. */
export interface MobileCardPeekCardView {
  card: CardData;
  transfiguration?: CardTransfigurationDisplay;
}

/** Options that describe the compact grid the player pressed. */
export interface MobileCardPeekOptions {
  columns: number;
  columnGapToken?: `--${string}`;
  sideMarginToken?: `--${string}`;
}

interface MobileCardPeekState {
  view: MobileCardPeekCardView;
  box: PeekRect;
  /** The touch point that summoned it, tracked so a drag can dismiss it. */
  pointerId: number;
  startX: number;
  startY: number;
}

/**
 * Reads a length token's resolved pixel value off the `.tango` root, for the
 * finger-avoidance math (which needs real numbers, not `var()` strings).
 */
function readLengthToken(name: `--${string}`): number {
  if (typeof window === "undefined") return 0;
  const host = document.querySelector(".tango") ?? document.documentElement;
  const raw = getComputedStyle(host).getPropertyValue(name);
  return Number.parseFloat(raw) || 0;
}

/** Shared state machine for compact mobile card press previews. */
export function useMobileCardPeek({
  columns,
  columnGapToken = DEFAULT_COLUMN_GAP_TOKEN,
  sideMarginToken = DEFAULT_SIDE_MARGIN_TOKEN,
}: MobileCardPeekOptions): {
  peek: MobileCardPeekState | null;
  openPeek: (
    event: ReactPointerEvent<HTMLElement>,
    view: MobileCardPeekCardView,
  ) => void;
  handlePointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Consume the held-press marker before a selectable tile handles click. */
  consumeHeldPress: () => boolean;
  dismissPeek: () => void;
} {
  const [peek, setPeek] = useState<MobileCardPeekState | null>(null);
  const activePressRef = useRef<{
    pointerId: number;
    startedAt: number;
  } | null>(null);
  const heldPressRef = useRef(false);

  const dismissPeek = useCallback(() => {
    setPeek(null);
  }, []);

  // Release anywhere dismisses the zoom and ends the press.
  useEffect(() => {
    function onUp(event: PointerEvent): void {
      const activePress = activePressRef.current;
      if (
        activePress !== null &&
        activePress.pointerId === event.pointerId &&
        Date.now() - activePress.startedAt >= MOBILE_CARD_PEEK_HOLD_MS
      ) {
        heldPressRef.current = true;
      }
      activePressRef.current = null;
      dismissPeek();
    }
    function onCancel(): void {
      activePressRef.current = null;
      dismissPeek();
    }
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [dismissPeek]);

  const openPeek = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      view: MobileCardPeekCardView,
    ): void => {
      if (peek !== null || typeof window === "undefined") return;
      const sideMargin = readLengthToken(sideMarginToken);
      const width = peekWidthForViewport({
        viewportWidth: window.innerWidth,
        sideMargin,
        columns,
        columnGap: readLengthToken(columnGapToken),
      });
      // Anchor the finger to the pressed card's center: the modelled occlusion
      // circle covers the whole tile, so the placement clears it wherever on the
      // card the finger actually landed.
      const tile = event.currentTarget.getBoundingClientRect();
      // The transient card zoom reserves a conservative chrome zone using the
      // `--safe-top`/`--safe-bottom` design floors. This is deliberately
      // device-frame-independent: unlike fixed chrome that tracks the real
      // hardware inset, the peek box wants a stable floor.
      const box = computePeekBox({
        viewport: { width: window.innerWidth, height: window.innerHeight },
        safeTop: readLengthToken("--safe-top"),
        safeBottom: readLengthToken("--safe-bottom"),
        sideMargin,
        aspect: CARD_ASPECT_RATIO_VALUE,
        width,
        finger: {
          x: tile.left + tile.width / 2,
          y: tile.top + tile.height / 2,
        },
      });
      setPeek({
        view,
        box,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      });
      activePressRef.current = {
        pointerId: event.pointerId,
        startedAt: Date.now(),
      };
    },
    [columnGapToken, columns, peek, sideMarginToken],
  );

  // A drift past the slop means the finger is scrolling, not inspecting.
  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (peek === null || peek.pointerId !== event.pointerId) return;
      const dx = event.clientX - peek.startX;
      const dy = event.clientY - peek.startY;
      if (Math.hypot(dx, dy) > MOVE_SLOP_PX) {
        activePressRef.current = null;
        dismissPeek();
      }
    },
    [peek, dismissPeek],
  );

  const consumeHeldPress = useCallback((): boolean => {
    const held = heldPressRef.current;
    heldPressRef.current = false;
    return held;
  }, []);

  return {
    peek,
    openPeek,
    handlePointerMove,
    consumeHeldPress,
    dismissPeek,
  };
}

/**
 * The held zoom: just the enlarged card, portaled above the grid and shown at
 * its placed box. Keyword definition InfoCards sit beside it as supplemental
 * reading aids, matching the Deck Viewer behavior.
 */
export function renderMobileCardPeekOverlay(
  peek: MobileCardPeekState,
): ReactElement | null {
  if (typeof document === "undefined") return null;
  const supplemental =
    typeof window === "undefined"
      ? null
      : computeSupplementalInfoPlacement(
          peek.box,
          { width: window.innerWidth, height: window.innerHeight },
          infoCardWidth(window.innerWidth),
        );
  return createPortal(
    <div
      className="tango"
      aria-hidden="true"
      data-mobile-card-peek=""
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
          termDefinitions="none"
        />
      </div>
      {supplemental !== null && (
        <div
          style={{
            position: "absolute",
            left: supplemental.left,
            ...(supplemental.top === undefined
              ? { bottom: supplemental.bottom }
              : { top: supplemental.top }),
            width: supplemental.width,
            maxHeight: supplemental.maxHeight,
            overflowY:
              supplemental.maxHeight === undefined ? "visible" : "auto",
          }}
          data-mobile-card-peek-definitions=""
          data-mobile-card-peek-definitions-placement={supplemental.placement}
        >
          <CardTermDefinitions
            text={peek.view.card.renderedText}
            side={supplemental.side}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}

export function computeSupplementalInfoPlacement(
  box: PeekRect,
  viewport: { width: number; height: number },
  requestedWidth: number,
): {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  side: "left" | "right";
  maxHeight?: number;
  placement: "left" | "right" | "above" | "below";
} {
  const width = Math.min(
    requestedWidth,
    viewport.width - SUPPLEMENTAL_INFO_EDGE_PX * 2,
  );
  const rightLeft = box.left + box.width + SUPPLEMENTAL_INFO_GAP_PX;
  const fitsRight =
    rightLeft + width <= viewport.width - SUPPLEMENTAL_INFO_EDGE_PX;
  if (fitsRight) {
    return {
      left: rightLeft,
      top: box.top,
      width,
      side: "right",
      placement: "right",
    };
  }
  const leftLeft = box.left - SUPPLEMENTAL_INFO_GAP_PX - width;
  if (leftLeft >= SUPPLEMENTAL_INFO_EDGE_PX) {
    return {
      left: leftLeft,
      top: box.top,
      width,
      side: "left",
      placement: "left",
    };
  }

  // A center-column card may leave insufficient horizontal room for the fixed
  // InfoCard reading width. In that case the definition stack moves wholly
  // above or below the enlarged card; it must never cover the card being read.
  const left = Math.min(
    Math.max(SUPPLEMENTAL_INFO_EDGE_PX, box.left + box.width / 2 - width / 2),
    viewport.width - SUPPLEMENTAL_INFO_EDGE_PX - width,
  );
  const belowTop = box.top + box.height + SUPPLEMENTAL_INFO_GAP_PX;
  const belowRoom = Math.max(
    0,
    viewport.height - SUPPLEMENTAL_INFO_EDGE_PX - belowTop,
  );
  const aboveRoom = Math.max(
    0,
    box.top - SUPPLEMENTAL_INFO_GAP_PX - SUPPLEMENTAL_INFO_EDGE_PX,
  );
  const side = left + width / 2 < box.left + box.width / 2 ? "left" : "right";
  if (belowRoom >= aboveRoom) {
    return {
      left,
      top: belowTop,
      width,
      side,
      maxHeight: belowRoom,
      placement: "below",
    };
  }
  return {
    left,
    bottom: viewport.height - box.top + SUPPLEMENTAL_INFO_GAP_PX,
    width,
    side,
    maxHeight: aboveRoom,
    placement: "above",
  };
}
