// Registry demo entry for InfoCard — see tide-pill.tsx for the recipe this
// follows. `variant` is a string-literal union (select control); `title`,
// `meta` and `subtitle` are strings (text controls) seeded from defaultArgs;
// `leadGlyph` is a named `Glyph`. `body` is a `RichText` model value with no
// generated control, so it is seeded via sampleContent.
//
// The media props are seeded so that EVERY variant renders real content the
// moment the reader switches the `variant` control: `image` is a real
// Dreamcaller `ArtRef` (drives the object / fullBleed media) and `glyph` is a
// named `Glyph` (drives the icon-disc variant), the same production art the
// full-screen mockup uses — the text default still leads with `leadGlyph`.
//
// InfoCardProps is a discriminated union on `variant` — each media variant
// requires the media it renders (object / fullBleed require `image`, icon
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
    "The one press-to-reveal information card. Its media treatment varies by content — object, full-bleed, atlas reveal, icon, tide, or text — over a single fixed liquid-glass shell and reveal contract. On a narrow viewport a card lays out at 45% of screen width capped at its native 248px, so below ~551px (248 ÷ 0.45) it begins scaling down — an intentional content-driven cutoff, distinct from the 900px desktop/mobile breakpoint.",
  callout:
    "Placement is ABOVE-only: the reveal is always anchored above the pressed object and never drops below it. `computePopoverPosition` prefers the card centered above at a uniform gap; when it does not fit there it pins the card to the top screen inset at a reduced gap; and when even a top-pinned card would overlap the press it keeps the card at the top and shifts it sideways — to whichever side of the press area has room — to clear the press area and, on a touch press, the fingertip disc. When neither side has room, a touch reveal moves to whichever screen edge puts its center farthest from the finger while a fine-pointer hover (no finger to avoid) stays centered at the top. So a card too tall to fit above a low trigger pins to the top rather than covering the object under the finger.",
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
      label: "Full-bleed variant",
      note: "A square hero `image` filling the whole card, with the shared glass text card laid on TOP of it — the meta / name / optional `subtitle` epithet / body float over the lower image. It is literally an image with a text info card placed on top. Pass an optional `figure` (a transparent character render) to stand a subject centered and prominent over the hero, above the glass card. Used for the Dreamcaller profile reveal and the compact atlas node reveals.",
      code: `<InfoCard
  variant="fullBleed"
  image={artRef.dreamscapeScene("firstlight_meadow")}
  figure={artRef.dreamGuide("tobias_tanglefur")}
  title="Tobias Tanglefur"
  body={richText.rules("Enhances the Garden site at his home dreamscape.")}
/>`,
    },
    {
      label: "Atlas reveal variant",
      note: "The large desktop Dream Atlas reveal: a scene hero, an optional right-side figure, and place / guide / body copy in the shared glass panel. Use this strict variant instead of creating a screen-local fork of InfoCard.",
      code: `<InfoCard
  variant="atlasReveal"
  image={artRef.dreamscapeScene("wilderveil")}
  figure={artRef.dreamGuide("aldric")}
  title="Wilderveil"
  subtitle="Aldric, the Seer"
  body={richText.plain("Aldric offers curated visions of the future.")}
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
      note: "In real screens InfoCard is anchored to a trigger through the attached press engine (`InfoCard.PressInfo`): hover / touch-down reveals the `card` beside the wrapped trigger, measured against `stageRef`. Use it to wrap a trigger that has no reveal of its own (an essence value, a menu button). Readable rules copy passes `pressFeedback=\"stationary\"` so a held definition reveal does not shrink the text.",
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
    {
      label: "Mobile scale",
      note: "Every info card is 248px wide at native. On a narrow viewport it lays out at 45% of the viewport width, capped at that native 248px, so the implicit mobile cutoff is 248 ÷ 0.45 ≈ 551px and desktop keeps the authored geometry. Mobile-sized cards use a 0.86 internal type scale, preserving a 12px body voice; copy wraps into natural height so legibility grows vertically while the 45% width stays fixed. Both dimensions are driven by the live viewport — never a caller prop — through the exported `infoCardWidth` / `infoCardTextScale` helpers and the `INFO_CARD_WIDTH` constant.",
      code: `import { infoCardWidth, infoCardTextScale, INFO_CARD_WIDTH } from "src/tango/components/overlay/InfoCard";
const w = infoCardWidth(window.innerWidth);         // min(248, 0.45 * vw)
const scale = infoCardTextScale(window.innerWidth); // 1 on desktop, 0.86 on mobile`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "text",
      meta: "Tide",
      title: "Singular Storm",
      leadGlyph: GLYPHS.water,
      // Real media so switching `variant` to object / fullBleed / icon renders
      // genuine art rather than an empty frame. `image` is a real Dreamcaller
      // portrait, `figure` gives image-led variants a real foreground subject,
      // `frame` gives the object variant its framed treatment, and `glyph`
      // fills the icon-disc variant.
      image: artRef.dreamcaller("0025"),
      figure: artRef.dreamGuide("tobias_tanglefur"),
      frame: true,
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
