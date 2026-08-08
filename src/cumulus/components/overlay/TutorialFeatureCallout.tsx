import type { ReactElement } from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import type { CumulusColor } from "../../primitives/color";
import { token } from "../../primitives/tokens";
import { InlineGlyph } from "../typography/InlineGlyph";
import { createMessageDescriptor } from "../../../data/localization-descriptors";
import type { FluentMessageDescriptor } from "../../../data/localization-messages";
import { formatMessageDescriptor, useMessages } from "../../hooks/use-messages";

/** The four authored card regions taught by the loading-screen anatomy scene. */
export type TutorialFeatureCalloutKind =
  | "cost"
  | "spark"
  | "ability"
  | "cardType";

interface CardFeatureSpec {
  readonly label: FluentMessageDescriptor;
  readonly glyph?: Glyph;
  readonly color?: CumulusColor;
  readonly glyphLabel?: FluentMessageDescriptor;
}

const CARD_FEATURES: Readonly<
  Record<TutorialFeatureCalloutKind, CardFeatureSpec>
> = {
    cost: {
      label: createMessageDescriptor("tutorial-feature-cost"),
      glyph: GLYPHS.energy,
      color: "energy",
      glyphLabel: createMessageDescriptor("tutorial-feature-energy-glyph"),
    },
    spark: {
      label: createMessageDescriptor("tutorial-feature-spark"),
      glyph: GLYPHS.sparkInline,
      color: "spark",
      glyphLabel: createMessageDescriptor("tutorial-feature-spark-glyph"),
    },
    ability: { label: createMessageDescriptor("tutorial-feature-ability") },
    cardType: { label: createMessageDescriptor("tutorial-feature-card-type") },
  };

export interface TutorialFeatureCalloutProps {
  /** Semantic card region named by this callout. */
  readonly feature: TutorialFeatureCalloutKind;
  /** Optional stable test id for product-screen QA. */
  readonly testId?: string;
}

/**
 * Compact glass annotation used beside a full GameCard. The caller owns its
 * placement and leader line; the component owns its card-language copy,
 * resource glyphs, type, and speech-inspired popover material.
 */
export function TutorialFeatureCallout({
  feature,
  testId,
}: TutorialFeatureCalloutProps): ReactElement {
  const spec = CARD_FEATURES[feature];
  const t = useMessages();

  return (
    <aside
      data-tutorial-feature-callout={feature}
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
          label={
            spec.glyphLabel === undefined
              ? undefined
              : formatMessageDescriptor(t, spec.glyphLabel)
          }
        />
      )}
      <span>{formatMessageDescriptor(t, spec.label)}</span>
    </aside>
  );
}
