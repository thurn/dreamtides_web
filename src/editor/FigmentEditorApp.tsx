import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  loadEditorFigments,
  saveEditorFigmentArt,
  saveEditorFigmentField,
  saveEditorFigmentImageNumber,
} from "./figment-editor-api";
import ArtCropEditor from "./ArtCropEditor";
import type { ArtSaveStatus } from "./ArtCropEditor";
import EditableFigment from "./EditableFigment";
import { figmentPreviewCard } from "./figment-types";
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
import type {
  EditableFigmentField,
  EditorFigmentRecord,
  FigmentDisplayState,
  FigmentEditorApiClient,
  FigmentSortField,
} from "./figment-types";
import { editorTomlParam } from "./editor-api";

const DEFAULT_FIGMENT_API_CLIENT: FigmentEditorApiClient = {
  loadEditorFigments,
  saveEditorFigmentField,
  saveEditorFigmentArt,
  saveEditorFigmentImageNumber,
};

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded"; figments: EditorFigmentRecord[] }
  | { kind: "error"; message: string };

export interface FigmentEditorAppProps {
  apiClient?: FigmentEditorApiClient;
}

const DEFAULT_DISPLAY_STATE: FigmentDisplayState = {
  searchText: "",
  artEditing: false,
  sort: "sourceOrder",
  dir: "asc",
  size: "large",
};

function errorMessageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load figments.";
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
  figment: EditorFigmentRecord,
  field: EditableFigmentField,
): EditableFieldValue {
  switch (field) {
    case "name":
      return figment.name;
    case "subtype":
      return figment.subtype;
    case "spark":
      return figment.spark;
    case "rendered-text":
      return figment["rendered-text"];
  }
}

function validateFieldSave(
  field: EditableFigmentField,
  value: EditableFieldValue,
): { ok: true; value: EditableFieldValue } | { ok: false; message: string } {
  if (field === "name") {
    const text = String(value).trim();
    return text.length === 0
      ? { ok: false, message: "Name cannot be blank." }
      : { ok: true, value: text };
  }

  if (field === "subtype") {
    const text = String(value).trim();
    return text.length === 0
      ? { ok: false, message: "Character type cannot be blank." }
      : { ok: true, value: text };
  }

  if (field === "spark") {
    const numeric = Number(String(value).trim());
    return Number.isInteger(numeric) && numeric >= 0
      ? { ok: true, value: numeric }
      : { ok: false, message: "Spark must be a whole number of 0 or more." };
  }

  if (field === "rendered-text") {
    return { ok: true, value: String(value) };
  }

  return { ok: false, message: "This field is not editable." };
}

