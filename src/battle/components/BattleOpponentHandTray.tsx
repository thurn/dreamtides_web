import type { MouseEvent as ReactMouseEvent } from "react";

import type { BattleCommandSourceSurface, BattleMutableState } from "../types";
import { BattleHandCard } from "./BattleHandTray";

export function BattleOpponentHandTray({
  canInteract: _canInteract,
  currentEnergy: _currentEnergy,
  hand,
  isCardPlayable: _isCardPlayable,
  selectedCardId,
  state,
  onCardClick,
  onCardContextMenu,
  onCardDragEnd,
  onCardDragStart,
  onCardDropToHand,
  onCardHoverEnd,
  onCardHoverMove,
  onCardHoverStart,
  pendingDragCardId = null,
  pendingDragSourceSurface = null,
}: {
  canInteract: boolean;
  currentEnergy: number;
  hand: readonly string[];
  isCardPlayable?: (battleCardId: string) => boolean;
  selectedCardId: string | null;
  state: BattleMutableState;
  onCardClick: (battleCardId: string) => void;
  onCardContextMenu?: (battleCardId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCardDragEnd?: () => void;
  onCardDragStart?: (battleCardId: string) => void;
  onCardDropToHand?: (sourceSurface: BattleCommandSourceSurface) => void;
  onCardHoverEnd?: () => void;
  onCardHoverMove?: (battleCardId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCardHoverStart?: (battleCardId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  pendingDragCardId?: string | null;
  pendingDragSourceSurface?: BattleCommandSourceSurface | null;
}) {
  const isDropTarget = pendingDragCardId !== null &&
    pendingDragSourceSurface !== null &&
    onCardDropToHand !== undefined;

  return (
    <section
      data-battle-region="opponent-hand-tray"
      data-battle-zone-drop-target={isDropTarget ? "enemy:hand" : undefined}
      className={`opponent-hand-tray ${isDropTarget ? "drop-target" : ""}`}
      onDragOver={(event) => {
        if (isDropTarget) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (!isDropTarget || pendingDragSourceSurface === null) {
          return;
        }
        event.preventDefault();
        onCardDropToHand(pendingDragSourceSurface);
      }}
    >
      <div className="opponent-hand-tray-label">
        <span>Enemy hand</span>
        <strong>{String(hand.length)}</strong>
      </div>
      <div className="opponent-hand-cards">
        {hand.map((battleCardId) => {
          const instance = state.cardInstances[battleCardId];
          if (instance === undefined) {
            return null;
          }
          const isSelected = selectedCardId === battleCardId;

          return (
            <BattleHandCard
              key={battleCardId}
              battleCardId={battleCardId}
              compact
              instance={instance}
              selected={isSelected}
              side="opponent"
              onClick={(event) => {
                event.stopPropagation();
                onCardClick(battleCardId);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onCardContextMenu?.(battleCardId, event);
              }}
              onDragStart={() => onCardDragStart?.(battleCardId)}
              onDragEnd={() => onCardDragEnd?.()}
              onMouseEnter={(event) => onCardHoverStart?.(battleCardId, event)}
              onMouseMove={(event) => onCardHoverMove?.(battleCardId, event)}
              onMouseLeave={() => onCardHoverEnd?.()}
            />
          );
        })}
      </div>
    </section>
  );
}
