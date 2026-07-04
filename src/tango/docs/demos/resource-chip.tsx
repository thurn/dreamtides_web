// Registry demo entry for ResourceChip — see pressable.tsx for the recipe this
// follows. ResourceChip has no ReactNode-slot props (kind/value/size/chip/gap
// are all primitives with generated controls), so this demo needs only
// defaultArgs, no sampleContent.

import { ResourceChip } from "../../components/ResourceChip";
import type { TangoComponent } from "../registry";

export const resourceChipDemo: TangoComponent = {
  id: "resource-chip",
  title: "Resource Chip",
  blurb:
    "The canonical value-and-mark pairing for the game economy. Every essence, energy, spark, points, or counter number routes through it, so the mark and its role color read identically wherever a value appears.",
  group: "Components",
  docName: "ResourceChip",
  Component: ResourceChip,
  usage: [
    {
      label: "Inline value",
      note: "An icon + numeric value for a resource, sized to sit inline with text.",
      code: `import { ResourceChip } from "src/tango/components/ResourceChip";

<ResourceChip kind="essence" value={200} size={20} />`,
    },
    {
      label: "Standalone chip",
      note: "Set `chip` to draw the value on its own rounded surface instead of bare inline.",
      code: `<ResourceChip kind="energy" value={3} size={20} chip />`,
    },
  ],
  demo: {
    defaultArgs: {
      kind: "essence",
      value: 200,
      size: 20,
      chip: false,
      gap: 0,
    },
  },
};
