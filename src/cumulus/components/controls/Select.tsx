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
// the Select is dropped into. It opens on the side with enough viewport space
// when possible and scrolls within the available height when neither side can
// fit every option. It closes on selection, on Escape, on an outside press, and
// on scroll/resize (a menu detached from its moved trigger reads as a bug, so it
// dismisses rather than chases).

import {
  type CSSProperties,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { LocalizedString } from "@trox/runtime";
import { createPortal } from "react-dom";
import { HOVER_SCALE, PRESS_SCALE, usePress } from "../../primitives/Pressable";
import { StandaloneGlyph } from "./StandaloneGlyph";
import { type Glyph, GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import {
  CONTROL_INACTIVE_COLOR,
  controlChrome,
  glassTrack,
} from "../../internal/control-treatment";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

/** Height/scale variants, matching SegmentedControl's. */
type SelectSize = "sm" | "md";

/**
 * One choice in the menu. `label` is shown in the menu; `triggerLabel`, when
 * given, is the compact form shown on the collapsed trigger (e.g. menu "Cost
 * (High to Low)" → trigger "Cost ↓"), so a long menu entry stays readable while
 * the button stays narrow enough to share a line.
 */
/** One option whose copy remains localized until its DOM text node. */
export interface SelectOption<Value extends string = string> {
  value: Value;
  label: LocalizedString;
  triggerLabel?: LocalizedString;
  disabled?: boolean;
}

export interface SelectProps<Value extends string = string> {
  /** The choices shown in the menu. */
  options: SelectOption<Value>[];
  /** The currently-selected option's value. */
  value: Value;
  /** Fires with the newly-selected value when the user picks a menu item. */
  onChange?: (value: Value) => void;
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
  ariaLabel?: LocalizedString;
  /** Text shown when `value` does not match an option, for action-picker controls. */
  placeholder?: LocalizedString;
}

interface SizeSpec {
  height: number;
  font: string;
  padding: string;
}

const SIZES: Record<SelectSize, SizeSpec> = {
  sm: {
    height: 34,
    font: token("--t-body-sm"),
    padding: `0 ${token("--space-m")}`,
  },
  md: {
    height: 42,
    font: token("--t-body"),
    padding: `0 ${token("--space-l")}`,
  },
};

/** Gap (px) between the trigger and the menu it drops. */
const MENU_GAP_PX = 6;

/** Minimum height (px) of one menu option, used to choose an opening side. */
const MENU_ITEM_MIN_HEIGHT_PX = 36;

/** The fixed-position box the portaled menu is placed in, in viewport pixels. */
interface MenuAnchor {
  side: "above" | "below";
  verticalOffset: number;
  maxHeight: number;
  left: number;
  right: number;
  width: number;
}

/**
 * Select — a dropdown control whose trigger wears the shared glass control
 * surface and whose menu is a portaled raised popover. `options` is the choice list,
 * `value` the selected value, `onChange(value)` fires on pick.
 */
export function Select<Value extends string>({
  options,
  value,
  onChange,
  leadingGlyph,
  size = "md",
  full = false,
  align = "start",
  ariaLabel,
  placeholder,
}: SelectProps<Value>): ReactElement {
  const spec = SIZES[size];
  const chrome = controlChrome();
  const { pressed, hovered, bind } = usePress();
  const resolve = useLocalizer();

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef("");
  const typeaheadResetRef = useRef<number | undefined>(undefined);

  const close = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger === null) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = Math.max(
      0,
      window.innerHeight - rect.bottom - MENU_GAP_PX,
    );
    const spaceAbove = Math.max(0, rect.top - MENU_GAP_PX);
    const estimatedMenuHeight = options.length * MENU_ITEM_MIN_HEIGHT_PX;
    const side =
      estimatedMenuHeight > spaceBelow && spaceAbove > spaceBelow
        ? "above"
        : "below";
    setAnchor({
      side,
      verticalOffset:
        side === "above"
          ? window.innerHeight - rect.top + MENU_GAP_PX
          : rect.bottom + MENU_GAP_PX,
      maxHeight: side === "above" ? spaceAbove : spaceBelow,
      left: rect.left,
      right: window.innerWidth - rect.right,
      width: rect.width,
    });
    setOpen(true);
  }, [options.length]);

  // While open, dismiss on Escape, on an outside press, and when the page or
  // another container scrolls. Scrolling the menu itself must keep it open.
  // Other scrolls can move the trigger away from this captured anchor.
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
    function onScroll(e: Event): void {
      const target = e.target;
      if (target instanceof Node && menuRef.current?.contains(target) === true)
        return;
      close();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onOutside, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const buttons = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="option"]',
      ) ?? []),
    ];
    const active = buttons.find(
      (button) => button.dataset.value === value && !button.disabled,
    );
    const firstEnabled = buttons.find((button) => !button.disabled);
    (active ?? firstEnabled)?.focus();
  }, [open, value]);

  useEffect(
    () => () => {
      if (typeaheadResetRef.current !== undefined) {
        window.clearTimeout(typeaheadResetRef.current);
      }
    },
    [],
  );

  const menuPosition: CSSProperties =
    align === "end" && anchor !== null
      ? { right: anchor.right }
      : { left: anchor?.left };
  const menuVerticalPosition: CSSProperties =
    anchor?.side === "above"
      ? { bottom: anchor.verticalOffset }
      : { top: anchor?.verticalOffset };
  const menuMaxWidth =
    anchor === null
      ? undefined
      : Math.max(
          anchor.width,
          window.innerWidth -
            (align === "end" ? anchor.right : anchor.left) -
            12,
        );
  const hasSelection = options.some((option) => option.value === value);

  return (
    <div
      style={{ position: "relative", display: full ? "block" : "inline-block" }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel === undefined ? undefined : resolve(ariaLabel)}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            openMenu();
          }
        }}
        {...bind}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: token("--space-s"),
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
          <span style={{ display: "inline-flex", fontSize: "1.1em" }}>
            <StandaloneGlyph
              glyph={leadingGlyph}
              color={chrome.triggerGlyphColor}
            />
          </span>
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
              {resolve(placeholder)}
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
              {resolve(option.triggerLabel ?? option.label)}
            </span>
          ))}
        </span>
        <span style={{ display: "inline-flex", fontSize: "1.1em" }}>
          <StandaloneGlyph
            glyph={GLYPHS.caretDown}
            color={chrome.triggerGlyphColor}
          />
        </span>
      </button>

      {open &&
        anchor !== null &&
        createPortal(
          <div
            ref={menuRef}
            className="cumulus"
            role="listbox"
            onKeyDown={(event) => {
              const buttons = [
                ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
                  '[role="option"]',
                ) ?? []),
              ];
              if (buttons.length === 0) return;
              const focusedIndex = Math.max(
                0,
                buttons.indexOf(document.activeElement as HTMLButtonElement),
              );
              const focusAt = (start: number, direction: 1 | -1) => {
                for (let step = 0; step < buttons.length; step += 1) {
                  const index =
                    (start + step * direction + buttons.length) %
                    buttons.length;
                  const candidate = buttons[index];
                  if (!candidate.disabled) {
                    candidate.focus();
                    candidate.scrollIntoView?.({ block: "nearest" });
                    return;
                  }
                }
              };
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusAt(focusedIndex + 1, 1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                focusAt(focusedIndex - 1, -1);
              } else if (event.key === "Home") {
                event.preventDefault();
                focusAt(0, 1);
              } else if (event.key === "End") {
                event.preventDefault();
                focusAt(buttons.length - 1, -1);
              } else if (
                event.key.length === 1 &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey
              ) {
                typeaheadRef.current += event.key.toLocaleLowerCase();
                if (typeaheadResetRef.current !== undefined) {
                  window.clearTimeout(typeaheadResetRef.current);
                }
                typeaheadResetRef.current = window.setTimeout(() => {
                  typeaheadRef.current = "";
                }, 700);
                const match = buttons.find(
                  (button) =>
                    !button.disabled &&
                    (button.textContent ?? "")
                      .trim()
                      .toLocaleLowerCase()
                      .startsWith(typeaheadRef.current),
                );
                if (match) {
                  event.preventDefault();
                  match.focus();
                  match.scrollIntoView?.({ block: "nearest" });
                }
              }
            }}
            style={{
              position: "fixed",
              ...menuVerticalPosition,
              ...menuPosition,
              minWidth: anchor.width,
              maxWidth: menuMaxWidth,
              maxHeight: anchor.maxHeight,
              zIndex: 90,
              // No inner padding: option rows run edge to edge so a selected /
              // hovered row is a full-width rectangle. Constraining the menu to
              // the available viewport height keeps every option reachable.
              overflowX: "hidden",
              overflowY: "auto",
              overscrollBehavior: "contain",
              // The menu wears the same liquid glass as the trigger, so the open
              // control reads as one continuous glass surface.
              ...glassTrack(),
              borderRadius: token("--radius-compact"),
            }}
          >
            {options.map((option) => (
              <MenuItem
                key={option.value}
                option={option}
                active={option.value === value}
                disabled={option.disabled === true}
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

interface MenuItemProps<Value extends string> {
  option: SelectOption<Value>;
  active: boolean;
  disabled: boolean;
  onPick: (value: Value) => void;
}

/** One option row in the dropdown menu — a pressable line with a check on the
 *  selected value. */
function MenuItem<Value extends string>({
  option,
  active,
  disabled,
  onPick,
}: MenuItemProps<Value>): ReactElement {
  const { pressed, hovered, bind } = usePress();
  const resolve = useLocalizer();
  const lit = active || hovered || pressed;
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      data-value={option.value}
      onClick={() => onPick(option.value)}
      {...bind}
      style={{
        display: "flex",
        alignItems: "center",
        gap: token("--space-s"),
        width: "100%",
        minHeight: 36,
        // Generous side padding so a long label has room off both edges,
        // especially the trailing end where nothing else breaks the line.
        padding: `0 ${token("--space-m")}`,
        border: "none",
        // A full-width rectangle band — the menu's own rounded corners clip it,
        // so no per-row radius.
        borderRadius: 0,
        background: lit ? token("--surface-hover") : "transparent",
        font: token("--t-body-sm"),
        color: disabled
          ? token("--text-on-glass-muted")
          : active
            ? token("--text-on-accent")
            : CONTROL_INACTIVE_COLOR,
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "normal",
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
        <span style={{ display: "inline-flex", fontSize: "1.2em" }}>
          <StandaloneGlyph glyph={GLYPHS.check} color="text-primary" />
        </span>
      </span>
      {resolve(option.label)}
    </button>
  );
}
