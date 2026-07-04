import { useRef } from "react";
import type { CSSProperties } from "react";
import { DreamcallerPortrait } from "../tango/components/hud/DreamcallerPortrait";
import { RulesText } from "../tango/components/card/RulesText";
import EditableField from "./EditableField";
import { TIDE_DOT_COLOR } from "./TidePoolModal";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";
import type {
  EditableDreamcallerField,
  EditorDreamcallerRecord,
  EditorTideOption,
} from "./dreamcaller-types";

export interface EditableDreamcallerProps {
  dreamcaller: EditorDreamcallerRecord;
  tides: readonly EditorTideOption[];
  nameSaveEntry: EditableFieldSaveEntry | null;
  titleSaveEntry: EditableFieldSaveEntry | null;
  abilitySaveEntry: EditableFieldSaveEntry | null;
  essenceSaveEntry: EditableFieldSaveEntry | null;
  imageNumberSaveEntry: EditableFieldSaveEntry | null;
  tideSaving: boolean;
  onFieldBeginEdit: (
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
    value: EditableFieldValue,
  ) => void;
  onFieldDraftChange: (
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
    value: EditableFieldValue,
  ) => void;
  onFieldCancel: (
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
  ) => void;
  onFieldSave: (
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
    value: EditableFieldValue,
  ) => void;
  onFieldCommit: (
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
    value: EditableFieldValue,
  ) => void;
  onEditTides: (dreamcaller: EditorDreamcallerRecord) => void;
  onViewDetail: (dreamcaller: EditorDreamcallerRecord) => void;
}

const tileStyle: CSSProperties = {
  position: "relative",
  minHeight: "420px",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: "8px",
  border: "1px solid rgba(247, 241, 223, 0.18)",
  background: "#172126",
  boxShadow: "0 10px 24px rgba(0, 0, 0, 0.24)",
};

const bodyStyle: CSSProperties = {
  display: "flex",
  flex: "1 1 auto",
  minHeight: 0,
  flexDirection: "column",
  gap: "8px",
  padding: "10px",
};

const nameStyle: CSSProperties = {
  margin: 0,
  color: "#fff7e0",
  fontSize: "1rem",
  fontWeight: 850,
  lineHeight: 1.15,
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#cbd5f5",
  fontStyle: "italic",
  fontSize: "0.82rem",
  lineHeight: 1.2,
};

const abilityStyle: CSSProperties = {
  minHeight: "64px",
  color: "#dce6e2",
  fontSize: "0.83rem",
  lineHeight: 1.35,
};

const fieldRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "0.78rem",
};

const fieldLabelStyle: CSSProperties = {
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 700,
  fontSize: "0.68rem",
};

