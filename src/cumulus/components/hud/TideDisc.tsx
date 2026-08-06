// TideDisc — the single tide mark: a colored disc carrying the tide's glyph.
// This is the Tide family's atom: both the desktop and the mobile DreamAvatar
// select render their reveal-trigger tide rows from it, so the disc's tint,
// ring, and glyph treatment read identically on every surface and cannot drift
// apart. Colors and glyphs come from `tideVisual` (tide-spec) — the same table
// the pills and the shared InfoCard's tide variant read.
//
// The disc comes in two enumerated sizes: `sm` (the desktop select's compact
// hover-reveal row) and `lg` (the mobile select's larger, easier-to-press row).
// The glyph scales with the disc, so both sizes read as the same mark.
//
// The disc is a semantic reveal source. It owns the press/hover binding for its
// tide card; callers supply only the stable tide data and lay the disc out.

import { StandaloneGlyph } from "../controls/StandaloneGlyph";
import type { CumulusColor } from "../../primitives/color";
import { tideVisual, type Tide } from "./tide-spec";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { richText } from "../card/rich-text";
import { glossaryInfoCard } from "../card/glossary-info-card";
import { GLOSSARY_IDS } from "../../../data/glossary";

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
  /** Display name used by the source and its tide card. */
  label: string;
  /** Semantic description revealed by this tide source. */
  description: string;
  /** Which enumerated {@link TideDiscSize} to render. Default 'sm'. */
  size?: TideDiscSize;
}

/**
 * TideDisc — the single tide mark: a colored disc carrying the tide's fixed
 * glyph, sized `sm` ({@link TIDE_DISC_PX}px) or `lg` ({@link TIDE_DISC_LG_PX}px).
 * The atom both DreamAvatar-select layouts render their tide discs from, so the
 * treatment is identical everywhere a tide disc appears.
 */
export function TideDisc({
  tide,
  id,
  label,
  description,
  size = "sm",
}: TideDiscProps) {
  const v = tideVisual(tide);
  const diameter = TIDE_DISC_SIZE_PX[size];
  const binding = useRevealSource({
    identity: { entityType: "tide", entityId: revealEntityId("tide", id) },
    spec: {
      primary: { kind: "infoCard", card: { variant: "tide", tide, title: label, body: richText.plain(description) } },
      secondaries: [glossaryInfoCard(GLOSSARY_IDS.tides)],
    },
  });
  return (
    <Pressable
      as="span"
      ref={binding.ref}
      {...binding.sourceProps}
      data-tide-disc={id}
      aria-label={`Tide: ${label}`}
      tabIndex={0}
      style={{
        ...binding.sourceProps.style,
        width: diameter,
        height: diameter,
        borderRadius: "50%",
        flex: "none",
        display: "grid",
        placeItems: "center",
        fontSize: Math.round(diameter * 0.5),
        background: v.bg,
        border: `1px solid ${v.bd}`,
      }}
    >
      <StandaloneGlyph glyph={v.icon} color={v.fg as CumulusColor} />
    </Pressable>
  );
}
