import { useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DEFAULT_EDITOR_DISPLAY_STATE } from "./editor-url-state";
import TagFilterControl from "./TagFilterControl";
import type {
  EditorCardSize,
  EditorCostFilter,
  EditorDisplayState,
  EditorSortField,
  EditorTag,
  EditorTypeFilter,
} from "./types";

interface CardEditorToolbarProps {
  displayState: EditorDisplayState;
  subtypeOptions: string[];
  availableTags: EditorTag[];
  visibleCount: number;
  totalCount: number;
  onDisplayStateChange: (state: EditorDisplayState) => void;
  onOpenManageTags: () => void;
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
  { value: "name", label: "Name" },
  { value: "cardNumber", label: "Number" },
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
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  flex: "0 0 auto",
} satisfies CSSProperties;

const barStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  padding: "8px 12px",
  border: "1px solid rgba(247, 241, 223, 0.16)",
  borderRadius: "8px",
  background: "rgba(18, 28, 31, 0.96)",
} satisfies CSSProperties;

const panelStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  gap: "14px",
  padding: "14px",
  border: "1px solid rgba(247, 241, 223, 0.16)",
  borderRadius: "8px",
  background: "rgba(18, 28, 31, 0.96)",
} satisfies CSSProperties;

const labelStyle = {
  display: "grid",
  gap: "6px",
  minWidth: 0,
  color: "#c9d3cf",
  fontSize: "0.78rem",
  fontWeight: 700,
} satisfies CSSProperties;

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

const segmentedStyle = {
  display: "inline-flex",
  width: "fit-content",
  boxSizing: "border-box",
  minHeight: "36px",
  border: "1px solid rgba(247, 241, 223, 0.24)",
  borderRadius: "6px",
  overflow: "hidden",
} satisfies CSSProperties;

function segmentButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: "34px",
    border: 0,
    borderRight: "1px solid rgba(247, 241, 223, 0.16)",
    background: active ? "#2d8a80" : "#16242a",
    color: active ? "#ffffff" : "#d9e1dd",
    padding: "0 12px",
    font: "inherit",
    fontWeight: 800,
    fontSize: "0.82rem",
    cursor: "pointer",
  };
}

interface SegmentButtonProps {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}

function SegmentButton({ active, children, onClick }: SegmentButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={segmentButtonStyle(active)}
    >
      {children}
    </button>
  );
}

/** Display-state fields treated as "filters" by the Filters chip and Clear. */
function activeFilterCount(state: EditorDisplayState): number {
  let count = 0;
  if (state.searchText.trim() !== DEFAULT_EDITOR_DISPLAY_STATE.searchText) {
    count += 1;
  }
  if (state.searchScope !== DEFAULT_EDITOR_DISPLAY_STATE.searchScope) {
    count += 1;
  }
  if (state.type !== DEFAULT_EDITOR_DISPLAY_STATE.type) {
    count += 1;
  }
  if (state.cost !== DEFAULT_EDITOR_DISPLAY_STATE.cost) {
    count += 1;
  }
  if (state.subtype !== DEFAULT_EDITOR_DISPLAY_STATE.subtype) {
    count += 1;
  }
  count += state.tagFilters.length;
  if (state.sort !== DEFAULT_EDITOR_DISPLAY_STATE.sort) {
    count += 1;
  }
  if (state.dir !== DEFAULT_EDITOR_DISPLAY_STATE.dir) {
    count += 1;
  }
  return count;
}

