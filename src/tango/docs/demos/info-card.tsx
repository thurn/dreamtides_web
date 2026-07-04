// Registry demo entry for InfoCard — see tide-pill.tsx for the recipe this
// follows. `variant` is a string-literal union (select control); `title`,
// `meta` and `leadGlyph` are strings (text controls) seeded from defaultArgs.
// `body` is a `RichText` model value with no generated control, so it is seeded
// via sampleContent.
//
// The media props are seeded so that EVERY variant renders real content the
// moment the reader switches the `variant` control: `image` is a real
// Dreamcaller portrait (drives the object / hero media) and `glyph` is a real
// Boxicons class (drives the icon-disc variant), the same production art the
// full-screen mockup uses — the text default still leads with `leadGlyph`.
//
// InfoCardProps is a discriminated union on `variant` — each media variant
// requires the media it renders (object/hero require `image`, icon requires
// `glyph`) — so the demo seeds `image`, `frame` and `glyph` in defaultArgs and
// every variant the reader selects renders a complete card. The raw component
// assigns directly to the registry's `Component` slot (whose props are the
// dynamic `Record<string, unknown>` the control panel builds), so no wrapper is
// needed. `docName` points at the react-docgen display name the metadata is
// keyed under so the props table reports InfoCard's real API.

import { InfoCard } from "../../components/overlay/InfoCard";
import { richText } from "../../components/card/rich-text";
import { assetUrl } from "../../../runtime/asset-url";
import type { TangoComponent } from "../registry";

/** A Dreamcaller's character render, resolved the same way `assetUrl` resolves
 * every other binary art asset (see `src/components/DreamcallerPortrait.tsx`
 * for the production equivalent — reimplemented locally here so this
 * tango-isolated demo never imports from `src/components/`). */
function dreamcallerPortraitUrl(imageNumber: string): string {
  return assetUrl(`/dreamcallers/${imageNumber}.png`);
}

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
      code: `import { InfoCard } from "src/tango/components/overlay/InfoCard";
import { richText } from "src/tango/components/card/rich-text";

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
      // Real media so switching `variant` to object / hero / icon renders
      // genuine art rather than an empty frame. `image` is a real Dreamcaller
      // portrait (object / hero), `frame` gives the object variant its framed
      // treatment, and `glyph` fills the icon-disc variant.
      image: dreamcallerPortraitUrl("0025"),
      frame: true,
      glyph: "bxf bx-store-alt-2",
    },
    sampleContent: {
      body: richText.plain(
        "A rising tide that floods the board with essence, drowning weaker dreams beneath it.",
      ),
    },
  },
};
