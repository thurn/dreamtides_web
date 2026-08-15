import { assertLocalized } from "@trox/runtime";
import { useRef } from "react";
import type { CSSProperties } from "react";
import { AvatarPortrait } from "../cumulus/components/hud/AvatarPortrait";
import { RulesText } from "../cumulus/components/card/RulesText";
import EditableField from "./EditableField";
import { tideDotColor } from "./TidePoolModal";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";
import type {
  EditableAvatarField,
  EditorAvatarRecord,
  EditorTideOption,
} from "./avatar-types";
import type { TideId } from "../types/identifiers";

export interface EditableAvatarProps {
  avatar: EditorAvatarRecord;
  tides: readonly EditorTideOption[];
  nameSaveEntry: EditableFieldSaveEntry | null;
  titleSaveEntry: EditableFieldSaveEntry | null;
  abilitySaveEntry: EditableFieldSaveEntry | null;
  essenceSaveEntry: EditableFieldSaveEntry | null;
  imageNumberSaveEntry: EditableFieldSaveEntry | null;
  tideSaving: boolean;
  onFieldBeginEdit: (
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
    value: EditableFieldValue,
  ) => void;
  onFieldDraftChange: (
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
    value: EditableFieldValue,
  ) => void;
  onFieldCancel: (
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
  ) => void;
  onFieldSave: (
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
    value: EditableFieldValue,
  ) => void;
  onFieldCommit: (
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
    value: EditableFieldValue,
  ) => void;
  onEditTides: (avatar: EditorAvatarRecord) => void;
  onViewDetail: (avatar: EditorAvatarRecord) => void;
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

export default function EditableAvatar({
  avatar,
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
}: EditableAvatarProps) {
  const tileRef = useRef<HTMLElement | null>(null);
  const tideById = new Map(tides.map((tide) => [tide.id, tide]));
  const starterTide =
    avatar.tidePool.starter !== null
      ? tideById.get(avatar.tidePool.starter)
      : undefined;

  function tideLabel(id: TideId): string {
    const tide = tideById.get(id);
    if (tide === undefined) {
      return id;
    }
    return tide.displayName !== "" ? tide.displayName : tide.id;
  }

  return (
    <article
      ref={tileRef}
      data-editor-avatar-id={avatar.id}
      style={tileStyle}
    >
      <div style={{ padding: "10px 10px 0" }}>
        <button
          type="button"
          data-view-detail={avatar.id}
          title={`View ${avatar.name} details`}
          aria-label={`View ${avatar.name} details`}
          onClick={() => onViewDetail(avatar)}
          style={{
            display: "block",
            width: "100%",
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "zoom-in",
          }}
        >
          <AvatarPortrait
            avatar={{
              imageNumber: avatar.imageNumber,
              name: assertLocalized(avatar.name),
              title: assertLocalized(avatar.title),
            }}
            variant="panel"
          />
        </button>
      </div>

      <div style={bodyStyle}>
        <EditableField
          field="name"
          value={avatar.name}
          saveEntry={nameSaveEntry}
          cardAnchorRef={tileRef}
          onBeginEdit={(value) => onFieldBeginEdit(avatar, "name", value)}
          onDraftChange={(value) =>
            onFieldDraftChange(avatar, "name", value)
          }
          onCancel={() => onFieldCancel(avatar, "name")}
          onSave={(value) => onFieldSave(avatar, "name", value)}
          onCommit={(value) => onFieldCommit(avatar, "name", value)}
        >
          <h2 style={nameStyle}>{avatar.name}</h2>
        </EditableField>

        <EditableField
          field="title"
          value={avatar.title}
          saveEntry={titleSaveEntry}
          cardAnchorRef={tileRef}
          onBeginEdit={(value) => onFieldBeginEdit(avatar, "title", value)}
          onDraftChange={(value) =>
            onFieldDraftChange(avatar, "title", value)
          }
          onCancel={() => onFieldCancel(avatar, "title")}
          onSave={(value) => onFieldSave(avatar, "title", value)}
          onCommit={(value) => onFieldCommit(avatar, "title", value)}
        >
          <p style={titleStyle}>{avatar.title}</p>
        </EditableField>

        <EditableField
          field="rendered-text"
          value={avatar["rendered-text"]}
          mode="multiline"
          saveEntry={abilitySaveEntry}
          cardAnchorRef={tileRef}
          onBeginEdit={(value) =>
            onFieldBeginEdit(avatar, "rendered-text", value)
          }
          onDraftChange={(value) =>
            onFieldDraftChange(avatar, "rendered-text", value)
          }
          onCancel={() => onFieldCancel(avatar, "rendered-text")}
          onSave={(value) => onFieldSave(avatar, "rendered-text", value)}
          onCommit={(value) =>
            onFieldCommit(avatar, "rendered-text", value)
          }
        >
          <div style={abilityStyle}>
            <RulesText
              text={assertLocalized(avatar["rendered-text"])}
              owner={{ kind: "avatar", id: avatar.id }}
            />
          </div>
        </EditableField>

        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>Starting Essence</span>
          <EditableField
            field="starting-essence"
            value={avatar.startingEssence}
            layout="inline"
            saveEntry={essenceSaveEntry}
            cardAnchorRef={tileRef}
            onBeginEdit={(value) =>
              onFieldBeginEdit(avatar, "starting-essence", value)
            }
            onDraftChange={(value) =>
              onFieldDraftChange(avatar, "starting-essence", value)
            }
            onCancel={() => onFieldCancel(avatar, "starting-essence")}
            onSave={(value) =>
              onFieldSave(avatar, "starting-essence", value)
            }
            onCommit={(value) =>
              onFieldCommit(avatar, "starting-essence", value)
            }
          >
            <span
              style={{
                color: "#fbbf24",
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {String(avatar.startingEssence)}
            </span>
          </EditableField>
        </div>

        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>Art (image #)</span>
          <EditableField
            field="image-number"
            value={avatar.imageNumber}
            layout="inline"
            saveEntry={imageNumberSaveEntry}
            cardAnchorRef={tileRef}
            onBeginEdit={(value) =>
              onFieldBeginEdit(avatar, "image-number", value)
            }
            onDraftChange={(value) =>
              onFieldDraftChange(avatar, "image-number", value)
            }
            onCancel={() => onFieldCancel(avatar, "image-number")}
            onSave={(value) => onFieldSave(avatar, "image-number", value)}
            onCommit={(value) =>
              onFieldCommit(avatar, "image-number", value)
            }
          >
            <span style={{ color: "#e7efec", fontWeight: 700 }}>
              {avatar.imageNumber === "" ? "—" : avatar.imageNumber}
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
              data-edit-tides={avatar.id}
              disabled={tideSaving}
              onClick={() => onEditTides(avatar)}
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
            data-avatar-tide-summary={avatar.id}
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
              {avatar.tidePool.facets.length} facets ·{" "}
              {avatar.tidePool.neutral.length} neutral
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
