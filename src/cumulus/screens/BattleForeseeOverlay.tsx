import {
  useRef,
  useState,
  type DragEvent,
  type ReactElement,
} from "react";
import { GameCard, type GameCardModel } from "../components/card/CardView";
import { GlassButton } from "../components/controls/GlassButton";
import { GroupPanel } from "../components/controls/GroupPanel";
import { IconButton } from "../components/controls/IconButton";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";

/** One UUID-backed battle card in the inspected deck prefix. */
export interface BattleForeseeCardView {
  /** Stable battle-instance id used for ordering and every callback. */
  battleCardId: string;
  /** Complete card presentation resolved from the battle instance. */
  model: GameCardModel;
  /** Display-only name used in accessible control labels. */
  displayName: string;
}

/** The exact top-of-deck prefix available to this Foresee resolution. */
export interface BattleForeseeView {
  /** Player-facing possessive label, such as "your" or "the enemy's". */
  deckOwnerLabel: string;
  /** Cards in their original top-to-bottom order. */
  cards: readonly BattleForeseeCardView[];
}

/** The complete staged result emitted by one confirmation. */
export interface BattleForeseeResolution {
  /** Cards returned to the deck, top to bottom. */
  orderedCardIds: readonly string[];
  /** Cards moved to the void, in the order chosen. */
  voidCardIds: readonly string[];
}

export interface BattleForeseeOverlayProps {
  /** The exact cards inspected by the effect. */
  view: BattleForeseeView;
  /** Dismisses the modal without changing the staged order. */
  onClose: () => void;
  /** Commits one complete order/void resolution. */
  onConfirm: (resolution: BattleForeseeResolution) => void;
}

/**
 * Cumulus Foresee modal. Card movement is staged locally until confirmation;
 * drag-and-drop and named controls mutate the same identity-safe draft.
 */
