// EssenceValue — the ONE way to show a player-facing essence amount outside
// flowing rules text: the number glued directly to the filled crypto glyph with
// no gap (`120◆`), kept on a single line. The amount carries no trailing
// "essence" word because the glyph names the currency.
//
// EssenceValue inherits its type from the surrounding context — it sets the
// color (via `tone`) and the tight number+glyph pairing, nothing else. Size and
// weight come from the element you place it in. The named `rewardBadge` variant
// owns the one solid over-art presentation used for Essence rewards.
//
// Its private glyph helper inherits the surrounding text color and size so the
// complete value remains one canonical rendering.

import type { ReactElement } from "react";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { GLYPHS } from "../../primitives/glyph";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { glossaryInfoCard } from "../card/glossary-info-card";
import { InlineGlyph } from "../typography/InlineGlyph";

/** The filled Boxicons crypto glyph — the essence currency mark everywhere. */
const ESSENCE_ICON_CLASS = GLYPHS.essence;

/**
 * The essence currency glyph on its own, inheriting the surrounding text color
 * (so it tints with the value it follows) and size.
 */
function EssenceGlyph() {
  return <InlineGlyph glyph={ESSENCE_ICON_CLASS} />;
}

/** How the amount and its fixed Essence mark are colored. */
export type EssenceTone = "value" | "mark" | "inherit";

/** The two semantic presentations of an Essence amount. */
export type EssenceValueVariant = "inline" | "rewardBadge";

/** Domain identity for an Essence value that explains itself through an Info Card. */
export interface EssenceEntity {
  /** Stable identity of the Essence source. */
  id: string;
  /** Stable TOML glossary entry used for the explanatory Info Card. */
  glossaryId: string;
}

export interface EssenceValueProps {
  /** The essence amount. */
  amount: number | string;
  /**
   * Color role. `value` paints the complete value in Essence violet; `mark`
   * keeps the amount in primary text and paints only the glyph; `inherit`
   * takes the surrounding text color.
   */
  tone?: EssenceTone;
  /** Inline text or the solid pill used over reward art. */
  variant?: EssenceValueVariant;
  /** Optional semantic source that reveals an explanatory glossary Info Card. */
  entity?: EssenceEntity;
}

/**
 * Renders an essence amount as a currency value — the number glued to the crypto
 * glyph (`120◆`), the whole unit kept on one line and using tabular figures so
 * animating counts don't jitter.
 */
export function EssenceValue({
  amount,
  tone = "value",
  variant = "inline",
  entity,
}: EssenceValueProps) {
  const visual = (
    <EssenceValueVisual amount={amount} tone={tone} variant={variant} />
  );
  return entity === undefined ? (
    visual
  ) : (
    <EssenceValueReveal entity={entity}>{visual}</EssenceValueReveal>
  );
}

function EssenceValueVisual({
  amount,
  tone,
  variant,
}: Required<Pick<EssenceValueProps, "amount" | "tone" | "variant">>) {
  const amountColor =
    tone === "inherit"
      ? "inherit"
      : tone === "mark"
        ? token("--text-primary")
        : token("--essence");
  const glyphColor =
    tone === "inherit" ? "inherit" : token("--essence");
  return (
    // `cumulus` carries the design-token scope so `--essence` resolves when the
    // value is mounted outside a `.cumulus` subtree (e.g. a journey screen).
    <span
      className="cumulus"
      data-essence-value=""
      data-essence-value-variant={variant}
      data-essence-value-tone={tone}
      style={{
        color: amountColor,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        ...(variant === "rewardBadge"
          ? {
              display: "inline-flex",
              alignItems: "center",
              font: token("--t-numeral-lg"),
              paddingBlock: token("--space-3"),
              paddingInline: token("--space-5"),
              background: token("--surface-chrome"),
              border: `1px solid ${token("--border-soft")}`,
              borderRadius: token("--radius-pill"),
            }
          : {}),
      }}
    >
      <span>{amount}</span>
      <span style={{ color: glyphColor, display: "inline-flex" }}>
        <EssenceGlyph />
      </span>
    </span>
  );
}

function EssenceValueReveal({
  entity,
  children,
}: {
  entity: EssenceEntity;
  children: ReactElement;
}) {
  const binding = useRevealSource({
    identity: {
      entityType: "resource-essence",
      entityId: revealEntityId("resource-essence", entity.id),
    },
    spec: {
      primary: {
        kind: "infoCard",
        card: glossaryInfoCard(entity.glossaryId, {
          variant: "icon",
          glyph: GLYPHS.essence,
        }),
      },
      secondaries: [],
    },
  });
  return (
    <Pressable
      as="span"
      ref={binding.ref}
      {...binding.sourceProps}
      tabIndex={0}
      data-essence-source={entity.id}
      style={{ ...binding.sourceProps.style, display: "inline-flex" }}
    >
      {children}
    </Pressable>
  );
}
