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
      name: "named components keep semantic activation handlers",
      filename: "src/tango/screens/DraftScreen.tsx",
      code: `import { GameCard } from "../components/card/CardView";
        <GameCard model={model} onActivate={() => select(model.cardId)} />;`,
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
      name: "transfiguration form owns its semantic reveal and identity",
      filename:
        "src/tango/components/controls/TransfigurationFormButton.tsx",
      code: `import { useRevealSource } from "../../internal/reveal/context";
        import { revealEntityId } from "../../internal/reveal/identity";
        const binding = useRevealSource({ identity: { entityType: "transfiguration-form", entityId: revealEntityId("transfiguration-form", id) }, spec });`,
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
      code: `import type { GameCardProps } from "../../components/card/CardView";
        function Demo(props: Omit<GameCardProps, "testId">) {
        return <GameCard {...props} testId="demo" />;
      }`,
    },
    {
      name: "direct and literal Pick component-owned prop types prove spreads safe",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `import type { GameCardProps } from "../../components/card/CardView";
        function Direct(props: GameCardProps) { return <GameCard {...props} />; }
        function Picked(props: Pick<GameCardProps, "model" | "selected">) {
          return <GameCard {...props} />;
        }`,
    },
    {
      name: "named component import aliases preserve approved typed spreads",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `import { GameCard as GC } from "../../components/card/CardView";
        import type { GameCardProps } from "../../components/card/CardView";
        const Alias = GC;
        function Demo(props: GameCardProps) { return <Alias {...props} />; }`,
    },
    {
      name: "unrelated local component aliases remain outside the reveal boundary",
      filename: "src/editor/Article.tsx",
      code: `const GC = Article; const props = getProps(); <GC {...props} />;`,
    },
    {
      name: "non-static and external template dynamic imports stay legal",
      filename: "src/editor/Article.tsx",
      code: "void import(`./article-${kind}`); void import(`react-dom`);",
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
      name: "named components reject arbitrary hover and press reveal handlers",
      filename: "src/battle/components/BattlefieldGrid.tsx",
      code: `import { BattleGameCard } from "./BattleGameCard";
        <BattleGameCard instance={card} onMouseEnter={openPreview} onMouseMove={movePreview}
          onMouseLeave={closePreview} onPointerDown={showDetails} onPointerUp={hideDetails} />;`,
      errors: [
        { messageId: "interactionEscape" },
        { messageId: "interactionEscape" },
        { messageId: "interactionEscape" },
        { messageId: "interactionEscape" },
        { messageId: "interactionEscape" },
      ],
    },
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
      name: "approved nested parameters do not make opaque outer parameters safe",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `import { GameCard } from "../../components/card/CardView";
        import type { GameCardProps } from "../../components/card/CardView";
        function Outer(props: any) {
          function Inner(props: GameCardProps) { return <GameCard {...props} />; }
          return <><Inner /><GameCard {...props} /></>;
        }`,
      errors: [{ messageId: "opaqueSpread", line: 5 }],
    },
    {
      name: "opaque nested parameters do not erase approved outer parameters",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `import { GameCard } from "../../components/card/CardView";
        import type { GameCardProps } from "../../components/card/CardView";
        function Outer(props: GameCardProps) {
          function Inner(props: any) { return <GameCard {...props} />; }
          return <><Inner /><GameCard {...props} /></>;
        }`,
      errors: [{ messageId: "opaqueSpread", line: 4 }],
    },
    {
      name: "generic type parameters cannot impersonate approved prop imports",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `import { GameCard } from "../../components/card/CardView";
        import type { GameCardProps } from "../../components/card/CardView";
        function Demo<GameCardProps>(props: GameCardProps) {
          return <GameCard {...props} />;
        }`,
      errors: [{ messageId: "opaqueSpread" }],
    },
    {
      name: "opaque spreads through named component import aliases are forbidden",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `import { GameCard as GC } from "../../components/card/CardView";
        function Demo(props: any) { return <GC {...props} />; }`,
      errors: [{ messageId: "opaqueSpread" }],
    },
    {
      name: "opaque spreads through local named component aliases are forbidden",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `import { GameCard as GC } from "../../components/card/CardView";
        const Alias = GC;
        function Demo(props: any) { return <Alias {...props} />; }`,
      errors: [{ messageId: "opaqueSpread" }],
    },
    {
      name: "intersections cannot extend approved component props",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `import type { GameCardProps } from "../../components/card/CardView";
        function Demo(props: GameCardProps & { anchorRect: DOMRect }) {
          return <GameCard {...props} />;
        }`,
      errors: [{ messageId: "opaqueSpread" }],
    },
    {
      name: "unions cannot extend approved component props",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `import type { GameCardProps } from "../../components/card/CardView";
        function Demo(props: GameCardProps | { shown: boolean }) {
          return <GameCard {...props} />;
        }`,
      errors: [{ messageId: "opaqueSpread" }],
    },
    {
      name: "unrelated imported lookalike prop types do not prove safety",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `import type { GameCardProps } from "../../unrelated/CardTypes";
        function Demo(props: GameCardProps) { return <GameCard {...props} />; }`,
      errors: [{ messageId: "opaqueSpread" }],
    },
    {
      name: "local lookalike prop types do not prove safety",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `interface GameCardProps { model: unknown; anchorRect: DOMRect }
        function Demo(props: GameCardProps) { return <GameCard {...props} />; }`,
      errors: [{ messageId: "mechanicalProp" }, { messageId: "opaqueSpread" }],
    },
    {
      name: "unknown aliases of approved prop types do not prove safety",
      filename: "src/tango/docs/demos/game-card.tsx",
      code: `import type { GameCardProps } from "../../components/card/CardView";
        type WrappedProps = GameCardProps;
        function Demo(props: WrappedProps) { return <GameCard {...props} />; }`,
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
      name: "product code cannot dynamically import reveal internals with a static template",
      filename: "src/components/reveal.ts",
      code: "void import(`../tango/internal/reveal/model`);",
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
