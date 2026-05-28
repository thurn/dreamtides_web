import type { CSSProperties } from "react";
import type {
  EditorCardSize,
  EditorCostFilter,
  EditorDisplayState,
  EditorSortDirection,
  EditorSortField,
  EditorTypeFilter,
} from "./types";

interface CardEditorToolbarProps {
  displayState: EditorDisplayState;
  subtypeOptions: string[];
  visibleCount: number;
  totalCount: number;
  onDisplayStateChange: (state: EditorDisplayState) => void;
}

const TYPE_OPTIONS: Array<{ value: EditorTypeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "character", label: "Characters" },
  { value: "event", label: "Events" },
];

const COST_OPTIONS: Array<{ value: EditorCostFilter; label: string }> = [
  { value: "all", label: "Any cost" },
  { value: "0", label: "0" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5plus", label: "5+" },
  { value: "x", label: "X" },
];

const SORT_OPTIONS: Array<{ value: EditorSortField; label: string }> = [
  { value: "cardNumber", label: "Number" },
  { value: "name", label: "Name" },
  { value: "cost", label: "Cost" },
  { value: "type", label: "Type" },
  { value: "subtype", label: "Subtype" },
  { value: "spark", label: "Spark" },
];

const SIZE_OPTIONS: Array<{ value: EditorCardSize; label: string }> = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const toolbarStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1.4fr) repeat(4, minmax(130px, auto))",
  gap: "14px",
  alignItems: "end",
  padding: "18px",
  border: "1px solid rgba(247, 241, 223, 0.18)",
  borderRadius: "8px",
  background: "rgba(18, 28, 31, 0.96)",
} satisfies CSSProperties;

const labelStyle = {
  display: "grid",
  gap: "7px",
  color: "#c9d3cf",
  fontSize: "0.82rem",
  fontWeight: 700,
} satisfies CSSProperties;

const inputStyle = {
  minHeight: "42px",
  boxSizing: "border-box",
  border: "1px solid rgba(247, 241, 223, 0.28)",
  borderRadius: "6px",
  background: "#0f1719",
  color: "#fff7e0",
  padding: "0 12px",
  font: "inherit",
} satisfies CSSProperties;

const segmentedStyle = {
  display: "inline-flex",
  minHeight: "42px",
  border: "1px solid rgba(247, 241, 223, 0.24)",
  borderRadius: "6px",
  overflow: "hidden",
} satisfies CSSProperties;

function segmentButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: "42px",
    border: 0,
    borderRight: "1px solid rgba(247, 241, 223, 0.16)",
    background: active ? "#2d8a80" : "#121c1f",
    color: active ? "#ffffff" : "#d9e1dd",
    padding: "0 13px",
    font: "inherit",
    fontWeight: 800,
    cursor: "pointer",
  };
}

export default function CardEditorToolbar({
  displayState,
  subtypeOptions,
  visibleCount,
  totalCount,
  onDisplayStateChange,
}: CardEditorToolbarProps) {
  const updateDisplayState = (patch: Partial<EditorDisplayState>) => {
    onDisplayStateChange({
      ...displayState,
      ...patch,
    });
  };

  const nextDirection: EditorSortDirection =
    displayState.dir === "asc" ? "desc" : "asc";

  return (
    <section aria-label="Card editor controls" style={toolbarStyle}>
      <label style={labelStyle}>
        Search
        <input
          aria-label="Search cards"
          type="search"
          value={displayState.searchText}
          onChange={(event) =>
            updateDisplayState({ searchText: event.currentTarget.value })
          }
          placeholder="Name or rules text"
          style={inputStyle}
        />
      </label>

      <div style={labelStyle}>
        Type
        <div aria-label="Type filter" role="group" style={segmentedStyle}>
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={displayState.type === option.value}
              onClick={() => updateDisplayState({ type: option.value })}
              style={segmentButtonStyle(displayState.type === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <label style={labelStyle}>
        Cost
        <select
          aria-label="Cost filter"
          value={displayState.cost}
          onChange={(event) =>
            updateDisplayState({
              cost: event.currentTarget.value as EditorCostFilter,
            })
          }
          style={inputStyle}
        >
          {COST_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Subtype
        <select
          aria-label="Subtype filter"
          value={displayState.subtype}
          onChange={(event) =>
            updateDisplayState({ subtype: event.currentTarget.value })
          }
          style={inputStyle}
        >
          <option value="">Any subtype</option>
          {subtypeOptions.map((subtype) => (
            <option key={subtype} value={subtype}>
              {subtype}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Sort
        <select
          aria-label="Sort field"
          value={displayState.sort}
          onChange={(event) =>
            updateDisplayState({
              sort: event.currentTarget.value as EditorSortField,
            })
          }
          style={inputStyle}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div style={labelStyle}>
        Direction
        <button
          type="button"
          aria-label="Sort direction"
          aria-pressed={displayState.dir === "desc"}
          onClick={() => updateDisplayState({ dir: nextDirection })}
          style={{
            ...inputStyle,
            cursor: "pointer",
            fontWeight: 800,
            background: displayState.dir === "desc" ? "#2d8a80" : "#121c1f",
          }}
        >
          {displayState.dir === "asc" ? "Ascending" : "Descending"}
        </button>
      </div>

      <div style={labelStyle}>
        Size
        <div aria-label="Card size" role="group" style={segmentedStyle}>
          {SIZE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={displayState.size === option.value}
              onClick={() => updateDisplayState({ size: option.value })}
              style={segmentButtonStyle(displayState.size === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div
        aria-live="polite"
        aria-label="Visible card count"
        style={{
          minHeight: "42px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          color: "#f3d46b",
          fontWeight: 800,
          whiteSpace: "nowrap",
        }}
      >
        {visibleCount} / {totalCount} cards
      </div>
    </section>
  );
}
