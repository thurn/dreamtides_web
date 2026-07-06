// TideDisc — the single tide mark: a colored disc carrying the tide's glyph.
// This is the Tide family's atom: both the desktop and the mobile Dreamcaller
// select render their reveal-trigger tide rows from it, so the disc's tint,
// ring, and glyph treatment read identically on every surface and cannot drift
// apart. Colors and glyphs come from `tideVisual` (tide-spec) — the same table
// the pills and the shared InfoCard's tide variant read.
//
// The disc comes in two enumerated sizes: `sm` (the desktop select's compact
// hover-reveal row) and `lg` (the mobile select's larger, easier-to-press row).
// The glyph scales with the disc, so both sizes read as the same mark.
//
// The disc is a mark, not a control: reveal/toggle behaviour belongs to the
// caller (the select screens' `InfoCard.PressInfo`). The one interaction the
// disc owns is its hover brightening, enabled via `interactive` when the caller
// wires the disc up as a reveal trigger; the shared hover-enlarge comes from
// that pressable wrapper, so the disc itself never scales (scaling here too
// would compound with the wrapper's transform into a double enlargement).

import * as React from "react";
import { GlowIcon } from "../controls/GlowIcon";
import { token } from "../../primitives/tokens";
import type { TangoColor } from "../../primitives/color";
import { tideVisual, type Tide } from "./tide-spec";

/** The `sm` tide disc's diameter, in px. The desktop select's tide-row sizing
 * reads this constant, so the compact disc is one size everywhere. */
export const TIDE_DISC_PX = 24;

/** The `lg` tide disc's diameter, in px — the mobile select's larger, more
 * touch-friendly disc. */
export const TIDE_DISC_LG_PX = 40;

/** How big a tide disc renders. An enumerated size, never a raw pixel: `sm` is
 * the desktop select's compact row, `lg` the mobile select's larger row. */
export type TideDiscSize = "sm" | "lg";

/** The diameter, in px, each enumerated {@link TideDiscSize} renders at. */
const TIDE_DISC_SIZE_PX: Record<TideDiscSize, number> = {
  sm: TIDE_DISC_PX,
  lg: TIDE_DISC_LG_PX,
};

export interface TideDiscProps {
  /** Which of the five tides. Fixes the disc's color and glyph. */
  tide: Tide;
  /** Stable id (a tide deck id) for the `data-tide-disc` QA hook. */
  id: string;
  /** Accessible label (e.g. "Tide: Valor"). When unset the disc is decorative
   * and hidden from assistive tech. */
  label?: string;
  /** Which enumerated {@link TideDiscSize} to render. Default 'sm'. */
  size?: TideDiscSize;
  /** Interactive discs brighten on hover and show a pointer cursor — set this
   * when the caller wires the disc up as a reveal trigger (the wrapper's
   * shared hover-enlarge handles the scale). Default false. */
  interactive?: boolean;
}

/**
 * TideDisc — the single tide mark: a colored disc carrying the tide's fixed
 * glyph, sized `sm` ({@link TIDE_DISC_PX}px) or `lg` ({@link TIDE_DISC_LG_PX}px).
 * The atom both Dreamcaller-select layouts render their tide discs from, so the
 * treatment is identical everywhere a tide disc appears.
 */
export function TideDisc({
  tide,
  id,
  label,
  size = "sm",
  interactive = false,
}: TideDiscProps) {
  const v = tideVisual(tide);
  const diameter = TIDE_DISC_SIZE_PX[size];
  const [hovered, setHovered] = React.useState(false);
  return (
    <span
      data-tide-disc={id}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      onPointerEnter={
        interactive
          ? // Touch never hovers: on a tap, pointerenter fires with no
            // matching un-hover, which would leave the disc stuck enlarged.
            (event) => {
              if (event.pointerType !== "touch") {
                setHovered(true);
              }
            }
          : undefined
      }
      onPointerLeave={interactive ? () => setHovered(false) : undefined}
      style={{
        width: diameter,
        height: diameter,
        borderRadius: "50%",
        flex: "none",
        display: "grid",
        placeItems: "center",
        background: v.bg,
        border: `1px solid ${v.bd}`,
        cursor: interactive ? "pointer" : undefined,
        filter: interactive && hovered ? "brightness(1.25)" : "none",
        transition: interactive
          ? `filter ${token("--dur-fast")} ${token("--ease-out")}`
          : undefined,
      }}
    >
      <GlowIcon
        iconClass={v.icon}
        color={v.fg as TangoColor}
        size={`${String(Math.round(diameter * 0.5))}px`}
      />
    </span>
  );
}
