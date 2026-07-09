import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import tangoNoExternalUiImports from "./eslint-rules/no-external-ui-imports.js";
import tangoNoPrimitiveTokens from "./eslint-rules/no-primitive-tokens.js";
import tangoNoEscapeHatchProps from "./eslint-rules/no-escape-hatch-props.js";
import tangoNoHardcodedValues from "./eslint-rules/no-hardcoded-values.js";
import tangoNoRawInteractiveElements from "./eslint-rules/no-raw-interactive-elements.js";
import tangoNoRawIconClasses from "./eslint-rules/no-raw-icon-classes.js";
import tangoNoAdhocPressScale from "./eslint-rules/no-adhoc-press-scale.js";
import tangoThinAdapters from "./eslint-rules/thin-adapters.js";
import tangoValidTokenReferences from "./eslint-rules/valid-token-references.js";
import tangoNoComposedTypeVoice from "./eslint-rules/no-composed-type-voice.js";
import tangoNoClassnameInProductUi from "./eslint-rules/no-classname-in-product-ui.js";
import tangoScreenFileTaxonomy from "./eslint-rules/screen-file-taxonomy.js";
import tangoNoUntokenizedLengths from "./eslint-rules/no-untokenized-lengths.js";
import tangoNoNameKeyedCards from "./eslint-rules/no-name-keyed-cards.js";
import tangoNoRawSafeAreaEnv from "./eslint-rules/no-raw-safe-area-env.js";
import tangoNoInlineGlass from "./eslint-rules/no-inline-glass.js";
import tangoNoNumericStyleProps from "./eslint-rules/no-numeric-style-props.js";
import tangoNoPurpleTextOnGlass from "./eslint-rules/no-purple-text-on-glass.js";

// One shared plugin object: flat config rejects two config blocks that bind the
// same plugin name to different objects, and the tango rules apply to more than
// one file scope (src/tango/** and the adapter layer in src/screens/tango_adapters/**).
const tangoPlugin = {
  rules: {
    "no-external-ui-imports": tangoNoExternalUiImports,
    "no-primitive-tokens": tangoNoPrimitiveTokens,
    "no-escape-hatch-props": tangoNoEscapeHatchProps,
    "no-hardcoded-values": tangoNoHardcodedValues,
    "no-raw-interactive-elements": tangoNoRawInteractiveElements,
    "no-raw-icon-classes": tangoNoRawIconClasses,
    "no-adhoc-press-scale": tangoNoAdhocPressScale,
    "thin-adapters": tangoThinAdapters,
    "valid-token-references": tangoValidTokenReferences,
    "no-composed-type-voice": tangoNoComposedTypeVoice,
    "no-classname-in-product-ui": tangoNoClassnameInProductUi,
    "screen-file-taxonomy": tangoScreenFileTaxonomy,
    "no-untokenized-lengths": tangoNoUntokenizedLengths,
    "no-name-keyed-cards": tangoNoNameKeyedCards,
    "no-raw-safe-area-env": tangoNoRawSafeAreaEnv,
    "no-inline-glass": tangoNoInlineGlass,
    "no-numeric-style-props": tangoNoNumericStyleProps,
    "no-purple-text-on-glass": tangoNoPurpleTextOnGlass,
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
    // The design-system tier plus the adapter/builder layer in
    // src/screens/tango_adapters/. Each rule scopes itself further by path (e.g. the
    // visual rules exempt primitives/components/docs; screen-file-taxonomy
    // only acts on src/screens/tango_adapters/), so the block can bind them broadly.
    files: ["src/tango/**/*.{ts,tsx}", "src/screens/tango_adapters/**/*.{ts,tsx}"],
    plugins: { tango: tangoPlugin },
    rules: {
      "tango/no-external-ui-imports": "error",
      "tango/no-primitive-tokens": "error",
      "tango/no-escape-hatch-props": "error",
      "tango/no-hardcoded-values": "error",
      "tango/no-raw-interactive-elements": "error",
      "tango/no-raw-icon-classes": "error",
      "tango/no-adhoc-press-scale": "error",
      "tango/valid-token-references": "error",
      "tango/no-composed-type-voice": "error",
      "tango/no-classname-in-product-ui": "error",
      "tango/screen-file-taxonomy": "error",
      "tango/no-untokenized-lengths": "error",
      "tango/no-name-keyed-cards": "error",
      "tango/no-raw-safe-area-env": "error",
      "tango/no-inline-glass": "error",
      "tango/no-purple-text-on-glass": "error",
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
    files: ["src/tango/components/**/*.{ts,tsx}"],
    plugins: { tango: tangoPlugin },
    rules: {
      "tango/no-numeric-style-props": [
        "error",
        {
          allow: [
            "AtlasNodeView.size", // computed stage-pixel node diameter (1920x1080 space)
            "AtlasNodeView.badgeScale", // mobile atlas badge-size multiplier
            "PressPopoverProps.gap", // px offset between the anchor and the popover
            "PressInfoProps.gap", // px offset between the anchor and the reveal
            "DreamcallerPortraitProps.size", // fixed pixel width; a box measure, not a style knob
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
    files: ["src/screens/tango_adapters/**/*Adapter.tsx"],
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
    files: ["src/screens/tango_adapters/**/*-view-model.ts"],
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
    // src/tango/internal/ holds material RECIPES (glass-surface,
    // control-treatment) — bespoke literal-heavy building blocks meant to be
    // worn by Tango components, not reached into directly. Rendering a public
    // Tango component (Button, InfoCard, SegmentedControl, …) from a legacy
    // screen is the sanctioned migration story and stays legal; a legacy
    // screen wearing a raw material itself bypasses the component layer
    // entirely and is not. Scoped to all of src/**, ignoring only the linted
    // src/tango/** tier itself (which legitimately imports its own materials).
    // Every screen outside src/tango consumes the public Tango API, so no
    // legacy reach-in is baselined here.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/tango/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/tango/internal/**", "**/tango/internal"],
              message:
                "src/tango/internal/ material recipes are not for external reach-in. Import a public Tango component instead, or migrate this screen onto the Tango tier — see the tango-migrate skill.",
            },
          ],
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
