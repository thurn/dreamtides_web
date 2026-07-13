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
      tone={args.tone === "inherit" ? "inherit" : "value"}
    />
  );
}

export const essenceValueDemo: CumulusComponent = {
  id: "essence-value",
  title: "Essence Value",
  blurb:
    "The tight inline essence amount: a tabular number glued to the filled essence glyph, for player-facing currency text outside rules copy.",
  group: "Components",
  docName: "EssenceValue",
  Component: EssenceValueDemo,
  usage: [
    {
      code: `import { EssenceValue } from "src/cumulus/components/hud/EssenceValue";

<EssenceValue amount={120} />`,
    },
  ],
  demo: {
    defaultArgs: {
      amount: 120,
      tone: "value",
    },
  },
};
