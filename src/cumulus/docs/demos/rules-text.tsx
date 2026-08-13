import { assertLocalized } from "@trox/runtime";
// Registry demo entry for RulesText — see stat-tile.tsx for the wrapper recipe
// this follows. RulesText takes a plain `text` string and renders the authored
// rules-text markup: energy/spark glyphs become inline pips, `▸` remains
// compact Unicode text, `❖` becomes a bolt icon, and the curated keyword set
// (support, reclaim, banish, …) is emphasized in spark amber. The
// memory source symbol renders as its filled brain. The complete block is the
// one reveal source for every contextual glossary definition it contains.
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
  "Support – Supported allies have +2✦.",
  "",
  "Reclaim – 3●, Banish 3 cards from your void.",
  "",
  "▸Dawn: Store 1⧗. Gain 2⍟.",
].join("\n");
const SAMPLE_CARD_ID = "11111111-1111-4111-8111-111111111111";

interface RulesTextDemoArgs {
  text?: string;
}

function RulesTextDemo({ text = SAMPLE_RULES_TEXT }: RulesTextDemoArgs) {
  return (
    <RulesText
      text={assertLocalized(text)}
      owner={{ kind: "card", id: SAMPLE_CARD_ID }}
    />
  );
}

export const rulesTextDemo: CumulusComponent = {
  id: "rules-text",
  title: "Rules Text",
  blurb:
    "The canonical Dreamtides rules-copy source: resource symbols and keywords render in place, while hovering, focusing, or touch-holding anywhere in the complete block reveals one contextual glossary card.",
  group: "Components",
  docName: "RulesText",
  Component: RulesTextDemo,
  usage: [
    {
      note: "Pass the complete authored rules text plus its semantic owner. The whole block is one stationary glossary source; entities such as GameCard and Dreamsign use the delegated interaction so hovering anywhere on the entity remains the trigger.",
      code: `import { RulesText } from "src/cumulus/components/card/RulesText";

<RulesText
  text={card.renderedText}
  owner={{ kind: "card", id: card.id }}
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      text: SAMPLE_RULES_TEXT,
    },
  },
};
