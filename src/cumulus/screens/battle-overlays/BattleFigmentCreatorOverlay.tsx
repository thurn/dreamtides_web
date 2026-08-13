import { assertLocalized, type LocalizedString } from "@trox/runtime";
import { plural, one, other, txa } from "@trox/runtime";
import type { ReactElement, Ref } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { NumberStepper } from "../../components/controls/NumberStepper";
import { SegmentedControl } from "../../components/controls/SegmentedControl";
import { Select } from "../../components/controls/Select";
import { TextField } from "../../components/controls/TextField";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

export type BattleFigmentSide = "player" | "enemy";
export type BattleFigmentZone =
  "hand" | "backRank" | "frontRank" | "void" | "banished" | "deck";
export type BattleFigmentDeckPosition = "top" | "bottom";

export interface BattleFigmentCreatorOverlayProps {
  readonly name: string;
  readonly nameInputRef: Ref<HTMLInputElement>;
  readonly typeId: string;
  readonly typeOptions: readonly {
    readonly value: string;
    readonly label: LocalizedString;
  }[];
  readonly keywordText: LocalizedString;
  readonly count: number;
  readonly maxCount: number;
  readonly sparkText: string;
  readonly sparkError?: LocalizedString;
  readonly baseSpark: number;
  readonly side: BattleFigmentSide;
  readonly zone: BattleFigmentZone;
  readonly position: BattleFigmentDeckPosition;
  readonly slot: string;
  readonly slotOptions: readonly string[];
  readonly canSubmit: boolean;
  readonly disabledReason: LocalizedString | null;
  readonly onNameChange: (value: string) => void;
  readonly onCountChange: (value: number) => void;
  readonly onTypeChange: (value: string) => void;
  readonly onSparkChange: (value: string) => void;
  readonly onSideChange: (value: BattleFigmentSide) => void;
  readonly onZoneChange: (value: BattleFigmentZone) => void;
  readonly onPositionChange: (value: BattleFigmentDeckPosition) => void;
  readonly onSlotChange: (value: string) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}

const ZONE_LABELS: Readonly<Record<BattleFigmentZone, string>> = {
  hand: "Hand",
  backRank: "Back Rank",
  frontRank: "Front Rank",
  void: "Void",
  banished: "Banished",
  deck: "Deck",
};

