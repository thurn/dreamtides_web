import { useEffect, useRef, useState } from "react";
import type { BattleDebugEdit } from "../debug/commands";
import { buttonVariant, typography } from "../design-tokens";
import { nextStartOfTurnPair } from "../state/turn-utils";
import { createNextTurnExpiry } from "../state/notes-utils";
import type { BattleCardNoteExpiry, BattleMutableState } from "../types";

type ExpiryOption =
  | "end-of-this-turn"
  | "end-of-next-turn"
  | "after-n-turns"
  | "manual";

const MIN_AFTER_N_TURNS = 1;
const MAX_AFTER_N_TURNS = 10;
const DEFAULT_AFTER_N_TURNS = 2;

export function BattleCardNoteEditor({
  battleCardId,
  generateNoteId,
  onClose,
  onSubmit,
  state,
}: {
  battleCardId: string;
  generateNoteId?: () => string;
  onClose: () => void;
  onSubmit: (edit: BattleDebugEdit) => void;
  state: BattleMutableState;
}) {
  const [text, setText] = useState("");
  // FIND-09-5: default to "Expire end of next turn" — the temporary-note
  // feature is meant to leave minimal residue.
  const [expiryOption, setExpiryOption] = useState<ExpiryOption>("end-of-next-turn");
  const [afterNTurns, setAfterNTurns] = useState(DEFAULT_AFTER_N_TURNS);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // bug-099: resolve the card name so the heading reads as a human label.
  const cardName = state.cardInstances[battleCardId]?.definition.name ?? battleCardId;

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    textareaRef.current?.focus();
    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function handleSubmit(): void {
    if (text.trim().length === 0) {
      return;
    }

    const noteId = (generateNoteId ?? defaultGenerateNoteId)();
    const expiry = resolveExpiry(state, expiryOption, afterNTurns);

    onSubmit({
      kind: "ADD_CARD_NOTE",
      battleCardId,
      noteId,
      text,
      createdAtMs: Date.now(),
      expiry,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 p-3 backdrop-blur"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        // bug-099: dialog semantics + labelled heading.
        role="dialog"
        aria-modal="true"
        aria-labelledby="battle-note-editor-title"
        tabIndex={-1}
        data-battle-note-editor=""
        data-battle-note-editor-card={battleCardId}
        className="pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-4 rounded-xl border border-violet-300/25 bg-[linear-gradient(180deg,_rgba(7,10,18,0.98)_0%,_rgba(11,17,30,0.96)_100%)] p-5 shadow-2xl shadow-slate-950/70"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <p className={`${typography.caption} font-semibold uppercase tracking-[0.28em] text-violet-300`}>
            Add Note
          </p>
          <h3
            id="battle-note-editor-title"
            className={`mt-2 ${typography.heading} text-white`}
          >
            Annotate {cardName}
          </h3>
          <p className={`mt-1 ${typography.body} text-slate-400`}>
            Notes appear as chips on the card and in the inspector.
          </p>
        </header>
        <label className="flex flex-col gap-1">
          <span className={`${typography.caption} font-semibold uppercase tracking-[0.22em] text-slate-500`}>
            Note Text
          </span>
          <textarea
            ref={textareaRef}
            data-battle-note-field="text"
            maxLength={200}
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Short reminder (max 200 chars)"
            className="w-full rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-violet-300/60 focus:outline-none"
          />
        </label>
        <fieldset
          data-battle-note-field="expiry"
          className="flex flex-col gap-2"
        >
          <legend className={`${typography.caption} font-semibold uppercase tracking-[0.22em] text-slate-500`}>
            Expiry
          </legend>
          {/* FIND-09-5: granular expiry options. "End of next turn" is the
              default since temporary notes should auto-expire by default. */}
          <label className={`flex items-center gap-2 ${typography.body} text-slate-200`}>
            <input
              type="radio"
              name="battle-note-expiry"
              value="end-of-next-turn"
              checked={expiryOption === "end-of-next-turn"}
              onChange={() => setExpiryOption("end-of-next-turn")}
            />
            Expire end of next turn (default)
          </label>
          <label className={`flex items-center gap-2 ${typography.body} text-slate-200`}>
            <input
              type="radio"
              name="battle-note-expiry"
              value="end-of-this-turn"
              checked={expiryOption === "end-of-this-turn"}
              onChange={() => setExpiryOption("end-of-this-turn")}
            />
            Expire end of this turn
          </label>
          <label className={`flex items-center gap-2 ${typography.body} text-slate-200`}>
            <input
              type="radio"
              name="battle-note-expiry"
              value="after-n-turns"
              checked={expiryOption === "after-n-turns"}
              onChange={() => setExpiryOption("after-n-turns")}
            />
            Expire after
            <input
              type="number"
              min={MIN_AFTER_N_TURNS}
              max={MAX_AFTER_N_TURNS}
              value={String(afterNTurns)}
              data-battle-note-field="after-n-turns"
              aria-label="Number of turns before expiry"
              disabled={expiryOption !== "after-n-turns"}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                if (Number.isNaN(parsed)) {
                  return;
                }
                setAfterNTurns(
                  Math.max(MIN_AFTER_N_TURNS, Math.min(MAX_AFTER_N_TURNS, parsed)),
                );
              }}
              onFocus={() => setExpiryOption("after-n-turns")}
              className="w-16 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 text-[13px] text-slate-100 focus:border-violet-300/60 focus:outline-none disabled:opacity-50"
            />
            turns
          </label>
          <label className={`flex items-center gap-2 ${typography.body} text-slate-200`}>
            <input
              type="radio"
              name="battle-note-expiry"
              value="manual"
              checked={expiryOption === "manual"}
              onChange={() => setExpiryOption("manual")}
            />
            Manual (until dismissed)
          </label>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            data-battle-note-action="cancel"
            className={buttonVariant("secondary")}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            data-battle-note-action="add"
            disabled={text.trim().length === 0}
            className={buttonVariant("primary")}
            onClick={handleSubmit}
          >
            Add Note
          </button>
        </div>
      </div>
    </div>
  );
}

