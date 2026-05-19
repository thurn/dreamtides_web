import type { MouseEvent as ReactMouseEvent } from "react";

import type { BattleMutableState } from "../types";
import { BattleCardView, battleCardVisualFromInstance } from "./BattleCardView";

export function BattleOpponentHandTray({
  hand,
  selectedCardId,
  state,
  onCardClick,
  onCardContextMenu,
  onCardDragEnd,
  onCardDragStart,
}: {
  hand: readonly string[];
  selectedCardId: string | null;
  state: BattleMutableState;
  onCardClick: (battleCardId: string) => void;
  onCardContextMenu?: (battleCardId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCardDragEnd?: () => void;
  onCardDragStart?: (battleCardId: string) => void;
}) {
  return (
    <section data-battle-region="opponent-hand-tray" className="opponent-hand-tray">
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
            <BattleCardView
              key={battleCardId}
              battleCardId={battleCardId}
              data={battleCardVisualFromInstance(instance)}
              reserved={false}
              selected={isSelected}
              draggable
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
            />
          );
        })}
      </div>
    </section>
  );
}
