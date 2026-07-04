// Registry demo entry for InfoCard — see tide-pill.tsx for the recipe this
// follows. `variant` is a string-literal union (select control); `title`,
// `meta` and `leadGlyph` are strings (text controls) seeded from defaultArgs.
// `body` is a `RichText` model value with no generated control, so it is seeded
// via sampleContent.
//
// InfoCard's props are all optional, so the raw component assigns directly to
// the registry's `Component` slot (no all-optional wrapper needed, unlike
// StatTile). `docName` points at the react-docgen display name the metadata is
// keyed under so the props table reports InfoCard's real API.

import { InfoCard } from "../../components/InfoCard";
import { richText } from "../../components/rich-text";
import type { TangoComponent } from "../registry";

export const infoCardDemo: TangoComponent = {
  id: "info-card",
  title: "Info Card",
  blurb:
    "The one press-to-reveal information card. Its media treatment varies by content — object, hero, icon, or text — over a single fixed shell and reveal contract.",
  group: "Components",
  docName: "InfoCard",
  Component: InfoCard,
  usage: [
    {
      label: "Text variant",
      note: "The default: a `meta` overline, `title`, a `RichText` `body`, and an optional small `leadGlyph` boxicon class.",
      code: `import { InfoCard } from "src/tango/components/InfoCard";
import { richText } from "src/tango/components/rich-text";

<InfoCard
  variant="text"
  meta="Tide"
  title="Singular Storm"
  body={richText.plain("A rising tide that floods the board with essence.")}
  leadGlyph="bxf bx-water"
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
  titleBadge="Bane"
  body={richText.rules("Whenever you Reclaim a card, deal 1 damage.")}
/>`,
    },
    {
      label: "Icon variant",
      note: "A boxicon `glyph` on a disc — used for site / place descriptions.",
      code: `<InfoCard
  variant="icon"
  glyph="bxf bx-store-alt-2"
  title="Merchant"
  body={richText.plain("Spend essence on cards, dreamsigns, and services.")}
/>`,
    },
    {
      label: "Reveal on interaction",
      note: "In real screens InfoCard is anchored to a trigger through the attached press engine (`InfoCard.PressInfo`): hover / touch-down reveals the `card` beside the wrapped trigger, measured against `stageRef`. Use it to wrap a trigger that has no reveal of its own (an essence value, a menu button).",
      code: `<InfoCard.PressInfo
  stageRef={stageRef}
  card={
    <InfoCard
      variant="icon"
      glyph="bxf bx-crypto"
      title="Essence"
      body={richText.plain("Spend it on cards, dreamsigns, and services.")}
    />
  }
>
  <ResourceChip kind="essence" value={200} />
</InfoCard.PressInfo>`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "text",
      meta: "Tide",
      title: "Singular Storm",
      leadGlyph: "bxf bx-water",
    },
    sampleContent: {
      body: richText.plain(
        "A rising tide that floods the board with essence, drowning weaker dreams beneath it.",
      ),
    },
  },
};
