import { useState } from "react";
import { GlassButton } from "../../cumulus/components/controls/GlassButton";
import { NumberStepper } from "../../cumulus/components/controls/NumberStepper";
import { Select } from "../../cumulus/components/controls/Select";
import { TextField } from "../../cumulus/components/controls/TextField";
import { GlassDialog } from "../../cumulus/components/overlay/GlassDialog";
import { GLYPHS } from "../../cumulus/primitives/glyph";
import { token } from "../../cumulus/primitives/tokens";
import type { BattleDebugEdit } from "../debug/commands";
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
  // bug-099: resolve the card name so the heading reads as a human label.
  const cardName = state.cardInstances[battleCardId]?.definition.name ?? battleCardId;

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
    <GlassDialog
      title={`Annotate ${cardName}`}
      subtitle="Notes appear on the card and in the inspector."
      closeLabel="Cancel note"
      onClose={onClose}
      desktopCenterTarget="battlefield"
    >
      <div className="cumulus" data-battle-note-editor="" data-battle-note-editor-card={battleCardId} style={{ display: "grid", gap: token("--space-5") }}>
        <div data-battle-note-field="text">
          <TextField
            label="Note Text"
            value={text}
            onChange={(value) => setText(value.slice(0, 200))}
            placeholder="Short reminder"
            supportingText={`${String(text.length)}/200 characters`}
            error={text.trim().length === 0 ? "A note needs text." : undefined}
          />
        </div>
        <div data-battle-note-field="expiry" style={{ display: "grid", gap: token("--space-2") }}>
          <span style={{ color: token("--text-on-glass-muted"), font: token("--t-caption") }}>Expiry</span>
          <Select
            ariaLabel="Note expiry"
            leadingGlyph={GLYPHS.counter}
            full
            options={[
              { value: "end-of-next-turn", label: "End of Next Turn" },
              { value: "end-of-this-turn", label: "End of This Turn" },
              { value: "after-n-turns", label: "After a Number of Turns" },
              { value: "manual", label: "Manual Dismissal" },
            ]}
            value={expiryOption}
            onChange={(value) => setExpiryOption(value as ExpiryOption)}
          />
        </div>
        {expiryOption === "after-n-turns" ? (
          <div data-battle-note-field="after-n-turns">
            <NumberStepper
              label="Turns Before Expiry"
              value={afterNTurns}
              decrementLabel="Use one fewer turn"
              incrementLabel="Use one more turn"
              decrementDisabled={afterNTurns <= MIN_AFTER_N_TURNS}
              incrementDisabled={afterNTurns >= MAX_AFTER_N_TURNS}
              onDecrement={() => setAfterNTurns((value) => Math.max(MIN_AFTER_N_TURNS, value - 1))}
              onIncrement={() => setAfterNTurns((value) => Math.min(MAX_AFTER_N_TURNS, value + 1))}
              placement="onGlass"
            />
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: token("--space-3") }}>
          <GlassButton label="Cancel" placement="onGlass" testId="battle-note-cancel" onPress={onClose} />
          <GlassButton label="Add Note" placement="onGlass" variant="accent" disabled={text.trim().length === 0} testId="battle-note-add" onPress={handleSubmit} />
        </div>
      </div>
    </GlassDialog>
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
