import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import EditableField from "./EditableField";
import {
  dreamscapeIconUrl,
  dreamscapeSceneUrl,
  guidePortraitUrl,
} from "../cumulus/components/atlas/atlas-display";
import { siteTypeIcon } from "../atlas/atlas-generator";
import type { SiteType } from "../types/quest";
import DreamscapeResidents, {
  type ResidentAssignmentStatus,
} from "./DreamscapeResidents";
import type { EditableFieldSaveEntry, EditableFieldValue } from "./save-state";
import type {
  AffiliationOption,
  DreamAvatarAssignmentAction,
  DreamAvatarOption,
  DreamscapeCardSize,
  EditableDreamscapeField,
  EditorDreamscapeRecord,
  GuideOption,
} from "./dreamscape-types";

export interface EditableDreamscapeProps {
  record: EditorDreamscapeRecord;
  size: DreamscapeCardSize;
  guides: GuideOption[];
  affiliations: AffiliationOption[];
  siteTypes: string[];
  dreamAvatars: DreamAvatarOption[];
  regionNameByDreamAvatar: Map<string, string>;
  residentStatus: ResidentAssignmentStatus;
  onAssignDreamAvatar: (
    record: EditorDreamscapeRecord,
    action: DreamAvatarAssignmentAction,
    params: { inId?: string; outId?: string },
  ) => void;
  saveEntryFor: (field: EditableDreamscapeField) => EditableFieldSaveEntry | null;
  onFieldBeginEdit: (
    record: EditorDreamscapeRecord,
    field: EditableDreamscapeField,
    value: EditableFieldValue,
  ) => void;
  onFieldDraftChange: (
    record: EditorDreamscapeRecord,
    field: EditableDreamscapeField,
    value: EditableFieldValue,
  ) => void;
  onFieldCancel: (record: EditorDreamscapeRecord, field: EditableDreamscapeField) => void;
  onFieldSave: (
    record: EditorDreamscapeRecord,
    field: EditableDreamscapeField,
    value: EditableFieldValue,
  ) => void;
  onFieldCommit: (
    record: EditorDreamscapeRecord,
    field: EditableDreamscapeField,
    value: EditableFieldValue,
  ) => void;
}

const SCENE_HEIGHT: Record<DreamscapeCardSize, number> = {
  small: 120,
  medium: 160,
  large: 210,
};

const NAME_FONT: Record<DreamscapeCardSize, string> = {
  small: "1.0rem",
  medium: "1.18rem",
  large: "1.4rem",
};

const selectStyle = {
  boxSizing: "border-box",
  width: "100%",
  border: "1px solid rgba(142, 219, 209, 0.45)",
  borderRadius: "6px",
  background: "#0b1517",
  color: "#fff7e0",
  font: "inherit",
  fontWeight: 600,
  padding: "5px 8px",
  cursor: "pointer",
} satisfies CSSProperties;

function statusLabel(entry: EditableFieldSaveEntry | null): {
  text: string;
  color: string;
} | null {
  if (entry === null) {
    return null;
  }
  if (entry.status === "saving") {
    return { text: "Saving...", color: "#8edbd1" };
  }
  if (entry.status === "saved") {
    return { text: "Saved", color: "#9af2dd" };
  }
  if (entry.status === "error") {
    return { text: entry.message ?? "Save failed", color: "#f7c9bd" };
  }
  if (entry.status === "editing" && entry.message !== null && entry.message !== "") {
    return { text: entry.message, color: "#f7c9bd" };
  }
  return null;
}

