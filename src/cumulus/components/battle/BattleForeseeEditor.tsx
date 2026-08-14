import { meaning, txa, tx } from "@trox/runtime";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { GameCard, type GameCardModel } from "../card/CardView";
import { GlassButton } from "../controls/GlassButton";
import { IconButton } from "../controls/IconButton";
import { DreamwellCard, type DreamwellCardModel } from "./DreamwellCard";
import { GlassDialog } from "../overlay/GlassDialog";
import { GLYPHS } from "../../primitives/glyph";
import { POINTER_MOVEMENT_SLOP_PX } from "../../primitives/pointer-gesture";
import { token } from "../../primitives/tokens";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import {
  battleCardIdFromUnknown,
  type BattleCardId,
} from "../../../types/identifiers";

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
export interface BattleForeseeEditorCard {
  /** Stable battle-instance id used for ordering and every callback. */
  readonly battleCardId: BattleCardId;
  /** Complete card presentation resolved from the battle instance. */
  readonly card: GameCardModel;
}

/** The ordered deck cards available to this adjustable Foresee resolution. */
export interface BattleForeseeEditorModel {
  /** Number of cards shown when the modal opens. */
  readonly initialCount: number;
  /** Available cards in their original top-to-bottom deck order. */
  readonly cards: readonly BattleForeseeEditorCard[];
  /** Closed ordered set of card counts the player may stage. */
  readonly allowedCounts: readonly number[];
  /** Dreamwell card whose effect opened this authoritative prompt. */
  readonly source?: DreamwellCardModel;
}

/** The complete staged result emitted by one confirmation. */
export interface BattleForeseeResult {
  /** The exact original deck prefix inspected at confirmation time. */
  viewedCardIds: readonly BattleCardId[];
  /** Cards returned to the deck, top to bottom. */
  orderedCardIds: readonly BattleCardId[];
  /** Cards moved to the void, in the order chosen. */
  voidCardIds: readonly BattleCardId[];
}

export interface BattleForeseeEditorProps {
  /** The exact cards inspected by the effect. */
  model: BattleForeseeEditorModel;
  /** Commits one complete order/void resolution. */
  onConfirm: (resolution: BattleForeseeResult) => void;
}

