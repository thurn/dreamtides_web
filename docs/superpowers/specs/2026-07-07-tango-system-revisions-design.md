# Tango System Revisions — Design

**Date:** 2026-07-07
**Sources:** `docs/postmortems/2026-07-06-tango-system-audit.md` (original
audit + 2026-07-07 addendum). Every finding referenced below carries
file:line evidence there.
**Scope decision:** the complete program — the original audit's P1–P3
action items plus the addendum's findings — executed as serial phases on
one worktree, each phase ending green (`npm run lint` / `typecheck` /
`test`, browser QA for visual changes) and committed.

## Decisions locked in this design

1. **Plan scope:** everything (P1–P3 + addendum), sequenced so system
   offerings land before the migrations that consume them.
2. **`IconButton` sizes:** two — `sm` = 40px disc / 22px glyph,
   `md` = 48px disc / 26px glyph. StartingDeckModal's 44px disc rounds to
   `md` (one screen changes by 4px, gaining the more tappable target).
3. **StartingDeckModal migrates into the Tango tier** as a proper
   screen/overlay + adapter, bringing it under the lint suite.
4. **InfoCard's violet fill is named, not unified:** it becomes the
   `--glass-fill-popover` token. The warmer reveal tint is deliberate,
   shipped, and test-asserted; the token names it and the Materials page
   documents why reveals read warmer.
5. **`--safe-top` / `--safe-bottom` remain** as design floors (minimum
   chrome reservations), distinct from the hardware-inset channel; docs
   state the relationship and the iPhone-16 coincidence gets a
   cross-reference comment.
6. **Execution shape:** serial phases, one worktree, no parallel fan-out.

## Phase 0 — Enforcement rails

Land the guardrails before the refactors they protect. Checks that would
fail on today's known debt start with explicit per-check baselines
(allowlists naming current offenders); later phases delete their baseline
entries as they clean, so the suite is green at every commit and ratchets
toward zero.

- **`src/tango/internal/`** — move `glass-surface.ts` and
  `control-treatment.ts` (module paths only; no behavior change), update
  in-tango imports, and add a `no-restricted-imports` patterns entry
  forbidding `tango/internal` imports outside `src/tango/`. Baseline:
  StartingDeckModal and DreamscapeQuestMenu, both removed in Phase 3. The
  error message directs authors to the public component or the
  tango-migrate path.
- **Integrity trio** (unit tests, cross-file):
  - *Duplicate-literal detector* — an identical visual literal (color,
    gradient, shadow, filter string above a minimum length) declared in
    more than one file under `src/tango/` fails, printing both sites.
  - *`no-orphan-tokens`* — every semantic token in `tango-tokens.css` has
    at least one **read** (`var(--x)`) outside the token file and the
    generated `tokens.ts` mirror; writes don't count (the
    `--display-cutout-right` lesson). `src/tango/docs/` and tests are
    excluded as consumers; `screens/devtools/` counts.
  - *`no-ghost-components`* — every docs-registry entry has ≥1 real
    consumer, with `status: "incubating"` as the visible-badge escape.
- **New ESLint rules:** `no-raw-safe-area-env` (raw
  `env(safe-area-inset-*)` legal only in `tango-tokens.css`; baseline:
  `DraftScreen.tsx:74`, fixed in Phase 1) and `no-inline-glass` (raw
  `backdropFilter` / `blur(Npx)` / `saturate(N)` only in the internal
  material module).
- **Legacy-tier ratchet** (integrity test): legacy files importing
  `tango/internal` pinned to the shrinking baseline; new files under
  `src/components/` flagged with a message pointing at the Tango tier.
- **Generated adoption counts** in `npm run tango-docs`: each reference
  page and the index print real-consumer counts (imports outside
  `src/tango/docs/` and tests).

## Phase 1 — Materials and tokens

- **One glass recipe.** `glassTrack()` becomes an import of
  `glassSurfaceStyle()` parameterized by radius. The recipe's values move
  to semantic tokens: `--glass-fill`, `--glass-blur`, `--glass-sheen`,
  `--glass-rim`, `--glass-shadow`, plus `--glass-fill-popover` for the
  InfoCard reveal tint (InfoCard's constant and test read the token's
  value). The duplicate-literal detector's glass baseline entries are
  deleted here.
- **Rename opaque `--surface-glass` / `--surface-glass-strong` →
  `--surface-chrome` / `--surface-chrome-strong`**, updating all readers;
  eliminates the name collision that misled `EdgeChevron`.
- **Safe-area unification.** `DraftScreen.tsx:74` reads
  `var(--safe-area-inset-top)`; `device-frame.ts` imports token names from
  `tokens.ts` instead of string literals; `--display-cutout-right` is
  deleted from the token file, mirror, and `CUTOUT_VARS`;
  `MobileDeckViewer`'s mixed usage is normalized (floor semantics via
  `--safe-top` where intended, hardware insets via the channel).
