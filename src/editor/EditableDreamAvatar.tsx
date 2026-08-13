import { assertLocalized } from "@trox/runtime";
import { useRef } from "react";
import type { CSSProperties } from "react";
import { DreamAvatarPortrait } from "../cumulus/components/hud/DreamAvatarPortrait";
import { RulesText } from "../cumulus/components/card/RulesText";
import EditableField from "./EditableField";
import { tideDotColor } from "./TidePoolModal";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";
import type {
  EditableDreamAvatarField,
  EditorDreamAvatarRecord,
  EditorTideOption,
} from "./dream-avatar-types";

export interface EditableDreamAvatarProps {
  dreamAvatar: EditorDreamAvatarRecord;
  tides: readonly EditorTideOption[];
  nameSaveEntry: EditableFieldSaveEntry | null;
  titleSaveEntry: EditableFieldSaveEntry | null;
  abilitySaveEntry: EditableFieldSaveEntry | null;
  essenceSaveEntry: EditableFieldSaveEntry | null;
  imageNumberSaveEntry: EditableFieldSaveEntry | null;
  tideSaving: boolean;
  onFieldBeginEdit: (
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
    value: EditableFieldValue,
  ) => void;
  onFieldDraftChange: (
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
    value: EditableFieldValue,
  ) => void;
  onFieldCancel: (
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
  ) => void;
  onFieldSave: (
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
    value: EditableFieldValue,
  ) => void;
  onFieldCommit: (
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
    value: EditableFieldValue,
  ) => void;
  onEditTides: (dreamAvatar: EditorDreamAvatarRecord) => void;
  onViewDetail: (dreamAvatar: EditorDreamAvatarRecord) => void;
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

export default function EditableDreamAvatar({
  dreamAvatar,
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
}: EditableDreamAvatarProps) {
  const tileRef = useRef<HTMLElement | null>(null);
  const tideById = new Map(tides.map((tide) => [tide.id, tide]));
  const starterTide =
    dreamAvatar.tidePool.starter !== null
      ? tideById.get(dreamAvatar.tidePool.starter)
      : undefined;

  function tideLabel(id: string): string {
    const tide = tideById.get(id);
    if (tide === undefined) {
      return id;
    }
    return tide.displayName !== "" ? tide.displayName : tide.id;
  }

  return (
    <article
      ref={tileRef}
      data-editor-dream-avatar-id={dreamAvatar.id}
      style={tileStyle}
    >
      <div style={{ padding: "10px 10px 0" }}>
        <button
          type="button"
          data-view-detail={dreamAvatar.id}
          title={`View ${dreamAvatar.name} details`}
          aria-label={`View ${dreamAvatar.name} details`}
          onClick={() => onViewDetail(dreamAvatar)}
          style={{
            display: "block",
            width: "100%",
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "zoom-in",
          }}
        >
          <DreamAvatarPortrait
            dreamAvatar={{
              imageNumber: dreamAvatar.imageNumber,
              name: assertLocalized(dreamAvatar.name),
              title: assertLocalized(dreamAvatar.title),
            }}
            variant="panel"
          />
        </button>
      </div>

      <div style={bodyStyle}>
        <EditableField
          field="name"
          value={dreamAvatar.name}
          saveEntry={nameSaveEntry}
          cardAnchorRef={tileRef}
          onBeginEdit={(value) => onFieldBeginEdit(dreamAvatar, "name", value)}
          onDraftChange={(value) =>
            onFieldDraftChange(dreamAvatar, "name", value)
          }
          onCancel={() => onFieldCancel(dreamAvatar, "name")}
          onSave={(value) => onFieldSave(dreamAvatar, "name", value)}
          onCommit={(value) => onFieldCommit(dreamAvatar, "name", value)}
        >
          <h2 style={nameStyle}>{dreamAvatar.name}</h2>
        </EditableField>

        <EditableField
          field="title"
          value={dreamAvatar.title}
          saveEntry={titleSaveEntry}
          cardAnchorRef={tileRef}
          onBeginEdit={(value) => onFieldBeginEdit(dreamAvatar, "title", value)}
          onDraftChange={(value) =>
            onFieldDraftChange(dreamAvatar, "title", value)
          }
          onCancel={() => onFieldCancel(dreamAvatar, "title")}
          onSave={(value) => onFieldSave(dreamAvatar, "title", value)}
          onCommit={(value) => onFieldCommit(dreamAvatar, "title", value)}
        >
          <p style={titleStyle}>{dreamAvatar.title}</p>
        </EditableField>

        <EditableField
          field="rendered-text"
          value={dreamAvatar["rendered-text"]}
          mode="multiline"
          saveEntry={abilitySaveEntry}
          cardAnchorRef={tileRef}
          onBeginEdit={(value) =>
            onFieldBeginEdit(dreamAvatar, "rendered-text", value)
          }
          onDraftChange={(value) =>
            onFieldDraftChange(dreamAvatar, "rendered-text", value)
          }
          onCancel={() => onFieldCancel(dreamAvatar, "rendered-text")}
          onSave={(value) => onFieldSave(dreamAvatar, "rendered-text", value)}
          onCommit={(value) =>
            onFieldCommit(dreamAvatar, "rendered-text", value)
          }
        >
          <div style={abilityStyle}>
            <RulesText
              text={assertLocalized(dreamAvatar["rendered-text"])}
              owner={{ kind: "dreamAvatar", id: dreamAvatar.id }}
            />
          </div>
        </EditableField>

        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>Starting Essence</span>
          <EditableField
            field="starting-essence"
            value={dreamAvatar.startingEssence}
            layout="inline"
            saveEntry={essenceSaveEntry}
            cardAnchorRef={tileRef}
            onBeginEdit={(value) =>
              onFieldBeginEdit(dreamAvatar, "starting-essence", value)
            }
            onDraftChange={(value) =>
              onFieldDraftChange(dreamAvatar, "starting-essence", value)
            }
            onCancel={() => onFieldCancel(dreamAvatar, "starting-essence")}
            onSave={(value) =>
              onFieldSave(dreamAvatar, "starting-essence", value)
            }
            onCommit={(value) =>
              onFieldCommit(dreamAvatar, "starting-essence", value)
            }
          >
            <span
              style={{
                color: "#fbbf24",
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {String(dreamAvatar.startingEssence)}
            </span>
          </EditableField>
        </div>

        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>Art (image #)</span>
          <EditableField
            field="image-number"
            value={dreamAvatar.imageNumber}
            layout="inline"
            saveEntry={imageNumberSaveEntry}
            cardAnchorRef={tileRef}
            onBeginEdit={(value) =>
              onFieldBeginEdit(dreamAvatar, "image-number", value)
            }
            onDraftChange={(value) =>
              onFieldDraftChange(dreamAvatar, "image-number", value)
            }
            onCancel={() => onFieldCancel(dreamAvatar, "image-number")}
            onSave={(value) => onFieldSave(dreamAvatar, "image-number", value)}
            onCommit={(value) =>
              onFieldCommit(dreamAvatar, "image-number", value)
            }
          >
            <span style={{ color: "#e7efec", fontWeight: 700 }}>
              {dreamAvatar.imageNumber === "" ? "—" : dreamAvatar.imageNumber}
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
              data-edit-tides={dreamAvatar.id}
              disabled={tideSaving}
              onClick={() => onEditTides(dreamAvatar)}
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
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "5px",
              alignItems: "center",
            }}
            data-dream-avatar-tide-summary={dreamAvatar.id}
          >
            {starterTide !== undefined ? (
              <span
                title={`Starter: ${starterTide.displayName}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  border: `1px solid ${tideDotColor(starterTide.resonance)}`,
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
                    background: tideDotColor(starterTide.resonance),
                  }}
                />
                {tideLabel(starterTide.id)}
              </span>
            ) : null}
            <span
              style={{ fontSize: "0.72rem", color: "#9fb0ab", fontWeight: 600 }}
            >
              {dreamAvatar.tidePool.facets.length} facets ·{" "}
              {dreamAvatar.tidePool.neutral.length} neutral
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
