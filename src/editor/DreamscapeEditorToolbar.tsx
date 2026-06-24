import type { CSSProperties } from "react";
import {
  DEFAULT_DREAMSCAPE_DISPLAY_STATE,
  type DreamscapeCardSize,
  type DreamscapeDisplayState,
} from "./dreamscape-types";

interface DreamscapeEditorToolbarProps {
  displayState: DreamscapeDisplayState;
  visibleCount: number;
  totalCount: number;
  onDisplayStateChange: (state: DreamscapeDisplayState) => void;
}

const inputStyle = {
  minHeight: "36px",
  boxSizing: "border-box",
  border: "1px solid rgba(247, 241, 223, 0.28)",
  borderRadius: "6px",
  background: "#0f1719",
  color: "#fff7e0",
  padding: "0 10px",
  font: "inherit",
} satisfies CSSProperties;

const SIZES: ReadonlyArray<{ value: DreamscapeCardSize; label: string }> = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
];

function sizeButtonStyle(active: boolean): CSSProperties {
  return {
    ...inputStyle,
    minWidth: "38px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontWeight: 800,
    border: active ? "1px solid #2d8a80" : inputStyle.border,
    background: active ? "#2d8a80" : "#16242a",
    color: active ? "#ffffff" : "#d9e1dd",
  };
}

export default function DreamscapeEditorToolbar({
  displayState,
  visibleCount,
  totalCount,
  onDisplayStateChange,
}: DreamscapeEditorToolbarProps) {
  return (
    <div
      aria-label="Dreamscape editor controls"
      className="dreamscape-editor-toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap",
        flex: "0 0 auto",
      }}
    >
      <input
        type="search"
        aria-label="Search dreamscapes"
        placeholder="Search dreamscapes..."
        value={displayState.searchText}
        onChange={(event) =>
          onDisplayStateChange({ ...displayState, searchText: event.currentTarget.value })
        }
        style={{ ...inputStyle, minWidth: "240px", flex: "0 1 320px" }}
      />

      <div style={{ display: "inline-flex", gap: "4px" }} role="group" aria-label="Card size">
        {SIZES.map((size) => (
          <button
            key={size.value}
            type="button"
            aria-pressed={displayState.size === size.value}
            title={`${size.label} cards`}
            onClick={() => onDisplayStateChange({ ...displayState, size: size.value })}
            style={sizeButtonStyle(displayState.size === size.value)}
          >
            {size.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          onDisplayStateChange({
            ...displayState,
            searchText: DEFAULT_DREAMSCAPE_DISPLAY_STATE.searchText,
          })
        }
        style={{ ...inputStyle, cursor: "pointer", fontWeight: 700 }}
      >
        Clear
      </button>

      <span style={{ color: "#8edbd1", fontSize: "0.82rem", fontWeight: 600 }}>
        {visibleCount} / {totalCount}
      </span>
    </div>
  );
}
