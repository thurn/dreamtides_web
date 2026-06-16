import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import CardBrowserToolbar from "../components/card-browser/CardBrowserToolbar";
import type {
  CardBrowserSearchScope,
  CardBrowserSortOption,
  CardBrowserToolbarValues,
} from "../components/card-browser/card-browser-types";
import { DEFAULT_DREAMSIGN_DISPLAY_STATE } from "./dreamsign-editor-url-state";
import TagFilterControl from "./TagFilterControl";
import { tagColor } from "./tag-color";
import type { DreamsignDisplayState } from "./dreamsign-types";
import type { EditorTag } from "./types";

interface DreamsignEditorToolbarProps {
  displayState: DreamsignDisplayState;
  availableTags: EditorTag[];
  visibleCount: number;
  totalCount: number;
  /** How many dreamsigns in the whole pool carry the active checkbox tag. */
  checkboxTagCount: number;
  onDisplayStateChange: (state: DreamsignDisplayState) => void;
  onOpenManageTags: () => void;
}

const DREAMSIGN_SORT_OPTIONS: ReadonlyArray<CardBrowserSortOption> = [
  { value: "sourceOrder", label: "Source Order" },
  { value: "name", label: "Name" },
  { value: "rulesTextLength", label: "Effect Text Length" },
  { value: "nameLength", label: "Name Length" },
  { value: "tagCount", label: "Tag Count" },
  // TEMPORARY: clusters near-duplicate effects for de-dup review.
  { value: "similarityGroup", label: "Similarity Group" },
];

