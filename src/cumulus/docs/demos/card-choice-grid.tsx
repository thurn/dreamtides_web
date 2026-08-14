import { assertLocalized } from "@trox/runtime";
import { useEffect, useState } from "react";
import { loadCardDatabase } from "../../../data/card-database";
import type { CardData } from "../../../types/cards";
import {
  CardChoiceGrid,
  type CardChoiceGridColumns,
  type CardChoiceOperation,
} from "../../components/card/CardChoiceGrid";
import { GlassPanel } from "../../components/overlay/GlassPanel";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

const DEMO_CARD_IDS = [
  "1268a899-b209-46bb-bce4-6def1dcd0404",
  "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  "161482b6-af07-4d9e-822d-8c738672beb9",
  "b56ef7e8-c634-4d40-ac08-fab591dfbc4a",
] as const;

const DEMO_OPERATIONS: readonly CardChoiceOperation[] = [
  "purge",
  "copy",
  "transfigure",
  "change",
];

function CardChoiceGridDemo({
  columns = "four",
}: {
  readonly columns?: CardChoiceGridColumns;
}) {
  const [cards, setCards] = useState<readonly CardData[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCardDatabase().then((database) => {
      if (cancelled) return;
      const byId = new Map<string, CardData>();
      for (const card of database.values()) byId.set(card.id, card);
      setCards(DEMO_CARD_IDS.flatMap((id) => byId.get(id) ?? []));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ width: "min(1100px, 100%)" }}>
      <GlassPanel
        eyebrow={assertLocalized("Draft Site")}
        title={assertLocalized("Choose a Card")}
        subtitle={assertLocalized("Select one card to add to your deck.")}
      >
        <div
          data-card-choice-grid-demo-surface=""
          style={{
            // Auto-height panels need inline containment: block-size
            // containment would resolve the grid's cqh sizing to zero.
            containerType: "inline-size",
            padding: token("--space-2xl"),
          }}
        >
          <CardChoiceGrid
            cards={cards.map((card, index) => ({
              entryId: card.id,
              model: { cardId: card.id, displaySnapshot: card },
              selection: selected === card.id ? "highlighted" : undefined,
              operation:
                selected === card.id ? DEMO_OPERATIONS[index] : undefined,
            }))}
            columns={columns}
            layout={{ kind: "site", viewport: "desktop", fit: "choice" }}
            onCardPress={(entryId) =>
              setSelected((current) => (current === entryId ? null : entryId))
            }
          />
        </div>
      </GlassPanel>
    </div>
  );
}

export const cardChoiceGridDemo: CumulusComponent = {
  id: "card-choice-grid",
  title: "Card Choice Grid",
  blurb:
    "A frameless, responsive grid that turns a small set of resolved GameCards into selectable choices inside an existing site or panel.",
  callout:
    "Use this when the surrounding screen already supplies the title, instructions, and material surface.",
  details: [
    "The grid owns card sizing, selection and disabled states, optional operation badges and captions, and stable-id callbacks.",
    "Choose a named site fit and column count; use Card Gallery Panel when the collection needs its own title, controls, scrolling, or glass frame.",
  ],
  group: "Components",
  docName: "CardChoiceGrid",
  Component: CardChoiceGridDemo,
  usage: [
    {
      code: `import { CardChoiceGrid } from "src/cumulus/components/card/CardChoiceGrid";

<CardChoiceGrid
  cards={choices.map((choice) => ({
    ...choice,
    operation: choice.entryId === selectedEntryId ? selectionOperation : undefined,
  }))}
  columns="four"
  layout={{ kind: "site", viewport: "desktop", fit: "choice" }}
  onCardPress={chooseCard}
/>`,
    },
  ],
  demo: { defaultArgs: { columns: "four" } },
};
