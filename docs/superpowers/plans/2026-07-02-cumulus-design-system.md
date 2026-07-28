# Cumulus Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `localhost/cumulus`, a self-contained, interactive documentation endpoint for the Cumulus UI design system, and make `src/cumulus/` the home of the shared UI component library.

**Architecture:** A new `/cumulus` pathname branch in `src/main.tsx` lazy-loads a `CumulusApp` that uses a tiny custom hash router. Design tokens are imported from Claude Design as CSS custom properties (source of truth) plus a generated typed mirror. A standalone docgen script emits one metadata JSON that drives both the programmatic props tables and the auto-generated interactive controls. All UI lives under `src/cumulus/`, isolated from the rest of the app by a fail-closed custom ESLint rule; reused components (game card, rules text, atlas) physically move into Cumulus and external call sites re-point.

**Tech Stack:** React 19 + TypeScript (bundler mode, `react-jsx`), Vite, Vitest + jsdom, flat-config ESLint (typescript-eslint), `react-docgen-typescript` (new dev dep), Boxicons 3 (self-hosted) + one new Phosphor fill face.

**Companion spec (read first, do not re-decide):** `docs/journey_prototype/cumulus_design_system.md`. That document holds the design decisions this plan implements — the isolation rule, routing choice, token pipeline, docgen approach, per-component roster, the input-adaptive press-reveal model, and the GroupPanel-is-CSS-only correction. Where this plan says "per the spec," consult that file rather than re-deriving the decision.

**Design source of record:** Claude Design project `10fa84a8-cdc2-4e83-80af-47df24d1c247`, read via the `claude_design` MCP (`DesignSync get_file` / `list_files`), authorized with `/design-login`. Component source files are `.jsx` + `.d.ts` + `.card.html` under `components/<group>/`; tokens are under `tokens/`.

---

## Scope note

This plan is large because it spans three coupled subsystems: the doc-site harness (Phases 0–2), the machinery (hash router, boundary lint, docgen — Phases 0–2), and the component-library migration (Phases 3–6). Phases 0–2 produce a working, testable doc site with the first components. Phases 3–6 are separable migrations, each independently shippable. If you prefer smaller artifacts, execute Phase 0–2 as one unit and split each later phase into its own run; the task boundaries already support this.

The **testable machinery** (hash router, boundary ESLint rule, docgen extractor, control inference, token-CSS parser) gets full TDD treatment. Component **import/move/port/unify** work is largely visual and is verified by the moved components' own existing tests, `typecheck`, the boundary lint gate, and browser QA — not by new per-component unit tests (there is no bug class a "renders TidePill" test would catch that typecheck + QA does not).

---

## File structure

```
src/cumulus/
  primitives/
    cumulus-tokens.css        # imported CSS custom properties (source of truth), scoped .cumulus
    tokens.ts               # GENERATED typed mirror of cumulus-tokens.css
    Pressable.tsx           # the one press-feedback primitive (scale 0.94)
    Icon.tsx                # boxicon/phosphor glyph helper
  components/
    GlassButton.tsx  ResourceChip.tsx  InfoCard.tsx  SegmentedControl.tsx
    StatTile.tsx  TidePill.tsx  Motes.tsx  JourneyStatusBar.tsx  GroupPanel.tsx
    GameCard.tsx  RulesText.tsx  Dreamsign.tsx  SiteNode.tsx
    AtlasNode.tsx  AtlasEdge.tsx  AtlasEdgeDefs.tsx
    <moved helper closure: card-text.ts, card-display-scale.ts, GlowIcon.tsx,
     CardStatOrb.tsx, PipBadge.tsx, useCardTermPopover.tsx, useFitText.ts,
     atlas-display.ts, dreamscape-scatter.ts, ...>
  assets/
    phosphor-fill.css + font # the one Phosphor face (ph-cards)
  docs/                      # the /cumulus page itself (Cumulus-only UI)
    CumulusApp.tsx             # route shell + hash router mount
    route.ts                 # parseCumulusRoute (pure) + types
    route.test.ts
    controls.ts              # controlForProp inference (pure)
    controls.test.ts
    TableOfContents.tsx  IntroSection.tsx  PrimitivesSection.tsx
    ComponentPage.tsx        # demo + generated controls + props table
    PropsTable.tsx  DemoStage.tsx  ControlPanel.tsx
    registry.ts              # component id -> { Component, demo, mockup } wiring
    demos/<component>.tsx    # per-component sample args + demo content
    mockups/<component>.tsx  # per-component full-screen mockup detail page
  metadata/
    cumulus-metadata.json      # GENERATED docgen output

scripts/
  generate-cumulus-metadata.mjs   # react-docgen-typescript -> cumulus-metadata.json
  lib/cumulus-css-tokens.mjs      # pure CSS-var parser (shared by generator + tests)
  generate-cumulus-tokens.mjs     # cumulus-tokens.css -> tokens.ts

eslint-rules/
  no-external-ui-imports.js      # custom flat-config rule (fail-closed allowlist)
  no-external-ui-imports.test.ts # RuleTester contract tests
```

