// Registry demo entry for CardGalleryPanel — the shared card-browser surface
// used by the starting-deck reveal and card-selection sites.

import { useEffect, useState } from "react";
import type { CardData } from "../../../types/cards";
import { loadCardDatabase } from "../../../data/card-database";
import {
  CardGalleryPanel,
  type CardGalleryCardView,
} from "../../components/card/CardGalleryPanel";
import { GLYPHS } from "../../primitives/glyph";
import type { TangoComponent } from "../registry";

const DEMO_CARD_IDS = [
  "1268a899-b209-46bb-bce4-6def1dcd0404",
  "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  "161482b6-af07-4d9e-822d-8c738672beb9",
  "b56ef7e8-c634-4d40-ac08-fab591dfbc4a",
] as const;

function cardsById(database: Map<number, CardData>): Map<string, CardData> {
  const byId = new Map<string, CardData>();
  for (const card of database.values()) {
    byId.set(card.id, card);
  }
  return byId;
}

function CardGalleryPanelDemo() {
  const [cards, setCards] = useState<CardGalleryCardView[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCardDatabase()
      .then((database) => {
        if (cancelled) return;
        const byId = cardsById(database);
        setCards(
          DEMO_CARD_IDS.map((id) => byId.get(id))
            .filter((card): card is CardData => card !== undefined)
            .map((card, index) => ({
              entryId: `demo-${String(index)}`,
              model: { cardId: card.id, displaySnapshot: card },
              caption: { kind: "essence" as const, amount: 100 },
              selected: selected === `demo-${String(index)}`,
              selectionColor: "danger",
            })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setCards([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (cards === null) {
    return <div style={{ opacity: 0.7 }}>Loading cards...</div>;
  }

  return (
    <div style={{ width: "min(940px, 100%)", maxHeight: 720 }}>
      <CardGalleryPanel
        title="Purge Cards"
        subtitle="Choose cards to remove from your deck"
        rightAccessory={{
          kind: "glassButton",
          label: selected === null ? "Decline" : "Purge 1: ",
          cost: selected === null ? null : 40,
          widthReservations: [
            { label: "Decline", cost: null },
            { label: "Purge 1: ", cost: 40 },
          ],
          variant: selected === null ? "default" : "danger",
          glyph: selected === null ? GLYPHS.close : undefined,
          onPress: () => setSelected(null),
        }}
        cards={cards}
        columns="three"
        frame="floating"
        spacing="regular"
        onCardPress={(entryId) => setSelected(entryId)}
        endAction={{
          entryId: "restock",
          glyph: GLYPHS.refresh,
          label: "Restock",
          caption: { kind: "essence", amount: 50 },
        }}
      />
    </div>
  );
}

export const cardGalleryPanelDemo: TangoComponent = {
  id: "card-gallery-panel",
  title: "Card Gallery Panel",
  blurb:
    "The shared card-browser surface: a left-aligned title and subtitle, a trailing header accessory, and a scrolling GameCard grid, framed as floating glass or a full-bleed alpha scrim.",
  callout:
    "Use this when a screen presents a card collection as the primary task surface, such as the Starting Deck reveal or a card-selection site. The component derives material from frame geometry: floating is rounded glass and full-bleed is the edge-to-edge standard alpha scrim. It owns the header, accessory slot, internal scroll, fixed grid modes, optional captions and trailing card-sized action, and mobile press-preview sizing with whole-card touch-circle clearance. Callers provide resolved card models keyed by entry id or UUID.",
  group: "Components",
  docName: "CardGalleryPanel",
  Component: CardGalleryPanelDemo,
  usage: [
    {
      note: "A card gallery with a right-side Glass Button accessory and selectable cards. Resolve card data before passing it in, and key tiles by entry id or UUID.",
      code: `import { CardGalleryPanel } from "src/tango/components/card/CardGalleryPanel";

<CardGalleryPanel
  title="Purge Cards"
  subtitle="Choose cards to remove from your deck"
  rightAccessory={{
    kind: "glassButton",
    label: selectedCount === 0 ? "Decline" : \`Purge \${selectedCount}: \`,
    cost: selectedCount === 0 ? null : totalCost,
    widthReservations: possibleActions,
    variant: selectedCount === 0 ? "default" : "danger",
    onPress: selectedCount === 0 ? decline : purge,
  }}
  cards={cards}
  columns="five"
  frame="floating"
  spacing="medium"
  onCardPress={toggleCard}
  endAction={{
    entryId: "restock",
    glyph: GLYPHS.refresh,
    label: "Restock",
    caption: { kind: "essence", amount: 50 },
  }}
/>`,
    },
  ],
  demo: {
    defaultArgs: {},
  },
};
