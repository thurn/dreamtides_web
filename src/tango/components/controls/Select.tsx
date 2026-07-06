// Select — the compact dropdown control in Tango.
//
// Where SegmentedControl lays every choice out at once (best for 2–4 options),
// Select collapses a longer list — a sort order with five modes, a filter with
// many values — into one resting trigger that opens a menu on tap. It is the
// control the deck viewer's sort order rides on: one line of chrome that names
// the current order and reveals the rest only when asked.
//
// The trigger's surface is the shared control material, chosen by `treatment`
// (sprite / flat / glass / accent / outline) from control-treatment.ts — the
// SAME vocabulary SegmentedControl renders from, so a Select and a segmented
// filter placed side by side read as one cluster. The dropdown MENU is a solid
// raised popover in every treatment: a menu must stay legible over scene art
// and dense card grids, so it does not take on the translucent or outline
// materials the resting trigger may use.
//
// The menu is portaled to the document body and positioned against the
// trigger's box, so it floats above any scroll container or stacking context
// the Select is dropped into. It closes on selection, on Escape, on an outside
// press, and on scroll/resize (a menu detached from its moved trigger reads as
// a bug, so it dismisses rather than chases).

import {
  type CSSProperties,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { HOVER_SCALE, PRESS_SCALE, usePress } from "../../primitives/Pressable";
import { GlowIcon } from "./GlowIcon";
import { type Glyph, GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import {
  type ControlTreatment,
  controlChrome,
} from "./control-treatment";

/** Height/scale variants, matching SegmentedControl's. */
type SelectSize = "sm" | "md";

/** One choice in the menu: an explicit `{ value, label }` pair. */
export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  /** The choices shown in the menu. */
  options: SelectOption[];
  /** The currently-selected option's value. */
  value: string;
  /** Fires with the newly-selected value when the user picks a menu item. */
  onChange?: (value: string) => void;
  /**
   * Small uppercase eyebrow shown before the current label inside the trigger
   * (e.g. "SORT"), naming what the dropdown controls. Omit for a bare value.
   */
  eyebrow?: string;
  /** Optional leading glyph drawn at the start of the trigger. */
  leadingGlyph?: Glyph;
  /** Height/scale. Default 'md'. */
  size?: SelectSize;
  /** Stretch the trigger to fill the container width. */
  full?: boolean;
  /**
   * Which trigger edge the menu aligns to. 'start' (default) opens flush to the
   * leading edge; 'end' opens flush to the trailing edge — use it when the
   * Select sits against the right side of a bar so the menu stays on-screen.
   */
  align?: "start" | "end";
  /**
   * Surface material for the trigger — one of the shared control treatments.
   * Default 'accent'. The menu stays a solid raised popover regardless.
   */
  treatment?: ControlTreatment;
  /** Accessible label for the trigger (defaults to the eyebrow when present). */
  ariaLabel?: string;
}

interface SizeSpec {
  height: number;
  font: string;
  padding: string;
}

const SIZES: Record<SelectSize, SizeSpec> = {
  sm: { height: 34, font: token("--t-body-sm"), padding: "0 12px" },
  md: { height: 42, font: token("--t-body"), padding: "0 14px" },
};

/** Gap (px) between the trigger and the menu it drops. */
const MENU_GAP_PX = 6;

/** The fixed-position box the portaled menu is placed in, in viewport pixels. */
interface MenuAnchor {
  top: number;
  left: number;
  right: number;
  width: number;
}

/**
 * Select — a dropdown control whose trigger wears the shared control treatment
 * and whose menu is a portaled raised popover. `options` is the choice list,
 * `value` the selected value, `onChange(value)` fires on pick.
 */
export function Select({
  options,
  value,
  onChange,
  eyebrow,
  leadingGlyph,
  size = "md",
  full = false,
  align = "start",
  treatment = "accent",
  ariaLabel,
}: SelectProps): ReactElement {
  const spec = SIZES[size];
  const chrome = controlChrome(treatment);
  const { pressed, hovered, bind } = usePress();

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value);
  const label = selected?.label ?? "";

  const close = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger === null) return;
    const rect = trigger.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + MENU_GAP_PX,
      left: rect.left,
      right: window.innerWidth - rect.right,
      width: rect.width,
    });
    setOpen(true);
  }, []);

  // While open, dismiss on Escape, on an outside press, and on scroll/resize —
  // the portaled menu is anchored to a captured box, so a moved trigger means
  // the menu no longer belongs where it sits.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") close();
    }
    function onOutside(e: PointerEvent): void {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) === true) return;
      if (triggerRef.current?.contains(target) === true) return;
      close();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onOutside, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  const menuPosition: CSSProperties =
    align === "end" && anchor !== null
      ? { right: anchor.right }
      : { left: anchor?.left };

  return (
    <div style={{ position: "relative", display: full ? "block" : "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? eyebrow}
        onClick={() => (open ? close() : openMenu())}
        {...bind}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          width: full ? "100%" : "auto",
          height: spec.height,
          padding: spec.padding,
          boxSizing: "border-box",
          font: spec.font,
          color: token("--text-primary"),
          cursor: "pointer",
          whiteSpace: "nowrap",
          WebkitTapHighlightColor: "transparent",
          transformOrigin: "center",
          transform: pressed
            ? `scale(${String(PRESS_SCALE)})`
            : hovered
              ? `scale(${String(HOVER_SCALE)})`
              : "none",
          transition: `transform ${token("--dur-fast")} ${token("--ease-out")}`,
          ...chrome.trigger,
        }}
      >
        {leadingGlyph !== undefined && (
          <GlowIcon iconClass={leadingGlyph} color="text-secondary" size="1.1em" />
        )}
        {eyebrow !== undefined && (
          <span
            style={{
              font: token("--t-eyebrow"),
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: token("--text-muted"),
            }}
          >
            {eyebrow}
          </span>
        )}
        <span style={{ color: token("--text-primary") }}>{label}</span>
        <GlowIcon
          iconClass={GLYPHS.chevronDown}
          color="text-secondary"
          size="1.1em"
        />
      </button>

      {open &&
        anchor !== null &&
        createPortal(
          <div
            ref={menuRef}
            className="tango"
            role="listbox"
            style={{
              position: "fixed",
              top: anchor.top,
              ...menuPosition,
              minWidth: anchor.width,
              zIndex: 90,
              padding: token("--space-1"),
              borderRadius: token("--radius-popover"),
              background: token("--surface-glass"),
              border: `1px solid ${token("--border-soft")}`,
              boxShadow: token("--shadow-lg"),
            }}
          >
            {options.map((option) => (
              <MenuItem
                key={option.value}
                option={option}
                active={option.value === value}
                onPick={(picked) => {
                  onChange?.(picked);
                  close();
                }}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

interface MenuItemProps {
  option: SelectOption;
  active: boolean;
  onPick: (value: string) => void;
}

/** One option row in the dropdown menu — a pressable line with a check on the
 *  selected value. */
function MenuItem({ option, active, onPick }: MenuItemProps): ReactElement {
  const { pressed, hovered, bind } = usePress();
  const lit = active || hovered || pressed;
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => onPick(option.value)}
      {...bind}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        minHeight: 36,
        padding: `0 ${token("--space-3")}`,
        border: "none",
        borderRadius: token("--radius-inset"),
        background: lit ? token("--surface-hover") : "transparent",
        font: token("--t-body-sm"),
        color: active ? token("--text-primary") : token("--text-secondary"),
        textAlign: "left",
        cursor: "pointer",
        whiteSpace: "nowrap",
        WebkitTapHighlightColor: "transparent",
        transition: `background ${token("--dur-fast")}`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "1em",
          display: "inline-flex",
          justifyContent: "center",
          opacity: active ? 1 : 0,
        }}
      >
        <GlowIcon iconClass={GLYPHS.check} color="accent" size="1em" />
      </span>
      {option.label}
    </button>
  );
}
