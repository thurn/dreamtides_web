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
    {
      name: "ordinary layout and content props are not reveal APIs",
      filename: "src/editor/Article.tsx",
      code: `interface ArticleProps { content: ReactNode; open: boolean }
        const createPortal = (value: unknown) => value;
        <><Stack gap={8} /><Article content={body} open={open} /></>; createPortal(body);`,
    },
    {
      name: "approved named component imports the exact coordinator relationship",
      filename: "src/tango/components/card/CardView.tsx",
      code: `import { useRevealSource } from "../../internal/reveal/context";
        const binding = useRevealSource(registration);`,
    },
    {
      name: "explicitly approved non-reveal portal owner stays legal",
      filename: "src/tango/components/controls/Select.tsx",
      code: `import { createPortal as mountPortal } from "react-dom";
        mountPortal(<div />, document.body);`,
    },
    {
      name: "benign named-component object spreads stay legal",
      filename: "src/tango/screens/DraftScreen.tsx",
      code: `const selectedProps = { selected: true };
        <><GameCard {...{ selected: true, unavailable: false }} /><GameCard {...selectedProps} /></>;`,
    },
    {
      name: "component-owned prop types prove a named spread safe",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `function Demo(props: Omit<GameCardProps, "testId">) {
        return <GameCard {...props} testId="demo" />;
      }`,
    },
    {
      name: "computed non-portal namespace members stay legal",
      filename: "src/editor/LegacyRoot.tsx",
      code: `import * as DOM from "react-dom"; DOM["flushSync"](() => render());`,
    },
    {
      name: "InfoCard aliases may use ordinary visual statics",
      filename: "src/editor/InfoPreview.tsx",
      code: `import { InfoCard } from "../tango/components/overlay/InfoCard";
        const IC = InfoCard; IC.displayName;`,
    },
    {
      name: "opaque spreads stay legal on ordinary components",
      filename: "src/editor/Article.tsx",
      code: `const props = getProps(); <Article {...props} />;`,
    },
    {
      name: "non-internal re-exports and dynamic imports stay legal",
      filename: "src/editor/Article.tsx",
      code: `export { renderArticle } from "./renderArticle";
        export * from "./article-types";
        void import("./article-preview");`,
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
      name: "an arbitrary Tango component cannot reach into reveal internals",
      filename: "src/tango/components/card/Widget.tsx",
      code: `import { useRevealSource } from "../../internal/reveal/context";`,
      errors: [{ messageId: "internalImport" }],
    },
    {
      name: "repo-absolute internal imports are forbidden",
      filename: "src/tango/screens/DraftScreen.tsx",
      code: `import { useRevealSource } from "src/tango/internal/reveal/context";`,
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
      name: "aliased InfoCard interaction statics are forbidden",
      filename: "src/components/Legacy.tsx",
      code: `import { InfoCard as IC } from "../tango/components/overlay/InfoCard";
        IC.PressInfo; const { usePressReveal } = IC;`,
      errors: [{ messageId: "infoCardStatic" }, { messageId: "infoCardStatic" }],
    },
    {
      name: "indirect InfoCard binding aliases preserve the visual-only boundary",
      filename: "src/components/Legacy.tsx",
      code: `import { InfoCard } from "../tango/components/overlay/InfoCard";
        const IC = InfoCard; const IC2 = IC; IC2.PressInfo;`,
      errors: [{ messageId: "infoCardStatic" }],
    },
    {
      name: "the retired generic popover is forbidden",
      filename: "src/debug/Tool.tsx",
      code: `import { HoverPopover } from "../tango/components/overlay/HoverPopover";
        <HoverPopover content={content}>{child}</HoverPopover>;`,
      errors: [{ messageId: "genericWrapper" }, { messageId: "genericWrapper" }, { messageId: "arbitraryContent" }],
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
      code: `import { createPortal } from "react-dom";
        createPortal(<InfoCard variant="text" title="Help" />, document.body);`,
      errors: [{ messageId: "directPortal" }],
    },
    {
      name: "aliased react-dom portals are forbidden regardless of content",
      filename: "src/journey_v2/ui/Thing.tsx",
      code: `import { createPortal as mountLayer } from "react-dom";
        const indirect = mountLayer; indirect(<div>{content}</div>, document.body);`,
      errors: [{ messageId: "directPortal" }],
    },
    {
      name: "ReactDOM member-expression portals are forbidden",
      filename: "src/screens/Thing.tsx",
      code: `import * as DOM from "react-dom";
        DOM.createPortal(<InfoCard variant="text" title="Help" />, document.body);`,
      errors: [{ messageId: "directPortal" }],
    },
    {
      name: "computed ReactDOM portal members are forbidden",
      filename: "src/screens/Thing.tsx",
      code: `import * as DOM from "react-dom";
        DOM["createPortal"](<GameCard model={model} />, document.body);`,
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
      name: "statically knowable JSX object spreads cannot hide reveal mechanics",
      filename: "src/tango/screens/ShopScreen.tsx",
      code: `<GameCard {...{ anchorRect, shown: true }} model={model} />;`,
      errors: [{ messageId: "mechanicalProp" }, { messageId: "controlledState" }],
    },
    {
      name: "const object JSX spreads cannot hide reveal mechanics",
      filename: "src/tango/screens/ShopScreen.tsx",
      code: `const escaped = { anchorRect, shown: true };
        <GameCard {...escaped} model={model} />;`,
      errors: [{ messageId: "mechanicalProp" }, { messageId: "controlledState" }],
    },
    {
      name: "opaque call-result spreads are forbidden on named reveal components",
      filename: "src/tango/screens/ShopScreen.tsx",
      code: `const escaped = getProps(); <GameCard {...escaped} model={model} />;`,
      errors: [{ messageId: "opaqueSpread" }],
    },
    {
      name: "opaque parameter spreads are forbidden on named reveal components",
      filename: "src/tango/screens/ShopScreen.tsx",
      code: `function Wrapper(props: any) { return <GameCard {...props} model={model} />; }`,
      errors: [{ messageId: "opaqueSpread" }],
    },
    {
      name: "opaque parameters shadow earlier statically safe bindings",
      filename: "src/tango/screens/ShopScreen.tsx",
      code: `const props = { selected: true };
        function Wrapper(props: any) { return <GameCard {...props} model={model} />; }`,
      errors: [{ messageId: "opaqueSpread" }],
    },
    {
      name: "product code cannot re-export internal reveal symbols",
      filename: "src/components/reveal.ts",
      code: `export { useRevealSource } from "../tango/internal/reveal/context";`,
      errors: [{ messageId: "internalImport" }],
    },
    {
      name: "product code cannot wildcard re-export reveal internals",
      filename: "src/components/reveal.ts",
      code: `export * from "../tango/internal/reveal/model";`,
      errors: [{ messageId: "internalImport" }],
    },
    {
      name: "product code cannot dynamically import reveal internals",
      filename: "src/components/reveal.ts",
      code: `void import("../tango/internal/reveal/model");`,
      errors: [{ messageId: "internalImport" }],
    },
    {
      name: "public reveal specs are forbidden",
      filename: "src/editor/TideSourcePreview.tsx",
      code: `interface EntityProps { revealSpec: RevealSpec; }`,
      errors: [{ messageId: "publicSpec" }, { messageId: "publicSpec" }],
    },
    {
      name: "renamed wrapper API is rejected structurally",
      filename: "src/debug/Thing.tsx",
      code: `interface FloatingDetailsProps { content: ReactNode; anchorRect: DOMRect; gap: number; shown: boolean; open: boolean; delayMs: number }
        const FloatingDetails = (props: FloatingDetailsProps) => <div>{props.content}</div>;`,
      errors: [
        { messageId: "genericWrapper" },
        { messageId: "arbitraryContent" },
        { messageId: "mechanicalProp" },
        { messageId: "mechanicalProp" },
        { messageId: "controlledState" },
        { messageId: "controlledState" },
        { messageId: "mechanicalProp" },
      ],
    },
    {
      name: "renamed JSX wrapper props are rejected structurally",
      filename: "src/screens/Thing.tsx",
      code: `<FloatingDetails content={node} anchorRect={rect} gap={10} shown={shown} open={open} delayMs={30} />;`,
      errors: [
        { messageId: "arbitraryContent" },
        { messageId: "mechanicalProp" },
        { messageId: "mechanicalProp" },
        { messageId: "controlledState" },
        { messageId: "controlledState" },
        { messageId: "mechanicalProp" },
      ],
    },
    {
      name: "arrow wrapper destructuring mechanical props is rejected",
      filename: "src/editor/Thing.tsx",
      code: `const FloatingDetails = ({ content, anchorRect, shown, delayMs }) => <div>{content}</div>;`,
      errors: [{ messageId: "genericWrapper" }],
    },
  ],
});
