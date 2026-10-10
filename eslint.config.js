import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import enginePurity from "./eslint-rules/engine-purity.js";
import noComposedTypeVoice from "./eslint-rules/no-composed-type-voice.js";
import noHardcodedValues from "./eslint-rules/no-hardcoded-values.js";
import noNameKeyedCards from "./eslint-rules/no-name-keyed-cards.js";
import noRawIconClasses from "./eslint-rules/no-raw-icon-classes.js";
import noRawInteractiveElements from "./eslint-rules/no-raw-interactive-elements.js";
import noRawSafeAreaEnv from "./eslint-rules/no-raw-safe-area-env.js";
import noRawStringIdentity from "./eslint-rules/no-raw-string-identity.js";
import noUntokenizedLengths from "./eslint-rules/no-untokenized-lengths.js";
import validTokenReferences from "./eslint-rules/valid-token-references.js";

// Custom rules live in eslint-rules/, one module per rule with a RuleTester
// test beside it. Each rule checks only code shape; the blocks below decide
// which files it governs.
const dreamtides = {
  rules: {
    "engine-purity": enginePurity,
    "no-composed-type-voice": noComposedTypeVoice,
    "no-hardcoded-values": noHardcodedValues,
    "no-name-keyed-cards": noNameKeyedCards,
    "no-raw-icon-classes": noRawIconClasses,
    "no-raw-interactive-elements": noRawInteractiveElements,
    "no-raw-safe-area-env": noRawSafeAreaEnv,
    "no-raw-string-identity": noRawStringIdentity,
    "no-untokenized-lengths": noUntokenizedLengths,
    "valid-token-references": validTokenReferences,
  },
};

const SOURCE = ["src/**/*.{ts,tsx}"];
const TESTS = ["src/**/*.test.{ts,tsx}"];
// Cumulus screens and the adapter layer that feeds them.
const CUMULUS_UI = [
  "src/cumulus/**/*.{ts,tsx}",
  "src/screens/cumulus_adapters/**/*.{ts,tsx}",
];
const UI = ["src/**/*.tsx", ...CUMULUS_UI];
// Token definitions and the Pressable/glyph primitives own the raw values,
// native elements, and env() fallbacks that every other file must not author.
const PRIMITIVES = ["src/cumulus/primitives/**"];
// Components and internal material recipes own their geometry and chrome.
const COMPONENTS = ["src/cumulus/components/**", "src/cumulus/internal/**"];

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
    plugins: { dreamtides },
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
    // scripts/ typechecks under tsconfig.node.json, outside the root
    // tsconfig.json. TypeScript resolves its names, so no-undef (which knows
    // no Node globals) stays off for the JavaScript modules too.
    files: ["scripts/**/*.{ts,mjs}"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: "./tsconfig.node.json",
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    // Card and Avatar names are not unique; identity is the UUID everywhere.
    files: SOURCE,
    rules: {
      "dreamtides/no-name-keyed-cards": "error",
    },
  },
  {
    // Identities are branded types minted by the parse*/brand helpers in
    // src/types/identifiers.ts and src/types/card-identity.ts, tests included.
    files: SOURCE,
    rules: {
      "dreamtides/no-raw-string-identity": "error",
    },
  },
  {
    // Production domain values such as kind, seed, and zone are branded or
    // closed unions too; tests and the shared test identities may stay loose.
    files: SOURCE,
    ignores: [...TESTS, "src/types/test-identities.ts"],
    rules: {
      "dreamtides/no-raw-string-identity": [
        "error",
        { checkSemanticNames: true },
      ],
    },
  },
  {
    // A typo'd var(--token), a raw env() safe-area read, or a raw icon class
    // renders wrong silently. Tests may assert on rendered class strings.
    files: UI,
    ignores: [...PRIMITIVES, ...TESTS],
    rules: {
      "dreamtides/valid-token-references": "error",
      "dreamtides/no-raw-safe-area-env": "error",
      "dreamtides/no-raw-icon-classes": "error",
    },
  },
  {
    // Cumulus screens build from tokens and compose Cumulus controls.
    files: CUMULUS_UI,
    ignores: [...PRIMITIVES, ...COMPONENTS],
    rules: {
      "dreamtides/no-hardcoded-values": "error",
      "dreamtides/no-raw-interactive-elements": "error",
      "dreamtides/no-composed-type-voice": "error",
      "dreamtides/no-untokenized-lengths": "error",
    },
  },
  {
    // Components keep content rhythm on the spacing scale.
    files: COMPONENTS,
    rules: {
      "dreamtides/no-untokenized-lengths": ["error", { rhythmOnly: true }],
    },
  },
  {
    // Fold-reachable code must be deterministic: replaying the event log has
    // to reproduce the same state, so randomness and time arrive as inputs.
    files: ["src/rules/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message:
            "src/rules/ must be deterministic. Randomness has to arrive as reducer input (e.g. a seed on the event), not be read live.",
        },
        {
          object: "Date",
          property: "now",
          message:
            "src/rules/ must be deterministic. Wall-clock time has to arrive as reducer input (e.g. a timestamp on the event), not be read live.",
        },
        {
          object: "Date",
          property: "parse",
          message:
            "Date.parse is implementation/locale-dependent and returns NaN (not a bounce) on bad input. Use isoTimestampToMs from src/rules/battle/timestamp.ts instead.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            "src/rules/ must be deterministic. `new Date()` reads the live clock; pass a timestamp in as reducer input instead.",
        },
      ],
    },
  },
  {
    // The rules engine is pure: no clock, no ambient randomness, and no state
    // shared across battles (engine-design § Goals and constraints).
    files: ["src/engine/**/*.ts"],
    rules: {
      "dreamtides/engine-purity": "error",
    },
  },
  {
    files: ["src/journey_v2/encounter/generateAuguryEncounter.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='localeCompare']",
          message:
            "Fold-reachable generation code must use explicit code-unit comparison, not default-locale localeCompare.",
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
