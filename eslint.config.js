import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import tangoNoExternalUiImports from "./eslint-rules/no-external-ui-imports.js";
import tangoNoPrimitiveTokens from "./eslint-rules/no-primitive-tokens.js";
import tangoNoEscapeHatchProps from "./eslint-rules/no-escape-hatch-props.js";
import tangoNoHardcodedValues from "./eslint-rules/no-hardcoded-values.js";
import tangoNoRawInteractiveElements from "./eslint-rules/no-raw-interactive-elements.js";
import tangoThinAdapters from "./eslint-rules/thin-adapters.js";

// One shared plugin object: flat config rejects two config blocks that bind the
// same plugin name to different objects, and the tango rules apply to more than
// one file scope (src/tango/** and the adapter layer in src/screens/tango/**).
const tangoPlugin = {
  rules: {
    "no-external-ui-imports": tangoNoExternalUiImports,
    "no-primitive-tokens": tangoNoPrimitiveTokens,
    "no-escape-hatch-props": tangoNoEscapeHatchProps,
    "no-hardcoded-values": tangoNoHardcodedValues,
    "no-raw-interactive-elements": tangoNoRawInteractiveElements,
    "thin-adapters": tangoThinAdapters,
  },
};

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/tango/**/*.{ts,tsx}"],
    plugins: { tango: tangoPlugin },
    rules: {
      "tango/no-external-ui-imports": "error",
      "tango/no-primitive-tokens": "error",
      "tango/no-escape-hatch-props": "error",
      "tango/no-hardcoded-values": "error",
      "tango/no-raw-interactive-elements": "error",
    },
  },
  {
    // Screen adapters are wiring only: state acquisition, per-mount minting,
    // callback wiring, one screen render. Mapping logic belongs in the pure
    // *-view-model module; `thin-adapters` enforces the shape and `max-lines`
    // is the backstop against logic hiding inside the component body.
    files: ["src/screens/tango/*Adapter.tsx"],
    plugins: { tango: tangoPlugin },
    rules: {
      "tango/thin-adapters": "error",
      "max-lines": [
        "error",
        { max: 120, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    // View-model builders are pure functions from domain data to a screen's
    // view types: unit-testable with plain fixtures, no React, no live state.
    // The adapter acquires state and passes it in as arguments.
    files: ["src/screens/tango/*-view-model.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message:
                "View-model builders are pure, React-free functions. Hooks, refs, and rendering belong in the adapter or the Tango screen.",
            },
            {
              group: ["**/state/**", "**/state"],
              message:
                "View-model builders take domain data as arguments; acquiring live quest state is the adapter's job.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/",
      "dist/",
      ".claude/worktrees/",
      "eslint-rules/",
      "eslint.config.js",
      "vite.config.ts",
    ],
  }
);
