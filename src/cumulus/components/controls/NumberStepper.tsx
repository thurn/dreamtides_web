import type { ReactElement } from "react";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { InlineGlyph } from "../typography/InlineGlyph";
import { IconButton } from "./IconButton";

/** The density presets for a NumberStepper row. */
export type NumberStepperSize = "sm" | "md";
/** Economy mark optionally paired with a stepper's numeric output. */
export type NumberStepperResource =
  | "essence"
  | "energy"
  | "spark"
  | "points";

export interface NumberStepperProps {
  /** Visible label for the numeric value. */
  label: string;
  /** Current numeric value. */
  value: number;
  /** Optional formatted value while `value` remains the numeric state contract. */
  displayValue?: string;
  /** Optional economy mark paired with the value. */
  resource?: NumberStepperResource;
  /** Accessible label for the decrement action. */
  decrementLabel: string;
  /** Accessible label for the increment action. */
  incrementLabel: string;
  /** Fires when the decrement disc is pressed. */
  onDecrement: () => void;
  /** Fires when the increment disc is pressed. */
  onIncrement: () => void;
  /** Prevent decrementing while preserving the control's layout. */
  decrementDisabled?: boolean;
  /** Prevent incrementing while preserving the control's layout. */
  incrementDisabled?: boolean;
  /** Compact or regular row density. Defaults to `md`. */
  size?: NumberStepperSize;
  /** Stable test id for the row. */
  testId?: string;
}

/**
 * A labeled decrement/value/increment control with stable tabular output and
 * optional canonical resource notation.
 */
export function NumberStepper({
  label,
  value,
  displayValue,
  resource,
  decrementLabel,
  incrementLabel,
  onDecrement,
  onIncrement,
  decrementDisabled = false,
  incrementDisabled = false,
  size = "md",
  testId,
}: NumberStepperProps): ReactElement {
  const compact = size === "sm";
  return (
    <div
      role="group"
      aria-label={`${label}: ${displayValue ?? String(value)}`}
      data-testid={testId}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto auto auto",
        alignItems: "center",
        gap: token(compact ? "--space-xs" : "--space-s"),
        minWidth: 0,
      }}
    >
      <span
        style={{
          minWidth: 0,
          color: token("--text-on-glass-muted"),
          font: token(compact ? "--t-caption" : "--t-body-sm"),
        }}
      >
        {label}
      </span>
      <IconButton
        glyph={GLYPHS.minus}
        size="sm"
        label={decrementLabel}
        placement="onGlass"
        disabled={decrementDisabled}
        onPress={onDecrement}
      />
      <output
        aria-live="polite"
        style={{
          minWidth: token("--touch-min"),
          display: "flex",
          justifyContent: "center",
          color: token("--text-on-glass"),
          font: token("--t-numeral"),
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>{displayValue ?? String(value)}</span>
        {resource === undefined ? null : (
          <InlineGlyph glyph={GLYPHS[resource]} />
        )}
      </output>
      <IconButton
        glyph={GLYPHS.plus}
        size="sm"
        label={incrementLabel}
        placement="onGlass"
        disabled={incrementDisabled}
        onPress={onIncrement}
      />
    </div>
  );
}
