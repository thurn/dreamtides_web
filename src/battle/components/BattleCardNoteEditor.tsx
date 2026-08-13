import { useState } from "react";
import {
  BattleCardNoteOverlay,
  type BattleCardNoteExpiryOption,
} from "../../cumulus/screens/battle-overlays/BattleCardNoteOverlay";
import type { BattleDebugEdit } from "../debug/commands";
import { nextStartOfTurnPair } from "../state/turn-utils";
import { createNextTurnExpiry } from "../state/notes-utils";
import type { BattleCardNoteExpiry, BattleMutableState } from "../types";
import { tx } from "@trox/runtime";
import { localizedSourceText } from "../../runtime/localization/runtime";

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
  const [expiryOption, setExpiryOption] =
    useState<BattleCardNoteExpiryOption>("end-of-next-turn");
  const [afterNTurns, setAfterNTurns] = useState(DEFAULT_AFTER_N_TURNS);
  // bug-099: resolve the card name so the heading reads as a human label.
  const cardDefinition = state.cardInstances[battleCardId]?.definition;
  const cardName =
    cardDefinition === undefined
      ? tx(
          "Card",
          "Fallback name in the battle card-note editor when the referenced card is unavailable.",
        )
      : localizedSourceText(cardDefinition.name);

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
    <BattleCardNoteOverlay
      cardId={battleCardId}
      cardName={cardName}
      text={text}
      expiryOption={expiryOption}
      afterNTurns={afterNTurns}
      minimumTurns={MIN_AFTER_N_TURNS}
      maximumTurns={MAX_AFTER_N_TURNS}
      onTextChange={setText}
      onExpiryChange={setExpiryOption}
      onAfterNTurnsChange={setAfterNTurns}
      onCancel={onClose}
      onSubmit={handleSubmit}
    />
  );
}

function resolveExpiry(
  state: BattleMutableState,
  option: BattleCardNoteExpiryOption,
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
