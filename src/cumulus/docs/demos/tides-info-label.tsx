import { TidesInfoLabel } from "../../components/hud/TidesInfoLabel";
import type { CumulusComponent } from "../registry";

function TidesInfoLabelDemo() {
  return <TidesInfoLabel />;
}

export const tidesInfoLabelDemo: CumulusComponent = {
  id: "tides-info-label",
  title: "Tides Info Label",
  blurb:
    "The typographic Tides eyebrow: a filled one-em information glyph followed by uppercase copy, with one shared definition reveal across the complete label.",
  callout: "Use this label to introduce a tide-disc group.",
  details: [
    "Hover, keyboard focus, and touch-hold reveal the canonical Tides InfoCard; InlineGlyph keeps the information mark centered on the surrounding capital height.",
  ],
  group: "Components",
  docName: "TidesInfoLabel",
  Component: TidesInfoLabelDemo,
  usage: [
    {
      note: "Place the fixed label beside or above a group of semantic TideDisc objects.",
      code: `import { TidesInfoLabel } from "src/cumulus/components/hud/TidesInfoLabel";

<TidesInfoLabel />`,
    },
  ],
  demo: { defaultArgs: {} },
};
