import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  loadEditorDreamwell,
  saveEditorDreamwellField,
} from "./dreamwell-editor-api";
import EditableDreamwell from "./EditableDreamwell";
import FocusedCardEditor from "./FocusedCardEditor";
import type { FocusedSaveStatus } from "./FocusedCardEditor";
import {
  DreamwellCardView,
  DEFAULT_DREAMWELL_ART_CROP,
  type DreamwellCardViewData,
} from "../components/DreamwellCardView";
import {
  beginFieldEdit,
  cancelFieldEdit,
  completeFieldSave,
  EMPTY_EDITOR_SAVE_STATE,
  failFieldSave,
  fieldSaveEntry,
  rejectFieldEdit,
  rejectSubmittedFieldSave,
  startFieldSave,
  updateFieldDraft,
} from "./save-state";
import type { EditableFieldValue, EditableSaveState } from "./save-state";
import type { ArtCrop } from "../types/cards";
import {
  dreamwellPreviewCard,
  MAX_DREAMWELL_ORDER,
  type DreamwellDisplayState,
  type DreamwellEditorApiClient,
  type DreamwellSortField,
  type EditableDreamwellField,
  type EditorDreamwellRecord,
} from "./dreamwell-types";
import { editorTomlParam } from "./editor-api";

const DEFAULT_DREAMWELL_API_CLIENT: DreamwellEditorApiClient = {
  loadEditorDreamwell,
  saveEditorDreamwellField,
};

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded"; dreamwell: EditorDreamwellRecord[] }
  | { kind: "error"; message: string };

export interface DreamwellEditorAppProps {
  apiClient?: DreamwellEditorApiClient;
}

const DEFAULT_DISPLAY_STATE: DreamwellDisplayState = {
  searchText: "",
  artEditing: false,
  sort: "sourceOrder",
  dir: "asc",
  size: "large",
};

function errorMessageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load Dreamwell cards.";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isServerValidationError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "INVALID_EDIT"
  );
}

function confirmedFieldValue(
  record: EditorDreamwellRecord,
  field: EditableDreamwellField,
): EditableFieldValue {
  switch (field) {
    case "name":
      return record.name;
    case "rendered-text":
      return record["rendered-text"];
    case "energy-added":
      return record["energy-added"];
    case "order":
      return record.order;
  }
}

function validateFieldSave(
  field: EditableDreamwellField,
  value: EditableFieldValue,
): { ok: true; value: EditableFieldValue } | { ok: false; message: string } {
  if (field === "name") {
    const text = String(value).trim();
    return text.length === 0
      ? { ok: false, message: "Name cannot be blank." }
      : { ok: true, value: text };
  }

  if (field === "rendered-text") {
    return { ok: true, value: String(value) };
  }

  if (field === "energy-added") {
    const numeric = Number(String(value).trim());
    return Number.isInteger(numeric) && numeric >= 0
      ? { ok: true, value: numeric }
      : { ok: false, message: "Energy added must be a whole number of 0 or more." };
  }

  if (field === "order") {
    const numeric = Number(String(value).trim());
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= MAX_DREAMWELL_ORDER
      ? { ok: true, value: numeric }
      : {
          ok: false,
          message: `Tier must be a whole number from 0 to ${MAX_DREAMWELL_ORDER}.`,
        };
  }

  return { ok: false, message: "This field is not editable." };
}

/**
 * Overlay the focused editor's in-progress text drafts onto a Dreamwell card's
 * preview so the framed card tracks edits live. Energy / tier preview through
 * their own fields once committed; the art crop and image through live controls.
 */
function dreamwellPreviewWithDrafts(
  preview: DreamwellCardViewData,
  drafts: Record<string, EditableFieldValue>,
): DreamwellCardViewData {
  const next: DreamwellCardViewData = { ...preview };
  const name = drafts.name;
  if (typeof name === "string" && name.trim().length > 0) {
    next.name = name;
  }
  const renderedText = drafts["rendered-text"];
  if (typeof renderedText === "string") {
    next.renderedText = renderedText;
  }
  return next;
}

function sortValue(
  record: EditorDreamwellRecord,
  sort: DreamwellSortField,
): string | number {
  switch (sort) {
    case "sourceOrder":
      return record.sourceIndex;
    case "name":
      return record.name;
    case "energyAdded":
      return record["energy-added"];
    case "order":
      return record.order;
  }
}

