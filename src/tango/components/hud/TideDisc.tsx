// TideDisc — the single collapsed tide mark: a small colored disc carrying the
// tide's glyph. This is the Tide family's atom: TideCluster renders its resting
// cluster from it, and the desktop Dreamcaller select renders its hover-reveal
// tide row from it, so the disc's diameter, tint, ring, and glyph treatment
// read identically on every surface and cannot drift apart. Colors and glyphs
// come from `tideVisual` (tide-spec) — the same table the pills and the shared
// InfoCard's tide variant read.
//
// The disc is a mark, not a control: reveal/toggle behaviour belongs to the
// caller (TideCluster's toggle button, the desktop select's
// `InfoCard.PressInfo`). The one interaction the disc owns is its hover
// brightening, enabled via `interactive` when the caller wires the disc up as
// a reveal trigger.

import * as React from "react";
import { GlowIcon } from "../controls/GlowIcon";
import { token } from "../../primitives/tokens";
import type { TangoColor } from "../../primitives/color";
import { tideVisual, type Tide } from "./tide-spec";

/** The collapsed tide disc's diameter, in px. TideCluster's flyer math and the
 * desktop select's tide-row sizing read this same constant, so the disc is one
 * size everywhere. */
export const TIDE_DISC_PX = 24;

export interface TideDiscProps {
  /** Which of the five tides. Fixes the disc's color and glyph. */
  tide: Tide;
  /** Stable id (a tide deck id) for the `data-tide-disc` QA hook. */
  id: string;
  /** Accessible label (e.g. "Tide: Valor"). When unset the disc is decorative
   * and hidden from assistive tech — the resting cluster's discs, whose parent
   * toggle button carries the semantics. */
  label?: string;
  /** Interactive discs brighten on hover and show a pointer cursor — set this
   * when the caller wires the disc up as a reveal trigger. Default false: a
   * resting-cluster disc is inert. */
  interactive?: boolean;
}

/**
 * TideDisc — the single collapsed tide mark: a colored {@link TIDE_DISC_PX}px
 * disc carrying the tide's fixed glyph. The atom TideCluster and the desktop
 * Dreamcaller select both render their tide discs from, so the treatment is
 * identical everywhere a collapsed tide appears.
 */
export function TideDisc({
  tide,
  id,
  label,
  interactive = false,
}: TideDiscProps) {
  const v = tideVisual(tide);
  const [hovered, setHovered] = React.useState(false);
  return (
    <span
      data-tide-disc={id}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      onPointerEnter={interactive ? () => setHovered(true) : undefined}
      onPointerLeave={interactive ? () => setHovered(false) : undefined}
      style={{
        width: TIDE_DISC_PX,
        height: TIDE_DISC_PX,
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
        size={`${String(Math.round(TIDE_DISC_PX * 0.5))}px`}
      />
    </span>
  );
}
