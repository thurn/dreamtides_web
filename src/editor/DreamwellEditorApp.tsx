import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { DreamwellCardView } from "../components/DreamwellCardView";
import {
  loadEditorDreamwell,
  saveEditorDreamwellField,
} from "./dreamwell-editor-api";
import DreamwellCardEditor from "./DreamwellCardEditor";
import {
  dreamwellPreviewCard,
  type DreamwellDisplayState,
  type DreamwellEditorApiClient,
  type DreamwellSortField,
  type EditorDreamwellRecord,
  type SavableDreamwellField,
} from "./dreamwell-types";
import { editorTomlParam } from "./editor-api";

const DEFAULT_DREAMWELL_API_CLIENT: DreamwellEditorApiClient = {
  loadEditorDreamwell,
  saveEditorDreamwellField,
};

type LoadStatus =
  | { kind: "loading" }
  | { kind: "loaded"; dreamwell: EditorDreamwellRecord[] }
  | { kind: "error"; message: string };

export interface DreamwellEditorAppProps {
  apiClient?: DreamwellEditorApiClient;
}

const DEFAULT_DISPLAY_STATE: DreamwellDisplayState = {
  searchText: "",
  sort: "sourceOrder",
  dir: "asc",
  size: "medium",
};

function errorMessageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load Dreamwell cards.";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function sortValue(
  record: EditorDreamwellRecord,
  sort: DreamwellSortField,
): string | number {
  switch (sort) {
    case "sourceOrder":
      return record.sourceIndex;
    case "name":
      return record.name;
    case "energyAdded":
      return record["energy-added"];
    case "order":
      return record.order;
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

function filteredAndSorted(
  dreamwell: readonly EditorDreamwellRecord[],
  displayState: DreamwellDisplayState,
): EditorDreamwellRecord[] {
  const searchText = displayState.searchText.trim().toLowerCase();

  return dreamwell
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => {
      if (searchText === "") {
        return true;
      }
      const haystack = `${record.name} ${record["rendered-text"]}`.toLowerCase();
      return haystack.includes(searchText);
    })
    .sort((left, right) => {
      const direction = displayState.dir === "asc" ? 1 : -1;
      const comparison =
        compareSortValues(
          sortValue(left.record, displayState.sort),
          sortValue(right.record, displayState.sort),
        ) * direction;
      return comparison === 0 ? left.index - right.index : comparison;
    })
    .map(({ record }) => record);
}

const CARD_WIDTH: Record<DreamwellDisplayState["size"], string> = {
  small: "180px",
  medium: "240px",
  large: "320px",
};

export default function DreamwellEditorApp({
  apiClient = DEFAULT_DREAMWELL_API_CLIENT,
}: DreamwellEditorAppProps) {
  const [displayState, setDisplayState] =
    useState<DreamwellDisplayState>(DEFAULT_DISPLAY_STATE);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeTomlLabel = useMemo(() => {
    const param = editorTomlParam();
    const path = param ?? "dreamwell.toml";
    const fileName = path.split(/[\\/]/u).pop();
    return fileName !== undefined && fileName !== "" ? fileName : path;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoadStatus({ kind: "loading" });
      try {
        const dreamwell = await apiClient.loadEditorDreamwell(controller.signal);
        if (!cancelled) {
          setLoadStatus({ kind: "loaded", dreamwell });
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

  const loadedDreamwell =
    loadStatus.kind === "loaded" ? loadStatus.dreamwell : [];
  const visible = useMemo(
    () => filteredAndSorted(loadedDreamwell, displayState),
    [loadedDreamwell, displayState],
  );

  const selectedRecord =
    selectedId === null
      ? null
      : (loadedDreamwell.find((record) => record.id === selectedId) ?? null);

  function replaceConfirmed(next: EditorDreamwellRecord) {
    setLoadStatus((current) => {
      if (current.kind !== "loaded") {
        return current;
      }
      return {
        kind: "loaded",
        dreamwell: current.dreamwell.map((record) =>
          record.id === next.id ? next : record,
        ),
      };
    });
  }

  async function handleSave(
    record: EditorDreamwellRecord,
    field: SavableDreamwellField,
    value: string | number,
  ): Promise<void> {
    const response = await apiClient.saveEditorDreamwellField({
      id: record.id,
      field,
      value,
    });
    replaceConfirmed(response.dreamwell);
  }

  return (
    <main
      aria-busy={loadStatus.kind === "loading"}
      className="dreamwell-editor-shell"
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
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flex: "0 0 auto",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.1 }}>
          Dreamwell Editor
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
            Loading Dreamwell cards...
          </p>
        ) : null}

        {loadStatus.kind === "loaded" ? (
          <>
            <DreamwellEditorToolbar
              displayState={displayState}
              visibleCount={visible.length}
              totalCount={loadStatus.dreamwell.length}
              onChange={setDisplayState}
            />
            {visible.length === 0 ? (
              <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
                No Dreamwell cards match the current search.
              </p>
            ) : (
              <div
                data-dreamwell-grid="true"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: displayState.size === "large" ? "22px" : "16px",
                  alignContent: "flex-start",
                  overflowY: "auto",
                  minHeight: 0,
                  paddingBottom: "24px",
                }}
              >
                {visible.map((record) => (
                  <DreamwellGridTile
                    key={record.id}
                    record={record}
                    width={CARD_WIDTH[displayState.size]}
                    onSelect={() => setSelectedId(record.id)}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}

        {loadStatus.kind === "error" ? (
          <div role="alert" style={{ maxWidth: "560px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>
              Unable to load Dreamwell cards
            </h2>
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

      {selectedRecord !== null ? (
        <DreamwellCardEditor
          record={selectedRecord}
          onSave={(field, value) => handleSave(selectedRecord, field, value)}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </main>
  );
}

interface DreamwellGridTileProps {
  record: EditorDreamwellRecord;
  width: string;
  onSelect: () => void;
}

function DreamwellGridTile({ record, width, onSelect }: DreamwellGridTileProps) {
  return (
    <div style={{ width, flex: "0 0 auto" }}>
      <button
        type="button"
        data-dreamwell-tile={record.id}
        aria-label={`Edit ${record.name}`}
        onClick={onSelect}
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          borderRadius: "12px",
        }}
      >
        <DreamwellCardView card={dreamwellPreviewCard(record)} />
      </button>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "8px",
          marginTop: "8px",
          fontSize: "0.72rem",
          color: "#8a948f",
        }}
      >
        <span>slot {record.order}</span>
        <span aria-hidden="true">·</span>
        <span>+{record["energy-added"]} ●</span>
      </div>
    </div>
  );
}

interface DreamwellEditorToolbarProps {
  displayState: DreamwellDisplayState;
  visibleCount: number;
  totalCount: number;
  onChange: (next: DreamwellDisplayState) => void;
}

function DreamwellEditorToolbar({
  displayState,
  visibleCount,
  totalCount,
  onChange,
}: DreamwellEditorToolbarProps) {
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
        placeholder="Search Dreamwell cards..."
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
              sort: event.target.value as DreamwellSortField,
            })
          }
          style={controlStyle}
        >
          <option value="sourceOrder">Catalog order</option>
          <option value="name">Name</option>
          <option value="energyAdded">Energy added</option>
          <option value="order">Deck order</option>
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
              size: event.target.value as DreamwellDisplayState["size"],
            })
          }
          style={controlStyle}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </label>
      <span style={{ fontSize: "0.78rem", color: "#8a948f", marginLeft: "auto" }}>
        {visibleCount} / {totalCount}
      </span>
    </div>
  );
}
