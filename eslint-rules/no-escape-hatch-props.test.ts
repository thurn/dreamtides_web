import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  toRepoRelativePosix,
  isDomAttributeTypeName,
  isReactNodeType,
} from "./no-escape-hatch-props.js";

describe("toRepoRelativePosix (no-escape-hatch-props)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/quest_prototype/src/cumulus/components/Button.tsx",
        "/Users/x/quest_prototype",
      ),
    ).toBe("src/cumulus/components/Button.tsx");
  });
});

describe("isDomAttributeTypeName (no-escape-hatch-props)", () => {
  it("matches the HTML/SVG attribute grab-bags", () => {
    for (const name of [
      "HTMLAttributes",
      "ButtonHTMLAttributes",
      "AnchorHTMLAttributes",
      "SVGProps",
      "ComponentPropsWithoutRef",
      "DetailedHTMLProps",
      "IntrinsicElements",
    ]) {
      expect(isDomAttributeTypeName(name)).toBe(true);
    }
  });

  it("does not match ordinary or Cumulus prop type names", () => {
    for (const name of ["ButtonProps", "CSSProperties", "ReactNode", "string"]) {
      expect(isDomAttributeTypeName(name)).toBe(false);
    }
  });
});

describe("isReactNodeType (no-escape-hatch-props)", () => {
  // Parse a `type X = <T>;` snippet and hand back the aliased type node.
  function typeNodeOf(source: string): unknown {
    const program = tsParser.parse(`type X = ${source};`, {
      ecmaVersion: 2022,
      sourceType: "module",
    }) as unknown as {
      body: Array<{ type: string; typeAnnotation: unknown }>;
    };
    const decl = program.body.find((n) => n.type === "TSTypeAliasDeclaration");
    return decl?.typeAnnotation;
  }

  it("matches the React-node family, its unions and arrays", () => {
    for (const t of [
      "ReactNode",
      "React.ReactNode",
      "ReactElement",
      "JSX.Element",
      "ReactNode | undefined",
      "ReactNode | ((ctx: C) => ReactNode)",
      "ReactNode[]",
    ]) {
      expect(isReactNodeType(typeNodeOf(t))).toBe(true);
    }
  });

  it("does not match strict models or a render-prop callback", () => {
    for (const t of [
      "string",
      "RichText",
      '"sm" | "md"',
      "(ctx: C) => ReactNode",
      "CardData",
    ]) {
      expect(isReactNodeType(typeNodeOf(t))).toBe(false);
    }
  });
});

// RuleTester in ESLint 9 exposes `describe`/`it` hooks; wire them to vitest so
// each RuleTester case shows up as an individual vitest test.
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const COMPONENT = "src/cumulus/components/Widget.tsx";

