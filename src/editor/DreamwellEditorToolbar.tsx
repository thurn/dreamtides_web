import type { CSSProperties } from "react";
import CardBrowserToolbar from "./card-browser/CardBrowserToolbar";
import type {
  CardBrowserSortOption,
  CardBrowserToolbarValues,
} from "./card-browser/card-browser-types";
import { DEFAULT_DREAMWELL_DISPLAY_STATE } from "./dreamwell-editor-url-state";
import type { DreamwellDisplayState, DreamwellSortField } from "./dreamwell-types";

interface DreamwellEditorToolbarProps {
  displayState: DreamwellDisplayState;
  visibleCount: number;
  totalCount: number;
  onDisplayStateChange: (state: DreamwellDisplayState) => void;
}

const DREAMWELL_SORT_OPTIONS: ReadonlyArray<CardBrowserSortOption> = [
  { value: "sourceOrder", label: "Catalog order" },
  { value: "name", label: "Name" },
  { value: "energyAdded", label: "Energy added" },
  { value: "order", label: "Deck order" },
];

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

/**
 * The Dreamwell editor's filter bar. It reuses the shared
 * {@link CardBrowserToolbar} for search, sort, size, and the visible count, and
 * injects the Dreamwell-only "Edit mode" toggle through `barExtras`. The
 * Dreamwell display state carries only the controls this surface uses, so the
 * toolbar maps that state to the shared toolbar's value shape and back.
 */
export default function DreamwellEditorToolbar({
  displayState,
  visibleCount,
  totalCount,
  onDisplayStateChange,
}: DreamwellEditorToolbarProps) {
  const values: CardBrowserToolbarValues = {
    searchText: displayState.searchText,
    searchScope: "name",
    type: "all",
    cost: "all",
    subtype: "",
    sort: displayState.sort,
    dir: displayState.dir,
    size: displayState.size,
  };

  const handlePatch = (patch: Partial<CardBrowserToolbarValues>) => {
    const next: DreamwellDisplayState = { ...displayState };
    if (patch.searchText !== undefined) {
      next.searchText = patch.searchText;
    }
    if (patch.sort !== undefined) {
      next.sort = patch.sort as DreamwellSortField;
    }
    if (patch.dir !== undefined) {
      next.dir = patch.dir;
    }
    if (patch.size !== undefined) {
      next.size = patch.size;
    }
    onDisplayStateChange(next);
  };

  const clearFilters = () => {
    onDisplayStateChange({
      ...displayState,
      searchText: DEFAULT_DREAMWELL_DISPLAY_STATE.searchText,
      sort: DEFAULT_DREAMWELL_DISPLAY_STATE.sort,
      dir: DEFAULT_DREAMWELL_DISPLAY_STATE.dir,
    });
  };

  const barExtras = (
    <button
      type="button"
      aria-pressed={displayState.artEditing}
      onClick={() =>
        onDisplayStateChange({
          ...displayState,
          artEditing: !displayState.artEditing,
        })
      }
      title="Click a card to open its focused editor instead of editing inline"
      style={modeToggleStyle(displayState.artEditing)}
    >
      <span aria-hidden="true">✎</span>
      <span>{displayState.artEditing ? "Edit mode: on" : "Edit mode: off"}</span>
    </button>
  );

  return (
    <CardBrowserToolbar
      ariaLabel="Dreamwell editor controls"
      className="dreamwell-editor-toolbar"
      values={values}
      onPatch={handlePatch}
      subtypeOptions={[]}
      visibleCount={visibleCount}
      totalCount={totalCount}
      sortOptions={DREAMWELL_SORT_OPTIONS}
      itemLabelPlural="Dreamwell cards"
      searchAriaLabel="Search Dreamwell cards"
      showSearchScope={false}
      showTypeFilter={false}
      showCostFilter={false}
      showSubtypeFilter={false}
      onClear={clearFilters}
      barExtras={barExtras}
    />
  );
}
