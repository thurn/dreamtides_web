import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import cumulusNoExternalUiImports from "./eslint-rules/no-external-ui-imports.js";
import cumulusNoEscapeHatchProps from "./eslint-rules/no-escape-hatch-props.js";
import cumulusNoHardcodedValues from "./eslint-rules/no-hardcoded-values.js";
import cumulusNoRawInteractiveElements from "./eslint-rules/no-raw-interactive-elements.js";
import cumulusNoRawIconClasses from "./eslint-rules/no-raw-icon-classes.js";
import cumulusNoAdhocPressScale from "./eslint-rules/no-adhoc-press-scale.js";
import cumulusThinAdapters from "./eslint-rules/thin-adapters.js";
import cumulusValidTokenReferences from "./eslint-rules/valid-token-references.js";
import cumulusNoComposedTypeVoice from "./eslint-rules/no-composed-type-voice.js";
import cumulusNoClassnameInProductUi from "./eslint-rules/no-classname-in-product-ui.js";
import cumulusScreenFileTaxonomy from "./eslint-rules/screen-file-taxonomy.js";
import cumulusNoUntokenizedLengths from "./eslint-rules/no-untokenized-lengths.js";
import cumulusNoNameKeyedCards from "./eslint-rules/no-name-keyed-cards.js";
import cumulusNoRawSafeAreaEnv from "./eslint-rules/no-raw-safe-area-env.js";
import cumulusNoInlineGlass from "./eslint-rules/no-inline-glass.js";
import cumulusNoNumericStyleProps from "./eslint-rules/no-numeric-style-props.js";
import cumulusNoPurpleTextOnGlass from "./eslint-rules/no-purple-text-on-glass.js";
import cumulusNoEntityRevealEscapeHatches from "./eslint-rules/no-entity-reveal-escape-hatches.js";
import { baselineConfigEntries } from "./eslint-rules/ui-boundary-baselines.js";

