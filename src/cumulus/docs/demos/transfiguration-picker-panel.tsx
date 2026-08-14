import { useState } from "react";
import { TransfigurationPickerPanel } from "../../components/card/TransfigurationPickerPanel";
import { demoCard, demoIdentitySeed } from "./promotion-fixtures";
import type { CumulusComponent } from "../registry";
import { DemoControls, DemoLog, DemoSelect } from "./promotion-demo-controls";
import { parseDeckEntryId } from "../../../types/identifiers";
function Demo() {
  const [preparation, setPreparation] = useState<"loading" | "ready">("ready");
  const [presentation, setPresentation] = useState<"offer" | "open-deck">(
    "open-deck",
  );
  const [cardCount, setCardCount] = useState(3);
  const [availability, setAvailability] = useState<"available" | "reforged">(
    "available",
  );
  const [last, setLast] = useState("No selection yet");
  const cards = Array.from({ length: cardCount }, (_, offset) => {
    const index = offset + 1;
    return {
      entryId: parseDeckEntryId(demoIdentitySeed(index)),
      card: demoCard(index, offset === 1 ? "Wayfinder" : `Candidate ${index}`),
      availability: offset === 0 ? availability : ("available" as const),
      ...(offset === 0 && availability === "reforged"
        ? { reforgedType: "Empowered" as const }
        : {}),
    };
  });
  return (
    <div style={{ width: "100%", maxWidth: 900, display: "grid", gap: 12 }}>
      <DemoControls>
        <DemoSelect
          label="Preparation"
          value={preparation}
          values={["loading", "ready"]}
          onChange={(value) => setPreparation(value as "loading" | "ready")}
        />
        <DemoSelect
          label="Presentation"
          value={presentation}
          values={["offer", "open-deck"]}
          onChange={(value) => setPresentation(value as "offer" | "open-deck")}
        />
        <DemoSelect
          label="Card count"
          value={String(cardCount)}
          values={["0", "1", "3", "6"]}
          onChange={(value) => setCardCount(Number(value))}
        />
        <DemoSelect
          label="First candidate"
          value={availability}
          values={["available", "reforged"]}
          onChange={(value) =>
            setAvailability(value as "available" | "reforged")
          }
        />
      </DemoControls>
      <TransfigurationPickerPanel
        state={
          preparation === "loading"
            ? { kind: "loading" }
            : { kind: "ready", presentation, cards }
        }
        onCardPress={(id) => setLast(`Selected deck-entry UUID: ${id}`)}
        onDismiss={() => setLast("Declined")}
      />
      <DemoLog>{last}</DemoLog>
    </div>
  );
}
export const transfigurationPickerPanelDemo: CumulusComponent = {
  id: "transfiguration-picker-panel",
  title: "Transfiguration Picker Panel",
  blurb:
    "A Transfiguration-specific card picker with closed loading, offer, open-deck, availability, and reforged display states.",
  callout:
    "Use this instead of CardPickerPanel when card eligibility is prepared for a Transfiguration workflow.",
  details: [
    "The panel emits a deck-entry ID and owns responsive decline placement; it computes no eligibility or Essence rules.",
  ],
  group: "Card Workflows",
  docName: "TransfigurationPickerPanel",
  Component: Demo,
  usage: [
    {
      code: `<TransfigurationPickerPanel state={pickerState} onCardPress={selectEntry} onDismiss={close} />`,
    },
  ],
  demo: { defaultArgs: {} },
};
