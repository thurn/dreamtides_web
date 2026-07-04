// SegmentedControl — the compact tab/filter switch used for type filters
// (All / Characters / Events), sort direction, and small mode toggles. The
// active segment carries the violet accent-gradient fill; the track is the
// same liquid-glass pane as GroupPanel, shaped as a pill.
//
// The track surface is GroupPanel's own glass recipe (`groupPanelStyle()`)
// with the radius overridden to `--radius-pill`, so the switch shares the one
// grouping-surface material rather than inventing its own inset. The active
// segment's colors and shape are token-driven (`--radius-pill`,
// `--gradient-accent`, `--glow-accent-soft`, `--text-muted`,
// `--text-on-accent`, `--font-ui`), never a raw hex duplicating a token.
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
import { PRESS_SCALE, usePress } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { groupPanelStyle } from "./GroupPanel";

/** Height/scale variants. */
type SegmentedControlSize = "sm" | "md";

/** One selectable segment: an explicit `{ value, label }` pair. */
export interface SegmentedOption {
  value: string;
  label: string;
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
  onSelect: (value: string) => void;
}

/**
 * A single pressable tab within the track. Combines the shared press-scale
 * transform with the selected/unselected fill on one element, so it uses
 * the `usePress` hook directly rather than the `<Pressable>` wrapper.
 */
function Segment({ option, active, full, font, onSelect }: SegmentProps): ReactElement {
  const { pressed, bind } = usePress();

  return (
    <button
      type="button"
      role="tab"
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
        borderRadius: token("--radius-pill"),
        border: "none",
        font: `${active ? 700 : 600} ${String(font)}px/1 ${token("--font-ui")}`,
        color: active ? token("--text-on-accent") : token("--text-muted"),
        background: active ? token("--gradient-accent") : "transparent",
        boxShadow: active ? token("--glow-accent-soft") : "none",
        cursor: "pointer",
        whiteSpace: "nowrap",
        WebkitTapHighlightColor: "transparent",
        transformOrigin: "center",
        transform: pressed ? `scale(${String(PRESS_SCALE)})` : "none",
        transition: `color ${token("--dur-fast")}, background ${token("--dur-base")}, transform ${token("--dur-fast")}`,
      }}
    >
      {option.label}
    </button>
  );
}

/**
 * SegmentedControl — the compact tab/filter switch (a hand filter, sort
 * mode, view toggle). `options` is an array of strings or `{ value, label }`.
 * `value` is the selected value, `onChange(value)` fires on switch. Sibling
 * of TidePill and StatTile in the parent design system.
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

  return (
    <div
      role="tablist"
      style={{
        // The track is the same liquid-glass material as GroupPanel — the one
        // grouping surface — so a segmented switch reads as a member of the
        // same family rather than its own ad-hoc inset. Only the radius differs:
        // a segmented track is a pill, not a panel.
        ...groupPanelStyle(),
        borderRadius: token("--radius-pill"),
        display: "inline-flex",
        width: full ? "100%" : "auto",
        padding: 3,
        gap: 2,
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
          onSelect={(selected) => onChange?.(selected)}
        />
      ))}
    </div>
  );
}
