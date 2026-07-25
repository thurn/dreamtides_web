import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import CardBrowserToolbar from "./card-browser/CardBrowserToolbar";
import {
  CARD_BROWSER_SORT_OPTIONS,
  type CardBrowserSortOption,
  type CardBrowserToolbarValues,
} from "./card-browser/card-browser-types";
import { DEFAULT_EDITOR_DISPLAY_STATE } from "./editor-url-state";
import TagFilterControl from "./TagFilterControl";
import { tagColor } from "./tag-color";
import type { EditorDisplayState, EditorTag } from "./types";

interface CardEditorToolbarProps {
  displayState: EditorDisplayState;
  subtypeOptions: string[];
  availableTags: EditorTag[];
  availableTides: EditorTag[];
  visibleCount: number;
  totalCount: number;
  /** How many cards in the whole pool carry the active checkbox tag. */
  checkboxTagCount: number;
  onDisplayStateChange: (state: EditorDisplayState) => void;
  onOpenManageTags: () => void;
  onOpenManageTides: () => void;
}

// The editor offers every common sort field plus its facet-only Tide Count and
// the measured rules-text font size (computed by the auto-shrink fitter).
const EDITOR_SORT_OPTIONS: ReadonlyArray<CardBrowserSortOption> = [
  ...CARD_BROWSER_SORT_OPTIONS,
  { value: "nameSubstring", label: "Shared Name Substring" },
  { value: "rulesTextFontSize", label: "Rules Text Font Size" },
  { value: "tideCount", label: "Tide Count" },
  { value: "popularity", label: "Popularity" },
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

/**
 * The card editor's toolbar: the shared `CardBrowserToolbar` (search, scope,
 * type, cost, subtype, sort, size, count) extended with the editor-only tag,
 * tide, and art editing-mode toggles, a manage-registries menu, and tag/tide
 * filter controls. The Pool Viewer renders the same shared toolbar without
 * these editing extras.
 */
export default function CardEditorToolbar({
  displayState,
  subtypeOptions,
  availableTags,
  availableTides,
  visibleCount,
  totalCount,
  checkboxTagCount,
  onDisplayStateChange,
  onOpenManageTags,
  onOpenManageTides,
}: CardEditorToolbarProps) {
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  // The overflow menu has two views: its root list and a secondary "checkbox
  // tag" picker, so the (potentially long) tag list does not crowd the root.
  const [menuView, setMenuView] = useState<"root" | "checkbox">("root");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      // Always reopen on the root view.
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

  const updateDisplayState = (patch: Partial<EditorDisplayState>) => {
    onDisplayStateChange({ ...displayState, ...patch });
  };

  const handlePatch = (patch: Partial<CardBrowserToolbarValues>) => {
    // Every `sort` value emitted by the shared toolbar comes from
    // EDITOR_SORT_OPTIONS, so widening it back to EditorSortField is safe.
    onDisplayStateChange({ ...displayState, ...patch } as EditorDisplayState);
  };

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
      excludedTagFilters: [],
      tideFilters: [],
      sort: DEFAULT_EDITOR_DISPLAY_STATE.sort,
      dir: DEFAULT_EDITOR_DISPLAY_STATE.dir,
    });
  };

  const barExtras = (
    <>
      <label
        title="Show glossary definitions in Info Cards when hovering cards"
        style={{
          ...inputStyle,
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          cursor: "pointer",
          fontSize: "0.78rem",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        <input
          type="checkbox"
          aria-label="Show glossary info cards on hover"
          checked={displayState.showGlossaryInfoOnHover}
          onChange={(event) =>
            updateDisplayState({ showGlossaryInfoOnHover: event.target.checked })
          }
        />
        Info on hover
      </label>

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
        icon="✎"
        label="Edit"
        title="Click a card to open its focused editor"
        onToggle={() =>
          updateDisplayState({ artEditing: !displayState.artEditing })
        }
      />

      {displayState.checkboxTag !== "" ? (
        <ModeToggle
          active
          icon="☑"
          label={displayState.checkboxTag}
          title={`Checkbox tagging "${displayState.checkboxTag}" — click to exit`}
          onToggle={() => updateDisplayState({ checkboxTag: "" })}
        />
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
            {menuView === "root" ? (
              <>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={displayState.showFontSize}
                  onClick={() => {
                    setMenuOpen(false);
                    updateDisplayState({
                      showFontSize: !displayState.showFontSize,
                    });
                  }}
                  style={{
                    ...menuItemStyle,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
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
                    {displayState.showFontSize ? "✓" : ""}
                  </span>
                  <span style={{ flex: "1 1 auto" }}>Show font size</span>
                </button>
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
                    ›
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
                  <span aria-hidden="true">‹</span>
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
                            {active ? "✓" : ""}
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
    <>
      <TagFilterControl
        availableTags={availableTags}
        selected={displayState.tagFilters}
        onChange={(tagFilters) => updateDisplayState({ tagFilters })}
        excluded={displayState.excludedTagFilters}
        onExcludedChange={(excludedTagFilters) =>
          updateDisplayState({ excludedTagFilters })
        }
        onToggleExclude={(name) => {
          // Move the tag across the include/exclude lists in a single update so
          // it never lands in both (which would match no cards).
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

      <TagFilterControl
        noun="tide"
        singleSelect
        availableTags={availableTides}
        selected={displayState.tideFilters}
        onChange={(tideFilters) => updateDisplayState({ tideFilters })}
      />
    </>
  );

  return (
    <CardBrowserToolbar
      ariaLabel="Card editor controls"
      className="card-editor-toolbar"
      values={displayState}
      onPatch={handlePatch}
      subtypeOptions={subtypeOptions}
      visibleCount={visibleCount}
      totalCount={totalCount}
      checkboxTagLabel={displayState.checkboxTag}
      checkboxTagCount={checkboxTagCount}
      sortOptions={EDITOR_SORT_OPTIONS}
      extraActiveFilterCount={
        displayState.tagFilters.length +
        displayState.excludedTagFilters.length +
        displayState.tideFilters.length
      }
      onClear={clearFilters}
      barExtras={barExtras}
      panelExtras={panelExtras}
    />
  );
}
