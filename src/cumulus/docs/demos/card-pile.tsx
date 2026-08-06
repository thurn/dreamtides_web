import { asCardId, asCardName } from "../../../types/card-identity";
import { CardPile } from "../../components/battle/CardPile";
import type { GameCardModel } from "../../components/card/CardView";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

const DEMO_CARD_ID = asCardId("1268a899-b209-46bb-bce4-6def1dcd0404");
const DEMO_CARD: GameCardModel = {
  cardId: DEMO_CARD_ID,
  displaySnapshot: {
    id: DEMO_CARD_ID,
    name: asCardName("Physical Card"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "Dreamborn",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "",
    imageNumber: 1,
    artOwned: true,
  },
};

function CardPileDemo(args: Record<string, unknown>) {
  const orientation = args.orientation === "portrait" ? "portrait" : "landscape";
  const width = orientation === "portrait" ? 96 : 152;
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: token("--space-3xl") }}
    >
      <div style={{ width }}>
        <CardPile
          cards={[
            { face: "down", id: "demo-deck-top" },
            { face: "down", id: "demo-deck-middle" },
            { face: "down", id: "demo-deck-bottom" },
          ]}
          orientation={orientation}
          label="Face-down deck"
        />
      </div>
      <div style={{ width }}>
        <CardPile
          cards={[
            { face: "up", id: "demo-void-top", model: DEMO_CARD },
            { face: "up", id: "demo-void-middle", model: DEMO_CARD },
            { face: "up", id: "demo-void-bottom", model: DEMO_CARD },
          ]}
          orientation={orientation}
          label="Face-up void"
          cardInteraction="inactive"
          onActivate={() => undefined}
        />
      </div>
      <div style={{ width }}>
        <CardPile
          cards={[]}
          orientation={orientation}
          label="Empty void"
          cardInteraction="inactive"
          emptyState="outlined"
          emptyLabel="Void"
          onActivate={() => undefined}
        />
      </div>
    </div>
  );
}

export const cardPileDemo: CumulusComponent = {
  id: "card-pile",
  title: "Card Pile",
  blurb:
    "A physical deck or void stack built from structured, topmost-first card instances. It shows at most three slightly offset layers and rests upright or sideways as one fixed object.",
  callout:
    "Pass stable battle-card instance ids so the shared layout identity can carry each card continuously between zones. Face-up entries can reveal their card or remain inactive beneath one pile-level activation; face-down entries resolve through CardBack.",
  group: "Components",
  docName: "CardPile",
  Component: CardPileDemo,
  usage: [
    {
      label: "Face-down deck",
      note: "Model the complete zone topmost-first; CardPile chooses the visible three physical layers.",
      code: `import { CardPile } from "src/cumulus/components/battle/CardPile";

<CardPile
  cards={deck.map((card) => ({ face: "down", id: card.instanceId }))}
  orientation="landscape"
  label="Player deck"
/>`,
    },
    {
      label: "Face-up void",
      note: "Inactive face-up layers keep the pile clickable as one zone control without revealing the top card itself.",
      code: `<CardPile
  cards={voidCards.map((card) => ({
    face: "up",
    id: card.instanceId,
    model: card.gameCard,
  }))}
  orientation="landscape"
  label="Enemy void"
  cardInteraction="inactive"
  onActivate={openEnemyVoid}
/>`,
    },
    {
      label: "Empty void",
      note: "An empty void retains its physical card footprint with a dotted outline and can carry a centered teaching label.",
      code: `<CardPile
  cards={[]}
  orientation="landscape"
  label="Player void"
  emptyState="outlined"
  emptyLabel="Void"
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      orientation: "landscape",
    },
  },
};