Files that change together live together: each component's demo and mockup sit under `src/cumulus/docs/demos` and `src/cumulus/docs/mockups`, keyed by the same id used in `registry.ts`.

---

## Decisions already made (do not re-open)

- **Route:** `/cumulus` in `src/main.tsx`, following the `/editor` / `/dreamsigns` lazy-import pattern. Internal nav = hash router. No react-router, no server rewrites.
- **Isolation:** `src/cumulus/**` may import only `src/cumulus/**`, bare `node_modules`, and the allowlist `src/data/`, `src/types/`, `src/runtime/`, `src/logging.ts`. Everything else under `src/` is denied. Reused components move in; external call sites re-point.
- **Tokens:** CSS custom properties from the design (`tokens/*.css`) are the source of truth; `tokens.ts` is generated from them.
- **Docgen:** `react-docgen-typescript` → `cumulus-metadata.json`; the same JSON drives props tables and control inference.
- **GroupPanel:** port the design's CSS-only implementation. No liquid-glass library.
- **TidePill:** keep the name.
- **Press-reveal:** input-adaptive — desktop hover reveals + mouse-down scales; touch press-down reveals, release dismisses.
- **Content:** real card UUIDs + atlas fixtures where they exist; mockups render full-screen/responsive.

---

## Phase 0 — Foundation: route, token pipeline, isolation gate

### Task 0.1: Add the `/cumulus` route and a minimal shell

**Files:**
- Modify: `src/main.tsx` (the `else if (pathname === …)` chain, alongside the existing `/images` branch)
- Create: `src/cumulus/docs/CumulusApp.tsx`

- [ ] **Step 1: Add the route branch**

Insert a branch in the pathname chain in `src/main.tsx`, matching the existing lazy-import branches exactly in style:

```tsx
} else if (pathname === "/cumulus") {
  const { default: CumulusApp } = await import("./cumulus/docs/CumulusApp");
  renderStrict(<CumulusApp />);
```

The insertion point carries meaning (it must be inside the existing `if/else if` chain, before the final `else`), so it is embedded rather than described.

- [ ] **Step 2: Minimal shell**

Create `CumulusApp` as a default-exported component rendering a single `<h1>Cumulus Design System</h1>` inside a `.cumulus` root element. This is a placeholder replaced in later tasks; keep it tiny.

- [ ] **Step 3: Verify it loads**

Run: `npm run dev:vite -- --port 5174` then load `http://localhost:5174/cumulus` via `agent-browser`. Expected: the heading renders, no console errors. Tear down only your own server (`pkill -f "vite --port 5174"`).

- [ ] **Step 4: typecheck + lint**

Run: `npm run typecheck && npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/cumulus/docs/CumulusApp.tsx
git commit -m "feat(cumulus): add /cumulus route with placeholder shell"
git push
```

### Task 0.2: Import design tokens as CSS custom properties

**Files:**
- Create: `src/cumulus/primitives/cumulus-tokens.css`

- [ ] **Step 1: Fetch the token files from Claude Design**

Using `DesignSync get_file` on project `10fa84a8-cdc2-4e83-80af-47df24d1c247`, fetch each of: `tokens/base.css`, `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/effects.css`, `tokens/fonts.css`.

- [ ] **Step 2: Assemble `cumulus-tokens.css`**

Concatenate the fetched custom-property declarations into `src/cumulus/primitives/cumulus-tokens.css`, wrapping the `:root` blocks in a `.cumulus` selector so tokens are scoped to the Cumulus subtree (not leaked app-wide). Keep the values **verbatim**; do not rename tokens. Preserve the `@kind` trailing comments (`/* @kind radius */`, etc.) — the token-doc generator reads them to group tokens.

Requirement, not code: fonts loaded by `@import`/CDN in the design's `fonts.css` should become self-hosted `@font-face` where the app already vendors the face (Inter, JetBrains Mono, EB Garamond, Fira Sans Condensed, Anton are already used by the card fonts — reuse those), leaving only the token custom properties here.

- [ ] **Step 3: Import it from the shell**

Add `import "../primitives/cumulus-tokens.css";` to `CumulusApp.tsx`.

- [ ] **Step 4: Verify tokens resolve**

Run the dev server, load `/cumulus`, and in the browser console confirm `getComputedStyle(document.querySelector('.cumulus')).getPropertyValue('--accent')` returns `#a855f7` (via its alias chain). Expected: non-empty.

- [ ] **Step 5: Commit** (`feat(cumulus): import design tokens as scoped CSS custom properties`, then push)

### Task 0.3: Pure CSS-var parser (TDD)

This parser is shared by the `tokens.ts` generator and the Primitives-section token doc. It is the one piece of the token pipeline with logic worth pinning.

**Files:**
- Create: `scripts/lib/cumulus-css-tokens.mjs`
- Test: `scripts/lib/cumulus-css-tokens.test.mjs`

- [ ] **Step 1: Write the failing test**

Test `parseCssTokens(cssText)` against a small inline CSS fixture containing: two custom properties, one line comment between them, one `@kind radius` trailing comment, and one non-custom declaration (e.g. `color: red;`).

