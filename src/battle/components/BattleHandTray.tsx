import type { MouseEvent as ReactMouseEvent } from "react";

import { CardDisplay } from "../../components/CardDisplay";
import type { BattleCommand } from "../debug/commands";
import type { BattleMutableState } from "../types";
import { BattleCardView, battleCardDisplayFromInstance, battleCardVisualFromInstance } from "./BattleCardView";

/**
 * The hand tray renders the player's hand using the shared {@link CardDisplay}
 * component so a card in hand looks identical to the same card in a draft
 * offer, the deck viewer, the hover preview, or anywhere else in the quest
 * prototype. The card is the natural size used everywhere else in the quest
 * (aspect 2/3) — the tray's fixed width and `--hand-card-w` token size it
 * down to fit the tray without changing the card's internal layout.
 *
 * The outer wrapper carries the same `data-battle-card-id`,
 * `data-battle-hand-card`, `data-battle-card-variant`, and CSS class names
 * (`selected`, `battle-card`, `hand-card`) that the rest of the battle UI and
 * tests rely on. Every hand card is always draggable and fully lit — there is
 * no affordability dimming.
 */
export function BattleHandTray({
  canInteract: _canInteract,
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
  onCardHoverEnd,
  onCardHoverMove,
  onCardHoverStart,
  compact = false,
}: {
  canInteract: boolean;
  compact?: boolean;
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
  onCardHoverEnd?: () => void;
  onCardHoverMove?: (battleCardId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCardHoverStart?: (battleCardId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <section
      data-battle-region="player-hand-tray"
      className={`hand-row ${compact ? "compact" : ""}`}
    >
      {compact ? (
        <div className="hand-row-label">
          <span>Your hand</span>
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
          const wrapperClass = [
            "battle-card",
            "hand-card",
            "quest-card",
            isSelected ? "selected" : "",
          ]
            .filter((value) => value !== "")
            .join(" ");

          if (compact) {
            return (
              <BattleCardView
                key={battleCardId}
                battleCardId={battleCardId}
                className="revealed-hand-card player"
                dataBattleHandCard
                data={battleCardVisualFromInstance(instance)}
                playable={false}
                selected={isSelected}
                unaffordable={false}
                reserved={false}
                draggable={true}
                onClick={(event) => {
                  event.stopPropagation();
                  onCardClick(battleCardId);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onCardDoubleClick(battleCardId);
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
          }

          return (
            <div
              key={battleCardId}
              data-battle-card-id={battleCardId}
              data-battle-card-variant="hand"
              data-battle-hand-card=""
              data-battle-card-playable="true"
              data-selected={String(isSelected)}
              className={wrapperClass}
              draggable={true}
              onClick={() => onCardClick(battleCardId)}
              onDoubleClick={() => onCardDoubleClick(battleCardId)}
              onContextMenu={(event) => {
                event.preventDefault();
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
                selectionColor="#a855f7"
                className="h-full w-full"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
