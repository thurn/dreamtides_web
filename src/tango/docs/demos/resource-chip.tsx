// Registry demo entry for ResourceChip — see pressable.tsx for the recipe this
// follows. ResourceChip has no ReactNode-slot props (kind/value/size/chip/gap
// are all primitives with generated controls), so this demo needs only
// defaultArgs, no sampleContent.

import { ResourceChip } from "../../components/ResourceChip";
import type { TangoComponent } from "../registry";

export const resourceChipDemo: TangoComponent = {
  id: "resource-chip",
  title: "Resource Chip",
  group: "Components",
  docName: "ResourceChip",
  Component: ResourceChip,
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