Guarantees the test pins (name the bug each catches):
- **Extraction contract:** returns one entry per `--name: value;`, with `name` and trimmed `value`. Catches a regex that swallows the trailing `;` or leaves whitespace.
- **Comment robustness:** block/line comments between declarations do not produce phantom entries and do not corrupt the following value. Catches a naive split-on-`;` parser.
- **Non-custom-property exclusion:** `color: red;` is not returned. Catches an over-broad match that treats ordinary declarations as tokens.
- **`@kind` capture:** the `@kind radius` trailing comment is attached to its entry as `kind: "radius"`. Catches dropping the grouping metadata the Primitives section depends on.

- [ ] **Step 2: Run → FAIL** (`node --test scripts/lib/cumulus-css-tokens.test.mjs`; expected: cannot find export `parseCssTokens`)

- [ ] **Step 3: Implement `parseCssTokens`**

Prose (obvious from the guarantees): strip comments except captured `@kind` markers, match `--<name>: <value>;` pairs, return `{ name, value, kind? }[]`. No block embedded — the signature plus the four guarantees fully determine it.

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Commit** (`feat(cumulus): add CSS custom-property parser`, push)

### Task 0.4: Generate `tokens.ts` from the CSS

**Files:**
- Create: `scripts/generate-cumulus-tokens.mjs`
- Create (generated, committed): `src/cumulus/primitives/tokens.ts`
- Modify: `scripts/regenerate-assets.sh`

- [ ] **Step 1: Write the generator**

`generate-cumulus-tokens.mjs` reads `src/cumulus/primitives/cumulus-tokens.css`, calls `parseCssTokens`, and writes `tokens.ts` exporting a typed const object mapping each token name (as a `var(--name)` string, and its raw value) so TS callers use `token("--accent")` or a typed `TOKENS` record. Include a generated-file header comment. The generated file is committed (like `public/*-data.json` peers are baked, but this one is tracked).

- [ ] **Step 2: Wire into regenerate-assets**

Add a numbered step to `scripts/regenerate-assets.sh` (renumber the header comment + `step` labels) that runs `node scripts/generate-cumulus-tokens.mjs` and `node scripts/generate-cumulus-metadata.mjs` (the latter created in Phase 1). Place it after setup-assets step 6.

- [ ] **Step 3: Run it**

Run: `node scripts/generate-cumulus-tokens.mjs`. Expected: `src/cumulus/primitives/tokens.ts` written, `npm run typecheck` PASS.

- [ ] **Step 4: Commit** (`feat(cumulus): generate typed tokens.ts mirror`, push)

### Task 0.5: Custom fail-closed isolation ESLint rule (TDD)

**Files:**
- Create: `eslint-rules/no-external-ui-imports.js`
- Test: `eslint-rules/no-external-ui-imports.test.ts`
- Modify: `eslint.config.js`

- [ ] **Step 1: Write the failing RuleTester test**

Use ESLint's `RuleTester` (from the installed `eslint` package). The exact import shapes are the contract, so they are embedded:

```ts
import { RuleTester } from "eslint";
import rule from "./no-external-ui-imports.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

tester.run("no-external-ui-imports", rule, {
  valid: [
    // cumulus-internal relative import
    { code: `import { Button } from "./Button";`, filename: "src/cumulus/components/Foo.tsx" },
    // allowlisted non-UI infra
    { code: `import type { CardData } from "../../types/cards";`, filename: "src/cumulus/components/GameCard.tsx" },
    { code: `import { logEvent } from "../../logging";`, filename: "src/cumulus/docs/demos/x.tsx" },
    // bare node_modules
    { code: `import React from "react";`, filename: "src/cumulus/components/Foo.tsx" },
    // files OUTSIDE cumulus are unrestricted (rule is a no-op there)
    { code: `import { HUD } from "./HUD";`, filename: "src/components/App.tsx" },
  ],
  invalid: [
    // external UI dir
    { code: `import { HUD } from "../../components/HUD";`, filename: "src/cumulus/components/Foo.tsx", errors: 1 },
    { code: `import { AtlasScreen } from "../../screens/AtlasScreen";`, filename: "src/cumulus/docs/CumulusApp.tsx", errors: 1 },
  ],
});
```

Bug classes pinned: **fail-closed default** (an import to a non-allowlisted `src/` path errors — catches a denylist that misses new UI dirs), **allowlist correctness** (types/logging/runtime/data resolve clean — catches an over-strict rule that breaks legitimate infra use), **scope** (the rule is inert outside `src/cumulus/` — catches a rule accidentally applied repo-wide), **bare-module pass-through** (node_modules never flagged).

- [ ] **Step 2: Run → FAIL** (`npx vitest run eslint-rules/no-external-ui-imports.test.ts`; expected: module not found)

- [ ] **Step 3: Implement the rule**

