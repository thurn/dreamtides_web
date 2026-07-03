// Registry demo entry for RulesText — see stat-tile.tsx for the wrapper recipe
// this follows. RulesText takes a plain `text` string and renders the authored
// rules-text markup: energy/spark glyphs become inline pips, `▸`/`❖` markers
// become caret/bolt icons, and the curated keyword set (support, unstoppable,
// reclaim, banish, …) is emphasized in spark amber.
//
// RulesText's `text` prop is required, which the registry's
// `ComponentType<Record<string, unknown>>` signature can't satisfy directly. A
// thin all-optional wrapper (same shape as stat-tile.tsx) relaxes required-ness
// so `Component` type-checks; `docName` still points at the real RulesText so
// the props table reports its actual (required) API.
//
// The seeded text is the authored `rendered-text` of the curated card
// "Woodland Apparition" (UUID 1268a899-b209-46bb-bce4-6def1dcd0404) from
// data/tabula/cards_v2.toml — a two-ability card that exercises keyword
// highlighting, a `+2✦` spark pip, and an energy `3●` cost in one string.

import { RulesText } from "../../components/RulesText";
import type { TangoComponent } from "../registry";

const SAMPLE_RULES_TEXT = [
  "Support – Supported allies have +2✦ and unstoppable.",
  "",
  "Reclaim – 3●, Banish 3 cards from your void.",
].join("\n");

interface RulesTextDemoArgs {
  text?: string;
}

function RulesTextDemo({ text = SAMPLE_RULES_TEXT }: RulesTextDemoArgs) {
  return <RulesText text={text} />;
}

export const rulesTextDemo: TangoComponent = {
  id: "rules-text",
  title: "Rules Text",
  group: "Components",
  docName: "RulesText",
  Component: RulesTextDemo,
  usage: [
    {
      note: "Renders authored rules-text markup: energy / spark glyphs become inline pips, `▸` / `❖` markers become caret / bolt icons, and the curated keyword set is emphasized. Pass the card's rendered-text string as `text`.",
      code: `import { RulesText } from "src/tango/components/RulesText";

<RulesText text={"Support – Supported allies have +2✦ and unstoppable."} />`,
    },
  ],
  demo: {
    defaultArgs: {
      text: SAMPLE_RULES_TEXT,
    },
  },
};
