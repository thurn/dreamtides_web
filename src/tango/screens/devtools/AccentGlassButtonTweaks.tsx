import type { ReactElement } from "react";
import {
  ACCENT_GLASS_BUTTON_VARIANTS,
  GlassButton,
  type AccentGlassButtonVariant,
} from "../../components/controls/GlassButton";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { token } from "../../primitives/tokens";

interface VariantSpec {
  readonly variant: AccentGlassButtonVariant;
  readonly label: string;
  readonly note: string;
}

const VARIANT_SPECS: readonly VariantSpec[] = [
  { variant: "accent-rim", label: "Violet Rim", note: "Neutral body, crisp accent edge." },
  { variant: "accent-wash", label: "Soft Wash", note: "A quiet violet tint through the glass." },
  { variant: "accent-glow", label: "Bright Aura", note: "Clear center with a luminous outer bloom." },
  { variant: "accent-depth", label: "Deep Lens", note: "Stronger fill and inset depth for commitment." },
  { variant: "accent-danger", label: "Danger Blueprint", note: "The danger recipe translated into violet." },
] as const;

if (VARIANT_SPECS.length !== ACCENT_GLASS_BUTTON_VARIANTS.length) {
  throw new Error("Accent glass tweak specs must cover every accent variant.");
}

export interface AccentGlassButtonTweaksProps {
  readonly value: AccentGlassButtonVariant;
  readonly onChange: (variant: AccentGlassButtonVariant) => void;
}

/** Dev-only live comparison panel for selecting the transfiguration accent. */
export function AccentGlassButtonTweaks({
  value,
  onChange,
}: AccentGlassButtonTweaksProps): ReactElement {
  const active = VARIANT_SPECS.find((spec) => spec.variant === value);
  return (
    <aside
      data-accent-glass-tweaks=""
      data-active-accent-variant={value}
      style={{
        ...glassSurfaceStyle({ radius: token("--radius-panel") }),
        position: "fixed",
        top: token("--space-8"),
        left: token("--space-8"),
        zIndex: 100,
        width: 264,
        boxSizing: "border-box",
        display: "grid",
        gap: token("--space-4"),
        padding: token("--space-5"),
      }}
    >
      <div>
        <p style={{ margin: 0, font: token("--t-eyebrow"), letterSpacing: token("--tracking-eyebrow"), textTransform: "uppercase", color: token("--text-on-glass-muted") }}>
          Tweaks
        </p>
        <h3 style={{ margin: `${token("--space-1")} 0 0`, font: token("--t-title-sm"), color: token("--text-on-glass") }}>
          Accent Glass
        </h3>
      </div>
      <div style={{ display: "grid", gap: token("--space-2") }}>
        {VARIANT_SPECS.map((spec) => (
          <GlassButton
            key={spec.variant}
            placement="onGlass"
            variant={spec.variant}
            label={spec.label}
            onPress={() => onChange(spec.variant)}
            testId={`accent-glass-tweak-${spec.variant}`}
          />
        ))}
      </div>
      <p style={{ margin: 0, font: token("--t-caption"), color: token("--text-on-glass-muted") }}>
        {active?.note}
      </p>
      <code
        style={{
          display: "block",
          padding: token("--space-3"),
          borderRadius: token("--radius-inset"),
          background: token("--surface-chrome-strong"),
          font: token("--t-popover-meta"),
          color: token("--text-on-glass"),
          whiteSpace: "pre-wrap",
        }}
      >
        {JSON.stringify({ variant: value }, null, 2)}
      </code>
    </aside>
  );
}
