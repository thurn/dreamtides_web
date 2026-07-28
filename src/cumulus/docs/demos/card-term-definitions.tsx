// Registry demo entry for CardTermDefinitions — one compact InfoCard containing
// occurrence-ordered, de-duped definitions for every gameplay term in a stretch of
// rules text. It renders `null` when the text references no terms, so callers
// place it unconditionally; when it does render, it re-establishes its own
// `.cumulus` scope so it works inside a portalled hover-help popover.
//
// `text` is a string (a text control) and `side` a string-literal union (a
// select control), both seeded from defaultArgs. `testId` is an optional string.
// The seeded `text` uses the four symbol forms whose glossary records exercise
// definition-only presentation. `docName` points at the real
// CardTermDefinitions so the props table reports its actual API.

import { CardTermDefinitions } from "../../components/card/CardTermDefinitions";
import type { CumulusComponent } from "../registry";

const SAMPLE_TEXT = [
  "❖ – Draw a card.",
  "❖❖ – Draw another card.",
  "☪ ⍟",
].join("\n");

// CardTermDefinitions' `text` prop is required, which the registry's
// `ComponentType<Record<string, unknown>>` signature can't satisfy directly, and
// the control panel hands the demo dynamically-built `args`. This thin wrapper
// coerces those args and defaults `text` to the live sample; `docName` still
// points at the real CardTermDefinitions so the props table reports its actual
// API.
function CardTermDefinitionsDemo(args: Record<string, unknown>) {
  return (
    <CardTermDefinitions
      text={typeof args.text === "string" ? args.text : SAMPLE_TEXT}
      side={args.side === "left" ? "left" : "right"}
      testId={typeof args.testId === "string" ? args.testId : undefined}
    />
  );
}

export const cardTermDefinitionsDemo: CumulusComponent = {
  status: "incubating",
  id: "card-term-definitions",
  title: "Card Term Definitions",
  blurb:
    "An incubating compact title-free card containing every gameplay term in a stretch of rules text. It is the normal-flow surface for layouts that need definitions beside or beneath an object; named entity reveals use the same consolidated card model. It renders nothing when the text references no terms.",
  group: "Components",
  docName: "CardTermDefinitions",
  Component: CardTermDefinitionsDemo,
  usage: [
    {
      label: "Definitions beside a card",
      note: "Pass a card's rules text and the side the panel sits on; one compact, title-free card renders every referenced definition in rules-text occurrence order. Rows use a bold white term and colon by default, while glossary entries authored as definition-only render their complete sentence without either. Tight leading groups wrapped copy while a larger gap separates definitions; cards with no terms render nothing.",
      code: `import { CardTermDefinitions } from "src/cumulus/components/card/CardTermDefinitions";

<CardTermDefinitions text={card.rulesText} side="right" />`,
    },
  ],
  demo: {
    defaultArgs: {
      text: SAMPLE_TEXT,
      side: "right",
      testId: "",
    },
  },
};