The rule's decision (embedded because it defines the allowlist contract): for each `ImportDeclaration`/`ExportNamedDeclaration` with a source in a file under `src/cumulus/`, resolve the source relative to the file; **allow** iff the resolved path is under `src/cumulus/`, OR the specifier is a bare module (does not start with `.`), OR the resolved path is under one of `ALLOWLIST = ["src/data/", "src/types/", "src/runtime/"]` or equals `"src/logging.ts"`. Otherwise report. Everything else about the rule (message text, `meta`) is boilerplate — describe, don't embed.

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Register in `eslint.config.js`**

Add a flat-config object scoped to `files: ["src/cumulus/**/*.{ts,tsx}"]` that registers the local rule under a `cumulus` plugin namespace and sets it to `error`. Remove `eslint-rules/` from being linted with the type-checked project if it trips `projectService` (add to the config's ignore list if needed, since it is Node tooling, not app `src`).

- [ ] **Step 6: Prove the gate works end-to-end**

Temporarily add `import { HUD } from "../../components/HUD";` to a scratch file under `src/cumulus/`, run `npm run lint`, confirm it errors, then remove it. Expected: lint fails on the bad import, passes once removed.

- [ ] **Step 7: Commit** (`feat(cumulus): enforce fail-closed UI-import boundary via custom eslint rule`, push)

---

## Phase 1 — Docgen harness and the component page

### Task 1.1: Add `react-docgen-typescript` and the metadata generator

**Files:**
- Modify: `package.json` (devDependencies), `package.json` scripts
- Create: `scripts/generate-cumulus-metadata.mjs`
- Create (generated, committed): `src/cumulus/metadata/cumulus-metadata.json`
- Create (fixture): `src/cumulus/components/__docgen_fixture__.tsx`
- Test: `scripts/generate-cumulus-metadata.test.mjs`

- [ ] **Step 1: Install the dev dep**

Run: `npm install -D react-docgen-typescript`. Add an `npm run cumulus-metadata` script pointing at the generator.

- [ ] **Step 2: Write a docgen fixture component**

Create `__docgen_fixture__.tsx`: a component whose props exercise every control class — a `boolean`, a string-literal union (`'sm' | 'md' | 'lg'`), a `number`, a `string`, and a `React.ReactNode` — each with a one-line JSDoc `/** ... */`. This fixture is the stable input the extractor test asserts against, insulating the test from real-component churn (per AGENTS.md: derive fixtures, don't pin volatile production data).

- [ ] **Step 3: Write the failing extractor test**

Test that running the extractor over the fixture yields a normalized `PropMeta[]` (contract shape embedded, because the table and control inference both consume it):

```ts
interface PropMeta {
  name: string;
  tsType: string;          // e.g. "boolean", "number", "\"sm\" | \"md\" | \"lg\""
  unionMembers: string[];  // ["sm","md","lg"] for literal unions, else []
  required: boolean;
  defaultValue: string | null;
  description: string;     // JSDoc text, "" if none
}
```

Guarantees pinned: **union normalization** (the `'sm'|'md'|'lg'` prop yields `unionMembers` of exactly those three, unquoted — catches leaving them as one joined string, which breaks the select control), **description capture** (JSDoc text survives — catches losing the props-table copy), **required flag** (a non-optional prop reports `required: true`). Do not assert the full list of the fixture's props by value beyond these structural properties.

- [ ] **Step 4: Run → FAIL**, then implement the generator: parse with `react-docgen-typescript` (using the repo `tsconfig.json`), map each component's `.props` into `PropMeta[]`, keyed by component display name, and write `cumulus-metadata.json`. Normalizing union members from the parser's enum `type.value` is the one non-obvious step — everything else follows from the shape above.

- [ ] **Step 5: Run → PASS**

- [ ] **Step 6: Commit** (`feat(cumulus): generate component prop metadata via react-docgen-typescript`, push)

### Task 1.2: Control inference (TDD)

**Files:**
- Create: `src/cumulus/docs/controls.ts`
- Test: `src/cumulus/docs/controls.test.ts`

- [ ] **Step 1: Write the failing test for `controlForProp(meta: PropMeta): ControlSpec`**

`ControlSpec` (embedded — it is the contract between inference and the control panel):

```ts
type ControlSpec =
  | { kind: "toggle" }
  | { kind: "select"; options: string[] }
  | { kind: "number" }
  | { kind: "text" }
  | { kind: "none" };   // ReactNode / function / object props: shown in table, no control
```

Mapping decision (embedded — this is the rule set, not boilerplate):
- `tsType === "boolean"` → `toggle`
- `unionMembers.length > 0` → `select` with those options
- `tsType === "number"` → `number`
- `tsType === "string"` → `text`
- otherwise → `none`

Guarantees pinned: each branch maps correctly (one assertion per branch is justified here — these are distinct contract branches, not tuning values), and **the `none` fallback** catches an unhandled `ReactNode`/`() => void` prop silently rendering a broken control.

- [ ] **Step 2–4:** Run → FAIL; implement the pure mapping; Run → PASS.

- [ ] **Step 5: Commit** (`feat(cumulus): infer demo controls from prop metadata`, push)

### Task 1.3: Hash router (TDD)

**Files:**
- Create: `src/cumulus/docs/route.ts`
- Test: `src/cumulus/docs/route.test.ts`

- [ ] **Step 1: Write the failing test for `parseCumulusRoute(hash: string): CumulusRoute`**

`CumulusRoute` (embedded contract):

```ts
type CumulusRoute =
  | { view: "overview" }
  | { view: "component"; id: string }
  | { view: "mockup"; id: string };
```

Guarantees pinned:
- `""`, `"#"`, `"#/"` → `overview` (catches a parser that treats empty hash as a component named "").
- `"#/button"` → `{ view: "component", id: "button" }`.
- `"#/button/mockup"` → `{ view: "mockup", id: "button" }`.
- trailing/leading slashes and an unknown trailing segment (`"#/button/xyz"`) fall back to the component view for that id, not a crash (catches unguarded segment indexing).
- ids are lowercased/trimmed so links are canonical (catches `#/Button` and `#/button` diverging).

- [ ] **Step 2–4:** Run → FAIL; implement `parseCumulusRoute` (split the hash on `/`, branch on segment count and the `mockup` suffix); Run → PASS.

- [ ] **Step 5:** Add a `useCumulusRoute()` hook wrapping `parseCumulusRoute` over a `hashchange` listener. No test (thin DOM-event wrapper; the parse logic — the part that breaks — is already covered).

- [ ] **Step 6: Commit** (`feat(cumulus): add hash router for the cumulus doc site`, push)

### Task 1.4: Component registry, props table, control panel, demo stage

**Files:**
- Create: `src/cumulus/docs/registry.ts`, `PropsTable.tsx`, `ControlPanel.tsx`, `DemoStage.tsx`, `ComponentPage.tsx`

- [ ] **Step 1: Registry**

`registry.ts` maps a component id → `{ title, group, Component, docName, demo }`, where `docName` is the key into `cumulus-metadata.json` and `demo` supplies default args + content-typed prop values (for `none`-control props like `icon`). Registry starts empty; each component task appends its entry.

- [ ] **Step 2: PropsTable**

Renders `cumulus-metadata.json[docName]` as a table (prop, type, required, default, description). Pure presentation from generated data — no test (it renders generated JSON; a snapshot would pin volatile design data, which AGENTS.md forbids). Verified by QA.

- [ ] **Step 3: ControlPanel + DemoStage**

`ControlPanel` builds an input per prop from `controlForProp`, holding live arg state; `DemoStage` renders `<Component {...args} />` inside a `.cumulus` surface. `ComponentPage` composes DemoStage + ControlPanel + PropsTable for the routed id.

- [ ] **Step 4: Wire routing**

`CumulusApp` switches on `useCumulusRoute()`: `overview` → TOC; `component` → `ComponentPage`; `mockup` → the component's mockup (Phase 6). TOC lists registry entries grouped by `group`.

- [ ] **Step 5: QA + typecheck + lint + commit**

Run dev server, load `/cumulus`, confirm TOC renders and (after Phase 2 adds the first component) a component page shows demo + live controls + props table. `npm run typecheck && npm run lint`. Commit (`feat(cumulus): component page with generated props table and controls`, push).

---

## Phase 2 — Import primitives and simple components from Claude Design

Each component below is **imported** from the design source. The work is identical in shape, so it is specified once as a recipe; the per-component specifics are enumerated in the table so no task is a "similar to" placeholder.

### Import recipe (applied per component)

Dispatch **one subagent per component** (per super-subagent-driven-development). Each subagent:

1. Reads the design source via `DesignSync get_file`: `components/<group>/<Name>.jsx`, `<Name>.d.ts`, and `<name>.card.html` (the specimen carries inline usage notes in a `<script type="text/markdown" id="usage-notes">` block).
2. Writes `src/cumulus/<primitives|components>/<Name>.tsx` — a faithful `.tsx` port: same props as the `.d.ts` (preserve its JSDoc verbatim so docgen populates the table), styling driven by `cumulus-tokens.css` custom properties (never raw hex), imports compliant with the isolation allowlist.
3. Writes `src/cumulus/docs/demos/<id>.tsx` with representative default args (and sample nodes for `none`-control props).
4. Appends the registry entry.

**Per-component verification (the same each time; no bug-class unit test is added — see Scope note):**
- `npm run typecheck` PASS (the `.d.ts`-derived props compile against usages).
- `npm run lint` PASS (**including the boundary rule** — this is the real gate that the port stayed isolated).
- `node scripts/generate-cumulus-metadata.mjs` then load `/cumulus#/<id>`: props table populated, every inferred control drives a visible change, component renders coherently at desktop and at an emulated 390×844 (DevTools). No console errors.
- Commit per component (`feat(cumulus): import <Name> component`), push.

### Components to import (Phase 2)

| id | Name | group / location | design path | Notes that constrain the port |
| --- | --- | --- | --- | --- |
| `pressable` | Pressable | primitives | `components/primitives/Pressable.jsx` | The one press-feedback primitive; scale-down `--press-scale` (0.94) on pointer-down; every interactive Cumulus control routes through it. Also expose `usePress`. |
| `resource-chip` | ResourceChip | components | `components/buttons/ResourceChip.jsx` | Value + filled-Boxicon mark, tight pairing; color from the resource role tokens (`--energy`/`--spark`/`--essence`/…). |
| `glass-button` | GlassButton | components | `components/buttons/GlassButton.jsx` | Labeled liquid-glass action. `accent` is primary/commit, `default` is secondary, and `danger` is destructive. Press via Pressable. |
| `segmented-control` | SegmentedControl | components | `components/pills/SegmentedControl.jsx` | — |
| `stat-tile` | StatTile | components | `components/pills/StatTile.jsx` | — |
| `tide-pill` | TidePill | components | `components/pills/TidePill.jsx` | **Keep the name.** Tones `violet/blue/gold/green/rust/red/neutral`; presentational; optional `onPress`. |
| `motes` | Motes | components | `components/journey/Motes.jsx` | Atmospheric particle layer; `tint` `warm`/`violet`; the one sanctioned opacity animation; respects `prefers-reduced-motion`. |

### Task 2.0 (prerequisite): bundle the Phosphor face

**Files:** Create `src/cumulus/assets/phosphor-fill.css` (+ font file)

- [ ] Self-host the single Phosphor fill face for `ph-cards` (the one glyph the design pins as a fallback); add its `@font-face` so no CDN is used, matching the repo's self-hosted-icon convention.
- [ ] Commit (`feat(cumulus): bundle phosphor fill face`, push).

Tasks 2.1–2.7 apply the import recipe to each row of the table above, in that order; they are independent and may be dispatched in parallel.

---

## Phase 3 — Press engine and surfaces

### Task 3.1: InfoCard + the press-reveal engine (input-adaptive)

**Files:** Create `src/cumulus/components/InfoCard.tsx`; demo + registry entry.

Import per the recipe from `components/overlays/InfoCard.jsx` + `.d.ts`. This component carries the shared engine as statics (`PressPopover`, `PressInfo`, `usePressReveal`, `anchorRect`, `setRevealDelay`, `SITE_DISC`) and four variants (`object/hero/icon/text`).

The one **decision that changes the port** (not in the design source): generalize the touch-first engine to any input, per the spec:
- Coarse pointer / touch: `pointerdown` reveals (anchored at the pointer), `pointerup` dismisses; no long-press; no close button; no scrim; clamped on-screen; `pointerEvents: none` on the popover.
- Fine pointer / mouse (`matchMedia("(hover: hover) and (pointer: fine)")`): hover reveals; `pointerdown` still applies the Pressable scale; nothing reveals on press.

- [ ] Implement `usePressReveal` so the reveal trigger is gated on pointer type per the above; keep `setRevealDelay` default 0 (immediate, never long-press) for touch.
- [ ] **Test (contract, worth pinning):** `usePressReveal`'s tap-vs-hold discrimination — a release **within** the click window is a tap (fires the child's click), a release **after** it is a hold (reveal only). Pin this with a small hook test driving synthetic pointer timings. Bug class: a regression that makes every tap open the popover (or every hold fire a click) — the core R-17 contract. (The hover/press branch is environment-gated and verified by QA, not unit-tested.)
- [ ] QA both input modes: on desktop confirm hover reveals + click scales; via DevTools touch emulation confirm press reveals + release dismisses. typecheck + lint + commit + push.

### Task 3.2: GroupPanel (CSS-only port)

**Files:** Create `src/cumulus/components/GroupPanel.tsx`; demo + registry entry.

Port the design's `components/surfaces/GroupPanel.jsx` **as-is** — it is already CSS-only (`backdrop-filter: blur(22px) saturate(1.5)`, specular gradient, inset rim/wash, drop shadow). Replace its literal rgba/px values with the corresponding Cumulus tokens where a token exists (`--border-soft`, `--r-popover`, `--space-6`); keep the bespoke glass gradient/shadow literals that have no token. Expose `groupPanelStyle(radius)` and the `GroupPanel` wrapper (`as`, `padding`, `radius`). No dependency. Recipe verification + commit + push.

### Task 3.3: JourneyStatusBar

**Files:** Create `src/cumulus/components/JourneyStatusBar.tsx`; demo + registry entry.

Import per recipe from `components/journey/JourneyStatusBar.jsx`. The transparent bottom HUD (no surface); text/icons use `.hud-outline` (rung 1 of the legibility ladder) — port that outline utility into Cumulus CSS. Recipe verification + commit + push.

---

## Phase 4 — Move production components into Cumulus

These are **moves**, not imports. The production component and its component-specific helper closure relocate under `src/cumulus/`; the file physically moves; every external call site re-points; the component's existing tests move with it. Verification is **the moved tests still pass** plus typecheck, lint (boundary gate), and QA.

### Task 4.1: Move RulesText (+ closure)

**Files:**
- Move into `src/cumulus/components/`: `RulesText.tsx`, `card-text.ts`, `PipBadge.tsx` (and their `.test.ts(x)` files: `RulesText.test.tsx`, `RulesText.nesting.test.ts`, `rules-text-highlight.test.ts`, `card-text.test.ts`).
- Modify: every importer of these modules (find with grep).

- [ ] **Step 1: Enumerate call sites.** `grep -rn "from \"[./]*components/RulesText\"\|from \"[./]*components/card-text\"\|from \"[./]*components/PipBadge\"" src/` — record the list.
- [ ] **Step 2: Move the files** (git mv) into `src/cumulus/components/`, moving their tests alongside.
- [ ] **Step 3: Fix imports inside the moved files** so their remaining dependencies are either cumulus-internal or allowlisted (types). Any UI helper they pull that is not yet in Cumulus moves too (RulesText's closure is small: `card-text`, `PipBadge`).
- [ ] **Step 4: Re-point external call sites** to the new `src/cumulus/components/...` paths.
- [ ] **Step 5: Run the moved tests** — `npx vitest run src/cumulus/components/RulesText.test.tsx src/cumulus/components/RulesText.nesting.test.ts src/cumulus/components/rules-text-highlight.test.ts src/cumulus/components/card-text.test.ts`. Expected: PASS unchanged. These existing tests are the regression guarantee for the move (they pin the tokenizer/highlight contract); no new tests are added.
- [ ] **Step 6:** `npm run typecheck && npm run lint && npm test`. Expected: PASS, boundary rule green.
- [ ] **Step 7:** Add RulesText to the Cumulus registry with a demo rendering real authored rules text (a curated card's text). Commit (`refactor(cumulus): move RulesText and card-text into cumulus`), push.

### Task 4.2: Move GameCard/CardView (+ closure)

**Files:**
- Move into `src/cumulus/components/`: `CardView.tsx` (→ exported as `GameCard`), `card-display-scale.ts`, `GlowIcon.tsx`, `CardStatOrb.tsx`, `useCardTermPopover.tsx`, `useFitText.ts` (and their tests: `CardView.test.tsx`, `CardView.artpan.test.ts`, `HoverZoomCard.test.tsx` if it exercises CardView, plus any helper tests).
- Decide per the spec: `transfiguration-logic` (game logic + a type) — if it stays shared non-UI game logic, add its path to the ESLint allowlist rather than moving it; if it is UI-coupled, move it. Inspect before choosing; record the decision in the commit message.

- [ ] **Step 1:** Enumerate call sites of each moved module via grep (record the list).
- [ ] **Step 2:** `git mv` the files + their tests into `src/cumulus/components/`. Re-export `CardView` as `GameCard` (keep a `CardView` alias if external code uses that name, to minimize churn — or re-point all callers; prefer re-pointing).
- [ ] **Step 3:** Resolve the `transfiguration-logic` decision (move or allowlist); if allowlisting, extend `ALLOWLIST` in `no-external-ui-imports.js` **and** its RuleTester test with the new valid case (keep the gate honest).
- [ ] **Step 4:** Re-point external call sites.
- [ ] **Step 5:** Run the moved tests. Expected: PASS unchanged (they pin card rendering geometry — the `--cv-*` scale — and art-pan behavior; that is the move's regression net).
- [ ] **Step 6:** `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 7:** Register GameCard with a demo rendering a few curated real card UUIDs (deterministic set), showing `compact`, `exhausted`, `counters` affordances. Commit (`refactor(cumulus): move CardView into cumulus as GameCard`), push.

---

## Phase 5 — Atlas port and entity unifications

### Task 5.1: Port Atlas Node / Edge / Defs

**Files:**
- Move into `src/cumulus/components/`: `AtlasNode.tsx`, `atlas-display.ts`, plus `DreamscapeSiteNode.tsx`'s dependency `dreamscape-scatter.ts` (shared with SiteNode in 5.2).
- Create: `src/cumulus/components/AtlasEdge.tsx`, `AtlasEdgeDefs.tsx` — the four connector kinds (`traveled/open/dim/locked`) and the shared SVG `<defs>` (gradients / flow markers). Local atlas is authoritative; the design's reconstruction is reference only.

- [ ] Move `AtlasNode` + `atlas-display` (git mv, with `atlas-generator.test.ts` if it targets these; note `atlas-display` references atlas art already served from `public/`).
- [ ] Build `AtlasEdge` + `AtlasEdgeDefs` from the local atlas edge rendering (extract the connector SVG from `AtlasScreen`/`atlas.css` into reusable components). `AtlasNode` states (`unrevealed/revealedLocked/available/completed/forgone`) and `boss`/`starter` flags per the spec.
- [ ] Re-point call sites; run any moved atlas tests; typecheck + lint + QA `/cumulus#/atlas-node` against a real atlas fixture (`__test-helpers__/atlas-fixtures`). Commit (`refactor(cumulus): port atlas node/edge/defs into cumulus`), push.

### Task 5.2: Unify Dreamsign and SiteNode through InfoCard

**Files:**
- Create: `src/cumulus/components/Dreamsign.tsx` (unify local `DreamsignHoverCard` / `DreamsignArtTile` with design `components/entities/Dreamsign.jsx`).
- Create: `src/cumulus/components/SiteNode.tsx` (unify local `DreamscapeSiteNode` with design `components/journey/SiteNode.jsx`).
- Move any remaining local helper closure these need.

- [ ] Dispatch one subagent each: read both the local component(s) and the design source, produce a unified `.tsx` whose touch/hover preview routes through `InfoCard` (`object` variant for Dreamsign, `SITE_DISC`/`icon` for SiteNode) per the input-adaptive model. Keep props documented for docgen.
- [ ] Re-point external call sites of the local originals to the new Cumulus components; move/keep their tests.
- [ ] Recipe verification (typecheck, lint boundary gate, QA both input modes) + commit + push per component.

---

## Phase 6 — Full-screen mockups, Intro/Primitives content, polish

### Task 6.1: Introduction / Design Philosophy section

**Files:** Create `src/cumulus/docs/IntroSection.tsx`.

Condense the design's governing principles into the Intro (per the spec's §6): material continuity, the legibility ladder, popup rule R-17, and content voice. Prose content, dogfooding Cumulus tokens for its own chrome. No test. QA + commit + push.

### Task 6.2: Primitives section

**Files:** Create `src/cumulus/docs/PrimitivesSection.tsx`.

Render color / typography / radius / spacing / iconography / motion / glow specimens from `parseCssTokens(cumulus-tokens.css)` grouped by the `@kind` markers (color, radius, shadow, other) and by token-name prefix. Because it is generated from the tokens, it never goes stale by hand. No golden test (would pin volatile design values). QA + commit + push.

### Task 6.3: Per-component full-screen mockups

**Files:** Create `src/cumulus/docs/mockups/<id>.tsx` for each registered component; wire the `mockup` route in `ComponentPage`/`CumulusApp`.

Each mockup composes the component into a realistic full-screen (`100vw×100vh`, responsive) UI using real content where it exists (curated card UUIDs, atlas fixtures, production art from `public/`). Reachable at `/cumulus#/<id>/mockup` with a back affordance to the component page. No unit tests (visual); QA each at desktop + emulated mobile. Commit per mockup (or per small batch), push.

### Task 6.4: Final sweep

- [ ] `npm run regenerate-assets` (exercises the new token + metadata generation steps); confirm the generated `tokens.ts` and `cumulus-metadata.json` are up to date and committed.
- [ ] `npm run lint && npm run typecheck && npm test` all green.
- [ ] Full `/cumulus` QA pass: TOC → every component page (demo + controls + props table) → every mockup, desktop + 390×844, checking the captured error buffer for render errors / console errors / unhandled rejections.
- [ ] Commit any regenerated artifacts (`chore(cumulus): refresh generated tokens and metadata`), push.

---

## Self-review

**Spec coverage:** TOC/Intro/Primitives/Components sections (Phase 1.4, 6.1, 6.2); interactive demo + programmatic props table per component (1.1, 1.2, 1.4, recipe); click-through mockups (6.3); every roster row (Phases 2–5); isolation + fail-closed lint (0.5); token import + typed mirror (0.2–0.4); hash routing (1.3); accent liquid-glass primary actions (2.x); GroupPanel CSS-only (3.2); input-adaptive press-reveal (3.1); real content (4.x, 5.x, 6.3). No spec requirement is left without a task.

**Placeholder scan:** No "TBD"/"similar to Task N"/"add error handling". The repeated component work is a single explicit recipe + an enumerated parameter table (each row carries its own constraints), not cross-references.

**Type consistency:** `PropMeta` (1.1) is consumed unchanged by `controlForProp` (1.2) and `PropsTable` (1.4). `ControlSpec` (1.2) is consumed by `ControlPanel` (1.4). `CumulusRoute` (1.3) is consumed by `CumulusApp` (1.4). `ALLOWLIST` (0.5) is extended in lockstep with its test in 4.2. Registry `docName` keys the metadata JSON from 1.1.

**Snippet justification:** Embedded blocks are all contracts or exact insertion points — the `main.tsx` route branch (placement is semantic), `PropMeta`/`ControlSpec`/`CumulusRoute` types (cross-task contracts), the control-mapping rule set (the decision itself), and the RuleTester valid/invalid cases (the boundary contract, where the exact import shapes are the point). Implementation bodies (parser, generator, rule logic, router) are described in prose because the signature plus stated guarantees determine them.

**Test value:** Tests target bug classes — CSS-var parser (comment/`;` robustness, `@kind` capture), docgen extractor (union normalization, description/required capture), control inference (each contract branch + the `none` fallback), hash router (empty-hash and unknown-segment edge cases, id canonicalization), the ESLint rule (fail-closed default, allowlist correctness, scope), and the press-reveal tap-vs-hold contract. Moved production components rely on their **existing** tests as the migration regression net rather than new duplicative ones. No table-mirror, no per-token snapshot, no "renders without crashing" filler is specified (AGENTS.md forbids tests that break on design-data change; QA covers the visual surface).
