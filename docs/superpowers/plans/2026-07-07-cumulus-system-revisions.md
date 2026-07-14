# Cumulus System Revisions — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. This master file is an index: execute the five phase plans below strictly in order; each phase plan is a complete standalone plan whose tasks use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the full Cumulus design-system revision program — enforcement rails, material/token consolidation, the button/dialog component suite, seven call-site migrations, and catalog deletions/honesty repairs — per the approved spec.

**Architecture:** Five serial phases on one worktree, ordered so guardrails land before the refactors they protect and system offerings land before the migrations that consume them. Checks that would fail on known debt start with explicit baselines (exported `BASELINE` arrays / eslint-config `ignores` entries) that later phases delete as they clean, so every commit is green and the suite ratchets toward zero.

**Tech Stack:** React + TypeScript (Vite), ESLint flat config with custom rules in `eslint-rules/`, vitest (component tests co-located; cross-file integrity checks as `scripts/*.test.mjs`), generated token mirror (`npm run regenerate-assets`), `agent-browser` for browser QA.

**Spec:** `docs/superpowers/specs/2026-07-07-cumulus-system-revisions-design.md`
**Evidence:** `docs/postmortems/2026-07-06-cumulus-system-audit.md` (original audit + 2026-07-07 addendum)

## Global Constraints

These apply to every task in every phase plan; each phase plan restates any it depends on.

- Run all commands from the worktree root: `/Users/dthurn/quest_prototype/.claude/worktrees/cumulus-audit-revisions`. Do not `cd` to the original repository root.
- `npm run lint`, `npm run typecheck`, and `npm test` must be green at every commit.
- Every commit uses a detailed conventional-commit message and is pushed immediately (`git push`).
- Token values are declared only in `src/cumulus/primitives/cumulus-tokens.css`; `src/cumulus/primitives/tokens.ts` is generated — after any token edit run `npm run regenerate-assets` and commit the regenerated mirror. Never hand-edit `tokens.ts`.
- Components never take numeric style props (`size`, `gap`, `scale`, `padding`, `radius`, `blur`, `opacity` as numbers); variants are enumerated strings.
- Never key or compare cards by name; identity is UUID/card number, names resolve only at the display edge.
- Documentation and code comments describe the current system directly.
- Browser QA per `docs/quest_prototype/qa_tooling.md`: isolated `--session <unique-name>` per QA run, Vite on a port other than 5173, assert `location.href` + `window.innerWidth` before every screenshot, tear down only your own server.
- Screen adapters are thin wiring (≤120 lines, enforced); view-model builders are pure and React-free (enforced).

## Phase order and gates

Execute strictly in order. A phase is complete when its plan's final "Phase boundary verification" task passes: lint/typecheck/test green, `scripts/regenerate-assets.sh` run with any generated drift committed, all work pushed.

1. **Phase 0 — Enforcement rails:** `docs/superpowers/plans/2026-07-07-cumulus-phase-0-rails.md`
   Recipes move to `src/cumulus/internal/`; the `cumulus/internal` import ban; `no-raw-safe-area-env` + `no-inline-glass` ESLint rules; the four integrity tests (`scripts/cumulus-duplicate-literals.test.mjs`, `cumulus-orphan-tokens.test.mjs`, `cumulus-ghost-components.test.mjs`, `cumulus-legacy-ratchet.test.mjs`) with baselines; adoption counts in `npm run cumulus-docs`.
2. **Phase 1 — Materials and tokens:** `docs/superpowers/plans/2026-07-07-cumulus-phase-1-materials-tokens.md`
   One glass recipe reading `--glass-*` tokens; `--glass-fill-popover`; `--surface-chrome*` rename; safe-area unification (DraftScreen `env()` fix, `device-frame.ts` imports token names, `--display-cutout-right` deleted); dead-token pruning; `--badge-disc-gradient`; `--cv-textbox-blur` moves into Cumulus; breakpoint derivation; `valid-token-references` ownership extension; Materials docs page + safe-area chapter.
3. **Phase 2 — The component suite:** `docs/superpowers/plans/2026-07-07-cumulus-phase-2-component-suite.md`
   `IconButton` (sm 40/22, md 48/26), `GlassButton`, `GlassDialog` + `GlassBackdrop`, `economy-spec.ts` (ResourceChip imports it; ResourceChip variants enumerated), `DreamcallerPortrait` `standing`/`fullBleed` variants folding the quest-start forks, `useScaleToFit`, GlassButton doctrine, `no-numeric-style-props` rule.
4. **Phase 3 — Migrations:** `docs/superpowers/plans/2026-07-07-cumulus-phase-3-migrations.md`
   Six icon-button call sites onto `IconButton`; deck sort-direction control; `GlassBackdrop`/`GridPlaceholder` dedupe; StartingDeckModal → `StartingDeckOverlay` + adapter in the Cumulus tier (legacy file deleted, baselines shrink); convergence folds (`QsbSignObject`→`Dreamsign`, `DreamscapeMotes`→`Motes`, dreamscape module moves, `HOVER_TARGET_WIDTH_PX` derivation, press-scale routing); draft-screen clearance constants + qa-scene; `no-raw-icon-classes`, `no-adhoc-press-scale`, `no-raw-interactive-elements` components-tier extension.
