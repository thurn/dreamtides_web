import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadEditorDreamAvatars,
  saveEditorDreamAvatarField,
  saveEditorDreamAvatarTidePool,
} from "./dream-avatar-editor-api";
import {
  parseDreamAvatarDisplayState,
  replaceDreamAvatarDisplayStateInUrl,
} from "./dream-avatar-editor-url-state";
import {
  isPushedDetailHistoryEntry,
  parseDetailIdFromUrl,
  pushDetailIdInUrl,
  replaceDetailIdInUrl,
} from "./dream-avatar-detail-url-state";
import DreamAvatarEditorGrid from "./DreamAvatarEditorGrid";
import DreamAvatarEditorToolbar from "./DreamAvatarEditorToolbar";
import DreamAvatarDetailView from "./DreamAvatarDetailView";
import TidePoolModal from "./TidePoolModal";
import { loadQuestContent, type QuestContent } from "../data/quest-content";
import { loadTides4Decks } from "../data/cards-v2-database";
import { DEFAULT_POOL_VARIANT } from "../draft/pool/types";
import type { Tides4DecksJson } from "../draft/pool/tides4-io";
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
  DreamAvatarDisplayState,
  DreamAvatarEditorApiClient,
  DreamAvatarSortField,
  EditableDreamAvatarField,
  EditorDreamAvatarRecord,
  EditorTideOption,
  EditorTidePool,
} from "./dream-avatar-types";
import { editorTomlParam } from "./editor-api";

const DEFAULT_DREAM_AVATAR_API_CLIENT: DreamAvatarEditorApiClient = {
  loadEditorDreamAvatars,
  saveEditorDreamAvatarField,
  saveEditorDreamAvatarTidePool,
};

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded"; dreamAvatars: EditorDreamAvatarRecord[]; tides: EditorTideOption[] }
  | { kind: "error"; message: string };

export interface DreamAvatarEditorAppProps {
  apiClient?: DreamAvatarEditorApiClient;
}

function errorMessageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load editor avatars.";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isServerValidationError(error: unknown): boolean {
  return (
    error !== null && typeof error === "object" && "code" in error && error.code === "INVALID_EDIT"
  );
}

function dreamAvatarSearchText(
  dreamAvatar: EditorDreamAvatarRecord,
  scope: DreamAvatarDisplayState["searchScope"],
): string {
  if (scope === "all") {
    return `${dreamAvatar.name} ${dreamAvatar.title} ${dreamAvatar["rendered-text"]}`;
  }
  return `${dreamAvatar.name} ${dreamAvatar.title}`;
}

