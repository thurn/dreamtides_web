// Registry demo entry for ResourceChip — see pressable.tsx for the recipe this
// follows. ResourceChip has no ReactNode-slot props (kind/value/size/chip/
// spacing/tone are all primitives with generated controls), so this demo needs only
// defaultArgs, no sampleContent.

import { ResourceChip } from "../../components/hud/ResourceChip";
import type { CumulusComponent } from "../registry";

export const resourceChipDemo: CumulusComponent = {
  id: "resource-chip",
  title: "Resource Chip",
  blurb:
    "The sized, self-contained value-and-mark chip for the game economy. It owns the economy mark, role color, and enumerated size/spacing/tone variants for HUD-like readouts. For a bare essence amount inside flowing text, reach for EssenceValue instead; for a standalone essence mark, use EssenceGlyph; Button owns its inline cost mark through the shared economy spec.",
  group: "Components",
  docName: "ResourceChip",
  Component: ResourceChip,
  usage: [
    {
      label: "Inline value",
      note: "An icon + numeric value for a resource. `size` picks the inline scale — here the large (20px) scale.",
      code: `import { ResourceChip } from "src/cumulus/components/hud/ResourceChip";

<ResourceChip kind="essence" value={200} size="lg" />`,
    },
    {
      label: "Standalone chip",
      note: "Set `chip` to draw the value on its own rounded surface instead of bare inline.",
      code: `<ResourceChip kind="energy" value={3} chip />`,
    },
    {
      label: "Loosened spacing",
      note: "The value hugs its mark by default (tight); pass `spacing=\"loose\"` to add a little air.",
      code: `<ResourceChip kind="spark" value={12} spacing="loose" />`,
    },
    {
      label: "Inherited surface tone",
      note: "Use the inherited tone when the parent glass or control surface supplies the readable text color.",
      code: `<ResourceChip kind="points" value={4} tone="inherit" />`,
    },
  ],
  demo: {
    defaultArgs: {
      kind: "essence",
      value: 200,
      size: "md",
      chip: false,
      spacing: "tight",
      tone: "resource",
    },
  },
};
