import { SIZE_PRESETS } from "../components/card-size";
import EditableCard from "./EditableCard";
import type { EditorCardRecord, EditorDisplayState } from "./types";

export interface CardEditorGridProps {
  cards: readonly EditorCardRecord[];
  size: EditorDisplayState["size"];
}

export default function CardEditorGrid({ cards, size }: CardEditorGridProps) {
  return (
    <div
      aria-label="Filtered cards"
      data-editor-grid-size={size}
      style={{
        display: "grid",
        gridTemplateColumns: SIZE_PRESETS[size].columns,
        gap: SIZE_PRESETS[size].gap,
        alignItems: "start",
      }}
    >
      {cards.map((card) => (
        <EditableCard key={card.id} card={card} size={size} />
      ))}
    </div>
  );
}