function compareSortValues(left: string | number, right: string | number): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function filteredAndSorted(
  dreamwell: readonly EditorDreamwellRecord[],
  displayState: DreamwellDisplayState,
): EditorDreamwellRecord[] {
  const searchText = displayState.searchText.trim().toLowerCase();

  return dreamwell
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => {
      if (searchText === "") {
        return true;
      }
      const haystack = `${record.name} ${record["rendered-text"]}`.toLowerCase();
      return haystack.includes(searchText);
    })
    .sort((left, right) => {
      const direction = displayState.dir === "asc" ? 1 : -1;
      const comparison =
        compareSortValues(
          sortValue(left.record, displayState.sort),
          sortValue(right.record, displayState.sort),
        ) * direction;
      return comparison === 0 ? left.index - right.index : comparison;
    })
    .map(({ record }) => record);
}

function anyFieldEditing(saveState: EditableSaveState): boolean {
  return Object.values(saveState.fields).some(
    (entry) => entry.status === "editing" || entry.status === "saving",
  );
}

function reorderToFrozenOrder(
  dreamwell: readonly EditorDreamwellRecord[],
  frozenOrder: readonly string[],
): EditorDreamwellRecord[] {
  const rank = new Map(frozenOrder.map((id, index) => [id, index]));
  const fallback = frozenOrder.length;
  return dreamwell
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const leftRank = rank.get(left.record.id) ?? fallback;
      const rightRank = rank.get(right.record.id) ?? fallback;
      return leftRank === rightRank
        ? left.index - right.index
        : leftRank - rightRank;
    })
    .map(({ record }) => record);
}

const CARD_WIDTH: Record<DreamwellDisplayState["size"], string> = {
  small: "240px",
  medium: "320px",
  large: "420px",
};