// One shared plugin object: flat config rejects two config blocks that bind the
// same plugin name to different objects, and the cumulus rules apply to more than
// one file scope (src/cumulus/** and the adapter layer in src/screens/cumulus_adapters/**).
const cumulusPlugin = {
  rules: {
    "no-external-ui-imports": cumulusNoExternalUiImports,
    "no-escape-hatch-props": cumulusNoEscapeHatchProps,
    "no-hardcoded-values": cumulusNoHardcodedValues,
    "no-raw-interactive-elements": cumulusNoRawInteractiveElements,
    "no-raw-icon-classes": cumulusNoRawIconClasses,
    "no-adhoc-press-scale": cumulusNoAdhocPressScale,
    "thin-adapters": cumulusThinAdapters,
    "valid-token-references": cumulusValidTokenReferences,
    "no-composed-type-voice": cumulusNoComposedTypeVoice,
    "no-classname-in-product-ui": cumulusNoClassnameInProductUi,
    "screen-file-taxonomy": cumulusScreenFileTaxonomy,
    "no-untokenized-lengths": cumulusNoUntokenizedLengths,
    "no-name-keyed-cards": cumulusNoNameKeyedCards,
    "no-raw-safe-area-env": cumulusNoRawSafeAreaEnv,
    "no-inline-glass": cumulusNoInlineGlass,
    "no-numeric-style-props": cumulusNoNumericStyleProps,
    "no-purple-text-on-glass": cumulusNoPurpleTextOnGlass,
    "no-entity-reveal-escape-hatches": cumulusNoEntityRevealEscapeHatches,
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
    // Outer UI is classified in eslint-rules/ui-boundary-roles.js. Each rule
    // consults that shared ownership map, so pending player presentation is
    // protected now and operator tooling receives only universal safeguards.
    files: ["src/**/*.{ts,tsx}"],
    plugins: { cumulus: cumulusPlugin },
    rules: {
      "cumulus/no-hardcoded-values": "error",
      "cumulus/no-raw-interactive-elements": "error",
      "cumulus/no-raw-icon-classes": "error",
      "cumulus/valid-token-references": "error",
      "cumulus/no-composed-type-voice": "error",
      "cumulus/no-classname-in-product-ui": "error",
      "cumulus/no-untokenized-lengths": "error",
      "cumulus/no-name-keyed-cards": "error",
      "cumulus/no-raw-safe-area-env": "error",
      "cumulus/no-inline-glass": "error",
    },
  },
  ...baselineConfigEntries(),
  {
    // Entity reveal mechanics are private across every current and transitional
    // product surface. The rule itself exempts the coordinator implementation
    // and its focused tests; named semantic components are the public boundary.
    files: ["src/**/*.{ts,tsx}", "docs/**/*.{ts,tsx}"],
    plugins: { cumulus: cumulusPlugin },
    rules: {
      "cumulus/no-entity-reveal-escape-hatches": "error",
    },
  },
  {
    // The design-system tier plus the adapter/builder layer in
    // src/screens/cumulus_adapters/. Each rule scopes itself further by path (e.g. the
    // visual rules exempt primitives/components/docs; screen-file-taxonomy
    // only acts on src/screens/cumulus_adapters/), so the block can bind them broadly.
    files: ["src/cumulus/**/*.{ts,tsx}", "src/screens/cumulus_adapters/**/*.{ts,tsx}"],
    plugins: { cumulus: cumulusPlugin },
    rules: {
      "cumulus/no-external-ui-imports": "error",
      "cumulus/no-escape-hatch-props": "error",
      "cumulus/no-hardcoded-values": "error",
      "cumulus/no-raw-interactive-elements": "error",
      "cumulus/no-raw-icon-classes": "error",
      "cumulus/no-adhoc-press-scale": "error",
      "cumulus/valid-token-references": "error",
      "cumulus/no-composed-type-voice": "error",
      "cumulus/no-classname-in-product-ui": "error",
      "cumulus/screen-file-taxonomy": "error",
      "cumulus/no-untokenized-lengths": "error",
      "cumulus/no-name-keyed-cards": "error",
      "cumulus/no-raw-safe-area-env": "error",
      "cumulus/no-inline-glass": "error",
      "cumulus/no-purple-text-on-glass": "error",
    },
  },
  {
    // The styled public component surface. A number-typed visual knob
    // (`size?: number`, `gap?: number`, `scale?: number`) on an exported
    // *Props/*View type is an arbitrary-customization escape hatch; the strict
    // form is an enumerated string variant the component maps to its own
    // measure. The `allow` list names the production measures that genuinely
    // have no enumerable form (a computed stage-pixel diameter, a px anchor
    // offset, a fixed box width) — each is a box/measure/multiplier, not a
    // style knob, and carries a comment saying why.
    files: ["src/cumulus/components/**/*.{ts,tsx}"],
    plugins: { cumulus: cumulusPlugin },
    rules: {
      "cumulus/no-numeric-style-props": [
        "error",
        {
          allow: [
            "AtlasNodeView.size", // computed stage-pixel node diameter (1920x1080 space)
            "AtlasNodeView.badgeScale", // mobile atlas badge-size multiplier
            "DreamAvatarPortraitProps.size", // fixed pixel width; a box measure, not a style knob
          ],
        },
      ],
    },
  },
  {
    // Screen adapters are wiring only: state acquisition, per-mount minting,
    // callback wiring, one screen render. Mapping logic belongs in the pure
    // *-view-model module; `thin-adapters` enforces the shape and `max-lines`
    // is the backstop against logic hiding inside the component body.
    files: ["src/screens/cumulus_adapters/**/*Adapter.tsx"],
    plugins: { cumulus: cumulusPlugin },
    rules: {
      "cumulus/thin-adapters": "error",
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
    files: ["src/screens/cumulus_adapters/**/*-view-model.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message:
                "View-model builders are pure, React-free functions. Hooks, refs, and rendering belong in the adapter or the Cumulus screen.",
            },
            {
              group: ["**/state/**", "**/state"],
              message:
                "View-model builders take domain data as arguments; acquiring live journey state is the adapter's job.",
            },
          ],
        },
      ],
      // no-restricted-imports sees only static imports; close the dynamic
      // channel too. A pure, synchronous builder never needs import().
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression",
          message:
            "View-model builders are pure, synchronous functions — no dynamic import(). Anything a builder needs arrives as an argument or a static import.",
        },
      ],
    },
  },
  {
    // src/cumulus/internal/ holds material RECIPES (glass-surface,
    // control-treatment) — bespoke literal-heavy building blocks meant to be
    // worn by Cumulus components, not reached into directly. Rendering a public
    // Cumulus component (Button, InfoCard, SegmentedControl, …) from a legacy
    // screen is the sanctioned migration story and stays legal; a legacy
    // screen wearing a raw material itself bypasses the component layer
    // entirely and is not. Scoped to all of src/**, ignoring only the linted
    // src/cumulus/** tier itself (which legitimately imports its own materials).
    // Every screen outside src/cumulus consumes the public Cumulus API, so no
    // legacy reach-in is baselined here.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/cumulus/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/cumulus/internal/**", "**/cumulus/internal"],
              message:
                "src/cumulus/internal/ material recipes are not for external reach-in. Import a public Cumulus component instead, or migrate this screen onto the Cumulus tier — see the cumulus-migrate skill.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/battle/integration/corpus-opponent-deck.ts",
      "src/journey_v2/encounter/generateMerchantEncounter.ts",
    ],
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
    // src/rules/ is the pure reducer package for the coop event-sourcing
    // rewrite: given an event log, it deterministically computes state. It
    // must stay free of Firebase (network/persistence), React (view-layer),
    // and any hidden nondeterminism — every source of randomness or wall-clock
    // time has to arrive as reducer input, not be read live, or replaying the
    // event log would not reproduce the original state.
    files: ["src/rules/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["firebase", "firebase/*"],
              message:
                "src/rules/ is a pure reducer and must not talk to Firebase directly. Persistence and network I/O belong in src/coop/ or the eventlog engine, driven by reducer output.",
            },
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message:
                "src/rules/ is a pure, React-free reducer. Rendering and hooks belong in src/coop/.",
            },
          ],
        },
      ],
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
    // src/eventlog/ is the game-agnostic event-sourcing engine (log storage,
    // sync, replay). It must not know about this game's rules or its React
    // layer, or the engine stops being reusable/game-agnostic. Both relative
    // (`../rules/...`) and absolute-from-src forms are covered, since the repo
    // has no path aliases and intra-src imports are written as relative paths.
    // `emulator.integration.test.ts` is exempted: its real-reducer convergence
    // scenario deliberately drives the actual game (GAME_ENGINE_CONFIG) against
    // a live emulator, which is a TEST verifying the engine works correctly
    // with a real game on top — not the engine itself depending on the game.
    files: ["src/eventlog/**/*.{ts,tsx}"],
    ignores: ["src/eventlog/emulator.integration.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/rules/**", "**/rules", "src/rules/**", "src/rules"],
              message:
                "src/eventlog/ is the game-agnostic engine and must not import from src/rules/ (the game's pure reducer). Depend the other way: rules code drives the engine through its public API.",
            },
            {
              group: ["**/coop/**", "**/coop", "src/coop/**", "src/coop"],
              message:
                "src/eventlog/ is the game-agnostic engine and must not import from src/coop/ (the React layer). Depend the other way: the React layer drives the engine through its public API.",
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
