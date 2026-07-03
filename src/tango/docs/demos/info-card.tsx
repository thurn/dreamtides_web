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
  usage: [
    {
      label: "Text variant",
      note: "The default: a `meta` overline, `title`, `body`, and an optional small `leadGlyph`.",
      code: `import { InfoCard } from "src/tango/components/InfoCard";

<InfoCard
  variant="text"
  meta="Tide"
  title="Singular Storm"
  body="A rising tide that floods the board with essence."
  leadGlyph={<i className="bxf bx-water" />}
/>`,
    },
    {
      label: "Object variant",
      note: "A media object with `image`; set `frame` for a framed portrait, omit it for a contained transparent object.",
      code: `<InfoCard
  variant="object"
  image={portraitUrl}
  frame
  title="Seld Rakor"
  body="the Unbound"
/>`,
    },
    {
      label: "Icon variant",
      note: "A boxicon `glyph` on a disc — used for site / place descriptions.",
      code: `<InfoCard
  variant="icon"
  glyph="bxf bx-store-alt-2"
  title="Merchant"
  body="Spend essence on cards, dreamsigns, and services."
/>`,
    },
    {
      label: "Reveal on interaction",
      note: "In real screens InfoCard is anchored to a trigger through the attached press engine (`InfoCard.PressInfo`): hover / touch-down reveals the `card` beside the wrapped trigger, measured against `stageRef`.",
      code: `<InfoCard.PressInfo
  stageRef={stageRef}
  card={<InfoCard variant="text" title="Singular Storm" body="…" />}
>
  <TidePill tone="blue">Singular Storm</TidePill>
</InfoCard.PressInfo>`,
    },
  ],
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
