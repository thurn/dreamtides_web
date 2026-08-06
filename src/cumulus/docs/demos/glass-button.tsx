// Registry demo entry for GlassButton — see icon-button.tsx for the
// controlled-wrapper recipe this follows. GlassButton takes an `onPress`
// callback and an optional `glyph` that a generated control panel can't model,
// so `Component` here is a small wrapper that supplies a no-op press handler and
// maps a `withGlyph` toggle to a fixed sort glyph, while forwarding the `label`
// + `disabled` controls to the real component. `docName` still points at
// GlassButton so the props table stays accurate to its actual API.

import {
  GlassButton,
  type GlassButtonSize,
  type GlassButtonVariant,
} from "../../components/controls/GlassButton";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import { GLYPHS } from "../../primitives/glyph";
import type { CumulusComponent } from "../registry";

interface GlassButtonDemoArgs {
  label?: string;
  essenceCost?: number | null;
  withGlyph?: boolean;
  variant?: GlassButtonVariant;
  placement?: GlassControlPlacement;
  size?: GlassButtonSize;
  disabled?: boolean;
  pressed?: boolean;
}

/**
 * Wraps GlassButton with a no-op press handler and a `withGlyph` toggle (which
 * supplies a fixed sort glyph) so the demo stage is interactive (the control
 * still compresses on press / enlarges on hover) while the `label` and
 * `disabled` controls flow through from the generated control panel.
 */
function GlassButtonDemo({
  label = "Transfigure",
  essenceCost = 20,
  withGlyph = false,
  variant = "accent",
  placement = "onMedia",
  size = "standard",
  disabled = false,
  pressed,
}: GlassButtonDemoArgs) {
  return (
    <GlassButton
      label={label}
      essenceCost={essenceCost}
      glyph={withGlyph ? GLYPHS.sort : undefined}
      variant={variant}
      placement={placement}
      size={size}
      disabled={disabled}
      pressed={pressed}
      onPress={() => {}}
    />
  );
}

export const glassButtonDemo: CumulusComponent = {
  id: "glass-button",
  title: "Glass Button",
  blurb:
    "The labeled glass action — a bold text label with optional Essence cost or non-cost value on the shared liquid-glass surface, with neutral, danger, and purple accent treatments plus placement-aware recipes for media or an existing glass surface.",
  callout:
    "Use purple accent glass for primary and commit actions, neutral glass for secondary actions, and danger glass for destructive actions.",
  group: "Components",
  docName: "GlassButton",
  Component: GlassButtonDemo,
  usage: [
    {
      label: "Pressed toggle",
      note: "Use `pressed` only when the action represents a persistent toggle state; the component exposes the state through `aria-pressed`.",
      code: `<GlassButton
  label={controllingOpponent ? "Return to Your Side" : "Control Opponent"}
  pressed={controllingOpponent}
  onPress={togglePerspective}
/>`,
    },
    {
      note: "A plain text label on the glass surface. `label` is a resolved string; `onPress` fires on activation.",
      code: `import { GlassButton } from "src/cumulus/components/controls/GlassButton";

<GlassButton label="Reset filters" onPress={resetFilters} />`,
    },
    {
      label: "Leading glyph",
      note: "A `glyph` paints a leading GlowIcon before the label (e.g. a filled funnel for a filter action).",
      code: `import { GlassButton } from "src/cumulus/components/controls/GlassButton";
import { GLYPHS } from "src/cumulus/primitives/glyph";

<GlassButton
  glyph={GLYPHS.filter}
  label="Filter"
  onPress={openFilters}
/>`,
    },
    {
      label: "On glass",
      note: 'Use `placement="onGlass"` when the control rests inside a glass panel. Its lighter tonal lens preserves the panel\'s inherited scene color instead of compounding the full media-level tint.',
      code: `<GlassButton
  label="Decline"
  placement="onGlass"
  onPress={decline}
/>`,
    },
    {
      label: "Disabled",
      note: "A disabled GlassButton dims the complete control and detaches activation and press feedback.",
      code: `<GlassButton
  label="Transfigure"
  variant="accent"
  disabled
  onPress={transfigure}
/>`,
    },
    {
      label: "Danger variant",
      note: 'Use `variant="danger"` for destructive actions. It applies the accent soft-wash recipe in red while preserving the same translucent glass layers.',
      code: `import { GlassButton } from "src/cumulus/components/controls/GlassButton";
import { GLYPHS } from "src/cumulus/primitives/glyph";

<GlassButton
  label="Purge 1"
  variant="danger"
  onPress={purgeCard}
/>`,
    },
    {
      label: "Purple accent",
      note: "Use the purple soft-wash accent for primary and commit actions. A numerical essence cost follows the label after a centered dot.",
      code: `<GlassButton
  label="Transfigure"
  essenceCost={20}
  variant="accent"
  placement="onGlass"
  onPress={transfigure}
/>`,
    },
    {
      label: "Essence cost",
      note: "Every numerical Essence cost uses the centered-dot treatment.",
      code: `<GlassButton
  label="Choose"
  accessibilityLabel="Choose the Six Gate for 50 Essence"
  essenceCost={50}
  variant="accent"
  onPress={chooseGate}
/>`,
    },
    {
      label: "Essence value",
      note: "Use the plain Essence value treatment when the amount describes the action rather than a cost; it carries no punctuation.",
      code: `<GlassButton
  label="Take"
  essenceValue={60}
  onPress={takePrize}
/>`,
    },
    {
      label: "Prominent primary action",
      note: "Use the prominent size for a singular primary action that anchors a spacious screen.",
      code: `<GlassButton
  label="Begin"
  size="prominent"
  variant="accent"
  onPress={begin}
/>`,
    },
    {
      label: "Compact parallel action",
      note: "Use the compact label scale and horizontal spacing when several actions must remain separate in a narrow row. The touch target stays 42px tall.",
      code: `<GlassButton
  label="Choose"
  essenceCost={50}
  size="compact"
  onPress={chooseGate}
/>`,
    },
    {
      label: "Stable dynamic width",
      note: "Pass every reachable label/essence-cost state through `widthReservations` when one action changes copy. The hidden sizing grid holds the widest intrinsic footprint while only the current state remains visible.",
      code: `<GlassButton
  label={selectedCount === 0 ? "Decline" : \`Purge \${selectedCount}\`}
  essenceCost={selectedCount === 0 ? null : totalCost}
  widthReservations={possibleActions}
  onPress={commit}
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      label: "Transfigure",
      essenceCost: 20,
      withGlyph: false,
      variant: "accent",
      placement: "onMedia",
      size: "standard",
      disabled: false,
      pressed: false,
    },
  },
};
