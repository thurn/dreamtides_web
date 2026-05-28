import { useEffect, useMemo, useState } from "react";
import { CardDisplay } from "../components/CardDisplay";
import { loadEditorCards, saveEditorCardField } from "./editor-api";
import CardEditorToolbar from "./CardEditorToolbar";
import {
  parseEditorDisplayState,
  replaceEditorDisplayStateInUrl,
} from "./editor-url-state";
import type {
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

function sourceSubtype(card: EditorCardRecord): string {
  const sourceSubtype = card.source.subtype;
  return typeof sourceSubtype === "string" ? sourceSubtype : card.subtype;
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
        displayState.subtype === "" ||
        sourceSubtype(card) === displayState.subtype
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
        .map((card) => sourceSubtype(card).trim())
        .filter((subtype) => subtype.length > 0),
    ),
  ).sort((left, right) =>
    left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

function cardWidthForSize(size: EditorDisplayState["size"]): string {
  switch (size) {
    case "small":
      return "170px";
    case "large":
      return "240px";
    case "medium":
      return "204px";
  }
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

  return (
    <main
      aria-busy={loadStatus.kind === "loading"}
      {...displayStateDataAttributes(displayState)}
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: "32px",
        background: "#101417",
        color: "#f7f1df",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "24px",
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

      <section style={{ paddingTop: "28px" }}>
        {loadStatus.kind === "loading" ? (
          <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
            Loading source cards...
          </p>
        ) : null}

        {loadStatus.kind === "loaded" ? (
          <div style={{ display: "grid", gap: "22px" }}>
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
              <div
                aria-label="Filtered cards"
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidthForSize(displayState.size)}, 1fr))`,
                  gap: "18px",
                  alignItems: "start",
                }}
              >
                {visibleCards.map((card) => (
                  <article
                    key={card.id}
                    aria-label={card.name}
                    data-editor-card-id={card.id}
                    style={{
                      display: "grid",
                      gap: "10px",
                      justifyItems: "center",
                    }}
                  >
                    <CardDisplay
                      card={card.preview}
                      large={displayState.size === "large"}
                      hideRulesText={displayState.size === "small"}
                    />
                    <div
                      style={{
                        color: "#f7f1df",
                        fontSize: "0.9rem",
                        fontWeight: 800,
                        textAlign: "center",
                      }}
                    >
                      #{card.cardNumber} {card.name}
                    </div>
                  </article>
                ))}
              </div>
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
