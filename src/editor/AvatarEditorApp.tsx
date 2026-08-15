import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadEditorAvatars,
  saveEditorAvatarField,
  saveEditorAvatarTidePool,
} from "./avatar-editor-api";
import {
  parseAvatarDisplayState,
  replaceAvatarDisplayStateInUrl,
} from "./avatar-editor-url-state";
import {
  isPushedDetailHistoryEntry,
  parseDetailIdFromUrl,
  pushDetailIdInUrl,
  replaceDetailIdInUrl,
} from "./avatar-detail-url-state";
import AvatarEditorGrid from "./AvatarEditorGrid";
import AvatarEditorToolbar from "./AvatarEditorToolbar";
import AvatarDetailView from "./AvatarDetailView";
import TidePoolModal from "./TidePoolModal";
import {
  loadJourneyContent,
  type JourneyContent,
} from "../data/journey-content";
import { loadTides4Decks } from "../data/cards-v2-database";
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
  AvatarDisplayState,
  AvatarEditorApiClient,
  AvatarSortField,
  EditableAvatarField,
  EditorAvatarRecord,
  EditorTideOption,
  EditorTidePool,
} from "./avatar-types";
import { editorTomlParam } from "./editor-api";

const DEFAULT_AVATAR_API_CLIENT: AvatarEditorApiClient = {
  loadEditorAvatars,
  saveEditorAvatarField,
  saveEditorAvatarTidePool,
};

type LoadStatus =
  | { kind: "loading" }
  | {
      kind: "loaded";
      avatars: EditorAvatarRecord[];
      tides: EditorTideOption[];
    }
  | { kind: "error"; message: string };

export interface AvatarEditorAppProps {
  apiClient?: AvatarEditorApiClient;
}

