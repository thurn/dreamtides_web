import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import tangoNoExternalUiImports from "./eslint-rules/no-external-ui-imports.js";
import tangoNoPrimitiveTokens from "./eslint-rules/no-primitive-tokens.js";
import tangoNoEscapeHatchProps from "./eslint-rules/no-escape-hatch-props.js";

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
    plugins: {
      tango: {
        rules: {
          "no-external-ui-imports": tangoNoExternalUiImports,
          "no-primitive-tokens": tangoNoPrimitiveTokens,
          "no-escape-hatch-props": tangoNoEscapeHatchProps,
        },
      },
    },
    rules: {
      "tango/no-external-ui-imports": "error",
      "tango/no-primitive-tokens": "error",
      "tango/no-escape-hatch-props": "error",
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
