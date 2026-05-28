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
      data-editor-scroll-region="cards"
      data-editor-grid-size={size}
      style={{
        flex: "1 1 auto",
        minHeight: 0,
        overflowY: "auto",
        overscrollBehavior: "contain",
        paddingRight: "4px",
        paddingBottom: "8px",
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
