import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DEFAULT_EDITOR_DISPLAY_STATE } from "./editor-url-state";
import TagFilterControl from "./TagFilterControl";
import type {
  EditorCardSize,
  EditorCostFilter,
  EditorDisplayState,
  EditorSearchScope,
  EditorSortField,
  EditorTag,
  EditorTypeFilter,
} from "./types";

interface CardEditorToolbarProps {
  displayState: EditorDisplayState;
  subtypeOptions: string[];
  availableTags: EditorTag[];
  availableTides: EditorTag[];
  visibleCount: number;
  totalCount: number;
  onDisplayStateChange: (state: EditorDisplayState) => void;
  onOpenManageTags: () => void;
  onOpenManageTides: () => void;
}

const TYPE_OPTIONS: Array<{ value: EditorTypeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "character", label: "Characters" },
  { value: "event", label: "Events" },
];

const SCOPE_OPTIONS: Array<{
  value: EditorSearchScope;
  label: string;
  placeholder: string;
}> = [
  { value: "name", label: "Card name", placeholder: "Card name" },
  { value: "all", label: "Rules text", placeholder: "Name or rules text" },
  { value: "mtg", label: "MTG name", placeholder: "MTG name" },
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
  { value: "rulesTextLength", label: "Rules Text Length" },
  { value: "nameLength", label: "Name Length" },
  { value: "tideCount", label: "Tide Count" },
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

const menuItemStyle = {
  display: "block",
  width: "100%",
  textAlign: "left",
  minHeight: "32px",
  border: 0,
  borderRadius: "5px",
  background: "transparent",
  color: "#e7efec",
  padding: "6px 9px",
  font: "inherit",
  fontSize: "0.84rem",
  fontWeight: 700,
  cursor: "pointer",
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
  count += state.tideFilters.length;
  if (state.sort !== DEFAULT_EDITOR_DISPLAY_STATE.sort) {
    count += 1;
  }
  if (state.dir !== DEFAULT_EDITOR_DISPLAY_STATE.dir) {
    count += 1;
  }
  return count;
}

function modeToggleStyle(active: boolean): CSSProperties {
  return {
    ...inputStyle,
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    cursor: "pointer",
    fontWeight: 800,
    border: active ? "1px solid #2d8a80" : inputStyle.border,
    background: active ? "#2d8a80" : "#16242a",
    color: active ? "#ffffff" : "#d9e1dd",
  };
}

interface ModeToggleProps {
  active: boolean;
  icon: string;
  label: string;
  title: string;
  onToggle: () => void;
}

function ModeToggle({ active, icon, label, title, onToggle }: ModeToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      title={title}
      style={modeToggleStyle(active)}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default function CardEditorToolbar({
  displayState,
  subtypeOptions,
  availableTags,
  availableTides,
  visibleCount,
  totalCount,
  onDisplayStateChange,
  onOpenManageTags,
  onOpenManageTides,
}: CardEditorToolbarProps) {
  const panelId = useId();
  const menuId = useId();
  const [expanded, setExpanded] = useState(
    () => activeFilterCount(displayState) > 0,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (
        menuRef.current !== null &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

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
      tideFilters: [],
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

          <ModeToggle
            active={displayState.tagEditing}
            icon="🏷"
            label="Tags"
            title="Show tag chips with add/remove controls under each card"
            onToggle={() =>
              updateDisplayState({ tagEditing: !displayState.tagEditing })
            }
          />

          <ModeToggle
            active={displayState.tideEditing}
            icon="🌊"
            label="Tides"
            title="Show tide chips with add/remove controls under each card"
            onToggle={() =>
              updateDisplayState({ tideEditing: !displayState.tideEditing })
            }
          />

          <ModeToggle
            active={displayState.artEditing}
            icon="🖼"
            label="Art"
            title="Click a card to pan and zoom its art crop"
            onToggle={() =>
              updateDisplayState({ artEditing: !displayState.artEditing })
            }
          />

          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label="More actions"
              title="More actions"
              onClick={() => setMenuOpen((value) => !value)}
              style={{
                ...inputStyle,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "38px",
                cursor: "pointer",
                fontWeight: 900,
                fontSize: "1.1rem",
                lineHeight: 1,
                background: menuOpen ? "#1f3438" : "#16242a",
                color: "#d9e1dd",
              }}
            >
              <span aria-hidden="true">⋯</span>
            </button>
            {menuOpen ? (
              <div
                id={menuId}
                role="menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  zIndex: 50,
                  minWidth: "170px",
                  padding: "6px",
                  borderRadius: "8px",
                  border: "1px solid rgba(142, 219, 209, 0.5)",
                  background: "#0f1a1d",
                  boxShadow: "0 12px 30px rgba(0, 0, 0, 0.55)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenManageTags();
                  }}
                  style={menuItemStyle}
                >
                  Manage tags…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenManageTides();
                  }}
                  style={menuItemStyle}
                >
                  Manage tides…
                </button>
              </div>
            ) : null}
          </div>

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
              SCOPE_OPTIONS.find(
                (option) => option.value === displayState.searchScope,
              )?.placeholder ?? "Card name"
            }
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Search in
          <select
            aria-label="Search scope"
            value={displayState.searchScope}
            onChange={(event) =>
              updateDisplayState({
                searchScope: event.currentTarget.value as EditorSearchScope,
              })
            }
            style={inputStyle}
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Type
          <select
            aria-label="Type filter"
            value={displayState.type}
            onChange={(event) =>
              updateDisplayState({
                type: event.currentTarget.value as EditorTypeFilter,
              })
            }
            style={inputStyle}
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

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

        <TagFilterControl
          noun="tide"
          singleSelect
          availableTags={availableTides}
          selected={displayState.tideFilters}
          onChange={(tideFilters) => updateDisplayState({ tideFilters })}
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
