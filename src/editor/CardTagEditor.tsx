import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import TagChip from "./TagChip";
import { tagColor } from "./tag-color";
import type { EditorTag } from "./types";

export interface CardTagEditorProps {
  cardTags: string[];
  availableTags: EditorTag[];
  saving: boolean;
  error: string | null;
  onAddTag: (name: string) => void;
  onRemoveTag: (name: string) => void;
  onOpenManageTags: () => void;
  /** Singular label for the facet, e.g. "tag" or "tide". */
  noun?: string;
}

const stripStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "5px",
  marginTop: "6px",
  paddingTop: "6px",
  borderTop: "1px solid rgba(247, 241, 223, 0.12)",
};

const addButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  minHeight: "22px",
  padding: "1px 8px",
  borderRadius: "999px",
  border: "1px dashed rgba(142, 219, 209, 0.7)",
  background: "rgba(20, 36, 42, 0.9)",
  color: "#8edbd1",
  font: "inherit",
  fontSize: "0.72rem",
  fontWeight: 800,
  cursor: "pointer",
};

const popoverStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  zIndex: 40,
  width: "210px",
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
  fontSize: "0.78rem",
};

export default function CardTagEditor({
  cardTags,
  availableTags,
  saving,
  error,
  onAddTag,
  onRemoveTag,
  onOpenManageTags,
  noun = "tag",
}: CardTagEditorProps) {
  const Noun = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
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
        // Consume Escape in the capture phase so dismissing the open dropdown
        // does not also bubble up and close a surrounding focused editor.
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  const assignable = useMemo(() => {
    const assigned = new Set(cardTags);
    const normalizedQuery = query.trim().toLowerCase();
    return availableTags
      .filter((tag) => !assigned.has(tag.name))
      .filter(
        (tag) =>
          normalizedQuery === "" ||
          tag.name.toLowerCase().includes(normalizedQuery),
      );
  }, [availableTags, cardTags, query]);

  const closeAndReset = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      ref={containerRef}
      style={stripStyle}
      {...{ [`data-editor-card-${noun}s`]: "true" }}
    >
      {cardTags.map((name) => (
        <TagChip
          key={name}
          name={name}
          color={tagColor(name, availableTags)}
          size="sm"
          onRemove={() => onRemoveTag(name)}
        />
      ))}

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={popoverId}
        title={`Add a ${noun}`}
        onClick={() => setOpen((value) => !value)}
        style={addButtonStyle}
      >
        <span aria-hidden="true" style={{ fontSize: "0.8rem" }}>
          +
        </span>
        {Noun}
      </button>

      {saving ? (
        <span style={{ color: "#8edbd1", fontSize: "0.68rem", fontWeight: 700 }}>
          Saving…
        </span>
      ) : null}
      {error !== null ? (
        <span
          role="alert"
          style={{ color: "#f7a99a", fontSize: "0.68rem", fontWeight: 700 }}
        >
          {error}
        </span>
      ) : null}

      {open ? (
        <div id={popoverId} role="listbox" style={popoverStyle}>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={`Search ${noun}s…`}
            aria-label={`Search ${noun}s to add`}
            style={searchInputStyle}
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "5px",
              maxHeight: "160px",
              overflowY: "auto",
            }}
          >
            {assignable.length === 0 ? (
              <span
                style={{
                  color: "#9fb0ab",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  padding: "2px 0",
                }}
              >
                {availableTags.length === 0
                  ? `No ${noun}s yet.`
                  : query.trim() !== ""
                    ? `No matching ${noun}s.`
                    : `All ${noun}s applied.`}
              </span>
            ) : (
              assignable.map((tag) => (
                <TagChip
                  key={tag.name}
                  name={tag.name}
                  color={tag.color}
                  size="sm"
                  onClick={() => {
                    onAddTag(tag.name);
                    closeAndReset();
                  }}
                />
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              closeAndReset();
              onOpenManageTags();
            }}
            style={{
              alignSelf: "flex-start",
              border: 0,
              background: "transparent",
              color: "#8edbd1",
              font: "inherit",
              fontSize: "0.72rem",
              fontWeight: 700,
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            {`Manage ${noun}s…`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
