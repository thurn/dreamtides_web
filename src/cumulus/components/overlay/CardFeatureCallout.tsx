import type { ReactElement } from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import type { CumulusColor } from "../../primitives/color";
import { token } from "../../primitives/tokens";
import { InlineGlyph } from "../typography/InlineGlyph";

/** The four authored card regions taught by the loading-screen anatomy scene. */
export type CardFeatureCalloutKind = "cost" | "spark" | "ability" | "cardType";

interface CardFeatureSpec {
  readonly label: string;
  readonly glyph?: Glyph;
  readonly color?: CumulusColor;
  readonly glyphLabel?: string;
}

const CARD_FEATURES: Readonly<Record<CardFeatureCalloutKind, CardFeatureSpec>> =
  {
    cost: {
      label: "Cost",
      glyph: GLYPHS.energy,
      color: "energy",
      glyphLabel: "energy",
    },
    spark: {
      label: "Spark",
      glyph: GLYPHS.sparkInline,
      color: "spark",
      glyphLabel: "spark",
    },
    ability: { label: "Ability" },
    cardType: { label: "Card Type" },
  };

export interface CardFeatureCalloutProps {
  /** Semantic card region named by this callout. */
  readonly feature: CardFeatureCalloutKind;
  /** Optional stable test id for product-screen QA. */
  readonly testId?: string;
}

/**
 * Compact glass annotation used beside a full GameCard. The caller owns its
 * placement and leader line; the component owns its card-language copy,
 * resource glyphs, type, and speech-inspired popover material.
 */
export function CardFeatureCallout({
  feature,
  testId,
}: CardFeatureCalloutProps): ReactElement {
  const spec = CARD_FEATURES[feature];

  return (
    <aside
      data-card-feature-callout={feature}
      data-testid={testId}
      style={{
        ...glassSurfaceStyle({ radius: token("--radius-pill") }),
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-xs"),
        padding: `${token("--space-xs")} ${token("--space-s")}`,
        background: `${token("--glass-sheen")}, ${token("--glass-fill-popover")}`,
        color: token("--text-on-glass"),
        font: token("--t-body"),
        textAlign: "center",
      }}
    >
      {spec.glyph === undefined ? null : (
        <InlineGlyph
          glyph={spec.glyph}
          color={spec.color}
          label={spec.glyphLabel}
        />
      )}
      <span>{spec.label}</span>
    </aside>
  );
}
