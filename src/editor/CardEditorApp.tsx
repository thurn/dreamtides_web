import { useEffect, useMemo, useRef, useState } from "react";
import { loadEditorCards, saveEditorCardField } from "./editor-api";
import CardEditorGrid from "./CardEditorGrid";
import CardEditorToolbar from "./CardEditorToolbar";
import {
  parseEditorDisplayState,
  replaceEditorDisplayStateInUrl,
} from "./editor-url-state";
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
  EditableCardField,
  EditorApiClient,
  EditorCardRecord,
  EditorDisplayState,
  EditorSortField,
} from "./types";

const DEFAULT_EDITOR_API_CLIENT: EditorApiClient = {
  loadEditorCards,
  saveEditorCardField,
};

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded"; cards: EditorCardRecord[] }
  | { kind: "error"; message: string };

export interface CardEditorAppProps {
  apiClient?: EditorApiClient;
}

function errorMessageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load editor cards.";
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

function displayStateDataAttributes(displayState: EditorDisplayState) {
  return {
    "data-editor-search": displayState.searchText,
    "data-editor-type": displayState.type,
    "data-editor-cost": displayState.cost,
    "data-editor-subtype": displayState.subtype,
    "data-editor-sort": displayState.sort,
    "data-editor-dir": displayState.dir,
    "data-editor-size": displayState.size,
  };
}

function cardSearchText(card: EditorCardRecord): string {
  return `${card.name} ${card["rendered-text"]} ${card.preview.name} ${card.preview.renderedText}`;
}

function displayType(card: EditorCardRecord): string {
  return card.preview.cardType ?? card.cardType;
}

function normalizeSubtype(subtype: unknown): string {
  return typeof subtype === "string" ? subtype.trim() : "";
}

function sourceSubtype(card: EditorCardRecord): string {
  const sourceSubtype = card.source.subtype;
  return typeof sourceSubtype === "string"
    ? normalizeSubtype(sourceSubtype)
    : normalizeSubtype(card.subtype);
}

function costFilterValue(card: EditorCardRecord): string {
  const cost = card.preview.energyCost;

  if (cost === null) {
    return "x";
  }

  return cost >= 5 ? "5plus" : String(cost);
}

function sortCostValue(card: EditorCardRecord): number {
  return card.preview.energyCost ?? Number.POSITIVE_INFINITY;
}

function sortSparkValue(card: EditorCardRecord): number {
  return card.preview.spark ?? Number.POSITIVE_INFINITY;
}