export function BattleForeseeOverlay({
  view,
  onClose,
  onConfirm,
}: BattleForeseeOverlayProps): ReactElement {
  const allCardIds = view.cards.map((card) => card.battleCardId);
  const [orderedCardIds, setOrderedCardIds] = useState<readonly string[]>(allCardIds);
  const [voidCardIds, setVoidCardIds] = useState<readonly string[]>([]);
  const draggedCardId = useRef<string | null>(null);
  const cardById = new Map(view.cards.map((card) => [card.battleCardId, card]));

  const moveToVoid = (battleCardId: string): void => {
    setOrderedCardIds((current) => current.filter((id) => id !== battleCardId));
    setVoidCardIds((current) => current.includes(battleCardId)
      ? current
      : [...current, battleCardId]);
  };

  const moveToDeck = (battleCardId: string, beforeCardId?: string): void => {
    setVoidCardIds((current) => current.filter((id) => id !== battleCardId));
    setOrderedCardIds((current) => {
      const withoutMoved = current.filter((id) => id !== battleCardId);
      if (beforeCardId === undefined) {
        return [...withoutMoved, battleCardId];
      }
      const targetIndex = withoutMoved.indexOf(beforeCardId);
      if (targetIndex < 0) {
        return [...withoutMoved, battleCardId];
      }
      return [
        ...withoutMoved.slice(0, targetIndex),
        battleCardId,
        ...withoutMoved.slice(targetIndex),
      ];
    });
  };

  const moveWithinDeck = (battleCardId: string, offset: -1 | 1): void => {
    setOrderedCardIds((current) => {
      const from = current.indexOf(battleCardId);
      const to = from + offset;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return current;
      next.splice(to, 0, moved);
      return next;
    });
  };

  const beginDrag = (event: DragEvent<HTMLElement>, battleCardId: string): void => {
    draggedCardId.current = battleCardId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", battleCardId);
  };

  const droppedCardId = (event: DragEvent<HTMLElement>): string | null => {
    const id = draggedCardId.current ?? event.dataTransfer.getData("text/plain");
    return allCardIds.includes(id) ? id : null;
  };

  const cardsFor = (ids: readonly string[], zone: "deck" | "void"): ReactElement[] =>
    ids.flatMap((battleCardId, index) => {
      const card = cardById.get(battleCardId);
      if (card === undefined) return [];
      return [
        <article
          key={battleCardId}
          draggable
          data-foresee-card-id={battleCardId}
          data-foresee-card-zone={zone}
          onDragStart={(event) => beginDrag(event, battleCardId)}
          onDragEnd={() => {
            draggedCardId.current = null;
          }}
          onDragOver={(event) => {
            if (zone === "deck") event.preventDefault();
          }}
          onDrop={(event) => {
            if (zone !== "deck") return;
            event.preventDefault();
            event.stopPropagation();
            const dragged = droppedCardId(event);
            if (dragged !== null && dragged !== battleCardId) {
              moveToDeck(dragged, battleCardId);
            }
          }}
          style={{
            display: "grid",
            alignContent: "start",
            gap: token("--space-3"),
            minWidth: 0,
          }}
        >
          <span
            style={{
              color: token("--text-on-glass-muted"),
              font: token("--t-caption"),
              textAlign: "center",
            }}
          >
            {zone === "deck"
              ? index === 0
                ? "TOP"
                : `POSITION ${String(index + 1)}`
              : "VOID"}
          </span>
          <div style={{ width: "100%", maxWidth: 220, marginInline: "auto" }}>
            <GameCard model={card.model} presentation="full" />
          </div>
          {zone === "deck" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto auto minmax(0, 1fr)",
                gap: token("--space-2"),
                alignItems: "center",
              }}
            >
              <IconButton
                glyph={GLYPHS.arrowLeft}
                size="sm"
                placement="onGlass"
                label={`Move ${card.displayName} earlier`}
                disabled={index === 0}
                onPress={() => moveWithinDeck(battleCardId, -1)}
              />
              <IconButton
                glyph={GLYPHS.arrowRight}
                size="sm"
                placement="onGlass"
                label={`Move ${card.displayName} later`}
                disabled={index === ids.length - 1}
                onPress={() => moveWithinDeck(battleCardId, 1)}
              />
              <GlassButton
                label="To Void"
                placement="onGlass"
                onPress={() => moveToVoid(battleCardId)}
              />
            </div>
          ) : (
            <GlassButton
              label="Return to Deck"
              placement="onGlass"
              onPress={() => moveToDeck(battleCardId)}
            />
          )}
        </article>,
      ];
    });

  return (
    <GlassDialog
      title={`Foresee ${String(view.cards.length)}`}
      subtitle={`Drag cards to reorder the top of ${view.deckOwnerLabel} deck, or move any card to the void.`}
      closeLabel="Close Foresee"
      wide
      onClose={onClose}
    >
      <div
        data-battle-cumulus-foresee=""
        style={{ display: "grid", gap: token("--space-5") }}
      >
        <div
          data-foresee-zone="deck"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const dragged = droppedCardId(event);
            if (dragged !== null) moveToDeck(dragged);
          }}
        >
          <GroupPanel>
            <div style={{ display: "grid", gap: token("--space-4") }}>
              <div style={{ display: "grid", gap: token("--space-1") }}>
                <h3 style={{ margin: 0, color: token("--text-on-glass"), font: token("--t-title-sm") }}>
                  Deck
                </h3>
                <p style={{ margin: 0, color: token("--text-on-glass-muted"), font: token("--t-body-sm") }}>
                  Left to right is top to bottom.
                </p>
              </div>
              {orderedCardIds.length === 0 ? (
                <p style={{ margin: 0, color: token("--text-on-glass-muted"), font: token("--t-body") }}>
                  Every foreseen card is headed to the void.
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: token("--space-4"),
                    alignItems: "start",
                  }}
                >
                  {cardsFor(orderedCardIds, "deck")}
                </div>
              )}
            </div>
          </GroupPanel>
        </div>

        <div
          data-foresee-zone="void"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const dragged = droppedCardId(event);
            if (dragged !== null) moveToVoid(dragged);
          }}
        >
          <GroupPanel>
            <div style={{ display: "grid", gap: token("--space-4") }}>
              <div style={{ display: "grid", gap: token("--space-1") }}>
                <h3 style={{ margin: 0, color: token("--text-on-glass"), font: token("--t-title-sm") }}>
                  Void
                </h3>
                <p style={{ margin: 0, color: token("--text-on-glass-muted"), font: token("--t-body-sm") }}>
                  Drop any foreseen card here.
                </p>
              </div>
              {voidCardIds.length === 0 ? (
                <p style={{ margin: 0, color: token("--text-on-glass-muted"), font: token("--t-body") }}>
                  No cards selected.
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: token("--space-4"),
                    alignItems: "start",
                  }}
                >
                  {cardsFor(voidCardIds, "void")}
                </div>
              )}
            </div>
          </GroupPanel>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: token("--space-3") }}>
          <GlassButton
            label="Cancel"
            placement="onGlass"
            onPress={onClose}
          />
          <GlassButton
            label="Confirm"
            placement="onGlass"
            variant="accent"
            testId="battle-foresee-confirm"
            disabled={view.cards.length === 0}
            onPress={() => onConfirm({ orderedCardIds, voidCardIds })}
          />
        </div>
      </div>
    </GlassDialog>
  );
}
