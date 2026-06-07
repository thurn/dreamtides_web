import type { MouseEvent as ReactMouseEvent } from "react";
import type { MouseEvent as ReactPointerMouseEvent } from "react";

import { BattleCardView, battleCardVisualFromInstance } from "./BattleCardView";
import {
  selectBattleCardLocation,
  selectBattlefieldSlotOccupant,
} from "../state/selectors";
import { FRONT_RANK_SLOT_IDS, BACK_RANK_SLOT_IDS } from "../types";
import type {
  BattleFieldSlotAddress,
  BattleMutableState,
  BattleSide,
  BattlefieldSlotId,
  BattlefieldZone,
  FrontRankSlotId,
  BackRankSlotId,
} from "../types";

const SUPPORT_BY_DEPLOY: Record<FrontRankSlotId, readonly BackRankSlotId[]> = {
  F0: ["B0", "B1"],
  F1: ["B1", "B2"],
  F2: ["B2", "B3"],
  F3: ["B3", "B4"],
};

const SUPPORT_BY_RESERVE: Record<BackRankSlotId, readonly FrontRankSlotId[]> = {
  B0: ["F0"],
  B1: ["F0", "F1"],
  B2: ["F1", "F2"],
  B3: ["F2", "F3"],
  B4: ["F3"],
};

export function BattlefieldGrid({
  canInteract,
  handSelectionSide,
  onCardClick,
  onCardContextMenu,
  onCardDragEnd,
  onCardDragStart,
  onCardHoverEnd,
  onCardHoverMove,
  onCardHoverStart,
  onSlotClick,
  onSlotDrop,
  pendingDragCardId = null,
  selectedCardId,
  selectedSlot,
  selectionAnchor,
  side,
  state,
  zone,
}: {
  canInteract: boolean;
  handSelectionSide?: BattleSide | null;
  onCardClick: (battleCardId: string) => void;
  onCardContextMenu?: (battleCardId: string, event: ReactMouseEvent<HTMLElement>) => void;
  onCardDragEnd?: () => void;
  onCardDragStart?: (battleCardId: string) => void;
  onCardHoverEnd?: () => void;
  onCardHoverMove?: (battleCardId: string, event: ReactPointerMouseEvent<HTMLDivElement>) => void;
  onCardHoverStart?: (battleCardId: string, event: ReactPointerMouseEvent<HTMLDivElement>) => void;
  onSlotClick: (target: BattleFieldSlotAddress, isOccupied: boolean) => void;
  onSlotDrop?: (target: BattleFieldSlotAddress) => void;
  pendingDragCardId?: string | null;
  selectedCardId: string | null;
  selectedSlot: BattleFieldSlotAddress | null;
  selectionAnchor: BattleFieldSlotAddress | null;
  side: BattleSide;
  state: BattleMutableState;
  zone: BattlefieldZone;
}) {
  const slotIds = zone === "reserve" ? BACK_RANK_SLOT_IDS : FRONT_RANK_SLOT_IDS;
  const supportHighlights = computeSupportHighlights(selectionAnchor, side);

  return (
    <section data-battle-region={`${side}-${zone}-row`} className={`row ${side} ${zone}`}>
      <div className={`slots ${zone}`}>
        {slotIds.map((slotId) => {
          const target: BattleFieldSlotAddress = { side, zone, slotId };
          const battleCardId = selectBattlefieldSlotOccupant(state, target);
          const instance = battleCardId === null ? null : state.cardInstances[battleCardId] ?? null;
          const isSelectedCard = battleCardId !== null && selectedCardId === battleCardId;
          const isSelectedSlot = selectedSlot !== null &&
            selectedSlot.side === side &&
            selectedSlot.zone === zone &&
            selectedSlot.slotId === slotId;
          const isSupportHighlighted = supportHighlights.has(slotId);
          // Any dragged card — from any source zone, of any kind — can land on
          // any battlefield slot; drop-target highlighting is never gated on
          // card kind or source.
          const isDropTarget =
            pendingDragCardId !== null ||
            (handSelectionSide === side && battleCardId === null && canInteract);

          return (
            <button
              key={slotId}
              type="button"
              aria-label={`${side} ${zone} ${slotId}`}
              data-battle-slot-id={side === "player" ? slotId : undefined}
              data-slot-id={`${side}-${zone}-${slotId}`}
              data-slot-card-id={battleCardId ?? undefined}
              data-selected={String(isSelectedSlot)}
              data-battle-drop-target={isDropTarget ? "true" : undefined}
              data-battle-support-highlighted={isSupportHighlighted ? "true" : undefined}
              className={[
                "slot",
                battleCardId === null ? "empty-hover" : "",
                isDropTarget ? "drop-target" : "",
                isSelectedSlot && battleCardId === null ? "selected-slot" : "",
                isSupportHighlighted ? "supports-highlight" : "",
              ].filter((value) => value !== "").join(" ")}
              onClick={() => {
                if (battleCardId !== null && (selectedCardId === null || selectedCardId === battleCardId)) {
                  onCardClick(battleCardId);
                  return;
                }
                onSlotClick(target, battleCardId !== null);
              }}
              onContextMenu={(event) => {
                if (battleCardId === null) {
                  return;
                }
                event.preventDefault();
                onCardContextMenu?.(battleCardId, event);
              }}
              onDragOver={(event) => {
                if (canInteract && pendingDragCardId !== null) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                if (!canInteract) {
                  return;
                }
                event.preventDefault();
                onSlotDrop?.(target);
              }}
            >
              {instance === null ? null : (
                <BattleCardView
                  battleCardId={instance.battleCardId}
                  data={battleCardVisualFromInstance(instance)}
                  reserved={false}
                  selected={isSelectedCard}
                  draggable={canInteract}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCardClick(instance.battleCardId);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onCardContextMenu?.(instance.battleCardId, event);
                  }}
                  onDragStart={canInteract ? () => onCardDragStart?.(instance.battleCardId) : undefined}
                  onDragEnd={canInteract ? () => onCardDragEnd?.() : undefined}
                  onMouseEnter={(event) => onCardHoverStart?.(instance.battleCardId, event)}
                  onMouseLeave={() => onCardHoverEnd?.()}
                  onMouseMove={(event) => onCardHoverMove?.(instance.battleCardId, event)}
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function resolveBattlefieldSelectionAnchor(
  state: BattleMutableState,
  selectedCardId: string | null,
  selectedSlot: BattleFieldSlotAddress | null,
): BattleFieldSlotAddress | null {
  if (selectedSlot !== null) {
    return selectedSlot;
  }

  const location = selectBattleCardLocation(state, selectedCardId);
  if (location === null || (location.zone !== "reserve" && location.zone !== "deployed")) {
    return null;
  }

  return {
    side: location.side,
    zone: location.zone,
    slotId: location.slotId,
  };
}

function computeSupportHighlights(
  selectionAnchor: BattleFieldSlotAddress | null,
  side: BattleSide,
): ReadonlySet<BattlefieldSlotId> {
  if (selectionAnchor === null || selectionAnchor.side !== side) {
    return new Set<BattlefieldSlotId>();
  }

  if (selectionAnchor.zone === "deployed") {
    return new Set<BattlefieldSlotId>(SUPPORT_BY_DEPLOY[selectionAnchor.slotId as FrontRankSlotId]);
  }

  return new Set<BattlefieldSlotId>(SUPPORT_BY_RESERVE[selectionAnchor.slotId as BackRankSlotId]);
}