function resolveExpiry(
  state: BattleMutableState,
  option: ExpiryOption,
  afterNTurns: number,
): BattleCardNoteExpiry {
  if (option === "manual") {
    return { kind: "manual" };
  }

  if (option === "end-of-next-turn") {
    return createNextTurnExpiry(state);
  }

  if (option === "end-of-this-turn") {
    // "End of this turn" fires at the start of the very next turn, which is
    // exactly `nextStartOfTurnPair` — the note expires as soon as the current
    // side hands off. Centralising via `nextStartOfTurnPair` keeps the reducer
    // mapping consistent.
    const pair = nextStartOfTurnPair(state);
    return {
      kind: "atStartOfTurn",
      side: pair.side,
      turnNumber: pair.turnNumber,
    };
  }

  // "Expire after N turns" resolves at the start of the player's (creator's)
  // turn N turns from now. The active side alternates each half-turn so we
  // advance the pair by `2 * N - 1` start-of-turn steps to land on the
  // creator's own upcoming turn.
  let pair = nextStartOfTurnPair(state);
  let stepsRemaining = Math.max(MIN_AFTER_N_TURNS, afterNTurns) * 2 - 1;
  // Walk start-of-turn pairs forward without mutating live state.
  let activeSide = state.activeSide;
  let turnNumber = state.turnNumber;
  while (stepsRemaining > 0) {
    const endingSide = activeSide;
    activeSide = endingSide === "player" ? "enemy" : "player";
    turnNumber += endingSide === "enemy" ? 1 : 0;
    pair = {
      side: endingSide === "player" ? "enemy" : "player",
      turnNumber,
    };
    stepsRemaining -= 1;
  }
  return {
    kind: "atStartOfTurn",
    side: pair.side,
    turnNumber: pair.turnNumber,
  };
}

function defaultGenerateNoteId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `note_${crypto.randomUUID()}`;
  }
  return `note_${Math.random().toString(36).slice(2)}`;
}
