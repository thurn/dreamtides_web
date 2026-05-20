import type { MouseEvent as ReactMouseEvent } from "react";

import { CardDisplay } from "../../components/CardDisplay";
import type { BattleMutableState } from "../types";
import { battleCardDisplayFromInstance } from "./BattleCardView";

export function BattleOpponentHandTray({
  canInteract,
  currentEnergy,
  hand,
  isCardPlayable,
  selectedCardId,
  state,
  onCardClick,
  onCardContextMenu,
  onCardDragEnd,
  onCardDragStart,
  onCardHoverEnd,
  onCardHoverMove,
  onCardHoverStart,
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
  onCardHoverEnd?: () => void;
  onCardHoverMove?: (battleCardId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCardHoverStart?: (battleCardId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
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
          const cost = instance.definition.energyCost;
          const isPlayable = canInteract && cost <= currentEnergy && (isCardPlayable?.(battleCardId) ?? true);
          const isUnaffordable = cost > currentEnergy;
          const isSelected = selectedCardId === battleCardId;
          const wrapperClass = [
            "battle-card",
            "hand-card",
            "quest-card",
            "revealed-hand-card",
            "opponent-card",
            "opponent",
            isPlayable ? "playable" : "",
            isSelected ? "selected" : "",
            isUnaffordable ? "unaffordable" : "",
          ]
            .filter((value) => value !== "")
            .join(" ");

          return (
            <div
              key={battleCardId}
              data-battle-card-id={battleCardId}
              data-battle-card-variant="hand"
              data-battle-hand-card=""
              data-battle-card-playable={isPlayable ? "true" : "false"}
              data-selected={String(isSelected)}
              className={wrapperClass}
              draggable={isPlayable}
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
            >
              <CardDisplay
                card={battleCardDisplayFromInstance(instance)}
                selected={isSelected}
                selectionColor="#f97316"
                className="h-full w-full"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
