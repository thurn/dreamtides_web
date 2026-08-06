// TransfigurationButton — the canonical forge-form choice.

import { TRANSFIGURATION_COLORS } from "../../../runtime/transfiguration-display";
import type { TransfigurationType } from "../../../types/journey";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { EssenceValue } from "../hud/EssenceValue";
import { StandaloneGlyph } from "./StandaloneGlyph";

/** Canonical glyph for each named transfiguration form. */
const TRANSFIGURATION_FORM_GLYPHS: Readonly<
  Record<TransfigurationType, Glyph>
> = {
  Empowered: GLYPHS.transfigurationEmpowered,
  Amplified: GLYPHS.transfigurationAmplified,
  Kindled: GLYPHS.transfigurationKindled,
  Inspired: GLYPHS.transfigurationInspired,
  Enduring: GLYPHS.transfigurationEnduring,
  Hastened: GLYPHS.transfigurationHastened,
  Resonant: GLYPHS.transfigurationResonant,
  Attuned: GLYPHS.transfigurationAttuned,
  Perfected: GLYPHS.transfigurationPerfected,
};

/** Player-facing data for one offered transfiguration form. */
export interface TransfigurationButtonModel {
  /** Named transfiguration form, which determines the canonical glyph. */
  type: TransfigurationType;
  /** Player-facing rules change announced as the option's accessible description. */
  description: string;
  /** Quoted essence cost announced in the accessible label. */
  essenceCost: number;
  /** Whether the player can currently pay the quoted cost. */
  affordable: boolean;
}

/** Strict visual treatments for compact and price-bearing form lists. */
export type TransfigurationButtonVariant = "compact" | "priced";

export interface TransfigurationButtonProps {
  /** Structured offered-form data; the component owns its canonical glyph and color. */
  form: TransfigurationButtonModel;
  /** Compact name-only choice or a wider choice with a visible essence price. */
  variant: TransfigurationButtonVariant;
  /** Whether this form is the active radio choice. */
  selected: boolean;
  /** Prevent activation while a transfiguration commit is in flight. */
  disabled?: boolean;
  /** Select the form after a press. */
  onPress: (type: TransfigurationType) => void;
  /** Optional stable test id for the semantic source. */
  testId?: string;
}

/**
 * Canonical forge-form choice. A press selects the form and updates
 * the adjacent card preview.
 */
export function TransfigurationButton({
  form,
  variant,
  selected,
  disabled = false,
  onPress,
  testId,
}: TransfigurationButtonProps) {
  const canSelect = form.affordable && !disabled;
  const glyph = TRANSFIGURATION_FORM_GLYPHS[form.type];
  const accent = TRANSFIGURATION_COLORS[form.type];
  const compact = variant === "compact";

  return (
    <Pressable
      as="button"
      data-transfiguration-button-variant={variant}
      role="radio"
      aria-checked={selected}
      aria-description={form.description}
      aria-label={`${form.type}, ${
        form.essenceCost === 0
          ? "free"
          : `${String(form.essenceCost)} essence`
      }`}
      disabled={!canSelect}
      data-testid={testId}
      onClick={canSelect ? () => onPress(form.type) : undefined}
      style={{
        height: compact ? token("--touch-min") : undefined,
        width: "100%",
        minWidth: 0,
        flex: "none",
        display: compact ? "flex" : "grid",
        gridTemplateColumns: compact
          ? undefined
          : "auto minmax(0, 1fr) auto",
        alignItems: "center",
        justifyContent: compact ? "center" : undefined,
        textAlign: compact ? "center" : "left",
        gap: compact ? token("--space-xs") : token("--space-s"),
        ...(compact
          ? {
              paddingRight: token("--space-xs"),
              paddingLeft: token("--space-xs"),
            }
          : { padding: token("--space-xs") }),
        boxSizing: "border-box",
        border: `2px solid ${selected ? accent : token("--border-soft")}`,
        borderRadius: token("--radius-control"),
        background: "transparent",
        boxShadow: "none",
        color: token("--text-on-glass"),
        opacity: form.affordable ? 1 : 0.46,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          fontSize: compact ? 20 : 28,
        }}
      >
        <StandaloneGlyph
          glyph={glyph}
          color={accent}
          depth="content-protection"
        />
      </span>
      <strong
        style={{
          minWidth: 0,
          font: token("--t-button"),
          color: token("--text-on-glass"),
          whiteSpace: "nowrap",
        }}
      >
        {form.type}
      </strong>
      {!compact && (
        <span
          style={{
            font: token("--t-button"),
            color: token("--text-on-glass"),
            whiteSpace: "nowrap",
          }}
        >
          {form.essenceCost === 0 ? (
            "Free"
          ) : (
            <EssenceValue amount={form.essenceCost} tone="inherit" />
          )}
        </span>
      )}
    </Pressable>
  );
}
