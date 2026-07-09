// SegmentedControl — the compact tab/filter switch used for type filters
// (All / Characters / Events), sort direction, and small mode toggles.
//
// The track surface, its padding, the segment radius, and the resting /
// selected segment styling all come from the shared `controlChrome()` glass
// material in control-treatment.ts — the same source Select renders from — so a
// whole filter/sort cluster reads as one liquid-glass surface with a neutral
// frosted selected segment. No raw hex is duplicated at the call site: the
// chrome resolves to tokens.
//
// Each segment routes its press feedback through the shared `usePress` hook
// rather than hand-rolling a scale: a segment already needs to
// combine the press transform with its `active` (selected) background/
// color/shadow on the very same element, which is exactly the composition
// case Pressable.tsx's own doc comment calls out for the hook form (see
// Button.tsx for the sibling precedent).
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/pills/SegmentedControl.jsx / .d.ts).

import type { ReactElement } from "react";
import { HOVER_SCALE, PRESS_SCALE, usePress } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { type ControlChrome, controlChrome } from "../../internal/control-treatment";

/** Height/scale variants. */
type SegmentedControlSize = "sm" | "md";

/** One selectable segment: an explicit `{ value, label }` pair. */
export interface SegmentedOption {
  value: string;
  label: string;
  /** Accessible name when the visible label is symbolic, such as an arrow. */
  ariaLabel?: string;
}

export interface SegmentedControlProps {
  /** Segments to render: plain strings (value === label), or `{ value, label }` pairs. */
  options: (string | SegmentedOption)[];
  /** The currently-selected segment's value. */
  value: string;
  /** Fires with the newly-selected segment's value when the user switches. */
  onChange?: (value: string) => void;
  /** Height/scale. Default 'md'. */
  size?: SegmentedControlSize;
  /** Stretch to fill the container width, each segment sharing it equally. */
  full?: boolean;
}

interface SizeSpec {
  height: number;
  font: number;
}

const SIZES: Record<SegmentedControlSize, SizeSpec> = {
  sm: { height: 34, font: 13 },
  md: { height: 42, font: 14 },
};

/** Normalizes a plain-string option to its `{ value, label }` form. */
function normalizeOption(
  option: string | SegmentedOption,
): SegmentedOption {
  return typeof option === "string" ? { value: option, label: option } : option;
}

interface SegmentProps {
  option: SegmentedOption;
  active: boolean;
  full: boolean;
  font: number;
  chrome: ControlChrome;
  onSelect: (value: string) => void;
}

/**
 * A single pressable tab within the track. Combines the shared press-scale
 * transform with the selected/unselected fill on one element, so it uses
 * the `usePress` hook directly rather than the `<Pressable>` wrapper. Its
 * resting / selected appearance is taken entirely from the resolved control
 * chrome.
 */
function Segment({
  option,
  active,
  full,
  font,
  chrome,
  onSelect,
}: SegmentProps): ReactElement {
  const { pressed, hovered, bind } = usePress();

  return (
    <button
      type="button"
      role="tab"
      aria-label={option.ariaLabel}
      aria-selected={active}
      onClick={() => onSelect(option.value)}
      {...bind}
      style={{
        flex: full ? 1 : "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "0 16px",
        height: "100%",
        borderRadius: chrome.segmentRadius,
        border: "none",
        font: `${active ? 700 : 600} ${String(font)}px/1 ${token("--font-ui")}`,
        cursor: "pointer",
        whiteSpace: "nowrap",
        WebkitTapHighlightColor: "transparent",
        transformOrigin: "center",
        transform: pressed
          ? `scale(${String(PRESS_SCALE)})`
          : hovered
            ? `scale(${String(HOVER_SCALE)})`
            : "none",
        transition: `color ${token("--dur-fast")}, background ${token("--dur-base")}, border-color ${token("--dur-base")}, transform ${token("--dur-fast")}`,
        ...chrome.segmentBase,
        ...(active ? chrome.segmentActive : chrome.segmentInactive),
      }}
    >
      {option.label}
    </button>
  );
}

/**
 * SegmentedControl — the compact tab/filter switch (a hand filter, sort
 * mode, view toggle). `options` is an array of strings or `{ value, label }`.
 * `value` is the selected value, `onChange(value)` fires on switch. Its surface
 * is the shared glass control material. Sibling of Select in the
 * parent design system.
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  size = "md",
  full = false,
}: SegmentedControlProps): ReactElement {
  const normalized = options.map(normalizeOption);
  const spec = SIZES[size];
  const chrome = controlChrome();

  return (
    <div
      role="tablist"
      style={{
        // The track surface, its padding, and the segment radius all come from
        // the resolved control chrome — the one source of truth shared with
        // Select — so a control cluster reads as one material.
        ...chrome.track,
        display: "inline-flex",
        width: full ? "100%" : "auto",
        padding: chrome.trackPadding,
        gap: chrome.segmentGap,
        height: spec.height,
      }}
    >
      {normalized.map((option) => (
        <Segment
          key={option.value}
          option={option}
          active={option.value === value}
          full={full}
          font={spec.font}
          chrome={chrome}
          onSelect={(selected) => onChange?.(selected)}
        />
      ))}
    </div>
  );
}
