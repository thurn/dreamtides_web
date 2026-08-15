import { meaning, opaque, txa, tx, type LocalizedString } from "@trox/runtime";
import type { ReactElement } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { NumberStepper } from "../../components/controls/NumberStepper";
import { Select } from "../../components/controls/Select";
import { TextField } from "../../components/controls/TextField";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import type { BattleCardId } from "../../../types/identifiers";

export type BattleCardNoteExpiryOption =
  "end-of-this-turn" | "end-of-next-turn" | "after-n-turns" | "manual";

export interface BattleCardNoteOverlayProps {
  readonly cardId: BattleCardId;
  readonly cardName: LocalizedString;
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
  const resolve = useLocalizer();
  const hasText = text.trim().length > 0;

  return (
    <GlassDialog
      title={txa(
        "Annotate {card_name}",
        { card_name: opaque(cardName) },
        "[battle] Title of the optional player note editor for a battle card. card_name is the canonical display name and has unknown grammatical gender.",
      )}
      subtitle={tx(
        "Notes appear on the card and in the inspector.",
        "[battle] Card note subtitle.",
      )}
      closeLabel={tx("Cancel note", "[battle] Card note cancel.")}
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
            label={tx("Note Text", "[battle] Card note text label.")}
            value={text}
            onChange={(value) => onTextChange(value.slice(0, 200))}
            placeholder={tx(
              "Short reminder",
              "[battle] Card note placeholder.",
            )}
            supportingText={txa(
              "{count}/200 characters",
              { count: text.length },
              "[battle] Card note character count.",
            )}
            error={
              hasText
                ? undefined
                : tx("A note needs text.", "[battle] Card note error.")
            }
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
            {resolve(tx("Expiry", "[battle] Card note expiry label."))}
          </span>
          <Select
            ariaLabel={tx(
              "Note expiry",
              "[accessibility] [battle] Card note expiry name.",
            )}
            leadingGlyph={GLYPHS.duration}
            full
            options={[
              {
                value: "end-of-next-turn",
                label: tx(
                  "End of Next Turn",
                  "[battle] Card note expiry next turn.",
                ),
              },
              {
                value: "end-of-this-turn",
                label: tx(
                  "End of This Turn",
                  "[battle] Card note expiry this turn.",
                ),
              },
              {
                value: "after-n-turns",
                label: tx(
                  "After a Number of Turns",
                  "[battle] Card note expiry numbered.",
                ),
              },
              {
                value: "manual",
                label: tx(
                  "Manual Dismissal",
                  "[battle] Card note expiry manual.",
                ),
              },
            ]}
            value={expiryOption}
            onChange={onExpiryChange}
          />
        </div>
        {expiryOption === "after-n-turns" ? (
          <div data-battle-note-field="after-n-turns">
            <NumberStepper
              label={tx(
                "Turns Before Expiry",
                "[battle] Card note turns label.",
              )}
              value={afterNTurns}
              decrementLabel={tx(
                "Use one fewer turn",
                "[battle] Card note fewer turn.",
              )}
              incrementLabel={tx(
                "Use one more turn",
                "[battle] Card note more turn.",
              )}
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
            label={tx(
              meaning("card-note-cancel", "Cancel"),
              "[battle] Card note cancel action.",
            )}
            placement="onGlass"
            testId="battle-note-cancel"
            onPress={onCancel}
          />
          <GlassButton
            label={tx("Add Note", "[battle] Card note add action.")}
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
