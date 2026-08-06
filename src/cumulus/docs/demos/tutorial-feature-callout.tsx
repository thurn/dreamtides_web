import {
  TutorialFeatureCallout,
  type TutorialFeatureCalloutKind,
} from "../../components/overlay/TutorialFeatureCallout";
import type { CumulusComponent } from "../registry";

function TutorialFeatureCalloutDemo(args: Record<string, unknown>) {
  const feature: TutorialFeatureCalloutKind =
    args.feature === "spark" ||
    args.feature === "ability" ||
    args.feature === "cardType"
      ? args.feature
      : "cost";
  return <TutorialFeatureCallout feature={feature} />;
}

export const tutorialFeatureCalloutDemo: CumulusComponent = {
  id: "tutorial-feature-callout",
  title: "Tutorial Feature Callout",
  blurb:
    "A compact speech-inspired glass label for teaching one semantic region of a full GameCard, with canonical energy and spark glyph treatments.",
  callout:
    "Use beside a full GameCard with a leader line whose endpoint is measured from the rendered card region.",
  details: [
    "CardFeatureCallout provides the card-language labels, resource colors, and popover material; place the callout and leader line in the surrounding layout.",
  ],
  group: "Components",
  docName: "TutorialFeatureCallout",
  Component: TutorialFeatureCalloutDemo,
  usage: [
    {
      code: `import { TutorialFeatureCallout } from "src/cumulus/components/overlay/TutorialFeatureCallout";

<TutorialFeatureCallout feature="cost" />`,
    },
  ],
  demo: {
    defaultArgs: { feature: "cost" },
  },
};