function sortValue(
  dreamAvatar: EditorDreamAvatarRecord,
  sort: DreamAvatarSortField,
): string | number {
  switch (sort) {
    case "sourceOrder":
      return dreamAvatar.sourceIndex;
    case "name":
      return dreamAvatar.name;
    case "startingEssence":
      return dreamAvatar.startingEssence;
    case "rulesTextLength":
      return dreamAvatar["rendered-text"].length;
    case "facetCount":
      return dreamAvatar.tidePool.facets.length;
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

function filteredAndSortedDreamAvatars(
  dreamAvatars: readonly EditorDreamAvatarRecord[],
  displayState: DreamAvatarDisplayState,
): EditorDreamAvatarRecord[] {
  const searchText = displayState.searchText.trim().toLowerCase();

  return dreamAvatars
    .map((dreamAvatar, index) => ({ dreamAvatar, index }))
    .filter(({ dreamAvatar }) => {
      if (
        searchText !== "" &&
        !dreamAvatarSearchText(dreamAvatar, displayState.searchScope)
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
          sortValue(left.dreamAvatar, displayState.sort),
          sortValue(right.dreamAvatar, displayState.sort),
        ) * direction;
      return comparison === 0 ? left.index - right.index : comparison;
    })
    .map(({ dreamAvatar }) => dreamAvatar);
}

function anyFieldEditing(saveState: EditableSaveState): boolean {
  return Object.values(saveState.fields).some(
    (entry) => entry.status === "editing" || entry.status === "saving",
  );
}

function reorderToFrozenOrder(
  dreamAvatars: readonly EditorDreamAvatarRecord[],
  frozenOrder: readonly string[],
): EditorDreamAvatarRecord[] {
  const rank = new Map(frozenOrder.map((id, index) => [id, index]));
  const fallback = frozenOrder.length;
  return dreamAvatars
    .map((dreamAvatar, index) => ({ dreamAvatar, index }))
    .sort((left, right) => {
      const leftRank = rank.get(left.dreamAvatar.id) ?? fallback;
      const rightRank = rank.get(right.dreamAvatar.id) ?? fallback;
      return leftRank === rightRank ? left.index - right.index : leftRank - rightRank;
    })
    .map(({ dreamAvatar }) => dreamAvatar);
}

function confirmedFieldValue(
  dreamAvatar: EditorDreamAvatarRecord,
  field: EditableDreamAvatarField,
): EditableFieldValue {
  switch (field) {
    case "name":
      return dreamAvatar.name;
    case "title":
      return dreamAvatar.title;
    case "rendered-text":
      return dreamAvatar["rendered-text"];
    case "image-number":
      return dreamAvatar.imageNumber;
    case "starting-essence":
      return dreamAvatar.startingEssence;
  }
}

function validateFieldSave(
  field: EditableDreamAvatarField,
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

export default function DreamAvatarEditorApp({
  apiClient = DEFAULT_DREAM_AVATAR_API_CLIENT,
}: DreamAvatarEditorAppProps) {
  const [displayState, setDisplayState] = useState<DreamAvatarDisplayState>(() =>
    parseDreamAvatarDisplayState(window.location.search),
  );
  const activeTomlLabel = useMemo(() => {
    const param = editorTomlParam();
    const path = param ?? "dream_avatars_v2.toml";
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
  const [detailId, setDetailId] = useState<string | null>(() =>
    parseDetailIdFromUrl(window.location.search),
  );
  const [questContent, setQuestContent] = useState<QuestContent | null>(null);
  const [questContentError, setQuestContentError] = useState<string | null>(null);
  const [tideDecks, setTideDecks] = useState<Tides4DecksJson | null>(null);
  const [tideDecksError, setTideDecksError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoadStatus({ kind: "loading" });
      try {
        const response = await apiClient.loadEditorDreamAvatars(controller.signal);
        if (!cancelled) {
          setLoadStatus({
            kind: "loaded",
            dreamAvatars: response.dreamAvatars,
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

  // The detail screen resolves each DreamAvatar's signature cards from the same
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

  // Clicking a Tide on the detail screen reveals that tide's decklist. Resolve
  // the cards from the committed `tides4` artifact (the same source the editor's
  // tide pools and the draft pool builder use), loaded lazily the first time a
  // detail screen opens so the editor's normal load path is unaffected.
  useEffect(() => {
    if (detailId === null || tideDecks !== null || tideDecksError !== null) {
      return;
    }
    let cancelled = false;
    loadTides4Decks()
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        if (loaded === null) {
          setTideDecksError(
            "Tide decklists are unavailable: the tides4 artifact (/tides4-data.json) is missing.",
          );
        } else {
          setTideDecks(loaded);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTideDecksError(errorMessageFor(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detailId, tideDecks, tideDecksError]);

  // Keep the detail screen in sync with browser history navigation so Back and
  // Forward open and close the overlay to match the `detail` query parameter.
  useEffect(() => {
    function handlePopState() {
      setDetailId(parseDetailIdFromUrl(window.location.search));
    }
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const loadedDreamAvatars = loadStatus.kind === "loaded" ? loadStatus.dreamAvatars : [];
  const tides = loadStatus.kind === "loaded" ? loadStatus.tides : [];
  const sortedVisibleDreamAvatars = useMemo(
    () => filteredAndSortedDreamAvatars(loadedDreamAvatars, displayState),
    [loadedDreamAvatars, displayState],
  );

  const editing = anyFieldEditing(saveState);
  const frozenOrderRef = useRef<string[]>([]);
  if (!editing) {
    frozenOrderRef.current = sortedVisibleDreamAvatars.map((dreamAvatar) => dreamAvatar.id);
  }
  const visibleDreamAvatars = editing
    ? reorderToFrozenOrder(sortedVisibleDreamAvatars, frozenOrderRef.current)
    : sortedVisibleDreamAvatars;

  const tideModalDreamAvatar =
    tideModalId === null
      ? null
      : (loadedDreamAvatars.find((dreamAvatar) => dreamAvatar.id === tideModalId) ?? null);

  const detailDreamAvatar =
    detailId === null
      ? null
      : (loadedDreamAvatars.find((dreamAvatar) => dreamAvatar.id === detailId) ?? null);

  function handleDisplayStateChange(nextState: DreamAvatarDisplayState) {
    setDisplayState(nextState);
    replaceDreamAvatarDisplayStateInUrl(nextState);
  }

  function handleOpenDetail(dreamAvatar: EditorDreamAvatarRecord) {
    setDetailId(dreamAvatar.id);
    pushDetailIdInUrl(dreamAvatar.id);
  }

  function handleCloseDetail() {
    // Prefer stepping back over the entry we pushed when opening the screen so
    // the originating list URL (filters and all) is restored exactly. When the
    // detail screen was reached directly (e.g. a shared link), there is no such
    // entry, so strip the parameter in place instead of leaving the page.
    if (isPushedDetailHistoryEntry()) {
      window.history.back();
    } else {
      setDetailId(null);
      replaceDetailIdInUrl(null);
    }
  }

  function setEditorSaveState(updater: (current: EditableSaveState) => EditableSaveState) {
    const next = updater(saveStateRef.current);
    saveStateRef.current = next;
    setSaveState(next);
  }

  function handleFieldBeginEdit(
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) => {
      let next = current;
      for (const entry of Object.values(current.fields)) {
        if (
          entry.status === "editing" &&
          !(entry.cardId === dreamAvatar.id && entry.field === field)
        ) {
          next = cancelFieldEdit(
            next,
            { cardId: entry.cardId, field: entry.field },
            entry.confirmedValue,
          );
        }
      }
      return beginFieldEdit(next, { cardId: dreamAvatar.id, field }, value);
    });
  }

  function handleFieldDraftChange(
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) =>
      updateFieldDraft(
        current,
        { cardId: dreamAvatar.id, field },
        value,
        confirmedFieldValue(dreamAvatar, field),
      ),
    );
  }

  function handleFieldCancel(
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
  ) {
    setEditorSaveState((current) =>
      cancelFieldEdit(
        current,
        { cardId: dreamAvatar.id, field },
        confirmedFieldValue(dreamAvatar, field),
      ),
    );
  }

  function handleFieldCommit(
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
    value: EditableFieldValue,
  ) {
    const validation = validateFieldSave(field, value);
    if (
      !validation.ok ||
      String(validation.value) === String(confirmedFieldValue(dreamAvatar, field))
    ) {
      handleFieldCancel(dreamAvatar, field);
      return;
    }
    handleFieldSave(dreamAvatar, field, value);
  }

  function replaceConfirmedDreamAvatar(nextDreamAvatar: EditorDreamAvatarRecord) {
    setLoadStatus((current) => {
      if (current.kind !== "loaded") {
        return current;
      }
      return {
        kind: "loaded",
        tides: current.tides,
        dreamAvatars: current.dreamAvatars.map((dreamAvatar) =>
          dreamAvatar.id === nextDreamAvatar.id ? nextDreamAvatar : dreamAvatar,
        ),
      };
    });
  }

  function handleFieldSave(
    dreamAvatar: EditorDreamAvatarRecord,
    field: EditableDreamAvatarField,
    value: EditableFieldValue,
  ) {
    const target = { cardId: dreamAvatar.id, field };
    const validation = validateFieldSave(field, value);

    if (!validation.ok) {
      setEditorSaveState((current) =>
        rejectFieldEdit(
          current,
          target,
          value,
          confirmedFieldValue(dreamAvatar, field),
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
        confirmedFieldValue(dreamAvatar, field),
      );
      clientRevision = result.clientRevision;
      return result.state;
    });

    void apiClient
      .saveEditorDreamAvatarField({ id: dreamAvatar.id, field, value: serverValue, clientRevision })
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
            confirmedFieldValue(response.dreamAvatar, field),
          ),
        );
        replaceConfirmedDreamAvatar(response.dreamAvatar);
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
                confirmedFieldValue(dreamAvatar, field),
                message,
              );
            }
            return failFieldSave(
              current,
              target,
              clientRevision,
              confirmedFieldValue(dreamAvatar, field),
              message,
            );
          });
        }
      });
  }

  function handleSaveTidePool(dreamAvatar: EditorDreamAvatarRecord, pool: EditorTidePool) {
    setTideSaveState((current) => ({ ...current, [dreamAvatar.id]: true }));
    setTideSaveError(null);

    void apiClient
      .saveEditorDreamAvatarTidePool({ id: dreamAvatar.id, pool })
      .then((response) => {
        replaceConfirmedDreamAvatar(response.dreamAvatar);
        setTideSaveState((current) => ({ ...current, [dreamAvatar.id]: false }));
        setTideModalId(null);
      })
      .catch((error: unknown) => {
        setTideSaveState((current) => ({ ...current, [dreamAvatar.id]: false }));
        setTideSaveError(errorMessageFor(error));
      });
  }

  return (
    <main
      aria-busy={loadStatus.kind === "loading"}
      className="dream-avatar-editor-shell"
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
        className="dream-avatar-editor-header"
        style={{ display: "flex", alignItems: "baseline", gap: "10px", flex: "0 0 auto" }}
      >
        <h1 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.1 }}>
          Avatar Editor
        </h1>
        <span aria-hidden="true" style={{ color: "rgba(247, 241, 223, 0.35)" }}>
          -
        </span>
        <span style={{ color: "#8edbd1", fontSize: "0.82rem", fontWeight: 600 }}>
          {loadStatus.kind === "loaded" ? activeTomlLabel : "Loading..."}
        </span>
      </header>

      <section
        className="dream-avatar-editor-content"
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
            Loading avatars...
          </p>
        ) : null}

        {loadStatus.kind === "loaded" ? (
          <div
            className="dream-avatar-editor-loaded-content"
            style={{
              display: "flex",
              flex: "1 1 auto",
              flexDirection: "column",
              gap: "12px",
              minHeight: 0,
            }}
          >
            <DreamAvatarEditorToolbar
              displayState={displayState}
              visibleCount={visibleDreamAvatars.length}
              totalCount={loadStatus.dreamAvatars.length}
              onDisplayStateChange={handleDisplayStateChange}
            />
            {visibleDreamAvatars.length === 0 ? (
              <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
                No avatars match the current filters.
              </p>
            ) : (
              <DreamAvatarEditorGrid
                dreamAvatars={visibleDreamAvatars}
                tides={tides}
                size={displayState.size}
                saveState={saveState}
                tideSaveState={tideSaveState}
                onFieldBeginEdit={handleFieldBeginEdit}
                onFieldDraftChange={handleFieldDraftChange}
                onFieldCancel={handleFieldCancel}
                onFieldSave={handleFieldSave}
                onFieldCommit={handleFieldCommit}
                onEditTides={(dreamAvatar) => {
                  setTideSaveError(null);
                  setTideModalId(dreamAvatar.id);
                }}
                onViewDetail={handleOpenDetail}
              />
            )}
          </div>
        ) : null}

        {loadStatus.kind === "error" ? (
          <div role="alert" style={{ maxWidth: "560px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>Unable to load avatars</h2>
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

      {tideModalDreamAvatar !== null ? (
        <TidePoolModal
          dreamAvatar={tideModalDreamAvatar}
          tides={tides}
          saving={tideSaveState[tideModalDreamAvatar.id] ?? false}
          saveError={tideSaveError}
          onSave={(pool) => handleSaveTidePool(tideModalDreamAvatar, pool)}
          onClose={() => {
            if (!(tideSaveState[tideModalDreamAvatar.id] ?? false)) {
              setTideModalId(null);
              setTideSaveError(null);
            }
          }}
        />
      ) : null}

      {detailDreamAvatar !== null ? (
        <DreamAvatarDetailView
          dreamAvatar={detailDreamAvatar}
          tides={tides}
          questContent={questContent}
          questContentError={questContentError}
          tideDecks={tideDecks}
          tideDecksError={tideDecksError}
          onClose={handleCloseDetail}
        />
      ) : null}
    </main>
  );
}
