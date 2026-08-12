import type { ReactElement } from "react";
import {glassSurfaceStyle } from "../../internal/glass-surface";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import type { CumulusColor } from "../../primitives/color";
import { token } from "../../primitives/tokens";
import { InlineGlyph } from "../typography/InlineGlyph";
import { meaning, tx, type LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

/** The four authored card regions taught by the loading-screen anatomy scene. */
export type TutorialFeatureCalloutKind =
  "cost" | "spark" | "ability" | "cardType";

interface CardFeatureSpec {
  readonly label: LocalizedString;
  readonly glyph?: Glyph;
  readonly color?: CumulusColor;
  readonly glyphLabel?: LocalizedString;
}

const CARD_FEATURES: Readonly<
  Record<TutorialFeatureCalloutKind, CardFeatureSpec>
> = {
  cost: {
    label: tx(meaning("tutorial-cost-feature-label", "Cost"), "Loading-screen card feature labels."),
    glyph: GLYPHS.energy,
    color: "energy",
    glyphLabel: tx("energy", "Loading-screen resource glyph accessible names."),
  },
  spark: {
    label: tx(
      meaning("tutorial-spark-feature-label", "Spark"),
      "Player-facing message for the tutorial feature spark interface state.",
    ),
    glyph: GLYPHS.sparkInline,
    color: "spark",
    glyphLabel: tx(
      "spark",
      "Player-facing message for the tutorial feature spark glyph interface state.",
    ),
  },
  ability: {
    label: tx(
      meaning("tutorial-ability-feature-label", "Ability"),
      "Player-facing message for the tutorial feature ability interface state.",
    ),
  },
  cardType: {
    label: tx(
      "Card Type",
      "Player-facing message for the tutorial feature card type interface state.",
    ),
  },
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
  const resolve = useLocalizer();

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
          label={spec.glyphLabel}
        />
      )}
      <span>{resolve(spec.label)}</span>
    </aside>
  );
}