/** A labelled dropdown for one of the catalog-referencing dreamscape fields. */
function MetaSelect({
  label,
  value,
  options,
  placeholder,
  saveEntry,
  leading,
  onChange,
}: {
  label: string;
  value: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder: string;
  saveEntry: EditableFieldSaveEntry | null;
  leading?: ReactNode;
  onChange: (next: string) => void;
}) {
  const status = statusLabel(saveEntry);
  const missing = value === null || value === "";
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "8px",
          fontSize: "0.66rem",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "#7f8d88",
          fontWeight: 700,
          marginBottom: "3px",
        }}
      >
        <span>{label}</span>
        {status !== null ? (
          <span style={{ color: status.color, textTransform: "none", letterSpacing: 0 }}>
            {status.text}
          </span>
        ) : null}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {leading}
        <select
          aria-label={label}
          value={missing ? "" : value}
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (next !== "" && next !== value) {
              onChange(next);
            }
          }}
          style={selectStyle}
        >
          {missing ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

/**
 * One dreamscape in the editor grid. The scene art and circular node icon are
 * the same assets the Dream Atlas renders, resolved from the dreamscape id. The
 * name, aesthetic, and site-icon reference are inline {@link EditableField}
 * editors (double-click to edit); the signature site, resident Dream Guide, and
 * affiliation are catalog dropdowns that save the moment a new value is picked.
 */
export default function EditableDreamscape({
  record,
  size,
  guides,
  affiliations,
  siteTypes,
  dreamAvatars,
  regionNameByDreamAvatar,
  residentStatus,
  onAssignDreamAvatar,
  saveEntryFor,
  onFieldBeginEdit,
  onFieldDraftChange,
  onFieldCancel,
  onFieldSave,
  onFieldCommit,
}: EditableDreamscapeProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const [guideFailed, setGuideFailed] = useState(false);

  const nameEntry = saveEntryFor("name");
  const aestheticEntry = saveEntryFor("aesthetic");
  const siteIconEntry = saveEntryFor("site-icon");

  const visibleName = String(nameEntry?.draftValue ?? record.name);
  const visibleAesthetic = String(aestheticEntry?.draftValue ?? record.aesthetic);
  const visibleSiteIcon = String(siteIconEntry?.draftValue ?? record["site-icon"]);

  const guideId = record["guide-id"];
  const guide = guideId === null ? null : guides.find((entry) => entry.id === guideId) ?? null;
  const signatureSite = record["signature-site"];

  const fieldProps = (
    field: EditableDreamscapeField,
    value: EditableFieldValue,
    saveEntry: EditableFieldSaveEntry | null,
  ) => ({
    field,
    value,
    saveEntry,
    cardAnchorRef: cardRef,
    onBeginEdit: (next: EditableFieldValue) => onFieldBeginEdit(record, field, next),
    onDraftChange: (next: EditableFieldValue) => onFieldDraftChange(record, field, next),
    onCancel: () => onFieldCancel(record, field),
    onSave: (next: EditableFieldValue) => onFieldSave(record, field, next),
    onCommit: (next: EditableFieldValue) => onFieldCommit(record, field, next),
  });

  return (
    <article
      ref={cardRef}
      aria-label={visibleName}
      data-editor-dreamscape-id={record.id}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        borderRadius: "14px",
        overflow: "hidden",
        border: "1px solid rgba(142, 219, 209, 0.2)",
        background: "#131b1e",
        boxShadow: "0 6px 18px rgba(0, 0, 0, 0.35)",
      }}
    >
      <div
        style={{
          position: "relative",
          height: `${String(SCENE_HEIGHT[size])}px`,
          background:
            "linear-gradient(135deg, #1d3a3a 0%, #243042 55%, #2c2540 100%)",
        }}
      >
        {!sceneFailed ? (
          <img
            src={dreamscapeSceneUrl(record.id)}
            alt={`${visibleName} scene art`}
            onError={() => setSceneFailed(true)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px",
              textAlign: "center",
              fontSize: "0.78rem",
              fontStyle: "italic",
              color: "rgba(231, 240, 236, 0.72)",
            }}
          >
            {visibleAesthetic}
          </span>
        )}

        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(8,12,14,0) 45%, rgba(8,12,14,0.82) 100%)",
          }}
        />

        {record.isStarter ? (
          <span
            style={{
              position: "absolute",
              top: "8px",
              right: "8px",
              padding: "3px 9px",
              borderRadius: "999px",
              fontSize: "0.64rem",
              fontWeight: 800,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "#0b1517",
              background: "#f4d58d",
            }}
          >
            <i className="fa-solid fa-flag" aria-hidden="true" /> Starter
          </span>
        ) : null}

        {!iconFailed ? (
          <img
            src={dreamscapeIconUrl(record.id)}
            alt=""
            aria-hidden="true"
            onError={() => setIconFailed(true)}
            style={{
              position: "absolute",
              left: "10px",
              bottom: "10px",
              width: size === "small" ? "40px" : "52px",
              height: size === "small" ? "40px" : "52px",
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid rgba(244, 213, 141, 0.85)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
            }}
          />
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          padding: "12px 14px 14px",
        }}
      >
        <EditableField {...fieldProps("name", record.name, nameEntry)}>
          <h2
            title="Double-click to rename"
            style={{
              margin: 0,
              fontSize: NAME_FONT[size],
              fontWeight: 800,
              lineHeight: 1.15,
              color: "#fff7e0",
              cursor: "text",
            }}
          >
            {visibleName}
          </h2>
        </EditableField>

        <EditableField
          {...fieldProps("aesthetic", record.aesthetic, aestheticEntry)}
          mode="multiline"
        >
          <p
            title="Double-click to edit the aesthetic"
            style={{
              margin: 0,
              fontSize: "0.82rem",
              fontStyle: "italic",
              lineHeight: 1.35,
              color: "#b8c4bf",
              cursor: "text",
            }}
          >
            {visibleAesthetic}
          </p>
        </EditableField>

        <MetaSelect
          label="Signature Site"
          value={signatureSite}
          placeholder="Select a site type"
          options={siteTypes.map((siteType) => ({ value: siteType, label: siteType }))}
          saveEntry={saveEntryFor("signature-site")}
          leading={
            signatureSite !== "" ? (
              <i
                className={siteTypeIcon(signatureSite as SiteType)}
                aria-hidden="true"
                style={{ fontSize: "1.1rem", color: "#8edbd1", width: "1.2rem" }}
              />
            ) : null
          }
          onChange={(next) => onFieldSave(record, "signature-site", next)}
        />

        <MetaSelect
          label="Dream Guide"
          value={guideId}
          placeholder="No resident guide"
          options={guides.map((option) => ({ value: option.id, label: option.name }))}
          saveEntry={saveEntryFor("guide-id")}
          leading={
            guide !== null && !guideFailed ? (
              <img
                src={guidePortraitUrl(guide.id)}
                alt=""
                aria-hidden="true"
                onError={() => setGuideFailed(true)}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "1px solid rgba(142, 219, 209, 0.5)",
                  flex: "0 0 auto",
                }}
              />
            ) : null
          }
          onChange={(next) => onFieldSave(record, "guide-id", next)}
        />

        <MetaSelect
          label="Affiliation"
          value={record["affiliation-id"]}
          placeholder="No affiliation"
          options={affiliations.map((option) => ({ value: option.id, label: option.name }))}
          saveEntry={saveEntryFor("affiliation-id")}
          onChange={(next) => onFieldSave(record, "affiliation-id", next)}
        />

        <div>
          <span
            style={{
              display: "block",
              fontSize: "0.66rem",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#7f8d88",
              fontWeight: 700,
              marginBottom: "3px",
            }}
          >
            Site Icon
          </span>
          <EditableField {...fieldProps("site-icon", record["site-icon"], siteIconEntry)}>
            <code
              title="Double-click to edit the Atlas marker icon reference"
              style={{
                display: "inline-block",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.76rem",
                color: "#c9d3cf",
                background: "#0b1517",
                border: "1px solid rgba(142, 219, 209, 0.2)",
                borderRadius: "5px",
                padding: "4px 7px",
                cursor: "text",
              }}
            >
              {visibleSiteIcon}
            </code>
          </EditableField>
        </div>

        {record.isStarter && record.fixedSites.length > 0 ? (
          <div>
            <span
              style={{
                display: "block",
                fontSize: "0.66rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#7f8d88",
                fontWeight: 700,
                marginBottom: "4px",
              }}
            >
              Fixed Sites
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {record.fixedSites.map((site, index) => (
                <span
                  key={`${site}-${String(index)}`}
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "#d9e1dd",
                    background: "#1d2a2e",
                    border: "1px solid rgba(142, 219, 209, 0.2)",
                    borderRadius: "999px",
                    padding: "2px 8px",
                  }}
                >
                  {site}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {!record.isStarter ? (
          <DreamscapeResidents
            record={record}
            size={size}
            dreamAvatars={dreamAvatars}
            regionNameByDreamAvatar={regionNameByDreamAvatar}
            status={residentStatus}
            onAssign={(action, params) => onAssignDreamAvatar(record, action, params)}
          />
        ) : null}
      </div>
    </article>
  );
}
