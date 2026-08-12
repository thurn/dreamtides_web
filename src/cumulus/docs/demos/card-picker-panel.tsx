import { localizationTodo } from "@trox/runtime";
import { useEffect, useState } from "react";
import { loadCardDatabase } from "../../../data/card-database";
import type { CardData } from "../../../types/cards";
import type { CardChoiceGridCardView as CardGalleryCardView } from "../../components/card/CardChoiceGrid";
import { CardPickerPanel } from "../../components/card/CardPickerPanel";
import { GLYPHS } from "../../primitives/glyph";
import type { CumulusComponent } from "../registry";

const DEMO_CARD_IDS = [
  "1268a899-b209-46bb-bce4-6def1dcd0404",
  "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  "161482b6-af07-4d9e-822d-8c738672beb9",
] as const;

function CardPickerPanelDemo() {
  const [cards, setCards] = useState<CardGalleryCardView[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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
              entryId: `picker-demo-${String(index)}`,
              model: { cardId: card.id, displaySnapshot: card },
              selection:
                selected === `picker-demo-${String(index)}`
                  ? "danger"
                  : undefined,
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setCards([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (cards === null) return <div style={{ opacity: 0.7 }}>Loading cards...</div>;

  return (
    <div style={{ width: "min(940px, 100%)", maxHeight: 700 }}>
      <CardPickerPanel
        title={localizationTodo("Purge Cards")}
        subtitle={localizationTodo("Choose a card to remove from your deck")}
        cards={cards}
        rightAccessory={{
          kind: "glassButton",
          button: {
            label: localizationTodo(selected === null ? "Decline" : "Purge 1"),
            variant: selected === null ? "default" : "danger",
            onPress: () => setSelected(null),
          },
        }}
        footerActions={[
          {
            label: localizationTodo("Confirm Choice"),
            variant: "accent",
            disabled: selected === null,
            onPress: () => undefined,
          },
        ]}
        onCardPress={setSelected}
        endAction={{
          entryId: "restock",
          glyph: GLYPHS.refresh,
          label: localizationTodo("Restock"),
          caption: { kind: "essence", amount: 50 },
        }}
      />
    </div>
  );
}

export const cardPickerPanelDemo: CumulusComponent = {
  id: "card-picker-panel",
  title: "Card Picker Panel",
  blurb:
    "The transactional card-choice surface: count-aware responsive cards with header, footer, and trailing choice actions.",
  callout:
    "Use this when choosing cards advances or purchases something; browsing controls are intentionally unavailable.",
  details: [
    "The picker derives two through five columns from its card count and viewport. Desktop sets of up to three cards expand to the 240px reading width when space permits, larger desktop sets use the standard fit, mobile cards use the compact fit, and mobile overlay pickers use two columns for touch clearance.",
    "The optional stacked-copy card model reserves its complete fanned footprint before the copy appears, preventing confirmation-state layout shifts without a panel-level spacing switch.",
  ],
  group: "Components",
  docName: "CardPickerPanel",
  Component: CardPickerPanelDemo,
  usage: [
    {
      note: "A transactional picker with a confirmation action.",
      code: `import { CardPickerPanel } from "src/cumulus/components/card/CardPickerPanel";

<CardPickerPanel
  title="Purge Cards"
  cards={cards}
  footerActions={[
    {
      label: "Confirm Choice",
      disabled: selectedEntryId === null,
      onPress: confirm,
    },
  ]}
  onCardPress={setSelectedEntryId}
/>`,
    },
  ],
  demo: { defaultArgs: {} },
};
