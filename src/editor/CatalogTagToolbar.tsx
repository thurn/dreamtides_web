import TagFilterControl from "./TagFilterControl";
import type { EditorTag } from "./types";

interface CatalogTagToolbarProps {
  tags: EditorTag[];
  selected: string[];
  excluded: string[];
  editing: boolean;
  onSelectedChange: (value: string[]) => void;
  onExcludedChange: (value: string[]) => void;
  onToggleExclude: (name: string) => void;
  onToggleEditing: () => void;
  onManage: () => void;
}

export default function CatalogTagToolbar(props: CatalogTagToolbarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "end",
        flexWrap: "wrap",
        gap: "10px",
      }}
    >
      <TagFilterControl
        availableTags={props.tags}
        selected={props.selected}
        excluded={props.excluded}
        onChange={props.onSelectedChange}
        onExcludedChange={props.onExcludedChange}
        onToggleExclude={props.onToggleExclude}
      />
      <button
        type="button"
        aria-pressed={props.editing}
        onClick={props.onToggleEditing}
        style={{
          minHeight: "36px",
          borderRadius: "6px",
          border: "1px solid rgba(142, 219, 209, 0.55)",
          background: props.editing ? "#2d8a80" : "#0f1719",
          color: "#fff7e0",
          padding: "0 12px",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Tag cards
      </button>
      <button
        type="button"
        onClick={props.onManage}
        style={{
          minHeight: "36px",
          borderRadius: "6px",
          border: "1px solid rgba(247, 241, 223, 0.28)",
          background: "#0f1719",
          color: "#fff7e0",
          padding: "0 12px",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Manage tags
      </button>
    </div>
  );
}
