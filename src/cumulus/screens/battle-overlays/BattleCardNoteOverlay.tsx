import type { ReactElement } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { NumberStepper } from "../../components/controls/NumberStepper";
import { Select } from "../../components/controls/Select";
import { TextField } from "../../components/controls/TextField";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { useMessages } from "../../hooks/use-messages";

export type BattleCardNoteExpiryOption =
  | "end-of-this-turn"
  | "end-of-next-turn"
  | "after-n-turns"
  | "manual";

export interface BattleCardNoteOverlayProps {
  readonly cardId: string;
  readonly cardName: string;
  readonly text: string;
  readonly expiryOption: BattleCardNoteExpiryOption;
  readonly afterNTurns: number;
  readonly minimumTurns: number;
  readonly maximumTurns: number;
  readonly onTextChange: (value: string) => void;
  readonly onExpiryChange: (value: BattleCardNoteExpiryOption) => void;
  readonly onAfterNTurnsChange: (value: number) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}

/** Pure Cumulus presentation for the battle card-note workflow. */
export function BattleCardNoteOverlay({
  cardId,
  cardName,
  text,
  expiryOption,
  afterNTurns,
  minimumTurns,
  maximumTurns,
  onTextChange,
  onExpiryChange,
  onAfterNTurnsChange,
  onCancel,
  onSubmit,
}: BattleCardNoteOverlayProps): ReactElement {
  const t = useMessages();
  const hasText = text.trim().length > 0;

  return (
    <GlassDialog
      title={t("battle-card-note-title", { cardName })}
      subtitle="Notes appear on the card and in the inspector."
      closeLabel="Cancel note"
      onClose={onCancel}
      desktopCenterTarget="battlefield"
    >
      <div
        className="cumulus"
        data-battle-note-editor=""
        data-battle-note-editor-card={cardId}
        style={{ display: "grid", gap: token("--space-m") }}
      >
        <div data-battle-note-field="text">
          <TextField
            label="Note Text"
            value={text}
            onChange={(value) => onTextChange(value.slice(0, 200))}
            placeholder="Short reminder"
            supportingText={`${String(text.length)}/200 characters`}
            error={hasText ? undefined : "A note needs text."}
          />
        </div>
        <div
          data-battle-note-field="expiry"
          style={{ display: "grid", gap: token("--space-xs") }}
        >
          <span
            style={{
              color: token("--text-on-glass-muted"),
              font: token("--t-caption"),
            }}
          >
            Expiry
          </span>
          <Select
            ariaLabel="Note expiry"
            leadingGlyph={GLYPHS.duration}
            full
            options={[
              { value: "end-of-next-turn", label: "End of Next Turn" },
              { value: "end-of-this-turn", label: "End of This Turn" },
              { value: "after-n-turns", label: "After a Number of Turns" },
              { value: "manual", label: "Manual Dismissal" },
            ]}
            value={expiryOption}
            onChange={(value) =>
              onExpiryChange(value as BattleCardNoteExpiryOption)
            }
          />
        </div>
        {expiryOption === "after-n-turns" ? (
          <div data-battle-note-field="after-n-turns">
            <NumberStepper
              label="Turns Before Expiry"
              value={afterNTurns}
              decrementLabel="Use one fewer turn"
              incrementLabel="Use one more turn"
              decrementDisabled={afterNTurns <= minimumTurns}
              incrementDisabled={afterNTurns >= maximumTurns}
              onDecrement={() =>
                onAfterNTurnsChange(Math.max(minimumTurns, afterNTurns - 1))
              }
              onIncrement={() =>
                onAfterNTurnsChange(Math.min(maximumTurns, afterNTurns + 1))
              }
            />
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: token("--space-xs"),
          }}
        >
          <GlassButton
            label="Cancel"
            placement="onGlass"
            testId="battle-note-cancel"
            onPress={onCancel}
          />
          <GlassButton
            label="Add Note"
            placement="onGlass"
            variant="accent"
            disabled={!hasText}
            testId="battle-note-add"
            onPress={onSubmit}
          />
        </div>
      </div>
    </GlassDialog>
  );
}
