import { meaning, txa, tx } from "@trox/runtime";
import type { ReactElement } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { NumberStepper } from "../../components/controls/NumberStepper";
import { Select } from "../../components/controls/Select";
import { TextField } from "../../components/controls/TextField";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

export type BattleCardNoteExpiryOption =
  "end-of-this-turn" | "end-of-next-turn" | "after-n-turns" | "manual";

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
  const resolve = useLocalizer();
  const hasText = text.trim().length > 0;

  return (
    <GlassDialog
      title={txa(
          "Annotate {card_name}",
          { card_name: cardName },
          "Title of the optional player note editor for a battle card. card_name is the canonical display name and has unknown grammatical gender.",
        )}
      subtitle={tx(
          "Notes appear on the card and in the inspector.",
          "Player-facing message for the battle card note subtitle interface state.",
        )}
      closeLabel={tx(
          "Cancel note",
          "Player-facing message for the battle card note cancel interface state.",
        )}
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
            label={tx(
                "Note Text",
                "Player-facing message for the battle card note text label interface state.",
              )}
            value={text}
            onChange={(value) => onTextChange(value.slice(0, 200))}
            placeholder={tx(
                "Short reminder",
                "Player-facing message for the battle card note placeholder interface state.",
              )}
            supportingText={txa(
                "{count}/200 characters",
                { count: text.length },
                "Player-facing message for the battle card note character count interface state.",
              )}
            error={
              hasText
                ? undefined
                : tx(
                      "A note needs text.",
                      "Player-facing message for the battle card note error interface state.",
                    )
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
            {resolve(tx(
              "Expiry",
              "Player-facing message for the battle card note expiry label interface state.",
            ))}
          </span>
          <Select
            ariaLabel={tx(
                "Note expiry",
                "Player-facing message for the battle card note expiry accessible name interface state.",
              )}
            leadingGlyph={GLYPHS.duration}
            full
            options={[
              {
                value: "end-of-next-turn",
                label: tx(
                    "End of Next Turn",
                    "Player-facing message for the battle card note expiry next turn interface state.",
                  ),
              },
              {
                value: "end-of-this-turn",
                label: tx(
                    "End of This Turn",
                    "Player-facing message for the battle card note expiry this turn interface state.",
                  ),
              },
              {
                value: "after-n-turns",
                label: tx(
                    "After a Number of Turns",
                    "Player-facing message for the battle card note expiry numbered interface state.",
                  ),
              },
              {
                value: "manual",
                label: tx(
                    "Manual Dismissal",
                    "Player-facing message for the battle card note expiry manual interface state.",
                  ),
              },
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
              label={tx(
                  "Turns Before Expiry",
                  "Player-facing message for the battle card note turns label interface state.",
                )}
              value={afterNTurns}
              decrementLabel={tx(
                  "Use one fewer turn",
                  "Player-facing message for the battle card note fewer turn interface state.",
                )}
              incrementLabel={tx(
                  "Use one more turn",
                  "Player-facing message for the battle card note more turn interface state.",
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
              "Player-facing message for the battle card note cancel action interface state.",
            )}
            placement="onGlass"
            testId="battle-note-cancel"
            onPress={onCancel}
          />
          <GlassButton
            label={tx(
              "Add Note",
              "Player-facing message for the battle card note add action interface state.",
            )}
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