/** Pure Cumulus dialog and controls for configuring a generated figment. */
export function BattleFigmentCreatorOverlay({
  name,
  nameInputRef,
  typeId,
  typeOptions,
  keywordText,
  count,
  maxCount,
  sparkText,
  sparkError,
  baseSpark,
  side,
  zone,
  position,
  slot,
  slotOptions,
  canSubmit,
  disabledReason,
  onNameChange,
  onCountChange,
  onTypeChange,
  onSparkChange,
  onSideChange,
  onZoneChange,
  onPositionChange,
  onSlotChange,
  onCancel,
  onSubmit,
}: BattleFigmentCreatorOverlayProps): ReactElement {
  const resolve = useLocalizer();
  const fieldLabelStyle = {
    color: token("--text-on-glass-muted"),
    font: token("--t-caption"),
  } as const;

  return (
    <GlassDialog
      title={assertLocalized("Synthesize a Figment")}
      subtitle={assertLocalized(
        "Choose a figment type and a valid destination.",
      )}
      closeLabel={assertLocalized("Cancel figment creation")}
      onClose={onCancel}
      desktopCenterTarget="battlefield"
    >
      <div
        className="cumulus"
        data-battle-figment-creator=""
        style={{ display: "grid", gap: token("--space-m") }}
      >
        <div data-battle-figment-field="name">
          <TextField
            label={assertLocalized("Name")}
            value={name}
            onChange={onNameChange}
            inputRef={nameInputRef}
            supportingText={assertLocalized(
              "The displayed name for this created figment.",
            )}
          />
        </div>
        <div
          data-battle-figment-field="subtype"
          style={{ display: "grid", gap: token("--space-xs") }}
        >
          <Select
            ariaLabel={assertLocalized("Figment type")}
            leadingGlyph={GLYPHS.spark}
            full
            options={[...typeOptions]}
            value={typeId}
            onChange={onTypeChange}
          />
          <span data-battle-figment-keyword="" style={fieldLabelStyle}>
            {resolve(keywordText)}
          </span>
        </div>
        <div data-battle-figment-field="spark">
          <TextField
            label={assertLocalized("Spark")}
            value={sparkText}
            onChange={onSparkChange}
            error={
              sparkError
            }
            supportingText={assertLocalized(
              `Base spark ${String(baseSpark)} — editable.`,
            )}
          />
        </div>
        <div data-battle-figment-field="count">
          <NumberStepper
            label={assertLocalized("Quantity")}
            value={count}
            decrementLabel={assertLocalized("Create fewer figments")}
            incrementLabel={assertLocalized("Create more figments")}
            decrementDisabled={count <= 1}
            incrementDisabled={count >= maxCount}
            testId="battle-figment-count"
            onDecrement={() => onCountChange(Math.max(1, count - 1))}
            onIncrement={() => onCountChange(Math.min(maxCount, count + 1))}
          />
        </div>
        <div
          data-battle-figment-field="side"
          style={{ display: "grid", gap: token("--space-xs") }}
        >
          <span style={fieldLabelStyle}>Side</span>
          <SegmentedControl
            options={[
              { value: "player", label: assertLocalized("Player") },
              { value: "enemy", label: assertLocalized("Enemy") },
            ]}
            value={side}
            onChange={(value) => onSideChange(value as BattleFigmentSide)}
            full
          />
        </div>
        <div
          data-battle-figment-field="zone"
          style={{ display: "grid", gap: token("--space-xs") }}
        >
          <span style={fieldLabelStyle}>Destination</span>
          <Select
            ariaLabel={assertLocalized("Figment destination")}
            leadingGlyph={GLYPHS.grid}
            full
            options={(Object.keys(ZONE_LABELS) as BattleFigmentZone[])
              .map((value) => ({ value, label: ZONE_LABELS[value] }))
              .map((option) => ({
                ...option,
                label: assertLocalized(option.label),
                ...("triggerLabel" in option &&
                typeof option.triggerLabel === "string"
                  ? { triggerLabel: assertLocalized(option.triggerLabel) }
                  : {}),
              }))}
            value={zone}
            onChange={(value) => onZoneChange(value as BattleFigmentZone)}
          />
        </div>
        {zone === "deck" ? (
          <div
            data-battle-figment-field="position"
            style={{ display: "grid", gap: token("--space-xs") }}
          >
            <span style={fieldLabelStyle}>Deck Position</span>
            <SegmentedControl
              options={[
                { value: "top", label: assertLocalized("Top") },
                { value: "bottom", label: assertLocalized("Bottom") },
              ]}
              value={position}
              onChange={(value) =>
                onPositionChange(value as BattleFigmentDeckPosition)
              }
              full
            />
          </div>
        ) : null}
        {zone === "backRank" || zone === "frontRank" ? (
          <div
            data-battle-figment-field="slot"
            style={{ display: "grid", gap: token("--space-xs") }}
          >
            <span style={fieldLabelStyle}>Slot</span>
            <Select
              ariaLabel={assertLocalized("Figment battlefield slot")}
              leadingGlyph={GLYPHS.grid}
              full
              options={slotOptions
                .map((value) => ({ value, label: value }))
                .map((option) => ({
                  ...option,
                  label: assertLocalized(option.label),
                  ...("triggerLabel" in option &&
                  typeof option.triggerLabel === "string"
                    ? { triggerLabel: assertLocalized(option.triggerLabel) }
                    : {}),
                }))}
              value={slot}
              onChange={onSlotChange}
            />
          </div>
        ) : null}
        {canSubmit || disabledReason === null ? null : (
          <p data-battle-figment-submit-hint="" style={fieldLabelStyle}>
            {resolve(disabledReason)}
          </p>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: token("--space-xs"),
          }}
        >
          <GlassButton
            label={assertLocalized("Cancel")}
            placement="onGlass"
            testId="battle-figment-cancel"
            onPress={onCancel}
          />
          <GlassButton
            label={txa(
              plural(count, [
                one("Create Figment"),
                other("Create {count} Figments"),
              ]),
              { count },
              "Primary action that creates one or more configured Figments in the battle developer creation dialog. count is an integer from 1 through the dialog's configured maximum; activating the control creates exactly that many.",
            )}
            placement="onGlass"
            variant="accent"
            disabled={!canSubmit}
            testId="battle-figment-submit"
            onPress={onSubmit}
          />
        </div>
      </div>
    </GlassDialog>
  );
}
