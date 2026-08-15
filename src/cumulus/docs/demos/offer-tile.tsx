import {
  OfferTile,
  type OfferTileModel,
} from "../../components/controls/OfferTile";
import type { CumulusComponent } from "../registry";
import { parseOfferTileId } from "../../../types/identifiers";
import { demoCardData } from "./promotion-fixtures";

const MODEL: OfferTileModel = {
  id: parseOfferTileId("cumulus-demo-card-draft"),
  kind: "card-draft",
  cards: [
    demoCardData(1),
    demoCardData(2),
    demoCardData(3),
    demoCardData(4),
  ],
};

const PRESENTATION = {
  headline: { kind: "text", text: "Choose a Card" },
  subtitle: { kind: "text", text: "Choose a card to add to your deck." },
} as const;

function OfferTileDemo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <OfferTile model={MODEL} presentation={PRESENTATION} onPress={() => {}} />
      <OfferTile
        model={{ ...MODEL, id: parseOfferTileId(`${MODEL.id}:compact`) }}
        presentation={PRESENTATION}
        size="compact"
        onPress={() => {}}
      />
    </div>
  );
}

export const offerTileDemo: CumulusComponent = {
  id: "offer-tile",
  title: "Offer Tile",
  blurb:
    "The circular symbolic Augury offer button in named 300×300 desktop and 240×240 mobile sizes: UUID-backed full-bleed card art, Dreamsigns and site glyphs over authored full-art fields, and centered operation marks inside the gold-and-feather frame.",
  callout:
    "Use the named offer kind that matches the category and pass every object surfaced by the generated offer.",
  group: "Atlas & Sites",
  docName: "OfferTile",
  Component: OfferTileDemo,
  usage: [
    {
      note: "Build the model from UUID-backed offer objects. The category decides the symbolic layout; the caller supplies no layout, color, or nested-hover customization.",
      code: `import { OfferTile } from "src/cumulus/components/controls/OfferTile";

<OfferTile
  model={{
    id: encounterSignature + ":" + offerId,
    kind: "card-draft",
    cards: offeredCards,
  }}
  presentation={offerPresentation}
  onPress={chooseOffer}
/>`,
    },
    {
      note: "Use the compact named size where a narrow stage must keep two complete tiles side by side; it uniformly scales the same authored composition.",
      code: `<OfferTile model={offerTileModel} presentation={offerPresentation} size="compact" onPress={chooseOffer} />`,
    },
  ],
  demo: { defaultArgs: {} },
};
