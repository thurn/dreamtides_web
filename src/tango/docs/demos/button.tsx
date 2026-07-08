// Registry demo entry for Button — see resource-chip.tsx for the recipe this
// follows. `label` is the button's text (a plain string), `cost` its inline
// price and `costKind` the currency that price is denominated in (a select
// control), all seeded via defaultArgs.

import { Button } from "../../components/controls/Button";
import type { TangoComponent } from "../registry";

export const buttonDemo: TangoComponent = {
  id: "button",
  title: "Button",
  blurb:
    "Rung 1 of Tango's four-rung button suite — the beveled purple sprite, the primary/commit action, scaled to any label and to a taller commit height. Lower-emphasis actions step down a rung (GlassButton, IconButton, plain pressable text), never to a recolored Button.",
  group: "Components",
  docName: "Button",
  Component: Button,
  usage: [
    {
      label: "When to use which button",
      note: "The suite has four rungs of decreasing weight. The purple `Button` commits (primary). A labeled `GlassButton` is a secondary chrome action. A glyph-only `IconButton` disc is a compact corner action. Plain pressable text is tertiary/inline (Back, Skip, Reset). A secondary action steps down a rung — never a recolored `Button`.",
      code: `// 1. Primary / commit — the beveled purple sprite:
<Button label="Begin Battle" onClick={begin} />

// 2. Secondary chrome — a labeled glass control:
<GlassButton label="Filter" glyph="filter" onPress={openFilter} />

// 3. Compact chrome — a glyph-only glass disc:
<IconButton label="Close" glyph="close" onPress={close} />

// 4. Tertiary / inline — plain pressable text:
<Pressable onPress={goBack}><span>Back</span></Pressable>`,
    },
    {
      label: "With cost",
      note: "A `cost` renders after the label, in white, inside the one purple button sprite. It defaults to essence.",
      code: `import { Button } from "src/tango/components/controls/Button";

<Button
  size="md"
  cost={100}
  label="Begin Battle"
  onClick={beginBattle}
/>`,
    },
    {
      label: "Other cost currencies",
      note: "`costKind` denominates the price in any economy currency — energy, spark, points, or counter — swapping only the mark (the price stays on-accent white).",
      code: `<Button
  size="md"
  cost={3}
  costKind="energy"
  label="Activate"
  onClick={activate}
/>`,
    },
    {
      label: "Commit action",
      note: "`size=\"lg\"` is the taller commit height; `full` stretches the button to its container width.",
      code: `<Button size="lg" full label="Begin Your Dream" onClick={confirm} />`,
    },
    {
      label: "Disabled",
      note: "Dims the button and detaches its click / press feedback.",
      code: `<Button disabled label="Not Ready" />`,
    },
  ],
  demo: {
    defaultArgs: {
      size: "md",
      full: false,
      disabled: false,
      cost: 100,
      costKind: "essence",
      label: "Begin Battle",
    },
  },
};
