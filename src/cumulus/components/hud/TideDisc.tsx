// TideDisc — the single tide mark: a colored disc carrying the tide's glyph.
// This is the Tide family's atom: both the desktop and the mobile DreamAvatar
// select render their reveal-trigger tide rows from it, so the disc's tint,
// ring, and glyph treatment read identically on every surface and cannot drift
// apart. Colors and glyphs come from `tideVisual` (tide-spec), also used by the
// shared InfoCard tide variant.
//
// The disc uses the larger touch-friendly size everywhere it appears.
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
import { opaque, txa, type LocalizedString } from "@trox/runtime";
import type {
  TideId,
  TutorialJourneyTideId,
} from "../../../types/identifiers";

/** The tide disc's touch-friendly diameter, in px. */
export const TIDE_DISC_LG_PX = 40;

export interface TideDiscProps {
  /** Which of the five tides. Fixes the disc's color and glyph. */
  tide: Tide;
  /** Stable id (a tide deck id) for the `data-tide-disc` QA hook. */
  id: TideId | TutorialJourneyTideId;
  /** Display name used by the source and its tide card. */
  label: LocalizedString;
  /** Semantic description revealed by this tide source. */
  description: LocalizedString;
}

/**
 * TideDisc — the single tide mark: a colored disc carrying the tide's fixed
 * glyph, sized to the canonical {@link TIDE_DISC_LG_PX}px diameter.
 * The atom both DreamAvatar-select layouts render their tide discs from, so the
 * treatment is identical everywhere a tide disc appears.
 */
export function TideDisc({ tide, id, label, description }: TideDiscProps) {
  const v = tideVisual(tide);
  const diameter = TIDE_DISC_LG_PX;
  const binding = useRevealSource({
    identity: { entityType: "tide", entityId: revealEntityId("tide", id) },
    spec: {
      primary: {
        kind: "infoCard",
        card: {
          variant: "tide",
          tide,
          title: label,
          body: richText.plain(description),
        },
      },
      secondaries: [glossaryInfoCard(GLOSSARY_IDS.tides)],
    },
  });
  return (
    <Pressable
      as="span"
      ref={binding.ref}
      {...binding.sourceProps}
      data-tide-disc={id}
      ariaLabelMessage={txa(
        "Tide: {tide_name}",
        { tide_name: opaque(label) },
        "[accessibility] Name for an interactive Tide object. tide_name is its canonical authored display name and has unknown grammatical gender.",
      )}
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
