import CardBrowserGrid from "./card-browser/CardBrowserGrid";
import EditableCard from "./EditableCard";
import type { CardDuplicateUsage } from "./card-duplicate-usage";
import type { EditableSaveState, EditableFieldValue } from "./save-state";
import { fieldSaveEntry } from "./save-state";
import type {
  EditableCardField,
  EditorCardRecord,
  EditorDisplayState,
  EditorTag,
} from "./types";

export interface CardTagSaveState {
  saving: boolean;
  error: string | null;
}

export interface CardEditorGridProps {
  cards: readonly EditorCardRecord[];
  duplicateUsageByCardId: ReadonlyMap<string, CardDuplicateUsage>;
  size: EditorDisplayState["size"];
  saveState: EditableSaveState;
  tagEditing: boolean;
  tideEditing: boolean;
  artEditing: boolean;
  checkboxTag: string;
  showFontSize: boolean;
  eagerRulesFit: boolean;
  availableTags: EditorTag[];
  availableTides: EditorTag[];
  tagSaveState: Record<string, CardTagSaveState>;
  tideSaveState: Record<string, CardTagSaveState>;
  onRulesFontSize?: (cardId: string, fontSizePx: number) => void;
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

/**
 * The editor's card grid. Layout and sizing come from the shared
 * `CardBrowserGrid`; this wrapper renders an editable card per item and exposes
 * the editor's `data-editor-*` hooks on the scrolling container and card-item
 * wrappers.
 */
export default function CardEditorGrid({
  cards,
  duplicateUsageByCardId,
  size,
  saveState,
  tagEditing,
  tideEditing,
  artEditing,
  checkboxTag,
  showFontSize,
  eagerRulesFit,
  availableTags,
  availableTides,
  tagSaveState,
  tideSaveState,
  onRulesFontSize,
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
  return (
    <CardBrowserGrid
      items={cards}
      size={size}
      getKey={(card) => card.id}
      containerProps={{
        "aria-label": "Filtered cards",
        "data-editor-scroll-region": "cards",
        "data-editor-grid-size": size,
      }}
      getItemProps={() => ({ "data-editor-card-item": "" })}
      renderItem={(card) => (
        <EditableCard
          card={card}
          duplicateUsage={duplicateUsageByCardId.get(card.id) ?? null}
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
          artEditing={artEditing}
          checkboxTag={checkboxTag}
          showFontSize={showFontSize}
          eagerRulesFit={eagerRulesFit}
          availableTags={availableTags}
          availableTides={availableTides}
          tagSaving={tagSaveState[card.id]?.saving ?? false}
          tagError={tagSaveState[card.id]?.error ?? null}
          tideSaving={tideSaveState[card.id]?.saving ?? false}
          tideError={tideSaveState[card.id]?.error ?? null}
          onRulesFontSize={onRulesFontSize}
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
      )}
    />
  );
}