ruleTester.run("no-escape-hatch-props", rule, {
  valid: [
    {
      name: "a strict enumerated + data API (no node slots)",
      filename: COMPONENT,
      code: `interface WidgetProps { size?: "sm" | "md"; label: string; onClick?: () => void; }`,
    },
    {
      name: "a render prop returning a node is not a raw node slot",
      filename: COMPONENT,
      code: `interface WidgetProps { renderIcon?: (ctx: Ctx) => ReactNode; }`,
    },
    {
      name: "a container in the allowlist may take children",
      filename: "src/cumulus/components/GroupPanel.tsx",
      code: `interface GroupPanelProps { size?: "sm" | "md"; children?: React.ReactNode; }`,
    },
    {
      name: "a single named data value (accent color) is fine",
      filename: COMPONENT,
      code: `interface WidgetProps { discAccent?: string; }`,
    },
    {
      name: "internal CSSProperties locals/helpers are not the public API",
      filename: COMPONENT,
      code: `const shell: CSSProperties = { color: "red" }; function disc(a: string): React.CSSProperties { return { color: a }; }`,
    },
    {
      name: "style/className on a non-Props type is not flagged",
      filename: COMPONENT,
      code: `interface InternalStyleBag { style?: React.CSSProperties; className?: string; }`,
    },
    {
      name: "type alias Props with only strict members",
      filename: COMPONENT,
      code: `type WidgetProps = { variant?: "a" | "b"; label: string };`,
    },
    {
      name: "outside the design-system surface: rule is inert",
      filename: "src/screens/DraftSiteScreen.tsx",
      code: `interface RowProps { style?: React.CSSProperties; className?: string; [k: string]: unknown; }`,
    },
    {
      name: "a strict screen-local *Props is fine",
      filename: "src/cumulus/screens/HomeScreen.tsx",
      code: `interface RowProps { label: string; onSelect?: () => void; }`,
    },
    {
      name: "cumulus docs/mockups are not the component surface",
      filename: "src/cumulus/docs/mockups/scene.tsx",
      code: `interface DemoProps { style?: React.CSSProperties; }`,
    },
    {
      name: "primitives are transparent mechanisms — they may forward DOM props",
      filename: "src/cumulus/primitives/Pressable.tsx",
      code: `interface PressableProps extends React.HTMLAttributes<HTMLElement> { as?: React.ElementType; }`,
    },
  ],
  invalid: [
    {
      name: "style member on a *Props interface (caught by name)",
      filename: COMPONENT,
      code: `interface WidgetProps { style?: React.CSSProperties; }`,
      errors: [{ messageId: "styleMember" }],
    },
    {
      name: "className member on a *Props interface",
      filename: COMPONENT,
      code: `interface WidgetProps { className?: string; }`,
      errors: [{ messageId: "styleMember" }],
    },
    {
      name: "CSSProperties passthrough under a different name",
      filename: COMPONENT,
      code: `interface WidgetProps { discStyle?: React.CSSProperties; }`,
      errors: [{ messageId: "cssPropertiesMember" }],
    },
    {
      name: "extends a DOM-attribute grab-bag",
      filename: COMPONENT,
      code: `interface WidgetProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { size?: "sm"; }`,
      errors: [{ messageId: "domAttributesHeritage" }],
    },
    {
      name: "index signature accepts arbitrary keys",
      filename: COMPONENT,
      code: `interface WidgetProps { [key: string]: unknown; }`,
      errors: [{ messageId: "indexSignature" }],
    },
    {
      name: "type alias intersecting HTMLAttributes",
      filename: COMPONENT,
      code: `type WidgetProps = { size?: "sm" } & React.HTMLAttributes<HTMLDivElement>;`,
      errors: [{ messageId: "domAttributesHeritage" }],
    },
    {
      name: "children on a non-container component is a raw content slot",
      filename: COMPONENT,
      code: `interface WidgetProps { children?: React.ReactNode; }`,
      errors: [{ messageId: "childrenProp" }],
    },
    {
      name: "a ReactNode-typed slot on a non-container component",
      filename: COMPONENT,
      code: `interface WidgetProps { value: ReactNode; sub?: ReactNode; }`,
      errors: [{ messageId: "reactNodeProp" }, { messageId: "reactNodeProp" }],
    },
    {
      name: "a JSX.Element slot on a non-container component",
      filename: COMPONENT,
      code: `interface WidgetProps { icon: JSX.Element; }`,
      errors: [{ messageId: "reactNodeProp" }],
    },
    {
      name: "a container name outside the allowlist gets no exemption",
      filename: COMPONENT,
      code: `interface CardShellProps { children?: ReactNode; }`,
      errors: [{ messageId: "childrenProp" }],
    },
    {
      name: "style ban still applies to an allowlisted container",
      filename: "src/cumulus/components/GroupPanel.tsx",
      code: `interface GroupPanelProps { children?: ReactNode; style?: React.CSSProperties; }`,
      errors: [{ messageId: "styleMember" }],
    },
    {
      name: "a screen-local *Props escape hatch is now caught too",
      filename: "src/cumulus/screens/HomeScreen.tsx",
      code: `interface RowProps { style?: React.CSSProperties; }`,
      errors: [{ messageId: "styleMember" }],
    },
  ],
});
