import { useEffect, useMemo, useRef, useState } from "react";
import {
  editorTomlParam,
  loadEditorCards,
  loadEditorTags,
  loadEditorTides,
  saveEditorCardArt,
  saveEditorCardField,
  saveEditorCardTags,
  saveEditorCardTides,
  saveEditorTagRegistry,
  saveEditorTideRegistry,
} from "./editor-api";
import CardEditorGrid from "./CardEditorGrid";
import type { CardTagSaveState } from "./CardEditorGrid";
import CardEditorToolbar from "./CardEditorToolbar";
import ArtCropEditor from "./ArtCropEditor";
import type { ArtSaveStatus } from "./ArtCropEditor";
import ManageTagsModal from "./ManageTagsModal";
import type { ArtCrop } from "../types/cards";
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
  EditorTag,
} from "./types";

const DEFAULT_EDITOR_API_CLIENT: EditorApiClient = {
  loadEditorCards,
  saveEditorCardField,
  loadEditorTags,
  saveEditorCardTags,
  loadEditorTides,
  saveEditorCardTides,
  saveEditorCardArt,
  saveEditorTagRegistry,
  saveEditorTideRegistry,
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
    "data-editor-scope": displayState.searchScope,
    "data-editor-type": displayState.type,
    "data-editor-cost": displayState.cost,
    "data-editor-subtype": displayState.subtype,
    "data-editor-tags": displayState.tagFilters.join(","),
    "data-editor-tides": displayState.tideFilters.join(","),
    "data-editor-tag-editing": String(displayState.tagEditing),
    "data-editor-tide-editing": String(displayState.tideEditing),
    "data-editor-art-editing": String(displayState.artEditing),
    "data-editor-sort": displayState.sort,
    "data-editor-dir": displayState.dir,
    "data-editor-size": displayState.size,
  };
}

