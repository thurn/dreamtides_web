// Pressable — the ONE press-feedback primitive for Tango.
//
// Every interactive Tango control routes its touch feedback through this one
// primitive so the gesture feels identical everywhere:
//   - a single scale-DOWN factor (PRESS_SCALE = 0.94, the --press-scale
//     token) — controls compress under the finger/pointer, they never
//     balloon outward while pressed
//   - a single hover scale-UP factor (HOVER_SCALE = 1.03, the --hover-scale
//     token) — on a hover-capable pointer (mouse/pen), every pressable or
//     info-revealing surface slightly enlarges under the cursor, so "this
//     responds to you" reads identically everywhere. Touch never hovers.
//   - pointer cursor when actionable, default cursor when disabled
//   - tap-highlight suppression (no blue mobile flash)
//   - one eased, fast transition (skipped entirely when the user has
//     requested reduced motion)
//
// The factor is published as the CSS custom property --press-scale
// (tango-tokens.css) so controls we can only reach through CSS (e.g. a
// bare `:active` rule) compress by the identical amount — JS and CSS stay
// in lock-step. Every ad-hoc scale() elsewhere should route through this.
//
// Two ways to consume it:
//   - <Pressable as="button" onClick={...}>...</Pressable> — the drop-in
//     wrapper. Forwards a ref + all other props.
//   - const { pressed, bind } = usePress(); — the hook, for components that
//     already own their element/markup (they combine the press transform
//     with a base positioning transform, or drive a popup off the same
//     pointer stream). Spread `bind` and read `pressed` to build the
//     transform yourself.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/primitives/Pressable.jsx / .d.ts), generalized from
// touch-only to Tango's input-adaptive pointer model: the press state is
// driven by React's pointer events (pointerdown / pointerup / pointerleave
// / pointercancel), which fire uniformly for mouse and touch input alike.

import * as React from "react";
import { forwardRef, useEffect, useState } from "react";

/**
 * The one press-down factor. Always < 1 (compress, never enlarge). Mirrors
 * the --press-scale token so JS and CSS :active rules stay identical.
 */
export const PRESS_SCALE = 0.94;

/**
 * The one hover-enlarge factor. Always slightly > 1: on a hover-capable
 * pointer, every pressable or hover-revealing surface grows by this amount
 * under the cursor. Mirrors the --hover-scale token so JS and CSS :hover
 * rules stay identical. Press wins while both apply.
 */
export const HOVER_SCALE = 1.03;

/** The five pointer handlers usePress binds to drive its `pressed` and `hovered` state. */
export interface PressBind {
  onPointerEnter: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
}

export interface UsePressResult {
  /** true from pointer-down until release / leave / cancel. */
  pressed: boolean;
  /**
   * true while a hover-capable pointer (mouse/pen — never touch) is over the
   * element. Drives the shared HOVER_SCALE enlargement; press takes
   * precedence while both are true.
   */
  hovered: boolean;
  /** the five pointer handlers to spread onto your element. */
  bind: PressBind;
}

/**
 * The press-state hook, for components that own their own element/markup
 * (e.g. they combine the press transform with a base positioning
 * transform). Pass handlers to chain your own logic after the internal
 * state update.
 */
export function usePress(handlers?: Partial<PressBind>): UsePressResult {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);

  const enter = (event: React.PointerEvent<HTMLElement>): void => {
    // Only a hover-capable pointer hovers. On touch, pointerenter fires as
    // part of every tap, and a "hover" that only clears on the next touch
    // would leave the element stuck enlarged after the finger lifts.
    if (event.pointerType !== "touch") {
      setHovered(true);
    }
    handlers?.onPointerEnter?.(event);
  };

  const down = (event: React.PointerEvent<HTMLElement>): void => {
    // Only the PRIMARY button begins a press, matching native `:active`:
    // right-click / middle-click (button !== 0) must not trigger the
    // scale-down. The consumer's own onPointerDown still runs regardless.
    if (event.button === 0) {
      setPressed(true);
    }
    handlers?.onPointerDown?.(event);
  };

  const up =
    (name: keyof PressBind, endsHover: boolean) =>
    (event: React.PointerEvent<HTMLElement>): void => {
      setPressed(false);
      // pointerup keeps the hover (the mouse is still over the element);
      // leave/cancel end it.
      if (endsHover) {
        setHovered(false);
      }
      handlers?.[name]?.(event);
    };

  return {
    pressed,
    hovered,
    bind: {
      onPointerEnter: enter,
      onPointerDown: down,
      onPointerUp: up("onPointerUp", false),
      onPointerLeave: up("onPointerLeave", true),
      onPointerCancel: up("onPointerCancel", true),
    },
  };
}

