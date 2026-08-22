import {
  parseCardName,
  parseCardSubtype,
} from "../types/card-identity";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { CardView } from "../cumulus/components/card/CardView";
import type { CardViewSlots } from "../cumulus/components/card/CardView";
import { IconButton } from "../cumulus/components/controls/IconButton";
import { extractGlossaryTerms } from "../data/glossary-terms";
import { GLYPHS } from "../cumulus/primitives/glyph";
import { assertLocalized } from "@trox/runtime";
import { MtgNameTooltip } from "./card-browser/MtgNameTooltip";
import type { CardDuplicateUsage } from "./card-duplicate-usage";
import CardTagEditor from "./CardTagEditor";
import EditableField from "./EditableField";
import { readableTextColor, tagColor } from "./tag-color";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";
import type {
  EditableCardField,
  EditorCardRecord,
  EditorDisplayState,
  EditorTag,
} from "./types";
import type { CardId } from "../types/card-identity";
import { logEvent } from "../logging";

export interface EditableCardProps {
  card: EditorCardRecord;
  duplicateUsage: CardDuplicateUsage | null;
  size: EditorDisplayState["size"];
  nameSaveEntry: EditableFieldSaveEntry | null;
  energySaveEntry: EditableFieldSaveEntry | null;
  sparkSaveEntry: EditableFieldSaveEntry | null;
  subtypeSaveEntry: EditableFieldSaveEntry | null;
  rulesTextSaveEntry: EditableFieldSaveEntry | null;
  amplifiedTextSaveEntry: EditableFieldSaveEntry | null;
  tagEditing: boolean;
  tideEditing: boolean;
  artEditing: boolean;
  /**
   * When non-empty, checkbox tagging mode is active for this tag: a big
   * checkbox overlays each card to toggle the tag, and the tag/tide chip
   * editors are suppressed so only this one tag is in play.
   */
  checkboxTag: string;
  /** Show a per-card control that copies the art image number. */
  showImageNumberCopy: boolean;
  /**
   * When true, overlay a small badge on the card showing the rules-text font
   * size the fitter computed (in px).
   */
  showFontSize: boolean;
  /** Whether cards with glossary terms reveal their Info Cards on hover. */
  showGlossaryInfoOnHover: boolean;
  /** Show and inline-edit amplified rules text in the card face. */
  showAmplifiedText: boolean;
  /**
   * Measure the rules-text fit immediately rather than on scroll. Set while the
   * grid sorts by font size so every card contributes a stable sort key.
   */
  eagerRulesFit: boolean;
  availableTags: EditorTag[];
  availableTides: EditorTag[];
  tagSaving: boolean;
  tagError: string | null;
  tideSaving: boolean;
  tideError: string | null;
  /**
   * Reports this card's fitted rules-text font size (in px) as it is measured.
   * Supplied only when the grid needs it (font-size sort); omitting it skips the
   * report while the local overlay still works.
   */
  onRulesFontSize?: (cardId: CardId, fontSizePx: number) => void;
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

