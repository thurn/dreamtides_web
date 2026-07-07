import { GlossaryDefinitionCard } from "../../components/card/GlossaryDefinitionCard";
import type { TangoComponent } from "../registry";

const sampleEntry = {
  term: "Support",
  definition: "A card with Support helps another card or object when its condition is met.",
};

function GlossaryDefinitionCardDemo() {
  return <GlossaryDefinitionCard entry={sampleEntry} />;
}

export const glossaryDefinitionCardDemo: TangoComponent = {
  id: "glossary-definition-card",
  title: "Glossary Definition Card",
  blurb:
    "The single keyword-definition tile: one glossary entry rendered through the InfoCard text shell with rules-rich body copy.",
  group: "Components",
  docName: "GlossaryDefinitionCard",
  Component: GlossaryDefinitionCardDemo,
  usage: [
    {
      code: `import { GlossaryDefinitionCard } from "src/tango/components/card/GlossaryDefinitionCard";

<GlossaryDefinitionCard entry={entry} />`,
    },
  ],
  demo: {
    defaultArgs: {},
  },
};