5. **Phase 4 — Deletions and catalog honesty:** `docs/superpowers/plans/2026-07-07-cumulus-phase-4-catalog.md`
   Delete `StatTile`/`TidePill` (Tide type → `tide-spec.ts`)/SiteNode visited branch/AtlasNode dead surface; atlas + site-node + tide-disc demo repairs; workhorse documentation in adoption order; new-behavior docs (InfoCard mobile scale, draft screen, device-frame demo, deck-viewer divergence); pre-existing-issues.txt cleanup; ghost-components baseline reaches empty.

## Cross-phase interface registry

Names pinned across phase plans; a later phase consumes exactly these.

- `src/cumulus/internal/glass-surface.ts` — `glassSurfaceStyle()` (Phase 0 location; Phase 1 tokenizes its values).
- `src/cumulus/internal/control-treatment.ts` — `controlChrome()`, `glassIconButtonChrome()`, `CONTROL_INACTIVE_COLOR` (Phase 0 location; Phase 1 folds `glassTrack()` into the shared recipe).
- Tokens (Phase 1): `--glass-fill`, `--glass-blur`, `--glass-sheen`, `--glass-rim`, `--glass-shadow`, `--glass-fill-popover`, `--surface-chrome`, `--surface-chrome-strong`, `--badge-disc-gradient`.
- `src/cumulus/components/controls/IconButton.tsx` (Phase 2): `export type IconButtonSize = "sm" | "md"`; `export function IconButton(props: { glyph: Glyph; size?: IconButtonSize; label: string; onPress: () => void; disabled?: boolean })` — sm = 40px disc / 22px glyph, md = 48px disc / 26px glyph.
- `src/cumulus/components/controls/GlassButton.tsx` (Phase 2): `export function GlassButton(props: { label: string; onPress: () => void; glyph?: Glyph; disabled?: boolean })`.
- `src/cumulus/components/overlay/GlassDialog.tsx` (Phase 2): `export function GlassDialog(props: { title: string; subtitle?: string; onClose: () => void; closeLabel?: string; children: React.ReactNode })` and `export function GlassBackdrop(props: { children?: React.ReactNode })`.
- `src/cumulus/components/hud/economy-spec.ts` (Phase 2): `export type EconomyKind = "essence" | "energy" | "spark" | "points" | "counter"`; `export interface EconomyMark { glyph: Glyph; color: string }`; `export const ECONOMY_MARKS: Record<EconomyKind, EconomyMark>` — imported by `Button` and `ResourceChip`.
- `src/cumulus/primitives/use-scale-to-fit.ts` (Phase 2): `export function useScaleToFit(stageWidth: number, stageHeight: number): number`.
- `src/cumulus/screens/deck-viewer-shared.tsx` (Phase 3): `export function GridPlaceholder(...)` shared by both deck viewers.
- `src/cumulus/screens/StartingDeckOverlay.tsx`, `src/screens/cumulus_adapters/StartingDeckOverlayAdapter.tsx`, `src/screens/cumulus_adapters/starting-deck-view-model.ts` (Phase 3).
- `src/cumulus/components/dreamscape/` (Phase 3): destination for `SiteNode.tsx`, `site-node.css`, `dreamscape-scatter.ts`.
- `src/cumulus/screens/chrome-geometry.ts` (Phase 3): `export const MENU_BUTTON_PX = 48`; `export const MENU_EDGE_INSET_MOBILE_PX = 18` — shared by `DreamscapeQuestMenu` and `DraftScreen`'s clearance math (a Cumulus module, because `no-external-ui-imports` bars `src/cumulus/**` from importing `src/components/**`).
- Phase 3 API extensions to Phase 2/earlier components (additive, enumerated): `GlassDialog` gains its cutout-aware close placement; `Dreamsign` gains `variant?: "flat" | "hud"` (default `flat`); `Motes` gains tint `"dreamscape"` backed by `--mote-dreamscape` / `--mote-dreamscape-glow` tokens.
- Baseline mechanism: exported `const BASELINE` arrays at the top of each `scripts/cumulus-*.test.mjs`; eslint-side baselines are `ignores` entries in the relevant `eslint.config.js` block. Later phases edit these in the same commit as the cleanup that empties them.

## Program completion criteria

- All five phase plans' tasks checked off; every phase gate passed.
- Every §7 rule (Phase 0's set plus the five assigned to Phases 1–3) enabled in `eslint.config.js` or the integrity suite.
- `BASELINE` arrays empty, or every retained entry carrying an inline comment stating why it stays (the orphan-token scan found ~70 orphans where the audit hand-verified ~37; Phase 1 deletes the verified set and reconciles the remainder — deleting confirmed-dead tokens, retaining-with-reason any whose reads are dynamically constructed). The `cumulus/internal` ignores list reaches empty.
- `npm run cumulus-docs` prints real adoption counts; no registry entry shows zero consumers without an `incubating` badge.
