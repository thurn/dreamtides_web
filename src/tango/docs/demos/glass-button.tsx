// Registry demo entry for GlassButton — see icon-button.tsx for the
// controlled-wrapper recipe this follows. GlassButton takes an `onPress`
// callback and an optional `glyph` that a generated control panel can't model,
// so `Component` here is a small wrapper that supplies a no-op press handler and
// maps a `withGlyph` toggle to a fixed sort glyph, while forwarding the `label`
// + `disabled` controls to the real component. `docName` still points at
// GlassButton so the props table stays accurate to its actual API.

import {
  GlassButton,
  type GlassButtonVariant,
} from "../../components/controls/GlassButton";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import { GLYPHS } from "../../primitives/glyph";
import type { TangoComponent } from "../registry";

interface GlassButtonDemoArgs {
  label?: string;
  withGlyph?: boolean;
  variant?: GlassButtonVariant;
  placement?: GlassControlPlacement;
  disabled?: boolean;
}

/**
 * Wraps GlassButton with a no-op press handler and a `withGlyph` toggle (which
 * supplies a fixed sort glyph) so the demo stage is interactive (the control
 * still compresses on press / enlarges on hover) while the `label` and
 * `disabled` controls flow through from the generated control panel.
 */
function GlassButtonDemo({
  label = "Sort",
  withGlyph = false,
  variant = "default",
  placement = "onMedia",
  disabled = false,
}: GlassButtonDemoArgs) {
  return (
    <GlassButton
      label={label}
      glyph={withGlyph ? GLYPHS.sort : undefined}
      variant={variant}
      placement={placement}
      disabled={disabled}
      onPress={() => {}}
    />
  );
}

export const glassButtonDemo: TangoComponent = {
  id: "glass-button",
  title: "Glass Button",
  blurb:
    "The labeled glass action — a text label in the control typography on the shared liquid-glass surface, with neutral, danger, and purple accent treatments plus placement-aware recipes for media or an existing glass surface.",
  callout:
    "Use neutral glass for secondary actions and purple accent glass for a primary action that must remain materially related to its neutral sibling. Danger uses the same soft-wash material recipe in red, keeping destructive actions in the same family.",
  group: "Components",
  docName: "GlassButton",
  Component: GlassButtonDemo,
  usage: [
    {
      note: "A plain text label on the glass surface. `label` is a resolved string; `onPress` fires on activation.",
      code: `import { GlassButton } from "src/tango/components/controls/GlassButton";

<GlassButton label="Reset filters" onPress={resetFilters} />`,
    },
    {
      label: "Leading glyph",
      note: "A `glyph` paints a leading GlowIcon before the label (e.g. a filled funnel for a filter action).",
      code: `import { GlassButton } from "src/tango/components/controls/GlassButton";
import { GLYPHS } from "src/tango/primitives/glyph";

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
      code: `import { GlassButton } from "src/tango/components/controls/GlassButton";
import { GLYPHS } from "src/tango/primitives/glyph";

<GlassButton
  label="Purge 1"
  variant="danger"
  onPress={purgeCard}
/>`,
    },
    {
      label: "Purple accent",
      note: "Use the purple soft-wash accent for a primary action that should stay materially paired with a neutral glass sibling. A dot separator is centered between the label and a present cost and is omitted with a null cost.",
      code: `<GlassButton
  label="Transfigure"
  cost={40}
  costSeparator="dot"
  variant="accent"
  placement="onGlass"
  onPress={transfigure}
/>`,
    },
    {
      label: "Stable dynamic width",
      note: "Pass every reachable label/cost state through `widthReservations` when one action changes copy. The hidden sizing grid holds the widest intrinsic footprint while only the current state remains visible.",
      code: `<GlassButton
  label={selectedCount === 0 ? "Decline" : \`Purge \${selectedCount}: \`}
  cost={selectedCount === 0 ? null : totalCost}
  widthReservations={possibleActions}
  onPress={commit}
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      label: "Sort",
      withGlyph: false,
      variant: "default",
      placement: "onMedia",
      disabled: false,
    },
  },
};
