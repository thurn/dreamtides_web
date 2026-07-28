# Cumulus Revisions Phase 0: Enforcement Rails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the guardrails (module boundary, four lint/integrity checks, a legacy ratchet, and generated adoption counts) that later Cumulus-revision phases rely on, each with an explicit baseline so the tree is green at every commit.

**Architecture:** Two enforcement surfaces. (1) ESLint flat config: a `no-restricted-imports` block that bans `cumulus/internal` imports outside `src/cumulus/`, plus two new single-file rules (`no-raw-safe-area-env`, `no-inline-glass`) registered on the existing `cumulus` plugin. (2) Cross-file vitest integrity tests under `scripts/` (the `cumulus-generated-docs-drift.test.mjs` precedent) that scan source text: duplicate visual literals, orphan tokens, ghost components, and a legacy-tier ratchet. Each check that would fail on today's known debt carries an exported `const BASELINE` allowlist; later phases delete baseline entries as they clean.

**Tech Stack:** ESLint flat config (`eslint.config.js`, `typescript-eslint`), custom ESLint rules in `eslint-rules/*.js` tested with `eslint`'s `RuleTester` under vitest, cross-file integrity tests as `scripts/*.test.mjs` vitest files (Node, the `typescript` compiler API for AST scans), and `scripts/generate-cumulus-docs.mjs` (Node) for adoption counts.

## Global Constraints

