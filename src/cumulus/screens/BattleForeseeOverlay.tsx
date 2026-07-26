import {
  useRef,
  useState,
  type DragEvent,
  type ReactElement,
} from "react";
import { GameCard, type GameCardModel } from "../components/card/CardView";
import { GlassButton } from "../components/controls/GlassButton";
import { IconButton } from "../components/controls/IconButton";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { DreamwellCard, type DreamwellCardModel } from "../components/battle/DreamwellCard";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "./use-is-desktop";

/** Card width and the minimum empty travel lane before the Void indicator. */
const FORESEE_CARD_WIDTH_DESKTOP_PX = 180;
const FORESEE_CARD_WIDTH_MOBILE_PX = 104;
/** A compact label target that remains easy to hit without imitating a card. */
const FORESEE_INDICATOR_WIDTH_MOBILE_PX = 64;
/** Keeps both drop indicators aligned to the complete card silhouette. */
const FORESEE_ROW_HEIGHT_DESKTOP_PX = 252;
const FORESEE_ROW_HEIGHT_MOBILE_PX = 146;

/** One UUID-backed battle card in the inspected deck prefix. */
export interface BattleForeseeCardView {
  /** Stable battle-instance id used for ordering and every callback. */
  battleCardId: string;
  /** Complete card presentation resolved from the battle instance. */
  model: GameCardModel;
}

/** The ordered deck cards available to this adjustable Foresee resolution. */
export interface BattleForeseeView {
  /** Number of cards shown when the modal opens. */
  initialCount: number;
  /** Available cards in their original top-to-bottom deck order. */
  cards: readonly BattleForeseeCardView[];
}

/** The complete staged result emitted by one confirmation. */
export interface BattleForeseeResolution {
  /** The exact original deck prefix inspected at confirmation time. */
  viewedCardIds: readonly string[];
  /** Cards returned to the deck, top to bottom. */
  orderedCardIds: readonly string[];
  /** Cards moved to the void, in the order chosen. */
  voidCardIds: readonly string[];
}

export interface BattleForeseeOverlayProps {
  /** The exact cards inspected by the effect. */
  view: BattleForeseeView;
  /** The Dreamwell source card remains visible beside this follow-up choice. */
  source?: DreamwellCardModel | null;
  /** Commits one complete order/void resolution. */
  onConfirm: (resolution: BattleForeseeResolution) => void;
}

/**
 * One-row Cumulus Foresee modal. Cards stay as tangible objects directly on
 * the glass surface while drag-and-drop stages their deck order or void move.
 */
