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
import {
  computePopoverPlacement,
  type PopoverPlacementSide,
} from "../overlay/hover-popover-placement";
import {
  CLICK_WINDOW,
  isHold,
  useFinePointer,
} from "../overlay/InfoCard";
import { CardTermDefinitions } from "./CardTermDefinitions";
import { extractGlossaryTerms } from "../../../data/glossary-terms";

interface ShownState {
  /** Anchor (card) rect captured when the panel became visible. */
  anchorRect: DOMRect;
  /**
   * The press point captured on a touch press-down, so the placement clamp
   * keeps the fingertip clear of the panel. Null on a fine-pointer hover.
   */
  pointer: { clientX: number; clientY: number } | null;
}

interface ResolvedPlacement {
  left: number;
  top: number;
  side: Extract<PopoverPlacementSide, "left" | "right">;
}

interface CardTermPopoverHandlers {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onClickCapture: (event: React.MouseEvent) => void;
}

/**
 * The card's term-definition reveal — the one guarantee that a rendered card
 * can always explain its keywords. While the player hovers (or focuses) the
 * card on a fine pointer, or presses and holds it on touch, a panel listing
 * every glossary term used on the card portals in beside it, top-aligned to the
 * card. The panel is purely informational and never intercepts pointer events.
 *
 * Input-adaptive, matching the InfoCard reveal contract:
 *   - fine pointer (mouse / desktop): HOVER reveals immediately; leaving
 *     hides. A click is always a click.
 *   - coarse pointer (touch): press-DOWN reveals immediately and release
 *     dismisses. The InfoCard click window separates a TAP (the card's own
 *     onClick still fires — picking, selecting) from a HOLD-to-read (the
 *     click is swallowed, so reading a keyword can never trigger the card's
 *     action). Placement still follows the card rule: left or right of the
 *     card, with the definition stack's top edge aligned to the card's top.
 *
 * The hook attaches its show/hide handlers to the card's own root element
 * (spread the returned `triggerHandlers` onto it) and anchors placement to
 * `anchorRef`, so no extra wrapper element is inserted into the card layout.
 * GameCard wires this up when it is not showing its built-in hover-zoom
 * glossary stack. Cards with hidden rules text have no inline terms to explain,
 * so the hook stays inert there.
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
  /**
   * True when the click now being dispatched is the tail of a touch
   * hold-to-read (the press outlasted the InfoCard click window), so the
   * card's own onClick must not fire. Consulted by the `onClickCapture`
   * handler; exposed for callers with bespoke click wiring.
   */
  shouldSwallowClick: () => boolean;
} {
  const fine = useFinePointer();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const downAtRef = useRef(0);
  // Whether the current press actually revealed the panel. A hold only
  // swallows the card's click when there was something being read — a card
  // with no terms (or an opted-out surface) keeps its normal tap behavior.
  const pressRevealedRef = useRef(false);
  const [shown, setShown] = useState<ShownState | null>(null);
  const [resolved, setResolved] = useState<ResolvedPlacement | null>(null);

  const hasTerms = useMemo(
    () => extractGlossaryTerms(text).length > 0,
    [text],
  );
  const active = enabled && hasTerms;

  const reveal = useCallback(
    (pointer: { clientX: number; clientY: number } | null) => {
      const anchor = anchorRef.current;
      if (anchor === null) {
        return;
      }
      // Reset the resolved placement so the first frame measures off-screen,
      // then the layout effect commits the real position before paint.
      setResolved(null);
      setShown({ anchorRect: anchor.getBoundingClientRect(), pointer });
    },
    [anchorRef],
  );

  // Fine pointer: hover uses the same immediate reveal contract on every card
  // surface, whether the card is large in place or rendered as a hover zoom.
  const showFromHover = useCallback(() => {
    if (!active || !fine) {
      return;
    }
    reveal(null);
  }, [active, fine, reveal]);

  const hide = useCallback(() => {
    setShown(null);
    setResolved(null);
  }, []);

  // Coarse pointer: press-down reveals immediately (never a long-press),
  // release dismisses. The press time feeds the tap-vs-hold discriminator.
  const beginPress = useCallback(
    (event: React.PointerEvent) => {
      if (fine) {
        return;
      }
      downAtRef.current = Date.now();
      pressRevealedRef.current = active;
      if (!active) {
        return;
      }
      reveal({ clientX: event.clientX, clientY: event.clientY });
    },
    [active, fine, reveal],
  );

  const endPress = useCallback(() => {
    if (fine) {
      return;
    }
    hide();
  }, [fine, hide]);

  const shouldSwallowClick = useCallback(
    () =>
      !fine &&
      pressRevealedRef.current &&
      isHold(downAtRef.current, Date.now(), CLICK_WINDOW),
    [fine],
  );

  const onClickCapture = useCallback(
    (event: React.MouseEvent) => {
      // Only a TOUCH hold swallows the click; a mouse click is always a click.
      if (shouldSwallowClick()) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [shouldSwallowClick],
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
      preferred: "right",
      crossAxisAlign: "start",
    });
    setResolved({
      left: placement.left,
      top: placement.top,
      side: placement.side === "left" ? "left" : "right",
    });
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
            <CardTermDefinitions text={text} side={resolved?.side} />
          </div>,
          document.body,
        )
      : null;

  return {
    triggerHandlers: {
      onPointerEnter: showFromHover,
      onPointerLeave: hide,
      onPointerDown: beginPress,
      onPointerUp: endPress,
      onPointerCancel: endPress,
      onFocus: showFromHover,
      onBlur: hide,
      onClickCapture,
    },
    popoverPortal,
    shouldSwallowClick,
  };
}
