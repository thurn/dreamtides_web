import { useLayoutEffect, useRef, useState } from "react";
import { SIZE_PRESETS } from "../components/card-size";
import EditableCard from "./EditableCard";
import type { EditableSaveState, EditableFieldValue } from "./save-state";
import { fieldSaveEntry } from "./save-state";
import type {
  EditableCardField,
  EditorCardRecord,
  EditorDisplayState,
  EditorTag,
  EditorTide,
  TideKind,
} from "./types";

export interface CardTagSaveState {
  saving: boolean;
  error: string | null;
}

export interface CardEditorGridProps {
  cards: readonly EditorCardRecord[];
  size: EditorDisplayState["size"];
  saveState: EditableSaveState;
  tagEditing: boolean;
  tideEditing: boolean;
  tideKind: TideKind;
  artEditing: boolean;
  availableTags: EditorTag[];
  availableTides: EditorTide[];
  tagSaveState: Record<string, CardTagSaveState>;
  tideSaveState: Record<string, CardTagSaveState>;
  onOpenArtEditor: (card: EditorCardRecord) => void;
  onFieldBeginEdit: (
    card: EditorCardRecord,
    field: EditableCardField,
    value: EditableFieldValue,
  ) => void;
  onFieldDraftChange: (
    card: EditorCardRecord,
    field: EditableCardField,
    value: EditableFieldValue,
  ) => void;
  onFieldCancel: (card: EditorCardRecord, field: EditableCardField) => void;
  onFieldSave: (
    card: EditorCardRecord,
    field: EditableCardField,
    value: EditableFieldValue,
  ) => void;
  onFieldCommit: (
    card: EditorCardRecord,
    field: EditableCardField,
    value: EditableFieldValue,
  ) => void;
  onAddCardTag: (card: EditorCardRecord, name: string) => void;
  onRemoveCardTag: (card: EditorCardRecord, name: string) => void;
  onOpenManageTags: () => void;
  onAddCardTide: (card: EditorCardRecord, name: string) => void;
  onRemoveCardTide: (card: EditorCardRecord, name: string) => void;
  onOpenManageTides: () => void;
}

export default function CardEditorGrid({
  cards,
  size,
  saveState,
  tagEditing,
  tideEditing,
  tideKind,
  artEditing,
  availableTags,
  availableTides,
  tagSaveState,
  tideSaveState,
  onOpenArtEditor,
  onFieldBeginEdit,
  onFieldDraftChange,
  onFieldCancel,
  onFieldSave,
  onFieldCommit,
  onAddCardTag,
  onRemoveCardTag,
  onOpenManageTags,
  onAddCardTide,
  onRemoveCardTide,
  onOpenManageTides,
}: CardEditorGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Whether the widest row currently shows 5 or more cards. A full row of cards
  // reads as unbalanced when left-aligned against the trailing slack, so once a
  // row reaches five cards the wrapped cards are centered horizontally.
  const [centerCards, setCenterCards] = useState(false);

  // Measure how many cards share the first (top) row by grouping the wrapped
  // flex items by their offset top. Centering does not change which items wrap
  // onto each row, so toggling alignment never feeds back into this count.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    const measure = () => {
      const items = container.querySelectorAll<HTMLElement>(
        "[data-editor-card-item]",
      );
      if (items.length === 0) {
        setCenterCards(false);
        return;
      }

      const firstTop = items[0].offsetTop;
      let firstRowCount = 0;
      for (const item of items) {
        if (Math.abs(item.offsetTop - firstTop) > 1) {
          break;
        }
        firstRowCount += 1;
      }

      setCenterCards(firstRowCount >= 5);
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [cards, size]);

  return (
    <div
      ref={containerRef}
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
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        justifyContent: centerCards ? "center" : "flex-start",
        // Establishes the container that `100cqw` resolves against, matching
        // the quest draft offer grid so the "large" preset's draft-width
        // formula sizes cards against this grid's own width.
        containerType: "inline-size",
        gap: SIZE_PRESETS[size].gap,
      }}
    >
      {cards.map((card) => (
        <div
          key={card.id}
          data-editor-card-item=""
          style={{
            flex: `0 0 ${SIZE_PRESETS[size].cardWidth}`,
            width: SIZE_PRESETS[size].cardWidth,
            maxWidth: "100%",
          }}
        >
        <EditableCard
          card={card}
          size={size}
          nameSaveEntry={fieldSaveEntry(saveState, {
            cardId: card.id,
            field: "name",
          })}
          energySaveEntry={fieldSaveEntry(saveState, {
            cardId: card.id,
            field: "energy-cost",
          })}
          sparkSaveEntry={fieldSaveEntry(saveState, {
            cardId: card.id,
            field: "spark",
          })}
          subtypeSaveEntry={fieldSaveEntry(saveState, {
            cardId: card.id,
            field: "subtype",
          })}
          rulesTextSaveEntry={fieldSaveEntry(saveState, {
            cardId: card.id,
            field: "rendered-text",
          })}
          tagEditing={tagEditing}
          tideEditing={tideEditing}
          tideKind={tideKind}
          artEditing={artEditing}
          availableTags={availableTags}
          availableTides={availableTides}
          tagSaving={tagSaveState[card.id]?.saving ?? false}
          tagError={tagSaveState[card.id]?.error ?? null}
          tideSaving={tideSaveState[card.id]?.saving ?? false}
          tideError={tideSaveState[card.id]?.error ?? null}
          onOpenArtEditor={onOpenArtEditor}
          onFieldBeginEdit={onFieldBeginEdit}
          onFieldDraftChange={onFieldDraftChange}
          onFieldCancel={onFieldCancel}
          onFieldSave={onFieldSave}
          onFieldCommit={onFieldCommit}
          onAddCardTag={onAddCardTag}
          onRemoveCardTag={onRemoveCardTag}
          onOpenManageTags={onOpenManageTags}
          onAddCardTide={onAddCardTide}
          onRemoveCardTide={onRemoveCardTide}
          onOpenManageTides={onOpenManageTides}
        />
        </div>
      ))}
    </div>
  );
}