function sortValue(card: EditorCardRecord, sort: EditorSortField): string | number {
  switch (sort) {
    case "cardNumber":
      return card.cardNumber;
    case "name":
      return card.name;
    case "cost":
      return sortCostValue(card);
    case "type":
      return displayType(card);
    case "subtype":
      return sourceSubtype(card);
    case "spark":
      return sortSparkValue(card);
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

function filteredAndSortedCards(
  cards: readonly EditorCardRecord[],
  displayState: EditorDisplayState,
): EditorCardRecord[] {
  const searchText = displayState.searchText.trim().toLowerCase();
  const subtypeFilter = normalizeSubtype(displayState.subtype);

  return cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => {
      if (
        searchText !== "" &&
        !cardSearchText(card).toLowerCase().includes(searchText)
      ) {
        return false;
      }

      if (
        displayState.type !== "all" &&
        displayType(card).toLowerCase() !== displayState.type
      ) {
        return false;
      }

      if (
        displayState.cost !== "all" &&
        costFilterValue(card) !== displayState.cost
      ) {
        return false;
      }

      return (
        subtypeFilter === "" ||
        sourceSubtype(card) === subtypeFilter
      );
    })
    .sort((left, right) => {
      const direction = displayState.dir === "asc" ? 1 : -1;
      const comparison =
        compareSortValues(
          sortValue(left.card, displayState.sort),
          sortValue(right.card, displayState.sort),
        ) * direction;

      return comparison === 0 ? left.index - right.index : comparison;
    })
    .map(({ card }) => card);
}

function subtypeOptionsFromCards(cards: readonly EditorCardRecord[]): string[] {
  return Array.from(
    new Set(
      cards
        .map((card) => sourceSubtype(card))
        .filter((subtype) => subtype.length > 0),
    ),
  ).sort((left, right) =>
    left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

function confirmedFieldValue(
  card: EditorCardRecord,
  field: EditableCardField,
): EditableFieldValue {
  switch (field) {
    case "energy-cost":
      return card["energy-cost"];
    case "name":
      return card.name;
    case "spark":
      return card.spark;
    case "rendered-text":
      return card["rendered-text"];
    case "subtype":
      return card.subtype;
  }
}

function validateFieldSave(
  field: EditableCardField,
  value: EditableFieldValue,
): { ok: true; value: EditableFieldValue } | { ok: false; message: string } {
  const textValue = String(value).trim();

  if (field === "name") {
    return textValue.length === 0
      ? { ok: false, message: "Name cannot be blank." }
      : { ok: true, value: textValue };
  }

  if (field === "subtype") {
    return { ok: true, value: String(value) };
  }

  if (field === "rendered-text") {
    return { ok: true, value: String(value) };
  }

  if (field === "energy-cost" || field === "spark") {
    if (field === "spark" && textValue.length === 0) {
      return { ok: true, value: "" };
    }

    if (textValue === "X" || textValue === "*") {
      return { ok: true, value: "*" };
    }

    if (/^\d+$/u.test(textValue)) {
      return { ok: true, value: Number(textValue) };
    }

    return {
      ok: false,
      message: "Enter a non-negative whole number or X.",
    };
  }

  return { ok: false, message: "This field is not editable." };
}

export default function CardEditorApp({
  apiClient = DEFAULT_EDITOR_API_CLIENT,
}: CardEditorAppProps) {
  const [displayState, setDisplayState] = useState<EditorDisplayState>(() =>
    parseEditorDisplayState(window.location.search),
  );
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({
    kind: "loading",
  });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<EditableSaveState>(
    EMPTY_EDITOR_SAVE_STATE,
  );
  const saveStateRef = useRef(saveState);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadCards() {
      setLoadStatus({ kind: "loading" });

      try {
        const cards = await apiClient.loadEditorCards(controller.signal);
        if (!cancelled) {
          setLoadStatus({ kind: "loaded", cards });
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

    void loadCards();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiClient, loadAttempt]);

  const loadedCards = loadStatus.kind === "loaded" ? loadStatus.cards : [];
  const subtypeOptions = useMemo(
    () => subtypeOptionsFromCards(loadedCards),
    [loadedCards],
  );
  const visibleCards = useMemo(
    () => filteredAndSortedCards(loadedCards, displayState),
    [loadedCards, displayState],
  );

  function handleDisplayStateChange(nextState: EditorDisplayState) {
    setDisplayState(nextState);
    replaceEditorDisplayStateInUrl(nextState);
  }

  function setEditorSaveState(
    updater: (current: EditableSaveState) => EditableSaveState,
  ) {
    const next = updater(saveStateRef.current);
    saveStateRef.current = next;
    setSaveState(next);
  }

  function handleFieldBeginEdit(
    card: EditorCardRecord,
    field: EditableCardField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) =>
      beginFieldEdit(current, { cardId: card.id, field }, value),
    );
  }

  function handleFieldDraftChange(
    card: EditorCardRecord,
    field: EditableCardField,
    value: EditableFieldValue,
  ) {
    setEditorSaveState((current) =>
      updateFieldDraft(
        current,
        { cardId: card.id, field },
        value,
        confirmedFieldValue(card, field),
      ),
    );
  }

  function handleFieldCancel(card: EditorCardRecord, field: EditableCardField) {
    setEditorSaveState((current) =>
      cancelFieldEdit(
        current,
        { cardId: card.id, field },
        confirmedFieldValue(card, field),
      ),
    );
  }

  function replaceConfirmedCard(nextCard: EditorCardRecord) {
    setLoadStatus((current) => {
      if (current.kind !== "loaded") {
        return current;
      }

      return {
        kind: "loaded",
        cards: current.cards.map((card) =>
          card.id === nextCard.id ? nextCard : card,
        ),
      };
    });
  }

  function handleFieldSave(
    card: EditorCardRecord,
    field: EditableCardField,
    value: EditableFieldValue,
  ) {
    const target = { cardId: card.id, field };
    const validation = validateFieldSave(field, value);

    if (!validation.ok) {
      setEditorSaveState((current) =>
        rejectFieldEdit(
          current,
          target,
          value,
          confirmedFieldValue(card, field),
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
        confirmedFieldValue(card, field),
      );
      clientRevision = result.clientRevision;
      return result.state;
    });

    void apiClient
      .saveEditorCardField({
        id: card.id,
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
            confirmedFieldValue(response.card, field),
          ),
        );
        replaceConfirmedCard(response.card);
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
                confirmedFieldValue(card, field),
                message,
              );
            }

            return failFieldSave(
              current,
              target,
              clientRevision,
              confirmedFieldValue(card, field),
              message,
            );
          });
        }
      });
  }

  return (
    <main
      aria-busy={loadStatus.kind === "loading"}
      className="card-editor-shell"
      data-editor-layout="responsive-scroll-shell"
      {...displayStateDataAttributes(displayState)}
      style={{
        height: "100dvh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: "32px",
        background: "#101417",
        color: "#f7f1df",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <header
        className="card-editor-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "24px",
          flex: "0 0 auto",
          borderBottom: "1px solid rgba(247, 241, 223, 0.18)",
          paddingBottom: "20px",
        }}
      >
        <div>
          <p
            style={{
              margin: "0 0 8px",
              color: "#8edbd1",
              fontSize: "0.82rem",
              fontWeight: 700,
              letterSpacing: "0",
              textTransform: "uppercase",
            }}
          >
            Source Cards
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: "2rem",
              lineHeight: 1.1,
              letterSpacing: "0",
            }}
          >
            Card Editor
          </h1>
        </div>
        {loadStatus.kind === "loaded" ? (
          <div
            aria-label="source card count"
            className="card-editor-source-count"
            style={{
              color: "#f3d46b",
              fontSize: "1rem",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {loadStatus.cards.length} source cards
          </div>
        ) : null}
      </header>

      <section
        className="card-editor-content"
        style={{
          display: "flex",
          flex: "1 1 auto",
          flexDirection: "column",
          minHeight: 0,
          paddingTop: "28px",
        }}
      >
        {loadStatus.kind === "loading" ? (
          <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
            Loading source cards...
          </p>
        ) : null}

        {loadStatus.kind === "loaded" ? (
          <div
            className="card-editor-loaded-content"
            style={{
              display: "flex",
              flex: "1 1 auto",
              flexDirection: "column",
              gap: "22px",
              minHeight: 0,
            }}
          >
            <CardEditorToolbar
              displayState={displayState}
              subtypeOptions={subtypeOptions}
              visibleCount={visibleCards.length}
              totalCount={loadStatus.cards.length}
              onDisplayStateChange={handleDisplayStateChange}
            />
            {visibleCards.length === 0 ? (
              <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
                No cards match the current filters.
              </p>
            ) : (
              <CardEditorGrid
                cards={visibleCards}
                size={displayState.size}
                saveState={saveState}
                onFieldBeginEdit={handleFieldBeginEdit}
                onFieldDraftChange={handleFieldDraftChange}
                onFieldCancel={handleFieldCancel}
                onFieldSave={handleFieldSave}
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
              Unable to load cards
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
