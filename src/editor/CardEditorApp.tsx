import { useEffect, useState } from "react";
import { loadEditorCards, saveEditorCardField } from "./editor-api";
import { parseEditorDisplayState } from "./editor-url-state";
import type {
  EditorApiClient,
  EditorCardRecord,
  EditorDisplayState,
} from "./types";

type AbortableEditorApiClient = Omit<EditorApiClient, "loadEditorCards"> & {
  loadEditorCards(signal?: AbortSignal): Promise<EditorCardRecord[]>;
};

const DEFAULT_EDITOR_API_CLIENT: AbortableEditorApiClient = {
  loadEditorCards,
  saveEditorCardField,
};

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded"; cards: EditorCardRecord[] }
  | { kind: "error"; message: string };

export interface CardEditorAppProps {
  apiClient?: AbortableEditorApiClient;
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

export default function CardEditorApp({
  apiClient = DEFAULT_EDITOR_API_CLIENT,
}: CardEditorAppProps) {
  const [displayState] = useState<EditorDisplayState>(() =>
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
          <p style={{ margin: 0, color: "#c9d3cf" }}>
            Ready to browse source cards.
          </p>
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
