import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { GameCard, type GameCardModel } from "../components/card/CardView";
import { GlassButton } from "../components/controls/GlassButton";
import { IconButton } from "../components/controls/IconButton";
import {
  DreamwellCard,
  type DreamwellCardModel,
} from "../components/battle/DreamwellCard";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { GLYPHS } from "../primitives/glyph";
import { POINTER_MOVEMENT_SLOP_PX } from "../primitives/pointer-gesture";
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
/** Readable source-card widths while leaving room for the Foresee workflow. */
const FORESEE_SOURCE_CARD_WIDTH_DESKTOP_PX = 360;
const FORESEE_SOURCE_CARD_WIDTH_MOBILE_PX = 260;

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
  /** Dreamwell card whose effect opened this authoritative prompt. */
  sourceDreamwellCard?: DreamwellCardModel;
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
  /** Commits one complete order/void resolution. */
  onConfirm: (resolution: BattleForeseeResolution) => void;
}

interface ForeseePointerDrag {
  pointerId: number;
  battleCardId: string;
  startX: number;
  startY: number;
  dragging: boolean;
  restingTransform: string;
  restingZIndex: string;
}

/**
 * One-row Cumulus Foresee modal. Cards stay as tangible objects directly on
 * the glass surface while pointer capture stages their deck order or void move.
 * Avoiding native HTML drag keeps Firefox from rasterizing the complete card
 * and glass compositor subtree into an engine-owned drag image.
 */