interface ForeseePointerDrag {
  pointerId: number;
  battleCardId: BattleCardId;
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
export function BattleForeseeEditor({
  model,
  onConfirm,
}: BattleForeseeEditorProps): ReactElement {
  const resolve = useLocalizer();
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
  const allCardIds = model.cards.map((card) => card.battleCardId);
  if (new Set(allCardIds).size !== allCardIds.length) {
    throw new Error("BattleForeseeEditor requires unique battleCardId values.");
  }
  const allowedCountsAreValid = model.allowedCounts.every(
    (count, index, counts) =>
      Number.isInteger(count) &&
      count >= 0 &&
      count <= allCardIds.length &&
      (index === 0 || counts[index - 1] < count),
  );
  if (!allowedCountsAreValid || model.allowedCounts.length === 0) {
    throw new Error(
      "BattleForeseeEditor requires a nonempty, strictly increasing set of valid allowedCounts.",
    );
  }
  if (
    !Number.isInteger(model.initialCount) ||
    !model.allowedCounts.includes(model.initialCount)
  ) {
    throw new Error(
      "BattleForeseeEditor initialCount must be one of allowedCounts.",
    );
  }
  const safeAllowedCounts = model.allowedCounts;
  const minimumCount = safeAllowedCounts[0] ?? 0;
  const initialCount = model.initialCount;
  const [count, setCount] = useState(initialCount);
  const [orderedCardIds, setOrderedCardIds] = useState<readonly BattleCardId[]>(
    allCardIds.slice(0, initialCount),
  );
  const [voidCardIds, setVoidCardIds] = useState<readonly BattleCardId[]>([]);
  const pointerDragRef = useRef<ForeseePointerDrag | null>(null);
  const dragSuppressedRef = useRef(false);
  const cardById = new Map(
    model.cards.map((card) => [card.battleCardId, card]),
  );
  const modelIdentity = `${allCardIds.join("|")}::${safeAllowedCounts.join("|")}::${String(initialCount)}`;

  useEffect(() => {
    setCount(initialCount);
    setOrderedCardIds(allCardIds.slice(0, initialCount));
    setVoidCardIds([]);
    pointerDragRef.current = null;
  }, [modelIdentity]);

  const incrementCount = (): void => {
    const nextCount = safeAllowedCounts.find((candidate) => candidate > count);
    if (nextCount === undefined) return;
    const addedCardIds = allCardIds.slice(count, nextCount);
    setOrderedCardIds((current) => [...current, ...addedCardIds]);
    setCount(nextCount);
  };

  const decrementCount = (): void => {
    const previousCount = [...safeAllowedCounts]
      .reverse()
      .find((candidate) => candidate < count);
    if (previousCount === undefined) return;
    const removedCardIds = new Set(allCardIds.slice(previousCount, count));
    setOrderedCardIds((current) =>
      current.filter((id) => !removedCardIds.has(id)),
    );
    setVoidCardIds((current) =>
      current.filter((id) => !removedCardIds.has(id)),
    );
    setCount(previousCount);
  };

  const moveToVoid = (battleCardId: BattleCardId): void => {
    setOrderedCardIds((current) => current.filter((id) => id !== battleCardId));
    setVoidCardIds((current) =>
      current.includes(battleCardId) ? current : [...current, battleCardId],
    );
  };

  const moveToDeck = (
    battleCardId: BattleCardId,
    beforeCardId?: BattleCardId,
  ): void => {
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

  const moveWithinDeck = (battleCardId: BattleCardId, offset: -1 | 1): void => {
    setOrderedCardIds((current) => {
      const index = current.indexOf(battleCardId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const resolvePointerDrop = (
    battleCardId: BattleCardId,
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
        battleCardId: battleCardIdFromUnknown(element.dataset.foreseeCardId),
        bounds: element.getBoundingClientRect(),
      }))
      .filter(
        (candidate) =>
          candidate.battleCardId !== null &&
          rectContainsPoint(candidate.bounds, clientX, clientY),
      )
      .sort(
        (left, right) =>
          distanceSquaredToRect(clientX, clientY, left.bounds) -
          distanceSquaredToRect(clientX, clientY, right.bounds),
      )[0];
    if (targetCard?.battleCardId !== null && targetCard !== undefined) {
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
    battleCardId: BattleCardId,
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
        role="button"
        tabIndex={0}
        aria-label={resolve(
          txa(
            "Foresee card {card_name}, in {zone}",
            { card_name: card.card.displaySnapshot.name, zone },
            "[accessibility] A staged Foresee card and its current destination.",
          ),
        )}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" && zone === "deck") {
            event.preventDefault();
            moveWithinDeck(battleCardId, -1);
          } else if (event.key === "ArrowRight" && zone === "deck") {
            event.preventDefault();
            moveWithinDeck(battleCardId, 1);
          } else if (
            event.key === "Delete" ||
            event.key.toLowerCase() === "v"
          ) {
            event.preventDefault();
            moveToVoid(battleCardId);
          } else if (event.key === "Home" || event.key.toLowerCase() === "d") {
            event.preventDefault();
            moveToDeck(
              battleCardId,
              event.key === "Home" ? orderedCardIds[0] : undefined,
            );
          }
        }}
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
          event.currentTarget.style.transform = `translate3d(${String(x)}px, ${String(y)}px, 0)`;
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
        <GameCard model={card.card} presentation="full" />
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
      title={txa(
        "Foresee {count}",
        { count },
        "[battle] Title of the Foresee overlay. count is the positive number of cards the player may inspect and reorder.",
      )}
      desktopCenterTarget="battlefield"
    >
      <div
        data-battle-cumulus-foresee=""
        style={{ display: "grid", gap: token("--space-m") }}
      >
        {model.source === undefined ? null : (
          <section
            data-battle-prompt-source="dreamwell"
            style={{
              display: "grid",
              justifyItems: "center",
              gap: token("--space-xs"),
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
              {resolve(tx("Triggered By", "[battle] Foresee triggered by."))}
            </span>
            <div style={{ width: sourceCardWidthPx, maxWidth: "100%" }}>
              <DreamwellCard model={model.source} />
            </div>
          </section>
        )}

        <div
          data-foresee-count-controls=""
          style={{
            display: "flex",
            justifyContent: "center",
            gap: token("--space-xs"),
          }}
        >
          <IconButton
            glyph={GLYPHS.minus}
            size="sm"
            label={tx("Foresee 1 fewer", "[battle] Foresee less action.")}
            placement="onGlass"
            disabled={count <= minimumCount}
            onPress={decrementCount}
          />
          <IconButton
            glyph={GLYPHS.plus}
            size="sm"
            label={tx("Foresee 1 more", "[battle] Foresee more action.")}
            placement="onGlass"
            disabled={!safeAllowedCounts.some((candidate) => candidate > count)}
            onPress={incrementCount}
          />
        </div>

        <div style={{ overflowX: "auto", paddingBottom: token("--space-xs") }}>
          <div
            data-foresee-row=""
            data-foresee-drop-geometry="nearest-destination"
            style={{
              display: "flex",
              alignItems: "center",
              gap: token("--space-s"),
              width: "100%",
              minWidth: "max-content",
            }}
          >
            <div data-foresee-indicator="deck" style={indicatorStyle}>
              {resolve(tx("Deck", "[battle] Foresee deck destination."))}
            </div>

            <div
              data-foresee-deck-stack=""
              style={{
                display: "flex",
                alignItems: "center",
                flex: "0 0 auto",
              }}
            >
              {orderedCardIds.map((battleCardId, index) =>
                renderCard(battleCardId, "deck", index, orderedCardIds.length),
              )}
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
              style={{
                display: "flex",
                alignItems: "center",
                flex: "0 0 auto",
              }}
            >
              {voidCardIds.map((battleCardId, index) =>
                renderCard(battleCardId, "void", index, voidCardIds.length),
              )}
            </div>

            <div
              data-foresee-indicator="void"
              data-foresee-zone="void"
              style={indicatorStyle}
            >
              {resolve(
                tx(
                  meaning("foresee-void-destination", "Void"),
                  "[battle] Foresee void destination.",
                ),
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <GlassButton
            label={tx(
              "Confirm",
              "[ui] Action confirming the current selection.",
            )}
            placement="onGlass"
            variant="accent"
            testId="battle-foresee-confirm"
            onPress={() => {
              const result = {
                viewedCardIds: allCardIds.slice(0, count),
                orderedCardIds,
                voidCardIds,
              };
              const viewed = new Set(result.viewedCardIds);
              const emitted = [...result.orderedCardIds, ...result.voidCardIds];
              if (
                emitted.some((id) => !viewed.has(id)) ||
                new Set(emitted).size !== emitted.length ||
                emitted.length !== viewed.size
              ) {
                throw new Error(
                  "BattleForeseeEditor produced an invalid result partition.",
                );
              }
              onConfirm(result);
            }}
          />
        </div>
      </div>
    </GlassDialog>
  );
}

function distanceSquaredToRect(x: number, y: number, bounds: DOMRect): number {
  const deltaX =
    x < bounds.left ? bounds.left - x : x > bounds.right ? x - bounds.right : 0;
  const deltaY =
    y < bounds.top ? bounds.top - y : y > bounds.bottom ? y - bounds.bottom : 0;
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
