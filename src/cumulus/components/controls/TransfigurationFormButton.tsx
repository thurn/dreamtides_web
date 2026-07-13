// TransfigurationFormButton — the compact forge-form choice.

import type { TransfigurationType } from "../../../types/quest";
import type { CumulusColor } from "../../primitives/color";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { GlowIcon } from "./GlowIcon";

/** Canonical glyph for each named transfiguration form. */
export const TRANSFIGURATION_FORM_GLYPHS: Readonly<
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

export interface TransfigurationFormButtonProps {
  /** Stable identity pairing the concrete deck entry with this offered form. */
  id: string;
  /** Named transfiguration form, which determines the canonical glyph. */
  type: TransfigurationType;
  /** Player-facing rules change announced as the option's accessible description. */
  description: string;
  /** Quoted essence cost announced in the accessible label. */
  essenceCost: number;
  /** Whether the player can currently pay the quoted cost. */
  affordable: boolean;
  /** Data-defined transfiguration hue used for the glyph and selection edge. */
  accent: CumulusColor;
  /** Whether this form is the active radio choice. */
  selected: boolean;
  /** Prevent activation while a transfiguration commit is in flight. */
  disabled?: boolean;
  /** Select this form after a quick activation. */
  onActivate: () => void;
  /** Optional stable test id for the semantic source. */
  testId?: string;
}

/**
 * Compact mobile form choice. A quick tap selects the form and updates the
 * adjacent card preview.
 */
export function TransfigurationFormButton({
  id,
  type,
  description,
  essenceCost,
  affordable,
  accent,
  selected,
  disabled = false,
  onActivate,
  testId,
}: TransfigurationFormButtonProps) {
  const canSelect = affordable && !disabled;
  const glyph = TRANSFIGURATION_FORM_GLYPHS[type];

  return (
    <Pressable
      as="button"
      data-transfiguration-form-id={id}
      role="radio"
      aria-checked={selected}
      aria-description={description}
      aria-label={`${type}, ${
        essenceCost === 0 ? "free" : `${String(essenceCost)} essence`
      }`}
      disabled={!canSelect}
      data-testid={testId}
      onClick={canSelect ? onActivate : undefined}
      style={{
        height: token("--touch-min"),
        width: "100%",
        minWidth: 0,
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-2"),
        paddingRight: token("--space-3"),
        paddingLeft: token("--space-3"),
        boxSizing: "border-box",
        border: `2px solid ${selected ? accent : token("--border-soft")}`,
        borderRadius: token("--radius-control"),
        background: "transparent",
        color: token("--text-on-glass"),
        opacity: affordable ? 1 : 0.46,
      }}
    >
      <GlowIcon iconClass={glyph} color={accent} size="20px" shadow />
      <span
        style={{
          font: token("--t-button"),
          color: token("--text-on-glass"),
          whiteSpace: "nowrap",
        }}
      >
        {type}
      </span>
    </Pressable>
  );
}
