// TidesInfoLabel — the canonical typographic label for a group of tide discs.
// The complete label is one stationary semantic reveal source: fine pointers
// reveal the general Tides definition on hover, while touch pointers reveal it
// after the shared hold intent. Its leading filled information glyph renders
// through InlineGlyph so its one-em box follows the surrounding eyebrow's cap
// height.

import { GLOSSARY_IDS } from "../../../data/glossary";
import { glossaryInfoCard } from "../card/glossary-info-card";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { InlineGlyph } from "../typography/InlineGlyph";
import { tx } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

const TIDES_INFO_CARD = glossaryInfoCard(GLOSSARY_IDS.tides);

/**
 * A filled information mark followed by the uppercase `Tides:` eyebrow. The
 * mark is exactly one typographic em and shares the surrounding capital-height
 * center.
 * Hover, keyboard focus, and touch-hold reveal the canonical Tides InfoCard.
 */
export function TidesInfoLabel() {
  const resolve = useLocalizer();
  const binding = useRevealSource({
    identity: {
      entityType: "glossary-term",
      entityId: revealEntityId("glossary-term", GLOSSARY_IDS.tides),
    },
    spec: {
      primary: { kind: "infoCard", card: TIDES_INFO_CARD },
      secondaries: [],
    },
    feedback: "stationary",
  });

  return (
    <Pressable
      as="span"
      ref={binding.ref}
      {...binding.sourceProps}
      pressFeedback="stationary"
      hoverFeedback="stationary"
      tabIndex={0}
      ariaLabelMessage={tx(
        "Tides information",
        "Accessible name for the reveal trigger that explains Tides.",
      )}
      data-tides-info-label=""
      style={{
        ...binding.sourceProps.style,
        display: "inline-block",
        whiteSpace: "nowrap",
        font: token("--t-eyebrow"),
        letterSpacing: token("--tracking-eyebrow"),
        textTransform: "uppercase",
        color: token("--text-secondary"),
        lineHeight: 1,
        cursor: "default",
      }}
    >
      <span
        data-tides-info-glyph=""
        style={{ display: "inline-block", marginRight: token("--space-xs") }}
      >
        <InlineGlyph glyph={GLYPHS.infoFilled} />
      </span>
      {resolve(tx(
        "Tides:",
        "Visible eyebrow labeling the list of a Dream Avatar's Tides.",
      ))}
    </Pressable>
  );
}