export function BattleForeseeOverlay({
  view,
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
  const sourceCardWidthPx = isDesktop
    ? FORESEE_SOURCE_CARD_WIDTH_DESKTOP_PX
    : FORESEE_SOURCE_CARD_WIDTH_MOBILE_PX;
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
  const pointerDragRef = useRef<ForeseePointerDrag | null>(null);
  const dragSuppressedRef = useRef(false);
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

  const resolvePointerDrop = (
    battleCardId: string,
    clientX: number,
    clientY: number,
    sourceElement: HTMLElement,
  ): void => {
    const row = sourceElement.closest<HTMLElement>("[data-foresee-row]");
    if (row === null) return;
    const deckIndicator = row.querySelector<HTMLElement>(
      '[data-foresee-indicator="deck"]',
    );
    const voidIndicator = row.querySelector<HTMLElement>(
      '[data-foresee-indicator="void"]',
    );
    if (
      deckIndicator === null ||
      voidIndicator === null ||
      !rectContainsPoint(row.getBoundingClientRect(), clientX, clientY)
    ) {
      return;
    }

    const targetCard = Array.from(
      row.querySelectorAll<HTMLElement>('[data-foresee-card-zone="deck"]'),
    )
      .filter((element) => element.dataset.foreseeCardId !== battleCardId)
      .map((element) => ({
        battleCardId: element.dataset.foreseeCardId,
        bounds: element.getBoundingClientRect(),
      }))
      .filter(
        (candidate) =>
          candidate.battleCardId !== undefined &&
          rectContainsPoint(candidate.bounds, clientX, clientY),
      )
      .sort(
        (left, right) =>
          distanceSquaredToRect(clientX, clientY, left.bounds) -
          distanceSquaredToRect(clientX, clientY, right.bounds),
      )[0];
    if (targetCard?.battleCardId !== undefined) {
      moveToDeck(battleCardId, targetCard.battleCardId);
      return;
    }

    const deckDistance = distanceSquaredToRect(
      clientX,
      clientY,
      deckIndicator.getBoundingClientRect(),
    );
    const voidDistance = distanceSquaredToRect(
      clientX,
      clientY,
      voidIndicator.getBoundingClientRect(),
    );
    if (deckDistance <= voidDistance) {
      moveToDeck(battleCardId, orderedCardIds[0]);
    } else {
      moveToVoid(battleCardId);
    }
  };

  const finishPointerDrag = (
    event: ReactPointerEvent<HTMLElement>,
    commit: boolean,
  ): void => {
    const pointerDrag = pointerDragRef.current;
    if (pointerDrag?.pointerId !== event.pointerId) return;
    if (pointerDrag.dragging) {
      event.preventDefault();
      event.stopPropagation();
      if (commit) {
        resolvePointerDrop(
          pointerDrag.battleCardId,
          event.clientX,
          event.clientY,
          event.currentTarget,
        );
      }
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released after a window-level cancel.
    }
    event.currentTarget.style.transform = pointerDrag.restingTransform;
    event.currentTarget.style.zIndex = pointerDrag.restingZIndex;
    event.currentTarget.style.cursor = "grab";
    event.currentTarget.dataset.foreseePointerDragging = "false";
    pointerDragRef.current = null;
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
        draggable={false}
        data-foresee-card-id={battleCardId}
        data-foresee-card-zone={zone}
        data-foresee-pointer-dragging="false"
        onDragStart={(event) => {
          event.preventDefault();
        }}
        onPointerDownCapture={(event) => {
          dragSuppressedRef.current = false;
          if (event.button !== 0) return;
          pointerDragRef.current = {
            pointerId: event.pointerId,
            battleCardId,
            startX: event.clientX,
            startY: event.clientY,
            dragging: false,
            restingTransform: event.currentTarget.style.transform,
            restingZIndex: event.currentTarget.style.zIndex,
          };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Pointer capture is best-effort on older touch browsers.
          }
        }}
        onPointerMove={(event) => {
          const pointerDrag = pointerDragRef.current;
          if (pointerDrag?.pointerId !== event.pointerId) return;
          const x = event.clientX - pointerDrag.startX;
          const y = event.clientY - pointerDrag.startY;
          if (
            !pointerDrag.dragging &&
            Math.hypot(x, y) <= POINTER_MOVEMENT_SLOP_PX
          ) {
            return;
          }
          event.preventDefault();
          if (!pointerDrag.dragging) {
            pointerDrag.dragging = true;
            dragSuppressedRef.current = true;
            event.currentTarget.dataset.foreseePointerDragging = "true";
            event.currentTarget.style.zIndex = "100";
            event.currentTarget.style.cursor = "grabbing";
            window.dispatchEvent(new Event("dragstart"));
          }
          event.currentTarget.style.transform =
            `translate3d(${String(x)}px, ${String(y)}px, 0)`;
        }}
        onPointerUpCapture={(event) => {
          finishPointerDrag(event, true);
        }}
        onPointerCancelCapture={(event) => {
          finishPointerDrag(event, false);
        }}
        onClickCapture={(event) => {
          if (!dragSuppressedRef.current) return;
          dragSuppressedRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        style={{
          width: cardWidthPx,
          flex: "0 0 auto",
          marginInlineStart: stackIndex === 0 ? 0 : -(cardWidthPx / 2),
          position: "relative",
          zIndex: stackSize - stackIndex,
          cursor: "grab",
          touchAction: "none",
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
    borderRadius: token("--radius-panel"),
    color: token("--text-on-glass"),
    font: token("--t-title-sm"),
  } as const;

  return (
    <GlassDialog
      title={`Foresee ${String(count)}`}
      desktopCenterTarget="battlefield"
    >
      <div
        data-battle-cumulus-foresee=""
        style={{ display: "grid", gap: token("--space-5") }}
      >
        {view.sourceDreamwellCard === undefined ? null : (
          <section
            data-battle-prompt-source="dreamwell"
            style={{
              display: "grid",
              justifyItems: "center",
              gap: token("--space-2"),
            }}
          >
            <span
              style={{
                color: token("--text-on-glass-muted"),
                font: token("--t-eyebrow"),
                letterSpacing: token("--tracking-eyebrow"),
                textTransform: "uppercase",
              }}
            >
              Triggered By
            </span>
            <div style={{ width: sourceCardWidthPx, maxWidth: "100%" }}>
              <DreamwellCard model={view.sourceDreamwellCard} />
            </div>
          </section>
        )}

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

function rectContainsPoint(bounds: DOMRect, x: number, y: number): boolean {
  return (
    x >= bounds.left &&
    x <= bounds.right &&
    y >= bounds.top &&
    y <= bounds.bottom
  );
}
