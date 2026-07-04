import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  toRepoRelativePosix,
  isAdapterFile,
  isPrimitiveLiteral,
} from "./thin-adapters.js";

describe("toRepoRelativePosix (thin-adapters)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/quest_prototype/src/screens/tango/FooAdapter.tsx",
        "/Users/x/quest_prototype",
      ),
    ).toBe("src/screens/tango/FooAdapter.tsx");
  });
});

describe("isAdapterFile", () => {
  it("matches *Adapter.tsx under src/screens/tango/", () => {
    expect(isAdapterFile("src/screens/tango/AtlasScreenAdapter.tsx")).toBe(true);
  });
  it("ignores the registry, view-model modules, and tests", () => {
    expect(isAdapterFile("src/screens/tango/registry.tsx")).toBe(false);
    expect(isAdapterFile("src/screens/tango/quest-start-view-model.ts")).toBe(
      false,
    );
    expect(
      isAdapterFile("src/screens/tango/QuestStartScreenAdapter.test.tsx"),
    ).toBe(false);
  });
  it("ignores Adapter-named files outside src/screens/tango/", () => {
    expect(isAdapterFile("src/components/FooAdapter.tsx")).toBe(false);
  });
});

describe("isPrimitiveLiteral", () => {
  it("accepts plain literals and negated numbers", () => {
    expect(isPrimitiveLiteral({ type: "Literal", value: 4 })).toBe(true);
    expect(
      isPrimitiveLiteral({
        type: "UnaryExpression",
        operator: "-",
        argument: { type: "Literal", value: 4 },
      }),
    ).toBe(true);
  });
  it("rejects missing initializers and complex expressions", () => {
    expect(isPrimitiveLiteral(null)).toBe(false);
    expect(isPrimitiveLiteral({ type: "ObjectExpression" })).toBe(false);
  });
});

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const ADAPTER = "src/screens/tango/FooScreenAdapter.tsx";

const MINIMAL_ADAPTER = `
import { useQuest } from "../../state/quest-context";
import { buildFooViewModel } from "./foo-view-model";
import { FooScreen } from "../../tango/screens/FooScreen";
export function FooScreenAdapter() {
  const { state } = useQuest();
  return <FooScreen model={buildFooViewModel(state)} />;
}
`;

ruleTester.run("thin-adapters", rule, {
  valid: [
    {
      name: "a wiring-only adapter: imports, one exported component",
      filename: ADAPTER,
      code: MINIMAL_ADAPTER,
    },
    {
      name: "an arrow-function adapter component is fine",
      filename: ADAPTER,
      code: `
import { FooScreen } from "../../tango/screens/FooScreen";
export const FooScreenAdapter = () => <FooScreen />;
`,
    },
    {
      name: "primitive-literal consts and local types are allowed",
      filename: ADAPTER,
      code: `
import { FooScreen } from "../../tango/screens/FooScreen";
const POLL_MS = 250;
type PickHandler = (id: string) => void;
export function FooScreenAdapter() {
  return <FooScreen pollMs={POLL_MS} />;
}
`,
    },
    {
      name: "non-adapter files in the directory are inert",
      filename: "src/screens/tango/registry.tsx",
      code: `export const table = { a: () => 1 };`,
    },
    {
      name: "view-model modules are inert (helpers belong there)",
      filename: "src/screens/tango/foo-view-model.ts",
      code: `export function buildFooViewModel(x: number) { return { x }; }`,
    },
    {
      name: "files outside src/screens/tango are inert",
      filename: "src/components/FooAdapter.tsx",
      code: `export const helper = () => 1; export function FooAdapter() { return null; }`,
    },
  ],
  invalid: [
    {
      name: "importing a Tango component (only src/tango/screens/ is allowed)",
      filename: ADAPTER,
      code: `
import type { Tide } from "../../tango/components/hud/TidePill";
import { FooScreen } from "../../tango/screens/FooScreen";
export function FooScreenAdapter() {
  return <FooScreen />;
}
`,
      errors: [{ messageId: "tangoImport" }],
    },
    {
      name: "a module-level helper function is logic that belongs in the view-model module",
      filename: ADAPTER,
      code: `
import { FooScreen } from "../../tango/screens/FooScreen";
function capItems(items: string[]) { return items.slice(0, 4); }
export function FooScreenAdapter() {
  return <FooScreen items={capItems([])} />;
}
`,
      errors: [{ messageId: "moduleLogic" }],
    },
    {
      name: "a module-level mapping table (non-literal const) is logic",
      filename: ADAPTER,
      code: `
import { FooScreen } from "../../tango/screens/FooScreen";
const COLOR_MAP = { purple: "shadow" };
export function FooScreenAdapter() {
  return <FooScreen map={COLOR_MAP} />;
}
`,
      errors: [{ messageId: "moduleLogic" }],
    },
    {
      name: "exporting a helper alongside the component",
      filename: ADAPTER,
      code: `
import { FooScreen } from "../../tango/screens/FooScreen";
export function capItems(items: string[]) { return items.slice(0, 4); }
export function FooScreenAdapter() {
  return <FooScreen />;
}
`,
      errors: [{ messageId: "extraExport" }],
    },
    {
      name: "exporting a type (view types live on the screen, builder types on the builder)",
      filename: ADAPTER,
      code: `
import { FooScreen } from "../../tango/screens/FooScreen";
export interface FooView { id: string }
export function FooScreenAdapter() {
  return <FooScreen />;
}
`,
      errors: [{ messageId: "extraExport" }],
    },
    {
      name: "default-exporting the component",
      filename: ADAPTER,
      code: `
import { FooScreen } from "../../tango/screens/FooScreen";
export default function FooScreenAdapter() {
  return <FooScreen />;
}
`,
      errors: [{ messageId: "missingComponent" }, { messageId: "defaultExport" }],
    },
    {
      name: "a file with no exported *Adapter component",
      filename: ADAPTER,
      code: `
import { FooScreen } from "../../tango/screens/FooScreen";
export function FooScreenBridge() {
  return <FooScreen />;
}
`,
      errors: [{ messageId: "missingComponent" }, { messageId: "extraExport" }],
    },
  ],
});
