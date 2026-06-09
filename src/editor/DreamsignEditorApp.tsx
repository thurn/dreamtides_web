import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadEditorDreamsignTags,
  loadEditorDreamsigns,
  saveEditorDreamsignField,
  saveEditorDreamsignTagRegistry,
  saveEditorDreamsignTags,
} from "./dreamsign-editor-api";
import {
  parseDreamsignDisplayState,
  replaceDreamsignDisplayStateInUrl,
} from "./dreamsign-editor-url-state";
import DreamsignEditorGrid from "./DreamsignEditorGrid";
import DreamsignEditorToolbar from "./DreamsignEditorToolbar";
import ManageTagsModal from "./ManageTagsModal";
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
import type { CardTagSaveState } from "./CardEditorGrid";
import type {
  DreamsignDisplayState,
  DreamsignEditorApiClient,
  DreamsignSortField,
  EditableDreamsignField,
  EditorDreamsignRecord,
} from "./dreamsign-types";
import type { EditorTag } from "./types";
import { editorTomlParam } from "./editor-api";

const DEFAULT_DREAMSIGN_API_CLIENT: DreamsignEditorApiClient = {
  loadEditorDreamsigns,
  saveEditorDreamsignField,
  loadEditorDreamsignTags,
  saveEditorDreamsignTags,
  saveEditorDreamsignTagRegistry,
};

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded"; dreamsigns: EditorDreamsignRecord[] }
  | { kind: "error"; message: string };

export interface DreamsignEditorAppProps {
  apiClient?: DreamsignEditorApiClient;
}

function errorMessageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load editor dreamsigns.";
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

function displayStateDataAttributes(displayState: DreamsignDisplayState) {
  return {
    "data-editor-search": displayState.searchText,
    "data-editor-scope": displayState.searchScope,
    "data-editor-tags": displayState.tagFilters.join(","),
    "data-editor-excluded-tags": displayState.excludedTagFilters.join(","),
    "data-editor-tag-editing": String(displayState.tagEditing),
    "data-editor-checkbox-tag": displayState.checkboxTag,
    "data-editor-sort": displayState.sort,
    "data-editor-dir": displayState.dir,
    "data-editor-size": displayState.size,
  };
}

function dreamsignSearchText(
  dreamsign: EditorDreamsignRecord,
  scope: DreamsignDisplayState["searchScope"],
): string {
  if (scope === "all") {
    return `${dreamsign.name} ${dreamsign["rendered-text"]}`;
  }

  return dreamsign.name;
}

