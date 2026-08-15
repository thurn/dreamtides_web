import { useEffect, useMemo, useRef, useState } from "react";
import {
  assignDreamscapeDreamAvatar,
  loadEditorDreamscapes,
  saveEditorDreamscapeField,
} from "./dreamscape-editor-api";
import DreamscapeEditorToolbar from "./DreamscapeEditorToolbar";
import EditableDreamscape from "./EditableDreamscape";
import {
  parseDreamscapeDisplayState,
  replaceDreamscapeDisplayStateInUrl,
} from "./dreamscape-editor-url-state";
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
  DreamAvatarAssignmentAction,
  DreamscapeCatalog,
  DreamscapeDisplayState,
  EditableDreamscapeField,
  EditorDreamscapeRecord,
} from "./dreamscape-types";
import type { DreamAvatarId } from "../types/identifiers";
import type { DreamscapeEditorApiClient } from "./dreamscape-types";

const DEFAULT_DREAMSCAPE_API_CLIENT: DreamscapeEditorApiClient = {
  loadEditorDreamscapes,
  saveEditorDreamscapeField,
  assignDreamscapeDreamAvatar,
};

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded"; catalog: DreamscapeCatalog }
  | { kind: "error"; message: string };

export interface DreamscapeEditorAppProps {
  apiClient?: DreamscapeEditorApiClient;
}

function errorMessageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load dreamscapes.";
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
  record: EditorDreamscapeRecord,
  field: EditableDreamscapeField,
): EditableFieldValue {
  switch (field) {
    case "name":
      return record.name;
    case "signature-site":
      return record["signature-site"];
    case "guide-id":
      return record["guide-id"] ?? "";
    case "affiliation-id":
      return record["affiliation-id"] ?? "";
  }
}

function validateFieldSave(
  field: EditableDreamscapeField,
  value: EditableFieldValue,
): { ok: true; value: EditableFieldValue } | { ok: false; message: string } {
  const text = String(value).trim();
  if (field === "name" && text.length === 0) {
    return { ok: false, message: "Name cannot be blank." };
  }
  if (
    (field === "signature-site" ||
      field === "guide-id" ||
      field === "affiliation-id") &&
    text.length === 0
  ) {
    return { ok: false, message: "Please choose a value." };
  }
  return { ok: true, value: text };
}

function filteredDreamscapes(
  dreamscapes: readonly EditorDreamscapeRecord[],
  displayState: DreamscapeDisplayState,
): EditorDreamscapeRecord[] {
  const searchText = displayState.searchText.trim().toLowerCase();
  if (searchText === "") {
    return [...dreamscapes];
  }
  return dreamscapes.filter((record) => {
    const haystack =
      `${record.name} ${record.id} ${record["signature-site"]} ` +
      `${record["guide-id"] ?? ""} ${record["affiliation-id"] ?? ""}`.toLowerCase();
    return haystack.includes(searchText);
  });
}

const CARD_WIDTH: Record<DreamscapeDisplayState["size"], string> = {
  small: "260px",
  medium: "330px",
  large: "420px",
};

