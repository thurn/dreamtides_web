import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it } from "vitest";
import rule from "./no-entity-reveal-escape-hatches.js";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

tester.run("no-entity-reveal-escape-hatches", rule, {
  valid: [
    {
      name: "named components own semantic reveal content",
      filename: "src/tango/screens/DraftScreen.tsx",
      code: `import { GameCard } from "../components/card/CardView";
        import { GlossaryTerm } from "../components/card/GlossaryTerm";
        <><GameCard model={model} /><GlossaryTerm term="Bane" definition="Discard it." /></>;`,
    },
    {
      name: "the coordinator implementation may use its internal protocol and portal",
      filename: "src/tango/internal/reveal/context.tsx",
      code: `import type { RevealSpec } from "./models";
        import { createPortal } from "react-dom";
        const render = (spec: RevealSpec) => createPortal(<div />, document.body);`,
    },
    {
      name: "internal reveal tests may construct exact fixtures",
      filename: "src/tango/internal/reveal/context.test.tsx",
      code: `import type { RevealSpec } from "./models";
        const spec: RevealSpec = fixture;`,
    },
    {
      name: "ordinary dialog state and portals are unrelated",
      filename: "src/editor/CardTagEditor.tsx",
      code: `const [open, setOpen] = useState(false); <Dialog open={open} />;`,
    },
  ],
  invalid: [
    {
      name: "product code cannot import the internal reveal protocol",
      filename: "src/tango/screens/DraftScreen.tsx",
      code: `import { useRevealSource } from "../internal/reveal/useRevealSource";`,
      errors: [{ messageId: "internalImport" }],
    },
    {
      name: "adapters cannot import the internal reveal protocol",
      filename: "src/screens/tango_adapters/DraftScreenAdapter.tsx",
      code: `import type { RevealSpec } from "../../tango/internal/reveal/models";`,
      errors: [{ messageId: "internalImport" }],
    },
    {
      name: "InfoCard interaction statics are forbidden",
      filename: "src/components/Legacy.tsx",
      code: `InfoCard.PressInfo; InfoCard.PressPopover; InfoCard.usePressReveal; InfoCard.anchorRect;`,
      errors: [
        { messageId: "infoCardStatic" },
        { messageId: "infoCardStatic" },
        { messageId: "infoCardStatic" },
        { messageId: "infoCardStatic" },
      ],
    },
    {
      name: "the retired generic popover is forbidden",
      filename: "src/debug/Tool.tsx",
      code: `import { HoverPopover } from "../tango/components/overlay/HoverPopover";
        <HoverPopover content={content}>{child}</HoverPopover>;`,
      errors: [{ messageId: "genericWrapper" }, { messageId: "genericWrapper" }],
    },
    {
      name: "generic reveal wrappers and arbitrary ReactNode reveal content are forbidden",
      filename: "src/battle/components/Thing.tsx",
      code: `interface RevealPopoverProps { content: ReactNode; children: ReactNode }
        function RevealPopover(props: RevealPopoverProps) { return <>{props.children}</>; }`,
      errors: [
        { messageId: "genericWrapper" },
        { messageId: "arbitraryContent" },
        { messageId: "arbitraryContent" },
        { messageId: "genericWrapper" },
      ],
    },
    {
      name: "product code cannot create a reveal portal directly",
      filename: "src/screens/CardSourceOverlay.tsx",
      code: `createPortal(<InfoCard variant="text" title="Help" />, document.body);`,
      errors: [{ messageId: "directPortal" }],
    },
    {
      name: "mechanical and controlled reveal props are forbidden",
      filename: "src/tango/screens/ShopScreen.tsx",
      code: `<GameCard revealSide="left" revealDelayMs={300} portalTarget={root} anchorRect={rect}
        revealOpen={open} shown={shown} />;`,
      errors: [
        { messageId: "mechanicalProp" },
        { messageId: "mechanicalProp" },
        { messageId: "mechanicalProp" },
        { messageId: "mechanicalProp" },
        { messageId: "controlledState" },
        { messageId: "controlledState" },
      ],
    },
    {
      name: "public reveal specs are forbidden",
      filename: "src/editor/TideSourcePreview.tsx",
      code: `interface EntityProps { revealSpec: RevealSpec; }`,
      errors: [{ messageId: "publicSpec" }, { messageId: "publicSpec" }],
    },
  ],
});