export function BattleForeseeOverlay({
  view,
  source = null,
  onConfirm,
}: BattleForeseeOverlayProps): ReactElement {
  const isDesktop = useIsDesktop();
  const cardWidthPx = isDesktop
    ? FORESEE_CARD_WIDTH_DESKTOP_PX
    : FORESEE_CARD_WIDTH_MOBILE_PX;
  const indicatorWidthPx = isDesktop
    ? cardWidthPx
    : FORESEE_INDICATOR_WIDTH_MOBILE_PX;
  const rowHeightPx = isDesktop
    ? FORESEE_ROW_HEIGHT_DESKTOP_PX
    : FORESEE_ROW_HEIGHT_MOBILE_PX;
  const allCardIds = view.cards.map((card) => card.battleCardId);
  const minimumCount = allCardIds.length === 0 ? 0 : 1;
  const initialCount = Math.min(
    allCardIds.length,
    Math.max(minimumCount, Math.floor(view.initialCount)),
  );
  const [count, setCount] = useState(initialCount);
  const [orderedCardIds, setOrderedCardIds] = useState<readonly string[]>(
    allCardIds.slice(0, initialCount),
  );
  const [voidCardIds, setVoidCardIds] = useState<readonly string[]>([]);
  const draggedCardId = useRef<string | null>(null);
  const cardById = new Map(view.cards.map((card) => [card.battleCardId, card]));

  const incrementCount = (): void => {
    const addedCardId = allCardIds[count];
    if (addedCardId === undefined) return;
    setOrderedCardIds((current) => [...current, addedCardId]);
    setCount((current) => current + 1);
  };

  const decrementCount = (): void => {
    if (count <= minimumCount) return;
    const removedCardId = allCardIds[count - 1];
    if (removedCardId === undefined) return;
    setOrderedCardIds((current) => current.filter((id) => id !== removedCardId));
    setVoidCardIds((current) => current.filter((id) => id !== removedCardId));
    setCount((current) => current - 1);
  };

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
      if (beforeCardId === undefined) return [...withoutMoved, battleCardId];
      const targetIndex = withoutMoved.indexOf(beforeCardId);
      if (targetIndex < 0) return [...withoutMoved, battleCardId];
      return [
        ...withoutMoved.slice(0, targetIndex),
        battleCardId,
        ...withoutMoved.slice(targetIndex),
      ];
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

  const renderCard = (
    battleCardId: string,
    zone: "deck" | "void",
    stackIndex: number,
    stackSize: number,
  ): ReactElement | null => {
    const card = cardById.get(battleCardId);
    if (card === undefined) return null;
    return (
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
          width: cardWidthPx,
          flex: "0 0 auto",
          marginInlineStart: stackIndex === 0 ? 0 : -(cardWidthPx / 2),
          position: "relative",
          zIndex: stackSize - stackIndex,
        }}
      >
        <GameCard model={card.model} presentation="full" />
      </article>
    );
  };

  const indicatorStyle = {
    width: indicatorWidthPx,
    minHeight: rowHeightPx,
    flex: "0 0 auto",
    display: "grid",
    placeItems: "center",
    border: `1px solid ${token("--border-strong")}`,
    borderRadius: token("--radius-card"),
    color: token("--text-on-glass"),
    font: token("--t-title-sm"),
  } as const;

  return (
    <GlassDialog
      title={`Foresee ${String(count)}`}
      desktopCenterTarget="battlefield"
      presentation={source === null ? "responsive" : "popup"}
      companion={source === null ? undefined : (
        <div
          data-battle-foresee-dreamwell-source={source.cardId}
          style={{ width: "min(72vw, 360px)" }}
        >
          <DreamwellCard model={source} />
        </div>
      )}
    >
      <div
        data-battle-cumulus-foresee=""
        style={{ display: "grid", gap: token("--space-5") }}
      >
        <div
          data-foresee-count-controls=""
          style={{
            display: "flex",
            justifyContent: "center",
            gap: token("--space-3"),
          }}
        >
          <IconButton
            glyph={GLYPHS.minus}
            size="sm"
            label="Foresee 1 fewer"
            placement="onGlass"
            disabled={count <= minimumCount}
            onPress={decrementCount}
          />
          <IconButton
            glyph={GLYPHS.plus}
            size="sm"
            label="Foresee 1 more"
            placement="onGlass"
            disabled={count >= allCardIds.length}
            onPress={incrementCount}
          />
        </div>

        <div style={{ overflowX: "auto", paddingBottom: token("--space-3") }}>
          <div
            data-foresee-row=""
            data-foresee-drop-geometry="nearest-destination"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dragged = droppedCardId(event);
              if (dragged === null) return;
              const deckIndicator =
                event.currentTarget.querySelector<HTMLElement>(
                  '[data-foresee-indicator="deck"]',
                );
              const voidIndicator =
                event.currentTarget.querySelector<HTMLElement>(
                  '[data-foresee-indicator="void"]',
                );
              if (deckIndicator === null || voidIndicator === null) return;
              const deckDistance = distanceSquaredToRect(
                event.clientX,
                event.clientY,
                deckIndicator.getBoundingClientRect(),
              );
              const voidDistance = distanceSquaredToRect(
                event.clientX,
                event.clientY,
                voidIndicator.getBoundingClientRect(),
              );
              if (deckDistance <= voidDistance) {
                moveToDeck(dragged, orderedCardIds[0]);
              } else {
                moveToVoid(dragged);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: token("--space-4"),
              width: "100%",
              minWidth: "max-content",
            }}
          >
            <div
              data-foresee-indicator="deck"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const dragged = droppedCardId(event);
                if (dragged !== null) moveToDeck(dragged, orderedCardIds[0]);
              }}
              style={indicatorStyle}
            >
              Deck
            </div>

            <div
              data-foresee-deck-stack=""
              style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}
            >
              {orderedCardIds.map((battleCardId, index) => (
                renderCard(battleCardId, "deck", index, orderedCardIds.length)
              ))}
            </div>

            <div
              data-foresee-spacer=""
              aria-hidden="true"
              style={{
                minWidth: cardWidthPx,
                flex: `1 0 ${String(cardWidthPx)}px`,
                alignSelf: "stretch",
              }}
            />

            <div
              data-foresee-void-stack=""
              style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}
            >
              {voidCardIds.map((battleCardId, index) => (
                renderCard(battleCardId, "void", index, voidCardIds.length)
              ))}
            </div>

            <div
              data-foresee-indicator="void"
              data-foresee-zone="void"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const dragged = droppedCardId(event);
                if (dragged !== null) moveToVoid(dragged);
              }}
              style={indicatorStyle}
            >
              Void
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <GlassButton
            label="Confirm"
            placement="onGlass"
            variant="accent"
            testId="battle-foresee-confirm"
            onPress={() => onConfirm({
              viewedCardIds: allCardIds.slice(0, count),
              orderedCardIds,
              voidCardIds,
            })}
          />
        </div>
      </div>
    </GlassDialog>
  );
}

function distanceSquaredToRect(
  x: number,
  y: number,
  bounds: DOMRect,
): number {
  const deltaX = x < bounds.left
    ? bounds.left - x
    : x > bounds.right
      ? x - bounds.right
      : 0;
  const deltaY = y < bounds.top
    ? bounds.top - y
    : y > bounds.bottom
      ? y - bounds.bottom
      : 0;
  return deltaX * deltaX + deltaY * deltaY;
}
