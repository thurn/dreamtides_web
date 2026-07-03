import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { computePopoverPlacement } from "../tango/components/hover-popover-placement";
import { CardTermDefinitions } from "./CardTermDefinitions";
import { extractGlossaryTerms } from "../data/glossary-terms";

/**
 * Delay (ms) before the term-definitions panel portals in beside a hovered
 * card. Tuned so the panel reads as a deliberate "what does this mean?" reveal
 * rather than firing on a quick pass of the cursor.
 */
const CARD_TERM_POPOVER_DELAY_MS = 350;

interface ShownState {
  /** Anchor (card) rect captured when the panel became visible. */
  anchorRect: DOMRect;
}

interface ResolvedPlacement {
  left: number;
  top: number;
}

interface CardTermPopoverHandlers {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

/**
 * Hover help for a full card. While the player hovers (or focuses) the card,
 * a panel listing every glossary term used on the card portals in immediately
 * beside it — to the side, never on top, so it never blocks the card. The
 * panel is purely informational and never intercepts pointer events.
 *
 * The hook attaches its show/hide handlers to the card's own root element
 * (spread the returned `triggerHandlers` onto it) and anchors placement to
 * `anchorRef`, so no extra wrapper element is inserted into the card layout.
 * Placement reuses the shared `computePopoverPlacement` math, preferring the
 * left of the card and flipping to the right near the viewport's left edge.
 *
 * When `enabled` is false or the card references no glossary terms, the hook
 * is inert: the handlers are no-ops and `popoverPortal` is `null`.
 */
export function useCardTermPopover({
  anchorRef,
  text,
  enabled,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  text: string;
  enabled: boolean;
}): {
  triggerHandlers: CardTermPopoverHandlers;
  popoverPortal: ReactNode;
} {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shown, setShown] = useState<ShownState | null>(null);
  const [resolved, setResolved] = useState<ResolvedPlacement | null>(null);

  const hasTerms = useMemo(
    () => extractGlossaryTerms(text).length > 0,
    [text],
  );
  const active = enabled && hasTerms;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    if (!active) {
      return;
    }
    clearTimer();
    timerRef.current = setTimeout(() => {
      const anchor = anchorRef.current;
      if (anchor === null) {
        return;
      }
      // Reset the resolved placement so the first frame measures off-screen,
      // then the layout effect commits the real position before paint.
      setResolved(null);
      setShown({ anchorRect: anchor.getBoundingClientRect() });
    }, CARD_TERM_POPOVER_DELAY_MS);
  }, [active, anchorRef, clearTimer]);

  const hide = useCallback(() => {
    clearTimer();
    setShown(null);
    setResolved(null);
  }, [clearTimer]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  // Drop any open panel if the card stops being eligible (e.g. its text
  // changes to a no-term card while the cursor still rests on it).
  useEffect(() => {
    if (!active && shown !== null) {
      hide();
    }
  }, [active, shown, hide]);

  useLayoutEffect(() => {
    if (shown === null) {
      return;
    }
    const popover = popoverRef.current;
    if (popover === null) {
      return;
    }
    const rect = popover.getBoundingClientRect();
    const viewportWidth =
      typeof window === "undefined" ? 0 : window.innerWidth;
    const viewportHeight =
      typeof window === "undefined" ? 0 : window.innerHeight;
    const placement = computePopoverPlacement({
      anchor: shown.anchorRect,
      popoverWidth: rect.width,
      popoverHeight: rect.height,
      viewportWidth,
      viewportHeight,
      preferred: "left",
    });
    setResolved({ left: placement.left, top: placement.top });
  }, [shown]);

  const popoverStyle: CSSProperties =
    resolved !== null
      ? { left: resolved.left, top: resolved.top }
      : { left: 0, top: 0, visibility: "hidden" };

  const popoverPortal =
    shown !== null && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popoverRef}
            className="pointer-events-none fixed z-[1000]"
            style={popoverStyle}
            role="tooltip"
          >
            <CardTermDefinitions text={text} />
          </div>,
          document.body,
        )
      : null;

  return {
    triggerHandlers: {
      onMouseEnter: show,
      onMouseLeave: hide,
      onFocus: show,
      onBlur: hide,
    },
    popoverPortal,
  };
}
