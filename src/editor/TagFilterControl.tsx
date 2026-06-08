import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import TagChip from "./TagChip";
import { readableTextColor, tagColor } from "./tag-color";
import type { EditorTag } from "./types";

export interface TagFilterControlProps {
  availableTags: EditorTag[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /**
   * Tag names that are excluded ("missing") filters: cards carrying any of
   * these are hidden. When `onExcludedChange` is provided, each selected chip
   * gains a checkbox that flips it between "has tag" and "missing tag".
   */
  excluded?: string[];
  onExcludedChange?: (excluded: string[]) => void;
  /**
   * Flips a single tag between include ("has tag") and exclude ("missing tag").
   * The parent applies the move to both lists atomically. Providing this enables
   * the per-chip negate checkbox.
   */
  onToggleExclude?: (name: string) => void;
  /** Singular label for the facet, e.g. "tag" or "tide". */
  noun?: string;
  /**
   * When true the control holds at most one value: selecting a new value
   * replaces the current selection rather than adding to it.
   */
  singleSelect?: boolean;
}

interface NegateCheckboxProps {
  /** True when the tag is an exclude ("missing") filter. */
  excluded: boolean;
  /** Text color of the surrounding chip, used for contrast against its fill. */
  textColor: string;
  tagName: string;
  onToggle: () => void;
}

/**
 * The per-chip checkbox that flips a tag filter between "card has this tag" and
 * "card is missing this tag". Checked means the chip is an exclude filter.
 */
function NegateCheckbox({
  excluded,
  textColor,
  tagName,
  onToggle,
}: NegateCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={excluded}
      aria-label={
        excluded
          ? `Showing cards missing ${tagName}; click to require ${tagName} instead`
          : `Showing cards with ${tagName}; click to require cards missing ${tagName} instead`
      }
      title={excluded ? `Cards missing ${tagName}` : `Cards with ${tagName}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "14px",
        height: "14px",
        marginLeft: "-2px",
        padding: 0,
        borderRadius: "3px",
        border: `1px solid ${textColor}`,
        background: excluded ? textColor : "transparent",
        color: excluded ? readableTextColor(textColor) : textColor,
        fontSize: "0.7rem",
        fontWeight: 900,
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      <span aria-hidden="true">{excluded ? "✕" : ""}</span>
    </button>
  );
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
  excluded,
  onExcludedChange,
  onToggleExclude,
  noun = "tag",
  singleSelect = false,
}: TagFilterControlProps) {
  // Negation is available only when the parent wires up the toggle callback.
  const negatable = onToggleExclude !== undefined;
  const excludedList = excluded ?? [];
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
    // A tag already used as an include or exclude filter is not offered again.
    const chosen = new Set([...selected, ...excludedList]);
    const normalizedQuery = query.trim().toLowerCase();
    return availableTags
      .filter((tag) => !chosen.has(tag.name))
      .filter(
        (tag) =>
          normalizedQuery === "" ||
          tag.name.toLowerCase().includes(normalizedQuery),
      );
  }, [availableTags, selected, excludedList, query]);

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

  const removeExcluded = (name: string) => {
    onExcludedChange?.(excludedList.filter((tag) => tag !== name));
  };

  // Flip a chip between include ("has tag") and exclude ("missing tag"). The
  // parent moves the tag across both lists in one update so they stay disjoint.
  const toggleNegate = (name: string) => {
    onToggleExclude?.(name);
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
        {negatable && (selected.length > 0 || excludedList.length > 0) ? (
          <span style={{ color: "#9fb0ab", fontWeight: 600 }}>
            {" "}
            (check the box to show cards missing a {noun})
          </span>
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

        {selected.map((name) => {
          const color = tagColor(name, availableTags);
          return (
            <TagChip
              key={name}
              name={name}
              color={color}
              size="sm"
              onRemove={() => removeFilter(name)}
              leading={
                negatable ? (
                  <NegateCheckbox
                    excluded={false}
                    textColor={readableTextColor(color)}
                    tagName={name}
                    onToggle={() => toggleNegate(name)}
                  />
                ) : undefined
              }
            />
          );
        })}

        {excludedList.map((name) => {
          const color = tagColor(name, availableTags);
          return (
            <TagChip
              key={`not-${name}`}
              name={name}
              color={color}
              size="sm"
              strikethrough
              title={`Cards missing ${name}`}
              onRemove={() => removeExcluded(name)}
              leading={
                <NegateCheckbox
                  excluded
                  textColor={readableTextColor(color)}
                  tagName={name}
                  onToggle={() => toggleNegate(name)}
                />
              }
            />
          );
        })}
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
