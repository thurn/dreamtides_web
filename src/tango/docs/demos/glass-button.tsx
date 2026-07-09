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
    "The labeled glass secondary action — a text label in the control typography on the shared liquid-glass control surface, with an optional leading glyph, a danger treatment, and placement-aware recipes for media or an existing glass surface.",
  callout:
    "Rung two of the four-rung button suite: the beveled purple Button (commit / primary), THIS labeled glass control (a secondary chrome action), the glyph-only glass IconButton (a corner chrome action), and a bare pressable glyph (the lightest inline affordance). It stays quietly below the purple commit Button it defers to.",
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
      label: "Danger variant",
      note: 'Use `variant="danger"` for destructive secondary actions that should stay glassy while carrying a red warning rim and glow.',
      code: `import { GlassButton } from "src/tango/components/controls/GlassButton";
import { GLYPHS } from "src/tango/primitives/glyph";

<GlassButton
  label="Purge 1"
  variant="danger"
  onPress={purgeCard}
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