- Run every command from the repository root of this worktree: `/Users/dthurn/quest_prototype/.claude/worktrees/cumulus-audit-revisions`.
- `node_modules` is not committed. If a check errors with a missing package, run `npm install` first.
- `npm run lint` (`eslint src/`), `npm run typecheck` (`tsc --noEmit`), and `npm test` (`vitest run`) must all be green at the end of every task, before its commit.
- Every commit uses a detailed conventional-commit message (ending with your own session's `Claude-Session:` trailer if your harness provides one), and is pushed immediately (`git push`) — do not batch. Do not create new branches; commit on the branch the worktree is already on (`worktree-cumulus-audit-revisions`).
- Never key or compare cards by name; resolve card names only at the display edge (not relevant to this phase's files, but hold the line).
- Documentation and comments describe the current system; never use removed-state phrasing ("no longer", "used to", "unlike before").
- Do not print a change summary after committing (repo `AGENTS.md`).
- If you hit a pre-existing issue, describe it in `./pre-existing-issues.txt` and include it in the commit.

## Reference facts verified for this plan (do not re-derive; trust these)

- **Importers of `glass-surface.ts`** (5, all real `import` statements): `src/cumulus/screens/MobileDeckViewer.tsx:37`, `src/cumulus/screens/DesktopDeckViewer.tsx:59`, `src/cumulus/components/overlay/InfoCard.tsx:59`, `src/cumulus/components/overlay/InfoCard.test.ts:21`, `src/components/StartingDeckModal.tsx:12`.
- **Importers of `control-treatment.ts`** (6): `src/cumulus/screens/DesktopDeckViewer.tsx:60`, `src/cumulus/screens/MobileDeckViewer.tsx:40`, `src/cumulus/components/controls/SegmentedControl.tsx:24`, `src/cumulus/components/controls/Select.tsx:49` (multi-line named import ending at that line), `src/components/StartingDeckModal.tsx:13`, `src/components/DreamscapeJourneyMenu.tsx:29`.
- The two moved files import only from `../../primitives/tokens` and `../../primitives/color`; they do **not** import each other.
- `no-untokenized-lengths.js`, `no-hardcoded-values.js`, `no-raw-interactive-elements.js`, and `valid-token-references.js` each carry an `EXEMPT_PREFIXES` array with `src/cumulus/primitives/` and `src/cumulus/components/` (the last three also `src/cumulus/docs/`; the first two also `src/cumulus/screens/devtools/`). Moving the two material files to `src/cumulus/internal/` removes them from the `components/` exemption, so `no-hardcoded-values` would start firing on their raw color literals — Task 1 adds `src/cumulus/internal/` to all four.
- `npm test` (vitest) discovers `scripts/**/*.test.mjs` and `eslint-rules/**/*.test.{ts,js}` (`vite.config.ts` `test.include`). `npm run lint` runs `eslint src/` only — `scripts/` and `eslint-rules/` are not linted.

---

### Task 1: Move materials to `src/cumulus/internal/` and ban external reach-in

**Files:**
- Move (git mv): `src/cumulus/components/controls/glass-surface.ts` → `src/cumulus/internal/glass-surface.ts`; `src/cumulus/components/controls/control-treatment.ts` → `src/cumulus/internal/control-treatment.ts`.
- Modify: the 2 moved files' own relative imports; the 8 importer files enumerated in Reference facts; `eslint.config.js` (new `no-restricted-imports` boundary block); the `EXEMPT_PREFIXES` array in each of `eslint-rules/no-hardcoded-values.js`, `eslint-rules/no-raw-interactive-elements.js`, `eslint-rules/valid-token-references.js`, `eslint-rules/no-untokenized-lengths.js`.
- Test: existing `npm run lint`/`typecheck`/`test` are the guard; no new test file.

**Interfaces:**
- Produces: modules at `src/cumulus/internal/glass-surface.ts` (`export function glassSurfaceStyle(): React.CSSProperties`) and `src/cumulus/internal/control-treatment.ts` (`export function glassTrack(): CSSProperties`, `export function controlChrome(): ControlChrome`, `export function glassIconButtonChrome(): CSSProperties`, `export interface ControlChrome`, `export const CONTROL_INACTIVE_COLOR`).
- Produces: ESLint `no-restricted-imports` diagnostic on any import matching `**/cumulus/internal/**` outside `src/cumulus/` (except the two baselined legacy files).

Steps:

- [ ] Move the two files preserving history:
  ```bash
  mkdir -p src/cumulus/internal
  git mv src/cumulus/components/controls/glass-surface.ts src/cumulus/internal/glass-surface.ts
  git mv src/cumulus/components/controls/control-treatment.ts src/cumulus/internal/control-treatment.ts
  ```
- [ ] Fix the moved files' own relative imports. They were two levels deep under `components/controls/`, now one level under `internal/`: rewrite each `../../primitives/…` specifier to `../primitives/…` (in `glass-surface.ts`: `../../primitives/tokens`; in `control-treatment.ts`: `../../primitives/color` and `../../primitives/tokens`).
- [ ] Update the 5 `glass-surface` importers so each resolves to the new path:
  - `src/cumulus/screens/MobileDeckViewer.tsx` → `"../internal/glass-surface"`
  - `src/cumulus/screens/DesktopDeckViewer.tsx` → `"../internal/glass-surface"`
  - `src/cumulus/components/overlay/InfoCard.tsx` → `"../../internal/glass-surface"`
  - `src/cumulus/components/overlay/InfoCard.test.ts` → `"../../internal/glass-surface"`
  - `src/components/StartingDeckModal.tsx` → `"../cumulus/internal/glass-surface"`
- [ ] Update the 6 `control-treatment` importers:
  - `src/cumulus/screens/DesktopDeckViewer.tsx` → `"../internal/control-treatment"`
  - `src/cumulus/screens/MobileDeckViewer.tsx` → `"../internal/control-treatment"`
  - `src/cumulus/components/controls/SegmentedControl.tsx` → `"../../internal/control-treatment"`
  - `src/cumulus/components/controls/Select.tsx` → `"../../internal/control-treatment"`
  - `src/components/StartingDeckModal.tsx` → `"../cumulus/internal/control-treatment"`
  - `src/components/DreamscapeJourneyMenu.tsx` → `"../cumulus/internal/control-treatment"`
- [ ] Add `"src/cumulus/internal/"` as a new element of the `EXEMPT_PREFIXES` array in all four rules, so the material tier keeps authoring raw values exactly as `components/` did. Post-edit the array in `no-untokenized-lengths.js` must contain exactly these five prefixes (the other three rules add `internal/` to their existing set):
  ```js
  const EXEMPT_PREFIXES = [
    "src/cumulus/primitives/",
    "src/cumulus/components/",
    "src/cumulus/internal/",
    "src/cumulus/docs/",
    "src/cumulus/screens/devtools/",
  ];
  ```
  Also update each rule's JSDoc that enumerates the exempt tiers to name `internal/` (the material recipes) alongside `primitives/` and `components/` — write the current state, no removed-state phrasing.
- [ ] Add a `no-restricted-imports` boundary block to `eslint.config.js`, inserted into the `tseslint.config(...)` array immediately before the final `{ ignores: [...] }` block. Contract:
  - `files: ["src/**/*.{ts,tsx}"]`.
  - `ignores` baselines exactly the cumulus tier and the two legacy reach-in files: `"src/cumulus/**"`, `"src/components/StartingDeckModal.tsx"`, `"src/components/DreamscapeJourneyMenu.tsx"`.
  - Rule `"no-restricted-imports"` set to `"error"` with one pattern group `["**/cumulus/internal/**", "**/cumulus/internal"]` and a message directing the author to import a public Cumulus component or migrate the screen (naming the `cumulus-migrate` skill).
  - Rationale comment: public Cumulus components rendered from a legacy screen are the migration story and stay legal; wearing raw materials outside the linted `src/cumulus/` tier is not. The two baselined files are removed in Phase 3 (StartingDeckModal migrates to the Cumulus tier; the dreamscape gear moves onto IconButton), at which point their `ignores` entries shrink to nothing.
- [ ] Run lint, typecheck, test — all must pass. In-cumulus importers spell `../internal/…` or `../../internal/…` (no substring `cumulus/internal`, so the pattern does not fire on them); the two legacy files spell `../cumulus/internal/…` and match the pattern but are baselined by `ignores`.
  ```bash
  npm run lint && npm run typecheck && npm test
  ```
  Expected: exit 0, no `no-restricted-imports` errors, no `no-hardcoded-values` errors on the moved files.
- [ ] Commit and push. Message: `refactor(cumulus): move glass materials to src/cumulus/internal and ban external reach-in`.
  ```bash
  git add -A && git commit -m "…" && git push
  ```

---

### Task 2: `no-raw-safe-area-env` ESLint rule

**Files:**
- Create: `eslint-rules/no-raw-safe-area-env.js`, `eslint-rules/no-raw-safe-area-env.test.ts`.
- Modify: `eslint.config.js` (import the rule + register in `cumulusPlugin.rules` + enable in the cumulus files block + add a `DraftScreen.tsx` baseline-override block).
- Test: `eslint-rules/no-raw-safe-area-env.test.ts` (RuleTester under vitest).

**Interfaces:**
- Produces: rule `cumulus/no-raw-safe-area-env`; module exports `default` (the rule), `toRepoRelativePosix(absolutePath, cwd): string`, `isGovernedFile(fileRelative): boolean`.
- Consumes: nothing beyond `node:path`.

Rule contract:
- `isGovernedFile(rel)` is true iff `rel` starts with `src/cumulus/`, is not a `*.test.*`/`*.spec.*` file, and does not start with any `EXEMPT_PREFIXES` entry. `EXEMPT_PREFIXES = ["src/cumulus/primitives/", "src/cumulus/docs/"]` (the primitives token mirror is the one legitimate declarer of the `env()` fallback).
- Trigger: report `messageId: "rawSafeAreaEnv"` on any string `Literal` value or `TemplateElement` raw text matching `/env\(\s*safe-area-inset-/`.
- `toRepoRelativePosix` = `path.relative(cwd, abs)` with `path.sep` normalized to `/`. In `create`, derive the filename from `context.filename ?? context.getFilename()` and cwd from `context.cwd ?? process.cwd()`; bail (`return {}`) when the file is not governed.
- Message text: explains a raw `env(safe-area-inset-*)` reads 0 inside the device-frame screenshot iframe (so the simulated inset is ignored) and directs the author to the injected channel `var(--safe-area-inset-top)` (or a `--safe-*` design floor), citing the safe-area chapter in the Cumulus token docs.

Steps:

- [ ] Write the failing test `eslint-rules/no-raw-safe-area-env.test.ts` first. It has two unit `describe`s plus a `RuleTester` run (wire `RuleTester.describe/it` to vitest, parser `@typescript-eslint/parser`, `ecmaVersion: 2022`, `sourceType: "module"`, JSX enabled).
  - `isGovernedFile`: true for `src/cumulus/screens/DraftScreen.tsx` and `src/cumulus/components/overlay/InfoCard.tsx`; false for `src/cumulus/primitives/tokens.ts`, `src/cumulus/docs/CumulusApp.tsx`, `src/cumulus/screens/DraftScreen.test.tsx`, `src/components/StartingDeckModal.tsx`.
  - `toRepoRelativePosix("/repo/src/cumulus/screens/DraftScreen.tsx", "/repo")` → `"src/cumulus/screens/DraftScreen.tsx"`.
  - Valid cases (filename `src/cumulus/screens/DraftScreen.tsx` unless noted): `var("--safe-area-inset-top")` token read; `token("--safe-top")` design floor; a raw `env(safe-area-inset-top, 0px)` in `src/cumulus/primitives/tokens.ts` (exempt); a raw env in `src/components/StartingDeckModal.tsx` (non-cumulus, inert).
  - Invalid cases, each expecting `[{ messageId: "rawSafeAreaEnv" }]`: a raw env in a plain string literal; a raw env inside a template chunk, e.g.
    ```ts
    code: 'const TOP = `max(env(safe-area-inset-top), ${token("--safe-top")})`;'
    ```
- [ ] Write `eslint-rules/no-raw-safe-area-env.js` to satisfy the contract above.
- [ ] Wire it into `eslint.config.js`: import the rule alongside the other `eslint-rules/*` imports; register `"no-raw-safe-area-env"` in `cumulusPlugin.rules`; add `"cumulus/no-raw-safe-area-env": "error"` to the cumulus files block (the block whose `files` is `["src/cumulus/**/*.{ts,tsx}", "src/screens/cumulus_adapters/**/*.{ts,tsx}"]`). Then add a baseline-override block (before the final `ignores` block) that scopes `files: ["src/cumulus/screens/DraftScreen.tsx"]`, re-declares `plugins: { cumulus: cumulusPlugin }`, and sets `"cumulus/no-raw-safe-area-env": "off"`. Rationale: DraftScreen reads raw `env(safe-area-inset-top)` at its notch clearance today; Phase 1 rewrites it to `var(--safe-area-inset-top)` and deletes this override.
- [ ] Run the rule test in isolation to see it pass, then the full suite:
  ```bash
  npx vitest run eslint-rules/no-raw-safe-area-env.test.ts
  npm run lint && npm run typecheck && npm test
  ```
  Expected: the rule test passes; `npm run lint` is green (DraftScreen baselined, no other governed file has raw env()).
- [ ] Commit and push. Message: `feat(cumulus-lint): add no-raw-safe-area-env rule`.

---

### Task 3: `no-inline-glass` ESLint rule

**Files:**
- Create: `eslint-rules/no-inline-glass.js`, `eslint-rules/no-inline-glass.test.ts`.
- Modify: `eslint.config.js` (import + register + enable in the cumulus files block).
- Test: `eslint-rules/no-inline-glass.test.ts`.

**Interfaces:**
- Produces: rule `cumulus/no-inline-glass`; module exports `default`, `toRepoRelativePosix(absolutePath, cwd): string`, `isGovernedFile(fileRelative): boolean`.

Note: no baseline entries. The only Cumulus-tier raw glass literals live in `glass-surface.ts`/`control-treatment.ts` (moved to `src/cumulus/internal/**` in Task 1 — the legal home), `CumulusApp.tsx` (docs tier — exempt), and `CardView.tsx` (`blur(var(--cv-textbox-blur)) saturate(1)` — token-driven, passes via the `blur(var(` carve-out).

Rule contract:
- `isGovernedFile` uses the same shape as Task 2 but with `EXEMPT_PREFIXES = ["src/cumulus/internal/", "src/cumulus/docs/", "src/cumulus/primitives/"]`.
- A string is raw glass iff it does NOT contain a token-driven blur and DOES contain a raw numeric blur or saturate. The three regexes (the genuinely tricky part) are:
  ```js
  const RAW_BLUR_RE = /blur\(\s*\.?\d/;
  const RAW_SATURATE_RE = /saturate\(\s*\.?\d/;
  const TOKEN_BLUR_RE = /blur\(\s*var\(/; // e.g. CardView's blur(var(--cv-textbox-blur))
  ```
  i.e. `isRawGlass(text) = !TOKEN_BLUR_RE.test(text) && (RAW_BLUR_RE.test(text) || RAW_SATURATE_RE.test(text))`.
- Report `messageId: "inlineGlass"` on any string `Literal` value or `TemplateElement` raw that is raw glass. A property whose VALUE is an expression (`glass.backdropFilter`) is not a literal and is never flagged — that is the sanctioned spread-the-recipe pattern.
- Message text: raw glass filter literal; the liquid-glass material is defined once in `src/cumulus/internal/glass-surface.ts` — spread `glassSurfaceStyle()` (or a component that wears it) instead of inlining `blur()`/`saturate()`; token-driven `blur(var(--…))` is fine.

Steps:

- [ ] Write the failing test `eslint-rules/no-inline-glass.test.ts` (same RuleTester harness as Task 2).
  - `isGovernedFile`: true for `src/cumulus/components/card/CardView.tsx`, `src/cumulus/screens/MobileDeckViewer.tsx`; false for `src/cumulus/internal/glass-surface.ts`, `src/cumulus/docs/CumulusApp.tsx`, `src/cumulus/primitives/tokens.ts`, `src/cumulus/components/overlay/InfoCard.test.ts`.
  - `toRepoRelativePosix("/repo/src/cumulus/components/card/CardView.tsx", "/repo")` → the repo-relative path.
  - Valid cases: `"blur(var(--cv-textbox-blur)) saturate(1)"` in CardView (token blur wins even alongside a numeric saturate); a member-expression value `glass.backdropFilter` (not a literal); a raw `"blur(22px) saturate(1.5)"` in `src/cumulus/internal/glass-surface.ts` (legal home); a raw `"blur(8px)"` in `src/cumulus/docs/CumulusApp.tsx` (docs-exempt); a raw `"blur(8px)"` in `src/components/HUD.tsx` (non-cumulus, inert).
  - Invalid cases, each `[{ messageId: "inlineGlass" }]`: `"blur(22px) saturate(1.5)"` in CardView; a bare `"saturate(1.5)"` with no token blur, e.g.
    ```ts
    code: 'const s = { WebkitBackdropFilter: "saturate(1.5)" };'
    ```
- [ ] Write `eslint-rules/no-inline-glass.js` to satisfy the contract.
- [ ] Wire it into `eslint.config.js`: import the rule; register `"no-inline-glass"` in `cumulusPlugin.rules`; add `"cumulus/no-inline-glass": "error"` to the cumulus files block.
- [ ] Run:
  ```bash
  npx vitest run eslint-rules/no-inline-glass.test.ts
  npm run lint && npm run typecheck && npm test
  ```
  Expected: rule test passes; `npm run lint` green (no governed-tier raw glass — the material files are now under `internal/`, CardView passes the `blur(var(` carve-out, CumulusApp is docs-exempt).
- [ ] Commit and push. Message: `feat(cumulus-lint): add no-inline-glass rule`.

---

### Task 4: Duplicate-literal integrity test

**Files:**
- Create: `scripts/cumulus-duplicate-literals.test.mjs`.
- Test: itself (a vitest file).

**Interfaces:**
- Produces: `export const BASELINE` (array of `[literalPrefix, fileA, fileB]`, `fileA < fileB`), `export function findCrossFileDuplicates(): { literal: string, files: string[] }[]`.
- Consumes: `typescript` (AST), `node:fs`, `node:path`.

Detector contract:
- Walk `src/cumulus` for `*.ts`/`*.tsx`/`*.css`, excluding `*.test.*`/`*.spec.*`, the generated mirror `src/cumulus/primitives/tokens.ts`, and anything under `/cumulus/docs/` (the mirror is a projection of `cumulus-tokens.css`; demos legitimately re-type values). For `.css`, extract each `: value;` declaration; for TS/TSX, collect string literals, no-substitution templates, and template-expression full text (backticks stripped).
- A literal counts only if, trimmed, its length ≥ `MIN_LENGTH` (24) and it matches the visual regex. These thresholds are the tricky choice:
  ```js
  const MIN_LENGTH = 24;
  const VISUAL =
    /(gradient\(|rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}\b|blur\(|saturate\(|\binset\b|box-shadow|\d+px\s+\d+px)/;
  ```
- A cross-file duplicate is a trimmed literal appearing in ≥2 distinct files; `files` is the sorted distinct file list. Same-file repeats are ignored.
- `isBaselined(dup)`: the sorted `[a, b]` file pair equals a BASELINE `[_, fileA, fileB]` and `dup.literal` starts with that entry's `literalPrefix`.
- Two tests: (1) every duplicate is baselined — assert `findCrossFileDuplicates().filter(d => !isBaselined(d))` equals `[]`, with a failure message listing each unexpected `DUPLICATE <literal>` and its files; (2) no stale BASELINE entry — assert every BASELINE entry still matches a live duplicate, listing any to remove.

The verified current cross-file duplicates (post-Task-1 paths) are exactly nine: two between `CardStatOrb.tsx` and `PipBadge.tsx`, six between the two internal glass files, one monogram gradient between `DreamAvatarPortrait.tsx` and `journey-start-desktop.tsx`. BASELINE is a data contract — reproduce it literally:

```js
export const BASELINE = [
  [
    "1px solid rgba(168, 85, 247, 0.55)",
    "src/cumulus/components/card/CardStatOrb.tsx",
    "src/cumulus/components/controls/PipBadge.tsx",
  ],
  [
    "0 8px 22px rgba(0, 0, 0, 0.55)",
    "src/cumulus/components/card/CardStatOrb.tsx",
    "src/cumulus/components/controls/PipBadge.tsx",
  ],
  [
    "linear-gradient(150deg, rgba(255,255,255,0.07)",
    "src/cumulus/internal/control-treatment.ts",
    "src/cumulus/internal/glass-surface.ts",
  ],
  [
    "blur(22px) saturate(1.5)",
    "src/cumulus/internal/control-treatment.ts",
    "src/cumulus/internal/glass-surface.ts",
  ],
  [
    "1px solid rgba(255,255,255,0.14)",
    "src/cumulus/internal/control-treatment.ts",
    "src/cumulus/internal/glass-surface.ts",
  ],
  [
    "inset 0 1px 1px rgba(255,255,255,0.22)",
    "src/cumulus/internal/control-treatment.ts",
    "src/cumulus/internal/glass-surface.ts",
  ],
  [
    "inset 0 -18px 30px rgba(255,255,255,0.04)",
    "src/cumulus/internal/control-treatment.ts",
    "src/cumulus/internal/glass-surface.ts",
  ],
  [
    "0 10px 34px rgba(6,2,14,0.5)",
    "src/cumulus/internal/control-treatment.ts",
    "src/cumulus/internal/glass-surface.ts",
  ],
  [
    "radial-gradient(circle at 50% 20%, color-mix(in srgb, ${token(\"--gold\")}",
    "src/cumulus/components/hud/DreamAvatarPortrait.tsx",
    "src/cumulus/screens/journey-start-desktop.tsx",
  ],
];
```

Steps:

- [ ] Write `scripts/cumulus-duplicate-literals.test.mjs` (`// @vitest-environment node`) to the contract above, with the literal BASELINE.
- [ ] Run the test; it must pass with the nine baselined duplicates and zero unexpected:
  ```bash
  npx vitest run scripts/cumulus-duplicate-literals.test.mjs
  ```
  Expected: 2 passing tests. If the "no unexpected" assertion prints a DUPLICATE not in BASELINE, a new duplicate was introduced since authoring — either eliminate it or add it to BASELINE with its sorted file pair.
- [ ] Full suite:
  ```bash
  npm run lint && npm run typecheck && npm test
  ```
- [ ] Commit and push. Message: `test(cumulus): add duplicate-literal integrity check`.

---

### Task 5: Orphan-token integrity test

**Files:**
- Create: `scripts/cumulus-orphan-tokens.test.mjs`.
- Test: itself.

**Interfaces:**
- Produces: `export const BASELINE` (array of token names), `export function findOrphanTokens(): string[]` (sorted).

Detector contract:
- Parse token names from `src/cumulus/primitives/cumulus-tokens.css` (`/^\s*(--[a-zA-Z0-9_-]+)\s*:/gm`), skipping `--primitive-*` names.
- A token is orphaned when it has no READ anywhere under `src/` except the CSS file, the generated mirror `src/cumulus/primitives/tokens.ts`, `src/cumulus/docs/**`, and `*.test.*`/`*.spec.*`. A READ is `var(--x)` / `var(--x, …)` / `token("--x")` / `readLengthToken("--x")` (regex-matched against a properly escaped token name):
  ```js
  // isRead(name, text): true iff either matches (q = escaped name)
  new RegExp(`var\\(\\s*${q}\\s*[,)]`).test(text)
  new RegExp(`(token|readLengthToken)\\(\\s*["']${q}["']`).test(text)
  ```
  Writes (e.g. `right: "--display-cutout-right"` in `device-frame.ts`) do not count. `screens/devtools/` counts as a consumer.
- Two tests: (1) every orphan is in BASELINE — assert `findOrphanTokens().filter(t => !baseline.has(t))` equals `[]`, listing new orphans to wire or delete; (2) no stale BASELINE entry — assert every BASELINE token is still orphaned, listing now-read/deleted ones to remove.

The 70-token BASELINE below was produced by running this exact logic on the tree at authoring (2026-07-07). It is a data contract — reproduce it literally. Phase 1 prunes the audit's §4 set (`--card-aspect`, the `--cat-*` family, `--space-0`, `--tide-earthy`, `--control-h`/`-sm`, the four dead `--glow-*`, …) from both the token file and this list.

```js
export const BASELINE = [
  "--accent-tint",
  "--bg-band",
  "--card-aspect",
  "--cat-dreamsign",
  "--cat-grant",
  "--cat-improve",
  "--cat-remove",
  "--color-essence-glow-strong",
  "--color-primary",
  "--control-h",
  "--control-h-sm",
  "--cv-selection-color",
  "--device-h",
  "--device-w",
  "--display-cutout-right",
  "--dt-bg-0",
  "--dt-bg-1",
  "--dt-bg-2",
  "--dt-border",
  "--dt-enemy",
  "--dt-energy",
  "--dt-energy-border",
  "--dt-line",
  "--dt-player",
  "--dt-primary",
  "--dt-primary-light",
  "--dt-spark",
  "--dt-spark-border",
  "--dt-surface-light",
  "--ease-dream",
  "--font-logo",
  "--font-mono-canon",
  "--font-numeral",
  "--font-rules-canon",
  "--font-sans-canon",
  "--font-serif-canon",
  "--glow-accent",
  "--glow-accent-strong",
  "--glow-gold",
  "--glow-text",
  "--gradient-accent",
  "--gradient-energy",
  "--gradient-gold",
  "--gutter-tight",
  "--inset-press",
  "--motion-container-transform",
  "--motion-object-travel",
  "--radius-sheet",
  "--scrim-strong",
  "--shadow-sheet",
  "--shadow-sm",
  "--sheet-grab",
  "--space-0",
  "--space-12",
  "--stagger-travel",
  "--surface-chip",
  "--t-button",
  "--t-button-sm",
  "--t-display",
  "--t-lead",
  "--t-numeral",
  "--t-popover-body",
  "--t-popover-epithet",
  "--t-popover-headline",
  "--t-popover-meta",
  "--t-serif-body",
  "--text-on-card",
  "--tide-earthy",
  "--touch-min",
  "--tracking-wordmark",
];
```

Steps:

- [ ] Write `scripts/cumulus-orphan-tokens.test.mjs` (`// @vitest-environment node`) to the contract above, with the literal 70-entry BASELINE.
- [ ] Run the test:
  ```bash
  npx vitest run scripts/cumulus-orphan-tokens.test.mjs
  ```
  Expected: 2 passing. If the first assertion prints tokens, reconcile: the scan found orphans beyond BASELINE (a token was added or a reader removed since authoring) — add each to BASELINE or wire it. If the second prints tokens, remove them from BASELINE.
- [ ] Full suite:
  ```bash
  npm run lint && npm run typecheck && npm test
  ```
- [ ] Commit and push. Message: `test(cumulus): add orphan-token integrity check`.

---

### Task 6: Consumer helper, ghost-components test, and `status: "incubating"`

**Files:**
- Create: `scripts/lib/cumulus-consumers.mjs`, `scripts/cumulus-ghost-components.test.mjs`.
- Modify: `src/cumulus/docs/registry.ts` (add `status?: "incubating"` to `CumulusComponent`), `src/cumulus/docs/ComponentPage.tsx` (minimal incubating badge after the `<h1>`).
- Test: `scripts/cumulus-ghost-components.test.mjs`.

**Interfaces:**
- Produces: `scripts/lib/cumulus-consumers.mjs` exporting `computeConsumerCounts(): { id, title, docName, status, module, count }[]` in registry order, where `count` is the number of files — outside `src/cumulus/docs/` and non-test — that have a value (non-`import type`) import of the component's source module.
- Consumes (in the ghost test): `computeConsumerCounts`.

Helper contract (`computeConsumerCounts`):
- Parse `src/cumulus/docs/registry.ts` with the TypeScript AST: read the `CUMULUS_COMPONENTS` array-literal element export names and the file's import map (named import → module specifier) to locate each entry's demo file.
- For each demo, read `docName`, `title`, `status` (string properties) and the `Component` identifier from the demo's object literal; resolve the component's SOURCE module from the demo's import map via the `Component` identifier, falling back to the `docName` import. Throw if unresolved.
- Count files under `src/` whose relative default/named `import … from "…"` resolves to that source module, skipping files under `/cumulus/docs/`, `*.test.*`/`*.spec.*`, and any `import type` (type-only) declaration. A type-only import (`import type { Tide } from ".../TidePill"`) is NOT a consumer, so a component whose module is imported only for a re-exported type reads as 0. Both the ghost test and the docs generator (Task 8) use this so their adoption numbers agree.

Verified: every registry entry has ≥1 value consumer except `StatTile` (0) and `TidePill` (0 — its only importer is a type-only `import type { Tide }`).

Steps:

- [ ] Add the optional field to the `CumulusComponent` interface in `src/cumulus/docs/registry.ts`, after the `callout?` field: `status?: "incubating"`. Document it as the sanctioned escape from the ghost-components check — a component documented deliberately ahead of adoption, rendered as a visible "Incubating" badge; omit for shipped components (every entry should have a real consumer by Phase 3).
- [ ] Add a minimal incubating badge to `src/cumulus/docs/ComponentPage.tsx`, immediately after the page `</h1>`. It renders `Incubating` only when `entry.status === "incubating"`, as an inline-block pill styled purely with `token(...)` values (the docs tier is exempt from the visual lint rules, but `token()` is typed — use only keys that exist). Suggested tokens: `--space-3` (margin-top), `--space-1`/`--space-3` (padding), `--radius-pill`, `--t-lead` (font), `--text-on-accent` (color), `--accent` (background). If `typecheck` rejects any name, substitute the nearest existing token (grep `src/cumulus/primitives/tokens.ts` for valid keys).
- [ ] Write `scripts/lib/cumulus-consumers.mjs` to the helper contract above.
- [ ] Write `scripts/cumulus-ghost-components.test.mjs` (`// @vitest-environment node`), importing `computeConsumerCounts`. BASELINE is a data contract:
  ```js
  export const BASELINE = ["StatTile", "TidePill"]; // zero real consumers; deleted in Phase 4
  ```
  Two tests: (1) every entry has a real consumer, is `status: "incubating"`, or is baselined — assert `computeConsumerCounts().filter(c => c.count === 0 && c.status !== "incubating" && !BASELINE.includes(c.docName))` equals `[]`, listing each ghost `docName (module)`; (2) no stale BASELINE entry — assert no baselined `docName` now has `count > 0`.
- [ ] Run:
  ```bash
  npx vitest run scripts/cumulus-ghost-components.test.mjs
  npm run lint && npm run typecheck && npm test
  ```
  Expected: ghost test passes (only StatTile/TidePill at zero, both baselined); typecheck green (the `status` field and badge type-check).
- [ ] Commit and push. Message: `test(cumulus): add ghost-component integrity check and incubating status`.

---

### Task 7: Legacy-tier ratchet test

**Files:**
- Create: `scripts/cumulus-legacy-ratchet.test.mjs`.
- Test: itself.

**Interfaces:**
- Produces: `export const INTERNAL_IMPORTERS` (2 paths), `export const COMPONENTS_TSX` (33 basenames), `export function findInternalImporters(): string[]`, `export function directComponentsTsx(): string[]`.

Detector contract:
- `findInternalImporters()`: walk `src/` for `*.ts`/`*.tsx`, skip anything under `src/cumulus/`, and via the TS AST return (sorted, posix-normalized) every file with an `import` whose specifier matches `/cumulus\/internal(\/|$)/`.
- `directComponentsTsx()`: `readdirSync("src/components")` filtered to `*.tsx`, sorted (direct children only).
- Two tests: (1) `findInternalImporters()` deep-equals the sorted `INTERNAL_IMPORTERS` — a NEW file outside `src/cumulus/` reaching into `cumulus/internal` fails; both baselined offenders are removed in Phase 3; (2) `directComponentsTsx()` deep-equals the sorted `COMPONENTS_TSX`, with a message telling the author to build new UI in the Cumulus tier (`src/cumulus/` + `src/screens/cumulus_adapters/`) and to update `COMPONENTS_TSX` only for an intentional add/remove (Phase 3's deletion of StartingDeckModal shrinks the pin).

Both arrays are data contracts — reproduce literally:

```js
export const INTERNAL_IMPORTERS = [
  "src/components/DreamscapeJourneyMenu.tsx",
  "src/components/StartingDeckModal.tsx",
];

export const COMPONENTS_TSX = [
  "BattleSiteRoute.test.tsx",
  "BattleSiteRoute.tsx",
  "CardDisplay.test.tsx",
  "CardDisplay.tsx",
  "CardHoverPreview.test.tsx",
  "CardHoverPreview.tsx",
  "CardOverlay.tsx",
  "DeckViewer.test.tsx",
  "DeckViewer.tsx",
  "DreamAvatarPopover.test.tsx",
  "DreamAvatarPopover.tsx",
  "DreamscapeJourneyMenu.test.tsx",
  "DreamscapeJourneyMenu.tsx",
  "DreamwellCardView.tsx",
  "ErrorBoundary.test.tsx",
  "ErrorBoundary.tsx",
  "GlossaryPopup.test.tsx",
  "GlossaryPopup.tsx",
  "HUD.test.tsx",
  "HUD.tsx",
  "HudDreamsignLayoutDemo.tsx",
  "HudDreamsignRow.test.tsx",
  "HudDreamsignRow.tsx",
  "OfferingScreen.tsx",
  "PoolViewer.test.tsx",
  "PoolViewer.tsx",
  "ScreenRouter.test.tsx",
  "ScreenRouter.tsx",
  "SiteGuide.tsx",
  "SiteSceneBackdrop.tsx",
  "StartingDeckModal.test.tsx",
  "StartingDeckModal.tsx",
  "TransfigurationCardDemo.tsx",
];
```

Steps:

- [ ] Write `scripts/cumulus-legacy-ratchet.test.mjs` (`// @vitest-environment node`) to the contract above, with both literal arrays.
- [ ] Run:
  ```bash
  npx vitest run scripts/cumulus-legacy-ratchet.test.mjs
  npm run lint && npm run typecheck && npm test
  ```
  Expected: both assertions pass. If the second fails, an unrelated `src/components/*.tsx` was added or removed since authoring — reconcile `COMPONENTS_TSX`.
- [ ] Commit and push. Message: `test(cumulus): add legacy-tier ratchet`.

---

### Task 8: Generated adoption counts in `npm run cumulus-docs`

**Files:**
- Modify: `scripts/generate-cumulus-docs.mjs` (compute counts, render on index + each page), `scripts/generate-cumulus-docs.test.mjs` (updated call signatures), and the committed generated docs under `.llms/skills/cumulus/` (regenerated output).
- Test: `scripts/generate-cumulus-docs.test.mjs` + the existing `scripts/cumulus-generated-docs-drift.test.mjs` (recomputes and compares committed output).

**Interfaces:**
- Consumes: `computeConsumerCounts` from `scripts/lib/cumulus-consumers.mjs` (Task 6).
- Produces: `renderComponentMarkdown(doc, props, consumerCount)` and `renderIndexSection(docs, countByTitle)` — updated signatures; `computeDocOutputs()` unchanged shape, now embedding counts.

Contract for the generator changes:
- Import `computeConsumerCounts` alongside the other imports.
- `renderComponentMarkdown` gains a third param `consumerCount`. When it is a number, append a line after the existing `${doc.group} · Live demo …` block (before the blurb): `Real consumers: **<n>** (imports outside \`src/cumulus/docs/\` and tests).`
- `renderIndexSection` gains a second param `countByTitle` (a `Map<title, count>`). Add a `Consumers` column between `Group` and `Reference`; header becomes `| Component | Group | Consumers | Reference | What it is |`; each row prints `countByTitle.get(doc.title)` or `—` when absent.
- In `computeDocOutputs()`, after loading `metadata`, build `const countByTitle = new Map(computeConsumerCounts().map(c => [c.title, c.count]))`, pass `countByTitle.get(doc.title)` into each `renderComponentMarkdown` call, and pass `countByTitle` into the `renderIndexSection` splice. `computeConsumerCounts` keys on the demo `title`; the doc `title` from `extractDemoDoc` is the same source literal, so titles match.

Steps:

- [ ] Apply the generator contract above to `scripts/generate-cumulus-docs.mjs`.
- [ ] Update the unit tests in `scripts/generate-cumulus-docs.test.mjs`: every `renderComponentMarkdown(doc, props)` call gains a third argument (a fixed number, e.g. `3`) plus one assertion that the line renders, e.g. `expect(markdown).toContain("Real consumers: **3**")`. Update the two `renderIndexSection(docs)` calls to pass a map, e.g. `renderIndexSection(docs, new Map(docs.map(d => [d.title, 0])))`, and assert the new column header, e.g. `expect(index).toContain("| Component | Group | Consumers |")`.
- [ ] Regenerate the committed docs and run the drift gate:
  ```bash
  npm run cumulus-docs
  npx vitest run scripts/generate-cumulus-docs.test.mjs scripts/cumulus-generated-docs-drift.test.mjs
  npm run lint && npm run typecheck && npm test
  ```
  Expected: `npm run cumulus-docs` rewrites `.llms/skills/cumulus/components/*.md`, `SKILL.md`, and `tokens.md` with counts; the drift test passes because committed == recomputed.
- [ ] Commit and push (include the regenerated docs). Message: `feat(cumulus-docs): print real-consumer counts on the index and each page`.

---

### Task 9: Phase boundary verification

**Files:** none (verification + any generated drift).

Steps:

- [ ] Run the full gate:
  ```bash
  npm run lint && npm run typecheck && npm test
  ```
  Expected: all three exit 0.
- [ ] Run the asset regenerator and commit any drift it produces:
  ```bash
  bash scripts/regenerate-assets.sh
  git status --porcelain
  ```
  Expected: clean, or only regenerated artifacts. If anything changed, re-run `npm test` to confirm green, then commit and push with message `chore(cumulus): regenerate assets after Phase 0 enforcement rails`.
- [ ] Final confirmation: `git status` is clean and `git log --oneline -9` shows the eight (or nine) Phase 0 commits, all pushed.
