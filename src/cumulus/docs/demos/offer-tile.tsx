import { asCardId, asCardName } from "../../../types/card-identity";
import {
  OfferTile,
  type OfferTileCard,
  type OfferTileModel,
} from "../../components/controls/OfferTile";
import type { CumulusComponent } from "../registry";

function card(cardId: string, imageNumber: number, cardNumber: number): OfferTileCard {
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
      renderedText: "▸ Dawn: Draw a card.",
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

function OfferTileDemo() {
  return <OfferTile model={MODEL} onPress={() => {}} />;
}

export const offerTileDemo: CumulusComponent = {
  id: "offer-tile",
  title: "Offer Tile",
  blurb:
    "The 200×200 rounded symbolic Dream Augury offer button: UUID-backed complete cards, dreamsign art, and operation marks gathered inside an iron fantasy frame without spelling out the complete offer.",
  callout:
    "Use the named offer kind that matches the category and pass every object surfaced by the generated offer. Fixed-target variants show their exact affected cards; chooser variants show every choice. Descriptions are derived centrally from the model, naming fixed groups of one or two cards and spelling quantities as words. Every card uses the complete UUID-backed card face and its canonical proportional corner radius. Drafts arrange four complete cards in a two-by-two grid with the smallest spacing step in both directions. Trades reuse that grid behind the purge target, bundles use a large inset fan, and duplicate offers use a compact fan with the standard card-operation mark. Every composition stays inset from the iron frame. Inner objects stay decorative, the complete tile owns interaction plus its body-only InfoCard, and each complete framed tile drifts on its own stable phase.",
  group: "Components",
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
  onPress={chooseOffer}
/>`,
    },
  ],
  demo: { defaultArgs: {} },
};
