// Registry demo entry for IconButton — see segmented-control.tsx for the
// controlled-wrapper recipe this follows. IconButton takes a `glyph` and an
// `onPress` callback that a generated control panel can't model, so `Component`
// here is a small wrapper that supplies a fixed close glyph and a no-op press
// handler while forwarding the `size` + `disabled` controls to the real
// component. `docName` still points at IconButton so the props table stays
// accurate to its actual API.

import { assertLocalized } from "@trox/runtime";
import {
  IconButton,
  type IconButtonSize,
} from "../../components/controls/IconButton";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import { GLYPHS } from "../../primitives/glyph";
import type { CumulusComponent } from "../registry";

interface IconButtonDemoArgs {
  size?: IconButtonSize;
  placement?: GlassControlPlacement;
  disabled?: boolean;
}

/**
 * Wraps IconButton with a fixed close glyph and a no-op press handler so the
 * demo stage is interactive (the disc still compresses on press / enlarges on
 * hover) while the `size` and `disabled` controls flow through from the
 * generated control panel.
 */
function IconButtonDemo({
  size = "md",
  placement = "onMedia",
  disabled = false,
}: IconButtonDemoArgs) {
  return (
    <IconButton
      glyph={GLYPHS.close}
      size={size}
      placement={placement}
      disabled={disabled}
      label={assertLocalized("Close")}
      onPress={() => {}}
    />
  );
}

export const iconButtonDemo: CumulusComponent = {
  id: "icon-button",
  title: "Icon Button",
  blurb:
    "The compact glyph-only glass disc, with placement-aware recipes for scene media or an existing glass surface, and made fully round so it reads as one family with the filter/sort controls.",
  callout:
    "Use GlassButton for labeled actions, IconButton for compact corner actions, and a bare Pressable glyph for the lightest inline affordance.",
  group: "Components",
  docName: "IconButton",
  Component: IconButtonDemo,
  usage: [
    {
      note: "The default disc: `md` (48px) with a centered glyph. `label` is its accessible name — the disc shows only its glyph.",
      code: `import { IconButton } from "src/cumulus/components/controls/IconButton";
import { GLYPHS } from "src/cumulus/primitives/glyph";

<IconButton glyph={GLYPHS.close} label="Close deck" onPress={closeViewer} />`,
    },
    {
      label: "On glass",
      note: 'Use `placement="onGlass"` for a disc nested inside a glass panel.',
      code: `<IconButton
  glyph={GLYPHS.close}
  label="Close deck"
  placement="onGlass"
  onPress={closeViewer}
/>`,
    },
    {
      label: "Small",
      note: '`size="sm"` is the 40px disc, for a tighter corner cluster.',
      code: `<IconButton
  size="sm"
  glyph={GLYPHS.close}
  label="Close deck"
  onPress={closeViewer}
/>`,
    },
    {
      label: "Centered overlay",
      note: "Use `overlayGlyph` for one smaller semantic mark superimposed within the primary glyph.",
      code: `<IconButton
  glyph={GLYPHS.refresh}
  overlayGlyph={GLYPHS.bug}
  label="Reroll offers"
  onPress={rerollOffers}
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      size: "md",
      placement: "onMedia",
      disabled: false,
    },
  },
};
