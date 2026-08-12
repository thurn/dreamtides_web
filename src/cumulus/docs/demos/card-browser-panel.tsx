import { assertLocalized } from "@trox/runtime";
import { useEffect, useState } from "react";
import { loadCardDatabase } from "../../../data/card-database";
import type { CardData } from "../../../types/cards";
import { CardBrowserPanel } from "../../components/card/CardBrowserPanel";
import type { CardChoiceGridCardView as CardGalleryCardView } from "../../components/card/CardChoiceGrid";
import type { CumulusComponent } from "../registry";

const DEMO_CARD_IDS = [
  "1268a899-b209-46bb-bce4-6def1dcd0404",
  "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  "161482b6-af07-4d9e-822d-8c738672beb9",
  "b56ef7e8-c634-4d40-ac08-fab591dfbc4a",
] as const;

function CardBrowserPanelDemo() {
  const [cards, setCards] = useState<CardGalleryCardView[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("current");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    loadCardDatabase()
      .then((database) => {
        if (cancelled) return;
        const cardsById = new Map<string, CardData>();
        for (const card of database.values()) cardsById.set(card.id, card);
        setCards(
          DEMO_CARD_IDS.map((id) => cardsById.get(id))
            .filter((card): card is CardData => card !== undefined)
            .map((card, index) => ({
              entryId: `browser-demo-${String(index)}`,
              model: { cardId: card.id, displaySnapshot: card },
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setCards([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (cards === null) return <div style={{ opacity: 0.7 }}>Loading cards...</div>;

  return (
    <div style={{ width: "min(1040px, 100%)", height: 700 }}>
      <CardBrowserPanel
        title={assertLocalized("Your Deck")}
        subtitle={assertLocalized("Four cards")}
        cards={cards}
        toolbar={{
          search: { label: assertLocalized("Search Cards"), value: query, onChange: setQuery },
          sort: {
            ariaLabel: assertLocalized("Sort cards"),
            value: sort,
            options: [
              { value: "current", label: assertLocalized("Current Order") },
              { value: "name", label: assertLocalized("Name") },
            ],
            onChange: setSort,
          },
          filter: {
            ariaLabel: assertLocalized("Filter cards"),
            value: filter,
            options: [
              { value: "all", label: assertLocalized("All Types") },
              { value: "character", label: assertLocalized("Characters") },
              { value: "event", label: assertLocalized("Events") },
            ],
            onChange: setFilter,
          },
        }}
      />
    </div>
  );
}

export const cardBrowserPanelDemo: CumulusComponent = {
  id: "card-browser-panel",
  title: "Card Browser Panel",
  blurb:
    "The collection-browsing card surface: canonical responsive grid, optional search and sorting controls, and physical-card gestures in one scrolling panel.",
  callout:
    "Use this for reviewing or searching a card collection; its responsive geometry is component-owned.",
  details: [
    "The browser renders five columns on desktop and four on mobile, using the standard desktop card fit and compact mobile fit. Embedded browsers use floating glass, overlays become full-bleed on mobile, and full-screen hosts use the gallery scrim at every viewport.",
    "Toolbar controls and drag, context-menu, and mobile double-tap gestures belong to this role. Transaction confirmation actions belong to Card Picker Panel.",
  ],
  group: "Components",
  docName: "CardBrowserPanel",
  Component: CardBrowserPanelDemo,
  usage: [
    {
      note: "A searchable overlay browser with UUID-backed card entries.",
      code: `import { CardBrowserPanel } from "src/cumulus/components/card/CardBrowserPanel";

<CardBrowserPanel
  title="Your Deck"
  cards={cards}
  toolbar={toolbar}
  presentation="overlay"
  onCardContextMenu={openCardActions}
/>`,
    },
  ],
  demo: { defaultArgs: {} },
};