export default function EditableDreamcaller({
  dreamcaller,
  tides,
  nameSaveEntry,
  titleSaveEntry,
  abilitySaveEntry,
  essenceSaveEntry,
  imageNumberSaveEntry,
  tideSaving,
  onFieldBeginEdit,
  onFieldDraftChange,
  onFieldCancel,
  onFieldSave,
  onFieldCommit,
  onEditTides,
  onViewDetail,
}: EditableDreamcallerProps) {
  const tileRef = useRef<HTMLElement | null>(null);
  const tideById = new Map(tides.map((tide) => [tide.id, tide]));
  const starterTide =
    dreamcaller.tidePool.starter !== null
      ? tideById.get(dreamcaller.tidePool.starter)
      : undefined;

  function tideLabel(id: string): string {
    const tide = tideById.get(id);
    if (tide === undefined) {
      return id;
    }
    return tide.displayName !== "" ? tide.displayName : tide.shortName !== "" ? tide.shortName : tide.name;
  }

  return (
    <article ref={tileRef} data-editor-dreamcaller-id={dreamcaller.id} style={tileStyle}>
      <div style={{ padding: "10px 10px 0" }}>
        <button
          type="button"
          data-view-detail={dreamcaller.id}
          title={`View ${dreamcaller.name} details`}
          aria-label={`View ${dreamcaller.name} details`}
          onClick={() => onViewDetail(dreamcaller)}
          style={{
            display: "block",
            width: "100%",
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "zoom-in",
          }}
        >
          <DreamcallerPortrait
            dreamcaller={{
              imageNumber: dreamcaller.imageNumber,
              name: dreamcaller.name,
              title: dreamcaller.title,
            }}
            variant="panel"
          />
        </button>
      </div>

      <div style={bodyStyle}>
        <EditableField
          field="name"
          value={dreamcaller.name}
          saveEntry={nameSaveEntry}
          cardAnchorRef={tileRef}
          onBeginEdit={(value) => onFieldBeginEdit(dreamcaller, "name", value)}
          onDraftChange={(value) => onFieldDraftChange(dreamcaller, "name", value)}
          onCancel={() => onFieldCancel(dreamcaller, "name")}
          onSave={(value) => onFieldSave(dreamcaller, "name", value)}
          onCommit={(value) => onFieldCommit(dreamcaller, "name", value)}
        >
          <h2 style={nameStyle}>{dreamcaller.name}</h2>
        </EditableField>

        <EditableField
          field="title"
          value={dreamcaller.title}
          saveEntry={titleSaveEntry}
          cardAnchorRef={tileRef}
          onBeginEdit={(value) => onFieldBeginEdit(dreamcaller, "title", value)}
          onDraftChange={(value) => onFieldDraftChange(dreamcaller, "title", value)}
          onCancel={() => onFieldCancel(dreamcaller, "title")}
          onSave={(value) => onFieldSave(dreamcaller, "title", value)}
          onCommit={(value) => onFieldCommit(dreamcaller, "title", value)}
        >
          <p style={titleStyle}>{dreamcaller.title}</p>
        </EditableField>

        <EditableField
          field="rendered-text"
          value={dreamcaller["rendered-text"]}
          mode="multiline"
          saveEntry={abilitySaveEntry}
          cardAnchorRef={tileRef}
          onBeginEdit={(value) => onFieldBeginEdit(dreamcaller, "rendered-text", value)}
          onDraftChange={(value) => onFieldDraftChange(dreamcaller, "rendered-text", value)}
          onCancel={() => onFieldCancel(dreamcaller, "rendered-text")}
          onSave={(value) => onFieldSave(dreamcaller, "rendered-text", value)}
          onCommit={(value) => onFieldCommit(dreamcaller, "rendered-text", value)}
        >
          <div style={abilityStyle}>
            <RulesText text={dreamcaller["rendered-text"]} />
          </div>
        </EditableField>

        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>Starting Essence</span>
          <EditableField
            field="starting-essence"
            value={dreamcaller.startingEssence}
            layout="inline"
            saveEntry={essenceSaveEntry}
            cardAnchorRef={tileRef}
            onBeginEdit={(value) => onFieldBeginEdit(dreamcaller, "starting-essence", value)}
            onDraftChange={(value) => onFieldDraftChange(dreamcaller, "starting-essence", value)}
            onCancel={() => onFieldCancel(dreamcaller, "starting-essence")}
            onSave={(value) => onFieldSave(dreamcaller, "starting-essence", value)}
            onCommit={(value) => onFieldCommit(dreamcaller, "starting-essence", value)}
          >
            <span
              style={{ color: "#fbbf24", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}
            >
              {String(dreamcaller.startingEssence)}
            </span>
          </EditableField>
        </div>

        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>Art (image #)</span>
          <EditableField
            field="image-number"
            value={dreamcaller.imageNumber}
            layout="inline"
            saveEntry={imageNumberSaveEntry}
            cardAnchorRef={tileRef}
            onBeginEdit={(value) => onFieldBeginEdit(dreamcaller, "image-number", value)}
            onDraftChange={(value) => onFieldDraftChange(dreamcaller, "image-number", value)}
            onCancel={() => onFieldCancel(dreamcaller, "image-number")}
            onSave={(value) => onFieldSave(dreamcaller, "image-number", value)}
            onCommit={(value) => onFieldCommit(dreamcaller, "image-number", value)}
          >
            <span style={{ color: "#e7efec", fontWeight: 700 }}>
              {dreamcaller.imageNumber === "" ? "—" : dreamcaller.imageNumber}
            </span>
          </EditableField>
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            paddingTop: "8px",
            borderTop: "1px solid rgba(247, 241, 223, 0.1)",
          }}
        >
          <div style={{ ...fieldRowStyle, justifyContent: "space-between" }}>
            <span style={fieldLabelStyle}>Tides</span>
            <button
              type="button"
              data-edit-tides={dreamcaller.id}
              disabled={tideSaving}
              onClick={() => onEditTides(dreamcaller)}
              style={{
                border: "1px solid rgba(142, 219, 209, 0.5)",
                background: tideSaving ? "#1a2a2c" : "#16323a",
                color: "#bfeee6",
                borderRadius: "6px",
                padding: "4px 10px",
                fontWeight: 800,
                fontSize: "0.74rem",
                cursor: tideSaving ? "progress" : "pointer",
              }}
            >
              {tideSaving ? "Saving..." : "Edit tides"}
            </button>
          </div>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" }}
            data-dreamcaller-tide-summary={dreamcaller.id}
          >
            {starterTide !== undefined ? (
              <span
                title={`Starter: ${starterTide.name}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  border: `1px solid ${TIDE_DOT_COLOR[starterTide.color]}`,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "#eef4f1",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: TIDE_DOT_COLOR[starterTide.color],
                  }}
                />
                {tideLabel(starterTide.id)}
              </span>
            ) : null}
            <span style={{ fontSize: "0.72rem", color: "#9fb0ab", fontWeight: 600 }}>
              {dreamcaller.tidePool.facets.length} facets · {dreamcaller.tidePool.neutral.length}{" "}
              neutral
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
