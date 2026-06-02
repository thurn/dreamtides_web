import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import TagChip from "./TagChip";
import { tagColor } from "./tag-color";
import type { EditorTag } from "./types";

export interface TagFilterControlProps {
  availableTags: EditorTag[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Singular label for the facet, e.g. "tag" or "tide". */
  noun?: string;
  /**
   * When true the control holds at most one value: selecting a new value
   * replaces the current selection rather than adding to it.
   */
  singleSelect?: boolean;
}

const triggerStyle: CSSProperties = {
  minHeight: "36px",
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  border: "1px solid rgba(247, 241, 223, 0.28)",
  borderRadius: "6px",
  background: "#0f1719",
  color: "#fff7e0",
  padding: "0 10px",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

const popoverStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  zIndex: 50,
  width: "240px",
  maxWidth: "calc(100vw - 40px)",
  boxSizing: "border-box",
  padding: "8px",
  borderRadius: "8px",
  border: "1px solid rgba(142, 219, 209, 0.5)",
  background: "#0f1a1d",
  boxShadow: "0 12px 30px rgba(0, 0, 0, 0.55)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const searchInputStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  minHeight: "30px",
  border: "1px solid rgba(247, 241, 223, 0.28)",
  borderRadius: "6px",
  background: "#0b1416",
  color: "#fff7e0",
  padding: "0 8px",
  font: "inherit",
  fontSize: "0.8rem",
};

export default function TagFilterControl({
  availableTags,
  selected,
  onChange,
  noun = "tag",
  singleSelect = false,
}: TagFilterControlProps) {
  const label = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}s`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    searchRef.current?.focus();
    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current !== null &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectable = useMemo(() => {
    const chosen = new Set(selected);
    const normalizedQuery = query.trim().toLowerCase();
    return availableTags
      .filter((tag) => !chosen.has(tag.name))
      .filter(
        (tag) =>
          normalizedQuery === "" ||
          tag.name.toLowerCase().includes(normalizedQuery),
      );
  }, [availableTags, selected, query]);

  const addFilter = (name: string) => {
    if (singleSelect) {
      // Single-select replaces the prior selection so only one value filters
      // at a time.
      onChange([name]);
    } else if (!selected.includes(name)) {
      onChange([...selected, name]);
    }
    setQuery("");
    if (singleSelect) {
      setOpen(false);
    }
  };

  const removeFilter = (name: string) => {
    onChange(selected.filter((tag) => tag !== name));
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: "grid",
        gap: "6px",
        minWidth: 0,
        color: "#c9d3cf",
        fontSize: "0.78rem",
        fontWeight: 700,
        position: "relative",
      }}
    >
      <span>
        {label}
        {!singleSelect && selected.length > 1 ? (
          <span style={{ color: "#8edbd1", fontWeight: 700 }}> (matching all)</span>
        ) : null}
      </span>

      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={popoverId}
          onClick={() => setOpen((value) => !value)}
          style={triggerStyle}
        >
          <span aria-hidden="true" style={{ fontSize: "0.85rem" }}>
            +
          </span>
          {`Filter by ${noun}`}
          <span aria-hidden="true" style={{ fontSize: "0.7rem" }}>
            {open ? "▴" : "▾"}
          </span>
        </button>

        {selected.map((name) => (
          <TagChip
            key={name}
            name={name}
            color={tagColor(name, availableTags)}
            size="sm"
            onRemove={() => removeFilter(name)}
          />
        ))}
      </div>

      {open ? (
        <div id={popoverId} role="listbox" style={popoverStyle}>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={`Search ${noun}s…`}
            aria-label={`Search ${noun}s to filter by`}
            style={searchInputStyle}
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "5px",
              maxHeight: "180px",
              overflowY: "auto",
            }}
          >
            {selectable.length === 0 ? (
              <span
                style={{
                  color: "#9fb0ab",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  padding: "2px 0",
                }}
              >
                {availableTags.length === 0
                  ? `No ${noun}s yet.`
                  : query.trim() !== ""
                    ? `No matching ${noun}s.`
                    : `All ${noun}s selected.`}
              </span>
            ) : (
              selectable.map((tag) => (
                <TagChip
                  key={tag.name}
                  name={tag.name}
                  color={tag.color}
                  size="sm"
                  onClick={() => addFilter(tag.name)}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
