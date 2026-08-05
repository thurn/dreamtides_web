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
import type { CumulusComponent } from "../registry";

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
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("current");
  const [filter, setFilter] = useState("all");
  const [owner, setOwner] = useState("viewer");

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
        subtitle="Choose any number of cards to remove from your deck for an essence cost"
        rightAccessory={{
          kind: "glassButton",
          label: selected === null ? "Decline" : "Purge 1",
          essenceCost: selected === null ? null : 40,
          widthReservations: [
            { label: "Decline", essenceCost: null },
            { label: "Purge 1", essenceCost: 40 },
          ],
          variant: selected === null ? "default" : "danger",
          glyph: selected === null ? GLYPHS.close : undefined,
          onPress: () => setSelected(null),
        }}
        cards={cards}
        toolbar={{
          segmented: {
            options: [
              { value: "viewer", label: "Your Cards · 4" },
              { value: "opponent", label: "Opponent Cards · 2" },
            ],
            value: owner,
            onChange: setOwner,
            full: true,
          },
          search: { label: "Search Cards", value: query, onChange: setQuery },
          sort: {
            ariaLabel: "Sort cards",
            value: sort,
            options: [
              { value: "current", label: "Current Order" },
              { value: "name", label: "Name" },
            ],
            onChange: setSort,
          },
          filter: {
            ariaLabel: "Filter cards",
            value: filter,
            options: [
              { value: "all", label: "All Types" },
              { value: "character", label: "Characters" },
              { value: "event", label: "Events" },
            ],
            onChange: setFilter,
          },
        }}
        columns="three"
        frame="floating"
        spacing="spacious"
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

export const cardGalleryPanelDemo: CumulusComponent = {
  id: "card-gallery-panel",
  title: "Card Gallery Panel",
  blurb:
    "The shared card-browser surface: GlassPanel title and action chrome around a scrolling GameCard grid, framed as floating glass or a full-bleed alpha scrim.",
  callout:
    "Use this when a screen presents a card collection as the primary task surface, such as the Starting Deck reveal, a card-selection site, or a searchable zone browser. A floating gallery hugs its header, toolbar, rendered card rows, and footer; blank glass inserted to fill a stage is not allowed. heightMode=\"fill\" reserves only a transparent caller-owned fitting wrapper and never stretches the glass. The component derives material from frame geometry: floating is rounded glass and full-bleed is the edge-to-edge standard alpha scrim. It owns the header, optional mode/search/sort/filter toolbar, accessory slot, internal scroll, fixed grid modes, optional captions and footer actions, and mobile press-preview sizing with whole-card touch-circle clearance. Callers provide resolved card models keyed by entry id or UUID.",
  group: "Components",
  docName: "CardGalleryPanel",
  Component: CardGalleryPanelDemo,
  usage: [
    {
      note: "A card gallery with a right-side Glass Button accessory and selectable cards. Resolve card data before passing it in, and key tiles by entry id or UUID.",
      code: `import { CardGalleryPanel } from "src/cumulus/components/card/CardGalleryPanel";

<CardGalleryPanel
  title="Purge Cards"
  subtitle="Choose any number of cards to remove from your deck for an essence cost"
  rightAccessory={{
    kind: "glassButton",
    label: selectedCount === 0 ? "Decline" : \`Purge \${selectedCount}\`,
    essenceCost: selectedCount === 0 ? null : totalCost,
    widthReservations: possibleActions,
    variant: selectedCount === 0 ? "default" : "danger",
    onPress: selectedCount === 0 ? decline : purge,
  }}
  cards={cards}
  columns="five"
  frame="floating"
  spacing="medium"
  onCardPress={toggleCard}
  footerAction={{ label: "Decline Offer", onPress: decline }}
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
