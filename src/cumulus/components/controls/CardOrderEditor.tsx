import { Reorder, useDragControls } from "framer-motion";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import { glassContentControlSurface } from "../../internal/control-treatment";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import { Pressable } from "../../primitives/Pressable";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { StandaloneGlyph } from "./StandaloneGlyph";
import { opaque, txa, type LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

export interface CardOrderEditorItem<Id extends string> {
  /** Card UUID or battle-instance id returned unchanged by callbacks. */
  id: Id;
  /** Presentation-only card label. */
  label: LocalizedString;
  /** Optional secondary identifying detail. */
  summary?: LocalizedString;
}

export interface CardOrderEditorProps<Id extends string> {
  /** Ordered cards, from top to bottom. */
  items: readonly CardOrderEditorItem<Id>[];
  /** Accessible name for the ordered collection. */
  label: LocalizedString;
  /** Returns the complete top-to-bottom sequence of card ids after a move. */
  onOrderChange: (orderedIds: readonly Id[]) => void;
  /**
   * Surface beneath the editor. `onMedia` gives the editor its own liquid glass
   * boundary; `onGlass` uses a lighter tonal lens inside an existing glass
   * panel or dialog. Defaults to `onMedia`.
   */
  placement?: GlassControlPlacement;
}

/** A structured, identity-safe drag-to-reorder control for a top-to-bottom card sequence. */
export function CardOrderEditor<Id extends string>({
  items,
  label,
  onOrderChange,
  placement = "onMedia",
}: CardOrderEditorProps<Id>): ReactElement {
  const resolve = useLocalizer();
  const move = (from: number, to: number): void => {
    const ids = items.map((item) => item.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    onOrderChange(ids);
  };
  return (
    <Reorder.Group
      as="div"
      axis="y"
      values={items.map((item) => item.id)}
      onReorder={onOrderChange}
      role="list"
      aria-label={resolve(label)}
      data-glass-placement={placement}
      style={{
        ...glassContentControlSurface(placement),
        display: "grid",
        paddingInline: token("--space-l"),
        overflow: "hidden",
      }}
    >
      {items.map((item, index) => (
        <CardOrderEditorRow
          key={item.id}
          item={item}
          index={index}
          itemCount={items.length}
          onMove={move}
        />
      ))}
    </Reorder.Group>
  );
}

function CardOrderEditorRow<Id extends string>({
  item,
  index,
  itemCount,
  onMove,
}: {
  readonly item: CardOrderEditorItem<Id>;
  readonly index: number;
  readonly itemCount: number;
  readonly onMove: (from: number, to: number) => void;
}): ReactElement {
  const resolve = useLocalizer();
  const controls = useDragControls();

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      onMove(index, index - 1);
    }
    if (event.key === "ArrowDown" && index < itemCount - 1) {
      event.preventDefault();
      onMove(index, index + 1);
    }
  };

  return (
    <Reorder.Item
      as="div"
      value={item.id}
      role="listitem"
      aria-posinset={index + 1}
      aria-setsize={itemCount}
      dragListener={false}
      dragControls={controls}
      data-card-order-id={item.id}
      style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        alignItems: "center",
        gap: token("--space-xs"),
        paddingBlock: token("--space-s"),
        borderBottom: `1px solid ${token("--border-soft")}`,
      }}
    >
      <span
        style={{
          color: token("--text-on-glass-muted"),
          font: token("--t-numeral"),
        }}
      >
        {String(index + 1)}
      </span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span
          style={{
            color: token("--text-on-glass"),
            font: token("--t-body-sm"),
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {resolve(item.label)}
        </span>
        {item.summary === undefined ? null : (
          <span
            style={{
              color: token("--text-on-glass-muted"),
              font: token("--t-caption"),
            }}
          >
            {resolve(item.summary)}
          </span>
        )}
      </span>
      <Pressable
        as="button"
        ariaLabelMessage={txa(
          "Reorder {card_name}",
          { card_name: opaque(item.label) },
          "[accessibility] [battle] Command on a drag handle that reorders one battle card. card_name is the independently localized UUID-resolved card name and is grammatically invariant here; arrow-key commands move that physical entry.",
        )}
        aria-keyshortcuts="ArrowUp ArrowDown"
        data-card-order-drag-handle={item.id}
        onPointerDown={(event: PointerEvent<HTMLButtonElement>) =>
          controls.start(event)
        }
        onKeyDown={handleKeyDown}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: token("--touch-min"),
          height: token("--touch-min"),
          padding: 0,
          border: "none",
          background: "transparent",
          color: token("--text-on-glass-muted"),
          fontSize: "1.4em",
          cursor: "grab",
          touchAction: "none",
        }}
      >
        <StandaloneGlyph glyph={GLYPHS.dragHandle} color="text-secondary" />
      </Pressable>
    </Reorder.Item>
  );
}
