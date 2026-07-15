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
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <OfferTile model={MODEL} onPress={() => {}} />
      <OfferTile model={{ ...MODEL, id: `${MODEL.id}:compact` }} size="compact" onPress={() => {}} />
    </div>
  );
}

export const offerTileDemo: CumulusComponent = {
  id: "offer-tile",
  title: "Offer Tile",
  blurb:
    "The rounded symbolic Dream Augury offer button in named 200×200 standard and 160×160 compact sizes: UUID-backed complete cards, dreamsign art, and operation marks gathered inside an iron fantasy frame without spelling out the complete offer.",
  callout:
    "Use the named offer kind that matches the category and pass every object surfaced by the generated offer. Fixed-target variants show their exact affected cards; chooser variants show every choice. Descriptions are derived centrally from the model, naming all cards in a fixed bundle, naming a fixed dreamsign or site, spelling quantities as words, and underlining specific card and dreamsign names in the InfoCard. Category drafts name their category; single-card transfigurations name their exact form; keyword and subtype changes state their exact result. Descriptions communicate the resulting player action without exposing card-fit scoring, offer-generation rationale, or repeated Dreamsign rules text. Every card uses the complete UUID-backed card face and its canonical proportional corner radius. Drafts arrange four complete cards in a two-by-two grid with the smallest spacing step in both directions. Trades reuse that grid behind the purge target, bundles use a large inset fan, and duplicate offers use a compact fan with the standard card-operation mark. Every composition stays inset from the iron frame. Inner objects stay decorative, the complete tile owns interaction plus its body-only InfoCard, and each complete framed tile drifts on its own stable phase.",
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
    {
      note: "Use the compact named size where a narrow stage must keep two complete tiles side by side; it uniformly scales the same authored composition.",
      code: `<OfferTile model={offerTileModel} size="compact" onPress={chooseOffer} />`,
    },
  ],
  demo: { defaultArgs: {} },
};
