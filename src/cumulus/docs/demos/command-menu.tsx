import { useState } from "react";
import { CommandMenu, type CommandMenuItem } from "../../components/overlay/CommandMenu";
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

function CommandMenuDemo() {
  const [count, setCount] = useState(0);
  const [contextOpen, setContextOpen] = useState(false);
  const actions = demoActions.map((action) => action.kind === "action"
    ? { ...action, onCommand: () => setCount((value) => value + 1) }
    : action);
  return (
    <>
      <CommandMenu model={{
        kind: "appChrome",
        trigger: {
          glyph: GLYPHS.gear,
          label: `Open app-chrome commands (${String(count)} selected)`,
          corner: "topEnd",
        },
        actions,
      }} />
      <GlassButton label="Open context commands" onPress={() => setContextOpen(true)} />
      {contextOpen && (
        <CommandMenu model={{
          kind: "context",
          title: "Demo Card",
          subtitle: "Player · Hand",
          actions: contextDemoActions,
          anchor: { x: 160, y: 160 },
          onDismiss: () => setContextOpen(false),
        }} />
      )}
    </>
  );
}

export const commandMenuDemo: CumulusComponent = {
  id: "command-menu",
  title: "Command Menu",
  blurb: "The single command offering: one strict model renders fixed app-chrome commands or card and pointer actions through the same typed hierarchy.",
  callout: "Use the appChrome model for journey chrome and the context model for an activated target. Use Select for value choice, DisclosureSection for reading flow, and InfoCard for entity reveals.",
  group: "Components",
  docName: "CommandMenu",
  Component: CommandMenuDemo,
  usage: [
    {
      label: "App chrome",
      note: "The component owns the fixed trigger, safe-area placement, open state, and inward-opening menu.",
      code: `import { CommandMenu } from "src/cumulus/components/overlay/CommandMenu";
import { GLYPHS } from "src/cumulus/primitives/glyph";

<CommandMenu model={{
  kind: "appChrome",
  trigger: {
    glyph: GLYPHS.gear,
    label: "Open journey commands",
    corner: "topEnd",
  },
  actions: utilityActions,
}} />`,
    },
    {
      label: "Activated target",
      note: "The component clamps to the target on desktop and presents the same commands in a dialog on narrow screens.",
      code: `import { CommandMenu } from "src/cumulus/components/overlay/CommandMenu";

<CommandMenu model={{
  kind: "context",
  title: "Card actions",
  actions: cardActions,
  anchor: { x: event.clientX, y: event.clientY },
  onDismiss: closeMenu,
}} />`,
    },
  ],
  demo: { defaultArgs: {} },
};
