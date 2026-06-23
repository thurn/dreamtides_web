import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadEditorDreamcallers,
  saveEditorDreamcallerField,
  saveEditorDreamcallerTidePool,
} from "./dreamcaller-editor-api";
import {
  parseDreamcallerDisplayState,
  replaceDreamcallerDisplayStateInUrl,
} from "./dreamcaller-editor-url-state";
import DreamcallerEditorGrid from "./DreamcallerEditorGrid";
import DreamcallerEditorToolbar from "./DreamcallerEditorToolbar";
import DreamcallerDetailView from "./DreamcallerDetailView";
import TidePoolModal from "./TidePoolModal";
import { loadQuestContent, type QuestContent } from "../data/quest-content";
import { DEFAULT_POOL_VARIANT } from "../draft/pool/types";
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
  DreamcallerDisplayState,
  DreamcallerEditorApiClient,
  DreamcallerSortField,
  EditableDreamcallerField,
  EditorDreamcallerRecord,
  EditorTideOption,
  EditorTidePool,
} from "./dreamcaller-types";
import { editorTomlParam } from "./editor-api";

const DEFAULT_DREAMCALLER_API_CLIENT: DreamcallerEditorApiClient = {
  loadEditorDreamcallers,
  saveEditorDreamcallerField,
  saveEditorDreamcallerTidePool,
};

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded"; dreamcallers: EditorDreamcallerRecord[]; tides: EditorTideOption[] }
  | { kind: "error"; message: string };

export interface DreamcallerEditorAppProps {
  apiClient?: DreamcallerEditorApiClient;
}

function errorMessageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load editor dreamcallers.";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isServerValidationError(error: unknown): boolean {
  return (
    error !== null && typeof error === "object" && "code" in error && error.code === "INVALID_EDIT"
  );
}

function dreamcallerSearchText(
  dreamcaller: EditorDreamcallerRecord,
  scope: DreamcallerDisplayState["searchScope"],
): string {
  if (scope === "all") {
    return `${dreamcaller.name} ${dreamcaller.title} ${dreamcaller["rendered-text"]}`;
  }
  return `${dreamcaller.name} ${dreamcaller.title}`;
}

