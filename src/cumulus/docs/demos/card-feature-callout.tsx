import {
  CardFeatureCallout,
  type CardFeatureCalloutKind,
} from "../../components/overlay/CardFeatureCallout";
import type { CumulusComponent } from "../registry";

function CardFeatureCalloutDemo(args: Record<string, unknown>) {
  const feature: CardFeatureCalloutKind =
    args.feature === "spark" ||
    args.feature === "ability" ||
    args.feature === "cardType"
      ? args.feature
      : "cost";
  return <CardFeatureCallout feature={feature} />;
}

export const cardFeatureCalloutDemo: CumulusComponent = {
  id: "card-feature-callout",
  title: "Card Feature Callout",
  blurb:
    "A compact speech-inspired glass label for teaching one semantic region of a full GameCard, with canonical energy and spark glyph treatments.",
  callout:
    "Use beside a full GameCard with a screen-owned leader line whose endpoint is measured from the rendered card region. The component owns the card-language labels, resource colors, and popover material; its caller owns placement and geometry.",
  group: "Components",
  docName: "CardFeatureCallout",
  Component: CardFeatureCalloutDemo,
  usage: [
    {
      code: `import { CardFeatureCallout } from "src/cumulus/components/overlay/CardFeatureCallout";

<CardFeatureCallout feature="cost" />`,
    },
  ],
  demo: {
    defaultArgs: { feature: "cost" },
  },
};
