import { asCardId } from "../../../types/card-identity";
import {
  OfferTile,
  type OfferTileModel,
} from "../../components/controls/OfferTile";
import type { CumulusComponent } from "../registry";

const MODEL: OfferTileModel = {
  id: "cumulus-demo-card-draft",
  kind: "card-draft",
  label: "Card Draft",
  description: "Choose one of four cards to add to your deck.",
  cards: [
    { cardId: asCardId("7be2e6d7-abff-4c44-a0c3-35460da1693c"), imageNumber: 287269511 },
    { cardId: asCardId("161482b6-af07-4d9e-822d-8c738672beb9"), imageNumber: 2022594419 },
    { cardId: asCardId("b56ef7e8-c634-4d40-ac08-fab591dfbc4a"), imageNumber: 618071684 },
    { cardId: asCardId("9b9c2743-75b3-499d-b5fb-c3429c92d420"), imageNumber: 1196004046 },
  ],
};

function OfferTileDemo() {
  return <OfferTile model={MODEL} onPress={() => {}} />;
}

export const offerTileDemo: CumulusComponent = {
  id: "offer-tile",
  title: "Offer Tile",
  blurb:
    "The 150×150 symbolic Dream Augury offer button: UUID-backed card art, dreamsign art, and operation marks composed on a distinct glass surface without spelling out the complete offer.",
  callout:
    "Use the named offer kind that matches the category. Inner objects are deliberately decorative; the complete tile is the only hover, focus, and press target, and its succinct action sentence renders as the sole InfoCard copy.",
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
    label: "Card Draft",
    description: "Choose one of four cards to add to your deck.",
    cards: offeredCards.map(({ id, imageNumber }) => ({ cardId: id, imageNumber })),
  }}
  onPress={chooseOffer}
/>`,
    },
  ],
  demo: { defaultArgs: {} },
};
