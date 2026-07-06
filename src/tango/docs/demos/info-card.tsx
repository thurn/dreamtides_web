// Registry demo entry for InfoCard — see tide-pill.tsx for the recipe this
// follows. `variant` is a string-literal union (select control); `title`,
// `meta` and `subtitle` are strings (text controls) seeded from defaultArgs;
// `leadGlyph` is a named `Glyph`. `body` is a `RichText` model value with no
// generated control, so it is seeded via sampleContent.
//
// The media props are seeded so that EVERY variant renders real content the
// moment the reader switches the `variant` control: `image` is a real
// Dreamcaller `ArtRef` (drives the object / portrait media) and `glyph` is a
// named `Glyph` (drives the icon-disc variant), the same production art the
// full-screen mockup uses — the text default still leads with `leadGlyph`.
//
// InfoCardProps is a discriminated union on `variant` — each media variant
// requires the media it renders (object / portrait require `image`, icon
// requires `glyph`) — so the demo seeds `image`, `frame` and `glyph` in
// defaultArgs and every variant the reader selects renders a complete card. The
// raw component
// assigns directly to the registry's `Component` slot (whose props are the
// dynamic `Record<string, unknown>` the control panel builds), so no wrapper is
// needed. `docName` points at the react-docgen display name the metadata is
// keyed under so the props table reports InfoCard's real API.

import { InfoCard } from "../../components/overlay/InfoCard";
import { richText } from "../../components/card/rich-text";
import { artRef } from "../../primitives/art";
import { GLYPHS, glyph } from "../../primitives/glyph";
import type { TangoComponent } from "../registry";

export const infoCardDemo: TangoComponent = {
  id: "info-card",
  title: "Info Card",
  blurb:
    "The one press-to-reveal information card. Its media treatment varies by content — object, portrait, icon, tide, or text — over a single fixed liquid-glass shell and reveal contract.",
  group: "Components",
  docName: "InfoCard",
  Component: InfoCard,
  usage: [
    {
      label: "Text variant",
      note: "The default: a `meta` overline, `title`, a `RichText` `body`, and an optional small `leadGlyph` from the named `GLYPHS` vocabulary.",
      code: `import { InfoCard } from "src/tango/components/overlay/InfoCard";
import { richText } from "src/tango/components/card/rich-text";
import { GLYPHS } from "src/tango/primitives/glyph";

<InfoCard
  variant="text"
  meta="Tide"
  title="Singular Storm"
  body={richText.plain("A rising tide that floods the board with essence.")}
  leadGlyph={GLYPHS.water}
/>`,
    },
    {
      label: "Text variant with epithet",
      note: "Pass a `subtitle` to render an epithet under the name — a smaller serif line in white, mirroring the Dreamcaller-select name/epithet pairing. Used for the Dreamcaller profile reveal.",
      code: `<InfoCard
  variant="text"
  title="Kragg"
  subtitle="Spent-Blood Chieftain"
  body={richText.rules("At the start of your first turn, gain 1 essence.")}
/>`,
    },
    {
      label: "Object variant",
      note: "A media object with `image` (an `ArtRef`); set `frame` for a framed portrait, omit it for a contained transparent object.",
      code: `<InfoCard
  variant="object"
  image={artRef.dreamcaller("0025")}
  frame
  title="Seld Rakor"
  body={richText.rules("Whenever you Reclaim a card, deal 1 damage.")}
/>`,
    },
    {
      label: "Portrait variant",
      note: "A full-width contained rectangular image across the top (inset, not full-bleed), with the name, an optional `subtitle` epithet, and the body below. Used for the Dreamcaller profile reveal.",
      code: `<InfoCard
  variant="portrait"
  image={artRef.dreamcaller("0025")}
  title="Threxan"
  subtitle="the Resounding Wrath"
  body={richText.rules("At the start of your first turn, draw a card.")}
/>`,
    },
    {
      label: "Scene variant",
      note: "A character `figure` composited on top of a scene `image` (both `ArtRef`s), centered and standing on the banner floor, with the scene deemphasized behind them — a character in a place. Used for the atlas node reveals (a Dream Guide over their dreamscape, Apollyon over Limbo).",
      code: `<InfoCard
  variant="scene"
  image={artRef.dreamscapeScene("frostforge")}
  figure={artRef.dreamGuide("durgan_forgehammer")}
  title="Durgan Forgehammer"
  body={richText.plain("Durgan can transfigure any card in your deck.")}
/>`,
    },
    {
      label: "Icon variant",
      note: "A `glyph` on a disc — used for site / place descriptions.",
      code: `<InfoCard
  variant="icon"
  glyph={glyph("bxf bx-store-alt-2")}
  title="Merchant"
  body={richText.plain("Spend essence on cards, dreamsigns, and services.")}
/>`,
    },
    {
      label: "Tide variant",
      note: "A named `tide` on its OWN colored disc, with the tide's alignment name (Valor, Shadow, …) in that tide's color below the title. The color comes from the named tide, never a raw value, so the card reads identically to that tide's disc on screen.",
      code: `<InfoCard
  variant="tide"
  tide="valor"
  title="Rising Valor"
  body={richText.plain("A tide of steadfast courage that rewards holding the line.")}
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
      glyph={GLYPHS.essence}
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
      leadGlyph: GLYPHS.water,
      // Real media so switching `variant` to object / portrait / icon renders
      // genuine art rather than an empty frame. `image` is a real Dreamcaller
      // portrait, `frame` gives the object variant its framed treatment, and
      // `glyph` fills the icon-disc variant.
      image: artRef.dreamcaller("0025"),
      frame: true,
      // Seeds the scene variant's foreground figure so switching `variant` to
      // scene composites a real character over the banner rather than nothing.
      figure: artRef.dreamGuide("apollyon"),
      glyph: glyph("bxf bx-store-alt-2"),
      // Seeds the tide-disc variant so switching `variant` to tide renders a
      // real colored disc + alignment label rather than an empty card.
      tide: "valor",
    },
    sampleContent: {
      body: richText.plain(
        "A rising tide that floods the board with essence, drowning weaker dreams beneath it.",
      ),
    },
  },
};
