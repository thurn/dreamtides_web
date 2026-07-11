// Registry demo entry for GlossaryDefinitionCard — the one keyword-definition
// tile: a single glossary entry rendered through the InfoCard text shell with a
// `richText.rules` body. The tile re-establishes its own `.tango` token scope so
// it renders correctly even when portalled outside a Tango subtree (e.g. a card
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
import type { TangoComponent } from "../registry";

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

export const glossaryDefinitionCardDemo: TangoComponent = {
  id: "glossary-definition-card",
  title: "Glossary Definition Card",
  blurb:
    "The one keyword-definition tile: a single glossary entry rendered as an InfoCard text card whose headline is the keyword and whose body is the keyword's rules text. Every surface that reveals what a keyword means renders this one tile, so the definition reads in the same glass shell, radius, and type scale as every other reveal beside it. It re-establishes its own `.tango` token scope, so it renders correctly even inside a popover portalled outside the Tango subtree.",
  group: "Components",
  docName: "GlossaryDefinitionCard",
  Component: GlossaryDefinitionCardDemo,
  usage: [
    {
      label: "One definition beside a card",
      note: "Render a single keyword's definition tile next to the card that references it, so the player reads the keyword without an inline tooltip.",
      code: `import { GlossaryDefinitionCard } from "src/tango/components/card/GlossaryDefinitionCard";
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
