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
    readonly label: string;
  }[];
  readonly keywordText: string;
  readonly count: number;
  readonly maxCount: number;
  readonly sparkText: string;
  readonly sparkError?: string;
  readonly baseSpark: number;
  readonly side: BattleFigmentSide;
  readonly zone: BattleFigmentZone;
  readonly position: BattleFigmentDeckPosition;
  readonly slot: string;
  readonly slotOptions: readonly string[];
  readonly canSubmit: boolean;
  readonly disabledReason: string | null;
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
  const fieldLabelStyle = {
    color: token("--text-on-glass-muted"),
    font: token("--t-caption"),
  } as const;

  return (
    <GlassDialog
      authoredTitle={"Synthesize a Figment"}
      authoredSubtitle="Choose a figment type and a valid destination."
      authoredCloseLabel={"Cancel figment creation"}
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
            authoredLabel={"Name"}
            value={name}
            onChange={onNameChange}
            inputRef={nameInputRef}
            authoredSupportingText="The displayed name for this created figment."
          />
        </div>
        <div
          data-battle-figment-field="subtype"
          style={{ display: "grid", gap: token("--space-xs") }}
        >
          <Select
            authoredAriaLabel={"Figment type"}
            leadingGlyph={GLYPHS.spark}
            full
            options={[...typeOptions].map((option) => ({
              ...option,
              authoredLabel: option.label,
              ...("triggerLabel" in option &&
              typeof option.triggerLabel === "string"
                ? { authoredTriggerLabel: option.triggerLabel }
                : {}),
            }))}
            value={typeId}
            onChange={onTypeChange}
          />
          <span data-battle-figment-keyword="" style={fieldLabelStyle}>
            {keywordText}
          </span>
        </div>
        <div data-battle-figment-field="spark">
          <TextField
            authoredLabel={"Spark"}
            value={sparkText}
            onChange={onSparkChange}
            authoredError={sparkError}
            authoredSupportingText={`Base spark ${String(baseSpark)} — editable.`}
          />
        </div>
        <div data-battle-figment-field="count">
          <NumberStepper
            authoredLabel={"Quantity"}
            value={count}
            authoredDecrementLabel={"Create fewer figments"}
            authoredIncrementLabel={"Create more figments"}
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
              { value: "player", authoredLabel: "Player" },
              { value: "enemy", authoredLabel: "Enemy" },
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
            authoredAriaLabel={"Figment destination"}
            leadingGlyph={GLYPHS.grid}
            full
            options={(Object.keys(ZONE_LABELS) as BattleFigmentZone[])
              .map((value) => ({ value, label: ZONE_LABELS[value] }))
              .map((option) => ({
                ...option,
                authoredLabel: option.label,
                ...("triggerLabel" in option &&
                typeof option.triggerLabel === "string"
                  ? { authoredTriggerLabel: option.triggerLabel }
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
                { value: "top", authoredLabel: "Top" },
                { value: "bottom", authoredLabel: "Bottom" },
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
              authoredAriaLabel={"Figment battlefield slot"}
              leadingGlyph={GLYPHS.grid}
              full
              options={slotOptions
                .map((value) => ({ value, label: value }))
                .map((option) => ({
                  ...option,
                  authoredLabel: option.label,
                  ...("triggerLabel" in option &&
                  typeof option.triggerLabel === "string"
                    ? { authoredTriggerLabel: option.triggerLabel }
                    : {}),
                }))}
              value={slot}
              onChange={onSlotChange}
            />
          </div>
        ) : null}
        {canSubmit || disabledReason === null ? null : (
          <p data-battle-figment-submit-hint="" style={fieldLabelStyle}>
            {disabledReason}
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
            authoredLabel="Cancel"
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
