// MobileCardPeek — shared press-to-read card preview for compact mobile grids.
//
// The mobile deck viewer and compact card galleries use this one interaction:
// hold a compact card stationary and a large, readable copy appears near it
// while keeping the whole card clear of a 36px touch circle. Moving into a
// scroll cancels before the preview does rendering work.
// The geometry lives in mobile-card-peek-geometry.ts and is unit-tested
// independently; this module owns the gesture, React state, portal, and
// supplemental keyword definitions.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from "react";
import { createPortal } from "react-dom";
import type { CardData } from "../../../types/cards";
import { extractGlossaryTerms } from "../../../data/glossary-terms";
import type { CardTransfigurationDisplay } from "../../../runtime/transfiguration-display";
import { CLICK_WINDOW, infoCardWidth } from "../overlay/InfoCard";
import { token } from "../../primitives/tokens";
import { CARD_ASPECT_RATIO_VALUE } from "./card-aspect";
import { CardTermDefinitions } from "./CardTermDefinitions";
import { GameCard } from "./CardView";
import {
  computePeekBox,
  computeSupplementalPeekLayout,
  peekWidthForViewport,
  type PeekRect,
} from "./mobile-card-peek-geometry";

const DEFAULT_COLUMN_GAP_TOKEN = "--space-4";
const DEFAULT_SIDE_MARGIN_TOKEN = "--gutter";
const MOVE_SLOP_PX = 10;
/** Match Tango's shared tap-versus-hold boundary. */
export const MOBILE_CARD_PEEK_HOLD_MS = CLICK_WINDOW;
const SUPPLEMENTAL_INFO_GAP_PX = 10;
const SUPPLEMENTAL_INFO_EDGE_PX = 6;

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