  if (
    (allowBlank && textValue === "") ||
    textValue === "*" ||
    textValue === "X"
  ) {
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

interface CheckboxTagControlProps {
  tagName: string;
  checked: boolean;
  color: string;
  saving: boolean;
  onToggle: () => void;
}

/**
 * The checkbox shown below each card in checkbox tagging mode. It is a separate
 * control under the card rather than an overlay, so it never hides the art and
 * does not interfere with art-edit or inline field clicks on the card itself.
 */
function CheckboxTagControl({
  tagName,
  checked,
  color,
  saving,
  onToggle,
}: CheckboxTagControlProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${checked ? "Remove" : "Add"} tag ${tagName}`}
      title={`${checked ? "Remove" : "Add"} tag “${tagName}”`}
      disabled={saving}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      style={{
        marginTop: "6px",
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 8px",
        borderRadius: "8px",
        border: checked
          ? `1px solid ${color}`
          : "1px solid rgba(247, 241, 223, 0.28)",
        background: checked ? color : "rgba(15, 23, 25, 0.85)",
        color: checked ? readableTextColor(color) : "#d9e1dd",
        font: "inherit",
        fontWeight: 700,
        fontSize: "0.8rem",
        cursor: saving ? "progress" : "pointer",
        opacity: saving ? 0.6 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: "0 0 auto",
          width: "20px",
          height: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "5px",
          border: checked
            ? "2px solid rgba(255, 255, 255, 0.85)"
            : "2px solid rgba(247, 241, 223, 0.5)",
          background: checked ? "rgba(255, 255, 255, 0.18)" : "transparent",
          fontSize: "0.95rem",
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {tagName}
      </span>
    </button>
  );
}

interface ImageNumberCopyControlProps {
  cardId: CardId;
  imageNumber: number;
}

async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Clipboard permissions can be disabled in embedded or automated browser
    // contexts. Keep the explicit user gesture useful there by falling back to
    // the browser's selection-based copy command.
  }

  const copySource = document.createElement("textarea");
  copySource.value = text;
  copySource.setAttribute("readonly", "");
  copySource.style.position = "fixed";
  copySource.style.opacity = "0";
  document.body.append(copySource);
  copySource.select();
  const copied = document.execCommand("copy");
  copySource.remove();
  if (!copied) {
    throw new Error("Clipboard copy was rejected.");
  }
}

function ImageNumberCopyControl({
  cardId,
  imageNumber,
}: ImageNumberCopyControlProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  const copyImageNumber = async () => {
    try {
      await copyTextToClipboard(String(imageNumber));
      setCopyState("copied");
      logEvent("card_editor_image_number_copied", { cardId, imageNumber });
    } catch {
      setCopyState("error");
    }
  };

  const label =
    copyState === "copied"
      ? `Copied ${String(imageNumber)}`
      : copyState === "error"
        ? "Copy failed"
        : `Copy ${String(imageNumber)}`;

  return (
    <button
      type="button"
      className="cumulus card-editor-image-number-copy"
      data-editor-image-number-copy-button={imageNumber}
      aria-label={`Copy image number ${String(imageNumber)}`}
      title={`Copy image number ${String(imageNumber)}`}
      onClick={(event) => {
        event.stopPropagation();
        void copyImageNumber();
      }}
    >
      <i className={GLYPHS.copy} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export default function EditableCard({
  card,
  duplicateUsage,
  size,
  nameSaveEntry,
  energySaveEntry,
  sparkSaveEntry,
  subtypeSaveEntry,
  rulesTextSaveEntry,
  amplifiedTextSaveEntry,
  tagEditing,
  tideEditing,
  artEditing,
  checkboxTag,
  showImageNumberCopy,
  showFontSize,
  showGlossaryInfoOnHover,
  showAmplifiedText,
  eagerRulesFit,
  availableTags,
  availableTides,
  tagSaving,
  tagError,
  tideSaving,
  tideError,
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
}: EditableCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [hovering, setHovering] = useState(false);
  const [rulesFontPx, setRulesFontPx] = useState<number | null>(null);
  const mtgName = card.mtgName.trim();

  const handleRulesFontSize = useCallback(
    (fontSizePx: number) => {
      setRulesFontPx(fontSizePx);
      onRulesFontSize?.(card.id, fontSizePx);
    },
    [onRulesFontSize, card.id],
  );

  const fontSizeOverlay =
    showFontSize && rulesFontPx !== null ? (
      <div
        aria-hidden="true"
        data-editor-font-size-overlay={rulesFontPx.toFixed(1)}
        style={{
          position: "absolute",
          left: "4px",
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 6,
          pointerEvents: "none",
          padding: "2px 6px",
          borderRadius: "6px",
          background: "rgba(8, 12, 14, 0.82)",
          border: "1px solid rgba(142, 219, 209, 0.7)",
          color: "#eafffb",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: "0.72rem",
          fontWeight: 700,
          lineHeight: 1.1,
          whiteSpace: "nowrap",
        }}
      >
        {rulesFontPx.toFixed(1)}px
      </div>
    ) : null;

  const checkboxActive = checkboxTag !== "";
  const checkboxChecked = checkboxActive && card.tags.includes(checkboxTag);
  const toggleCheckboxTag = () => {
    if (checkboxChecked) {
      onRemoveCardTag(card, checkboxTag);
    } else {
      onAddCardTag(card, checkboxTag);
    }
  };
  const checkboxControl = checkboxActive ? (
    <CheckboxTagControl
      tagName={checkboxTag}
      checked={checkboxChecked}
      color={tagColor(checkboxTag, availableTags)}
      saving={tagSaving}
      onToggle={toggleCheckboxTag}
    />
  ) : null;
  const imageNumberCopyControl = showImageNumberCopy ? (
    <ImageNumberCopyControl
      cardId={card.id}
      imageNumber={card.preview.imageNumber}
    />
  ) : null;

  const duplicateName = (duplicateUsage?.nameCount ?? 1) > 1;
  const duplicateArt = (duplicateUsage?.artCount ?? 1) > 1;
  const duplicateDetails = [
    duplicateName
      ? `Duplicate name: ${String(duplicateUsage?.nameCount)} cards use “${card.name}”.`
      : null,
    duplicateArt
      ? `Duplicate art: ${String(duplicateUsage?.artCount)} cards use image ${String(card.preview.imageNumber)}.`
      : null,
  ].filter((detail): detail is string => detail !== null);
  const duplicateWarning =
    duplicateDetails.length > 0 ? (
      <i
        className={GLYPHS.warning}
        role="img"
        aria-label={duplicateDetails.join(" ")}
        title={duplicateDetails.join(" ")}
        data-editor-duplicate-warning="true"
        data-editor-duplicate-name={String(duplicateName)}
        data-editor-duplicate-art={String(duplicateArt)}
        style={{
          flex: "0 0 auto",
          color: "#ef4444",
          fontSize: "1.05em",
          lineHeight: 1,
          textShadow: "var(--cv-name-text-shadow)",
        }}
      />
    ) : null;

  // The expanded Amplified form is generated from the base rules plus the
  // compact replacement. It remains read-only on the physical card; the
  // replacement has its own editor below the card.
  const confirmedVisibleRulesText = showAmplifiedText
    ? card.preview.amplifiedText ?? ""
    : card["rendered-text"];
  const rulesTextEditing =
    !showAmplifiedText && rulesTextSaveEntry?.status === "editing";
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
  const previewSubtype = parseCardSubtype(visibleSubtype);
  const visibleRulesText = String(
    (showAmplifiedText ? null : rulesTextSaveEntry?.draftValue) ??
      confirmedVisibleRulesText,
  );
  const visibleCard = {
    ...card.preview,
    energyCost: visibleEnergy.energyCost,
    energyCosts: visibleEnergy.energyCosts ?? undefined,
    name: visibleName.length === 0 ? card.preview.name : parseCardName(visibleName),
    renderedText: visibleRulesText,
    spark: visibleSpark,
    sparkVariable: visibleSparkVariable,
    subtype: previewSubtype,
  };
  const shouldShowGlossaryInfoOnHover =
    showGlossaryInfoOnHover &&
    extractGlossaryTerms(visibleRulesText).length > 0;
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

  const amplifiedEditorPanel = showAmplifiedText ? (
    <div
      data-editor-amplified-authoring="true"
      style={{
        marginTop: "8px",
        display: "grid",
        gap: "8px",
        padding: "10px",
        border: "1px solid rgba(142, 219, 209, 0.32)",
        borderRadius: "8px",
        background: "rgba(6, 16, 18, 0.86)",
        color: "rgba(217, 225, 221, 0.9)",
        fontSize: "0.72rem",
        fontWeight: 600,
        lineHeight: 1.35,
      }}
    >
      <div data-editor-original-rules-text="true">
        <strong style={{ color: "#8edbd1" }}>Original:</strong>{" "}
        {card["rendered-text"]}
      </div>
      <div style={{ display: "grid", gap: "4px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <strong style={{ color: "#8edbd1" }}>Amplified replacement:</strong>
          {card["amplified-text"].trim() !== "" ? (
            <span className="cumulus" data-editor-clear-amplified-text={card.id}>
              <IconButton
                glyph={GLYPHS.close}
                label={assertLocalized("Clear amplified text")}
                size="sm"
                disabled={amplifiedTextSaveEntry?.status === "saving"}
                onPress={() => onFieldSave(card, "amplified-text", "")}
              />
            </span>
          ) : null}
        </div>
        <EditableField
          {...fieldProps(
            "amplified-text",
            card["amplified-text"],
            amplifiedTextSaveEntry,
          )}
          activation="click"
          mode="multiline"
          multilineSize="expanded"
        >
          <div
            style={{
              minHeight: "3.2em",
              padding: "6px 8px",
              border: "1px solid rgba(247, 241, 223, 0.2)",
              borderRadius: "6px",
              background: "rgba(15, 23, 25, 0.72)",
              whiteSpace: "pre-wrap",
              cursor: "text",
            }}
          >
            {card["amplified-text"]}
          </div>
        </EditableField>
      </div>
    </div>
  ) : null;

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
      <>
        <EditableField {...fieldProps("name", card.name, nameSaveEntry)}>
          {defaultNode}
        </EditableField>
        {duplicateWarning}
      </>
    ),
    typeLineContent: (context, defaultNode) => {
      const subtype = context.card.subtype.trim();
      const hasSubtype = subtype !== "";
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
    rulesText: (_context, defaultNode) =>
      showAmplifiedText ? (
        defaultNode
      ) : (
        <EditableField
          {...fieldProps(
            "rendered-text",
            confirmedVisibleRulesText,
            rulesTextSaveEntry,
          )}
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
          {...fieldProps(
            "spark",
            displayEditorValue(card.spark),
            sparkSaveEntry,
          )}
          layout="pip"
        >
          {defaultNode}
        </EditableField>
      );
    },
  };

  if (artEditing) {
    // Edit mode replaces inline field editing: clicking the card opens the
    // focused editor for the whole card. CardView handles the click and button
    // semantics itself, so the card is not wrapped in an element whose styles
    // would cascade into the card chrome. The preview reflects the card's saved art.
    return (
      <article
        ref={cardRef}
        aria-label={visibleName}
        data-editor-card-id={card.id}
        data-editor-rules-variant={showAmplifiedText ? "amplified" : "base"}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{ display: "block", position: "relative" }}
      >
        <CardView
          card={visibleCard}
          large={size === "large"}
          slots={
            duplicateWarning === null
              ? undefined
              : {
                  name: (_context, defaultNode) => (
                    <>
                      {defaultNode}
                      {duplicateWarning}
                    </>
                  ),
                }
          }
          onPress={() => onOpenArtEditor(card)}
          onRulesFontSizeChange={handleRulesFontSize}
          eagerRulesFit={eagerRulesFit}
          glossaryInfoOnHover={shouldShowGlossaryInfoOnHover}
        />
        {fontSizeOverlay}
        {amplifiedEditorPanel}
        {checkboxControl}
        {imageNumberCopyControl}
        {hovering && mtgName !== "" ? (
          <MtgNameTooltip anchorRef={cardRef} mtgName={mtgName} />
        ) : null}
      </article>
    );
  }

  return (
    <article
      ref={cardRef}
      aria-label={visibleName}
      data-editor-card-id={card.id}
      data-editor-rules-variant={showAmplifiedText ? "amplified" : "base"}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{ display: "block", position: "relative" }}
    >
      <CardView
        card={visibleCard}
        large={size === "large"}
        slots={slots}
        onRulesFontSizeChange={handleRulesFontSize}
        eagerRulesFit={eagerRulesFit}
        rulesTextboxExpanded={rulesTextEditing}
        glossaryInfoOnHover={shouldShowGlossaryInfoOnHover}
      />
      {fontSizeOverlay}
      {amplifiedEditorPanel}
      {/* Checkbox tagging hides the tag and tide chip editors so only the one
          selected tag is in play. */}
      {!checkboxActive && tagEditing ? (
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
      {!checkboxActive && tideEditing ? (
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
      {checkboxControl}
      {imageNumberCopyControl}
      {hovering && mtgName !== "" ? (
        <MtgNameTooltip anchorRef={cardRef} mtgName={mtgName} />
      ) : null}
    </article>
  );
}
