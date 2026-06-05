import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import CardBrowserToolbar from "../components/card-browser/CardBrowserToolbar";
import {
  CARD_BROWSER_SORT_OPTIONS,
  type CardBrowserSortOption,
  type CardBrowserToolbarValues,
} from "../components/card-browser/card-browser-types";
import { DEFAULT_EDITOR_DISPLAY_STATE } from "./editor-url-state";
import TagFilterControl from "./TagFilterControl";
import type { EditorDisplayState, EditorTag } from "./types";

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

// The editor offers every common sort field plus its facet-only Tide Count.
const EDITOR_SORT_OPTIONS: ReadonlyArray<CardBrowserSortOption> = [
  ...CARD_BROWSER_SORT_OPTIONS,
  { value: "tideCount", label: "Tide Count" },
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
  onDisplayStateChange,
  onOpenManageTags,
  onOpenManageTides,
}: CardEditorToolbarProps) {
  const menuId = useId();
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
      tideFilters: [],
      sort: DEFAULT_EDITOR_DISPLAY_STATE.sort,
      dir: DEFAULT_EDITOR_DISPLAY_STATE.dir,
    });
  };

  const barExtras = (
    <>
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
    </>
  );

  const panelExtras = (
    <>
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
      sortOptions={EDITOR_SORT_OPTIONS}
      extraActiveFilterCount={
        displayState.tagFilters.length + displayState.tideFilters.length
      }
      onClear={clearFilters}
      barExtras={barExtras}
      panelExtras={panelExtras}
    />
  );
}
