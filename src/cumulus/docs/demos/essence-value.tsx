import { EssenceValue } from "../../components/hud/EssenceValue";
import type { CumulusComponent } from "../registry";

function EssenceValueDemo(args: Record<string, unknown>) {
  return (
    <EssenceValue
      amount={
        typeof args.amount === "number" || typeof args.amount === "string"
          ? args.amount
          : 120
      }
      tone={
        args.tone === "inherit"
          ? "inherit"
          : args.tone === "mark"
            ? "mark"
            : "value"
      }
      variant={args.variant === "rewardBadge" ? "rewardBadge" : "inline"}
    />
  );
}

export const essenceValueDemo: CumulusComponent = {
  id: "essence-value",
  title: "Essence Value",
  blurb:
    "The canonical Essence amount: a tight inline value for player-facing currency text, with a named solid reward badge for values placed over art.",
  callout: "Use the inline presentation in flowing copy and controls.",
  details: [
    "The reward badge is reserved for an Essence gain attached directly to reward art.",
  ],
  group: "Components",
  docName: "EssenceValue",
  Component: EssenceValueDemo,
  usage: [
    {
      label: "Inline value",
      code: `import { EssenceValue } from "src/cumulus/components/hud/EssenceValue";

<EssenceValue amount={120} />`,
    },
    {
      label: "Reward badge",
      note: "The solid pill preserves contrast when an Essence gain is attached to reward art.",
      code: `<EssenceValue amount="+15" tone="mark" variant="rewardBadge" />`,
    },
  ],
  demo: {
    defaultArgs: {
      amount: 120,
      tone: "value",
      variant: "inline",
    },
  },
};
