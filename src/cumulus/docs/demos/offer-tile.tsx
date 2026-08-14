import { asCardId, asCardName } from "../../../types/card-identity";
import {
  OfferTile,
  type OfferTileCard,
  type OfferTileModel,
} from "../../components/controls/OfferTile";
import type { CumulusComponent } from "../registry";

function card(
  cardId: string,
  imageNumber: number,
  cardNumber: number,
): OfferTileCard {
  const id = asCardId(cardId);
  return {
    cardId: id,
    displaySnapshot: {
      id,
      name: asCardName(`Offer Card ${String(cardNumber)}`),
      cardNumber,
      cardType: "Character",
      subtype: "Spirit Animal",
      isStarter: false,
      energyCost: 2,
      spark: 3,
      isFast: false,
      renderedText: "▸Dawn: Draw a card.",
      imageNumber,
      artOwned: true,
    },
  };
}

const MODEL: OfferTileModel = {
  id: "cumulus-demo-card-draft",
  kind: "card-draft",
  cards: [
    card("7be2e6d7-abff-4c44-a0c3-35460da1693c", 287269511, 1),
    card("161482b6-af07-4d9e-822d-8c738672beb9", 2022594419, 2),
    card("b56ef7e8-c634-4d40-ac08-fab591dfbc4a", 618071684, 3),
    card("9b9c2743-75b3-499d-b5fb-c3429c92d420", 1196004046, 4),
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
        model={{ ...MODEL, id: `${MODEL.id}:compact` }}
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
    cards: offeredCards.map((card) => ({ cardId: card.id, displaySnapshot: card })),
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
