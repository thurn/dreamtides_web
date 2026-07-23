// Registry demo entry for RichTextView — the renderable for the design system's
// RichText model. A caller describes WHAT a run of copy is (plain prose, rules
// text, an inline underlined name, a compact definition list, a muted note, or a
// stack of parts) with the `richText` constructors, and RichTextView owns HOW it
// looks. This is distinct from the
// `rules-text` demo (RulesText, the raw markup parser): RichText is the model a
// screen states declaratively, and `rules` is just one of its kinds.
//
// RichTextView's only prop, `value`, is a `RichText` model with no interactive
// control, so it is seeded via sampleContent (the same recipe info-card uses for
// its `body` slot) rather than defaultArgs. `docName` points at the real
// RichTextView so the props table reports its actual API.

import {
  RichTextView,
  richText,
  type RichText,
} from "../../components/card/rich-text";
import type { CumulusComponent } from "../registry";

// The seeded rules value: a two-ability card body that exercises keyword
// emphasis (Support / unstoppable / Reclaim / Banish), a `+2✦` spark pip, and a
// `3●` energy cost in one string.
const SAMPLE_VALUE: RichText = richText.rules(
  "Support – Supported allies have +2✦ and unstoppable.\n\nReclaim – 3●, Banish 3 cards from your void.",
);

// RichTextView's `value` prop is required, which the registry's
// `ComponentType<Record<string, unknown>>` signature can't satisfy directly. A
// thin all-optional wrapper (the same recipe rules-text.tsx uses) relaxes
// required-ness so `Component` type-checks; `docName` still points at the real
// RichTextView so the props table reports its actual (required) API.
function RichTextViewDemo({ value = SAMPLE_VALUE }: { value?: RichText }) {
  return <RichTextView value={value} />;
}

export const richTextDemo: CumulusComponent = {
  id: "rich-text",
  title: "Rich Text",
  blurb:
    "The design system's model for a run of formatted copy. The caller describes what the text is — plain prose, Dreamtides rules text with glossary-keyword emphasis and inline resource glyphs, an underlined named subject inside continuous prose, a compact definition list, a muted note, or a stack of parts — and the renderer owns how it looks. Copy slots take a RichText, never an arbitrary node.",
  callout:
    "Build values with the `richText` constructors — `richText.plain`, `richText.rules`, `richText.inline`, `richText.underline`, `richText.definitions`, `richText.note`, and `richText.stack` — and hand them to a copy slot (like `InfoCard.body`); reach for `RichTextView` only to render a standalone value inline. Use underline only for a semantically named subject, not general emphasis.",
  group: "Components",
  docName: "RichTextView",
  Component: RichTextViewDemo,
  usage: [
    {
      label: "Rules body in an InfoCard",
      note: "Pass a `richText.rules(...)` value into a copy slot so glossary keywords gain the spark-amber emphasis and resource symbols render as inline glyphs.",
      code: `import { InfoCard } from "src/cumulus/components/overlay/InfoCard";
import { richText } from "src/cumulus/components/card/rich-text";

<InfoCard
  variant="text"
  title="Woodland Apparition"
  body={richText.rules("Support - Supported allies have +2 and unstoppable.")}
/>`,
    },
    {
      label: "Underline a named subject",
      note: "Compose inline prose from plain runs and a strict underlined subject run when a card or dreamsign name must be called out.",
      code: `import { richText } from "src/cumulus/components/card/rich-text";

const description = richText.inline(
  richText.plain("Gain "),
  richText.underline("Rainbow Horn"),
  richText.plain("."),
);`,
    },
    {
      label: "Blurb with a status note",
      note: "Stack a plain blurb over a muted italic `note` so a site description and its status read as one value.",
      code: `import { richText } from "src/cumulus/components/card/rich-text";

const blurb = richText.stack(
  richText.plain("Spend essence on cards, dreamsigns, and services."),
  richText.note("Visited"),
);`,
    },
    {
      label: "Render a standalone value",
      note: "When copy is not already flowing through a slot, RichTextView renders a RichText value inline.",
      code: `import { RichTextView, richText } from "src/cumulus/components/card/rich-text";

<RichTextView value={richText.plain("A rising tide floods the board.")} />`,
    },
  ],
  demo: {
    defaultArgs: {},
    sampleContent: {
      value: SAMPLE_VALUE,
    },
  },
};
