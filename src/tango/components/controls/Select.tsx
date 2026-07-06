// Select — the compact dropdown control in Tango, and the standard mobile
// filter/sort control: a button that names the current choice and opens a menu.
//
// Where a full choice list would eat a whole row, Select collapses it to one
// resting trigger — a leading glyph (a filled funnel for a filter, filled
// up/down arrows for a sort), the current selection's label, and a dropdown
// chevron — that reveals the rest on tap. Two of them sit on a single line
// where a segmented control could not.
//
// The trigger is single-font BY CONSTRUCTION: it renders exactly one text run,
// the selection label (glyph and chevron are icons, not a second type voice).
// There is no eyebrow or secondary-text slot, so a caller cannot mix two font
// styles in one button. A menu entry may carry a compact `triggerLabel` for the
// collapsed trigger while the menu itself shows the fuller `label`.
//
// The trigger's surface is the shared control material, chosen by `treatment`
// (sprite / flat / glass / accent / outline) from control-treatment.ts — the
// SAME vocabulary SegmentedControl renders from. The dropdown MENU is a solid
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
  /**
   * Surface material for the trigger — one of the shared control treatments.
   * Default 'accent'. The menu stays a solid raised popover regardless.
   */
  treatment?: ControlTreatment;
  /** Accessible label for the trigger. */
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
  // The trigger shows the compact form when the option supplies one, so a long
  // menu entry stays narrow on the collapsed button.
  const label = selected?.triggerLabel ?? selected?.label ?? "";

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
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        {...bind}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          width: full ? "100%" : "auto",
          height: spec.height,
          padding: chrome.triggerPadding ?? spec.padding,
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
          // A treatment with one flat ink (the sprite button) paints the whole
          // label, so it wins over the per-part token colors below via inherit.
          ...chrome.triggerText,
        }}
      >
        {leadingGlyph !== undefined && (
          <GlowIcon
            iconClass={leadingGlyph}
            color={chrome.triggerGlyphColor}
            size="1.1em"
          />
        )}
        {/* The one and only text run on the trigger — a single font by
            construction, so a caller cannot mix two type voices in one button. */}
        <span
          style={{
            flex: full ? 1 : undefined,
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color:
              chrome.triggerText !== undefined
                ? "inherit"
                : token("--text-primary"),
          }}
        >
          {label}
        </span>
        <GlowIcon
          iconClass={GLYPHS.chevronDown}
          color={chrome.triggerGlyphColor}
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