export default function CardEditorToolbar({
  displayState,
  subtypeOptions,
  availableTags,
  visibleCount,
  totalCount,
  onDisplayStateChange,
  onOpenManageTags,
}: CardEditorToolbarProps) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(
    () => activeFilterCount(displayState) > 0,
  );

  const loadedSubtypeOptions = subtypeOptions.filter(
    (subtype) => subtype.trim().length > 0,
  );
  const visibleSubtypeOptions =
    displayState.subtype !== "" &&
    !loadedSubtypeOptions.includes(displayState.subtype)
      ? [displayState.subtype, ...loadedSubtypeOptions]
      : loadedSubtypeOptions;

  const updateDisplayState = (patch: Partial<EditorDisplayState>) => {
    onDisplayStateChange({
      ...displayState,
      ...patch,
    });
  };

  const filterCount = activeFilterCount(displayState);
  const isDescending = displayState.dir === "desc";

  const clearFilters = () => {
    // Reset every search/filter/sort field to its default while preserving the
    // card-size view preference, which lives in the always-visible bar.
    updateDisplayState({
      searchText: DEFAULT_EDITOR_DISPLAY_STATE.searchText,
      searchScope: DEFAULT_EDITOR_DISPLAY_STATE.searchScope,
      type: DEFAULT_EDITOR_DISPLAY_STATE.type,
      cost: DEFAULT_EDITOR_DISPLAY_STATE.cost,
      subtype: DEFAULT_EDITOR_DISPLAY_STATE.subtype,
      tagFilters: [],
      sort: DEFAULT_EDITOR_DISPLAY_STATE.sort,
      dir: DEFAULT_EDITOR_DISPLAY_STATE.dir,
    });
  };

  return (
    <section
      aria-label="Card editor controls"
      className="card-editor-toolbar"
      style={toolbarStyle}
    >
      <div className="card-editor-toolbar-bar" style={barStyle}>
        <div
          aria-live="polite"
          aria-label="Visible card count"
          style={{
            color: "#f3d46b",
            fontWeight: 800,
            fontSize: "0.92rem",
            whiteSpace: "nowrap",
          }}
        >
          {visibleCount} / {totalCount} cards
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div aria-label="Card size" role="group" style={segmentedStyle}>
            {SIZE_OPTIONS.map((option) => (
              <SegmentButton
                key={option.value}
                active={displayState.size === option.value}
                onClick={() => updateDisplayState({ size: option.value })}
              >
                {option.label}
              </SegmentButton>
            ))}
          </div>

          <button
            type="button"
            aria-pressed={displayState.tagEditing}
            onClick={() =>
              updateDisplayState({ tagEditing: !displayState.tagEditing })
            }
            title="Show tag chips with add/remove controls under each card"
            style={{
              ...inputStyle,
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              cursor: "pointer",
              fontWeight: 800,
              border: displayState.tagEditing
                ? "1px solid #2d8a80"
                : inputStyle.border,
              background: displayState.tagEditing ? "#2d8a80" : "#16242a",
              color: displayState.tagEditing ? "#ffffff" : "#d9e1dd",
            }}
          >
            <span aria-hidden="true">🏷</span>
            <span>{displayState.tagEditing ? "Tag mode: on" : "Tag mode"}</span>
          </button>

          <button
            type="button"
            onClick={onOpenManageTags}
            title="Create tags, set colors, and delete tags"
            style={{
              ...inputStyle,
              display: "inline-flex",
              alignItems: "center",
              cursor: "pointer",
              fontWeight: 800,
              background: "#16242a",
              color: "#d9e1dd",
            }}
          >
            Manage tags
          </button>

          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((value) => !value)}
            style={{
              ...inputStyle,
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
              fontWeight: 800,
              background: expanded ? "#1f3438" : "#16242a",
            }}
          >
            <span>Filters</span>
            {filterCount > 0 ? (
              <span
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "18px",
                  height: "18px",
                  padding: "0 5px",
                  borderRadius: "999px",
                  background: "#36a398",
                  color: "#06201d",
                  fontSize: "0.72rem",
                  fontWeight: 900,
                }}
              >
                {filterCount}
              </span>
            ) : null}
            <span aria-hidden="true" style={{ fontSize: "0.7rem" }}>
              {expanded ? "▴" : "▾"}
            </span>
          </button>
        </div>
      </div>

      <div
        id={panelId}
        className="card-editor-toolbar-panel"
        hidden={!expanded}
        style={panelStyle}
      >
        <label style={{ ...labelStyle, flex: "1 1 220px" }}>
          Search
          <input
            aria-label="Search cards"
            type="search"
            value={displayState.searchText}
            onChange={(event) =>
              updateDisplayState({ searchText: event.currentTarget.value })
            }
            placeholder={
              displayState.searchScope === "all"
                ? "Name or rules text"
                : "Card name"
            }
            style={inputStyle}
          />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "#9fb0ab",
              fontSize: "0.74rem",
              fontWeight: 600,
            }}
          >
            <input
              aria-label="Search rules text"
              type="checkbox"
              checked={displayState.searchScope === "all"}
              onChange={(event) =>
                updateDisplayState({
                  searchScope: event.currentTarget.checked ? "all" : "name",
                })
              }
              style={{ accentColor: "#36a398", cursor: "pointer" }}
            />
            Search rules text
          </span>
        </label>

        <div style={labelStyle}>
          Type
          <div aria-label="Type filter" role="group" style={segmentedStyle}>
            {TYPE_OPTIONS.map((option) => (
              <SegmentButton
                key={option.value}
                active={displayState.type === option.value}
                onClick={() => updateDisplayState({ type: option.value })}
              >
                {option.label}
              </SegmentButton>
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
            {visibleSubtypeOptions.map((subtype) => (
              <option key={subtype} value={subtype}>
                {subtype}
              </option>
            ))}
          </select>
        </label>

        <TagFilterControl
          availableTags={availableTags}
          selected={displayState.tagFilters}
          onChange={(tagFilters) => updateDisplayState({ tagFilters })}
        />

        <div style={labelStyle}>
          Sort
          <div style={{ display: "flex", gap: "6px" }}>
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
            <button
              type="button"
              aria-label="Sort direction"
              aria-pressed={isDescending}
              title={isDescending ? "Descending" : "Ascending"}
              onClick={() =>
                updateDisplayState({ dir: isDescending ? "asc" : "desc" })
              }
              style={{
                ...inputStyle,
                width: "38px",
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: "1rem",
                fontWeight: 800,
              }}
            >
              <span aria-hidden="true">{isDescending ? "↓" : "↑"}</span>
            </button>
          </div>
        </div>

        <div style={{ ...labelStyle, color: "transparent" }}>
          {" "}
          <button
            type="button"
            aria-label="Clear filters"
            onClick={clearFilters}
            disabled={filterCount === 0}
            style={{
              ...inputStyle,
              cursor: filterCount === 0 ? "not-allowed" : "pointer",
              fontWeight: 800,
              color: filterCount === 0 ? "#6c7a76" : "#fff7e0",
              opacity: filterCount === 0 ? 0.6 : 1,
            }}
          >
            Clear filters
          </button>
        </div>
      </div>
    </section>
  );
}
