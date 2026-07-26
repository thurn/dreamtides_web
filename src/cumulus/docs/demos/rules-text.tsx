// Registry demo entry for RulesText — see stat-tile.tsx for the wrapper recipe
// this follows. RulesText takes a plain `text` string and renders the authored
// rules-text markup: energy/spark glyphs become inline pips, `▸`/`❖` markers
// become caret/bolt icons, and the curated keyword set (support, unstoppable,
// reclaim, banish, …) is emphasized in spark amber. The memory source symbol
// renders as its filled brain and carries the Memory glossary reveal.
//
// RulesText's `text` prop is required, which the registry's
// `ComponentType<Record<string, unknown>>` signature can't satisfy directly. A
// thin all-optional wrapper (same shape as stat-tile.tsx) relaxes required-ness
// so `Component` type-checks; `docName` still points at the real RulesText so
// the props table reports its actual (required) API.
//
// The seeded text draws from representative authored rules forms to exercise
// keyword highlighting, a `+2✦` spark pip, an energy `3●` cost, memory storage,
// and points in one compact specimen.

import { RulesText } from "../../components/card/RulesText";
import type { CumulusComponent } from "../registry";

const SAMPLE_RULES_TEXT = [
  "Support – Supported allies have +2✦ and unstoppable.",
  "",
  "Reclaim – 3●, Banish 3 cards from your void.",
  "",
  "Store 1⧗. Gain 2⍟.",
].join("\n");

interface RulesTextDemoArgs {
  text?: string;
}

function RulesTextDemo({ text = SAMPLE_RULES_TEXT }: RulesTextDemoArgs) {
  return <RulesText text={text} />;
}

export const rulesTextDemo: CumulusComponent = {
  id: "rules-text",
  title: "Rules Text",
  blurb:
    "Renders Dreamtides rules copy from card data — resource pips, ability carets, and glossary keywords styled in place — with definition cards adapted to the exact rules sentence.",
  group: "Components",
  docName: "RulesText",
  Component: RulesTextDemo,
  usage: [
    {
      note: "Renders authored rules-text markup: energy / spark glyphs become inline pips, `⧗` becomes the memory brain, `▸` / `❖` markers become caret / bolt icons, and the curated keyword set is emphasized. Numeric Foresee, Erode, and Reclaim definitions reflect the exact count or energy cost and use singular grammar where appropriate; granted Reclaim refers to its target card. Pass the card's rendered-text string as `text`.",
      code: `import { RulesText } from "src/cumulus/components/card/RulesText";

<RulesText text={"Support – Supported allies have +2✦ and unstoppable."} />`,
    },
  ],
  demo: {
    defaultArgs: {
      text: SAMPLE_RULES_TEXT,
    },
  },
};
