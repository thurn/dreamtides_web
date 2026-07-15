import type { ReactElement } from "react";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { GroupPanel } from "./GroupPanel";
import { IconButton } from "./IconButton";

export interface CardOrderEditorItem {
  /** Card UUID or battle-instance id returned unchanged by callbacks. */
  id: string;
  /** Presentation-only card label. */
  label: string;
  /** Optional secondary identifying detail. */
  summary?: string;
}

export interface CardOrderEditorProps {
  /** Ordered cards, from top to bottom. */
  items: readonly CardOrderEditorItem[];
  /** Accessible name for the ordered collection. */
  label: string;
  /** Returns the complete top-to-bottom sequence of card ids after a move. */
  onOrderChange: (orderedIds: readonly string[]) => void;
}

/** A structured, identity-safe top-to-bottom card ordering control. */
export function CardOrderEditor({ items, label, onOrderChange }: CardOrderEditorProps): ReactElement {
  const move = (from: number, to: number): void => {
    const ids = items.map((item) => item.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    onOrderChange(ids);
  };
  return (
    <div role="list" aria-label={label} style={{ display: "grid", gap: token("--space-3") }}>
      {items.map((item, index) => (
        <div role="listitem" key={item.id} data-card-order-id={item.id}>
          <GroupPanel>
            <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto auto", alignItems: "center", gap: token("--space-3") }}>
              <span style={{ color: token("--text-on-glass-muted"), font: token("--t-numeral") }}>{String(index + 1)}</span>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ color: token("--text-on-glass"), font: token("--t-body-sm"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                {item.summary === undefined ? null : <span style={{ color: token("--text-on-glass-muted"), font: token("--t-caption") }}>{item.summary}</span>}
              </span>
              <IconButton glyph={GLYPHS.chevronUp} size="sm" placement="onGlass" label={`Move ${item.label} up`} disabled={index === 0} onPress={() => move(index, index - 1)} />
              <IconButton glyph={GLYPHS.chevronDown} size="sm" placement="onGlass" label={`Move ${item.label} down`} disabled={index === items.length - 1} onPress={() => move(index, index + 1)} />
            </div>
          </GroupPanel>
        </div>
      ))}
    </div>
  );
}
