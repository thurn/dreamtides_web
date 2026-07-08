// Registry demo entry for IconButton — see segmented-control.tsx for the
// controlled-wrapper recipe this follows. IconButton takes a `glyph` and an
// `onPress` callback that a generated control panel can't model, so `Component`
// here is a small wrapper that supplies a fixed close glyph and a no-op press
// handler while forwarding the `size` + `disabled` controls to the real
// component. `docName` still points at IconButton so the props table stays
// accurate to its actual API.

import { IconButton, type IconButtonSize } from "../../components/controls/IconButton";
import { GLYPHS } from "../../primitives/glyph";
import type { TangoComponent } from "../registry";

interface IconButtonDemoArgs {
  size?: IconButtonSize;
  disabled?: boolean;
}

/**
 * Wraps IconButton with a fixed close glyph and a no-op press handler so the
 * demo stage is interactive (the disc still compresses on press / enlarges on
 * hover) while the `size` and `disabled` controls flow through from the
 * generated control panel.
 */
function IconButtonDemo({ size = "md", disabled = false }: IconButtonDemoArgs) {
  return (
    <IconButton
      glyph={GLYPHS.close}
      size={size}
      disabled={disabled}
      label="Close"
      onPress={() => {}}
    />
  );
}

export const iconButtonDemo: TangoComponent = {
  id: "icon-button",
  title: "Icon Button",
  blurb:
    "The compact glyph-only glass disc — a corner chrome action worn by the deck viewer's close control and the dreamscape menu button. Its surface is the shared liquid-glass control material, made a fully-round disc, so it reads as one family with the filter/sort controls it sits beside.",
  callout:
    "Rung three of the four-rung button suite: the beveled purple Button (commit / primary), a plain pressable text affordance (secondary), THIS glass icon disc (a corner chrome action), and a bare pressable glyph (the lightest inline affordance).",
  group: "Components",
  docName: "IconButton",
  Component: IconButtonDemo,
  usage: [
    {
      note: "The default disc: `md` (48px) with a centered glyph. `label` is its accessible name — the disc shows only its glyph.",
      code: `import { IconButton } from "src/tango/components/controls/IconButton";
import { GLYPHS } from "src/tango/primitives/glyph";

<IconButton glyph={GLYPHS.close} label="Close deck" onPress={closeViewer} />`,
    },
    {
      label: "Small",
      note: "`size=\"sm\"` is the 40px disc, for a tighter corner cluster.",
      code: `<IconButton
  size="sm"
  glyph={GLYPHS.close}
  label="Close deck"
  onPress={closeViewer}
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      size: "md",
      disabled: false,
    },
  },
};