export default function DreamscapeEditorApp({
  apiClient = DEFAULT_DREAMSCAPE_API_CLIENT,
}: DreamscapeEditorAppProps) {
  const [displayState, setDisplayState] = useState<DreamscapeDisplayState>(() =>
    parseDreamscapeDisplayState(window.location.search),
  );
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<EditableSaveState>(
    EMPTY_EDITOR_SAVE_STATE,
  );
  const saveStateRef = useRef(saveState);
  // Per-dreamscape resident-reassignment feedback (one in-flight op at a time).
  const [residentPendingId, setResidentPendingId] = useState<string | null>(
    null,
  );
  const [residentErrors, setResidentErrors] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoadStatus({ kind: "loading" });
      try {
        const catalog = await apiClient.loadEditorDreamscapes(
          controller.signal,
        );
        if (!cancelled) {
          setLoadStatus({ kind: "loaded", catalog });
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

  const catalog = loadStatus.kind === "loaded" ? loadStatus.catalog : null;
  const dreamscapes = catalog?.dreamscapes ?? [];
  const visible = useMemo(
    () => filteredDreamscapes(dreamscapes, displayState),
    [dreamscapes, displayState],
  );

  // DreamAvatar id -> the name of the region that currently hosts it,
  // so each resident picker can show where a caller lives before it is moved.
  const regionNameByDreamAvatar = useMemo(() => {
    const map = new Map<DreamAvatarId, string>();
    for (const dreamscape of dreamscapes) {
      for (const dreamAvatarId of dreamscape.dreamAvatarIds) {
        map.set(dreamAvatarId, dreamscape.name);
      }
    }
    return map;
  }, [dreamscapes]);

  function setEditorSaveState(
    updater: (current: EditableSaveState) => EditableSaveState,
  ) {
    const next = updater(saveStateRef.current);
    saveStateRef.current = next;
    setSaveState(next);
  }

  function handleDisplayStateChange(nextState: DreamscapeDisplayState) {
    setDisplayState(nextState);
    replaceDreamscapeDisplayStateInUrl(nextState);
  }

  function handleFieldBeginEdit(
    record: EditorDreamscapeRecord,
    field: EditableDreamscapeField,
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
    record: EditorDreamscapeRecord,
    field: EditableDreamscapeField,
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
    record: EditorDreamscapeRecord,
    field: EditableDreamscapeField,
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
    record: EditorDreamscapeRecord,
    field: EditableDreamscapeField,
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

  function replaceConfirmed(next: EditorDreamscapeRecord) {
    setLoadStatus((current) => {
      if (current.kind !== "loaded") {
        return current;
      }
      return {
        kind: "loaded",
        catalog: {
          ...current.catalog,
          dreamscapes: current.catalog.dreamscapes.map((record) =>
            record.id === next.id ? next : record,
          ),
        },
      };
    });
  }

  function handleAssignDreamAvatar(
    record: EditorDreamscapeRecord,
    action: DreamAvatarAssignmentAction,
    params: { inId?: DreamAvatarId; outId?: DreamAvatarId },
  ) {
    if (residentPendingId !== null) {
      return;
    }
    setResidentPendingId(record.id);
    setResidentErrors((current) => {
      const { [record.id]: _removed, ...rest } = current;
      return rest;
    });

    void apiClient
      .assignDreamscapeDreamAvatar({
        dreamscapeId: record.id,
        action,
        ...params,
      })
      .then((response) => {
        // A reassignment can move a caller between two regions, so the response
        // returns the full roster; re-sync every dreamscape from it.
        setLoadStatus((current) =>
          current.kind === "loaded"
            ? {
                kind: "loaded",
                catalog: {
                  ...current.catalog,
                  dreamscapes: response.dreamscapes,
                },
              }
            : current,
        );
      })
      .catch((error: unknown) => {
        setResidentErrors((current) => ({
          ...current,
          [record.id]: errorMessageFor(error),
        }));
      })
      .finally(() => {
        setResidentPendingId((current) =>
          current === record.id ? null : current,
        );
      });
  }

  function handleFieldSave(
    record: EditorDreamscapeRecord,
    field: EditableDreamscapeField,
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

    if (
      String(validation.value) === String(confirmedFieldValue(record, field))
    ) {
      handleFieldCancel(record, field);
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
      .saveEditorDreamscapeField({
        id: record.id,
        field,
        value: String(serverValue),
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
            confirmedFieldValue(response.dreamscape, field),
          ),
        );
        if (response.dreamscapes !== undefined) {
          setLoadStatus((current) =>
            current.kind === "loaded"
              ? {
                  kind: "loaded",
                  catalog: {
                    ...current.catalog,
                    dreamscapes:
                      response.dreamscapes ?? current.catalog.dreamscapes,
                    guides: response.guides ?? current.catalog.guides,
                  },
                }
              : current,
          );
        } else {
          replaceConfirmed(response.dreamscape);
        }
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

  return (
    <main
      aria-busy={loadStatus.kind === "loading"}
      className="dreamscape-editor-shell"
      data-editor-search={displayState.searchText}
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
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flex: "0 0 auto",
          flexWrap: "wrap",
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
          Dreamscape Editor
        </h1>
        <span aria-hidden="true" style={{ color: "rgba(247, 241, 223, 0.35)" }}>
          -
        </span>
        <span
          style={{ color: "#8edbd1", fontSize: "0.82rem", fontWeight: 600 }}
        >
          {loadStatus.kind === "loaded" ? "dreamscapes.ron" : "Loading..."}
        </span>
        <span
          style={{ color: "#6f7a76", fontSize: "0.76rem", marginLeft: "6px" }}
        >
          Double-click the name or site icon to edit. Pick a site, guide, or
          affiliation from its dropdown.
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
            Loading dreamscapes...
          </p>
        ) : null}

        {loadStatus.kind === "loaded" && catalog !== null ? (
          <>
            <DreamscapeEditorToolbar
              displayState={displayState}
              visibleCount={visible.length}
              totalCount={catalog.dreamscapes.length}
              onDisplayStateChange={handleDisplayStateChange}
            />
            {visible.length === 0 ? (
              <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
                No dreamscapes match the current search.
              </p>
            ) : (
              <div
                data-dreamscape-grid="true"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "18px",
                  alignContent: "flex-start",
                  alignItems: "flex-start",
                  overflowY: "auto",
                  minHeight: 0,
                  paddingBottom: "24px",
                }}
              >
                {visible.map((record) => (
                  <div
                    key={record.id}
                    style={{
                      width: CARD_WIDTH[displayState.size],
                      flex: "0 0 auto",
                    }}
                  >
                    <EditableDreamscape
                      record={record}
                      size={displayState.size}
                      guides={catalog.guides}
                      affiliations={catalog.affiliations}
                      siteTypes={catalog.siteTypes}
                      dreamAvatars={catalog.dreamAvatars}
                      regionNameByDreamAvatar={regionNameByDreamAvatar}
                      residentStatus={{
                        pending: residentPendingId === record.id,
                        message: residentErrors[record.id] ?? null,
                      }}
                      onAssignDreamAvatar={handleAssignDreamAvatar}
                      saveEntryFor={(field) =>
                        fieldSaveEntry(saveState, { cardId: record.id, field })
                      }
                      onFieldBeginEdit={handleFieldBeginEdit}
                      onFieldDraftChange={handleFieldDraftChange}
                      onFieldCancel={handleFieldCancel}
                      onFieldSave={handleFieldSave}
                      onFieldCommit={handleFieldCommit}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}

        {loadStatus.kind === "error" ? (
          <div role="alert" style={{ maxWidth: "560px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>
              Unable to load dreamscapes
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
    </main>
  );
}
