import type { MouseEvent as ReactMouseEvent } from "react";

import { CardDisplay } from "../../components/CardDisplay";
import type { BattleCommand } from "../debug/commands";
import type { BattleMutableState } from "../types";
import { battleCardDisplayFromInstance } from "./BattleCardView";

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
 * (`playable`, `unaffordable`, `selected`, `battle-card`, `hand-card`) that
 * the rest of the battle UI and tests rely on, so the visual swap is
 * non-disruptive.
 */
export function BattleHandTray({
  canInteract,
  currentEnergy,
  hand,
  onHandCardAction: _onHandCardAction,
  openingHandSize: _openingHandSize,
  playerDrawSkipsTurnOne: _playerDrawSkipsTurnOne,
  selectedCardId,
  state,
  isCardPlayable,
  onCardClick,
  onCardContextMenu,
  onCardDoubleClick,
  onCardDragEnd,
  onCardDragStart,
}: {
  canInteract: boolean;
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
}) {
  return (
    <section data-battle-region="player-hand-tray" className="hand-row">
      <div className="hand-cards">
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
              onClick={() => onCardClick(battleCardId)}
              onDoubleClick={() => onCardDoubleClick(battleCardId)}
              onContextMenu={(event) => {
                event.preventDefault();
                onCardContextMenu?.(battleCardId, event);
              }}
              onDragStart={() => onCardDragStart?.(battleCardId)}
              onDragEnd={() => onCardDragEnd?.()}
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
