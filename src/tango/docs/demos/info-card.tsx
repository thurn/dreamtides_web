// Registry demo entry for InfoCard — see tide-pill.tsx for the recipe this
// follows. `variant` is a string-literal union, so it becomes a select control
// automatically. `title`, `body`, `meta` and `leadGlyph` are ReactNode-slot
// props with no generated control, so they're seeded via sampleContent instead
// of defaultArgs (same split TidePill/StatTile use).
//
// InfoCard's props are all optional, so the raw component assigns directly to
// the registry's `Component` slot (no all-optional wrapper needed, unlike
// StatTile). `docName` points at the react-docgen display name the metadata is
// keyed under so the props table reports InfoCard's real API.

import { InfoCard } from "../../components/InfoCard";
import type { TangoComponent } from "../registry";

export const infoCardDemo: TangoComponent = {
  id: "info-card",
  title: "Info Card",
  group: "Components",
  docName: "InfoCard",
  Component: InfoCard,
  demo: {
    defaultArgs: {
      variant: "text",
    },
    sampleContent: {
      meta: "Tide",
      title: "Singular Storm",
      body: "A rising tide that floods the board with essence, drowning weaker dreams beneath it.",
      leadGlyph: <i className="bxf bx-water" style={{ color: "var(--accent)" }} />,
    },
  },
};
