# Cumulus Revisions Phase 3: Migrations — Implementation Plan

> **REQUIRED SUB-SKILL — read before executing.** Drive this plan with
> **`superpowers:subagent-driven-development`** (each `### Task N` is one
> self-contained subagent unit: implement → verify → commit → push, then the
> next). Track progress by checking the boxes below as each task's commit
> lands. If executing solo in one session, `superpowers:executing-plans` is the
> acceptable fallback; either way every checkbox is a real commit, pushed, on
> the worktree's existing branch (`worktree-cumulus-audit-revisions`).
>
> - [ ] Task 1 — Desktop deck close → `IconButton` (`sm`)
> - [ ] Task 2 — Mobile deck close → `IconButton` (`md`)
> - [ ] Task 3 — Dreamscape/Atlas gear → `IconButton` (`md`)
> - [ ] Task 4 — `EdgeChevron` → `IconButton` (`sm`) — material bug fix
> - [ ] Task 5 — QuestStatusBar dreamsigns close → `IconButton` (`sm`) — bug fix
> - [ ] Task 6 — Desktop deck sort-direction: `SegmentedControl` → `IconButton` toggle
> - [ ] Task 7 — `GlassBackdrop`/`GridPlaceholder` shared adoption in both deck viewers
> - [ ] Task 8 — StartingDeckModal → Cumulus tier (overlay + view-model + adapter)
> - [ ] Task 9 — Convergence: `QsbSignObject` → `Dreamsign`
> - [ ] Task 10 — Convergence: `DreamscapeMotes` → `Motes`
> - [ ] Task 11 — Move `SiteNode`/`site-node.css`/`dreamscape-scatter.ts` → `components/dreamscape/`
> - [ ] Task 12 — `HOVER_TARGET_WIDTH_PX` derives from `MAX_SCALE`
> - [ ] Task 13 — `AtlasNode` renders through `Pressable` (kills raw `role="button"`)
> - [ ] Task 14 — `AtlasNode`/`SiteNode` hover scales → `--node-hover-scale` token
> - [ ] Task 15 — Draft-screen seam: shared menu-geometry consumed by `DraftScreen`
> - [ ] Task 16 — Draft-site `?goto=` qa-scene verified + documented
> - [ ] Task 17 — ESLint `no-raw-icon-classes` + generation-time glyph check
> - [ ] Task 18 — ESLint `no-adhoc-press-scale` (JS + CSS companion)
> - [ ] Task 19 — ESLint `no-raw-interactive-elements` components-tier extension
> - [ ] Task 20 — Phase boundary verification

## Goal

Migrate every screen-local hand-rolled UI onto the Phase-2 component suite
(`IconButton`, `GlassButton`, `GlassDialog`/`GlassBackdrop`), fold the audit's
convergence debt (§5) back into shared modules, close the draft-screen layout
seams (Addendum A4), and land the three remaining §7 ESLint rules
(`no-raw-icon-classes`, `no-adhoc-press-scale`, and the `no-raw-interactive-elements`
components-tier extension) — each rule enabled only after the task that clears
its violations. At the end no `glassIconButtonChrome()` call site survives
outside `IconButton`, and every new Phase-2 component that gains a consumer
here sheds its `status: "incubating"` flag.

## Architecture

- **Consumes Phase 0–2 outputs (do not recreate):** `src/cumulus/internal/`
  (`glass-surface.ts`, `control-treatment.ts`); the `--glass-*` tokens;
  `--surface-chrome`/`--surface-chrome-strong` (renamed from `--surface-glass*`);
  `IconButton` (`src/cumulus/components/controls/IconButton.tsx`, sizes `sm`=40/22,
  `md`=48/26); `GlassButton`; `GlassDialog` + `GlassBackdrop`
  (`src/cumulus/components/overlay/GlassDialog.tsx`); `economy-spec.ts`;
  `useScaleToFit`; the integrity-test `BASELINE` arrays in `scripts/cumulus-*.test.mjs`;
  and the `eslint.config.js` `cumulus/internal` `no-restricted-imports` block whose
  `ignores` list names `StartingDeckModal.tsx` + `DreamscapeQuestMenu.tsx` (Task 3
  and Task 8 delete those two entries). At Phase 3 start `DraftScreen.tsx` already
  reads `var(--safe-area-inset-top)` (Phase-1 `no-raw-safe-area-env` fix).
- **Tiers:** presentational Cumulus screens/components live in `src/cumulus/**`
  (pure, props-driven, cannot import `src/components/**` — enforced by
  `no-external-ui-imports`, `ALLOWED_PREFIXES` = `src/cumulus/`, `src/data/`,
  `src/types/`, `src/runtime/`). Adapters live in `src/screens/cumulus_adapters/**`,
  are wiring-only (`cumulus/thin-adapters` + `max-lines` ≤120 on `*Adapter.tsx`),
  and delegate all domain→view mapping to a pure `*-view-model.ts` builder
  (`no-restricted-imports` bans `react`/state imports there).
- **Registry:** `cumulusScreenFor` / `cumulusSiteScreenFor`
  (`src/screens/cumulus_adapters/registry.tsx`) resolve site screens; the
  StartingDeck overlay is App-mounted chrome (like the deck viewer), NOT a
  registry screen — App.tsx renders its adapter directly.

## Tech Stack

React 18 + TypeScript (strict), framer-motion, Vite, Vitest, ESLint flat config
with the local `cumulus` plugin (`eslint-rules/`) + cross-file integrity tests
(`scripts/cumulus-*.test.mjs`). Boxicons v3 vendored at `src/vendor/boxicons/`.
Browser QA via `agent-browser` against a local Vite server.

## Global Constraints

- **Green at every commit:** `npm run lint`, `npm run typecheck`, `npm test`
  all pass before each commit. In a fresh worktree run `npm install` first.
- **Conventional commits, pushed immediately** after each task
  (`git push` right after `git commit`; end messages with the
  `Claude-Session:` trailer per `AGENTS.md`). Never create branches.
