import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, { toRepoRelativePosix } from "./no-external-ui-imports.js";

describe("toRepoRelativePosix", () => {
  it("returns a clean repo-relative path for a normal checkout", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/quest_prototype/src/tango/components/Foo.tsx",
        "/Users/x/quest_prototype",
      ),
    ).toBe("src/tango/components/Foo.tsx");
  });

  it("is not fooled by a checkout prefix that itself contains /src/", () => {
    // Regression: a substring `indexOf("/src/")` heuristic would return
    // "src/quest_prototype/src/tango/components/Foo.tsx" here, which no longer
    // looks like it is under src/tango/ and would silently disable the rule.
    expect(
      toRepoRelativePosix(
        "/Users/x/src/quest_prototype/src/tango/components/Foo.tsx",
        "/Users/x/src/quest_prototype",
      ),
    ).toBe("src/tango/components/Foo.tsx");
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

ruleTester.run("no-external-ui-imports", rule, {
  valid: [
    {
      name: "tango-internal relative import",
      filename: "src/tango/components/Foo.tsx",
      code: `import { Button } from "./Button";`,
    },
    {
      name: "allowlisted types import (import type)",
      filename: "src/tango/components/GameCard.tsx",
      code: `import type { CardData } from "../../types/cards";`,
    },
    {
      name: "allowlisted src/logging.ts import",
      filename: "src/tango/docs/demos/x.tsx",
      code: `import { logEvent } from "../../logging";`,
    },
    {
      name: "allowlisted runtime import",
      filename: "src/tango/components/Foo.tsx",
      code: `import { assetUrl } from "../../runtime/asset-url";`,
    },
    {
      name: "allowlisted data import",
      filename: "src/tango/components/Foo.tsx",
      code: `import { loadQuestContent } from "../../data/quest-content";`,
    },
    {
      name: "bare module import",
      filename: "src/tango/components/Foo.tsx",
      code: `import React from "react";`,
    },
    {
      name: "outside tango: rule is inert",
      filename: "src/components/App.tsx",
      code: `import { HUD } from "./HUD";`,
    },
    {
      name: "outside tango importing forbidden path: still inert",
      filename: "src/components/App.tsx",
      code: `import { AtlasScreen } from "../screens/AtlasScreen";`,
    },
    {
      name: "re-export from allowlisted types (ExportNamedDeclaration)",
      filename: "src/tango/components/Foo.tsx",
      code: `export { CardData } from "../../types/cards";`,
    },
    {
      name: "export * from tango-internal (ExportAllDeclaration)",
      filename: "src/tango/components/index.tsx",
      code: `export * from "./Button";`,
    },
    {
      name: "dynamic import of bare module",
      filename: "src/tango/components/Foo.tsx",
      code: `const r = import("react");`,
    },
    {
      name: "dynamic import of allowlisted runtime",
      filename: "src/tango/components/Foo.tsx",
      code: `const r = import("../../runtime/asset-url");`,
    },
  ],
  invalid: [
    {
      name: "forbidden components import",
      filename: "src/tango/components/Foo.tsx",
      code: `import { HUD } from "../../components/HUD";`,
      errors: [{ messageId: "externalImport" }],
    },
    {
      name: "forbidden screens import",
      filename: "src/tango/docs/TangoApp.tsx",
      code: `import { AtlasScreen } from "../../screens/AtlasScreen";`,
      errors: [{ messageId: "externalImport" }],
    },
    {
      name: "forbidden re-export (ExportNamedDeclaration)",
      filename: "src/tango/components/Foo.tsx",
      code: `export { HUD } from "../../components/HUD";`,
      errors: [{ messageId: "externalImport" }],
    },
    {
      name: "forbidden export * (ExportAllDeclaration)",
      filename: "src/tango/components/Foo.tsx",
      code: `export * from "../../screens/AtlasScreen";`,
      errors: [{ messageId: "externalImport" }],
    },
    {
      name: "forbidden dynamic import (ImportExpression)",
      filename: "src/tango/docs/TangoApp.tsx",
      code: `const s = import("../../screens/AtlasScreen");`,
      errors: [{ messageId: "externalImport" }],
    },
    {
      // Locks the trailing slash on the "src/data/" prefix: a sibling directory
      // sharing the prefix (src/data-evil/) must NOT be allowed.
      name: "prefix boundary: src/data-evil is not src/data/",
      filename: "src/tango/components/Foo.tsx",
      code: `import { x } from "../../data-evil/x";`,
      errors: [{ messageId: "externalImport" }],
    },
    {
      // Locks exact-match on the src/logging file: a sibling sharing the prefix
      // (src/logging-ui/) must NOT be allowed.
      name: "file boundary: src/logging-ui is not src/logging",
      filename: "src/tango/components/Foo.tsx",
      code: `import { x } from "../../logging-ui/x";`,
      errors: [{ messageId: "externalImport" }],
    },
  ],
});
