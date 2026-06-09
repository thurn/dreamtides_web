import { useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  CARD_BROWSER_SORT_OPTIONS,
  DEFAULT_CARD_BROWSER_VALUES,
  type CardBrowserCostFilter,
  type CardBrowserSearchScope,
  type CardBrowserSize,
  type CardBrowserSortOption,
  type CardBrowserToolbarValues,
  type CardBrowserTypeFilter,
} from "./card-browser-types";

export interface CardBrowserToolbarProps {
  values: CardBrowserToolbarValues;
  onPatch: (patch: Partial<CardBrowserToolbarValues>) => void;
  subtypeOptions: string[];
  visibleCount: number;
  totalCount: number;
  /** Sort fields offered in the Sort dropdown. Defaults to the common set. */
  sortOptions?: ReadonlyArray<CardBrowserSortOption>;
  /** Accessible name for the toolbar `<section>`. */
  ariaLabel?: string;
  /** Class name for the toolbar `<section>`. */
  className?: string;
  /** Whether to show the search-scope dropdown. */
  showSearchScope?: boolean;
  /** Search-scope options offered when the search-scope dropdown is visible. */
  searchScopeOptions?: ReadonlyArray<{
    value: CardBrowserSearchScope;
    label: string;
    placeholder: string;
  }>;
  /** Label used in the visible-count text and aria labels. */
  itemLabelPlural?: string;
  /**
   * Name of the active checkbox tag. When non-empty, a chip showing how many
   * items in the whole pool carry the tag is rendered next to the overall
   * count. Empty means checkbox tagging is off and no chip is shown.
   */
  checkboxTagLabel?: string;
  /** Number of items carrying `checkboxTagLabel` across the whole pool. */
  checkboxTagCount?: number;
  /** Accessible label for the search input. */
  searchAriaLabel?: string;
  /** Whether to show the card type filter. */
  showTypeFilter?: boolean;
  /** Whether to show the card cost filter. */
  showCostFilter?: boolean;
  /** Whether to show the subtype filter. */
  showSubtypeFilter?: boolean;
  /** Controls injected into the bar between the size control and Filters. */
  barExtras?: ReactNode;
  /** Controls injected into the expandable filter panel before Sort. */
  panelExtras?: ReactNode;
  /** Active-filter count contributed by surface-specific filters (tags/tides). */
  extraActiveFilterCount?: number;
  /** Overrides the Clear filters action; defaults to resetting common filters. */
  onClear?: () => void;
}

const TYPE_OPTIONS: Array<{ value: CardBrowserTypeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "character", label: "Characters" },
  { value: "event", label: "Events" },
];

const SCOPE_OPTIONS: Array<{
  value: CardBrowserSearchScope;
  label: string;
  placeholder: string;
}> = [
  { value: "name", label: "Card name", placeholder: "Card name" },
  { value: "all", label: "Rules text", placeholder: "Name or rules text" },
  { value: "mtg", label: "MTG name", placeholder: "MTG name" },
];

