// Registry demo entry for TidePill — see resource-chip.tsx for the recipe
// this follows. `children` and `icon` are ReactNode-slot props with no
// generated control, so they're seeded via sampleContent instead of
// defaultArgs (same split StatTile uses).

import { TidePill } from "../../components/TidePill";
import type { TangoComponent } from "../registry";

export const tidePillDemo: TangoComponent = {
  id: "tide-pill",
  title: "Tide Pill",
  group: "Components",
  docName: "TidePill",
  Component: TidePill,
  demo: {
    defaultArgs: {
      tone: "blue",
      size: "md",
    },
    sampleContent: {
      children: "Singular Storm",
      icon: <i className="bxf bx-water" />,
    },
  },
};
