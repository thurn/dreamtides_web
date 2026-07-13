// TransfigurationFormButton — the compact, self-revealing forge-form choice.

import { useRef } from "react";
import type { TransfigurationType } from "../../../types/quest";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import type { TangoColor } from "../../primitives/color";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { richText } from "../card/rich-text";
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
  /** Player-facing rules change revealed through the shared InfoCard. */
  description: string;
  /** Quoted essence cost shown in the accessible label and InfoCard. */
  essenceCost: number;
  /** Whether the player can currently pay the quoted cost. */
  affordable: boolean;
  /** Data-defined transfiguration hue used for the glyph and selection edge. */
  accent: TangoColor;
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
 * Icon-only mobile form choice. A quick tap selects; hover, focus, or a touch
 * hold reveals the form name, cost, and full effect through InfoCard.
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
  const lastPointerType = useRef<string | null>(null);
  const canSelect = affordable && !disabled;
  const glyph = TRANSFIGURATION_FORM_GLYPHS[type];
  const binding = useRevealSource({
    identity: {
      entityType: "transfiguration-form",
      entityId: revealEntityId("transfiguration-form", id),
    },
    spec: {
      primary: {
        kind: "infoCard",
        card: {
          variant: "text",
          meta:
            essenceCost === 0
              ? "Free Transfiguration"
              : `${String(essenceCost)} Essence`,
          title: type,
          leadGlyph: glyph,
          body: richText.plain(description),
        },
      },
      secondaries: [],
    },
    onActivate: canSelect ? onActivate : undefined,
  });
  const pointerDown = binding.sourceProps.onPointerDown;

  return (
    <Pressable
      as="button"
      ref={binding.ref}
      {...binding.sourceProps}
      role="radio"
      aria-checked={selected}
      aria-disabled={!canSelect || undefined}
      aria-label={`${type}, ${
        essenceCost === 0 ? "free" : `${String(essenceCost)} essence`
      }`}
      disabled={disabled}
      data-testid={testId}
      onPointerDown={(event) => {
        lastPointerType.current = event.pointerType;
        pointerDown?.(event);
      }}
      onClick={() => {
        if (lastPointerType.current !== "touch" && canSelect) onActivate();
      }}
      style={{
        ...binding.sourceProps.style,
        width: token("--touch-min"),
        height: token("--touch-min"),
        flex: "none",
        display: "grid",
        placeItems: "center",
        padding: 0,
        border: `2px solid ${selected ? accent : token("--border-soft")}`,
        borderRadius: token("--radius-control"),
        background: "transparent",
        color: token("--text-on-glass"),
        opacity: affordable ? 1 : 0.46,
      }}
    >
      <GlowIcon iconClass={glyph} color={accent} size="24px" shadow />
    </Pressable>
  );
}
