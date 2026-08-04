import { useEffect, useState } from "react";
import { loadCardDatabase } from "../../../data/card-database";
import type { CardData } from "../../../types/cards";
import {
  CardChoiceGrid,
  type CardChoiceGridCardView,
} from "../../components/card/CardChoiceGrid";
import type { CumulusComponent } from "../registry";

const DEMO_CARD_IDS = [
  "1268a899-b209-46bb-bce4-6def1dcd0404",
  "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  "161482b6-af07-4d9e-822d-8c738672beb9",
  "b56ef7e8-c634-4d40-ac08-fab591dfbc4a",
] as const;

function CardChoiceGridDemo() {
  const [cards, setCards] = useState<readonly CardChoiceGridCardView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCardDatabase().then((database) => {
      if (cancelled) return;
      const byId = new Map<string, CardData>();
      for (const card of database.values()) byId.set(card.id, card);
      setCards(
        DEMO_CARD_IDS.flatMap((id) => {
          const card = byId.get(id);
          return card === undefined
            ? []
            : [
                {
                  entryId: card.id,
                  model: { cardId: card.id, displaySnapshot: card },
                  selected: selected === card.id,
                  selectionColor: "accent-bright" as const,
                  operation:
                    selected === card.id ? ("copy" as const) : undefined,
                },
              ];
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div style={{ width: "min(1100px, 100%)", containerType: "size" }}>
      <CardChoiceGrid
        cards={cards}
        columns="four"
        layout={{ kind: "site", viewport: "desktop", fit: "choice" }}
        onCardPress={setSelected}
      />
    </div>
  );
}

export const cardChoiceGridDemo: CumulusComponent = {
  id: "card-choice-grid",
  title: "Card Choice Grid",
  blurb:
    "A frameless, responsive grid for presenting resolved GameCards as choices inside an existing site or panel surface.",
  callout:
    "Use this inside a screen that already owns its material and chrome. Choose a named site fit and column count; use Card Gallery Panel when the card collection needs its own title, controls, scrolling, or glass frame.",
  group: "Components",
  docName: "CardChoiceGrid",
  Component: CardChoiceGridDemo,
  usage: [
    {
      code: `import { CardChoiceGrid } from "src/cumulus/components/card/CardChoiceGrid";

<CardChoiceGrid
  cards={choices.map((choice) => ({
    ...choice,
    operation: choice.entryId === selectedEntryId ? "copy" : undefined,
  }))}
  columns="four"
  layout={{ kind: "site", viewport: "desktop", fit: "choice" }}
  onCardPress={chooseCard}
/>`,
    },
  ],
  demo: { defaultArgs: {} },
};