function cardSearchText(
  card: EditorCardRecord,
  scope: EditorDisplayState["searchScope"],
): string {
  if (scope === "all") {
    return `${card.name} ${card["rendered-text"]} ${card.preview.name} ${card.preview.renderedText}`;
  }

  if (scope === "mtg") {
    return card.mtgName;
  }

  return `${card.name} ${card.preview.name}`;
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
    case "rulesTextLength":
      return card.preview.renderedText.length;
    case "nameLength":
      return card.name.length;
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
        !cardSearchText(card, displayState.searchScope)
          .toLowerCase()
          .includes(searchText)
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

      // Tag filters use AND semantics: a card must carry every selected tag.
      if (
        displayState.tagFilters.length > 0 &&
        !displayState.tagFilters.every((tag) => card.tags.includes(tag))
      ) {
        return false;
      }

      // Tide filtering is single-select but uses the same containment check so a
      // card must carry the selected tide to remain visible.
      if (
        displayState.tideFilters.length > 0 &&
        !displayState.tideFilters.every((tide) => card.tides.includes(tide))
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
  const activeTomlLabel = useMemo(() => {
    const param = editorTomlParam();
    const path = param ?? "rendered-cards.toml";
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
  const [tides, setTides] = useState<EditorTag[]>([]);
  const [tideSaveState, setTideSaveState] = useState<
    Record<string, CardTagSaveState>
  >({});
  const [manageTidesOpen, setManageTidesOpen] = useState(false);
  const [tideRegistrySaving, setTideRegistrySaving] = useState(false);
  const [tideRegistryError, setTideRegistryError] = useState<string | null>(
    null,
  );
  const [artEditorCardId, setArtEditorCardId] = useState<string | null>(null);
  const [artSaveStatus, setArtSaveStatus] = useState<ArtSaveStatus>("idle");
  const [artSaveError, setArtSaveError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadTags() {
      try {
        const loadedTags = await apiClient.loadEditorTags(controller.signal);
        if (!cancelled) {
          setTags(loadedTags);
        }
      } catch (error) {
        if (isAbortError(error) || cancelled) {
          return;
        }
        // A missing or unreadable registry should not break card editing; the
        // grid falls back to neutral tag colors until the registry loads.
        setTags([]);
      }
    }

    void loadTags();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiClient, loadAttempt]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadTides() {
      try {
        const loadedTides = await apiClient.loadEditorTides(controller.signal);
        if (!cancelled) {
          setTides(loadedTides);
        }
      } catch (error) {
        if (isAbortError(error) || cancelled) {
          return;
        }
        // A missing or unreadable registry should not break card editing; the
        // grid falls back to neutral tide colors until the registry loads.
        setTides([]);
      }
    }

    void loadTides();

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
  const tagUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const card of loadedCards) {
      for (const tag of card.tags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return counts;
  }, [loadedCards]);
  const tideUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const card of loadedCards) {
      for (const tide of card.tides) {
        counts[tide] = (counts[tide] ?? 0) + 1;
      }
    }
    return counts;
  }, [loadedCards]);

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
    setEditorSaveState((current) => {
      // Only one inline editor is open at a time. Clicking into a new field
      // normally blurs (and saves) the previous one first; this also closes
      // any other field still in edit mode as a safety net so two inputs can
      // never appear together.
      let next = current;
      for (const entry of Object.values(current.fields)) {
        if (
          entry.status === "editing" &&
          !(entry.cardId === card.id && entry.field === field)
        ) {
          next = cancelFieldEdit(
            next,
            { cardId: entry.cardId, field: entry.field },
            entry.confirmedValue,
          );
        }
      }
      return beginFieldEdit(next, { cardId: card.id, field }, value);
    });
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

  function handleFieldCommit(
    card: EditorCardRecord,
    field: EditableCardField,
    value: EditableFieldValue,
  ) {
    // Blur / click-away commit. An unchanged or invalid value simply closes the
    // editor without writing; a valid change is saved like an Enter confirm.
    const validation = validateFieldSave(field, value);
    if (
      !validation.ok ||
      String(validation.value) === String(confirmedFieldValue(card, field))
    ) {
      handleFieldCancel(card, field);
      return;
    }

    handleFieldSave(card, field, value);
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

  // Optimistically reflect a card facet (tags / tides) change so the chip
  // appears or disappears immediately; the server result replaces it, or a
  // failure reverts it. Tags and tides share this path, differing only in the
  // card field, the save request, and the per-card save-state setter.
  function applyCardFacet(
    card: EditorCardRecord,
    field: "tags" | "tides",
    nextValues: string[],
    runSave: (values: string[]) => Promise<{ card: EditorCardRecord }>,
    setSaveState: (
      updater: (
        current: Record<string, CardTagSaveState>,
      ) => Record<string, CardTagSaveState>,
    ) => void,
  ) {
    const previousValues = card[field];
    replaceConfirmedCard({ ...card, [field]: nextValues });
    setSaveState((current) => ({
      ...current,
      [card.id]: { saving: true, error: null },
    }));

    void runSave(nextValues)
      .then((response) => {
        replaceConfirmedCard(response.card);
        setSaveState((current) => ({
          ...current,
          [card.id]: { saving: false, error: null },
        }));
      })
      .catch((error: unknown) => {
        replaceConfirmedCard({ ...card, [field]: previousValues });
        setSaveState((current) => ({
          ...current,
          [card.id]: { saving: false, error: errorMessageFor(error) },
        }));
      });
  }

  function handleAddCardTag(card: EditorCardRecord, name: string) {
    if (card.tags.includes(name)) {
      return;
    }
    applyCardFacet(
      card,
      "tags",
      [...card.tags, name],
      (tags) => apiClient.saveEditorCardTags({ id: card.id, tags }),
      setTagSaveState,
    );
  }

  function handleRemoveCardTag(card: EditorCardRecord, name: string) {
    if (!card.tags.includes(name)) {
      return;
    }
    applyCardFacet(
      card,
      "tags",
      card.tags.filter((tag) => tag !== name),
      (tags) => apiClient.saveEditorCardTags({ id: card.id, tags }),
      setTagSaveState,
    );
  }

  function handleAddCardTide(card: EditorCardRecord, name: string) {
    if (card.tides.includes(name)) {
      return;
    }
    applyCardFacet(
      card,
      "tides",
      [...card.tides, name],
      (tides) => apiClient.saveEditorCardTides({ id: card.id, tides }),
      setTideSaveState,
    );
  }

  function handleRemoveCardTide(card: EditorCardRecord, name: string) {
    if (!card.tides.includes(name)) {
      return;
    }
    applyCardFacet(
      card,
      "tides",
      card.tides.filter((tide) => tide !== name),
      (tides) => apiClient.saveEditorCardTides({ id: card.id, tides }),
      setTideSaveState,
    );
  }

  function handleSaveTagRegistry(nextTags: EditorTag[]) {
    setRegistrySaving(true);
    setRegistryError(null);

    void apiClient
      .saveEditorTagRegistry({ tags: nextTags })
      .then((response) => {
        setTags(response.tags);
        setLoadStatus((current) =>
          current.kind === "loaded"
            ? { kind: "loaded", cards: response.cards }
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

  function handleSaveTideRegistry(nextTides: EditorTag[]) {
    setTideRegistrySaving(true);
    setTideRegistryError(null);

    void apiClient
      .saveEditorTideRegistry({ tides: nextTides })
      .then((response) => {
        setTides(response.tags);
        setLoadStatus((current) =>
          current.kind === "loaded"
            ? { kind: "loaded", cards: response.cards }
            : current,
        );
        setTideRegistrySaving(false);
        setManageTidesOpen(false);
      })
      .catch((error: unknown) => {
        setTideRegistrySaving(false);
        setTideRegistryError(errorMessageFor(error));
      });
  }

  function handleOpenArtEditor(card: EditorCardRecord) {
    setArtEditorCardId(card.id);
    setArtSaveStatus("idle");
    setArtSaveError(null);
  }

  function handleCloseArtEditor() {
    setArtEditorCardId(null);
    setArtSaveStatus("idle");
    setArtSaveError(null);
  }

  function handleArtSave(card: EditorCardRecord, art: ArtCrop) {
    setArtSaveStatus("saving");
    setArtSaveError(null);

    void apiClient
      .saveEditorCardArt({ id: card.id, art })
      .then((response) => {
        replaceConfirmedCard(response.card);
        setArtSaveStatus("saved");
      })
      .catch((error: unknown) => {
        setArtSaveStatus("error");
        setArtSaveError(errorMessageFor(error));
      });
  }

  const artEditorCard =
    artEditorCardId === null
      ? null
      : (loadedCards.find((card) => card.id === artEditorCardId) ?? null);

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
        padding: "16px 20px",
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
          Card Editor
        </h1>
        <span
          aria-hidden="true"
          style={{ color: "rgba(247, 241, 223, 0.35)" }}
        >
          ·
        </span>
        <span style={{ color: "#8edbd1", fontSize: "0.82rem", fontWeight: 600 }}>
          {loadStatus.kind === "loaded" ? activeTomlLabel : "Loading…"}
        </span>
      </header>

      <section
        className="card-editor-content"
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
              gap: "12px",
              minHeight: 0,
            }}
          >
            <CardEditorToolbar
              displayState={displayState}
              subtypeOptions={subtypeOptions}
              availableTags={tags}
              availableTides={tides}
              visibleCount={visibleCards.length}
              totalCount={loadStatus.cards.length}
              onDisplayStateChange={handleDisplayStateChange}
              onOpenManageTags={() => setManageTagsOpen(true)}
              onOpenManageTides={() => setManageTidesOpen(true)}
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
                tagEditing={displayState.tagEditing}
                tideEditing={displayState.tideEditing}
                artEditing={displayState.artEditing}
                availableTags={tags}
                availableTides={tides}
                tagSaveState={tagSaveState}
                tideSaveState={tideSaveState}
                onOpenArtEditor={handleOpenArtEditor}
                onFieldBeginEdit={handleFieldBeginEdit}
                onFieldDraftChange={handleFieldDraftChange}
                onFieldCancel={handleFieldCancel}
                onFieldSave={handleFieldSave}
                onFieldCommit={handleFieldCommit}
                onAddCardTag={handleAddCardTag}
                onRemoveCardTag={handleRemoveCardTag}
                onOpenManageTags={() => setManageTagsOpen(true)}
                onAddCardTide={handleAddCardTide}
                onRemoveCardTide={handleRemoveCardTide}
                onOpenManageTides={() => setManageTidesOpen(true)}
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

      {artEditorCard !== null ? (
        <ArtCropEditor
          card={artEditorCard}
          saveStatus={artSaveStatus}
          saveError={artSaveError}
          onSave={(art) => handleArtSave(artEditorCard, art)}
          onClose={handleCloseArtEditor}
        />
      ) : null}

      {manageTagsOpen ? (
        <ManageTagsModal
          tags={tags}
          usageCounts={tagUsageCounts}
          saving={registrySaving}
          saveError={registryError}
          onSave={handleSaveTagRegistry}
          onClose={() => {
            setManageTagsOpen(false);
            setRegistryError(null);
          }}
        />
      ) : null}

      {manageTidesOpen ? (
        <ManageTagsModal
          noun="tide"
          tags={tides}
          usageCounts={tideUsageCounts}
          saving={tideRegistrySaving}
          saveError={tideRegistryError}
          onSave={handleSaveTideRegistry}
          onClose={() => {
            setManageTidesOpen(false);
            setTideRegistryError(null);
          }}
        />
      ) : null}
    </main>
  );
}
