// Registry demo entry for GlassButton — see icon-button.tsx for the
// controlled-wrapper recipe this follows. GlassButton takes an `onPress`
// callback and an optional `glyph` that a generated control panel can't model,
// so `Component` here is a small wrapper that supplies a no-op press handler and
// maps a `withGlyph` toggle to a fixed sort glyph, while forwarding the `label`
// + `disabled` controls to the real component. `docName` still points at
// GlassButton so the props table stays accurate to its actual API.

import { GlassButton } from "../../components/controls/GlassButton";
import { GLYPHS } from "../../primitives/glyph";
import type { TangoComponent } from "../registry";

interface GlassButtonDemoArgs {
  label?: string;
  withGlyph?: boolean;
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
  disabled = false,
}: GlassButtonDemoArgs) {
  return (
    <GlassButton
      label={label}
      glyph={withGlyph ? GLYPHS.sort : undefined}
      disabled={disabled}
      onPress={() => {}}
    />
  );
}

export const glassButtonDemo: TangoComponent = {
  id: "glass-button",
  title: "Glass Button",
  blurb:
    "The labeled glass secondary action — a text label in the control typography on the shared liquid-glass control surface, with an optional leading glyph. It wears the same material as the Select / SegmentedControl trigger, so a secondary action reads as one family with the filter/sort controls it sits beside.",
  callout:
    "Rung two of the four-rung button suite: the beveled purple Button (commit / primary), THIS labeled glass control (a secondary chrome action), the glyph-only glass IconButton (a corner chrome action), and a bare pressable glyph (the lightest inline affordance). It stays quietly below the purple commit Button it defers to.",
  status: "incubating",
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
  ],
  demo: {
    defaultArgs: {
      label: "Sort",
      withGlyph: false,
      disabled: false,
    },
  },
};