function sortValue(
  figment: EditorFigmentRecord,
  sort: FigmentSortField,
): string | number {
  switch (sort) {
    case "sourceOrder":
      return figment.sourceIndex;
    case "name":
      return figment.name;
    case "subtype":
      return figment.subtype;
    case "spark":
      return figment.spark;
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

function filteredAndSortedFigments(
  figments: readonly EditorFigmentRecord[],
  displayState: FigmentDisplayState,
): EditorFigmentRecord[] {
  const searchText = displayState.searchText.trim().toLowerCase();

  return figments
    .map((figment, index) => ({ figment, index }))
    .filter(({ figment }) => {
      if (searchText === "") {
        return true;
      }
      const haystack =
        `${figment.name} ${figment.subtype} ${figment["rendered-text"]}`.toLowerCase();
      return haystack.includes(searchText);
    })
    .sort((left, right) => {
      const direction = displayState.dir === "asc" ? 1 : -1;
      const comparison =
        compareSortValues(
          sortValue(left.figment, displayState.sort),
          sortValue(right.figment, displayState.sort),
        ) * direction;
      return comparison === 0 ? left.index - right.index : comparison;
    })
    .map(({ figment }) => figment);
}

function anyFieldEditing(saveState: EditableSaveState): boolean {
  return Object.values(saveState.fields).some(
    (entry) => entry.status === "editing" || entry.status === "saving",
  );
}

function reorderToFrozenOrder(
  figments: readonly EditorFigmentRecord[],
  frozenOrder: readonly string[],
): EditorFigmentRecord[] {
  const rank = new Map(frozenOrder.map((id, index) => [id, index]));
  const fallback = frozenOrder.length;
  return figments
    .map((figment, index) => ({ figment, index }))
    .sort((left, right) => {
      const leftRank = rank.get(left.figment.id) ?? fallback;
      const rightRank = rank.get(right.figment.id) ?? fallback;
      return leftRank === rightRank
        ? left.index - right.index
        : leftRank - rightRank;
    })
    .map(({ figment }) => figment);
}

export default function FigmentEditorApp({
  apiClient = DEFAULT_FIGMENT_API_CLIENT,
}: FigmentEditorAppProps) {
  const [displayState, setDisplayState] =
    useState<FigmentDisplayState>(DEFAULT_DISPLAY_STATE);
  const activeTomlLabel = useMemo(() => {
    const param = editorTomlParam();
    const path = param ?? "figments.toml";
    const fileName = path.split(/[\\/]/u).pop();
    return fileName !== undefined && fileName !== "" ? fileName : path;
  }, []);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<EditableSaveState>(
    EMPTY_EDITOR_SAVE_STATE,
  );
  const saveStateRef = useRef(saveState);

  const [artEditorFigmentId, setArtEditorFigmentId] = useState<string | null>(
    null,
  );
  const [artSaveStatus, setArtSaveStatus] = useState<ArtSaveStatus>("idle");
  const [artSaveError, setArtSaveError] = useState<string | null>(null);
  const [nameSaveStatus, setNameSaveStatus] = useState<ArtSaveStatus>("idle");
  const [nameSaveError, setNameSaveError] = useState<string | null>(null);
  const [imageNumberSaveStatus, setImageNumberSaveStatus] =
    useState<ArtSaveStatus>("idle");
  const [imageNumberSaveError, setImageNumberSaveError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoadStatus({ kind: "loading" });
      try {
        const figments = await apiClient.loadEditorFigments(controller.signal);
        if (!cancelled) {
          setLoadStatus({ kind: "loaded", figments });
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

  const loadedFigments = loadStatus.kind === "loaded" ? loadStatus.figments : [];
  const sortedVisibleFigments = useMemo(
    () => filteredAndSortedFigments(loadedFigments, displayState),
    [loadedFigments, displayState],
  );

  const editing = anyFieldEditing(saveState);
  const frozenOrderRef = useRef<string[]>([]);
  if (!editing) {
    frozenOrderRef.current = sortedVisibleFigments.map((figment) => figment.id);
  }
  const visibleFigments = editing
    ? reorderToFrozenOrder(sortedVisibleFigments, frozenOrderRef.current)
    : sortedVisibleFigments;

  const artEditorFigment =
    artEditorFigmentId === null
      ? null
      : (loadedFigments.find((figment) => figment.id === artEditorFigmentId) ??
        null);

  function setEditorSaveState(
    updater: (current: EditableSaveState) => EditableSaveState,
  ) {
    const next = updater(saveStateRef.current);
    saveStateRef.current = next;
    setSaveState(next);
  }

  function handleFieldBeginEdit(
    figment: EditorFigmentRecord,
    field: EditableFigmentField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) => {
      let next = current;
      for (const entry of Object.values(current.fields)) {
        if (
          entry.status === "editing" &&
          !(entry.cardId === figment.id && entry.field === field)
        ) {
          next = cancelFieldEdit(
            next,
            { cardId: entry.cardId, field: entry.field },
            entry.confirmedValue,
          );
        }
      }
      return beginFieldEdit(next, { cardId: figment.id, field }, value);
    });
  }

  function handleFieldDraftChange(
    figment: EditorFigmentRecord,
    field: EditableFigmentField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) =>
      updateFieldDraft(
        current,
        { cardId: figment.id, field },
        value,
        confirmedFieldValue(figment, field),
      ),
    );
  }

  function handleFieldCancel(
    figment: EditorFigmentRecord,
    field: EditableFigmentField,
  ) {
    setEditorSaveState((current) =>
      cancelFieldEdit(
        current,
        { cardId: figment.id, field },
        confirmedFieldValue(figment, field),
      ),
    );
  }

  function handleFieldCommit(
    figment: EditorFigmentRecord,
    field: EditableFigmentField,
    value: EditableFieldValue,
  ) {
    const validation = validateFieldSave(field, value);
    if (
      !validation.ok ||
      String(validation.value) === String(confirmedFieldValue(figment, field))
    ) {
      handleFieldCancel(figment, field);
      return;
    }
    handleFieldSave(figment, field, value);
  }

  function replaceConfirmedFigment(nextFigment: EditorFigmentRecord) {
    setLoadStatus((current) => {
      if (current.kind !== "loaded") {
        return current;
      }
      return {
        kind: "loaded",
        figments: current.figments.map((figment) =>
          figment.id === nextFigment.id ? nextFigment : figment,
        ),
      };
    });
  }

  function handleFieldSave(
    figment: EditorFigmentRecord,
    field: EditableFigmentField,
    value: EditableFieldValue,
  ) {
    const target = { cardId: figment.id, field };
    const validation = validateFieldSave(field, value);

    if (!validation.ok) {
      setEditorSaveState((current) =>
        rejectFieldEdit(
          current,
          target,
          value,
          confirmedFieldValue(figment, field),
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
        confirmedFieldValue(figment, field),
      );
      clientRevision = result.clientRevision;
      return result.state;
    });

    void apiClient
      .saveEditorFigmentField({
        id: figment.id,
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
            confirmedFieldValue(response.figment, field),
          ),
        );
        replaceConfirmedFigment(response.figment);
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
                confirmedFieldValue(figment, field),
                message,
              );
            }
            return failFieldSave(
              current,
              target,
              clientRevision,
              confirmedFieldValue(figment, field),
              message,
            );
          });
        }
      });
  }

  function handleSaveArt(figment: EditorFigmentRecord, art: EditorFigmentRecord["art"]) {
    if (art === null) {
      return;
    }
    setArtSaveStatus("saving");
    setArtSaveError(null);
    void apiClient
      .saveEditorFigmentArt({ id: figment.id, art })
      .then((response) => {
        replaceConfirmedFigment(response.figment);
        setArtSaveStatus("saved");
      })
      .catch((error: unknown) => {
        setArtSaveStatus("error");
        setArtSaveError(errorMessageFor(error));
      });
  }

  function handleSaveFigmentName(figment: EditorFigmentRecord, name: string) {
    setNameSaveStatus("saving");
    setNameSaveError(null);
    void apiClient
      .saveEditorFigmentField({ id: figment.id, field: "name", value: name })
      .then((response) => {
        replaceConfirmedFigment(response.figment);
        setNameSaveStatus("saved");
      })
      .catch((error: unknown) => {
        setNameSaveStatus("error");
        setNameSaveError(errorMessageFor(error));
      });
  }

  function handleSaveImageNumber(figment: EditorFigmentRecord, imageNumber: number) {
    setImageNumberSaveStatus("saving");
    setImageNumberSaveError(null);
    void apiClient
      .saveEditorFigmentImageNumber({ id: figment.id, imageNumber })
      .then((response) => {
        replaceConfirmedFigment(response.figment);
        setImageNumberSaveStatus("saved");
      })
      .catch((error: unknown) => {
        setImageNumberSaveStatus("error");
        setImageNumberSaveError(errorMessageFor(error));
      });
  }

  function openArtEditor(figment: EditorFigmentRecord) {
    setArtEditorFigmentId(figment.id);
    setArtSaveStatus("idle");
    setArtSaveError(null);
    setNameSaveStatus("idle");
    setNameSaveError(null);
    setImageNumberSaveStatus("idle");
    setImageNumberSaveError(null);
  }

  return (
    <main
      aria-busy={loadStatus.kind === "loading"}
      className="figment-editor-shell"
      data-editor-layout="responsive-scroll-shell"
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
        }}
      >
        <h1
          style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.1 }}
        >
          Figment Editor
        </h1>
        <span aria-hidden="true" style={{ color: "rgba(247, 241, 223, 0.35)" }}>
          -
        </span>
        <span style={{ color: "#8edbd1", fontSize: "0.82rem", fontWeight: 600 }}>
          {loadStatus.kind === "loaded" ? activeTomlLabel : "Loading..."}
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
            Loading figments...
          </p>
        ) : null}

        {loadStatus.kind === "loaded" ? (
          <>
            <FigmentEditorToolbar
              displayState={displayState}
              visibleCount={visibleFigments.length}
              totalCount={loadStatus.figments.length}
              onChange={setDisplayState}
            />
            {visibleFigments.length === 0 ? (
              <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
                No figments match the current search.
              </p>
            ) : (
              <div
                data-figment-grid="true"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: displayState.size === "large" ? "20px" : "14px",
                  alignContent: "flex-start",
                  overflowY: "auto",
                  minHeight: 0,
                  paddingBottom: "24px",
                }}
              >
                {visibleFigments.map((figment) => {
                  const entryFor = (field: EditableFigmentField) =>
                    fieldSaveEntry(saveState, { cardId: figment.id, field });
                  const widthVar =
                    displayState.size === "large"
                      ? "240px"
                      : displayState.size === "small"
                        ? "150px"
                        : "190px";
                  return (
                    <div key={figment.id} style={{ width: widthVar, flex: "0 0 auto" }}>
                      <EditableFigment
                        figment={figment}
                        size={displayState.size}
                        nameSaveEntry={entryFor("name")}
                        subtypeSaveEntry={entryFor("subtype")}
                        sparkSaveEntry={entryFor("spark")}
                        rulesTextSaveEntry={entryFor("rendered-text")}
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
              Unable to load figments
            </h2>
            <p style={{ margin: "0 0 18px", color: "#f0c6bd" }}>
              {loadStatus.message}
            </p>
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

      {artEditorFigment !== null ? (
        <ArtCropEditor
          figment
          card={{
            id: artEditorFigment.id,
            name: artEditorFigment.name,
            preview: figmentPreviewCard(artEditorFigment),
          }}
          saveStatus={artSaveStatus}
          saveError={artSaveError}
          cardNameSaveStatus={nameSaveStatus}
          cardNameSaveError={nameSaveError}
          imageNumberSaveStatus={imageNumberSaveStatus}
          imageNumberSaveError={imageNumberSaveError}
          onSave={(art) => handleSaveArt(artEditorFigment, art)}
          onSaveCardName={(name) => handleSaveFigmentName(artEditorFigment, name)}
          onSaveImageNumber={(imageNumber) =>
            handleSaveImageNumber(artEditorFigment, imageNumber)
          }
          onClose={() => setArtEditorFigmentId(null)}
        />
      ) : null}
    </main>
  );
}

interface FigmentEditorToolbarProps {
  displayState: FigmentDisplayState;
  visibleCount: number;
  totalCount: number;
  onChange: (next: FigmentDisplayState) => void;
}

function FigmentEditorToolbar({
  displayState,
  visibleCount,
  totalCount,
  onChange,
}: FigmentEditorToolbarProps) {
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
        placeholder="Search figments..."
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
              sort: event.target.value as FigmentSortField,
            })
          }
          style={controlStyle}
        >
          <option value="sourceOrder">Catalog order</option>
          <option value="name">Name</option>
          <option value="subtype">Character type</option>
          <option value="spark">Spark</option>
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
              size: event.target.value as FigmentDisplayState["size"],
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
        {displayState.artEditing ? "Art edit: on" : "Art edit: off"}
      </button>
      <span style={{ fontSize: "0.78rem", color: "#8a948f", marginLeft: "auto" }}>
        {visibleCount} / {totalCount}
      </span>
    </div>
  );
}
