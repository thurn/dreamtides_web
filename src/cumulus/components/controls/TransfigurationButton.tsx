// TransfigurationButton — the canonical forge-form choice.

import type {
  TransfigurationChange,
  TransfigurationType,
} from "../../../types/journey";
import { GLYPHS } from "../../primitives/glyph";
import type { TransfigurationFormDefinition } from "../../../types/transfiguration-data";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { useMessages } from "../../hooks/use-messages";
import { EssenceValue } from "../hud/EssenceValue";
import { StandaloneGlyph } from "./StandaloneGlyph";

/** Player-facing data for one offered transfiguration form. */
export interface TransfigurationButtonModel {
  /** Named transfiguration form, which determines the canonical glyph. */
  type: TransfigurationType;
  /** Authored presentation resolved from the injected catalog. */
  presentation: Pick<
    TransfigurationFormDefinition,
    "name" | "description" | "glyph" | "accentColor"
  >;
  /** Locale-neutral rules change announced as the option's accessible description. */
  change?: TransfigurationChange;
  /** Compatibility fixture field; production views provide `change`. */
  description?: string;
  /** Quoted essence cost announced in the accessible label. */
  essenceCost: number;
  /** Whether the player can currently pay the quoted cost. */
  affordable: boolean;
}

/** Strict visual treatments for compact and optionally priced form lists. */
export type TransfigurationButtonVariant = "compact" | "priced";

export interface TransfigurationButtonProps {
  /** Structured offered-form data; the component owns its canonical glyph and color. */
  form: TransfigurationButtonModel;
  /** Compact name-only choice or a wider choice that shows positive essence prices. */
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
  const t = useMessages();
  const canSelect = form.affordable && !disabled;
  const glyph = GLYPHS[form.presentation.glyph];
  const accent = form.presentation.accentColor;
  const compact = variant === "compact";
  const showPrice = !compact && form.essenceCost > 0;

  return (
    <Pressable
      as="button"
      data-transfiguration-button-variant={variant}
      role="radio"
      aria-checked={selected}
      aria-description={form.presentation.description}
      aria-label={t("transfiguration-form-choice", {
        formName: form.presentation.name,
        essenceCost: form.essenceCost,
      })}
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
          : showPrice
            ? "auto minmax(0, 1fr) auto"
            : "auto minmax(0, 1fr)",
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
        {form.presentation.name}
      </strong>
      {showPrice && (
        <span
          data-transfiguration-button-price=""
          style={{
            font: token("--t-button"),
            color: token("--text-on-glass"),
            whiteSpace: "nowrap",
          }}
        >
          <EssenceValue amount={form.essenceCost} tone="inherit" />
        </span>
      )}
    </Pressable>
  );
}
