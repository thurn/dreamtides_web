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
        "/Users/x/journey_prototype/src/screens/cumulus_adapters/FooAdapter.tsx",
        "/Users/x/journey_prototype",
      ),
    ).toBe("src/screens/cumulus_adapters/FooAdapter.tsx");
  });
});

describe("isAdapterFile", () => {
  it("matches *Adapter.tsx under src/screens/cumulus_adapters/", () => {
    expect(isAdapterFile("src/screens/cumulus_adapters/AtlasScreenAdapter.tsx")).toBe(true);
  });
  it("ignores the registry, view-model modules, and tests", () => {
    expect(isAdapterFile("src/screens/cumulus_adapters/registry.tsx")).toBe(false);
    expect(isAdapterFile("src/screens/cumulus_adapters/journey-start-view-model.ts")).toBe(
      false,
    );
    expect(
      isAdapterFile("src/screens/cumulus_adapters/JourneyStartScreenAdapter.test.tsx"),
    ).toBe(false);
  });
  it("ignores Adapter-named files outside src/screens/cumulus_adapters/", () => {
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

const ADAPTER = "src/screens/cumulus_adapters/FooScreenAdapter.tsx";

const MINIMAL_ADAPTER = `
import { useJourney } from "../../state/journey-context";
import { buildFooViewModel } from "./foo-view-model";
import { FooScreen } from "../../cumulus/screens/FooScreen";
export function FooScreenAdapter() {
  const { state } = useJourney();
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
import { FooScreen } from "../../cumulus/screens/FooScreen";
export const FooScreenAdapter = () => <FooScreen />;
`,
    },
    {
      name: "primitive-literal consts and local types are allowed",
      filename: ADAPTER,
      code: `
import { FooScreen } from "../../cumulus/screens/FooScreen";
const POLL_MS = 250;
type PickHandler = (index: number) => void;
export function FooScreenAdapter() {
  return <FooScreen pollMs={POLL_MS} />;
}
`,
    },
    {
      name: "non-adapter files in the directory are inert",
      filename: "src/screens/cumulus_adapters/registry.tsx",
      code: `export const table = { a: () => 1 };`,
    },
    {
      name: "view-model modules are inert (helpers belong there)",
      filename: "src/screens/cumulus_adapters/foo-view-model.ts",
      code: `export function buildFooViewModel(x: number) { return { x }; }`,
    },
    {
      name: "files outside src/screens/cumulus_adapters are inert",
      filename: "src/components/FooAdapter.tsx",
      code: `export const helper = () => 1; export function FooAdapter() { return null; }`,
    },
    {
      name: "wiring inputs (state/data/types/runtime/logging) are importable",
      filename: ADAPTER,
      code: `
import { useJourney } from "../../state/journey-context";
import { selectOffer } from "../../data/offer-selection";
import type { Content } from "../../types/content";
import { getRuntimeConfig } from "../../runtime/runtime-config";
import { logEvent } from "../../logging";
import { FooScreen } from "../../cumulus/screens/FooScreen";
export function FooScreenAdapter() {
  return <FooScreen />;
}
`,
    },
    {
      name: "returning null while state is unavailable is fine",
      filename: ADAPTER,
      code: `
import { FooScreen } from "../../cumulus/screens/FooScreen";
export function FooScreenAdapter() {
  const ready = useReady();
  if (!ready) return null;
  return <FooScreen />;
}
`,
    },
  ],
  invalid: [
    {
      name: "importing a Cumulus component (only src/cumulus/screens/ is allowed)",
      filename: ADAPTER,
      code: `
import type { Tide } from "../../cumulus/components/hud/TidePill";
import { FooScreen } from "../../cumulus/screens/FooScreen";
export function FooScreenAdapter() {
  return <FooScreen />;
}
`,
      errors: [{ messageId: "cumulusImport" }],
    },
    {
      name: "a module-level helper function is logic that belongs in the view-model module",
      filename: ADAPTER,
      code: `
import { FooScreen } from "../../cumulus/screens/FooScreen";
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
import { FooScreen } from "../../cumulus/screens/FooScreen";
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
import { FooScreen } from "../../cumulus/screens/FooScreen";
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
import { FooScreen } from "../../cumulus/screens/FooScreen";
export interface FooView { value: number }
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
import { FooScreen } from "../../cumulus/screens/FooScreen";
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
import { FooScreen } from "../../cumulus/screens/FooScreen";
export function FooScreenBridge() {
  return <FooScreen />;
}
`,
      errors: [{ messageId: "missingComponent" }, { messageId: "extraExport" }],
    },
    {
      name: "importing legacy UI (src/components/) is not wiring",
      filename: ADAPTER,
      code: `
import { HUD } from "../../components/HUD";
import { FooScreen } from "../../cumulus/screens/FooScreen";
export function FooScreenAdapter() {
  return <FooScreen />;
}
`,
      errors: [{ messageId: "disallowedImport" }],
    },
    {
      name: "importing a legacy screen (src/screens/ outside cumulus/) is not wiring",
      filename: ADAPTER,
      code: `
import { LegacyFooScreen } from "../FooScreen";
import { FooScreen } from "../../cumulus/screens/FooScreen";
export function FooScreenAdapter() {
  return <FooScreen />;
}
`,
      errors: [{ messageId: "disallowedImport" }],
    },
    {
      name: "importing an unlisted feature module is not wiring",
      filename: ADAPTER,
      code: `
import { journey } from "../../journeys/journey";
import { FooScreen } from "../../cumulus/screens/FooScreen";
export function FooScreenAdapter() {
  return <FooScreen />;
}
`,
      errors: [{ messageId: "disallowedImport" }],
    },
    {
      name: "rendering an intrinsic element (layout/chrome belongs in the screen)",
      filename: ADAPTER,
      code: `
import { FooScreen } from "../../cumulus/screens/FooScreen";
export function FooScreenAdapter() {
  return <div className="wrap"><FooScreen /></div>;
}
`,
      errors: [{ messageId: "intrinsicElement" }],
    },
  ],
});
