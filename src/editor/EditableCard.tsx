import { useRef, useState, type ReactNode } from "react";
import { CardView } from "../components/CardView";
import type { CardViewSlots } from "../components/CardView";
import { MtgNameTooltip } from "../components/card-browser/MtgNameTooltip";
import CardTagEditor from "./CardTagEditor";
import EditableField from "./EditableField";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";
import type {
  EditableCardField,
  EditorCardRecord,
  EditorDisplayState,
  EditorTag,
} from "./types";

export interface EditableCardProps {
  card: EditorCardRecord;
  size: EditorDisplayState["size"];
  nameSaveEntry: EditableFieldSaveEntry | null;
  energySaveEntry: EditableFieldSaveEntry | null;
  sparkSaveEntry: EditableFieldSaveEntry | null;
  subtypeSaveEntry: EditableFieldSaveEntry | null;
  rulesTextSaveEntry: EditableFieldSaveEntry | null;
  tagEditing: boolean;
  tideEditing: boolean;
  artEditing: boolean;
  availableTags: EditorTag[];
  availableTides: EditorTag[];
  tagSaving: boolean;
  tagError: string | null;
  tideSaving: boolean;
  tideError: string | null;
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

function displayEditorValue(value: EditableFieldValue): EditableFieldValue {
  return value === "*" ? "X" : value;
}

function numericPreviewValue(
  value: EditableFieldValue,
  { allowBlank }: { allowBlank: boolean },
): number | null {
  const textValue = String(value).trim();

  if ((allowBlank && textValue === "") || textValue === "*" || textValue === "X") {
    return null;
  }

  if (/^\d+$/u.test(textValue)) {
    return Number(textValue);
  }

  return null;
}

/** Whether a raw spark draft value is the variable marker (`X`/`x`/`*`). */
function isVariableSparkValue(value: EditableFieldValue): boolean {
  const textValue = String(value).trim();
  return textValue === "*" || textValue === "X" || textValue === "x";
}

function energyCostSegmentLabel(segment: string): string {
  const trimmed = segment.trim();
  return trimmed === "*" || trimmed === "X" || trimmed === "x" ? "X" : trimmed;
}

/**
 * Mirror of the setup-assets `parseEnergyCost` transform for the editor's live
 * preview: turn the raw `energy-cost` draft value into the numeric base cost
 * plus the ordered orb labels of a multi-cost card (`"2,X"` -> `["2", "X"]`).
 * Single values yield `energyCosts: null` so the preview falls back to the one
 * derived orb.
 */
function energyPreviewValue(value: EditableFieldValue): {
  energyCost: number | null;
  energyCosts: string[] | null;
} {
  const segments = String(value)
    .split(/[,\n]/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

  if (segments.length <= 1) {
    return {
      energyCost: numericPreviewValue(value, { allowBlank: false }),
      energyCosts: null,
    };
  }

  const base = segments
    .map((segment) => numericPreviewValue(segment, { allowBlank: false }))
    .find((numeric) => numeric !== null);

  return {
    energyCost: base ?? null,
    energyCosts: segments.map(energyCostSegmentLabel),
  };
}

export default function EditableCard({
  card,
  size,
  nameSaveEntry,
  energySaveEntry,
  sparkSaveEntry,
  subtypeSaveEntry,
  rulesTextSaveEntry,
  tagEditing,
  tideEditing,
  artEditing,
  availableTags,
  availableTides,
  tagSaving,
  tagError,
  tideSaving,
  tideError,
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
}: EditableCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [hovering, setHovering] = useState(false);
  const mtgName = card.mtgName.trim();

  const visibleName = String(nameSaveEntry?.draftValue ?? card.name);
  const visibleEnergy = energyPreviewValue(
    energySaveEntry?.draftValue ?? card["energy-cost"],
  );
  const sparkDraftValue = sparkSaveEntry?.draftValue ?? card.spark;
  const visibleSpark = numericPreviewValue(sparkDraftValue, {
    allowBlank: true,
  });
  const visibleSparkVariable = isVariableSparkValue(sparkDraftValue);
  const visibleSubtype = String(subtypeSaveEntry?.draftValue ?? card.subtype);
  const visibleRulesText = String(
    rulesTextSaveEntry?.draftValue ?? card["rendered-text"],
  );
  const visibleCard = {
    ...card.preview,
    energyCost: visibleEnergy.energyCost,
    energyCosts: visibleEnergy.energyCosts ?? undefined,
    name: visibleName,
    renderedText: visibleRulesText,
    spark: visibleSpark,
    sparkVariable: visibleSparkVariable,
    subtype: visibleSubtype,
  };

  // Common props for an editable region. EditableField is a `display: contents`
  // wrapper, so the rendered card geometry is exactly CardView's; the editor
  // only swaps in an input on the same spot while a field is being edited and
  // floats its save status in a fixed overlay.
  const fieldProps = (
    field: EditableCardField,
    value: EditableFieldValue,
    saveEntry: EditableFieldSaveEntry | null,
  ) => ({
    field,
    value,
    saveEntry,
    cardAnchorRef: cardRef,
    onBeginEdit: (next: EditableFieldValue) =>
      onFieldBeginEdit(card, field, next),
    onDraftChange: (next: EditableFieldValue) =>
      onFieldDraftChange(card, field, next),
    onCancel: () => onFieldCancel(card, field),
    onSave: (next: EditableFieldValue) => onFieldSave(card, field, next),
    onCommit: (next: EditableFieldValue) => onFieldCommit(card, field, next),
  });

  const renderSubtypeField = (children: ReactNode) => (
    <EditableField
      {...fieldProps("subtype", card.subtype, subtypeSaveEntry)}
      layout="inline"
    >
      {children}
    </EditableField>
  );

  const slots: CardViewSlots = {
    energy: (_context, defaultNode) => (
      <EditableField
        {...fieldProps(
          "energy-cost",
          displayEditorValue(card["energy-cost"]),
          energySaveEntry,
        )}
        layout="pip"
      >
        {defaultNode}
      </EditableField>
    ),
    name: (_context, defaultNode) => (
      <EditableField {...fieldProps("name", card.name, nameSaveEntry)}>
        {defaultNode}
      </EditableField>
    ),
    typeLineContent: (context, defaultNode) => {
      const subtype = context.card.subtype.trim();
      const hasSubtype = subtype !== "" && subtype !== "*";
      const editingSubtype = subtypeSaveEntry?.status === "editing";
      // Keep the subtype field mounted while a save is in flight or just
      // settled so its floating status badge has a home even when the saved
      // value is blank.
      const subtypeActive =
        subtypeSaveEntry !== null && subtypeSaveEntry.status !== "idle";
      const showSubtypeText = hasSubtype || editingSubtype;
      const mountSubtypeField = showSubtypeText || subtypeActive;

      if (context.card.cardType === "Event") {
        return (
          <span className="truncate">
            <span data-editor-type-line-card-type="true">
              {context.card.cardType}
            </span>
            {mountSubtypeField ? (
              <>
                {showSubtypeText ? <span aria-hidden="true"> — </span> : null}
                {renderSubtypeField(
                  hasSubtype ? <span>{subtype}</span> : <span />,
                )}
              </>
            ) : null}
          </span>
        );
      }

      if (mountSubtypeField) {
        return renderSubtypeField(
          hasSubtype ? <span className="truncate">{subtype}</span> : <span />,
        );
      }

      return defaultNode;
    },
    rulesText: (_context, defaultNode) => (
      <EditableField
        {...fieldProps("rendered-text", card["rendered-text"], rulesTextSaveEntry)}
        mode="multiline"
      >
        {defaultNode}
      </EditableField>
    ),
    spark: (_context, defaultNode) => {
      const sparkActive =
        sparkSaveEntry !== null && sparkSaveEntry.status !== "idle";
      if (!sparkActive && defaultNode === null) {
        // No spark value: match CardView and render nothing. The editor does
        // not offer an "add spark" affordance. While a save is in flight or
        // settled the field stays mounted so its status badge has a home.
        return null;
      }

      // CardView owns the bottom-right spark container, so this stays a stable
      // EditableField in both display and edit states (no remount on edit).
      return (
        <EditableField
          {...fieldProps("spark", displayEditorValue(card.spark), sparkSaveEntry)}
          layout="pip"
        >
          {defaultNode}
        </EditableField>
      );
    },
  };

  if (artEditing) {
    // Art-edit mode replaces inline field editing: clicking the card opens the
    // art crop editor. CardView handles the click and button semantics itself,
    // so the card is not wrapped in an element whose styles would cascade into
    // the card chrome. The preview reflects the card's saved art.
    return (
      <article
        ref={cardRef}
        aria-label={visibleName}
        data-editor-card-id={card.id}
        style={{ display: "block" }}
      >
        <CardView
          card={visibleCard}
          large={size === "large"}
          suppressHoverHelp
          onClick={() => onOpenArtEditor(card)}
        />
      </article>
    );
  }

  return (
    <article
      ref={cardRef}
      aria-label={visibleName}
      data-editor-card-id={card.id}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{ display: "block" }}
    >
      <CardView
        card={visibleCard}
        large={size === "large"}
        suppressHoverHelp
        slots={slots}
      />
      {tagEditing ? (
        <CardTagEditor
          cardTags={card.tags}
          availableTags={availableTags}
          saving={tagSaving}
          error={tagError}
          onAddTag={(name) => onAddCardTag(card, name)}
          onRemoveTag={(name) => onRemoveCardTag(card, name)}
          onOpenManageTags={onOpenManageTags}
        />
      ) : null}
      {tideEditing ? (
        <CardTagEditor
          noun="tide"
          cardTags={card.tides}
          availableTags={availableTides}
          saving={tideSaving}
          error={tideError}
          onAddTag={(name) => onAddCardTide(card, name)}
          onRemoveTag={(name) => onRemoveCardTide(card, name)}
          onOpenManageTags={onOpenManageTides}
        />
      ) : null}
      {hovering && mtgName !== "" ? (
        <MtgNameTooltip anchorRef={cardRef} mtgName={mtgName} />
      ) : null}
    </article>
  );
}