export default function DreamwellEditorApp({
  apiClient = DEFAULT_DREAMWELL_API_CLIENT,
}: DreamwellEditorAppProps) {
  const [displayState, setDisplayState] =
    useState<DreamwellDisplayState>(DEFAULT_DISPLAY_STATE);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<EditableSaveState>(
    EMPTY_EDITOR_SAVE_STATE,
  );
  const saveStateRef = useRef(saveState);

  const [artEditorId, setArtEditorId] = useState<string | null>(null);
  const [artSaveStatus, setArtSaveStatus] = useState<FocusedSaveStatus>("idle");
  const [artSaveError, setArtSaveError] = useState<string | null>(null);
  const [cropSaveStatus, setCropSaveStatus] = useState<FocusedSaveStatus>("idle");
  const [cropSaveError, setCropSaveError] = useState<string | null>(null);

  const activeTomlLabel = useMemo(() => {
    const param = editorTomlParam();
    const path = param ?? "dreamwell.toml";
    const fileName = path.split(/[\\/]/u).pop();
    return fileName !== undefined && fileName !== "" ? fileName : path;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoadStatus({ kind: "loading" });
      try {
        const dreamwell = await apiClient.loadEditorDreamwell(controller.signal);
        if (!cancelled) {
          setLoadStatus({ kind: "loaded", dreamwell });
        }
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        if (!cancelled) {
          setLoadStatus({ kind: "error", message: errorMessageFor(error) });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiClient, loadAttempt]);

  const loadedDreamwell =
    loadStatus.kind === "loaded" ? loadStatus.dreamwell : [];
  const sortedVisible = useMemo(
    () => filteredAndSorted(loadedDreamwell, displayState),
    [loadedDreamwell, displayState],
  );

  // Freeze the grid order while an inline edit is active so a sort key the user
  // is editing (name, energy, order) does not reshuffle the card mid-edit.
  const editing = anyFieldEditing(saveState);
  const frozenOrderRef = useRef<string[]>([]);
  if (!editing) {
    frozenOrderRef.current = sortedVisible.map((record) => record.id);
  }
  const visible = editing
    ? reorderToFrozenOrder(sortedVisible, frozenOrderRef.current)
    : sortedVisible;

  const artEditorRecord =
    artEditorId === null
      ? null
      : (loadedDreamwell.find((record) => record.id === artEditorId) ?? null);

  function setEditorSaveState(
    updater: (current: EditableSaveState) => EditableSaveState,
  ) {
    const next = updater(saveStateRef.current);
    saveStateRef.current = next;
    setSaveState(next);
  }

  function handleFieldBeginEdit(
    record: EditorDreamwellRecord,
    field: EditableDreamwellField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) => {
      let next = current;
      for (const entry of Object.values(current.fields)) {
        if (
          entry.status === "editing" &&
          !(entry.cardId === record.id && entry.field === field)
        ) {
          next = cancelFieldEdit(
            next,
            { cardId: entry.cardId, field: entry.field },
            entry.confirmedValue,
          );
        }
      }
      return beginFieldEdit(next, { cardId: record.id, field }, value);
    });
  }

  function handleFieldDraftChange(
    record: EditorDreamwellRecord,
    field: EditableDreamwellField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) =>
      updateFieldDraft(
        current,
        { cardId: record.id, field },
        value,
        confirmedFieldValue(record, field),
      ),
    );
  }

  function handleFieldCancel(
    record: EditorDreamwellRecord,
    field: EditableDreamwellField,
  ) {
    setEditorSaveState((current) =>
      cancelFieldEdit(
        current,
        { cardId: record.id, field },
        confirmedFieldValue(record, field),
      ),
    );
  }

  function handleFieldCommit(
    record: EditorDreamwellRecord,
    field: EditableDreamwellField,
    value: EditableFieldValue,
  ) {
    const validation = validateFieldSave(field, value);
    if (
      !validation.ok ||
      String(validation.value) === String(confirmedFieldValue(record, field))
    ) {
      handleFieldCancel(record, field);
      return;
    }
    handleFieldSave(record, field, value);
  }

  function replaceConfirmed(next: EditorDreamwellRecord) {
    setLoadStatus((current) => {
      if (current.kind !== "loaded") {
        return current;
      }
      return {
        kind: "loaded",
        dreamwell: current.dreamwell.map((record) =>
          record.id === next.id ? next : record,
        ),
      };
    });
  }

  function handleFieldSave(
    record: EditorDreamwellRecord,
    field: EditableDreamwellField,
    value: EditableFieldValue,
  ) {
    const target = { cardId: record.id, field };
    const validation = validateFieldSave(field, value);

    if (!validation.ok) {
      setEditorSaveState((current) =>
        rejectFieldEdit(
          current,
          target,
          value,
          confirmedFieldValue(record, field),
          validation.message,
        ),
      );
      return;
    }

    const serverValue = validation.value;
    let clientRevision = 0;
    setEditorSaveState((current) => {
      const result = startFieldSave(
        current,
        target,
        serverValue,
        confirmedFieldValue(record, field),
      );
      clientRevision = result.clientRevision;
      return result.state;
    });

    void apiClient
      .saveEditorDreamwellField({
        id: record.id,
        field,
        value: serverValue,
        clientRevision,
      })
      .then((response) => {
        const responseRevision = response.clientRevision ?? clientRevision;
        const currentEntry = fieldSaveEntry(saveStateRef.current, target);
        if (
          currentEntry === null ||
          responseRevision < currentEntry.submittedRevision
        ) {
          return;
        }
        setEditorSaveState((current) =>
          completeFieldSave(
            current,
            target,
            responseRevision,
            confirmedFieldValue(response.dreamwell, field),
          ),
        );
        replaceConfirmed(response.dreamwell);
      })
      .catch((error: unknown) => {
        const message = errorMessageFor(error);
        const currentEntry = fieldSaveEntry(saveStateRef.current, target);
        if (
          currentEntry !== null &&
          clientRevision >= currentEntry.submittedRevision
        ) {
          setEditorSaveState((current) => {
            if (isServerValidationError(error)) {
              return rejectSubmittedFieldSave(
                current,
                target,
                clientRevision,
                confirmedFieldValue(record, field),
                message,
              );
            }
            return failFieldSave(
              current,
              target,
              clientRevision,
              confirmedFieldValue(record, field),
              message,
            );
          });
        }
      });
  }

  function openArtEditor(record: EditorDreamwellRecord) {
    setArtEditorId(record.id);
    setArtSaveStatus("idle");
    setArtSaveError(null);
    setCropSaveStatus("idle");
    setCropSaveError(null);
  }

  function handleSaveArt(record: EditorDreamwellRecord, art: ArtCrop) {
    setCropSaveStatus("saving");
    setCropSaveError(null);
    void apiClient
      .saveEditorDreamwellField({
        id: record.id,
        field: "art",
        value: art,
      })
      .then((response) => {
        replaceConfirmed(response.dreamwell);
        setCropSaveStatus("saved");
      })
      .catch((error: unknown) => {
        setCropSaveStatus("error");
        setCropSaveError(errorMessageFor(error));
      });
  }

  function handleSaveImageNumber(record: EditorDreamwellRecord, imageNumber: number) {
    setArtSaveStatus("saving");
    setArtSaveError(null);
    void apiClient
      .saveEditorDreamwellField({
        id: record.id,
        field: "image-number",
        value: imageNumber,
      })
      .then((response) => {
        replaceConfirmed(response.dreamwell);
        setArtSaveStatus("saved");
      })
      .catch((error: unknown) => {
        setArtSaveStatus("error");
        setArtSaveError(errorMessageFor(error));
      });
  }

  return (
    <main
      aria-busy={loadStatus.kind === "loading"}
      className="dreamwell-editor-shell"
      data-editor-search={displayState.searchText}
      data-editor-sort={displayState.sort}
      data-editor-dir={displayState.dir}
      data-editor-size={displayState.size}
      data-editor-art-editing={String(displayState.artEditing)}
      style={{
        height: "100dvh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: "16px 20px",
        background: "#101417",
        color: "#f7f1df",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flex: "0 0 auto",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.1 }}>
          Dreamwell Editor
        </h1>
        <span aria-hidden="true" style={{ color: "rgba(247, 241, 223, 0.35)" }}>
          -
        </span>
        <span style={{ color: "#8edbd1", fontSize: "0.82rem", fontWeight: 600 }}>
          {loadStatus.kind === "loaded" ? activeTomlLabel : "Loading..."}
        </span>
        <span style={{ color: "#6f7a76", fontSize: "0.76rem", marginLeft: "6px" }}>
          Double-click the name, rules, energy orb, or tier to edit.
        </span>
      </header>

      <section
        style={{
          display: "flex",
          flex: "1 1 auto",
          flexDirection: "column",
          minHeight: 0,
          paddingTop: "12px",
          gap: "12px",
        }}
      >
        {loadStatus.kind === "loading" ? (
          <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
            Loading Dreamwell cards...
          </p>
        ) : null}

        {loadStatus.kind === "loaded" ? (
          <>
            <DreamwellEditorToolbar
              displayState={displayState}
              visibleCount={visible.length}
              totalCount={loadStatus.dreamwell.length}
              onChange={setDisplayState}
            />
            {visible.length === 0 ? (
              <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
                No Dreamwell cards match the current search.
              </p>
            ) : (
              <div
                data-dreamwell-grid="true"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: displayState.size === "large" ? "22px" : "16px",
                  alignContent: "flex-start",
                  overflowY: "auto",
                  minHeight: 0,
                  paddingBottom: "24px",
                }}
              >
                {visible.map((record) => {
                  const entryFor = (field: EditableDreamwellField) =>
                    fieldSaveEntry(saveState, { cardId: record.id, field });
                  return (
                    <div
                      key={record.id}
                      style={{
                        width: CARD_WIDTH[displayState.size],
                        flex: "0 0 auto",
                      }}
                    >
                      <EditableDreamwell
                        record={record}
                        size={displayState.size}
                        nameSaveEntry={entryFor("name")}
                        rulesTextSaveEntry={entryFor("rendered-text")}
                        energySaveEntry={entryFor("energy-added")}
                        orderSaveEntry={entryFor("order")}
                        artEditing={displayState.artEditing}
                        onOpenArtEditor={openArtEditor}
                        onFieldBeginEdit={handleFieldBeginEdit}
                        onFieldDraftChange={handleFieldDraftChange}
                        onFieldCancel={handleFieldCancel}
                        onFieldSave={handleFieldSave}
                        onFieldCommit={handleFieldCommit}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null}

        {loadStatus.kind === "error" ? (
          <div role="alert" style={{ maxWidth: "560px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>
              Unable to load Dreamwell cards
            </h2>
            <p style={{ margin: "0 0 18px", color: "#f0c6bd" }}>{loadStatus.message}</p>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              style={{
                border: "1px solid rgba(247, 241, 223, 0.35)",
                background: "#1f635d",
                color: "#fff7e0",
                borderRadius: "6px",
                padding: "10px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
      </section>

      {artEditorRecord !== null ? (
        <FocusedCardEditor
          title={artEditorRecord.name}
          fields={[
            {
              field: "name",
              label: "Name",
              kind: "text",
              value: artEditorRecord.name,
              saveEntry: fieldSaveEntry(saveState, {
                cardId: artEditorRecord.id,
                field: "name",
              }),
              onCommit: (value) =>
                handleFieldCommit(artEditorRecord, "name", value),
            },
            {
              field: "energy-added",
              label: "Energy added",
              kind: "text",
              value: artEditorRecord["energy-added"],
              saveEntry: fieldSaveEntry(saveState, {
                cardId: artEditorRecord.id,
                field: "energy-added",
              }),
              onCommit: (value) =>
                handleFieldCommit(artEditorRecord, "energy-added", value),
            },
            {
              field: "order",
              label: "Tier",
              kind: "select",
              options: Array.from(
                { length: MAX_DREAMWELL_ORDER + 1 },
                (_unused, tier) => ({
                  value: String(tier),
                  label: String(tier),
                }),
              ),
              value: artEditorRecord.order,
              saveEntry: fieldSaveEntry(saveState, {
                cardId: artEditorRecord.id,
                field: "order",
              }),
              onCommit: (value) =>
                handleFieldCommit(artEditorRecord, "order", value),
            },
            {
              field: "rendered-text",
              label: "Rules text",
              kind: "multiline",
              value: artEditorRecord["rendered-text"],
              saveEntry: fieldSaveEntry(saveState, {
                cardId: artEditorRecord.id,
                field: "rendered-text",
              }),
              onCommit: (value) =>
                handleFieldCommit(artEditorRecord, "rendered-text", value),
            },
          ]}
          art={{
            model: { kind: "dreamwell" },
            art: artEditorRecord.art ?? DEFAULT_DREAMWELL_ART_CROP,
            imageNumber: artEditorRecord["image-number"],
            onSaveArt: (art) => handleSaveArt(artEditorRecord, art),
            onSaveImageNumber: (imageNumber) =>
              handleSaveImageNumber(artEditorRecord, imageNumber),
            artStatus: cropSaveStatus,
            artError: cropSaveError,
            imageStatus: artSaveStatus,
            imageError: artSaveError,
          }}
          renderPreview={(live) => (
            <DreamwellCardView
              card={{
                ...dreamwellPreviewWithDrafts(
                  dreamwellPreviewCard(artEditorRecord),
                  live.fieldDrafts,
                ),
                art: live.art,
                imageNumber: live.imageNumber,
              }}
            />
          )}
          onClose={() => setArtEditorId(null)}
        />
      ) : null}
    </main>
  );
}

interface DreamwellEditorToolbarProps {
  displayState: DreamwellDisplayState;
  visibleCount: number;
  totalCount: number;
  onChange: (next: DreamwellDisplayState) => void;
}

function DreamwellEditorToolbar({
  displayState,
  visibleCount,
  totalCount,
  onChange,
}: DreamwellEditorToolbarProps) {
  const controlStyle: CSSProperties = {
    background: "#1a2024",
    color: "#f7f1df",
    border: "1px solid rgba(247, 241, 223, 0.25)",
    borderRadius: "6px",
    padding: "6px 8px",
    fontSize: "0.82rem",
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px",
        flex: "0 0 auto",
      }}
    >
      <input
        type="search"
        placeholder="Search Dreamwell cards..."
        value={displayState.searchText}
        onChange={(event) =>
          onChange({ ...displayState, searchText: event.target.value })
        }
        style={{ ...controlStyle, minWidth: "200px" }}
      />
      <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "0.78rem", color: "#c9d3cf" }}>Sort</span>
        <select
          value={displayState.sort}
          onChange={(event) =>
            onChange({
              ...displayState,
              sort: event.target.value as DreamwellSortField,
            })
          }
          style={controlStyle}
        >
          <option value="sourceOrder">Catalog order</option>
          <option value="name">Name</option>
          <option value="energyAdded">Energy added</option>
          <option value="order">Deck order</option>
        </select>
      </label>
      <button
        type="button"
        onClick={() =>
          onChange({
            ...displayState,
            dir: displayState.dir === "asc" ? "desc" : "asc",
          })
        }
        style={{ ...controlStyle, cursor: "pointer" }}
      >
        {displayState.dir === "asc" ? "Asc ↑" : "Desc ↓"}
      </button>
      <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "0.78rem", color: "#c9d3cf" }}>Size</span>
        <select
          value={displayState.size}
          onChange={(event) =>
            onChange({
              ...displayState,
              size: event.target.value as DreamwellDisplayState["size"],
            })
          }
          style={controlStyle}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </label>
      <button
        type="button"
        aria-pressed={displayState.artEditing}
        onClick={() =>
          onChange({ ...displayState, artEditing: !displayState.artEditing })
        }
        style={{
          ...controlStyle,
          cursor: "pointer",
          background: displayState.artEditing ? "#1f635d" : controlStyle.background,
          fontWeight: 700,
        }}
      >
        {displayState.artEditing ? "Edit mode: on" : "Edit mode: off"}
      </button>
      <span style={{ fontSize: "0.78rem", color: "#8a948f", marginLeft: "auto" }}>
        {visibleCount} / {totalCount}
      </span>
    </div>
  );
}
