// Registry demo entry for TidePill — see resource-chip.tsx for the recipe
// this follows. `icon` is a Boxicons class string (a generated text control);
// `children` is a ReactNode slot with no generated control, seeded via
// sampleContent.

import { TidePill } from "../../components/TidePill";
import type { TangoComponent } from "../registry";

export const tidePillDemo: TangoComponent = {
  id: "tide-pill",
  title: "Tide Pill",
  group: "Components",
  docName: "TidePill",
  Component: TidePill,
  usage: [
    {
      label: "Presentational",
      note: "A labelled tag for a tide / affiliation — a `tone` color, an optional leading `icon`, and the name as children.",
      code: `import { TidePill } from "src/tango/components/TidePill";

<TidePill tone="blue" icon="bxf bx-water">
  Singular Storm
</TidePill>`,
    },
    {
      label: "Pressable",
      note: "Pass `onPress` and the pill renders as a button with press feedback.",
      code: `<TidePill tone="gold" onPress={showTideInfo}>
  Rising Sun
</TidePill>`,
    },
  ],
  demo: {
    defaultArgs: {
      tone: "blue",
      size: "md",
      icon: "bxf bx-water",
    },
    sampleContent: {
      children: "Singular Storm",
    },
  },
};
