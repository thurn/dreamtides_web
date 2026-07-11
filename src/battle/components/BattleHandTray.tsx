import type { MouseEvent as ReactMouseEvent } from "react";

import type { BattleCommand } from "../debug/commands";
import type { BattleCardInstance, BattleCommandSourceSurface, BattleMutableState } from "../types";
import { battleCardAutomationStatus } from "../../rules/battle/battle-card-effects-table";
import { BattleGameCard } from "./BattleGameCard";

export function BattleHandTray({
  canInteract,
  currentEnergy: _currentEnergy,
  hand,
  onHandCardAction: _onHandCardAction,
  openingHandSize: _openingHandSize,
  playerDrawSkipsTurnOne: _playerDrawSkipsTurnOne,
  selectedCardId,
  state,
  isCardPlayable: _isCardPlayable,
  onCardClick,
  onCardContextMenu,
  onCardDoubleClick,
  onCardDragEnd,
  onCardDragStart,
  onCardDropToHand,
  onCardHoverEnd,
  onCardHoverMove,
  onCardHoverStart,
  pendingDragCardId = null,
  pendingDragSourceSurface = null,
  compact = false,
  side = "player",
  isBasicAutomationEnabled = false,
}: {
  canInteract: boolean;
  compact?: boolean;
  /**
   * Which side's cards this tray is showing. Defaults to "player". The debug
   * "hide player hand" mode renders the enemy hand through this same tray with
   * `side="opponent"` so it gets the full-size, hover-to-enlarge treatment the
   * player hand normally has.
   */
  side?: "player" | "opponent";
  isBasicAutomationEnabled?: boolean;
  currentEnergy: number;
  hand: string[];
  onHandCardAction: (command: BattleCommand) => void;
  openingHandSize: number;
  playerDrawSkipsTurnOne: boolean;
  selectedCardId: string | null;
  state: BattleMutableState;
  isCardPlayable?: (battleCardId: string) => boolean;
  onCardClick: (battleCardId: string) => void;
  onCardContextMenu?: (battleCardId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCardDoubleClick: (battleCardId: string) => void;
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
      data-battle-region={side === "opponent" ? "opponent-hand-tray" : "player-hand-tray"}
      data-battle-zone-drop-target={isDropTarget ? `${side === "opponent" ? "enemy" : "player"}:hand` : undefined}
      className={`hand-row ${compact ? "compact" : ""} ${isDropTarget ? "drop-target" : ""}`}
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
      {compact ? (
        <div className="hand-row-label">
          <span>{side === "opponent" ? "Enemy hand" : "Your hand"}</span>
          <strong>{String(hand.length)}</strong>
        </div>
      ) : null}
      <div className="hand-cards">
        {hand.map((battleCardId) => {
          const instance = state.cardInstances[battleCardId];
          if (instance === undefined) {
            return null;
          }
          const isSelected = selectedCardId === battleCardId;

          return (
            <BattleHandCard
              key={battleCardId}
              instance={instance}
              selected={isSelected}
              side={side}
              compact={compact}
              draggable={canInteract}
              showAutomationGear={
                isBasicAutomationEnabled &&
                battleCardAutomationStatus(instance.definition.cardId) === "auto"
              }
              onClick={canInteract
                ? () => onCardClick(battleCardId)
                : undefined}
              onDoubleClick={canInteract
                ? (event) => {
                  event.stopPropagation();
                  onCardDoubleClick(battleCardId);
                }
                : undefined}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onCardContextMenu?.(battleCardId, event);
              }}
              onDragStart={canInteract ? () => onCardDragStart?.(battleCardId) : undefined}
              onDragEnd={canInteract ? () => onCardDragEnd?.() : undefined}
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

export function BattleHandCard({
  compact = false,
  draggable = true,
  instance,
  selected,
  showAutomationGear = false,
  side,
  onClick,
  onContextMenu,
  onDoubleClick,
  onDragEnd,
  onDragStart,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
}: {
  compact?: boolean;
  draggable?: boolean;
  instance: BattleCardInstance;
  selected: boolean;
  showAutomationGear?: boolean;
  side: "player" | "opponent";
  onClick?: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDragStart?: () => void;
  onMouseEnter?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onMouseMove?: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  const wrapperClass = [
    "quest-card",
    compact ? "revealed-hand-card" : "",
    side === "opponent" ? "opponent-card opponent" : "player",
    selected ? "selected" : "",
  ]
    .filter((value) => value !== "")
    .join(" ");

  return (
    <BattleGameCard
      instance={instance}
      variant="hand"
      dataBattleHandCard
      compact={compact}
      selected={selected}
      className={wrapperClass}
      draggable={draggable}
      onActivate={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      showAutomationGear={showAutomationGear}
    />
  );
}
