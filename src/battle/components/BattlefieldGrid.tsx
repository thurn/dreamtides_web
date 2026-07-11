import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";

import { BattleGameCard } from "./BattleGameCard";
import { battleCardAutomationStatus } from "../../rules/battle/battle-card-effects-table";
import {
  selectBattleCardLocation,
  selectBattlefieldSlotOccupant,
  selectPlayAreaSize,
} from "../state/selectors";
import { supportedDeploySlots, supportingReserveSlots } from "../engine/support";
import { backRankSlotIds, frontRankSlotIds } from "../types";
import type {
  BattleFieldSlotAddress,
  BattleMutableState,
  BattleSide,
  BattlefieldSlotId,
  BattlefieldZone,
  FrontRankSlotId,
  BackRankSlotId,
} from "../types";

export function BattlefieldGrid({
  canInteract,
  handSelectionSide,
  isBasicAutomationEnabled = false,
  onCardClick,
  onCardContextMenu,
  onCardDragEnd,
  onCardDragStart,
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
  isBasicAutomationEnabled?: boolean;
  onCardClick: (battleCardId: string) => void;
  onCardContextMenu?: (battleCardId: string, event: ReactMouseEvent<HTMLElement>) => void;
  onCardDragEnd?: () => void;
  onCardDragStart?: (battleCardId: string) => void;
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
  // The play area is dynamic: only the currently-active slots are rendered and
  // droppable (rules §The Play Area). `backSize` is always `frontSize + 1`, and
  // both ranks share the back-rank width so the staggered front rank stays
  // centered under the back rank at any size (see battle.css).
  const { frontSize, backSize } = selectPlayAreaSize(state);
  const visibleCount = zone === "backRank" ? backSize : frontSize;
  const slotIds = zone === "backRank"
    ? backRankSlotIds(visibleCount)
    : frontRankSlotIds(visibleCount);
  const slotsStyle = {
    "--cols": visibleCount,
    "--row-cols": backSize,
  } as CSSProperties;
  const supportHighlights = computeSupportHighlights(selectionAnchor, side);

  return (
    <section data-battle-region={`${side}-${zone}-row`} className={`row ${side} ${zone}`}>
      <div className={`slots ${zone}`} style={slotsStyle}>
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

          const slotClassName = [
            "slot", battleCardId === null ? "empty-hover" : "",
            isDropTarget ? "drop-target" : "",
            isSelectedSlot && battleCardId === null ? "selected-slot" : "",
            isSupportHighlighted ? "supports-highlight" : "",
          ].filter((value) => value !== "").join(" ");
          const commonData = {
            "data-battle-slot-id": side === "player" ? slotId : undefined,
            "data-slot-id": `${side}-${zone}-${slotId}`,
            "data-selected": String(isSelectedSlot),
            "data-battle-drop-target": isDropTarget ? "true" : undefined,
            "data-battle-support-highlighted": isSupportHighlighted ? "true" : undefined,
          };
          if (instance !== null) {
            return (
              <div key={slotId} aria-label={`${side} ${zone} ${slotId}`} {...commonData}
                data-slot-card-id={battleCardId ?? undefined} className={slotClassName}
                onContextMenu={(event) => { event.preventDefault(); onCardContextMenu?.(instance.battleCardId, event); }}
                onDragOver={(event) => { if (canInteract && pendingDragCardId !== null) event.preventDefault(); }}
                onDrop={(event) => { if (canInteract) { event.preventDefault(); onSlotDrop?.(target); } }}>
                <BattleGameCard
                  instance={instance}
                  exhausted={instance.status.isExhausted}
                  reserved={false}
                  showAutomationGear={
                    isBasicAutomationEnabled &&
                    battleCardAutomationStatus(instance.definition.cardId) === "auto"
                  }
                  selected={isSelectedCard}
                  draggable={canInteract}
                  onActivate={() => {
                    if (selectedCardId === null || selectedCardId === instance.battleCardId) onCardClick(instance.battleCardId);
                    else onSlotClick(target, true);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onCardContextMenu?.(instance.battleCardId, event);
                  }}
                  onDragStart={canInteract ? () => onCardDragStart?.(instance.battleCardId) : undefined}
                  onDragEnd={canInteract ? () => onCardDragEnd?.() : undefined}
                />
              </div>
            );
          }
          return (
            <button key={slotId} type="button" aria-label={`${side} ${zone} ${slotId}`}
              {...commonData} className={slotClassName} onClick={() => onSlotClick(target, false)}
              onDragOver={(event) => { if (canInteract && pendingDragCardId !== null) event.preventDefault(); }}
              onDrop={(event) => { if (canInteract) { event.preventDefault(); onSlotDrop?.(target); } }} />
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
  if (location === null || (location.zone !== "backRank" && location.zone !== "frontRank")) {
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

  if (selectionAnchor.zone === "frontRank") {
    return new Set<BattlefieldSlotId>(
      supportingReserveSlots(selectionAnchor.slotId as FrontRankSlotId),
    );
  }

  return new Set<BattlefieldSlotId>(
    supportedDeploySlots(selectionAnchor.slotId as BackRankSlotId),
  );
}