interface MobileCardPeekGesture {
  pointerId: number;
  startX: number;
  startY: number;
  target: HTMLElement;
  view: MobileCardPeekCardView;
  timer: ReturnType<typeof setTimeout> | null;
  previewShown: boolean;
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
  handleScroll: () => void;
  handleClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
  dismissPeek: () => void;
} {
  const [peek, setPeek] = useState<MobileCardPeekState | null>(null);
  const gestureRef = useRef<MobileCardPeekGesture | null>(null);
  const suppressedClickTargetRef = useRef<HTMLElement | null>(null);
  const suppressedClickExpiryRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const clearSuppressedClick = useCallback(() => {
    if (suppressedClickExpiryRef.current !== null) {
      clearTimeout(suppressedClickExpiryRef.current);
      suppressedClickExpiryRef.current = null;
    }
    suppressedClickTargetRef.current = null;
  }, []);

  const suppressClickFor = useCallback(
    (target: HTMLElement) => {
      clearSuppressedClick();
      suppressedClickTargetRef.current = target;
      // A compatibility guard for engines that synthesize a click at the end
      // of a canceled pointer sequence. Keep it beyond the hold boundary so a
      // slow drag cannot outlive it; a fresh pointerdown clears it first.
      suppressedClickExpiryRef.current = setTimeout(
        clearSuppressedClick,
        MOBILE_CARD_PEEK_HOLD_MS * 4,
      );
    },
    [clearSuppressedClick],
  );

  const cancelGesture = useCallback(
    (suppressClick: boolean) => {
      const gesture = gestureRef.current;
      if (gesture?.timer !== null && gesture?.timer !== undefined) {
        clearTimeout(gesture.timer);
      }
      if (gesture !== null && suppressClick) {
        suppressClickFor(gesture.target);
      }
      gestureRef.current = null;
      setPeek(null);
    },
    [suppressClickFor],
  );

  const dismissPeek = useCallback(() => {
    cancelGesture(false);
  }, [cancelGesture]);

  // Release anywhere dismisses the zoom and ends the press. Pointer capture is
  // intentionally absent: pan-y remains owned by the nearest scroll container.
  useEffect(() => {
    function onUp(event: PointerEvent): void {
      const gesture = gestureRef.current;
      if (
        gesture === null ||
        (event.pointerId !== undefined && event.pointerId !== gesture.pointerId)
      ) {
        return;
      }
      cancelGesture(gesture.previewShown);
    }
    function onCancel(event: PointerEvent): void {
      const gesture = gestureRef.current;
      if (
        gesture === null ||
        (event.pointerId !== undefined && event.pointerId !== gesture.pointerId)
      ) {
        return;
      }
      cancelGesture(true);
    }
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [cancelGesture]);

  useEffect(
    () => () => {
      const timer = gestureRef.current?.timer;
      if (timer !== null && timer !== undefined) clearTimeout(timer);
      if (suppressedClickExpiryRef.current !== null) {
        clearTimeout(suppressedClickExpiryRef.current);
      }
    },
    [],
  );

  const openPeek = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      view: MobileCardPeekCardView,
    ): void => {
      if (
        event.button !== 0 ||
        gestureRef.current !== null ||
        typeof window === "undefined"
      ) {
        return;
      }
      clearSuppressedClick();
      const gesture: MobileCardPeekGesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        target: event.currentTarget,
        view,
        timer: null,
        previewShown: false,
      };
      gesture.timer = setTimeout(() => {
        if (gestureRef.current !== gesture) return;
        gesture.timer = null;
        gesture.previewShown = true;
        const sideMargin = readLengthToken(sideMarginToken);
        const width = peekWidthForViewport({
          viewportWidth: window.innerWidth,
          sideMargin,
          columns,
          columnGap: readLengthToken(columnGapToken),
        });
        // The protected circle is centered on the actual touch point. This is
        // stricter and more predictable than substituting the source tile's
        // center when the player presses near an edge.
        const finger = {
          x: gesture.startX,
          y: gesture.startY,
        };
        // Read layout and mount the large card only after the gesture has
        // remained stationary through the hold boundary. This keeps ordinary
        // Safari pan classification free of forced style reads and portal work.
        const box = computePeekBox({
          viewport: { width: window.innerWidth, height: window.innerHeight },
          safeTop: readLengthToken("--safe-area-inset-top"),
          safeBottom: readLengthToken("--safe-bottom"),
          sideMargin,
          aspect: CARD_ASPECT_RATIO_VALUE,
          width,
          finger,
        });
        setPeek({
          view: gesture.view,
          box,
          pointerId: gesture.pointerId,
          startX: gesture.startX,
          startY: gesture.startY,
        });
      }, MOBILE_CARD_PEEK_HOLD_MS);
      gestureRef.current = gesture;
    },
    [clearSuppressedClick, columnGapToken, columns, sideMarginToken],
  );

  // A drift past the slop means the finger is scrolling, not inspecting. The
  // pending phase lives entirely in refs, so moves inside the slop do not render.
  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const gesture = gestureRef.current;
      if (gesture === null || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (Math.hypot(dx, dy) > MOVE_SLOP_PX) cancelGesture(true);
    },
    [cancelGesture],
  );

  const handleScroll = useCallback(() => {
    if (gestureRef.current !== null) cancelGesture(true);
  }, [cancelGesture]);

  const handleClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (suppressedClickTargetRef.current !== event.currentTarget) return;
      event.preventDefault();
      event.stopPropagation();
      clearSuppressedClick();
    },
    [clearSuppressedClick],
  );

  return {
    peek,
    openPeek,
    handlePointerMove,
    handleScroll,
    handleClickCapture,
    dismissPeek,
  };
}

/**
 * The held zoom: the enlarged card and any keyword definition InfoCards are
 * portaled above the grid as one packed reading unit. Pair packing may shift a
 * centered low-row card just enough to keep the definition column beside it;
 * their boxes never overlap.
 */
export function renderMobileCardPeekOverlay(
  peek: MobileCardPeekState,
): ReactElement | null {
  if (typeof document === "undefined") return null;
  const hasDefinitions =
    extractGlossaryTerms(peek.view.card.renderedText).length > 0;
  const layout = hasDefinitions
    ? computeSupplementalInfoPlacement(peek.box)
    : null;
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
        data-mobile-card-peek-card=""
        style={{
          position: "absolute",
          left: layout?.primaryLeft ?? peek.box.left,
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
      {layout !== null && (
        <div
          style={{
            position: "absolute",
            left: layout.supplemental.left,
            top: layout.supplemental.top,
            width: layout.supplemental.width,
          }}
          data-mobile-card-peek-definitions=""
        >
          <CardTermDefinitions
            text={peek.view.card.renderedText}
            side={layout.supplemental.side}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}

function computeSupplementalInfoPlacement(
  box: PeekRect,
): {
  primaryLeft: number;
  supplemental: {
    left: number;
    top: number;
    width: number;
    side: "left" | "right";
  };
} | null {
  if (typeof window === "undefined") {
    return null;
  }
  const width = infoCardWidth(window.innerWidth);
  return computeSupplementalPeekLayout({
    box,
    viewportWidth: window.innerWidth,
    supplementalWidth: width,
    gap: SUPPLEMENTAL_INFO_GAP_PX,
    edge: SUPPLEMENTAL_INFO_EDGE_PX,
  });
}