function errorMessageFor(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to load editor avatars.";
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

function avatarSearchText(
  avatar: EditorAvatarRecord,
  scope: AvatarDisplayState["searchScope"],
): string {
  if (scope === "all") {
    return `${avatar.name} ${avatar.title} ${avatar["rendered-text"]}`;
  }
  return `${avatar.name} ${avatar.title}`;
}

function sortValue(
  avatar: EditorAvatarRecord,
  sort: AvatarSortField,
): string | number {
  switch (sort) {
    case "sourceOrder":
      return avatar.sourceIndex;
    case "name":
      return avatar.name;
    case "startingEssence":
      return avatar.startingEssence;
    case "rulesTextLength":
      return avatar["rendered-text"].length;
    case "facetCount":
      return avatar.tidePool.facets.length;
  }
}

function compareSortValues(
  left: string | number,
  right: string | number,
): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function filteredAndSortedAvatars(
  avatars: readonly EditorAvatarRecord[],
  displayState: AvatarDisplayState,
): EditorAvatarRecord[] {
  const searchText = displayState.searchText.trim().toLowerCase();

  return avatars
    .map((avatar, index) => ({ avatar, index }))
    .filter(({ avatar }) => {
      if (
        searchText !== "" &&
        !avatarSearchText(avatar, displayState.searchScope)
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
          sortValue(left.avatar, displayState.sort),
          sortValue(right.avatar, displayState.sort),
        ) * direction;
      return comparison === 0 ? left.index - right.index : comparison;
    })
    .map(({ avatar }) => avatar);
}

function anyFieldEditing(saveState: EditableSaveState): boolean {
  return Object.values(saveState.fields).some(
    (entry) => entry.status === "editing" || entry.status === "saving",
  );
}

function reorderToFrozenOrder(
  avatars: readonly EditorAvatarRecord[],
  frozenOrder: readonly string[],
): EditorAvatarRecord[] {
  const rank = new Map(frozenOrder.map((id, index) => [id, index]));
  const fallback = frozenOrder.length;
  return avatars
    .map((avatar, index) => ({ avatar, index }))
    .sort((left, right) => {
      const leftRank = rank.get(left.avatar.id) ?? fallback;
      const rightRank = rank.get(right.avatar.id) ?? fallback;
      return leftRank === rightRank
        ? left.index - right.index
        : leftRank - rightRank;
    })
    .map(({ avatar }) => avatar);
}

function confirmedFieldValue(
  avatar: EditorAvatarRecord,
  field: EditableAvatarField,
): EditableFieldValue {
  switch (field) {
    case "name":
      return avatar.name;
    case "title":
      return avatar.title;
    case "rendered-text":
      return avatar["rendered-text"];
    case "image-number":
      return avatar.imageNumber;
    case "starting-essence":
      return avatar.startingEssence;
  }
}

function validateFieldSave(
  field: EditableAvatarField,
  value: EditableFieldValue,
): { ok: true; value: EditableFieldValue } | { ok: false; message: string } {
  const textValue = String(value).trim();

  if (field === "name") {
    return textValue.length === 0
      ? { ok: false, message: "Name cannot be blank." }
      : { ok: true, value: textValue };
  }

  if (field === "title") {
    return textValue.length === 0
      ? { ok: false, message: "Title cannot be blank." }
      : { ok: true, value: textValue };
  }

  if (field === "rendered-text") {
    const paragraphs = String(value).split("\n\n");
    return paragraphs.some((paragraph) => paragraph.trim().length === 0)
      ? {
          ok: false,
          message: "Ability text must contain non-empty paragraphs.",
        }
      : { ok: true, value: String(value) };
  }

  if (field === "image-number") {
    if (!/^\d+$/u.test(textValue)) {
      return { ok: false, message: "Image number must be digits, e.g. 0083." };
    }
    const image = Number(textValue);
    return image >= 1 && image <= 9999
      ? { ok: true, value: textValue }
      : { ok: false, message: "Image number must be between 0001 and 9999." };
  }

  if (field === "starting-essence") {
    return /^\d+$/u.test(textValue)
      ? { ok: true, value: Number(textValue) }
      : {
          ok: false,
          message: "Starting essence must be a non-negative whole number.",
        };
  }

  return { ok: false, message: "This field is not editable." };
}

export default function AvatarEditorApp({
  apiClient = DEFAULT_AVATAR_API_CLIENT,
}: AvatarEditorAppProps) {
  const [displayState, setDisplayState] = useState<AvatarDisplayState>(
    () => parseAvatarDisplayState(window.location.search),
  );
  const activeTomlLabel = useMemo(() => {
    const param = editorTomlParam();
    const path = param ?? "avatars.ron";
    const fileName = path.split(/[\\/]/u).pop();
    return fileName !== undefined && fileName !== "" ? fileName : path;
  }, []);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<EditableSaveState>(
    EMPTY_EDITOR_SAVE_STATE,
  );
  const saveStateRef = useRef(saveState);
  const [tideModalId, setTideModalId] = useState<string | null>(null);
  const [tideSaveState, setTideSaveState] = useState<Record<string, boolean>>(
    {},
  );
  const [tideSaveError, setTideSaveError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(() =>
    parseDetailIdFromUrl(window.location.search),
  );
  const [journeyContent, setJourneyContent] = useState<JourneyContent | null>(
    null,
  );
  const [journeyContentError, setJourneyContentError] = useState<string | null>(
    null,
  );
  const [tideDecks, setTideDecks] = useState<Tides4DecksJson | null>(null);
  const [tideDecksError, setTideDecksError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoadStatus({ kind: "loading" });
      try {
        const response = await apiClient.loadEditorAvatars(
          controller.signal,
        );
        if (!cancelled) {
          setLoadStatus({
            kind: "loaded",
            avatars: response.avatars,
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

  // The detail screen resolves each Avatar's signature cards from the same
  // journey content the battle integration loads. Fetch it lazily the first time
  // a detail screen is opened so the editor's normal load path is unaffected.
  useEffect(() => {
    if (
      detailId === null ||
      journeyContent !== null ||
      journeyContentError !== null
    ) {
      return;
    }
    let cancelled = false;
    loadJourneyContent()
      .then((loaded) => {
        if (!cancelled) {
          setJourneyContent(loaded);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setJourneyContentError(errorMessageFor(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detailId, journeyContent, journeyContentError]);

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

  const loadedAvatars =
    loadStatus.kind === "loaded" ? loadStatus.avatars : [];
  const tides = loadStatus.kind === "loaded" ? loadStatus.tides : [];
  const sortedVisibleAvatars = useMemo(
    () => filteredAndSortedAvatars(loadedAvatars, displayState),
    [loadedAvatars, displayState],
  );

  const editing = anyFieldEditing(saveState);
  const frozenOrderRef = useRef<string[]>([]);
  if (!editing) {
    frozenOrderRef.current = sortedVisibleAvatars.map(
      (avatar) => avatar.id,
    );
  }
  const visibleAvatars = editing
    ? reorderToFrozenOrder(sortedVisibleAvatars, frozenOrderRef.current)
    : sortedVisibleAvatars;

  const tideModalAvatar =
    tideModalId === null
      ? null
      : (loadedAvatars.find(
          (avatar) => avatar.id === tideModalId,
        ) ?? null);

  const detailAvatar =
    detailId === null
      ? null
      : (loadedAvatars.find(
          (avatar) => avatar.id === detailId,
        ) ?? null);

  function handleDisplayStateChange(nextState: AvatarDisplayState) {
    setDisplayState(nextState);
    replaceAvatarDisplayStateInUrl(nextState);
  }

  function handleOpenDetail(avatar: EditorAvatarRecord) {
    setDetailId(avatar.id);
    pushDetailIdInUrl(avatar.id);
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

  function setEditorSaveState(
    updater: (current: EditableSaveState) => EditableSaveState,
  ) {
    const next = updater(saveStateRef.current);
    saveStateRef.current = next;
    setSaveState(next);
  }

  function handleFieldBeginEdit(
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) => {
      let next = current;
      for (const entry of Object.values(current.fields)) {
        if (
          entry.status === "editing" &&
          !(entry.cardId === avatar.id && entry.field === field)
        ) {
          next = cancelFieldEdit(
            next,
            { cardId: entry.cardId, field: entry.field },
            entry.confirmedValue,
          );
        }
      }
      return beginFieldEdit(next, { cardId: avatar.id, field }, value);
    });
  }

  function handleFieldDraftChange(
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) =>
      updateFieldDraft(
        current,
        { cardId: avatar.id, field },
        value,
        confirmedFieldValue(avatar, field),
      ),
    );
  }

  function handleFieldCancel(
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
  ) {
    setEditorSaveState((current) =>
      cancelFieldEdit(
        current,
        { cardId: avatar.id, field },
        confirmedFieldValue(avatar, field),
      ),
    );
  }

  function handleFieldCommit(
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
    value: EditableFieldValue,
  ) {
    const validation = validateFieldSave(field, value);
    if (
      !validation.ok ||
      String(validation.value) ===
        String(confirmedFieldValue(avatar, field))
    ) {
      handleFieldCancel(avatar, field);
      return;
    }
    handleFieldSave(avatar, field, value);
  }

  function replaceConfirmedAvatar(
    nextAvatar: EditorAvatarRecord,
  ) {
    setLoadStatus((current) => {
      if (current.kind !== "loaded") {
        return current;
      }
      return {
        kind: "loaded",
        tides: current.tides,
        avatars: current.avatars.map((avatar) =>
          avatar.id === nextAvatar.id ? nextAvatar : avatar,
        ),
      };
    });
  }

  function handleFieldSave(
    avatar: EditorAvatarRecord,
    field: EditableAvatarField,
    value: EditableFieldValue,
  ) {
    const target = { cardId: avatar.id, field };
    const validation = validateFieldSave(field, value);

    if (!validation.ok) {
      setEditorSaveState((current) =>
        rejectFieldEdit(
          current,
          target,
          value,
          confirmedFieldValue(avatar, field),
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
        confirmedFieldValue(avatar, field),
      );
      clientRevision = result.clientRevision;
      return result.state;
    });

    void apiClient
      .saveEditorAvatarField({
        id: avatar.id,
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
            confirmedFieldValue(response.avatar, field),
          ),
        );
        replaceConfirmedAvatar(response.avatar);
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
                confirmedFieldValue(avatar, field),
                message,
              );
            }
            return failFieldSave(
              current,
              target,
              clientRevision,
              confirmedFieldValue(avatar, field),
              message,
            );
          });
        }
      });
  }

  function handleSaveTidePool(
    avatar: EditorAvatarRecord,
    pool: EditorTidePool,
  ) {
    setTideSaveState((current) => ({ ...current, [avatar.id]: true }));
    setTideSaveError(null);

    void apiClient
      .saveEditorAvatarTidePool({ id: avatar.id, pool })
      .then((response) => {
        replaceConfirmedAvatar(response.avatar);
        setTideSaveState((current) => ({
          ...current,
          [avatar.id]: false,
        }));
        setTideModalId(null);
      })
      .catch((error: unknown) => {
        setTideSaveState((current) => ({
          ...current,
          [avatar.id]: false,
        }));
        setTideSaveError(errorMessageFor(error));
      });
  }

  return (
    <main
      aria-busy={loadStatus.kind === "loading"}
      className="avatar-editor-shell"
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
        className="avatar-editor-header"
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
          }}
        >
          Avatar Editor
        </h1>
        <span aria-hidden="true" style={{ color: "rgba(247, 241, 223, 0.35)" }}>
          -
        </span>
        <span
          style={{ color: "#8edbd1", fontSize: "0.82rem", fontWeight: 600 }}
        >
          {loadStatus.kind === "loaded" ? activeTomlLabel : "Loading..."}
        </span>
      </header>

      <section
        className="avatar-editor-content"
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
            className="avatar-editor-loaded-content"
            style={{
              display: "flex",
              flex: "1 1 auto",
              flexDirection: "column",
              gap: "12px",
              minHeight: 0,
            }}
          >
            <AvatarEditorToolbar
              displayState={displayState}
              visibleCount={visibleAvatars.length}
              totalCount={loadStatus.avatars.length}
              onDisplayStateChange={handleDisplayStateChange}
            />
            {visibleAvatars.length === 0 ? (
              <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
                No avatars match the current filters.
              </p>
            ) : (
              <AvatarEditorGrid
                avatars={visibleAvatars}
                tides={tides}
                size={displayState.size}
                saveState={saveState}
                tideSaveState={tideSaveState}
                onFieldBeginEdit={handleFieldBeginEdit}
                onFieldDraftChange={handleFieldDraftChange}
                onFieldCancel={handleFieldCancel}
                onFieldSave={handleFieldSave}
                onFieldCommit={handleFieldCommit}
                onEditTides={(avatar) => {
                  setTideSaveError(null);
                  setTideModalId(avatar.id);
                }}
                onViewDetail={handleOpenDetail}
              />
            )}
          </div>
        ) : null}

        {loadStatus.kind === "error" ? (
          <div role="alert" style={{ maxWidth: "560px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>
              Unable to load avatars
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

      {tideModalAvatar !== null ? (
        <TidePoolModal
          avatar={tideModalAvatar}
          tides={tides}
          saving={tideSaveState[tideModalAvatar.id] ?? false}
          saveError={tideSaveError}
          onSave={(pool) => handleSaveTidePool(tideModalAvatar, pool)}
          onClose={() => {
            if (!(tideSaveState[tideModalAvatar.id] ?? false)) {
              setTideModalId(null);
              setTideSaveError(null);
            }
          }}
        />
      ) : null}

      {detailAvatar !== null ? (
        <AvatarDetailView
          avatar={detailAvatar}
          tides={tides}
          journeyContent={journeyContent}
          journeyContentError={journeyContentError}
          tideDecks={tideDecks}
          tideDecksError={tideDecksError}
          onClose={handleCloseDetail}
        />
      ) : null}
    </main>
  );
}
