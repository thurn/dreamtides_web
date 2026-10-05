# Phase 2: Aggressive Cleanup

**Goal:** a lean, solo, local-first, English-only product codebase that
contains **only what builds, runs, tests, plays, or QAs the game**
([D8](decisions.md#d8-aggressive-cleanup)). That means:

- three docs;
- one project skill;
- no Rust;
- no Firebase;
- no localization;
- no RON;
- no editors.

**Player-visible look and flows stay as they are**
([D30](decisions.md#d30-ui-preservation)), apart from deleted tool routes and
co-op chrome.

**For every touched screen,** capture before/after screenshots at desktop
1440×900 and mobile 390×844, and compare them.

**Deleting is the default.** When it is unclear whether something is needed,
check whether a game route, a QA scene, the build, or a surviving test reaches
it. If nothing does, delete it. Git history keeps everything.

**Read first:**

- [decisions D3, D8, D32, D33, D35](decisions.md);
- `src/App.tsx` and `src/root-router.tsx`;
- `src/eventlog/`, `src/coop/hooks.ts`, `src/coop/RoomGate.tsx`;
- `scripts/prepare-workspace.mjs`;
- `package.json`;
- `.tollgate/config.toml` (the local trusted policy).

## Tasks

### 2.1 Docs and skills to the end state (D33)

Do this first, so stale guidance stops consuming context.

1. **Move the rules.** Move `docs/battle_rules/battle_rules.md` to
   `docs/rules.md` without editing its content.
2. **Write `docs/design.md`.** Make it a current-state condensation of the
   game design:
   - `docs/journeys/journeys.md`: journeys, dreamscapes, guides, sites,
     economy, limits, the atlas, transfigurations;
   - `banes.md` (Nightmare);
   - `bosses.md`, to be replaced by Apollyon in Phase 5;
   - the site and guide data facts that the code doesn't make obvious;
   - a short "Future: meta-progression" section (D7).

   State the nine transfigurations with Empowered rounding down
   ([F5, F6](decisions.md#established-facts)); `journeys.md`'s Empowered
   examples are inconsistent and are not carried over.

   Keep design intent. Drop implementation narration.
3. **Rewrite `README.md`** in the current state. Cover:
   - what the game is;
   - prerequisites;
   - `npm run dev`, test, review, build;
   - browser QA essentials, merged in from `qa_tooling.md`, `qa_scenes.md`,
     and `url_parameters.md`. These include port ≥5174 for QA servers, the
     Playwright MCP service, `__caps`, assert-before-acting, the `?goto`
     scenes list, and the `?debug`/`?ai`/`?seed` parameters;
   - an architecture overview: intent log and fold, engine, UI, AI;
   - the data layout;
   - the conventions.
4. **Delete:**
   - every other file under `docs/`, except `docs/plan/`;
   - `dda/`;
   - `.superpowers/`;
   - every `.llms/skills/*` except `cumulus`.
5. **Rewrite `.llms/skills/cumulus/SKILL.md`** to be self-contained, at most
   ~150 lines: when to use Cumulus components, tokens and spacing rules, and
   the screen/adapter pattern. Fold in what is still needed from
   `cumulus-migrate` and the deleted Cumulus docs.
6. **Update `AGENTS.md`** for the new paths and the deleted guidance.
   Procedural detail moves to the README. Update `docs/plan/` pages that link
   to deleted docs.

**Acceptance:**

- Outside `docs/plan/`, the tracked Markdown files are exactly `README.md`,
  `AGENTS.md`, `CLAUDE.md`, `docs/rules.md`, `docs/design.md`, and
  `.llms/skills/cumulus/SKILL.md`. Markdown files inside directories that
  later beads delete are allowed until those beads.
- No relative link points at a missing file or anchor. Check with a small
  script.

### 2.2 Delete tools and dev-only sites

Delete all of these:

- **Every standalone route** in `src/root-router.tsx` (`STANDALONE_ROUTES`),
  with its code:
  - `/cards`, `/editor` (`src/editor/`);
  - `/dreamsigns`, `/glossary`, `/exploration`, `/avatars`, `/tides`,
    `/dreamscapes`, `/figments`, `/dreamwell`;
  - `/images`, `/images/favorites` (`src/image_viewer/`);
  - `/offers`;
  - `/cumulus` (`src/cumulus/docs/`, ~14k lines);
  - `/recover`, which is replaced in 2.5.
- **The Cumulus docs and metadata generators:** the
  `generate-cumulus-docs`/`metadata`/`tokens` scripts that only serve docs,
  `react-docgen-typescript`, and the integrity baselines that police only
  docs. Keep the token generation if the game's CSS needs it. Also delete
  `src/cumulus/screens/devtools/`.
- **Tabula:** `tabula/`.
- **Unity Cumulus:** `cumulus/` at the repository root.
- **Analysis tooling:**
  - `pool-metrics`, `draft-replay-metric`, `tides-similarity`, the
    `experiment-*.mjs` oracles;
  - `first-pick-cache/`, `first_picks.txt`;
  - the alternate draft algorithms (`?algo=` other than tides4), keeping
    everything tides4 needs.
- **Tracked junk:** `saved-journeys/` unless a QA scene uses it, stale
  artifacts, and anything else no route, build, or test reaches.

This is one or two beads.

**Acceptance:**

- A synthetic-catalog contract test pins that tides4 drafts are unchanged.
- The build has no tool routes.
- `review:full` passes.

### 2.3 RON → TypeScript data modules (D32)

1. **Convert the catalogs.** Convert all 35 `data/**/*.ron` catalogs into
   typed modules under `src/content/` (layout in
   [engine-design](engine-design.md#ability-dsl-and-content-modules)).
   - Cards, dreamsigns, avatars, Dreamwell, and figments are one file per
     entity, with an explicit `index.ts`.
   - Tunables and journey catalogs are one module each: battle, opponents,
     AI, atlas, dreamscapes, guides, sites, economy, tides, exploration,
     gamble, augury, transfiguration, shop, tutorial, glossary, and resonance.

   Write a one-off converter script, not kept. Carry over the RON comments.
   The catalogs wrap player-facing text in `Tx("…")`; the converter unwraps
   it into plain English strings, so no data module depends on Trox. This
   task runs before 2.4 deletes Trox for that reason.
   Cards get `pending: true`, or `vanilla: true` when they have no rules
   text; Phase 3 introduces the ability fields. `amplifiedText` holds the
   **expanded** amplified rules text from the generated runtime JSON, not the
   RON's compact replacement fragment
   ([engine-design](engine-design.md#ability-dsl-and-content-modules)).
2. **Prove parity.** Before deleting the pipeline, run a one-off check that
   every converted catalog deep-equals the current generated runtime JSON,
   value for value (D11). Where the runtime JSON holds a
   `trox-source-message-ref`, compare against its resolved English text.
   Record it in the bead notes.
3. **Switch the runtime.** Replace `fetch("/card-data.json")` and its siblings
   with imports, so data loading becomes synchronous where that simplifies
   code.
4. **Delete the RON pipeline:**
   - `tools/game-data/` (Rust, 26.6k lines);
   - `scripts/game-data-*`, `format-ron`, `.ronfmt.json`, the TOML
     compatibility layer, and generated `public/*-data.json`;
   - the data phases of `scripts/prepare-workspace.mjs`, keeping only art
     symlinking and whatever the localization step in 2.4 still needs until
     it is deleted;
   - `rust-toolchain.toml`;
   - the RON-related review steps (`ron-format-check`, `rust-format-check`,
     `rust-test`, `clean-game-data`);
   - `data/`.

Split into beads:

- (a) entity catalogs;
- (b) journey and tunable catalogs;
- (c) the runtime switch;
- (d) the pipeline deletion. Trox still runs until 2.4. If its Tollgate
  `trox` step reads anything under `data/`, this bead regenerates the Trox
  artifacts from the remaining sources so the step stays green.

**Acceptance:**

- Parity is recorded.
- `data/`, `tools/`, and `.ron` files are gone.
- `npm run review:full` passes.
- The game plays as before (browser smoke: journey start → draft → battle
  start).

### 2.4 English-only (D35)

The data modules already hold plain English (2.3), so nothing upstream of
`src/` depends on Trox.

1. **Codemod the text.** `tx(...)` and `txa(...)` calls become plain strings
   and template literals. `LocalizedString` becomes `string`. Selector and
   plural helpers become small English functions.

   Do it in reviewable batches by directory, keeping rendered output
   identical. Spot-check with before/after screenshots of the main screens and
   battle.
2. **Delete Trox entirely:**
   - `trox.ron`, `localization/`, `.trox-revision`, `vendor/trox-runtime`;
   - `scripts/trox*.mjs`, `scripts/*localization*`, the player-localization
     and domain-string audits;
   - the Trox Vite plugin and the `trox:*` npm scripts;
   - the localization ESLint rules;
   - the generated bundles and the remaining localization phase of
     `scripts/prepare-workspace.mjs`.
3. **Update the gates:**
   - The Tollgate policy loses its `trox` step and `TROX_ROOT`, through
     `tg --no-launch config validate` then `apply`. Record the old and new
     config in `metrics.md`.

**Acceptance:**

- No `tx(`, `txa(`, `LocalizedString`, or `trox` appears in `src/`,
  `scripts/`, or the configs.
- Screens render identically to before.
- The gate passes without a trox step.
- No Rust toolchain is needed. Check this on a clean checkout:
  `npm ci && npm run review:full`.

### 2.5 Local-first log (core-review)

The log has one local writer, so build the simplest thing that preserves the
fold.

- **`LocalLog`:**
  - an ordered in-memory event list with synchronous append;
  - written through to IndexedDB, one store per local game ID;
  - a periodic fold checkpoint, so long journeys load quickly.
- **Keep:**
  - the pure reducer;
  - intents (`src/coop/actions.ts` → `src/session/actions.ts`);
  - deterministic randomness from the game seed and sequence number;
  - deterministic bounces for invalid intents;
  - `LOAD_STATE` save and load files;
  - replay;
  - the invariant checks.
- **Single controller.** Every controller check resolves to the single local
  player. That covers the tutorial's room controller and the
  collaborative-control handoff. The tutorial keeps working.
- **Keep the log sink.** Keep the browser → `/api/log` → Vite
  `journeyLogPlugin` → `logs/journey-log.jsonl` path for development, through
  `createJourneyLogMirror`, moved out of co-op code.
- **Capture production logs** ([D40](decisions.md#d40-production-log-capture)).
  This replaces the RTDB room-log sink:
  - persist each game's log entries in IndexedDB beside its `LocalLog`, with a
    cap that evicts the oldest games first;
  - add an "Export log" control to the error fallback and the game menu. It
    downloads the game's log as JSONL in the journey-log line format;
  - copy lives in the UI copy module.
- **Delete:**
  - RoomGate and rooms;
  - presence and identicons (`@dicebear`);
  - Take Control and the hosted-playtest shell;
  - optimistic echo, reconciliation, compaction, room generations,
    `/recover`, FuzzProbe, `coop-fuzz`, `demo:certify`;
  - the RTDB room-log sink.

  A "Recover game" button in the error fallback rebuilds from the latest
  valid local checkpoint.
- **Game identity:** `?game=<id>` selects a local game. The front door keeps
  its look; "create game" creates a local game, and recent games resume.

**Acceptance:**

- A new journey, reload mid-journey, reload mid-battle, and save → load each
  reproduce identical folds. Pin this with tests on an in-memory IndexedDB
  adapter behind the same interface.
- Browser QA: front door, journey start, battle start, and a reload, with
  screenshots matching apart from removed co-op chrome and `__caps` empty.
- The dev server needs no Java.
- A production build (`npm run build` plus a static preview) records a
  journey's log entries, and the export yields JSONL that the `log-analysis`
  line format parses. Pin persistence and eviction with tests on the
  in-memory IndexedDB adapter.

### 2.6 Remove Firebase entirely (D2)

Delete:

- the Firebase SDK and its config modules;
- `firebase.json`, `.firebaserc`, `database.rules.json`, `.firebase/`;
- the emulator startup, so `npm run dev` is the workspace prep plus Vite on
  the given port;
- `scripts/deploy.sh` and `upload-assets-to-storage.mjs`;
- the `firebase` and `firebase-tools` dependencies;
- the `VITE_FIREBASE_*` handling and the `.env.production` placeholders.

Keep `VITE_ASSET_BASE_URL` for production art. `npm run build` produces a
static `dist/`.

**Acceptance:**

- No `firebase` appears in `src/`, `scripts/`, the configs, or
  `package.json`.
- `npm run build` succeeds with no env file.

### 2.7 Scripts, npm scripts, dependencies, and lint rules

- **Scripts.** Keep only what an essential npm script reaches: dev, build,
  test, review, lint, typecheck, setup-assets, and the screenshot runtime for
  QA. Delete the rest of `scripts/`, from ~200 files to about 25, along with
  their tests and npm entries. Phases 3–7 add their own tools later.
- **Dependencies.** Prune with `knip` (dependencies mode). Expect to delete
  `smol-toml`, `js-sha256` or `@noble/hashes` if they are duplicates,
  `markdownlint-cli2`, and anything else unused.
- **Custom ESLint rules.** Cut 45 → about 8. Keep only rules guarding real bug
  classes, such as name-keyed card logic and Cumulus spacing tokens. Delete
  the rest with their tests.

**Acceptance:** `metrics.md` shows the script, dependency, and rule counts
before and after, and lint time before and after.

### 2.8 Dead-code and legacy sweep

1. **Remove dead code.** Run `knip` on files and exports and remove what it
   finds, with judgment. Every allowlist entry needs a reason.
2. **Remove known legacy:**
   - `STANDARD_ENERGY_RAMP` and its plumbing (F1);
   - prototype save migrations (`nightmare-migration.ts`,
     `shop-purchase-migration.ts`, and any others);
   - URL parameters for removed experiments;
   - orphaned test scaffolding.
3. **Sweep temporary and testing scaffolding.** Grep production paths for
   `TODO`, `HACK`, `FIXME`, `temporary`, `for testing`, `prototype`,
   `playtest`, and debug-only branches. Each hit is either deleted, made
   dev-only (P7), or converted into a real feature. A conversion is filed as a
   bead.
4. **Leave the battle sandbox alone.** Phase 4 replaces it.
5. **Clear `pre-existing-issues.txt`.** The Trox item disappears with 2.4.

**Acceptance:**

- `knip` is clean outside the reasoned allowlist.
- The suite is green.

### 2.9 Mason audit and refactors

1. **Audit.** Run the Hive `mason` skill, read-only, over the surviving
   codebase. Have it file bounded beads (label `mason`), with these
   priorities:
   - type safety and illegal states, especially IDs, journey and site state,
     and fold events;
   - prototype shortcuts that became structure;
   - any name-keyed card logic (always a bug; see AGENTS.md);
   - files over ~1000 lines in `src/screens` and `src/rules`;
   - brittle tests.

   Skip `src/battle/` and `src/rules/battle/`, which Phases 3–4 replace.
2. **Chain the beads.** Chain every filed bead before the gate and implement
   all of them in this phase; this plan authorizes it
   ([workflow § Mason passes](workflow.md#mason-passes)). Each preserves
   behavior and rendering, with screenshots for touched screens.

### 2.10 Phase gate

1. Re-measure the Phase 1 set, adding an "after Phase 2" column to
   `metrics.md`. Expect a much shorter gate: no trox step, no Rust steps,
   fewer tests and rules.
2. Run the independent review over the phase diff. The diff is dominated by
   deletions, so give the reviewer the added and modified hunks
   (`git diff --diff-filter=AMR <base> HEAD`) plus the list of deleted paths,
   and ask it to check that nothing still reachable from a route, the build,
   a QA scene, or a surviving test was deleted.
3. Do a browser smoke from the front door through the first battle start, on
   desktop and mobile.
4. Close the epic.

## Exit gate

- Three docs and one skill remain.
- There is no RON, Rust, Firebase, Trox, co-op, editors, or analysis tooling.
- Data lives in typed TS modules.
- The log is local-first.
- The scripts and lint rules are culled.
- Every mason bead filed this phase has landed.
- The metrics are re-measured.
- The review is resolved.