/**
 * True while the user has requested reduced motion (`prefers-reduced-motion:
 * reduce`). Pressable reads this to skip the transform transition entirely —
 * the scale still applies (it is the press affordance itself, not a
 * decorative animation), but the change is instant rather than eased.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (): void => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export interface PressableProps extends React.HTMLAttributes<HTMLElement> {
  /** Element or component to render. Default 'button'. */
  as?: React.ElementType;
  /** Disables press feedback and pointer handlers, and shows the default cursor. */
  disabled?: boolean;
  /**
   * Whether the element compresses (scale-down) while pressed. Default true.
   * Set false for a surface you hover to reveal information but cannot act on
   * (a tide disc, an essence value): its pointer handlers, cursor,
   * hover-enlarge, and tap-highlight suppression stay, but a press must not
   * read as an actionable button by shrinking. This is a behavioral variant of
   * the one press feedback, not a style escape hatch.
   */
  compress?: boolean;
  /** Content rendered inside the pressable element. */
  children?: React.ReactNode;
}

/**
 * Pressable — renders `as` (default `<button>`) with the standardized
 * press-down feedback, hover-enlarge (on a hover-capable pointer), pointer
 * cursor, and tap-highlight suppression. Forwards ref and every extra prop
 * (onClick, aria-*, className, ...).
 *
 * Notes:
 *   - Writes only `transform`, so DON'T put a base positioning transform on
 *     the same node — wrap it, or use `usePress` and build the combined
 *     transform yourself.
 *   - `disabled` -> no press feedback, default cursor, handlers detached.
 */
export const Pressable = forwardRef<HTMLElement, PressableProps>(
  function Pressable(
    {
      as = "button",
      disabled = false,
      compress = true,
      style,
      onPointerEnter,
      onPointerDown,
      onPointerUp,
      onPointerLeave,
      onPointerCancel,
      children,
      ...rest
    },
    ref,
  ) {
    const { pressed, hovered, bind } = usePress({
      onPointerEnter,
      onPointerDown,
      onPointerUp,
      onPointerLeave,
      onPointerCancel,
    });
    const reducedMotion = usePrefersReducedMotion();

    // `as` is a runtime-chosen element type (intrinsic tag or component), so
    // its exact prop shape isn't known statically — resolving it against
    // React.ElementType's full intrinsic-tag union blows up into an
    // unrepresentable type. This is the same honest-but-loose boundary the
    // registry uses for heterogeneous entries (see registry.ts): one
    // explicit, non-`any` cast (through `unknown`, never `any`) here keeps
    // the rest of the module fully typed. The cast is type-level only —
    // `as` still carries its real runtime value ("button", "div", a
    // component, ...) straight through to React.createElement.
    const Element = as as unknown as React.ComponentType<
      Record<string, unknown>
    >;
    const typeProp = as === "button" ? { type: "button" } : {};

    return (
      <Element
        ref={ref}
        {...typeProp}
        {...(disabled ? {} : bind)}
        {...rest}
        // `disabled` must make the element genuinely inert to interaction, not
        // just visually. Pressable is polymorphic via `as`, so forwarding a
        // native `disabled` attribute is wrong (invalid on a non-button and
        // wouldn't stop an onClick passed through `...rest`). Instead, block
        // pointer-driven clicks for any `as` with `pointerEvents: "none"` and
        // announce the state with `aria-disabled`. Placed after `...rest` so a
        // disabled Pressable can't have these overridden by passthrough props.
        {...(disabled ? { "aria-disabled": true } : {})}
        style={{
          cursor: disabled ? "default" : "pointer",
          WebkitTapHighlightColor: "transparent",
          // A press control is never a text selection: pressing-and-holding one
          // (e.g. to reveal an InfoCard) must not let iOS Safari select the
          // label or raise the callout menu. Paired with `touch-action:
          // manipulation` so a tap registers immediately (no 300ms
          // double-tap-zoom delay) and the press-scale reads on touch.
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          touchAction: "manipulation",
          transformOrigin: "center",
          transition: reducedMotion
            ? "none"
            : `transform var(--dur-fast) var(--ease-out)`,
          // Press wins over hover; hover-enlarge applies even when
          // compress=false (an info-reveal surface still invites the cursor),
          // and disabled suppresses both.
          transform: disabled
            ? "none"
            : pressed && compress
              ? `scale(${PRESS_SCALE})`
              : hovered
                ? `scale(${HOVER_SCALE})`
                : "none",
          ...style,
          ...(disabled ? { pointerEvents: "none" } : {}),
        }}
      >
        {children}
      </Element>
    );
  },
);
