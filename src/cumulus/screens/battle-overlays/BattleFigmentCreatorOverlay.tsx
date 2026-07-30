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
  | "hand"
  | "backRank"
  | "frontRank"
  | "void"
  | "banished"
  | "deck";
export type BattleFigmentDeckPosition = "top" | "bottom";

export interface BattleFigmentCreatorOverlayProps {
  readonly name: string;
  readonly nameInputRef: Ref<HTMLInputElement>;
  readonly typeId: string;
  readonly typeOptions: readonly { readonly value: string; readonly label: string }[];
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
      title="Synthesize a Figment"
      subtitle="Choose a figment type and a valid destination."
      closeLabel="Cancel figment creation"
      onClose={onCancel}
      desktopCenterTarget="battlefield"
    >
      <div
        className="cumulus"
        data-battle-figment-creator=""
        style={{ display: "grid", gap: token("--space-5") }}
      >
        <div data-battle-figment-field="name">
          <TextField
            label="Name"
            value={name}
            onChange={onNameChange}
            inputRef={nameInputRef}
            supportingText="The displayed name for this created figment."
          />
        </div>
        <div
          data-battle-figment-field="subtype"
          style={{ display: "grid", gap: token("--space-2") }}
        >
          <Select
            ariaLabel="Figment type"
            leadingGlyph={GLYPHS.spark}
            full
            options={[...typeOptions]}
            value={typeId}
            onChange={onTypeChange}
          />
          <span data-battle-figment-keyword="" style={fieldLabelStyle}>
            {keywordText}
          </span>
        </div>
        <div data-battle-figment-field="spark">
          <TextField
            label="Spark"
            value={sparkText}
            onChange={onSparkChange}
            error={sparkError}
            supportingText={`Base spark ${String(baseSpark)} — editable.`}
          />
        </div>
        <div data-battle-figment-field="count">
          <NumberStepper
            label="Quantity"
            value={count}
            decrementLabel="Create fewer figments"
            incrementLabel="Create more figments"
            decrementDisabled={count <= 1}
            incrementDisabled={count >= maxCount}
            placement="onGlass"
            testId="battle-figment-count"
            onDecrement={() => onCountChange(Math.max(1, count - 1))}
            onIncrement={() => onCountChange(Math.min(maxCount, count + 1))}
          />
        </div>
        <div
          data-battle-figment-field="side"
          style={{ display: "grid", gap: token("--space-2") }}
        >
          <span style={fieldLabelStyle}>Side</span>
          <SegmentedControl
            options={[
              { value: "player", label: "Player" },
              { value: "enemy", label: "Enemy" },
            ]}
            value={side}
            onChange={(value) => onSideChange(value as BattleFigmentSide)}
            full
          />
        </div>
        <div
          data-battle-figment-field="zone"
          style={{ display: "grid", gap: token("--space-2") }}
        >
          <span style={fieldLabelStyle}>Destination</span>
          <Select
            ariaLabel="Figment destination"
            leadingGlyph={GLYPHS.grid}
            full
            options={(Object.keys(ZONE_LABELS) as BattleFigmentZone[]).map(
              (value) => ({ value, label: ZONE_LABELS[value] }),
            )}
            value={zone}
            onChange={(value) => onZoneChange(value as BattleFigmentZone)}
          />
        </div>
        {zone === "deck" ? (
          <div
            data-battle-figment-field="position"
            style={{ display: "grid", gap: token("--space-2") }}
          >
            <span style={fieldLabelStyle}>Deck Position</span>
            <SegmentedControl
              options={[
                { value: "top", label: "Top" },
                { value: "bottom", label: "Bottom" },
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
            style={{ display: "grid", gap: token("--space-2") }}
          >
            <span style={fieldLabelStyle}>Slot</span>
            <Select
              ariaLabel="Figment battlefield slot"
              leadingGlyph={GLYPHS.grid}
              full
              options={slotOptions.map((value) => ({ value, label: value }))}
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
            gap: token("--space-3"),
          }}
        >
          <GlassButton
            label="Cancel"
            placement="onGlass"
            testId="battle-figment-cancel"
            onPress={onCancel}
          />
          <GlassButton
            label={count === 1 ? "Create Figment" : `Create ${String(count)} Figments`}
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
