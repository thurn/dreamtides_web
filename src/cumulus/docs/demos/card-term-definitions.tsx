// Registry demo entry for CardTermDefinitions — one compact InfoCard containing
// priority-ordered, de-duped definitions for every gameplay term in a stretch of
// rules text. It renders `null` when the text references no terms, so callers
// place it unconditionally; when it does render, it re-establishes its own
// `.cumulus` scope so it works inside a portalled hover-help popover.
//
// `text` is a string (a text control) and `side` a string-literal union (a
// select control), both seeded from defaultArgs. `testId` is an optional string.
// The seeded `text` is built from the LIVE glossary — a sentence naming its first
// couple of terms — so the demo never hardcodes a term string a data edit could
// invalidate. `docName` points at the real CardTermDefinitions so the props table
// reports its actual API.

import { GLOSSARY, TRIGGER_ARROW } from "../../../data/glossary";
import { CardTermDefinitions } from "../../components/card/CardTermDefinitions";
import type { CumulusComponent } from "../registry";

// A term-bearing string built from live glossary data rather than hardcoded: the
// first two terms whose bare keyword form appears in rules text (skipping the
// trigger-arrow-only entries, which match only their `▸`-prefixed form). Naming
// them in a sentence guarantees `extractGlossaryTerms` returns exactly these two
// entries, so the demo shows a real, non-empty set of definitions and stays
// valid as the glossary is edited.
const SAMPLE_TERMS = GLOSSARY.filter(
  (entry) => !entry.term.startsWith(TRIGGER_ARROW),
).slice(0, 2);
const SAMPLE_TEXT = `${SAMPLE_TERMS[0]?.term ?? ""} and ${
  SAMPLE_TERMS[1]?.term ?? ""
} appear in this reminder text.`;

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
      note: "Pass a card's rules text and the side the panel sits on; one compact, title-free card renders every referenced keyword and definition in glossary-priority order as a bold white term, colon, and white definition. Tight leading groups wrapped copy while a larger gap separates definitions; cards with no terms render nothing.",
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