const COST_OPTIONS: Array<{ value: CardBrowserCostFilter; label: string }> = [
  { value: "all", label: "Any cost" },
  { value: "0", label: "0" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5plus", label: "5+" },
  { value: "x", label: "X" },
];

const SIZE_OPTIONS: Array<{ value: CardBrowserSize; label: string }> = [
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
function commonActiveFilterCount(values: CardBrowserToolbarValues): number {
  let count = 0;
  if (values.searchText.trim() !== DEFAULT_CARD_BROWSER_VALUES.searchText) {
    count += 1;
  }
  if (values.searchScope !== DEFAULT_CARD_BROWSER_VALUES.searchScope) {
    count += 1;
  }
  if (values.type !== DEFAULT_CARD_BROWSER_VALUES.type) {
    count += 1;
  }
  if (values.cost !== DEFAULT_CARD_BROWSER_VALUES.cost) {
    count += 1;
  }
  if (values.subtype !== DEFAULT_CARD_BROWSER_VALUES.subtype) {
    count += 1;
  }
  if (values.sort !== DEFAULT_CARD_BROWSER_VALUES.sort) {
    count += 1;
  }
  if (values.dir !== DEFAULT_CARD_BROWSER_VALUES.dir) {
    count += 1;
  }
  return count;
}

/**
 * The shared filter/sort/size toolbar for the card-browsing surfaces. It owns
 * the always-visible bar (card count, size control, Filters toggle) and the
 * collapsible panel (search, scope, type, cost, subtype, sort). Surfaces inject
 * their own controls through `barExtras`/`panelExtras` (the editor adds its tag,
 * tide, and art modes plus tag/tide filters); the Pool Viewer renders it plain.
 */
export default function CardBrowserToolbar({
  values,
  onPatch,
  subtypeOptions,
  visibleCount,
  totalCount,
  sortOptions = CARD_BROWSER_SORT_OPTIONS,
  ariaLabel = "Card browser controls",
  className = "card-browser-toolbar",
  showSearchScope = true,
  searchScopeOptions = SCOPE_OPTIONS,
  itemLabelPlural = "cards",
  checkboxTagLabel = "",
  checkboxTagCount = 0,
  searchAriaLabel = "Search cards",
  showTypeFilter = true,
  showCostFilter = true,
  showSubtypeFilter = true,
  barExtras,
  panelExtras,
  extraActiveFilterCount = 0,
  onClear,
}: CardBrowserToolbarProps) {
  const panelId = useId();
  const filterCount = commonActiveFilterCount(values) + extraActiveFilterCount;
  const [expanded, setExpanded] = useState(() => filterCount > 0);

  const loadedSubtypeOptions = subtypeOptions.filter(
    (subtype) => subtype.trim().length > 0,
  );
  const visibleSubtypeOptions =
    values.subtype !== "" && !loadedSubtypeOptions.includes(values.subtype)
      ? [values.subtype, ...loadedSubtypeOptions]
      : loadedSubtypeOptions;

  const isDescending = values.dir === "desc";

  const clearFilters = () => {
    if (onClear !== undefined) {
      onClear();
      return;
    }
    // Reset every search/filter/sort field to its default while preserving the
    // card-size view preference, which lives in the always-visible bar.
    onPatch({
      searchText: DEFAULT_CARD_BROWSER_VALUES.searchText,
      searchScope: DEFAULT_CARD_BROWSER_VALUES.searchScope,
      type: DEFAULT_CARD_BROWSER_VALUES.type,
      cost: DEFAULT_CARD_BROWSER_VALUES.cost,
      subtype: DEFAULT_CARD_BROWSER_VALUES.subtype,
      sort: DEFAULT_CARD_BROWSER_VALUES.sort,
      dir: DEFAULT_CARD_BROWSER_VALUES.dir,
    });
  };

  return (
    <section aria-label={ariaLabel} className={className} style={toolbarStyle}>
      <div className="card-browser-toolbar-bar" style={barStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div
            aria-live="polite"
            aria-label={`Visible ${itemLabelPlural} count`}
            style={{
              color: "#f3d46b",
              fontWeight: 800,
              fontSize: "0.92rem",
              whiteSpace: "nowrap",
            }}
          >
            {visibleCount} / {totalCount} {itemLabelPlural}
          </div>

          {checkboxTagLabel !== "" ? (
            <div
              aria-live="polite"
              aria-label={`${itemLabelPlural} tagged ${checkboxTagLabel} count`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                color: "#8edbd1",
                fontWeight: 800,
                fontSize: "0.86rem",
                whiteSpace: "nowrap",
              }}
            >
              <span aria-hidden="true">☑</span>
              {checkboxTagCount} {checkboxTagLabel}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <div aria-label="Card size" role="group" style={segmentedStyle}>
            {SIZE_OPTIONS.map((option) => (
              <SegmentButton
                key={option.value}
                active={values.size === option.value}
                onClick={() => onPatch({ size: option.value })}
              >
                {option.label}
              </SegmentButton>
            ))}
          </div>

          {barExtras}

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
        className="card-browser-toolbar-panel"
        hidden={!expanded}
        style={panelStyle}
      >
        <label style={{ ...labelStyle, flex: "1 1 220px" }}>
          Search
          <input
            aria-label={searchAriaLabel}
            type="search"
            value={values.searchText}
            onChange={(event) =>
              onPatch({ searchText: event.currentTarget.value })
            }
            placeholder={
              searchScopeOptions.find(
                (option) => option.value === values.searchScope,
              )?.placeholder ?? "Search"
            }
            style={inputStyle}
          />
        </label>

        {showSearchScope ? (
          <label style={labelStyle}>
            Search in
            <select
              aria-label="Search scope"
              value={values.searchScope}
              onChange={(event) =>
                onPatch({
                  searchScope: event.currentTarget
                    .value as CardBrowserSearchScope,
                })
              }
              style={inputStyle}
            >
              {searchScopeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showTypeFilter ? (
          <label style={labelStyle}>
            Type
            <select
              aria-label="Type filter"
              value={values.type}
              onChange={(event) =>
                onPatch({
                  type: event.currentTarget.value as CardBrowserTypeFilter,
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
        ) : null}

        {showCostFilter ? (
          <label style={labelStyle}>
            Cost
            <select
              aria-label="Cost filter"
              value={values.cost}
              onChange={(event) =>
                onPatch({
                  cost: event.currentTarget.value as CardBrowserCostFilter,
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
        ) : null}

        {showSubtypeFilter ? (
          <label style={labelStyle}>
            Subtype
            <select
              aria-label="Subtype filter"
              value={values.subtype}
              onChange={(event) => onPatch({ subtype: event.currentTarget.value })}
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
        ) : null}

        {panelExtras}

        <div style={labelStyle}>
          Sort
          <div style={{ display: "flex", gap: "6px" }}>
            <select
              aria-label="Sort field"
              value={values.sort}
              onChange={(event) => onPatch({ sort: event.currentTarget.value })}
              style={inputStyle}
            >
              {sortOptions.map((option) => (
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
              onClick={() => onPatch({ dir: isDescending ? "asc" : "desc" })}
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
          {" "}
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