- **Token pruning.** Delete the orphaned semantic tokens verified in the
  audit (§4 set minus the live `--glow-danger` and `--glow-accent-soft`),
  including `--card-aspect`, the `--cat-*` family, `--space-0`,
  `--tide-earthy`, `--control-h`, `--control-h-sm`, and the four dead
  `--glow-*` members. `tide-spec.ts`
  is documented as the tide palette's home. One `--badge-disc-gradient`
  token replaces the four dark-disc gradient variants (`atlas.css` ×2,
  `InfoCard.tsx` `SITE_DISC`, `site-node.css`), and the `SITE_DISC`
  comment's false sharing claim goes with it. `atlas.css`'s repeated raw
  rgbas are promoted to tokens. `--cv-textbox-blur` moves into
  `tango-tokens.css`.
- **Breakpoints.** `CardView.tsx`'s `899.98px` derives from the exported
  `DESKTOP_MIN_WIDTH`; InfoCard's implicit ~551px content-driven cutoff is
  documented in `info-card.md` as intentional.
- **Docs:** the **Materials** page (liquid glass — who wears it, the
  popover tint and why, the blur-preservation constraint — vs the solid
  `GroupPanel` card vs solid chrome) and the **safe-area chapter** in the
  tango token docs (the one sanctioned mechanism, the `env()` ban, floors
  vs insets, the device-frame simulation contract).

## Phase 2 — The component suite

- **`IconButton`** — the glass disc as a component: `glyph: Glyph`,
  `size: "sm" | "md"` (40/22, 48/26), `usePress` feedback, glass material
  from the internal recipe. Accessible label required.
- **`GlassButton`** — the labeled glass secondary action: same material,
  text label, `usePress`; for chrome actions that need a real button shape
  without competing with the purple commit.
- **`GlassDialog`** — the rule-of-three shell: glass panel + titled header
  slot + corner `IconButton` close + backdrop, bounded-and-centered on
  desktop, full-bleed on mobile, notch-aware via the safe-area channel.
  Owns the shared `GlassBackdrop` and `GridPlaceholder` internals both
  deck viewers currently copy.
- **`economy-spec.ts`** — the kind→glyph/color table; `Button` and
  `ResourceChip` both import it (deletes `COST_ICON_CLASSES`).
  `ResourceChip` replaces numeric `size`/`gap` props with enumerated
  variants and gets an honest blurb naming the `EssenceValue` migration
  path.
- **`DreamcallerPortrait`** gains `standing` / `fullBleed` variants,
  folding `StandingFigure` and `FullBleedPortrait` onto it (deletes the
  thrice-pasted monogram gradient and fallback).
- **`useScaleToFit`** extracted from `AtlasMap`; the atlas mockup imports
  it or is labeled archived.
- **`Button.tsx` doctrine rewrite:** the comment names the four-rung
  decision tree — purple sprite = commit/primary; glass label = secondary
  chrome action; glass disc = compact chrome action; plain pressable text
  = tertiary/inline — and the docs demos show it.

## Phase 3 — Migrations

Each migration is browser-QA'd at the standard viewports before its
commit.

- **Six icon-button call sites onto `IconButton`:** desktop deck close
  (`sm`), mobile deck close (`md`), dreamscape/atlas gear (`md`), quest
  start `EdgeChevron` (`sm` — also a material bug fix from opaque
  `--surface-chrome` to real glass), QuestStatusBar dreamsigns close (bug
  fix from the third bespoke recipe + raw `<i>`), StartingDeckModal close
  (44 → `md`).
- **Desktop deck sort-direction control:** the two-item `SegmentedControl`
  toggle becomes a proper button-shaped control (an `IconButton` with a
  direction glyph), removing the layout glue.
- **`GlassDialog` adoption:** both deck viewers and the starting-deck
  surface render through it; the copied `GlassBackdrop`/`GridPlaceholder`
  modules are deleted.
- **StartingDeckModal → Tango tier:** rebuilt as a Tango overlay screen +
  adapter under `src/screens/tango_adapters/`, consuming `GlassDialog` +
  `IconButton`; the legacy file is deleted and the `tango/internal`
  baseline entry goes with it. Registered as a qa-scene.
- **Convergence folds:** `QsbSignObject` → `Dreamsign`; `DreamscapeMotes`
  → `Motes` (tint/mode parameter) or a written divergence note if they
  genuinely can't share; `SiteNode` / `site-node.css` /
  `dreamscape-scatter.ts` move to `components/dreamscape/`;
  `HOVER_TARGET_WIDTH_PX` derives from `HoverZoomCard`'s exported
  `MAX_SCALE`; `AtlasNode` / `SiteNode` hover scales route through
  `usePress` constants (or one tokenized node-scale, documented).
