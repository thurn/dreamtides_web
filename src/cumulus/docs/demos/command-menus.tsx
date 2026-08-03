import { useState } from "react";
import { CornerUtilityMenu, ContextActionMenu, type CommandMenuItem } from "../../components/overlay/CommandMenus";
import { GlassButton } from "../../components/controls/GlassButton";
import { GLYPHS } from "../../primitives/glyph";
import type { CumulusComponent } from "../registry";

const demoActions: readonly CommandMenuItem[] = [
  { kind: "action", id: "save", label: "Save Journey", glyph: GLYPHS.check, onCommand: () => undefined },
  { kind: "group", id: "saved", label: "Saved Journeys", glyph: GLYPHS.chevronRight, actions: [
    { kind: "action", id: "load", label: "Load Firstlight", glyph: GLYPHS.arrowRight, onCommand: () => undefined },
  ] },
];

const contextDemoActions: readonly CommandMenuItem[] = [
  ...demoActions,
  {
    kind: "group",
    id: "spark",
    label: "Add Spark",
    glyph: GLYPHS.edit,
    actions: [{
      kind: "signed-integer",
      id: "spark-amount",
      label: "Amount",
      placeholder: "+3 or -2",
      commitLabel: "Apply",
      onCommand: () => undefined,
    }],
  },
];

function CommandMenusDemo() {
  const [count, setCount] = useState(0);
  const actions = demoActions.map((action) => action.kind === "action"
    ? { ...action, onCommand: () => setCount((value) => value + 1) }
    : action);
  return <CornerUtilityMenu trigger={{ glyph: GLYPHS.gear, label: `Open utilities (${String(count)} commands)`, corner: "topEnd" }} actions={actions} />;
}

export const commandMenusDemo: CumulusComponent = {
  id: "corner-utility-menu",
  title: "Corner Utility Menu",
  blurb: "The strict app-chrome command offering: a fixed icon trigger and a hierarchical inward-opening utility menu.",
  callout: "Use this for fixed journey chrome. Use ContextActionMenu for an activated card or pointer target, Select for compact value choice, DisclosureSection for reading flow, and InfoCard for entity reveals rather than commands.",
  group: "Components",
  docName: "CornerUtilityMenu",
  Component: CommandMenusDemo,
  usage: [{
    note: "Actions carry stable IDs, named glyphs, semantic state, callbacks, and typed nested groups; menu focus, collision handling, material, and responsive presentation belong to Cumulus.",
    code: `import { CornerUtilityMenu } from "src/cumulus/components/overlay/CommandMenus";
import { GLYPHS } from "src/cumulus/primitives/glyph";

<CornerUtilityMenu
  trigger={{ glyph: GLYPHS.gear, label: "Open journey utilities", corner: "topEnd" }}
  actions={utilityActions}
/>`,
  }],
  demo: { defaultArgs: {} },
};

function ContextActionMenuDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <GlassButton label="Open card actions" onPress={() => setOpen(true)} />
      {open && <ContextActionMenu title="Demo Card" subtitle="Player · Hand" actions={contextDemoActions} anchor={{ kind: "point", x: 160, y: 160 }} onDismiss={() => setOpen(false)} />}
    </>
  );
}

export const contextActionMenuDemo: CumulusComponent = {
  id: "context-action-menu",
  title: "Context Action Menu",
  blurb: "The strict pointer/card command offering: a clamped desktop context menu and a responsive dialog sheet with the same typed hierarchy.",
  callout: "Use this for card and pointer actions. Cumulus owns focus, keyboard navigation, submenu behavior, outside/Escape dismissal, material, collision handling, and the narrow dialog presentation.",
  group: "Components",
  docName: "ContextActionMenu",
  Component: ContextActionMenuDemo,
  usage: [{
    note: "Pass an activation point or source rectangle and typed commands. Nested signed-integer fields validate and commit non-zero whole-number adjustments. The component chooses the pointer menu or mobile dialog treatment.",
    code: `import { ContextActionMenu } from "src/cumulus/components/overlay/CommandMenus";

<ContextActionMenu
  title="Card actions"
  actions={cardActions}
  anchor={{ kind: "point", x: event.clientX, y: event.clientY }}
  onDismiss={closeMenu}
/>`,
  }],
  demo: { defaultArgs: {} },
};
