import { useEffect, useMemo, useRef, useState } from "react";
import type { DreamwellCardViewData } from "../../components/DreamwellCardView";
import { logEvent } from "../../logging";
import type { BattleCommand } from "../debug/commands";
import type { BattleMutableState, BattleSide } from "../types";
import { formatSideLabel } from "../ui/format";
import { BattleDeckOrderPicker } from "./BattleDeckOrderPicker";
import { BattleGameCard } from "./BattleGameCard";
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

  // Spec §O-1 / bug-102: only dispatch REVEAL_DECK_TOP when the user widens
  // the reveal window (mount or `count` increase). The `onDispatchRef` shim
  // keeps the dispatcher referentially stable from the effect's perspective
  // so the effect does not re-run on every reducer tick while the overlay is
  // open. The reducer-side no-op check still guards against duplicate history
  // commits when the top cards are already revealed.
  const onDispatchRef = useRef(onDispatch);
  onDispatchRef.current = onDispatch;
  useEffect(() => {
    if (count <= 0) {
      return;
    }

    onDispatchRef.current({
      id: "DEBUG_EDIT",
      edit: {
        kind: "REVEAL_DECK_TOP",
        side,
        count,
      },
      sourceSurface: "foresee-overlay",
    });
  }, [count, side]);

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
    <div
      // FIND-07-4 / FIND-09-3: the Foresee overlay is potentially stacked on
      // top of the zone browser (z-50). Raise to z-[60] so backdrop clicks on
      // the Foresee scrim don't reach the underlying browser, and so
      // clicking outside the Foresee dialog only closes Foresee.
      className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/85 p-3 backdrop-blur"
      data-battle-foresee-scrim=""
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        // bug-099: dialog semantics + labelled heading.
        role="dialog"
        aria-modal="true"
        aria-labelledby="battle-foresee-title"
        tabIndex={-1}
        data-battle-foresee-overlay=""
        data-battle-foresee-side={side}
        data-battle-foresee-count={String(count)}
        className="pointer-events-auto mx-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col gap-4 overflow-y-auto rounded-[2rem] border border-violet-300/25 bg-[linear-gradient(180deg,_rgba(7,10,18,0.98)_0%,_rgba(11,17,30,0.96)_100%)] p-5 shadow-2xl shadow-slate-950/70"
        onClick={(event) => event.stopPropagation()}
      >
        {sourceCard ? <DreamwellPromptCard card={sourceCard} /> : null}
        <header className="flex flex-col gap-2 border-b border-slate-800 pb-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-300">
              Foresee
            </p>
            <h3
              id="battle-foresee-title"
              className="mt-2 text-lg font-semibold text-white"
            >
              Foreseeing {String(count)} {count === 1 ? "card" : "cards"}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Top of {formatSideLabel(side)} deck — leave on top, send to bottom
              or void, play from top, or reorder all.
            </p>
          </div>
          <div className="flex items-center gap-2">
              <button
                type="button"
                data-battle-foresee-action="reveal-less"
                disabled={!canDecrement}
                className={createButtonClassName(canDecrement)}
                onClick={() => {
                  setCount((previous) => {
                    const nextCount = Math.max(MIN_FORESEE_COUNT, previous - 1);
                    setRevealedIds((current) => current.slice(0, nextCount));
                    return nextCount;
                  });
                }}
              >
                Foresee 1 Fewer
              </button>
              <button
                type="button"
                data-battle-foresee-action="reveal-more"
                disabled={!canIncrement}
                className={createButtonClassName(canIncrement)}
                onClick={() => {
                  setCount((previous) => {
                    const nextCount = Math.min(
                      MAX_FORESEE_COUNT,
                      Math.min(deckLength, previous + 1),
                    );
                    setRevealedIds((current) => appendMoreRevealedIds(current, deck, nextCount));
                    return nextCount;
                  });
                }}
              >
                Foresee 1 More
              </button>
            <button
              type="button"
              // FIND-07-4 / FIND-09-3: distinct label "Close Foresee" so the
              // scope of the Close button is obvious when the overlay is
              // stacked on top of a parent zone browser.
              data-battle-foresee-action="close"
              className={createButtonClassName(true)}
              onClick={onClose}
            >
              Close Foresee
            </button>
          </div>
        </header>
        {revealed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-8 text-center text-sm text-slate-400">
            {deckLength === 0 ? "Deck is empty." : "No revealed cards remain."}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {revealed.map((battleCardId, index) => {
              const instance = state.cardInstances[battleCardId];
              const isTop = index === 0;
              if (instance === undefined) {
                return null;
              }
              return (
                <article
                  key={battleCardId}
                  data-battle-foresee-card={battleCardId}
                  className="flex w-[12rem] shrink-0 flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/75 p-3"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Position {String(index + 1)}
                  </p>
                  <div data-battle-foresee-card-scroll="">
                    <div className="w-full">
                      <BattleGameCard instance={instance} variant="hand" />
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {isTop ? (
                      <button
                        type="button"
                        data-battle-foresee-action="play-from-top"
                        className={createButtonClassName(canPlayFromTop)}
                        disabled={!canPlayFromTop}
                        onClick={() => {
                          onDispatch({
                            id: "DEBUG_EDIT",
                            edit: {
                              kind: "PLAY_FROM_DECK_TOP",
                              side,
                            },
                            sourceSurface: "foresee-overlay",
                          });
                          onClose();
                        }}
                      >
                        Play from top
                      </button>
                    ) : null}
                    <button
                      type="button"
                      data-battle-foresee-action="leave-on-top"
                      className={createButtonClassName(true)}
                      // bug-102: "Leave on top" is a no-op for state but the
                      // user's decision is audited via this explicit log event
                      // so the Foresee session has a close-out record.
                      onClick={() => {
                        logEvent("battle_proto_foresee_leave_on_top", {
                          side,
                          battleCardId,
                          revealedCount: revealed.length,
                        });
                        onClose();
                      }}
                    >
                      Leave on top
                    </button>
                    <button
                      type="button"
                      data-battle-foresee-action="send-to-bottom"
                      className={createButtonClassName(true)}
                      onClick={() => {
                        const rest = deck.filter((id) => id !== battleCardId);
                        setRevealedIds((previous) => previous.filter((id) => id !== battleCardId));
                        onDispatch({
                          id: "DEBUG_EDIT",
                          edit: {
                            kind: "REORDER_DECK",
                            side,
                            order: [...rest, battleCardId],
                          },
                          sourceSurface: "foresee-overlay",
                        });
                      }}
                    >
                      Send to bottom
                    </button>
                    <button
                      type="button"
                      // bug-022: the spec vocabulary defines Foresee as "look
                      // at top N; reorder or send to void". This affordance
                      // restores the void primitive alongside the existing
                      // "send to bottom" / reorder paths.
                      data-battle-foresee-action="send-to-void"
                      className={createButtonClassName(true)}
                      onClick={() => {
                        setRevealedIds((previous) => previous.filter((id) => id !== battleCardId));
                        onDispatch({
                          id: "DEBUG_EDIT",
                          edit: {
                            kind: "MOVE_CARD_TO_ZONE",
                            battleCardId,
                            destination: { side, zone: "void" },
                          },
                          sourceSurface: "foresee-overlay",
                        });
                      }}
                    >
                      Send to void
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-3">
          <button
            type="button"
            data-battle-foresee-action="reorder-all"
            disabled={revealed.length < 2}
            className={createButtonClassName(revealed.length >= 2)}
            onClick={() => setIsReorderOpen(true)}
          >
            Reorder All...
          </button>
        </div>
      </div>
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

function createButtonClassName(isEnabled: boolean): string {
  return [
    "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition",
    isEnabled
      ? "border-violet-300/45 bg-violet-400/10 text-violet-50 hover:bg-violet-400/20"
      : "cursor-not-allowed border-slate-800 bg-slate-900/70 text-slate-600",
  ].join(" ");
}
