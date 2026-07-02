import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it } from "vitest";
import rule from "./no-external-ui-imports.js";

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
  ],
});
