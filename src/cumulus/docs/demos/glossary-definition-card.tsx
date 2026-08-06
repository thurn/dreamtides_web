// Registry demo entry for GlossaryDefinitionCard — the one keyword-definition
// tile: a single glossary entry rendered through the InfoCard text shell with a
// `richText.rules` body. The tile re-establishes its own `.cumulus` token scope so
// it renders correctly even when portalled outside a Cumulus subtree (e.g. a card
// hover-help popover mounted into `document.body`).
//
// GlossaryDefinitionCard's only prop, `entry`, is a structured `GlossaryEntry`
// model with no interactive control, so it is seeded via sampleContent (the same
// recipe rich-text/info-card use for their model slots) rather than defaultArgs.
// The sample entry is read from the LIVE glossary (its first entry) so the demo
// never hardcodes a term string a data edit could invalidate. `docName` points
// at the real GlossaryDefinitionCard so the props table reports its actual API.

import { GLOSSARY, type GlossaryEntry } from "../../../data/glossary";
import { GlossaryDefinitionCard } from "../../components/card/GlossaryDefinitionCard";
import type { CumulusComponent } from "../registry";

// A real glossary entry, taken from the live glossary rather than hardcoded, so
// the tile renders a genuine keyword + definition and stays valid as the
// glossary is edited.
const SAMPLE_ENTRY: GlossaryEntry = GLOSSARY[0];

// GlossaryDefinitionCard's `entry` prop is required, which the registry's
// `ComponentType<Record<string, unknown>>` signature can't satisfy directly. A
// thin all-optional wrapper (the same recipe rich-text.tsx uses) relaxes
// required-ness so `Component` type-checks; `docName` still points at the real
// GlossaryDefinitionCard so the props table reports its actual (required) API.
function GlossaryDefinitionCardDemo({
  entry = SAMPLE_ENTRY,
}: {
  entry?: GlossaryEntry;
}) {
  return <GlossaryDefinitionCard entry={entry} />;
}

export const glossaryDefinitionCardDemo: CumulusComponent = {
  id: "glossary-definition-card",
  title: "Glossary Definition Card",
  blurb:
    "A renderable keyword-definition tile for normal document flow: one glossary entry in an InfoCard text card whose body is the keyword's rules text. The glossary entry supplies the headline by default and may select definition-only presentation for a complete explanatory sentence. The signature-deck inspector uses it directly. It re-establishes its own `.cumulus` token scope for portalled surfaces.",
  group: "Components",
  docName: "GlossaryDefinitionCard",
  Component: GlossaryDefinitionCardDemo,
  usage: [
    {
      label: "One definition beside a card",
      note: "Render a single keyword's definition tile next to the card that references it. Entries with `termPresentation: \"definitionOnly\"` omit the headline and rely on their complete explanatory sentence.",
      code: `import { GlossaryDefinitionCard } from "src/cumulus/components/card/GlossaryDefinitionCard";
import { lookupGlossaryTerm } from "src/data/glossary";

const entry = lookupGlossaryTerm("reclaim");

<div style={{ display: "flex", gap: 12 }}>
  <GameCard model={{ cardId: card.id, displaySnapshot: card }} />
  {entry && <GlossaryDefinitionCard entry={entry} />}
</div>`,
    },
  ],
  demo: {
    defaultArgs: {},
    sampleContent: {
      entry: SAMPLE_ENTRY,
    },
  },
};