function sortValue(
  dreamcaller: EditorDreamcallerRecord,
  sort: DreamcallerSortField,
): string | number {
  switch (sort) {
    case "sourceOrder":
      return dreamcaller.sourceIndex;
    case "name":
      return dreamcaller.name;
    case "startingEssence":
      return dreamcaller.startingEssence;
    case "rulesTextLength":
      return dreamcaller["rendered-text"].length;
    case "facetCount":
      return dreamcaller.tidePool.facets.length;
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

function filteredAndSortedDreamcallers(
  dreamcallers: readonly EditorDreamcallerRecord[],
  displayState: DreamcallerDisplayState,
): EditorDreamcallerRecord[] {
  const searchText = displayState.searchText.trim().toLowerCase();

  return dreamcallers
    .map((dreamcaller, index) => ({ dreamcaller, index }))
    .filter(({ dreamcaller }) => {
      if (
        searchText !== "" &&
        !dreamcallerSearchText(dreamcaller, displayState.searchScope)
          .toLowerCase()
          .includes(searchText)
      ) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const direction = displayState.dir === "asc" ? 1 : -1;
      const comparison =
        compareSortValues(
          sortValue(left.dreamcaller, displayState.sort),
          sortValue(right.dreamcaller, displayState.sort),
        ) * direction;
      return comparison === 0 ? left.index - right.index : comparison;
    })
    .map(({ dreamcaller }) => dreamcaller);
}

function anyFieldEditing(saveState: EditableSaveState): boolean {
  return Object.values(saveState.fields).some(
    (entry) => entry.status === "editing" || entry.status === "saving",
  );
}

function reorderToFrozenOrder(
  dreamcallers: readonly EditorDreamcallerRecord[],
  frozenOrder: readonly string[],
): EditorDreamcallerRecord[] {
  const rank = new Map(frozenOrder.map((id, index) => [id, index]));
  const fallback = frozenOrder.length;
  return dreamcallers
    .map((dreamcaller, index) => ({ dreamcaller, index }))
    .sort((left, right) => {
      const leftRank = rank.get(left.dreamcaller.id) ?? fallback;
      const rightRank = rank.get(right.dreamcaller.id) ?? fallback;
      return leftRank === rightRank ? left.index - right.index : leftRank - rightRank;
    })
    .map(({ dreamcaller }) => dreamcaller);
}

function confirmedFieldValue(
  dreamcaller: EditorDreamcallerRecord,
  field: EditableDreamcallerField,
): EditableFieldValue {
  switch (field) {
    case "name":
      return dreamcaller.name;
    case "title":
      return dreamcaller.title;
    case "rendered-text":
      return dreamcaller["rendered-text"];
    case "image-number":
      return dreamcaller.imageNumber;
    case "starting-essence":
      return dreamcaller.startingEssence;
  }
}

function validateFieldSave(
  field: EditableDreamcallerField,
  value: EditableFieldValue,
): { ok: true; value: EditableFieldValue } | { ok: false; message: string } {
  const textValue = String(value).trim();

  if (field === "name") {
    return textValue.length === 0
      ? { ok: false, message: "Name cannot be blank." }
      : { ok: true, value: textValue };
  }

  if (field === "title") {
    return { ok: true, value: textValue };
  }

  if (field === "rendered-text") {
    return { ok: true, value: String(value) };
  }

  if (field === "image-number") {
    return /^\d+$/u.test(textValue)
      ? { ok: true, value: textValue }
      : { ok: false, message: "Image number must be digits, e.g. 0083." };
  }

  if (field === "starting-essence") {
    return /^\d+$/u.test(textValue)
      ? { ok: true, value: Number(textValue) }
      : { ok: false, message: "Starting essence must be a non-negative whole number." };
  }

  return { ok: false, message: "This field is not editable." };
}

export default function DreamcallerEditorApp({
  apiClient = DEFAULT_DREAMCALLER_API_CLIENT,
}: DreamcallerEditorAppProps) {
  const [displayState, setDisplayState] = useState<DreamcallerDisplayState>(() =>
    parseDreamcallerDisplayState(window.location.search),
  );
  const activeTomlLabel = useMemo(() => {
    const param = editorTomlParam();
    const path = param ?? "dreamcallers_v2.toml";
    const fileName = path.split(/[\\/]/u).pop();
    return fileName !== undefined && fileName !== "" ? fileName : path;
  }, []);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<EditableSaveState>(EMPTY_EDITOR_SAVE_STATE);
  const saveStateRef = useRef(saveState);
  const [tideModalId, setTideModalId] = useState<string | null>(null);
  const [tideSaveState, setTideSaveState] = useState<Record<string, boolean>>({});
  const [tideSaveError, setTideSaveError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [questContent, setQuestContent] = useState<QuestContent | null>(null);
  const [questContentError, setQuestContentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoadStatus({ kind: "loading" });
      try {
        const response = await apiClient.loadEditorDreamcallers(controller.signal);
        if (!cancelled) {
          setLoadStatus({
            kind: "loaded",
            dreamcallers: response.dreamcallers,
            tides: response.tides,
          });
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

  // The detail screen resolves each Dreamcaller's signature cards from the same
  // quest content the battle integration loads. Fetch it lazily the first time
  // a detail screen is opened so the editor's normal load path is unaffected.
  useEffect(() => {
    if (detailId === null || questContent !== null || questContentError !== null) {
      return;
    }
    let cancelled = false;
    loadQuestContent(DEFAULT_POOL_VARIANT)
      .then((loaded) => {
        if (!cancelled) {
          setQuestContent(loaded);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setQuestContentError(errorMessageFor(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detailId, questContent, questContentError]);

  const loadedDreamcallers = loadStatus.kind === "loaded" ? loadStatus.dreamcallers : [];
  const tides = loadStatus.kind === "loaded" ? loadStatus.tides : [];
  const sortedVisibleDreamcallers = useMemo(
    () => filteredAndSortedDreamcallers(loadedDreamcallers, displayState),
    [loadedDreamcallers, displayState],
  );

  const editing = anyFieldEditing(saveState);
  const frozenOrderRef = useRef<string[]>([]);
  if (!editing) {
    frozenOrderRef.current = sortedVisibleDreamcallers.map((dreamcaller) => dreamcaller.id);
  }
  const visibleDreamcallers = editing
    ? reorderToFrozenOrder(sortedVisibleDreamcallers, frozenOrderRef.current)
    : sortedVisibleDreamcallers;

  const tideModalDreamcaller =
    tideModalId === null
      ? null
      : (loadedDreamcallers.find((dreamcaller) => dreamcaller.id === tideModalId) ?? null);

  const detailDreamcaller =
    detailId === null
      ? null
      : (loadedDreamcallers.find((dreamcaller) => dreamcaller.id === detailId) ?? null);

  function handleDisplayStateChange(nextState: DreamcallerDisplayState) {
    setDisplayState(nextState);
    replaceDreamcallerDisplayStateInUrl(nextState);
  }

  function setEditorSaveState(updater: (current: EditableSaveState) => EditableSaveState) {
    const next = updater(saveStateRef.current);
    saveStateRef.current = next;
    setSaveState(next);
  }

  function handleFieldBeginEdit(
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) => {
      let next = current;
      for (const entry of Object.values(current.fields)) {
        if (
          entry.status === "editing" &&
          !(entry.cardId === dreamcaller.id && entry.field === field)
        ) {
          next = cancelFieldEdit(
            next,
            { cardId: entry.cardId, field: entry.field },
            entry.confirmedValue,
          );
        }
      }
      return beginFieldEdit(next, { cardId: dreamcaller.id, field }, value);
    });
  }

  function handleFieldDraftChange(
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) =>
      updateFieldDraft(
        current,
        { cardId: dreamcaller.id, field },
        value,
        confirmedFieldValue(dreamcaller, field),
      ),
    );
  }

  function handleFieldCancel(
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
  ) {
    setEditorSaveState((current) =>
      cancelFieldEdit(
        current,
        { cardId: dreamcaller.id, field },
        confirmedFieldValue(dreamcaller, field),
      ),
    );
  }

  function handleFieldCommit(
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
    value: EditableFieldValue,
  ) {
    const validation = validateFieldSave(field, value);
    if (
      !validation.ok ||
      String(validation.value) === String(confirmedFieldValue(dreamcaller, field))
    ) {
      handleFieldCancel(dreamcaller, field);
      return;
    }
    handleFieldSave(dreamcaller, field, value);
  }

  function replaceConfirmedDreamcaller(nextDreamcaller: EditorDreamcallerRecord) {
    setLoadStatus((current) => {
      if (current.kind !== "loaded") {
        return current;
      }
      return {
        kind: "loaded",
        tides: current.tides,
        dreamcallers: current.dreamcallers.map((dreamcaller) =>
          dreamcaller.id === nextDreamcaller.id ? nextDreamcaller : dreamcaller,
        ),
      };
    });
  }

  function handleFieldSave(
    dreamcaller: EditorDreamcallerRecord,
    field: EditableDreamcallerField,
    value: EditableFieldValue,
  ) {
    const target = { cardId: dreamcaller.id, field };
    const validation = validateFieldSave(field, value);

    if (!validation.ok) {
      setEditorSaveState((current) =>
        rejectFieldEdit(
          current,
          target,
          value,
          confirmedFieldValue(dreamcaller, field),
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
        confirmedFieldValue(dreamcaller, field),
      );
      clientRevision = result.clientRevision;
      return result.state;
    });

    void apiClient
      .saveEditorDreamcallerField({ id: dreamcaller.id, field, value: serverValue, clientRevision })
      .then((response) => {
        const responseRevision = response.clientRevision ?? clientRevision;
        const currentEntry = fieldSaveEntry(saveStateRef.current, target);
        if (currentEntry === null || responseRevision < currentEntry.submittedRevision) {
          return;
        }
        setEditorSaveState((current) =>
          completeFieldSave(
            current,
            target,
            responseRevision,
            confirmedFieldValue(response.dreamcaller, field),
          ),
        );
        replaceConfirmedDreamcaller(response.dreamcaller);
      })
      .catch((error: unknown) => {
        const message = errorMessageFor(error);
        const currentEntry = fieldSaveEntry(saveStateRef.current, target);
        if (currentEntry !== null && clientRevision >= currentEntry.submittedRevision) {
          setEditorSaveState((current) => {
            if (isServerValidationError(error)) {
              return rejectSubmittedFieldSave(
                current,
                target,
                clientRevision,
                confirmedFieldValue(dreamcaller, field),
                message,
              );
            }
            return failFieldSave(
              current,
              target,
              clientRevision,
              confirmedFieldValue(dreamcaller, field),
              message,
            );
          });
        }
      });
  }

  function handleSaveTidePool(dreamcaller: EditorDreamcallerRecord, pool: EditorTidePool) {
    setTideSaveState((current) => ({ ...current, [dreamcaller.id]: true }));
    setTideSaveError(null);

    void apiClient
      .saveEditorDreamcallerTidePool({ id: dreamcaller.id, pool })
      .then((response) => {
        replaceConfirmedDreamcaller(response.dreamcaller);
        setTideSaveState((current) => ({ ...current, [dreamcaller.id]: false }));
        setTideModalId(null);
      })
      .catch((error: unknown) => {
        setTideSaveState((current) => ({ ...current, [dreamcaller.id]: false }));
        setTideSaveError(errorMessageFor(error));
      });
  }

  return (
    <main
      aria-busy={loadStatus.kind === "loading"}
      className="dreamcaller-editor-shell"
      data-editor-layout="responsive-scroll-shell"
      data-editor-search={displayState.searchText}
      data-editor-sort={displayState.sort}
      data-editor-dir={displayState.dir}
      data-editor-size={displayState.size}
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
        className="dreamcaller-editor-header"
        style={{ display: "flex", alignItems: "baseline", gap: "10px", flex: "0 0 auto" }}
      >
        <h1 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.1 }}>
          Dreamcaller Editor
        </h1>
        <span aria-hidden="true" style={{ color: "rgba(247, 241, 223, 0.35)" }}>
          -
        </span>
        <span style={{ color: "#8edbd1", fontSize: "0.82rem", fontWeight: 600 }}>
          {loadStatus.kind === "loaded" ? activeTomlLabel : "Loading..."}
        </span>
      </header>

      <section
        className="dreamcaller-editor-content"
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
            Loading dreamcallers...
          </p>
        ) : null}

        {loadStatus.kind === "loaded" ? (
          <div
            className="dreamcaller-editor-loaded-content"
            style={{
              display: "flex",
              flex: "1 1 auto",
              flexDirection: "column",
              gap: "12px",
              minHeight: 0,
            }}
          >
            <DreamcallerEditorToolbar
              displayState={displayState}
              visibleCount={visibleDreamcallers.length}
              totalCount={loadStatus.dreamcallers.length}
              onDisplayStateChange={handleDisplayStateChange}
            />
            {visibleDreamcallers.length === 0 ? (
              <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
                No dreamcallers match the current filters.
              </p>
            ) : (
              <DreamcallerEditorGrid
                dreamcallers={visibleDreamcallers}
                tides={tides}
                size={displayState.size}
                saveState={saveState}
                tideSaveState={tideSaveState}
                onFieldBeginEdit={handleFieldBeginEdit}
                onFieldDraftChange={handleFieldDraftChange}
                onFieldCancel={handleFieldCancel}
                onFieldSave={handleFieldSave}
                onFieldCommit={handleFieldCommit}
                onEditTides={(dreamcaller) => {
                  setTideSaveError(null);
                  setTideModalId(dreamcaller.id);
                }}
                onViewDetail={(dreamcaller) => {
                  setDetailId(dreamcaller.id);
                }}
              />
            )}
          </div>
        ) : null}

        {loadStatus.kind === "error" ? (
          <div role="alert" style={{ maxWidth: "560px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>Unable to load dreamcallers</h2>
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

      {tideModalDreamcaller !== null ? (
        <TidePoolModal
          dreamcaller={tideModalDreamcaller}
          tides={tides}
          saving={tideSaveState[tideModalDreamcaller.id] ?? false}
          saveError={tideSaveError}
          onSave={(pool) => handleSaveTidePool(tideModalDreamcaller, pool)}
          onClose={() => {
            if (!(tideSaveState[tideModalDreamcaller.id] ?? false)) {
              setTideModalId(null);
              setTideSaveError(null);
            }
          }}
        />
      ) : null}

      {detailDreamcaller !== null ? (
        <DreamcallerDetailView
          dreamcaller={detailDreamcaller}
          tides={tides}
          questContent={questContent}
          questContentError={questContentError}
          onClose={() => setDetailId(null)}
        />
      ) : null}
    </main>
  );
}