- **Every visual migration gets browser QA** per
  `docs/quest_prototype/qa_tooling.md`: dev server on a **non-5173** port
  (`npm run dev -- --port 5174`), a **unique `--session <name>`** per
  `agent-browser` run, **assert `location.href` + `window.innerWidth`** before
  every screenshot, inspect the captured error buffer, and tear down **only your
  own** server (match `dev-with-emulator.mjs --port 5174` or the PID — a broad
  `pkill -f vite` kills the developer's 5173 server).
- **Never key cards by name.** Card identity is `cardNumber`/UUID end-to-end;
  names resolve only at the display edge (`CardDisplay`). A map/set keyed by
  card name is a bug — eradicate on sight.
- **Docs describe the current state**, never removed behavior ("no longer",
  "unlike before" are banned in `docs/` and `src/cumulus/docs/`).
- **Adapters ≤120 lines; view-models pure** (no React, no `src/state/**`
  imports, no dynamic `import()`).
- After any TOML/registry/token/generated change, run
  `scripts/regenerate-assets.sh` and commit the generated drift (Task 20 is the
  final sweep, but run it inside any task that edits tokens/glyphs/registry).

---

### Task 1 — Desktop deck close → `IconButton` (`sm`)

**Files**
- `src/cumulus/screens/DesktopDeckViewer.tsx` — the bespoke corner close disc, the
  local `CLOSE_BUTTON_PX = 40` constant, and their imports.
- `src/cumulus/docs/` — the `IconButton` registry entry (delete `incubating`).

**Interfaces**
- Consumes: `IconButton({ glyph, size?, label, onPress, disabled? })` from
  `src/cumulus/components/controls/IconButton.tsx`; `GLYPHS.close`.
- Produces: first production consumer of `IconButton` → its `incubating` flag
  is removed.

**Contract**
- The bespoke close disc (a `Pressable`+`GlowIcon` styled with
  `glassIconButtonChrome()`, 40px, `fontSize: 22`) is replaced by
  `<IconButton glyph={GLYPHS.close} size="sm" label="Close deck" onPress={onClose} />`
  in place. Delete the `CLOSE_BUTTON_PX` constant.
- Remove now-unused imports (`Pressable`, `GlowIcon`, `glassIconButtonChrome`)
  **only if lint reports them unused** — the card grid may still use
  `GlowIcon`/`Pressable`; let `npm run lint` decide.
- Delete `status: "incubating"` from the `IconButton` docs-registry entry
  (`no-ghost-components` passes on the count once a real consumer exists).
- Run `scripts/regenerate-assets.sh` (registry/docs adoption count changed);
  stage the generated drift.

**Verify**
- `npm run lint && npm run typecheck && npm test` → all green (0 problems, 0 TS
  errors, all suites pass).
- Browser QA:
  ```bash
  npm run dev -- --port 5174   # background
  agent-browser --session t1-desk goto "http://localhost:5174/?goto=deckviewer"
  agent-browser --session t1-desk eval "({href:location.href,w:innerWidth})"   # href ends /?goto=deckviewer, w 1280
  agent-browser --session t1-desk screenshot deck-close-desktop.png
  ```
  Assert: a 40px glass close disc top-right of the "Your Deck" header, blurred
  backdrop shows through, `press` compresses it, click closes the overlay; error
  buffer clean. Tear down the 5174 server only.

**Commit:** `refactor(deck): migrate desktop deck close to IconButton (sm)`

---

### Task 2 — Mobile deck close → `IconButton` (`md`)

**Files**
- `src/cumulus/screens/MobileDeckViewer.tsx` — the bespoke absolutely-positioned
  close disc, the local `CONTROL_BUTTON_PX` constant, and their imports.

**Interfaces**
- Consumes: `IconButton` (`md`), `GLYPHS.close`.

**Contract**
- The bespoke disc (`Pressable`+`GlowIcon`+`glassIconButtonChrome()`, absolutely
  positioned `top:0 right:0`, 48px `CONTROL_BUTTON_PX`, `fontSize: 26`) is
  replaced by an `IconButton` (`md` = 48px, matching `CONTROL_BUTTON_PX`) wrapped
  in a bare `<div style={{ position:"absolute", top:0, right:0 }}>` so layout is
  unchanged:
  `<IconButton glyph={GLYPHS.close} size="md" label="Close deck" onPress={onClose} />`.
- Keep `CONTROL_BUTTON_PX` **only if** still referenced for layout reservation
  (`grep CONTROL_BUTTON_PX`); if the close disc was its sole use, delete it.
  Remove now-unused imports as lint directs.

**Verify**
- Checks green.
- Browser QA at mobile width:
  ```bash
  agent-browser --session t2-mob goto "http://localhost:5174/?goto=deckviewer&deviceFrame=iphone16"
  agent-browser --session t2-mob eval "({href:location.href,w:innerWidth})"   # w ~ 393
  agent-browser --session t2-mob screenshot deck-close-mobile.png
  ```
  Assert: 48px glass close disc top-right, tappable, closes overlay; error
  buffer clean.

**Commit:** `refactor(deck): migrate mobile deck close to IconButton (md)`

---

### Task 3 — Dreamscape/Atlas gear → `IconButton` (`md`)

**Files**
- `src/components/DreamscapeQuestMenu.tsx` — the bespoke gear/hamburger disc, the
  local sizing consts (`menuGlyphSize`/`menuBtnSize`/`menuEdgeInset`), and its
  `glassIconButtonChrome` import.
- `src/components/DreamscapeQuestMenu.test.tsx` — the trigger selector.
- `src/cumulus/primitives/glyph.ts` — add `gear`, `menu` to `GLYPHS`.
- `src/cumulus/components/controls/IconButton.tsx` — add optional `testId?` +
  `ariaExpanded?` passthrough (see note).
- `eslint.config.js` — delete the `DreamscapeQuestMenu.tsx` entry from the
  `cumulus/internal` `no-restricted-imports` `ignores` list.

**Interfaces**
- Consumes: `IconButton` (`md`), new `GLYPHS.gear` (`bxf bx-cog`) /
  `GLYPHS.menu` (`bxf bx-menu`).
- Produces: `DreamscapeQuestMenu` no longer imports any `cumulus/internal` recipe
  → its `ignores` entry is removed.
- New glyphs (raw `bxf bx-*` strings are legal only in `glyph.ts`; both classes
  exist in `src/vendor/boxicons/boxicons-filled.css`):
  `gear: g("bxf bx-cog")`, `menu: g("bxf bx-menu")`.

**Note — `IconButton` disclosure/test passthrough.** The gear is a disclosure
trigger carrying `aria-expanded={open}` and `data-testid="dreamscape-menu-button"`.
The pinned `IconButton` API surfaces neither, so extend the Phase-2 component
with two backward-compatible optional props — `ariaExpanded?: boolean`
(→ the button's `aria-expanded`) and `testId?: string` (→ `data-testid`). This is
an additive extension, not an API rename. If Phase 2's `IconButton` already
spreads `aria-*`/`data-*`, use that instead and skip the extension.

**Contract**
- The bespoke gear (`Pressable`+raw `<i className={isDesktop ? "bxf bx-cog" : "bxf bx-menu"}>`+`glassIconButtonChrome()`)
  becomes an `IconButton size="md"` with `glyph={isDesktop ? GLYPHS.gear : GLYPHS.menu}`,
  `label="Open menu"`, `ariaExpanded={open}`, `testId="dreamscape-menu-button"`,
  and the same `onPress` toggle (`setMenuView("root")` + toggle `open`).
- `DreamscapeQuestMenu.tsx` imports `IconButton` and `GLYPHS` from `src/cumulus/**`
  (legal — legacy screens may render public Cumulus components). Delete the
  `glassIconButtonChrome` import and the `menuGlyphSize` const. **Keep**
  `menuBtnSize` and `menuEdgeInset`: the wrapper still positions the disc via
  `menuEdgeInset`, and `menuBtnSize` is exported for reuse in Task 15.
- Test: keep selecting by `data-testid="dreamscape-menu-button"` (preserved via
  `testId`); if the extension was skipped, switch to `getByLabelText("Open menu")`.
  The `aria-expanded` assertion must still hold.
- Delete the `DreamscapeQuestMenu.tsx` `ignores` entry from `eslint.config.js`;
  confirm the file now imports nothing from `cumulus/internal`.
- Run `scripts/regenerate-assets.sh` (glyph registry + docs adoption changed);
  stage drift.

**Verify**
- Checks green (the deleted `ignores` entry must not reintroduce a lint error).
- Browser QA both platforms:
  ```bash
  agent-browser --session t3-desk goto "http://localhost:5174/?goto=dreamscape"                    # w 1280 → cog top-right
  agent-browser --session t3-mob  goto "http://localhost:5174/?goto=dreamscape&deviceFrame=iphone16" # w ~393 → hamburger top-left
  ```
  Assert: glass disc opens/closes the menu, `aria-expanded` toggles, glyph and
  corner correct per platform; error buffer clean.

**Commit:** `refactor(dreamscape): migrate quest-menu gear to IconButton (md)`

---

### Task 4 — `EdgeChevron` → `IconButton` (`sm`) — material bug fix

**Files**
- `src/cumulus/screens/quest-start-mobile.tsx` — the `EdgeChevron` component body.

**Interfaces**
- Consumes: `IconButton` (`sm`), `GLYPHS.chevronLeft`/`GLYPHS.chevronRight`.

**Bug context (Audit §1, §2):** `EdgeChevron` used opaque `token("--surface-glass")`
(post-Phase-1: `--surface-chrome`) + `--border-soft` — a solid chrome material
where every sibling icon disc wears real blur glass. Migrating to `IconButton`
makes the chevrons real glass. **This is a visible change; QA it.**

**Contract**
- Replace the `EdgeChevron` `<Pressable>` body with an `IconButton size="sm"`,
  `glyph={dir === "left" ? GLYPHS.chevronLeft : GLYPHS.chevronRight}`,
  `label={dir === "left" ? "Previous" : "Next"}`, `onPress={onClick}`.
- Keep the absolute positioning on a wrapper `<div>` (the chevron pins to the
  carousel edge at `top:46%`, `[dir]: token("--space-3")`, `zIndex:6`), and keep
  the `onPointerDown` `stopPropagation` guard on that wrapper (it stops a chevron
  tap from starting a swipe).
- Remove now-unused imports (`Pressable`, `GlowIcon`, and the `--surface-glass`/
  `--border-soft`/`--radius-pill` refs) as lint directs.

**Verify**
- Checks green.
- Browser QA (this is the material bug fix — confirm the chevrons now blur):
  ```bash
  agent-browser --session t4 goto "http://localhost:5174/?goto=dreamcallerselect&deviceFrame=iphone16"
  agent-browser --session t4 eval "({href:location.href,w:innerWidth})"
  agent-browser --session t4 screenshot edgechevron-glass.png
  ```
  Assert: left/right chevrons are frosted glass discs (scene refracts through
  them), page the carousel, do not trigger a swipe on tap; error buffer clean.

**Commit:** `fix(quest-start): EdgeChevron becomes real glass via IconButton (sm)`

---

### Task 5 — QuestStatusBar dreamsigns close → `IconButton` (`sm`) — bug fix

**Files**
- `src/cumulus/components/hud/QuestStatusBar.tsx` — the dreamsigns-window close
  button.

**Interfaces**
- Consumes: `IconButton` (`sm`), `GLYPHS.close`. Import path from `hud/` is
  `../controls/IconButton` (confirm).

**Bug context (Audit §1):** the dreamsigns-window close was a third bespoke
recipe — a raw `<i className="bxf bx-x">` on a hand-styled 34px button with
`rgba(255,255,255,0.05)`, no blur, no `GlowIcon`. This migration removes both
the raw icon class (unblocking Task 17) and the ad-hoc material.

**Contract**
- Replace the bespoke `<button>` (34px, `rgba(255,255,255,0.05)`,
  `--border-soft`, raw `<i className="bxf bx-x">`) with
  `<IconButton glyph={GLYPHS.close} size="sm" label="Close" onPress={onClose} />`.

**Verify**
- Checks green.
- Browser QA (open the dreamsigns window from the HUD):
  ```bash
  agent-browser --session t5 goto "http://localhost:5174/?goto=dreamscape&deviceFrame=iphone16"
  # drive: tap the dreamsign overflow stack to open the window, screenshot the close disc
  ```
  Assert: the window's close is a glass `sm` disc, closes the window; no raw
  blank icon; error buffer clean.

**Commit:** `fix(hud): dreamsigns-window close uses IconButton (sm), drops raw <i>`

---

### Task 6 — Desktop deck sort-direction: `SegmentedControl` → `IconButton` toggle

**Files**
- `src/cumulus/screens/DesktopDeckViewer.tsx` — the sort block (`Select` +
  `SegmentedControl` wrapped in layout-glue) and its imports.
- `src/cumulus/screens/desktop-deck-filter.ts` — `SORT_DIRECTION_OPTIONS` (remove
  if unused after this change; the `SortDirection` type and `direction: "asc"`
  default stay).
- `src/cumulus/primitives/glyph.ts` — add `chevronUp`.

**Interfaces**
- Consumes: `IconButton` (`sm`); new `GLYPHS.chevronUp` (`bx bx-chevron-up`,
  exists in `boxicons.css`) + existing `GLYPHS.chevronDown`.

**Sort-toggle glyph decision:** a single `IconButton` whose glyph reflects the
current direction and flips on press — `chevronUp` when `asc`, `chevronDown`
when `desc` — with the accessible label announcing the current state
("Sort ascending" / "Sort descending"). This is one toggle affordance, not two
segments, so the layout-glue disappears.

**Contract**
- Add to `glyph.ts`: `chevronUp: g("bx bx-chevron-up")`.
- Reuse the `IconButton` import already added in Task 1.
- Delete the glue wrapper `<div>` around the `Select`+`SegmentedControl`; the
  `Select` and the new toggle now sit directly in the filter-bar flex row,
  sharing the bar's own gap. The direction `SegmentedControl` becomes:
  `<IconButton size="sm" glyph={filterSort.direction === "asc" ? GLYPHS.chevronUp : GLYPHS.chevronDown} label={filterSort.direction === "asc" ? "Sort ascending" : "Sort descending"} onPress={() => onChange({ direction: filterSort.direction === "asc" ? "desc" : "asc" })} />`.
  The `Select` (`size="sm"`, `leadingGlyph={GLYPHS.sort}`, sort-key options) is
  unchanged.
- Remove the `SORT_DIRECTION_OPTIONS` import; delete `SORT_DIRECTION_OPTIONS`
  from `desktop-deck-filter.ts` **iff** `grep -rn SORT_DIRECTION_OPTIONS src`
  shows no remaining consumer. Keep the `SortDirection` type and `direction:"asc"`
  default.
- If any filter test asserts `SORT_DIRECTION_OPTIONS` (the arrow-glyph `↑`/`↓`
  labels no longer exist), delete that assertion.
- Run `scripts/regenerate-assets.sh`; stage drift.

**Verify**
- Checks green.
- Browser QA the desktop filter bar:
  ```bash
  agent-browser --session t6 goto "http://localhost:5174/?goto=deckviewer"
  agent-browser --session t6 eval "({href:location.href,w:innerWidth})"   # w 1280
  agent-browser --session t6 screenshot deck-filterbar.png
  ```
  Assert: the sort `Select` + a single chevron toggle read as one control, the
  glyph flips up↔down on click and re-sorts the grid, the size control still
  sits at the trailing edge, no gap/alignment regression across the bar; error
  buffer clean.

**Commit:** `refactor(deck): sort-direction is a single IconButton toggle`

---

### Task 7 — `GlassBackdrop`/`GridPlaceholder` shared adoption in both deck viewers

**Files**
- `src/cumulus/screens/DesktopDeckViewer.tsx` — the local `GlassBackdrop` and local
  `GridPlaceholder`.
- `src/cumulus/screens/MobileDeckViewer.tsx` — the local `GlassBackdrop` and local
  `GridPlaceholder`.
- `src/cumulus/screens/deck-viewer-shared.tsx` (**new**) — the single
  `GridPlaceholder`.
- `src/cumulus/components/overlay/GlassDialog.tsx` — already exports `GlassBackdrop`.

**Interfaces**
- Consumes: `GlassBackdrop` from `GlassDialog.tsx`.
- Produces: `export function GridPlaceholder({ message }: { message: string }): ReactElement`
  from `src/cumulus/screens/deck-viewer-shared.tsx` — the centered muted message
  shared by the empty / no-match grid states (`display:grid`, `placeItems:center`,
  `minHeight:40vh`, `font: --t-body`, `color: --text-muted`, `textAlign:center`).

**Reconciliation (verified):** both `GlassBackdrop` copies are byte-identical;
both `GridPlaceholder` copies are byte-identical (diff = 0). No divergence to
reconcile. **The deck viewers keep their full-screen layout: they render
`GlassBackdrop` directly (a bare frosted `inset:0` sibling of the scrolling
content), NOT `GlassDialog`** — `GlassDialog` is the bounded/centered dialog
shell and would wrap them in a header/panel they don't want. Only the two shared
internals are deduped here.

**Contract**
- Create `deck-viewer-shared.tsx` exporting `GridPlaceholder` (signature above),
  importing only `token` from `../primitives/tokens`.
- In **both** viewers: delete the local `GlassBackdrop` and import
  `{ GlassBackdrop }` from `../components/overlay/GlassDialog`; leave every
  `<GlassBackdrop />` call site unchanged.
- In **both** viewers: delete the local `GridPlaceholder` and import it from
  `./deck-viewer-shared`.
- Drop the now-unused `glassSurfaceStyle` import from each viewer if
  `GlassBackdrop` was its only user (lint confirms).

**Verify**
- Checks green (the duplicate-literal integrity test should now have one fewer
  offender; if a `BASELINE` entry named these copies, delete it).
- Browser QA both viewers still frost correctly:
  ```bash
  agent-browser --session t7-desk goto "http://localhost:5174/?goto=deckviewer"                    # w 1280
  agent-browser --session t7-mob  goto "http://localhost:5174/?goto=deckviewer&deviceFrame=iphone16"
  ```
  Assert: full-screen frosted backdrop intact on both; empty/no-match placeholder
  renders (filter to an empty subset to force it); error buffer clean.

**Commit:** `refactor(deck): share GlassBackdrop + GridPlaceholder across viewers`

---

### Task 8 — StartingDeckModal → Cumulus tier (overlay + view-model + adapter)

**Files**
- `src/cumulus/screens/StartingDeckOverlay.tsx` (**new** — presentational)
- `src/screens/cumulus_adapters/starting-deck-view-model.ts` (**new** — pure)
- `src/screens/cumulus_adapters/starting-deck-view-model.test.ts` (**new**)
- `src/screens/cumulus_adapters/StartingDeckOverlayAdapter.tsx` (**new** — thin, ≤120 lines)
- `src/screens/cumulus_adapters/StartingDeckOverlay.test.tsx` (**new** — ported behavior test)
- `src/cumulus/components/overlay/GlassDialog.tsx` — extend with optional `cutoutAwareClose`.
- `src/App.tsx` — the import + the render site.
- **Delete:** `src/components/StartingDeckModal.tsx`, `src/components/StartingDeckModal.test.tsx`
- `eslint.config.js` — delete the `StartingDeckModal.tsx` `cumulus/internal` `ignores` entry.
- `scripts/cumulus-legacy-ratchet.test.mjs` — delete the `StartingDeckModal` `BASELINE` entry.
- `src/runtime/qa-scenes.ts` + `docs/quest_prototype/qa_scenes.md` — keep/extend
  the `startingdeck` scene.
- `src/cumulus/docs/` — the `GlassDialog` registry entry (delete `incubating`).

**Interfaces**
- Consumes: `GlassDialog`, `IconButton`, `HoverZoomCard`, `CardDisplay`.
- Produces:
  - `starting-deck-view-model.ts`:
    ```ts
    export interface StartingDeckCardView {
      entryId: string;          // stable key — NEVER the card name
      card: CardData;           // resolved (type-change + stat overrides applied)
      glossaryText: string;     // card.renderedText, for HoverZoomCard help
      testId: string;           // `starting-deck-card-${entryId}`
    }
    export interface StartingDeckView { cards: StartingDeckCardView[]; }
    export function buildStartingDeckView(
      deck: readonly DeckEntry[],
      cardDatabase: ReadonlyMap<number, CardData>,
    ): StartingDeckView;
    ```
  - `StartingDeckOverlay.tsx`:
    ```ts
    export interface StartingDeckOverlayProps {
      isOpen: boolean;
      view: StartingDeckView;
      onClose: () => void;
    }
    export function StartingDeckOverlay(props: StartingDeckOverlayProps): ReactElement | null;
    ```
  - `StartingDeckOverlayAdapter.tsx`:
    ```ts
    export function StartingDeckOverlayAdapter(props: {
      isOpen: boolean;
      onClose: () => void;
    }): ReactElement | null;
    ```

**GlassDialog extension (enumerated, additive).** The modal floats its close disc
up beside the display cut-out on a full-bleed mobile overlay with a *simulated*
cut-out (the `beside` behavior: `hasInjectedDisplayCutout()` +
`--display-cutout-top`/`--display-cutout-height`). Add an optional
`cutoutAwareClose?: boolean` (default `false`) to `GlassDialog`: when `true` and
`hasInjectedDisplayCutout()` is true and the dialog is full-bleed (mobile),
`GlassDialog` renders its corner `IconButton` close floated beside the cut-out
island instead of on the header row. This keeps a single close owner inside
`GlassDialog` (no fork) and imports `hasInjectedDisplayCutout` from
`src/runtime/device-frame` (allowed by `ALLOWED_PREFIXES`). `StartingDeckOverlay`
passes `cutoutAwareClose`.

**View-model contract.** Port the modal's pure resolution:
- Iterate `deck` in acquisition order; for each entry look up
  `cardDatabase.get(entry.cardNumber)`; **drop** entries whose card is missing.
- Resolve via `applyCardStatOverride(applyDeckEntryCardModification(base, { typeChange, keywords: keywordModification }), statOverride)`
  (both from `src/card-type-change`).
- Key each view by `entry.entryId` (never the name); `glossaryText = card.renderedText`;
  `testId = \`starting-deck-card-${entry.entryId}\``.
- NB: confirm `card-type-change` is importable from a view-model — per its current
  use in the modal it is pure; if it pulls in React/state it must be split first.

**View-model test contract.** Port from `StartingDeckModal.test.tsx` as pure unit
tests over `buildStartingDeckView` (fixtures derived like the modal test's
`makeState`/`makeCardDatabase`): (1) resolves cards, (2) preserves acquisition
order, (3) drops a missing card. Assert order + `entryId` keys, never names.

**Overlay contract.** `StartingDeckOverlay` renders through `GlassDialog`
(title "Starting Deck", subtitle "These are the cards you begin the quest with.",
`onClose`, `closeLabel="Close starting deck"`, `cutoutAwareClose`). Behaviors
that must carry over from the modal, as a checklist:
- Desktop bounded / mobile full-bleed — **GlassDialog owns this**.
- Notch clearance via the safe-area channel — **GlassDialog owns this**.
- Scrolling card grid `grid-template-columns: repeat(auto-fill, minmax(140px,1fr))`
  of `HoverZoomCard` → `CardDisplay`, with `HoverZoomCard` `logSurface="starting_deck"`.
- Empty-state placeholder.
- The `AnimatePresence` open/close animation and the Escape-to-close handler —
  carry over **unless GlassDialog already provides Escape** (verify; do not
  double-bind).
- Preserve the shipped test hooks: `data-testid` `starting-deck-modal`,
  `-backdrop`, `-scroll`, `-close`, and each card's
  `starting-deck-modal-card-${entryId}` (keep the `-modal-` testids so no external
  selector breaks).

**Adapter contract.** `StartingDeckOverlayAdapter` (thin, ≤120 lines): `useQuest()`
for `state.deck` + `cardDatabase`, `useMemo(buildStartingDeckView, …)`, the
open/close logging (`starting_deck_modal_opened` on open with `cardCount`,
`starting_deck_modal_closed` with `durationMs`), and renders
`<StartingDeckOverlay isOpen={isOpen} view={view} onClose={handleClose} />`. All
mapping lives in the view-model.

**Overlay behavior test contract.** Port the remaining `StartingDeckModal.test.tsx`
assertions against `StartingDeckOverlay` (+ adapter where state is needed):
renders nothing when closed; renders both cards; full-bleed mobile vs bounded
desktop via `useIsDesktop`; exactly one button = the close with
`aria-label="Close starting deck"` (no Continue/sort/filter/summary chrome);
`onClose` fires on close click **and** Escape; no dismiss on panel/backdrop click;
internal `overflow-y-auto` scroll.

**App wiring contract.** Replace the `StartingDeckModal` import + render with
`<StartingDeckOverlayAdapter isOpen={showStarterDeckIntro} onClose={handleBeginQuest} />`
— the adapter owns `cardDatabase` via `useQuest`, so App stops threading it. Keep
the surrounding `ErrorBoundary scope="overlay:starting-deck-modal"`.

**Cleanup contract.**
- Delete `StartingDeckModal.tsx` + `StartingDeckModal.test.tsx`.
- Delete the `StartingDeckModal.tsx` `ignores` entry (`eslint.config.js`) and the
  `StartingDeckModal` `BASELINE` entry (`scripts/cumulus-legacy-ratchet.test.mjs`).
- Delete `status: "incubating"` from the `GlassDialog` docs-registry entry.
- The `startingdeck` scene already builds the starter dreamscape with
  `hasSeenStartingDeckPopup: false` — keep it; confirm `QuestApp` still reveals the
  overlay from that flag now that it renders the adapter.
- Run `scripts/regenerate-assets.sh`; stage drift.

**Verify**
- Checks green (adapter ≤120 lines; `thin-adapters` passes; view-model has no
  React/state import).
- Browser QA at both viewports **including the simulated cut-out** (read
  `docs/quest_prototype/qa_scenes.md` + the `?deviceFrame=` device-frame demo):
  ```bash
  agent-browser --session t8-desk goto "http://localhost:5174/?goto=startingdeck"                    # w 1280 → bounded centered glass dialog, corner close
  agent-browser --session t8-mob  goto "http://localhost:5174/?goto=startingdeck&deviceFrame=iphone16" # w ~393 → full-bleed; close floated BESIDE the island
  agent-browser --session t8-mob screenshot startingdeck-cutout.png
  ```
  Assert: title/subtitle clear the notch, cards render in acquisition order,
  hover/press zoom works, close disc dismisses (and Escape), no extra chrome;
  the mobile close floats beside the simulated island; error buffer clean.

**Commit:** `refactor(starting-deck): migrate modal to Cumulus overlay + adapter`

---

### Task 9 — Convergence: `QsbSignObject` → `Dreamsign`

**Files**
- `src/cumulus/components/hud/QuestStatusBar.tsx` — the `QsbDreamsign` type,
  `QsbSignObject`, its use in the strip and the window, and the `DS_SHADOW` const.
- `src/cumulus/components/hud/Dreamsign.tsx` — extend with a `variant`; receive
  `DS_SHADOW`.
- `src/screens/cumulus_adapters/dreamscape-view-model.ts` — `toQsbDreamsigns`.

**Interfaces**
- Consumes: shared `Dreamsign` (`src/cumulus/components/hud/Dreamsign.tsx`).
- Extended prop: `variant?: "flat" | "hud"` on `DreamsignProps`.

**Decision — FOLD with an enumerated `variant`.** `Dreamsign` already IS a
bare, chrome-free, self-sized (`sizePx`) pressable object that owns its own
`usePressReveal` + portal and raises `InfoCard variant="object"` with
`imageFilter="dreamsign-portrait"` — exactly what `QsbSignObject` re-implements.
The ONE thing the status-bar object has that `Dreamsign` lacks is its material:
`DS_SHADOW` (a drop-shadow + violet glow the object wears to sit over scene art).
So **extend `Dreamsign` with `variant?: "flat" | "hud"`** (default `"flat"` =
the chrome-free collectible tile; `"hud"` composes `DS_SHADOW` into the tile
filter). Move `DS_SHADOW` into `Dreamsign.tsx` (it is the dreamsign object's
material). `QsbSignObject`'s data is `QsbDreamsign` (`{id, name, art: ArtRef,
ability?}`), but `Dreamsign` consumes the domain `Dreamsign` data (imageName-
based); align the producer rather than fork the renderer.

**Contract**
- Extend `DreamsignProps` with `variant?: "flat" | "hud"`; compose the tile
  `filter` as the join of `dreamsign.isBane ? BANE_FILTER : null` and
  `variant === "hud" ? DS_SHADOW : null` (falling back to `"none"`).
  `DS_SHADOW = "drop-shadow(0 3px 6px rgba(0,0,0,0.55)) drop-shadow(0 0 13px rgba(147,51,234,0.32))"`
  moves in from QuestStatusBar (keep its "faithfully-copied literal, no token"
  comment).
- **Retype the producer, not the renderer:** change `toQsbDreamsigns` to return
  the domain dreamsign shape `Dreamsign` needs (pass
  `imageName`/`effectDescription`/`isBane` through; drop the
  `artRef.dreamsign(...)` pre-resolution and the `ability` rename). Retype
  `QsbDreamsign` in QuestStatusBar to the domain `Dreamsign`
  (`import type { Dreamsign } from "../../../types/quest"`) or a structural subset
  carrying `{ id, name, imageName, effectDescription?, isBane, imageAlt? }`. Update
  `buildDreamscapeHudView`'s `dreamsigns` field type accordingly.
- Delete `QsbSignObject`. In the strip render
  `<Dreamsign variant="hud" dreamsign={s} sizePx={SIGN} stageRef={stageRef} />`;
  in the window render the same with `sizePx={60}`. Pass `testid`/`revealTestid`
  to match any existing QuestStatusBar selectors.
- `QsbOverflowStack` (which also rendered `resolveArtRef(s.art)`) now sources art
  from `dreamsignArtUrl(imageName)` (exported by `Dreamsign.tsx`) — the compressed
  overlap stack keeps its own layout but reads `imageName`.
- Remove now-unused `resolveArtRef`/`ArtRef` imports if the fold eliminated every
  use (lint confirms).
- Update/extend the QuestStatusBar test + the `Dreamsign` demo to cover the
  `variant="hud"` shadow.

**Verify**
- Checks green (duplicate-literal `BASELINE`: if the dreamsign object was
  baselined, remove it).
- Browser QA the HUD dreamsign strip + overflow window:
  ```bash
  agent-browser --session t9 goto "http://localhost:5174/?goto=dreamscape&deviceFrame=iphone16"
  ```
  Assert: docked dreamsigns render with the same violet-glow drop-shadow as
  before, press-reveal raises the `object` InfoCard with the portrait filter, the
  overflow window opens; error buffer clean.

**Commit:** `refactor(hud): fold QsbSignObject onto the shared Dreamsign (hud variant)`

---

### Task 10 — Convergence: `DreamscapeMotes` → `Motes`

**Files**
- `src/cumulus/components/atlas/SiteNode.tsx` — the `DreamscapeMotes` component.
- `src/cumulus/components/atlas/site-node.css` — the `.ds-motes` rules.
- `src/cumulus/components/hud/Motes.tsx` — `MoteTint`, `TINTS`.
- `src/cumulus/primitives/cumulus-tokens.css` + the `tokens.ts` mirror — new
  `--mote-dreamscape*` tokens.
- Every `DreamscapeMotes` importer (grep).

**Interfaces**
- Consumes: `Motes({ on, tint, count, seed, zIndex })`.
- Extended: `MoteTint = "warm" | "violet" | "dreamscape"`.

**Decision — FOLD via a tint token (the audit's "a tint/mode").** `DreamscapeMotes`
is a second bespoke particle field; `Motes` already offers a deterministic
seeded field, `on`, drift animation, and a reduced-motion guard. The only field
`Motes` can't reproduce is `DreamscapeMotes`'s exact tint (its color lives in the
`.ds-motes` CSS, not a token) and its `count: 22`. So **add a third
`MoteTint: "dreamscape"`** backed by new `--mote-dreamscape` / `--mote-dreamscape-glow`
tokens carrying the `.ds-motes` color, and render
`<Motes on={on} tint="dreamscape" count={22} seed={99} />`. The per-mote base-
opacity spread (`o = 0.12 + rng()*0.3`) is dropped — cosmetic, and the drift
keyframe already animates opacity. Delete `DreamscapeMotes` and the `.ds-motes`
CSS.

**Contract**
- Read the `.ds-motes span` background/box-shadow color out of `site-node.css`;
  add `--mote-dreamscape` (fill) + `--mote-dreamscape-glow` tokens to
  `cumulus-tokens.css` with those exact values; regenerate the `tokens.ts` mirror
  (`scripts/regenerate-assets.sh`).
- Extend `MoteTint` to include `"dreamscape"` and add the `dreamscape` entry to
  `TINTS`: `{ fill: token("--mote-dreamscape"), glow: token("--mote-dreamscape-glow") }`.
- Delete `DreamscapeMotes` + the `.ds-motes` block. At each importer found by
  `grep -rn DreamscapeMotes src` (e.g. `DreamscapeScreen.tsx`), replace
  `<DreamscapeMotes on={…} />` with `<Motes on={…} tint="dreamscape" count={22} seed={99} />`
  and import `Motes` from the correct relative path.
- Remove the now-unused `mulberry32` import in SiteNode.tsx if `DreamscapeMotes`
  was its only user (lint confirms).

**Verify**
- Checks green (`no-orphan-tokens`: the two new tokens are read by `Motes`).
- Browser QA the dreamscape scene motes:
  ```bash
  agent-browser --session t10 goto "http://localhost:5174/?goto=dreamscape&deviceFrame=iphone16"
  ```
  Assert: atmospheric motes still drift over the scene at the same tint (visual
  parity within the accepted minor shift), reduced-motion holds them still; error
  buffer clean.

**Commit:** `refactor(dreamscape): fold DreamscapeMotes onto Motes (dreamscape tint)`

---

### Task 11 — Move `SiteNode`/`site-node.css`/`dreamscape-scatter.ts` → `components/dreamscape/`

**Files (move + every importer)**
- `src/cumulus/components/atlas/SiteNode.tsx` → `src/cumulus/components/dreamscape/SiteNode.tsx`
- `src/cumulus/components/atlas/site-node.css` → `src/cumulus/components/dreamscape/site-node.css`
- `src/cumulus/components/atlas/dreamscape-scatter.ts` → `src/cumulus/components/dreamscape/dreamscape-scatter.ts`
- Importers to update (enumerated by grep):
  - `src/cumulus/screens/DreamscapeScreen.tsx` (`../components/atlas/SiteNode`)
  - `src/cumulus/screens/DreamscapeScreen.test.tsx`
  - `src/screens/DreamscapeScreen.tsx` (`../cumulus/components/atlas/SiteNode` + `…/dreamscape-scatter`)
  - `src/screens/cumulus_adapters/dreamscape-view-model.ts`
  - `src/cumulus/docs/mockups/site-node.tsx`
  - `src/cumulus/docs/demos/site-node.tsx` (and the demo code-string sample inside it)
  - registry/metadata references: `src/cumulus/docs/mockups/registry.ts`,
    `src/cumulus/metadata/cumulus-metadata.json` (regenerated), and any
    `docs/demos/pressable.tsx` mention.

**Interfaces**
- No API change — module paths only (Audit §5).

**Contract**
- `git mv` the three files into `src/cumulus/components/dreamscape/`
  (`SiteNode.tsx`'s own `import "./site-node.css"` stays valid — they move
  together).
- Update every importer's path (`atlas/` → `dreamscape/`); multi-line named
  imports change only the `from "…"` line.
- Fix the demo code-string sample for accuracy (inert, but correct).
- Run `scripts/regenerate-assets.sh` (regenerates `cumulus-metadata.json`); stage
  drift. Confirm no dangling reference:
  `grep -rn "components/atlas/SiteNode\|atlas/dreamscape-scatter\|atlas/site-node.css" src` → empty.

**Verify**
- Checks green (typecheck catches any missed importer).
- Quick smoke QA: `?goto=dreamscape` still renders site nodes.

**Commit:** `refactor(cumulus): move SiteNode + scatter to components/dreamscape/`

---

### Task 12 — `HOVER_TARGET_WIDTH_PX` derives from `MAX_SCALE`

**Files**
- `src/cumulus/screens/DesktopDeckViewer.tsx` — the `HOVER_TARGET_WIDTH_PX` map.
- `src/cumulus/components/card/HoverZoomCard.tsx` — `export const MAX_SCALE = 1.5`.

**Interfaces**
- Consumes: `MAX_SCALE` (already exported, value `1.5`).

**Comment-synced math.** Medium's target must sit **below**
`tileWidth(medium) × MAX_SCALE` to govern the scale rather than be clamped to the
cap (`190 × 1.5 = 285`; `250` yields ~1.32×). Small/large keep a generous `340`
(small stays pinned at the `1.5×` cap, large lands ~1.42×). Derive medium's
target from the imported `MAX_SCALE` so the "below cap" relationship can't drift.

**Contract**
- Import `MAX_SCALE` and the medium tile width (reuse the `DECK_TILE_WIDTH_PX.medium`
  source from `desktop-deck-filter.ts`; export that constant if it isn't already).
- Replace the hardcoded medium `250` with a value explicitly derived as a fraction
  of `mediumTileWidth × MAX_SCALE` (e.g. `Math.round(190 * MAX_SCALE * 0.877)` ≈
  250 / ~1.32×, or a cleaner `190 * 1.32`), keeping small/large at `340`. The
  point is the value **references `MAX_SCALE`**, not a bare `250`; keep the
  explanatory comment. Tune the factor so the value lands at ~250/~1.32×.

**Verify**
- Checks green.
- Browser QA: `?goto=deckviewer` (w 1280), hover a Medium card → gentle ~1.32×
  pop, Small pins at the cap, Large ~1.42×. Error buffer clean.

**Commit:** `refactor(deck): derive medium hover target from HoverZoomCard MAX_SCALE`

---

### Task 13 — `AtlasNode` renders through `Pressable` (kills raw `role="button"`)

**Files**
- `src/cumulus/components/atlas/AtlasNode.tsx` — the raw
  `role={isAvailable ? "button" : "img"}` div with `onClick` + `tabIndex` +
  hand-rolled `onKeyDown` Enter/Space.
- `src/cumulus/components/atlas/atlas.css` — node centering
  (`transform: translate(-50%,-50%)`).

**Interfaces**
- Consumes: `Pressable` (`src/cumulus/primitives/Pressable.tsx`).

**Design.** The interactive (`isAvailable`) node must not carry
`role="button"` + `onClick` + `tabIndex` + hand-rolled `onKeyDown` on a raw
`<div>` — that is exactly what the components-tier `no-raw-interactive-elements`
extension (Task 19) forbids. Render the available node through `Pressable`
(the one interactive primitive: role, `tabIndex`, Enter/Space activation, press
feedback). The non-available node stays a plain non-interactive
`<div role="img">` (allowed). **Gotcha:** `atlas.css` centers the node with
`transform: translate(-50%,-50%)` and `Pressable` owns the element `transform`
(its press/hover scale). Move the centering off `transform` onto margin offsets
(`marginLeft`/`marginTop` = `-size/2`, mirroring the `SiteNode` centering idiom)
so `Pressable`'s scale composes cleanly; keep the `.node-art` child hover scale
(tokenized in Task 14).

**Contract**
- Split the render: when `isAvailable`, render `<Pressable as="div" …>` carrying
  the node's `onClick(node.id)`, pointer handlers, `aria-label`, `data-*`, style
  (minus the now-margin centering), and the `--atlas-node-size`/`--atlas-badge-scale`
  custom props — **drop** the manual `role`/`tabIndex`/`onKeyDown` (Pressable
  supplies them). When not available, render a plain `<div role="img" …>` with no
  activation handlers.
- In `atlas.css`, replace the node's `transform: translate(-50%,-50%)` centering
  with `margin-left`/`margin-top` offsets (or move centering to a wrapper) so
  `Pressable`'s transform is free. Verify the boss/starter/known-dreamsign badges
  (positioned off the node box) still align.
- Update the AtlasNode test/demo if it asserted the raw `role`/`onKeyDown`.

**Verify**
- Checks green.
- Browser QA the atlas (keyboard + pointer):
  ```bash
  agent-browser --session t13 goto "http://localhost:5174/?goto=atlas"
  ```
  Assert: an available node is focusable, Enter/Space and click both activate it,
  hover scales the art, node + badges are centered correctly (no drift from the
  margin change), unreachable nodes are non-interactive; error buffer clean.

**Commit:** `refactor(atlas): AtlasNode routes interaction through Pressable`

---

### Task 14 — `AtlasNode`/`SiteNode` hover scales → `--node-hover-scale` token

**Files**
- `src/cumulus/primitives/cumulus-tokens.css` + the `tokens.ts` mirror —
  `--node-hover-scale`.
- `src/cumulus/components/atlas/atlas.css` — the `.is-hover .node-art` `scale(1.07)`.
- `src/cumulus/components/dreamscape/SiteNode.tsx` — the node hover `scale(1.08)`
  (post-move path).

**Interfaces**
- `Pressable` exports `HOVER_SCALE = 1.03`, `PRESS_SCALE = 0.9`.

**Decision (from Pressable's exports).** The node hover scales (1.07/1.08) are
deliberately larger than `Pressable`'s generic `HOVER_SCALE` (1.03) — a map node
needs a bigger pop than an inline pressable. Per the §4 guidance, since the node
scales must stay larger than the exported constant, **add ONE tokenized
`--node-hover-scale` (value `1.08`)** and route both sites through it (rather than
forcing them onto `HOVER_SCALE`). This is the sanctioned, documented node-scale
exception and satisfies Task 18's `no-adhoc-press-scale` (a `var()`/`token()`
reference is not an ad-hoc literal).

**Contract**
- Add `--node-hover-scale: 1.08;` to `cumulus-tokens.css` (comment: the map-node
  hover pop, larger than `--hover-scale` by design) and regenerate the `tokens.ts`
  mirror.
- `atlas.css`: the `.node-art` hover `scale(1.07)` → `scale(var(--node-hover-scale))`.
- `SiteNode.tsx`: the node hover `"scale(1.08)"` →
  `` `scale(${token("--node-hover-scale")})` ``. The identity `"scale(1)"` reset
  stays (Task 18's rule exempts `scale(1)`).

**Verify**
- Checks green (`no-orphan-tokens`: the new token is read by both files).
- Browser QA: `?goto=atlas` and `?goto=dreamscape` — nodes still pop to the same
  size on hover; error buffer clean.

**Commit:** `refactor(atlas): node hover scales read the --node-hover-scale token`

---

### Task 15 — Draft-screen seam: shared menu-geometry consumed by `DraftScreen`

**Files**
- `src/cumulus/screens/chrome-geometry.ts` (**new** — shared source of truth)
- `src/components/DreamscapeQuestMenu.tsx` — consume the shared consts.
- `src/cumulus/screens/DraftScreen.tsx` — the top-band clearance math (`TOP_SAFE_OP`).

**Interfaces**
- Produces:
  ```ts
  export const MENU_BUTTON_PX = 48;
  export const MENU_EDGE_INSET_MOBILE_PX = 18;
  ```

**Boundary reconciliation (NOT a name change).** The seam wants
`DreamscapeQuestMenu`'s geometry consumed by `DraftScreen`. `DraftScreen` is
`src/cumulus/**` and **cannot import from `src/components/**`** (`no-external-ui-imports`,
`ALLOWED_PREFIXES`). So the pinned constants `MENU_BUTTON_PX` /
`MENU_EDGE_INSET_MOBILE_PX` live in a shared **Cumulus** module
(`src/cumulus/screens/chrome-geometry.ts`) that BOTH the legacy menu (allowed to
import from `src/cumulus/`) and `DraftScreen` import. The pinned names are
preserved verbatim; only the export location is a shared Cumulus spec (the §162
"or a shared chrome spec" allowance). This is the sole deviation, and it is a
location, not a name.

**New clearance formula (exact — this literal is the contract).** `DraftScreen`'s
top band currently over-reserves via the `--safe-top` floor (Addendum A4). Make it
explicitly clear the menu's bottom edge. The menu sits at
`top: max(safe-inset-top, MENU_EDGE_INSET_MOBILE_PX)` with height `MENU_BUTTON_PX`,
so its bottom = `max(inset, edge) + MENU_BUTTON_PX`. The top band is the max of the
safe floor and that:
```ts
const TOP_SAFE_OP =
  `max(var(--safe-area-inset-top), ${token("--safe-top")}, ` +
  `calc(max(var(--safe-area-inset-top), ${String(MENU_EDGE_INSET_MOBILE_PX)}px) + ${String(MENU_BUTTON_PX)}px))`;
```

**Contract**
- Create `chrome-geometry.ts` with the two pinned exports (+ doc comment: the
  shared dreamscape-menu chrome geometry, read by the menu and by screens that
  must clear it).
- In `DreamscapeQuestMenu.tsx`, import them and set `const menuBtnSize = MENU_BUTTON_PX;`
  and `const menuEdgeInset = isDesktop ? 22 : MENU_EDGE_INSET_MOBILE_PX;` (the
  desktop `22` stays local — the seam is about the mobile inset the draft screen
  must clear).
- In `DraftScreen.tsx`, import the geometry and replace `TOP_SAFE_OP` with the
  formula above (now consuming the exported geometry rather than relying on the
  `--safe-top` floor coincidence). `COUNTER_BAND_OP`/`HUD_CLEARANCE_OP` stay.

**Verify**
- Checks green.
- Browser QA the draft screen top band clears the hamburger:
  ```bash
  agent-browser --session t15 goto "http://localhost:5174/?goto=draft&ui=cumulus&deviceFrame=iphone16"
  agent-browser --session t15 eval "({href:location.href,w:innerWidth})"
  agent-browser --session t15 screenshot draft-menu-clearance.png
  ```
  Assert: the floating pick counter and pack sit clear below the hamburger disc
  (no overlap), at both a cut-out device and a plain narrow viewport; error
  buffer clean.

**Commit:** `fix(draft): clear the hamburger via shared menu geometry`

---

### Task 16 — Draft-site `?goto=` qa-scene verified + documented

**Files**
- `src/runtime/qa-scenes.ts` — the `siteScene("draft", "Draft", "Draft")` entry.
- `docs/quest_prototype/qa_scenes.md`

**Interfaces**
- Consumes: `parkOnSite` + the QA foundation (`createQaQuestFoundation`), which
  already seeds a non-null `draftState` (`initializeDraftState(...)` in
  `start-in-battle-state.ts`).

**Finding.** A `?goto=draft` scene already exists and IS bootable:
`parkOnSite("Draft")` spreads `...foundation.state`, whose `draftState` is a valid
`PoolDraftState` with `activeSiteId: null`. So the Cumulus `DraftSiteScreenAdapter`
(mobile-gated via `cumulusSiteScreenFor`) can
`bootstrapLocalDraftState(state.draftState /* non-null */, siteId, …)` and paint
the real first offer. The remaining gap (Addendum A4) is that the scene is
**undocumented**. Verify-then-document; only add a dedicated scene if QA shows the
existing one paints an empty pack.

**Contract**
- QA `?goto=draft&ui=cumulus` at a mobile viewport and confirm the pack paints a
  real 2×2 offer with the floating pick counter. If it paints (expected), **no
  code change** — just document. **If** it renders blank (draft adapter returns
  null), add a `DRAFT_SITE_SCENE` following the `startingdeck` override pattern
  (build the foundation, retype a starter site to `"Draft"` via `parkOnSite("Draft")`,
  confirm `draftState` non-null, register in `QA_SCENES` as `"draftsite"`). Given
  the foundation seeds `draftState`, the existing `siteScene("draft",…)` should
  suffice — prefer documenting it over a duplicate.
- Add a `?goto=draft` row to `docs/quest_prototype/qa_scenes.md`: what it shows
  (the Cumulus draft site with a rolled first offer + the floating
  `Draft (n/total)` pick counter over the starter dreamscape), that it is
  mobile-gated for the Cumulus screen (desktop falls back to the legacy draft
  screen), and the `&ui=cumulus` + `&deviceFrame=` usage. Current behavior only
  (no removed-state phrasing).

**Verify**
- Checks green (docs edit + optional scene).
- Browser QA:
  ```bash
  agent-browser --session t16 goto "http://localhost:5174/?goto=draft&ui=cumulus&deviceFrame=iphone16"
  agent-browser --session t16 screenshot draft-scene.png
  ```
  Assert: a real offer pack + pick counter render; picking advances the pack;
  error buffer clean.

**Commit:** `docs(qa): document the ?goto=draft site scene`

---

### Task 17 — ESLint `no-raw-icon-classes` + generation-time glyph check

**Files**
- `eslint-rules/no-raw-icon-classes.js` (**new**)
- `eslint-rules/no-raw-icon-classes.test.ts` (**new**)
- `eslint.config.js` — register + apply under the `src/cumulus/**` +
  `src/screens/cumulus_adapters/**` block.
- `scripts/cumulus-glyphs-exist.test.mjs` (**new** — generation-time companion) OR
  a check folded into `scripts/generate-cumulus-metadata.mjs`.
- (bonus) `src/screens/ShopScreen.tsx` + `pre-existing-issues.txt`.

**Rule spec.** A Boxicons class string (`bxf …` or a token containing `bx-*`)
literal is legal **only** in `src/cumulus/primitives/glyph.ts`. Everywhere else
under `src/cumulus/**` and `src/screens/cumulus_adapters/**` a glyph must arrive as a
`Glyph` (`GLYPHS.*` / `glyph(...)`) rendered through `GlowIcon`/`PipBadge`.
Scope like the existing rules (self-scope inside the rule; the config already
binds `src/cumulus/**` + `src/screens/cumulus_adapters/**`). Detect string/template
literals matching `/\bbxf?\b|\bbx-[a-z-]+/` and report unless the file is
`src/cumulus/primitives/glyph.ts`.

**Why it lands here.** After Task 5 (QuestStatusBar raw `<i className="bxf bx-x">`
→ `IconButton`) and Task 3 (gear glyphs moved into `GLYPHS`), the only in-scope
raw-class site is cleared. `ShopScreen.tsx` (`"bxf bx-refresh"`) is
**legacy-tier** (`src/screens/`, outside the rule's scope) — the
pre-existing-issues entry stays open, OR fix it opportunistically (below).

**Generation-time companion.** Add a test that every `GLYPHS` class resolves to a
real rule in the vendored stylesheets (`src/vendor/boxicons/boxicons.css` +
`boxicons-filled.css`) — parse the `GLYPHS` values, strip the `bxf`/`bx` prefix,
and assert each `bx-*` selector exists. This closes the blank-icon class filed in
pre-existing-issues (`bx-refresh`).

**Contract**
- Author `no-raw-icon-classes.js` mirroring `valid-token-references.js`'s
  structure: repo-relative self-scoping, `EXEMPT` = the single file
  `src/cumulus/primitives/glyph.ts`, scan `Literal` + `TemplateElement`. The message
  points at `GLYPHS` / `GlowIcon`.
- Author `no-raw-icon-classes.test.ts` mirroring `no-raw-interactive-elements.test.ts`
  (RuleTester + vitest bridge). Valid: a `bx-` string inside `glyph.ts`, and a
  `GLYPHS.close` usage elsewhere. Invalid: a raw `<i className="bxf bx-x" />` in a
  components-tier file. Derive fixtures; don't pin arbitrary counts.
- Register in the `cumulus` plugin and add `"cumulus/no-raw-icon-classes": "error"` to
  the `src/cumulus/**` + `cumulus_adapters/**` block in `eslint.config.js`.
- Add `scripts/cumulus-glyphs-exist.test.mjs` (glyph→css existence) running under
  `npm test`; wire it into `regenerate-assets.sh` if that is where glyph
  validation best fits.
- **Bonus (one line):** fix `ShopScreen.tsx` `"bxf bx-refresh"` →
  `"bxf bx-refresh-cw"` and remove the corresponding entry from
  `pre-existing-issues.txt` (or leave both if out of appetite — state which in the
  commit body). ShopScreen is out of the rule's scope; this purely closes the
  pre-existing item.

**Verify**
- `npm run lint` → passes (no in-scope violations); temporarily add a raw `bx-x`
  literal to a components-tier file and confirm the rule fires, then revert.
- `npm test` → the rule test + the glyph-existence test pass.

**Commit:** `feat(lint): enable no-raw-icon-classes + glyph-existence check`

---

### Task 18 — ESLint `no-adhoc-press-scale` (JS + CSS companion)

**Files**
- `eslint-rules/no-adhoc-press-scale.js` (**new**)
- `eslint-rules/no-adhoc-press-scale.test.ts` (**new**)
- `eslint.config.js` — register + apply.
- `scripts/cumulus-css-press-scale.test.mjs` (**new**) — the CSS companion scan
  (decision below).

**Rule spec (JS).** A `scale(`/`scaleX(`/`scaleY(` call inside a `transform`
value, in any file under `src/cumulus/**` **except** `Pressable.tsx`, must not take
a **numeric literal** argument (other than the identity `scale(1)` reset). It
must reference an identifier (`PRESS_SCALE`/`HOVER_SCALE`) or a token
(`token("--…")` / a `var(--…)` string). Detect string/template literals and
template expressions whose `scale(...)` argument is a bare number ≠ 1.

**CSS companion — decision: a small standalone scripts test.**
`scripts/cumulus-duplicate-literals.test.mjs` is a Phase-2 artifact whose job is
duplicate detection; adding a scale scan there overloads it. Add a dedicated
`scripts/cumulus-css-press-scale.test.mjs` that greps every `src/cumulus/**/*.css`
for `transform:\s*scale(<number>)` and fails unless the argument is a `var(--…)`.
This mirrors the integrity-test pattern (source-text scan, exported `BASELINE`
if any transitional offender remains — expected empty after Task 14).

**Why it lands here.** After Task 14, `SiteNode.tsx` reads
`token("--node-hover-scale")` and `atlas.css` reads `var(--node-hover-scale)` —
both compliant. `QsbSignObject` is gone (Task 9); `Dreamsign`/`Pressable` use the
exported constants. No in-scope literal scale remains.

**Contract**
- Author `no-adhoc-press-scale.js` (self-scoped to `src/cumulus/**` minus
  `Pressable.tsx`; flag `scale(<numeric-literal ≠ 1>)` in `transform`
  strings/templates). Message points at `HOVER_SCALE`/`PRESS_SCALE`/`--node-hover-scale`.
- Author its RuleTester test — valid: `` `scale(${HOVER_SCALE})` ``,
  `` `scale(${token("--node-hover-scale")})` ``, `"scale(1)"`; invalid: `"scale(1.08)"`.
- Register + apply `"cumulus/no-adhoc-press-scale": "error"`.
- Add `scripts/cumulus-css-press-scale.test.mjs` running under `npm test`.

**Verify**
- `npm run lint` + `npm test` green; add a temporary `scale(1.2)` literal to a
  components-tier file and to a `.css` file, confirm both checks fire, revert.

**Commit:** `feat(lint): enable no-adhoc-press-scale (JS + CSS companion)`

---

### Task 19 — `no-raw-interactive-elements` components-tier extension

**Files**
- `eslint-rules/no-raw-interactive-elements.js` — the `EXEMPT_PREFIXES` list.
- `eslint-rules/no-raw-interactive-elements.test.ts` — add a components-tier case.

**Extension (one-line scope widen).** The config glob already binds
`src/cumulus/**`; the rule self-exempts the components tier via
`EXEMPT_PREFIXES` (the `"src/cumulus/components/"` entry). **Delete that entry** so
the rule also polices `src/cumulus/components/**`. Keep the
`primitives/`, `docs/`, `screens/devtools/` exemptions (the primitive is where
`Pressable` legitimately owns the raw element).

**Why it lands here.** Task 13 already routed `AtlasNode`'s interaction through
`Pressable`, so the components tier has no remaining raw `role="button"` /
hand-rolled key handling. Widening the scope now ships clean.

**Contract**
- Remove `"src/cumulus/components/"` from `EXEMPT_PREFIXES`.
- Add an invalid RuleTester case with a `src/cumulus/components/**` filename (a raw
  `role="button"` div) and a valid case (a components file rendering through
  `Pressable`).
- Run `npm run lint` and route any components-tier raw-interactive site the
  widened scope surfaces through `Pressable` (there should be none after Task 13).

**Verify**
- `npm run lint` green over the whole components tier; `npm test` (rule test)
  green.

**Commit:** `feat(lint): extend no-raw-interactive-elements to the components tier`

---

### Task 20 — Phase boundary verification

**Files**
- (verification only; commit any generated drift)

**Contract**
- `npm run lint && npm run typecheck && npm test` → all green. Paste the tail of
  each (expect `0 problems`, `0` TS errors, all suites passing).
- `scripts/regenerate-assets.sh` → run it; `git status` must show either no drift
  or only intended generated files (tokens mirror, `cumulus-metadata.json`, docs
  adoption counts). Commit any drift.
- **Sweep assertion — no `glassIconButtonChrome()` call site survives outside
  `IconButton`:**
  ```bash
  grep -rn "glassIconButtonChrome" src --include="*.ts" --include="*.tsx" \
    | grep -v "src/cumulus/components/controls/IconButton.tsx" \
    | grep -v "src/cumulus/internal/"
  ```
  Expected output: **empty** (the recipe is referenced only by `IconButton` and
  its own `src/cumulus/internal/` definition). Any printed line is a missed call
  site — migrate it before closing the phase.
- **Incubating-flag audit:** `grep -rn "incubating" src/cumulus/docs` — confirm
  `IconButton` and `GlassDialog` flags are removed (Tasks 1, 8). `GlassButton`
  gained **no** production consumer among these migrations (all six sites are icon
  discs, not labeled glass buttons), so its `incubating` flag **remains** (the
  sanctioned escape) — record this in the commit body and flag it for Phase 4 to
  either find a labeled-glass consumer or reassess. Not a name deviation.
- Confirm both `cumulus/internal` `ignores` entries (`StartingDeckModal.tsx`,
  `DreamscapeQuestMenu.tsx`) and the `StartingDeckModal` legacy-ratchet `BASELINE`
  entry are gone.
- Final `git push`.

**Commit:** `chore(cumulus): Phase 3 boundary — checks green, generated drift committed`

---

## Deviations from pinned names

**None.** The one reconciliation: the pinned `MENU_BUTTON_PX` /
`MENU_EDGE_INSET_MOBILE_PX` constants (Task 15) are exported from a shared Cumulus
module (`src/cumulus/screens/chrome-geometry.ts`) rather than literally from
`src/components/DreamscapeQuestMenu.tsx`, because `no-external-ui-imports`
forbids `DraftScreen` (`src/cumulus/**`) importing from `src/components/**`. The
spec explicitly permits "a shared chrome spec"; the names are unchanged.
