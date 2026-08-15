// Registry demo entry for InfoCard — see tide-pill.tsx for the recipe this
// follows. `variant` is a string-literal union (select control); `title`,
// `title` and `subtitle` are strings (text controls) seeded from defaultArgs;
// `body` is a `RichText` model value with no
// generated control, so it is seeded via sampleContent.
//
// The media props are seeded so that EVERY variant renders real content the
// moment the reader switches the `variant` control: `image` is a real
// Dream Avatar `ArtRef` (drives the object / fullBleed media) and `glyph` is a
// named `Glyph` (drives the icon-disc variant), the same production art the
// full-screen mockup uses.
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
import { assertLocalized } from "@trox/runtime";
import { richText } from "../../components/card/rich-text";
import { artRef } from "../../primitives/art";
import { glyph } from "../../primitives/glyph";
import type { CumulusComponent } from "../registry";
import { parseGuideId } from "../../../types/identifiers";

export const infoCardDemo: CumulusComponent = {
  id: "info-card",
  title: "Info Card",
  blurb:
    "The strict information-card presentation. Its media treatment varies by content — object, full-bleed, atlas reveal, icon, tide, or text — over a single fixed liquid-glass shell. Standard variants have a native width of 248px and begin geometry scaling below ~551px; atlasReveal has a native width of 360px and begins geometry scaling below 800px. Both cutoffs are distinct from the Entity Reveal Coordinator's 900px input-layout breakpoint.",
  callout:
    "InfoCard supplies the visual content; the Entity Reveal Coordinator owns popup interaction, measurement, portal rendering, and placement.",
  details: [
    "Product screens use named semantic sources rather than positioning InfoCard directly. Augury OfferTile is the single one-off desktop placement exception: its body-only InfoCard centers above its respective offer.",
  ],
  propsNote:
    "InfoCardProps is a discriminated union. The flattened table combines every variant: image is required only for object, fullBleed, and atlasReveal; glyph only for icon; and tide only for tide. Omit variant, or pass text, for the text member.",
  relatedSystems: ["entity-reveals"],
  group: "Surfaces & Overlays",
  docName: "InfoCard",
  Component: InfoCard,
  usage: [
    {
      label: "Text variant",
      note: "The default: a `title` and a structured `RichText` body.",
      code: `import { InfoCard } from "src/cumulus/components/overlay/InfoCard";
import { richText } from "src/cumulus/components/card/rich-text";

<InfoCard
  variant="text"
  title={assertLocalized("Singular Storm")}
  body={richText.plain(assertLocalized("A rising tide that floods the board with essence."))}
/>`,
    },
    {
      label: "Text variant with epithet",
      note: "Pass a `subtitle` to render an epithet under the name — a smaller serif line in white, mirroring the Dream Avatar-select name/epithet pairing. Used for the Dream Avatar profile reveal.",
      code: `<InfoCard
  variant="text"
  title={assertLocalized("Kragg")}
  subtitle={assertLocalized("Spent-Blood Chieftain")}
  body={richText.rules(assertLocalized("At the start of your first turn, gain 1 essence."))}
/>`,
    },
    {
      label: "Object variant",
      note: "A media object with `image` (an `ArtRef`); set `frame` for a framed portrait, omit it for a contained transparent object.",
      code: `<InfoCard
  variant="object"
  image={artRef.dreamAvatar("0025")}
  frame
  title={assertLocalized("Seld Rakor")}
  body={richText.rules(assertLocalized("Whenever you Reclaim a card, deal 1 damage."))}
/>`,
    },
    {
      label: "Full-bleed variant",
      note: "A square hero `image` filling the whole card, with the shared glass text card laid on TOP of it — the name / optional `subtitle` epithet / body float over the lower image. It is literally an image with a text info card placed on top. Pass an optional `figure` (a transparent character render) to stand a subject centered and prominent over the hero, above the glass card. Used for the Dream Avatar profile reveal and the compact atlas node reveals.",
      code: `<InfoCard
  variant="fullBleed"
  image={artRef.dreamscapeScene("firstlight_meadow")}
  figure={artRef.dreamGuide("tobias_tanglefur")}
  title={assertLocalized("Tobias Tanglefur")}
  body={richText.rules(assertLocalized("Enhances the Garden site at his home dreamscape."))}
/>`,
    },
    {
      label: "Atlas reveal variant",
      note: "The large desktop Dream Atlas reveal: a scene hero, an optional right-side figure, and place / guide / body copy in the shared glass panel. Cards with a figure reserve a narrower left text column so the figure cannot obscure the copy. Use this strict variant instead of creating a screen-local fork of InfoCard.",
      code: `<InfoCard
  variant="atlasReveal"
  image={artRef.dreamscapeScene("wilderveil")}
  figure={artRef.dreamGuide("aldric")}
  title={assertLocalized("Wilderveil")}
  subtitle={assertLocalized("Aldric, the Seer")}
  body={richText.plain(assertLocalized("Aldric offers curated visions of the future."))}
/>`,
    },
    {
      label: "Icon variant",
      note: "A `glyph` on a disc — used for site / place descriptions.",
      code: `<InfoCard
  variant="icon"
  glyph={glyph("bxf bx-store-alt-2")}
  title={assertLocalized("Merchant")}
  body={richText.plain(assertLocalized("Spend essence on cards, dreamsigns, and services."))}
/>`,
    },
    {
      label: "Tide variant",
      note: "A named `tide` on its OWN colored disc, with the tide's resonance name (Valor, Shadow, …) in that tide's color below the title. The color comes from the named tide, never a raw value, so the card reads identically to that tide's disc on screen.",
      code: `<InfoCard
  variant="tide"
  tide="valor"
  title={assertLocalized("Rising Valor")}
  body={richText.plain(assertLocalized("A tide of steadfast courage that rewards holding the line."))}
/>`,
    },
    {
      label: "Mobile scale",
      note: "Standard info cards are 248px wide at native; the scene-led atlasReveal variant is 360px. Each lays out at 45% of the viewport width until reaching its native cap. The shared 0.86 type scale applies below the standard-card cutoff (~551px), independently of variant geometry and the coordinator's 900px input-layout breakpoint. Placement reads the same native variant width through `infoCardNativeWidth`.",
      code: `import { infoCardNativeWidth, infoCardWidth, infoCardTextScale, INFO_CARD_WIDTH } from "src/cumulus/components/overlay/InfoCard";
const w = infoCardWidth(window.innerWidth);         // min(248, 0.45 * vw)
const atlasW = infoCardNativeWidth("atlasReveal"); // 360
const scale = infoCardTextScale(window.innerWidth); // 0.86 below ~551px; otherwise 1`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "text",
      // Real media so switching `variant` to object / fullBleed / icon renders
      // genuine art rather than an empty frame. `image` is a real Dream Avatar
      // portrait, `figure` gives image-led variants a real foreground subject,
      // `frame` gives the object variant its framed treatment, and `glyph`
      // fills the icon-disc variant.
      image: artRef.dreamAvatar("0025"),
      figure: artRef.dreamGuide(parseGuideId("tobias_tanglefur")),
      frame: true,
      glyph: glyph("bxf bx-store-alt-2"),
      // Seeds the tide-disc variant so switching `variant` to tide renders a
      // real colored disc + resonance label rather than an empty card.
      tide: "valor",
    },
    sampleContent: {
      title: assertLocalized("Singular Storm"),
      body: richText.plain(
        assertLocalized(
          "A rising tide that floods the board with essence, drowning weaker dreams beneath it.",
        ),
      ),
    },
  },
};
