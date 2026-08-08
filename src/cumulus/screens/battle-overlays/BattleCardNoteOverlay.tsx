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
      subtitle={t("battle-card-note-subtitle")}
      closeLabel={t("battle-card-note-cancel")}
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
            label={t("battle-card-note-text-label")}
            value={text}
            onChange={(value) => onTextChange(value.slice(0, 200))}
            placeholder={t("battle-card-note-placeholder")}
            supportingText={t("battle-card-note-character-count", { count: text.length })}
            error={hasText ? undefined : t("battle-card-note-error")}
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
            {t("battle-card-note-expiry-label")}
          </span>
          <Select
            ariaLabel={t("battle-card-note-expiry-accessible-name")}
            leadingGlyph={GLYPHS.duration}
            full
            options={[
              { value: "end-of-next-turn", label: t("battle-card-note-expiry-next-turn") },
              { value: "end-of-this-turn", label: t("battle-card-note-expiry-this-turn") },
              { value: "after-n-turns", label: t("battle-card-note-expiry-numbered") },
              { value: "manual", label: t("battle-card-note-expiry-manual") },
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
              label={t("battle-card-note-turns-label")}
              value={afterNTurns}
              decrementLabel={t("battle-card-note-fewer-turn")}
              incrementLabel={t("battle-card-note-more-turn")}
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
            label={t("battle-card-note-cancel-action")}
            placement="onGlass"
            testId="battle-note-cancel"
            onPress={onCancel}
          />
          <GlassButton
            label={t("battle-card-note-add-action")}
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