function sortValue(
  dreamsign: EditorDreamsignRecord,
  sort: DreamsignSortField,
): string | number {
  switch (sort) {
    case "sourceOrder":
      return dreamsign.sourceIndex;
    case "name":
      return dreamsign.name;
    case "rulesTextLength":
      return dreamsign["rendered-text"].length;
    case "nameLength":
      return dreamsign.name.length;
    case "tagCount":
      return dreamsign.tags.length;
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

function filteredAndSortedDreamsigns(
  dreamsigns: readonly EditorDreamsignRecord[],
  displayState: DreamsignDisplayState,
): EditorDreamsignRecord[] {
  const searchText = displayState.searchText.trim().toLowerCase();

  return dreamsigns
    .map((dreamsign, index) => ({ dreamsign, index }))
    .filter(({ dreamsign }) => {
      if (
        searchText !== "" &&
        !dreamsignSearchText(dreamsign, displayState.searchScope)
          .toLowerCase()
          .includes(searchText)
      ) {
        return false;
      }

      if (
        displayState.tagFilters.length > 0 &&
        !displayState.tagFilters.every((tag) => dreamsign.tags.includes(tag))
      ) {
        return false;
      }

      if (
        displayState.excludedTagFilters.length > 0 &&
        displayState.excludedTagFilters.some((tag) => dreamsign.tags.includes(tag))
      ) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      const direction = displayState.dir === "asc" ? 1 : -1;
      const comparison =
        compareSortValues(
          sortValue(left.dreamsign, displayState.sort),
          sortValue(right.dreamsign, displayState.sort),
        ) * direction;

      return comparison === 0 ? left.index - right.index : comparison;
    })
    .map(({ dreamsign }) => dreamsign);
}

function anyFieldEditing(saveState: EditableSaveState): boolean {
  return Object.values(saveState.fields).some(
    (entry) => entry.status === "editing" || entry.status === "saving",
  );
}

function reorderToFrozenOrder(
  dreamsigns: readonly EditorDreamsignRecord[],
  frozenOrder: readonly string[],
): EditorDreamsignRecord[] {
  const rank = new Map(frozenOrder.map((id, index) => [id, index]));
  const fallback = frozenOrder.length;
  return dreamsigns
    .map((dreamsign, index) => ({ dreamsign, index }))
    .sort((left, right) => {
      const leftRank = rank.get(left.dreamsign.id) ?? fallback;
      const rightRank = rank.get(right.dreamsign.id) ?? fallback;
      return leftRank === rightRank
        ? left.index - right.index
        : leftRank - rightRank;
    })
    .map(({ dreamsign }) => dreamsign);
}

function confirmedFieldValue(
  dreamsign: EditorDreamsignRecord,
  field: EditableDreamsignField,
): EditableFieldValue {
  switch (field) {
    case "name":
      return dreamsign.name;
    case "rendered-text":
      return dreamsign["rendered-text"];
  }
}

function validateFieldSave(
  field: EditableDreamsignField,
  value: EditableFieldValue,
): { ok: true; value: EditableFieldValue } | { ok: false; message: string } {
  const textValue = String(value).trim();

  if (field === "name") {
    return textValue.length === 0
      ? { ok: false, message: "Name cannot be blank." }
      : { ok: true, value: textValue };
  }

  if (field === "rendered-text") {
    return { ok: true, value: String(value) };
  }

  return { ok: false, message: "This field is not editable." };
}

export default function DreamsignEditorApp({
  apiClient = DEFAULT_DREAMSIGN_API_CLIENT,
}: DreamsignEditorAppProps) {
  const [displayState, setDisplayState] = useState<DreamsignDisplayState>(() =>
    parseDreamsignDisplayState(window.location.search),
  );
  const activeTomlLabel = useMemo(() => {
    const param = editorTomlParam();
    const path = param ?? "dreamsigns.toml";
    const fileName = path.split(/[\\/]/u).pop();
    return fileName !== undefined && fileName !== "" ? fileName : path;
  }, []);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({
    kind: "loading",
  });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<EditableSaveState>(
    EMPTY_EDITOR_SAVE_STATE,
  );
  const saveStateRef = useRef(saveState);
  const [tags, setTags] = useState<EditorTag[]>([]);
  const [tagSaveState, setTagSaveState] = useState<
    Record<string, CardTagSaveState>
  >({});
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [registrySaving, setRegistrySaving] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadDreamsigns() {
      setLoadStatus({ kind: "loading" });

      try {
        const dreamsigns = await apiClient.loadEditorDreamsigns(controller.signal);
        if (!cancelled) {
          setLoadStatus({ kind: "loaded", dreamsigns });
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

    void loadDreamsigns();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiClient, loadAttempt]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadTags() {
      try {
        const loadedTags = await apiClient.loadEditorDreamsignTags(controller.signal);
        if (!cancelled) {
          setTags(loadedTags);
        }
      } catch (error) {
        if (isAbortError(error) || cancelled) {
          return;
        }
        setTags([]);
      }
    }

    void loadTags();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiClient, loadAttempt]);

  const loadedDreamsigns =
    loadStatus.kind === "loaded" ? loadStatus.dreamsigns : [];
  const sortedVisibleDreamsigns = useMemo(
    () => filteredAndSortedDreamsigns(loadedDreamsigns, displayState),
    [loadedDreamsigns, displayState],
  );

  const editing = anyFieldEditing(saveState);
  const frozenOrderRef = useRef<string[]>([]);
  if (!editing) {
    frozenOrderRef.current = sortedVisibleDreamsigns.map((dreamsign) => dreamsign.id);
  }
  const visibleDreamsigns = editing
    ? reorderToFrozenOrder(sortedVisibleDreamsigns, frozenOrderRef.current)
    : sortedVisibleDreamsigns;

  const tagUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const dreamsign of loadedDreamsigns) {
      for (const tag of dreamsign.tags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return counts;
  }, [loadedDreamsigns]);

  function handleDisplayStateChange(nextState: DreamsignDisplayState) {
    setDisplayState(nextState);
    replaceDreamsignDisplayStateInUrl(nextState);
  }

  function setEditorSaveState(
    updater: (current: EditableSaveState) => EditableSaveState,
  ) {
    const next = updater(saveStateRef.current);
    saveStateRef.current = next;
    setSaveState(next);
  }

  function handleFieldBeginEdit(
    dreamsign: EditorDreamsignRecord,
    field: EditableDreamsignField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) => {
      let next = current;
      for (const entry of Object.values(current.fields)) {
        if (
          entry.status === "editing" &&
          !(entry.cardId === dreamsign.id && entry.field === field)
        ) {
          next = cancelFieldEdit(
            next,
            { cardId: entry.cardId, field: entry.field },
            entry.confirmedValue,
          );
        }
      }
      return beginFieldEdit(next, { cardId: dreamsign.id, field }, value);
    });
  }

  function handleFieldDraftChange(
    dreamsign: EditorDreamsignRecord,
    field: EditableDreamsignField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) =>
      updateFieldDraft(
        current,
        { cardId: dreamsign.id, field },
        value,
        confirmedFieldValue(dreamsign, field),
      ),
    );
  }

  function handleFieldCancel(
    dreamsign: EditorDreamsignRecord,
    field: EditableDreamsignField,
  ) {
    setEditorSaveState((current) =>
      cancelFieldEdit(
        current,
        { cardId: dreamsign.id, field },
        confirmedFieldValue(dreamsign, field),
      ),
    );
  }

  function handleFieldCommit(
    dreamsign: EditorDreamsignRecord,
    field: EditableDreamsignField,
    value: EditableFieldValue,
  ) {
    const validation = validateFieldSave(field, value);
    if (
      !validation.ok ||
      String(validation.value) === String(confirmedFieldValue(dreamsign, field))
    ) {
      handleFieldCancel(dreamsign, field);
      return;
    }

    handleFieldSave(dreamsign, field, value);
  }

  function replaceConfirmedDreamsign(nextDreamsign: EditorDreamsignRecord) {
    setLoadStatus((current) => {
      if (current.kind !== "loaded") {
        return current;
      }

      return {
        kind: "loaded",
        dreamsigns: current.dreamsigns.map((dreamsign) =>
          dreamsign.id === nextDreamsign.id ? nextDreamsign : dreamsign,
        ),
      };
    });
  }

  function handleFieldSave(
    dreamsign: EditorDreamsignRecord,
    field: EditableDreamsignField,
    value: EditableFieldValue,
  ) {
    const target = { cardId: dreamsign.id, field };
    const validation = validateFieldSave(field, value);

    if (!validation.ok) {
      setEditorSaveState((current) =>
        rejectFieldEdit(
          current,
          target,
          value,
          confirmedFieldValue(dreamsign, field),
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
        confirmedFieldValue(dreamsign, field),
      );
      clientRevision = result.clientRevision;
      return result.state;
    });

    void apiClient
      .saveEditorDreamsignField({
        id: dreamsign.id,
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
            confirmedFieldValue(response.dreamsign, field),
          ),
        );
        replaceConfirmedDreamsign(response.dreamsign);
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
                confirmedFieldValue(dreamsign, field),
                message,
              );
            }

            return failFieldSave(
              current,
              target,
              clientRevision,
              confirmedFieldValue(dreamsign, field),
              message,
            );
          });
        }
      });
  }

  function applyDreamsignTags(
    dreamsign: EditorDreamsignRecord,
    nextTags: string[],
  ) {
    const previousTags = dreamsign.tags;
    replaceConfirmedDreamsign({ ...dreamsign, tags: nextTags });
    setTagSaveState((current) => ({
      ...current,
      [dreamsign.id]: { saving: true, error: null },
    }));

    void apiClient
      .saveEditorDreamsignTags({ id: dreamsign.id, tags: nextTags })
      .then((response) => {
        replaceConfirmedDreamsign(response.dreamsign);
        setTagSaveState((current) => ({
          ...current,
          [dreamsign.id]: { saving: false, error: null },
        }));
      })
      .catch((error: unknown) => {
        replaceConfirmedDreamsign({ ...dreamsign, tags: previousTags });
        setTagSaveState((current) => ({
          ...current,
          [dreamsign.id]: { saving: false, error: errorMessageFor(error) },
        }));
      });
  }

  function handleAddDreamsignTag(dreamsign: EditorDreamsignRecord, name: string) {
    if (dreamsign.tags.includes(name)) {
      return;
    }
    applyDreamsignTags(dreamsign, [...dreamsign.tags, name]);
  }

  function handleRemoveDreamsignTag(
    dreamsign: EditorDreamsignRecord,
    name: string,
  ) {
    if (!dreamsign.tags.includes(name)) {
      return;
    }
    applyDreamsignTags(
      dreamsign,
      dreamsign.tags.filter((tag) => tag !== name),
    );
  }

  function handleSaveTagRegistry(nextTags: EditorTag[]) {
    setRegistrySaving(true);
    setRegistryError(null);

    void apiClient
      .saveEditorDreamsignTagRegistry({ tags: nextTags })
      .then((response) => {
        setTags(response.tags);
        setLoadStatus((current) =>
          current.kind === "loaded"
            ? { kind: "loaded", dreamsigns: response.dreamsigns }
            : current,
        );
        setRegistrySaving(false);
        setManageTagsOpen(false);
      })
      .catch((error: unknown) => {
        setRegistrySaving(false);
        setRegistryError(errorMessageFor(error));
      });
  }

  return (
    <main
      aria-busy={loadStatus.kind === "loading"}
      className="dreamsign-editor-shell"
      data-editor-layout="responsive-scroll-shell"
      {...displayStateDataAttributes(displayState)}
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
        className="dreamsign-editor-header"
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flex: "0 0 auto",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.05rem",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "0",
          }}
        >
          Dreamsign Editor
        </h1>
        <span
          aria-hidden="true"
          style={{ color: "rgba(247, 241, 223, 0.35)" }}
        >
          -
        </span>
        <span style={{ color: "#8edbd1", fontSize: "0.82rem", fontWeight: 600 }}>
          {loadStatus.kind === "loaded" ? activeTomlLabel : "Loading..."}
        </span>
      </header>

      <section
        className="dreamsign-editor-content"
        style={{
          display: "flex",
          flex: "1 1 auto",
          flexDirection: "column",
          minHeight: 0,
          paddingTop: "12px",
        }}
      >
        {loadStatus.kind === "loading" ? (
          <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
            Loading dreamsigns...
          </p>
        ) : null}

        {loadStatus.kind === "loaded" ? (
          <div
            className="dreamsign-editor-loaded-content"
            style={{
              display: "flex",
              flex: "1 1 auto",
              flexDirection: "column",
              gap: "12px",
              minHeight: 0,
            }}
          >
            <DreamsignEditorToolbar
              displayState={displayState}
              availableTags={tags}
              visibleCount={visibleDreamsigns.length}
              totalCount={loadStatus.dreamsigns.length}
              onDisplayStateChange={handleDisplayStateChange}
              onOpenManageTags={() => setManageTagsOpen(true)}
            />
            {visibleDreamsigns.length === 0 ? (
              <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
                No dreamsigns match the current filters.
              </p>
            ) : (
              <DreamsignEditorGrid
                dreamsigns={visibleDreamsigns}
                size={displayState.size}
                saveState={saveState}
                tagEditing={displayState.tagEditing}
                checkboxTag={displayState.checkboxTag}
                availableTags={tags}
                tagSaveState={tagSaveState}
                onFieldBeginEdit={handleFieldBeginEdit}
                onFieldDraftChange={handleFieldDraftChange}
                onFieldCancel={handleFieldCancel}
                onFieldSave={handleFieldSave}
                onFieldCommit={handleFieldCommit}
                onAddDreamsignTag={handleAddDreamsignTag}
                onRemoveDreamsignTag={handleRemoveDreamsignTag}
                onOpenManageTags={() => setManageTagsOpen(true)}
              />
            )}
          </div>
        ) : null}

        {loadStatus.kind === "error" ? (
          <div role="alert" style={{ maxWidth: "560px" }}>
            <h2
              style={{
                margin: "0 0 8px",
                fontSize: "1.25rem",
                letterSpacing: "0",
              }}
            >
              Unable to load dreamsigns
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

      {manageTagsOpen ? (
        <ManageTagsModal
          tags={tags}
          usageCounts={tagUsageCounts}
          saving={registrySaving}
          saveError={registryError}
          onSave={handleSaveTagRegistry}
          onClose={() => {
            if (!registrySaving) {
              setManageTagsOpen(false);
              setRegistryError(null);
            }
          }}
        />
      ) : null}
    </main>
  );
}
