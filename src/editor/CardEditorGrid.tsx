import CardBrowserGrid from "./card-browser/CardBrowserGrid";
import type { CardNameSubstringGroup } from "./card-name-substring-groups";
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
  /** Grouped name-substring sections; omitted for conventional flat sorting. */
  substringGroups?: readonly CardNameSubstringGroup[];
  duplicateUsageByCardId: ReadonlyMap<string, CardDuplicateUsage>;
  size: EditorDisplayState["size"];
  saveState: EditableSaveState;
  tagEditing: boolean;
  tideEditing: boolean;
  artEditing: boolean;
  checkboxTag: string;
  showFontSize: boolean;
  showGlossaryInfoOnHover: boolean;
  showAmplifiedText: boolean;
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
  substringGroups,
  duplicateUsageByCardId,
  size,
  saveState,
  tagEditing,
  tideEditing,
  artEditing,
  checkboxTag,
  showFontSize,
  showGlossaryInfoOnHover,
  showAmplifiedText,
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
  type GridEntry =
    | { kind: "heading"; group: CardNameSubstringGroup }
    | {
        kind: "card";
        card: EditorCardRecord;
        occurrenceKey: string;
      };

  const entries: GridEntry[] =
    substringGroups === undefined
      ? cards.map((card) => ({
          kind: "card",
          card,
          occurrenceKey: card.id,
        }))
      : substringGroups.flatMap((group) => [
          { kind: "heading" as const, group },
          ...group.cards.map((card) => ({
            kind: "card" as const,
            card,
            occurrenceKey: `${group.key}\u0000${card.id}`,
          })),
        ]);

  const renderCard = (card: EditorCardRecord) => (
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
      amplifiedTextSaveEntry={fieldSaveEntry(saveState, {
        cardId: card.id,
        field: "amplified-text",
      })}
      tagEditing={tagEditing}
      tideEditing={tideEditing}
      artEditing={artEditing}
      checkboxTag={checkboxTag}
      showFontSize={showFontSize}
      showGlossaryInfoOnHover={showGlossaryInfoOnHover}
      showAmplifiedText={showAmplifiedText}
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
  );

  return (
    <CardBrowserGrid
      items={entries}
      size={size}
      getKey={(entry) =>
        entry.kind === "heading"
          ? `substring-heading:${entry.group.key}`
          : entry.occurrenceKey
      }
      containerProps={{
        "aria-label": "Filtered cards",
        "data-editor-scroll-region": "cards",
        "data-editor-grid-size": size,
        "data-editor-grouping":
          substringGroups === undefined ? "none" : "name-substring",
      }}
      getItemProps={(entry) =>
        entry.kind === "heading"
          ? {
              "data-editor-substring-group": entry.group.key,
              style: {
                flex: "0 0 100%",
                width: "100%",
              },
            }
          : { "data-editor-card-item": "" }
      }
      renderItem={(entry) =>
        entry.kind === "heading" ? (
          <h2 className="card-editor-substring-heading">
            <span className="card-editor-substring-heading__match">
              “{entry.group.substring}”
            </span>
            <span className="card-editor-substring-heading__count">
              · {entry.group.cards.length} cards
            </span>
          </h2>
        ) : (
          renderCard(entry.card)
        )
      }
    />
  );
}
