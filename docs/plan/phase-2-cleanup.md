# Phase 2: Fork Identity and Legacy Removal

**Goal:** turn the prototype into a lean, solo, local-first product codebase.
Player-visible look and flows stay as they are
([D30](decisions.md#d30-ui-preservation)). For every touched screen, capture
before/after screenshots at desktop 1440×900 and mobile 390×844, and compare
them.

**Read first:**

- [decisions D3, D4, D8](decisions.md);
- `docs/journey_prototype/journey_prototype.md`;
- `docs/journey_prototype/authoritative_transitions.md`;
- `src/eventlog/`, `src/coop/hooks.ts`, `src/coop/RoomGate.tsx`;
- `src/App.tsx`, `src/root-router.tsx`;
- `package.json` scripts.

**Order matters.** Delete the tools first: they are independent and shrink the
suite. Then swap the transport. Then sweep for dead code.

## Tasks

### 2.1 Delete the editors and the image viewer

Delete all of these:

- `src/editor/`, including its routes: `/editor`, `/dreamsigns`, the
  avatar/dreamscape/exploration/tutorial editors, and the tag editors;
- `src/image_viewer/` and the `/images` route;
- the npm scripts `editor`, `editor2`, `dreamsigns`, `images`;
- the editor-only save paths in `scripts/game-data-pipeline.mjs edit`, if
  nothing else uses them;
- the editor docs in `docs/journey_prototype/url_parameters.md` and in
  `docs/game_data_authoring.md`.

`tutorial.ron` and the other RON catalogs are edited by hand from now on.

**Acceptance:**

- The build has no editor routes.
- `knip` or a grep finds no references.
- The game-data compile and check still pass.
- The suite is green.

### 2.2 Delete Tabula, Unity Cumulus, and the analysis tooling

Delete all of these:

- `tabula/` and its npm scripts;
- `cumulus/` at the repository root (the Unity projects), with
  `scripts/compare-scene`-style tooling and the `compare-cumulus-scene` and
  `open-cumulus-scene-comparison` scripts. **Keep the TypeScript Cumulus
  design system in `src/cumulus/`**;
- the analysis scripts: `pool-metrics`, `draft-replay-metric`,
  `tides-similarity`, the `experiment-*.mjs` oracles, `first-pick-cache/`,
  and `first_picks.txt`;
- the alternate draft algorithms (`?algo=` other than tides4) and their
  baked data, keeping everything tides4 needs, such as
  `data/tides4-overrides.jsonc` if it is tides4's;
- the skills that only serve deleted subjects: `.llms/skills/tabula`,
  `unity-cumulus`, `cumulus-compare`, `build-ron-editor`, plus any other skill
  whose instructions now point at nothing. Check each skill's description and
  references. **Never edit `dda/`** or the DDA skill.

**Acceptance:**

- tides4 drafts are unchanged. Pin this with an existing or new contract test
  of pool construction on a synthetic catalog.
- `npm run build` and `review:full` pass.
- No dangling references remain.

### 2.3 Local-first log (core-review)

Replace the Firebase RTDB transport with a local persisted log behind the
same append/subscribe/fold seams.

- **`LocalLog`:**
  - an in-memory ordered event list with synchronous append;
  - persisted to IndexedDB, one store per local game ID, written through;
  - a periodic fold checkpoint, so long journeys load quickly;
  - subscription callbacks with the same ordering and decode semantics as
    today.
- **Keep the fold:** `src/rules/reducer.ts`, intents in
  `src/coop/actions.ts`, deterministic randomness from the game seed and
  sequence number, journey save and load files (`LOAD_STATE`), replay
  fixtures, and the invariant checks.
- **Keep deterministic bounces** for invalid intents. A rejected intent leaves
  the state unchanged and logs a stable reason.
- **Game identity:** `?game=<id>` selects a local saved game. The front door
  keeps its look. Its "create game" path creates a local game, and recent local
  games resume from IndexedDB.
- **Delete:**
  - the Firebase RTDB client and its config;
  - `src/firebase/` runtime use;
  - the emulator startup in `scripts/dev-with-emulator.mjs`, so `npm run dev`
    becomes `prepare-workspace` + Vite on the given port;
  - `database.rules.json`, `.firebaserc`, and `firebase.json`'s database
    section;
  - the emulator tests (`test:emulator`);
  - the `firebase-tools` dev dependency, if Hosting deploy no longer needs it
    in-repo. Keep the deploy script only if it still works with
    operator-provided config; otherwise delete it, and note in `docs/` how a
    future deploy is assembled;
  - the JDK requirement in the README.
- **Delete co-op:**
  - presence, `HostedPlaytestShell` controller semantics, and **Take
    Control**;
  - room-generation recovery: replace it with a local "Recover game" that
    rebuilds from the latest valid checkpoint;
  - `FuzzProbe` and `coop-fuzz`;
  - `demo:certify`, with the `coop_*` and `firebase_multiplayer` docs.

  Keep `replay-fuzz` if it replays local logs.
- **Single controller.** Every hosted-playtest and controller check resolves
  to the single local player. That covers the tutorial's room controller
  (`/main`, `/loading`, `/tutorial`) and the collaborative-control handoff.
  The tutorial keeps working unchanged.
- **Keep the journey-log sink.** The browser → `/api/log` → Vite
  `journeyLogPlugin` path writes `logs/journey-log.jsonl`, through
  `createJourneyLogMirror` in `src/coop/journey-log-sink.ts`. Move it out of
  co-op code. Delete only the RTDB room-log parts.
- **Rename** `src/coop/` to a name that describes it, such as `src/session/`.
  Update the `AGENTS.md` architecture section to the local-first statement:
  "Game state is a fold of the local intent log…".

**Acceptance:**

- A new journey, a reload mid-journey, a reload mid-battle, and a save → load
  round trip each reproduce identical folds. Pin this with tests on a fake
  IndexedDB, such as `fake-indexeddb` as a dev dependency or an in-memory
  adapter behind the same interface.
- Browser QA:
  - the front door, a journey start, a battle start, and a reload;
  - before/after screenshots match apart from removed co-op chrome;
  - `__caps` is empty.
- The dev server starts without Java.
- The suite is green.

### 2.4 Identity, docs, and skills

- **Rename the project:** `package.json` name `dreamtides-web`. Rewrite
  `README.md` to the current state: what the game is, prerequisites (Node 24,
  Rust; no JDK), `npm run dev`, layout, and a pointer to `docs/plan/`.
- **Rewrite docs to the current state.**
  - Rewrite `docs/journey_prototype/journey_prototype.md` and
    `url_parameters.md`.
  - Delete docs whose subject is gone: `firebase_multiplayer`,
    `coop_demo_fuzzing`, `coop_event_sourcing_proposal`,
    `react_effect_coop_audit`, `cumulus/unity-3d-ui`, Unity parity docs,
    `superpowers/`, `postmortems/` about deleted systems,
    `cumulus-sweeps/` reports.
  - Keep the design and content docs: `journeys/`, `cards2/`, `calebgannon/`,
    `battle_rules/`, `dda/`.
- **Update skills that mention RTDB, rooms, the emulator, `?ai=1` approval,
  or deleted tools:** `qs`, `journey-battle`, `log-analysis`, `device-screenshots`,
  `send-images`, and others.

**Acceptance:**

- `grep -ri 'firebase\|emulator\|rtdb\|room'` over `docs/` and `.llms/skills/`
  finds only intended current-state mentions, such as optional static
  hosting.
- No relative Markdown link under `docs/`, `.llms/skills/`, `AGENTS.md`, or
  `README.md` points at a missing file or anchor. Check with a small script,
  committed under `scripts/` if it is reusable.

### 2.5 Dead-code and legacy sweep

1. **Enumerate dead code.** Add `knip` as a dev dependency, configured for
   the Vite entries, scripts, and tests. Use it to list unused files, exports,
   and dependencies. Remove them with judgment.
2. **Remove the known legacy:**
   - `STANDARD_ENERGY_RAMP` and its schedule plumbing (F1);
   - prototype-era save migrations (`src/rules/nightmare-migration.ts`,
     `src/rules/shop-purchase-migration.ts`, plus any others). There are no
     legacy saves to load;
   - URL parameters for removed experiments;
   - test-only scaffolding left without users.
3. **Leave the battle sandbox alone.** Phase 4 replaces it while the UI still
   depends on it.
4. **Work through `pre-existing-issues.txt`** with the
   `fix-pre-existing-issues` skill, if it still lists items.
5. **Sweep temporary and testing scaffolding** out of production paths. Grep
   for `TODO`, `HACK`, `FIXME`, `temporary`, `for testing`, `prototype`,
   `playtest`, and debug-only branches. Each hit is either:
   - deleted;
   - made dev-only (P7);
   - converted into a real feature, logged as a pre-existing issue, and filed
     as a bead.

   Re-check the "Retained invariants" in `docs/fake_configurability_audit.md`
   against the surviving code.

**Acceptance:**

- `knip` reports zero unused files outside the allowlist, and every
  allowlist entry has a reason.
- The suite is green.
- The review is resolved where marked.

### 2.6 Mason audit and refactors

1. **Audit.** Run the Hive `mason` skill, read-only, over the surviving
   codebase. Have it file each coherent improvement as a bounded bead with
   label `mason`, with these priorities:
   - type safety and illegal states, especially IDs, journey and site state,
     and fold events;
   - prototype shortcuts that became structure;
   - any remaining name-keyed card logic (always a bug; see AGENTS.md);
   - files over ~1000 lines in `src/screens` and `src/rules`;
   - brittle tests.

   Skip `src/battle/` and `src/rules/battle/` (replaced in Phases 3–4) and
   `src/cumulus/`. Cumulus is preserved UI; only refactors with identical
   rendering qualify there.
2. **Chain the beads.** Put the mason beads into the phase sequence before the
   gate, at most ~10 and ranked by mason. Lower-ranked findings stay open
   beads labeled `mason`, chained after the Phase 7 report as optional
   follow-ups.
3. **Implement the chained beads.** This plan explicitly authorizes it. Each
   one must preserve behavior and rendering (D30), with before/after
   screenshots for any touched screen.

### 2.7 Phase gate

1. Re-measure the Phase 1 metric set. Add a "after Phase 2" column to
   `metrics.md`.
2. Run the independent review over the phase diff.
3. Check that GitHub checks are green.
4. Do a browser smoke of the journey from the front door through the first
   battle start, desktop and mobile.
5. Close the epic.

## Exit gate

- Solo play is local-first, with no Firebase or JDK at runtime.
- The deleted systems are gone, with no dangling references.
- The docs and skills describe the current state.
- The metrics are re-measured.
- The review is resolved.
