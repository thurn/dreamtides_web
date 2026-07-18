// Select — the compact dropdown control in Cumulus, and the standard mobile
// filter/sort control: a button that names the current choice and opens a menu.
//
// Where a full choice list would eat a whole row, Select collapses it to one
// resting trigger — a leading glyph (a filled funnel for a filter, filled
// up/down arrows for a sort), the current selection's label, and a dropdown
// caret — that reveals the rest on tap. Two of them sit on a single line
// where a segmented control could not.
//
// The trigger reserves the width of its WIDEST option's label, so the button
// holds one size as the selection changes and never jitters when a menu pick
// swaps a short label for a long one. All option labels are stacked in one grid
// cell; only the selected one is visible, and the hidden siblings set the width.
//
// The trigger is single-font BY CONSTRUCTION: it renders exactly one visible
// text run, the selection label (glyph and caret are icons, not a second type
// voice). There is no eyebrow or secondary-text slot, so a caller cannot mix two
// font styles in one button. A menu entry may carry a compact `triggerLabel` for
// the collapsed trigger while the menu itself shows the fuller `label`.
//
// The trigger's surface is the shared liquid-glass control material from
// control-treatment.ts — the SAME material SegmentedControl renders from. The
// dropdown MENU wears that same liquid glass, so the open control reads as one
// continuous glass surface with the trigger that summoned it.
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
  CONTROL_INACTIVE_COLOR,
  controlChrome,
  glassTrack,
} from "../../internal/control-treatment";

/** Height/scale variants, matching SegmentedControl's. */
type SelectSize = "sm" | "md";

/**
 * One choice in the menu. `label` is shown in the menu; `triggerLabel`, when
 * given, is the compact form shown on the collapsed trigger (e.g. menu "Cost
 * (High to Low)" → trigger "Cost ↓"), so a long menu entry stays readable while
 * the button stays narrow enough to share a line.
 */
export interface SelectOption {
  value: string;
  label: string;
  triggerLabel?: string;
}

export interface SelectProps {
  /** The choices shown in the menu. */
  options: SelectOption[];
  /** The currently-selected option's value. */
  value: string;
  /** Fires with the newly-selected value when the user picks a menu item. */
  onChange?: (value: string) => void;
  /**
   * Leading glyph drawn at the start of the trigger — the control's identity
   * (a filled funnel for a filter, filled up/down arrows for a sort). It stands
   * in for a text label, keeping the trigger to a single font.
   */
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
  /** Accessible label for the trigger. */
  ariaLabel?: string;
  /** Text shown when `value` does not match an option, for action-picker controls. */
  placeholder?: string;
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
 * Select — a dropdown control whose trigger wears the shared glass control
 * surface and whose menu is a portaled raised popover. `options` is the choice list,
 * `value` the selected value, `onChange(value)` fires on pick.
 */
export function Select({
  options,
  value,
  onChange,
  leadingGlyph,
  size = "md",
  full = false,
  align = "start",
  ariaLabel,
  placeholder,
}: SelectProps): ReactElement {
  const spec = SIZES[size];
  const chrome = controlChrome();
  const { pressed, hovered, bind } = usePress();

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
  const hasSelection = options.some((option) => option.value === value);

  return (
    <div style={{ position: "relative", display: full ? "block" : "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
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
          <GlowIcon
            iconClass={leadingGlyph}
            color={chrome.triggerGlyphColor}
            size="1.1em"
          />
        )}
        {/* The trigger's text — a single font by construction, so a caller
            cannot mix two type voices in one button. Every option's label is
            stacked in one grid cell; only the selected one shows, and the hidden
            siblings hold the trigger at the width of the WIDEST label so the
            button never resizes as the selection changes. Each label keeps its
            full intrinsic width (no overflow clip / percentage max-width, which
            would collapse the auto-sized grid track and truncate the label until
            the next relayout) — the button is always wide enough to show any
            label in full. */}
        <span
          style={{
            display: "grid",
            flex: full ? 1 : undefined,
            justifyItems: "start",
          }}
        >
          {placeholder === undefined ? null : (
            <span
              aria-hidden={hasSelection ? true : undefined}
              style={{
                gridArea: "1 / 1",
                visibility: hasSelection ? "hidden" : "visible",
                whiteSpace: "nowrap",
                textAlign: "left",
                color: token("--text-primary"),
              }}
            >
              {placeholder}
            </span>
          )}
          {options.map((option) => (
            <span
              key={option.value}
              aria-hidden={option.value === value ? undefined : true}
              style={{
                gridArea: "1 / 1",
                visibility: option.value === value ? "visible" : "hidden",
                whiteSpace: "nowrap",
                textAlign: "left",
                color: token("--text-primary"),
              }}
            >
              {option.triggerLabel ?? option.label}
            </span>
          ))}
        </span>
        <GlowIcon
          iconClass={GLYPHS.caretDown}
          color={chrome.triggerGlyphColor}
          size="1.1em"
        />
      </button>

      {open &&
        anchor !== null &&
        createPortal(
          <div
            ref={menuRef}
            className="cumulus"
            role="listbox"
            style={{
              position: "fixed",
              top: anchor.top,
              ...menuPosition,
              minWidth: anchor.width,
              zIndex: 90,
              // No inner padding: option rows run edge to edge so a selected /
              // hovered row is a full-width rectangle. `overflow: hidden` lets
              // the popover's rounded corners clip the top and bottom rows.
              overflow: "hidden",
              // The menu wears the same liquid glass as the trigger, so the open
              // control reads as one continuous glass surface.
              ...glassTrack(),
              borderRadius: token("--radius-popover"),
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
        // Generous side padding so a long label has room off both edges,
        // especially the trailing end where nothing else breaks the line.
        padding: `0 ${token("--space-5")}`,
        border: "none",
        // A full-width rectangle band — the menu's own rounded corners clip it,
        // so no per-row radius.
        borderRadius: 0,
        background: lit ? token("--surface-hover") : "transparent",
        font: token("--t-body-sm"),
        color: active ? token("--text-on-accent") : CONTROL_INACTIVE_COLOR,
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
          width: "1.1em",
          display: "inline-flex",
          justifyContent: "center",
          opacity: active ? 1 : 0,
        }}
      >
        {/* White so the selected-row mark stands out against the glass. */}
        <GlowIcon iconClass={GLYPHS.check} color="text-primary" size="1.2em" />
      </span>
      {option.label}
    </button>
  );
}
