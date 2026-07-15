import { useEffect, useMemo, useState } from "react";
import type { DreamwellCardViewData } from "../../components/DreamwellCardView";
import { logEvent } from "../../logging";
import { GameCard } from "../../cumulus/components/card/CardView";
import { GlassButton } from "../../cumulus/components/controls/GlassButton";
import { GroupPanel } from "../../cumulus/components/controls/GroupPanel";
import { NumberStepper } from "../../cumulus/components/controls/NumberStepper";
import { GlassDialog } from "../../cumulus/components/overlay/GlassDialog";
import { token } from "../../cumulus/primitives/tokens";
import type { BattleCommand } from "../debug/commands";
import type { BattleMutableState, BattleSide } from "../types";
import { formatSideLabel } from "../ui/format";
import { BattleDeckOrderPicker } from "./BattleDeckOrderPicker";
import { battleGameCardModel } from "../ui/battle-game-card-model";
import { DreamwellPromptCard } from "./DreamwellPromptCard";

const MIN_FORESEE_COUNT = 1;
const MAX_FORESEE_COUNT = 5;

export function BattleForeseeOverlay({
  initialCount,
  onClose,
  onDispatch,
  side,
  sourceCard,
  state,
}: {
  initialCount: number;
  onClose: () => void;
  onDispatch: (command: BattleCommand) => void;
  side: BattleSide;
  /**
   * The Dreamwell card driving this Foresee (e.g. Skypath), rendered at the head
   * of the modal so the player sees what triggered it.
   */
  sourceCard?: DreamwellCardViewData | null;
  state: BattleMutableState;
}) {
  const deck = state.sides[side].deck;
  const deckLength = deck.length;
  const clampedInitial = clampForeseeCount(initialCount, deckLength);
  const [count, setCount] = useState(clampedInitial);
  const [revealedIds, setRevealedIds] = useState(() => deck.slice(0, clampedInitial));
  const [isReorderOpen, setIsReorderOpen] = useState(false);

  useEffect(() => {
    // bug-101: don't attach the Foresee Escape listener while the deck order
    // picker is open; the picker owns Escape in that mode.
    if (isReorderOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        // FIND-07-4 / FIND-09-3: Escape closes only the topmost overlay.
        // Stop propagation so the parent BattleZoneBrowser's window-level
        // Escape listener does not also fire and collapse the stack.
        event.stopPropagation();
        onClose();
      }
    }

    // Use capture-phase so Foresee receives Escape before any bubbling
    // parent window listener.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isReorderOpen, onClose]);

  const revealed = useMemo(
    () => revealedIds.filter((battleCardId) => deck.includes(battleCardId)),
    [deck, revealedIds],
  );

  if (isReorderOpen) {
    return (
      <BattleDeckOrderPicker
        initialOrder={revealed}
        onCancel={() => setIsReorderOpen(false)}
        onConfirm={(order) => {
          onDispatch({
            id: "DEBUG_EDIT",
            edit: {
              kind: "REORDER_DECK",
              side,
              order,
            },
            sourceSurface: "deck-order-picker",
          });
          setIsReorderOpen(false);
          onClose();
        }}
        scopeLabel="top-N"
        side={side}
        state={state}
      />
    );
  }

  const canPlayFromTop = revealed.length > 0;
  const canDecrement = count > MIN_FORESEE_COUNT;
  const canIncrement = count < MAX_FORESEE_COUNT && count < deckLength;

  return (
    <div data-battle-foresee-scrim="">
      <GlassDialog
        title={`Foreseeing ${String(count)} ${count === 1 ? "Card" : "Cards"}`}
        subtitle={`Top of ${formatSideLabel(side)} deck · leave, move, play, or reorder`}
        closeLabel="Close Foresee"
        wide
        onClose={onClose}
      >
        <div
          data-battle-foresee-overlay=""
          data-battle-foresee-side={side}
          data-battle-foresee-count={String(count)}
          style={{ display: "grid", gap: token("--space-5") }}
        >
          {sourceCard ? <DreamwellPromptCard card={sourceCard} /> : null}
          <NumberStepper
            label="Reveal count"
            value={count}
            decrementLabel="Foresee 1 fewer"
            incrementLabel="Foresee 1 more"
            decrementDisabled={!canDecrement}
            incrementDisabled={!canIncrement}
            onDecrement={() => {
              setCount((previous) => {
                const nextCount = Math.max(MIN_FORESEE_COUNT, previous - 1);
                setRevealedIds((current) => current.slice(0, nextCount));
                return nextCount;
              });
            }}
            onIncrement={() => {
              const nextCount = Math.min(MAX_FORESEE_COUNT, Math.min(deckLength, count + 1));
              setCount(nextCount);
              setRevealedIds((current) => appendMoreRevealedIds(current, deck, nextCount));
              onDispatch({ id: "DEBUG_EDIT", edit: { kind: "REVEAL_DECK_TOP", side, count: nextCount }, sourceSurface: "foresee-overlay" });
            }}
          />
          {revealed.length === 0 ? (
            <GroupPanel>
              <p style={{ margin: 0, color: token("--text-on-glass-muted"), font: token("--t-body") }}>
                {deckLength === 0 ? "Deck is empty." : "No revealed cards remain."}
              </p>
            </GroupPanel>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: token("--space-4") }}>
              {revealed.map((battleCardId, index) => {
                const instance = state.cardInstances[battleCardId];
                if (instance === undefined) return null;
                const isTop = index === 0;
                return (
                  <article key={battleCardId} data-battle-foresee-card={battleCardId}>
                    <GroupPanel>
                      <div style={{ display: "grid", gap: token("--space-3") }}>
                        <span style={{ color: token("--text-on-glass-muted"), font: token("--t-caption") }}>Position {String(index + 1)}</span>
                        <div data-battle-foresee-card-scroll="" style={{ width: "100%", maxWidth: 240, marginInline: "auto" }}>
                          <GameCard model={battleGameCardModel(instance)} presentation="full" />
                        </div>
                        <div style={{ display: "grid", gap: token("--space-2") }}>
                          {isTop ? (
                            <GlassButton
                              label="Play from Top"
                              placement="onGlass"
                              variant="accent"
                              disabled={!canPlayFromTop}
                              testId="battle-foresee-play-from-top"
                              onPress={() => {
                                onDispatch({ id: "DEBUG_EDIT", edit: { kind: "PLAY_FROM_DECK_TOP", side }, sourceSurface: "foresee-overlay" });
                                onClose();
                              }}
                            />
                          ) : null}
                          <GlassButton
                            label="Leave on Top"
                            placement="onGlass"
                            testId="battle-foresee-leave-on-top"
                            onPress={() => {
                              logEvent("battle_proto_foresee_leave_on_top", { side, battleCardId, revealedCount: revealed.length });
                              onClose();
                            }}
                          />
                          <GlassButton
                            label="Send to Bottom"
                            placement="onGlass"
                            testId="battle-foresee-send-to-bottom"
                            onPress={() => {
                              const rest = deck.filter((id) => id !== battleCardId);
                              setRevealedIds((previous) => previous.filter((id) => id !== battleCardId));
                              onDispatch({ id: "DEBUG_EDIT", edit: { kind: "REORDER_DECK", side, order: [...rest, battleCardId] }, sourceSurface: "foresee-overlay" });
                            }}
                          />
                          <GlassButton
                            label="Send to Void"
                            placement="onGlass"
                            testId="battle-foresee-send-to-void"
                            onPress={() => {
                              setRevealedIds((previous) => previous.filter((id) => id !== battleCardId));
                              onDispatch({ id: "DEBUG_EDIT", edit: { kind: "MOVE_CARD_TO_ZONE", battleCardId, destination: { side, zone: "void" } }, sourceSurface: "foresee-overlay" });
                            }}
                          />
                        </div>
                      </div>
                    </GroupPanel>
                  </article>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <GlassButton
              label="Reorder Revealed Cards"
              placement="onGlass"
              disabled={revealed.length < 2}
              testId="battle-foresee-reorder-all"
              onPress={() => setIsReorderOpen(true)}
            />
          </div>
        </div>
      </GlassDialog>
    </div>
  );
}
function clampForeseeCount(requested: number, deckLength: number): number {
  const bounded = Math.max(MIN_FORESEE_COUNT, Math.min(MAX_FORESEE_COUNT, requested));
  return Math.min(bounded, Math.max(0, deckLength));
}

function appendMoreRevealedIds(
  previous: readonly string[],
  deck: readonly string[],
  count: number,
): string[] {
  const kept = previous.filter((battleCardId) => deck.includes(battleCardId)).slice(0, count);

  if (kept.length >= count) {
    return kept;
  }

  const additions = deck
    .filter((battleCardId) => !kept.includes(battleCardId))
    .slice(0, count - kept.length);

  return [...kept, ...additions];
}