const SEARCH_SCOPE_OPTIONS: ReadonlyArray<{
  value: CardBrowserSearchScope;
  label: string;
  placeholder: string;
}> = [
  { value: "name", label: "Dreamsign name", placeholder: "Dreamsign name" },
  { value: "all", label: "Effect text", placeholder: "Name or effect text" },
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

export default function DreamsignEditorToolbar({
  displayState,
  availableTags,
  visibleCount,
  totalCount,
  checkboxTagCount,
  onDisplayStateChange,
  onOpenManageTags,
}: DreamsignEditorToolbarProps) {
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<"root" | "checkbox">("root");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      setMenuView("root");
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

  const updateDisplayState = (patch: Partial<DreamsignDisplayState>) => {
    onDisplayStateChange({ ...displayState, ...patch });
  };

  const handlePatch = (patch: Partial<CardBrowserToolbarValues>) => {
    onDisplayStateChange({ ...displayState, ...patch } as DreamsignDisplayState);
  };

  const clearFilters = () => {
    updateDisplayState({
      searchText: DEFAULT_DREAMSIGN_DISPLAY_STATE.searchText,
      searchScope: DEFAULT_DREAMSIGN_DISPLAY_STATE.searchScope,
      tagFilters: [],
      excludedTagFilters: [],
      sort: DEFAULT_DREAMSIGN_DISPLAY_STATE.sort,
      dir: DEFAULT_DREAMSIGN_DISPLAY_STATE.dir,
    });
  };

  const barExtras = (
    <>
      <button
        type="button"
        aria-pressed={displayState.tagEditing}
        onClick={() => updateDisplayState({ tagEditing: !displayState.tagEditing })}
        title="Show tag chips with add/remove controls under each dreamsign"
        style={modeToggleStyle(displayState.tagEditing)}
      >
        <span aria-hidden="true">#</span>
        <span>Tags</span>
      </button>

      {displayState.checkboxTag !== "" ? (
        <button
          type="button"
          aria-pressed="true"
          onClick={() => updateDisplayState({ checkboxTag: "" })}
          title={`Checkbox tagging "${displayState.checkboxTag}"`}
          style={modeToggleStyle(true)}
        >
          <span aria-hidden="true">#</span>
          <span>{displayState.checkboxTag}</span>
        </button>
      ) : null}

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
          <span aria-hidden="true">...</span>
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
            {menuView === "root" ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenManageTags();
                  }}
                  style={menuItemStyle}
                >
                  Manage tags...
                </button>
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  onClick={() => setMenuView("checkbox")}
                  style={{
                    ...menuItemStyle,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span style={{ flex: "1 1 auto" }}>
                    Checkbox tag
                    {displayState.checkboxTag !== "" ? (
                      <span style={{ color: "#8edbd1", fontWeight: 800 }}>
                        {`: ${displayState.checkboxTag}`}
                      </span>
                    ) : null}
                  </span>
                  <span aria-hidden="true" style={{ color: "#8edbd1" }}>
                    &gt;
                  </span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMenuView("root")}
                  style={{
                    ...menuItemStyle,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#8edbd1",
                  }}
                >
                  <span aria-hidden="true">&lt;</span>
                  <span>Checkbox tag</span>
                </button>
                <div
                  aria-hidden="true"
                  style={{
                    height: "1px",
                    margin: "2px 4px 4px",
                    background: "rgba(142, 219, 209, 0.25)",
                  }}
                />
                {availableTags.length === 0 ? (
                  <span
                    style={{
                      padding: "4px 9px",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "#9fb0ab",
                    }}
                  >
                    No tags yet.
                  </span>
                ) : (
                  <div
                    style={{
                      maxHeight: "240px",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                    }}
                  >
                    {displayState.checkboxTag !== "" ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          updateDisplayState({ checkboxTag: "" });
                        }}
                        style={{ ...menuItemStyle, color: "#f0c6bd" }}
                      >
                        Turn off checkbox mode
                      </button>
                    ) : null}
                    {availableTags.map((tag) => {
                      const active = tag.name === displayState.checkboxTag;
                      return (
                        <button
                          key={tag.name}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => {
                            setMenuOpen(false);
                            updateDisplayState({
                              checkboxTag: active ? "" : tag.name,
                            });
                          }}
                          style={{
                            ...menuItemStyle,
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            background: active ? "#1f3438" : "transparent",
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: "12px",
                              textAlign: "center",
                              color: "#8edbd1",
                            }}
                          >
                            {active ? "x" : ""}
                          </span>
                          <span
                            aria-hidden="true"
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "50%",
                              flex: "0 0 auto",
                              background: tagColor(tag.name, availableTags),
                            }}
                          />
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {tag.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </>
  );

  const panelExtras = (
    <TagFilterControl
      availableTags={availableTags}
      selected={displayState.tagFilters}
      onChange={(tagFilters) => updateDisplayState({ tagFilters })}
      excluded={displayState.excludedTagFilters}
      onExcludedChange={(excludedTagFilters) =>
        updateDisplayState({ excludedTagFilters })
      }
      onToggleExclude={(name) => {
        if (displayState.excludedTagFilters.includes(name)) {
          updateDisplayState({
            excludedTagFilters: displayState.excludedTagFilters.filter(
              (tag) => tag !== name,
            ),
            tagFilters: displayState.tagFilters.includes(name)
              ? displayState.tagFilters
              : [...displayState.tagFilters, name],
          });
        } else {
          updateDisplayState({
            tagFilters: displayState.tagFilters.filter((tag) => tag !== name),
            excludedTagFilters: displayState.excludedTagFilters.includes(name)
              ? displayState.excludedTagFilters
              : [...displayState.excludedTagFilters, name],
          });
        }
      }}
    />
  );

  return (
    <CardBrowserToolbar
      ariaLabel="Dreamsign editor controls"
      className="dreamsign-editor-toolbar"
      values={displayState}
      onPatch={handlePatch}
      subtypeOptions={[]}
      visibleCount={visibleCount}
      totalCount={totalCount}
      checkboxTagLabel={displayState.checkboxTag}
      checkboxTagCount={checkboxTagCount}
      sortOptions={DREAMSIGN_SORT_OPTIONS}
      searchScopeOptions={SEARCH_SCOPE_OPTIONS}
      itemLabelPlural="dreamsigns"
      searchAriaLabel="Search dreamsigns"
      showTypeFilter={false}
      showCostFilter={false}
      showSubtypeFilter={false}
      extraActiveFilterCount={
        displayState.tagFilters.length + displayState.excludedTagFilters.length
      }
      onClear={clearFilters}
      barExtras={barExtras}
      panelExtras={panelExtras}
    />
  );
}