- **Draft screen seams:** hamburger clearance reads exported
  menu-geometry constants from `DreamscapeQuestMenu` (or a shared chrome
  spec) instead of hand-guessed numbers; a `?goto=` qa-scene for the
  draft site is registered.

## Phase 4 — Deletions and catalog honesty

- **Delete:** `StatTile` (component, demo, registry entry); `TidePill`
  (the `Tide` type moves to `tide-spec.ts`); `SiteNode`'s unreachable
  visited branch and its demo fixture; `AtlasNode`'s dead `eyebrow`
  wiring; `forgone` / `isReachable:false` collapse to the single
  "unreachable" concept (or `forgone` documented as data-only).
- **Demo repairs:** atlas demo fixtures import `ATLAS_LAYOUT_*` and show
  production shapes (forced-blank forgone, an unreachable row,
  `badgeScale: 1.5`); demos mount the production integration surface
  (`AtlasNodeReveal` press-reveal, `TideDisc`-inside-reveal) with the
  site-node demo as the standard; the site-node locked fixture stops
  duplicating the lock note into `blurb`; the atlas mockup is rebuilt
  from the real `AtlasMap` or labeled archived.
- **Document the workhorses,** in adoption order: `DreamcallerPortrait`,
  `HoverPopover` (with the HoverPopover-vs-InfoCard decision rule),
  `HoverZoomCard`, `GlowIcon`, `rich-text`, `GlossaryDefinitionCard`,
  `CardTermDefinitions`, `tide-spec`, `PipBadge`, plus `AtlasMap` as the
  documentable atlas surface.
- **Document the new behavior:** InfoCard's mobile scale and above-only
  placement contract in `info-card.md`; the draft screen (and its floating
  pick counter idiom) in the tango skill; `DeviceFrameDemo` and
  `?demo=device-frame` in `qa_scenes.md`; the deck-viewer platform
  divergences (filter models, mobile card count) decided and written
  down; stale doctrine comments (`glass-surface.ts` consumer list,
  `SITE_DISC`) refreshed.

## Remaining §7 ESLint rules — required, with assigned phases

The five §7 single-file rules not in Phase 0 are required deliverables of
this program, each landing in the phase that cleans its known violations
(so every rule ships enabled, with an empty or near-empty baseline):

- **`valid-token-references` ownership extension** — Phase 1, with the
  `--cv-textbox-blur` move into Tango (its only known violation).
- **`no-numeric-style-props`** — Phase 2, with ResourceChip's enumerated
  variants (its grandfathered `size`/`gap` violation).
- **`no-raw-icon-classes`** — Phase 3, after `economy-spec.ts` (Phase 2)
  centralizes the glyph tables and the QuestStatusBar raw `<i>` close is
  migrated; includes the generation-time check that every registered
  glyph class exists in the vendored stylesheet.
- **`no-adhoc-press-scale`** — Phase 3, with the `AtlasNode`/`SiteNode`
  press-feedback routing (its two known violations).
- **`no-raw-interactive-elements` components-tier extension** — Phase 3,
  with the `AtlasNode` raw `role="button"` fix.

The program is not complete until all §7 rules (Phase 0's set plus these
five) are enabled in `eslint.config.js` or the integrity-test suite.

## Error handling and testing

- Every phase boundary: `npm run lint`, `npm run typecheck`, `npm test`
  green; each phase is one or more commits pushed immediately per repo
  convention.
- Visual changes (icon-button size normalization, EdgeChevron material,
  GlassDialog adoption, StartingDeckModal migration) get browser QA via
  `agent-browser` with isolated sessions at the standard viewports, using
  `?goto=` scenes; the StartingDeckModal migration adds its scene first
  so it can be QA'd directly.
- New components ship with unit tests and docs demos in the same commit
  (the `no-ghost-components` check makes an undocumented-but-consumed or
  documented-but-unconsumed state fail CI; `incubating` is available but
  should not be needed — every new component has a consumer by Phase 3).
- Baselines are the rollback safety: if a phase must stop early, the
  checks still pass because remaining debt is named in baselines rather
  than silently tolerated.

## Out of scope

- `EssenceValue` → `ResourceChip` call-site migrations in legacy screens
  (happens as those screens Tango-ify; the spec only lands the shared
  `economy-spec` and the documented plan).
- The `no-name-keyed-cards` lint rule (separate concern, already filed in
  pre-existing-issues).
- Rebuilding the deck-viewer filter UX (only the sort-direction control
  and the documented divergence decision).
- Nothing from the audit's §7 rule list is out of scope; see "Remaining
  §7 ESLint rules" above for the per-phase landing assignments.
