# Dreamtides

Dreamtides is a roguelike deckbuilder that runs in the browser. The player
picks an Avatar, travels a branching map of dreamscapes, drafts and refines a
deck at sites, and fights seven card battles, the last against Apollyon.

- [docs/design.md](docs/design.md): the game and journey design.
- [docs/rules.md](docs/rules.md): the battle rules.
- [AGENTS.md](AGENTS.md): invariants and the working agreement for agents.

## Prerequisites

- Node 24 and npm.
- Optional card art: the TV image cache at
  `~/Library/Caches/io.github.dreamtides.tv/image_cache/`, and Avatar and
  Dreamsign portraits under `~/Documents/synty/avatars/` and
  `~/Documents/dreamsigns/filtered/`. Missing art produces setup warnings and
  broken images, but the game still runs.

## Running

```bash
npm install
npm run dev                  # workspace prep + Vite on :5173
npm run dev -- --port 5174   # any other port
```

Open the `Local` URL Vite prints. Games are local: each one is an event log
stored in the browser's IndexedDB, and `?game=<id>` in the URL selects it. The
front door (`/` or `/main` with no `?game=`) resumes this browser's most
recently played game, or creates a new one and opens Avatar selection when
there is none. Any other entry URL, or one carrying a game-shaping parameter
such as `?seed=` or `?goto=`, starts a new game.

`npm run build` writes a static site to `dist/` and needs no env file. Card
art is served from `public/` unless the build sets `VITE_ASSET_BASE_URL` to
the origin that hosts it (see `.env.example`).

| Command | Purpose |
| --- | --- |
| `npm test -- <path>` | Focused Vitest file |
| `npm run review` | Diff-aware pre-commit check: data validation, lint, typecheck, related tests |
| `npm run review:full` | Everything the Tollgate gate runs |
| `npm run typecheck` | Incremental typecheck |
| `npm run import-cycles` | Fails on a module-load read inside an import cycle |
| `npm run build` | Production build into `dist/` |
| `npm run fuzz:engine -- --games 200` | Seeded rules-engine fuzzer: invariants after every step, replay check, every 10th game replayed interactively through the fold |
| `npm run prepare-workspace` | Refresh art links and generated adapters |

`npm run review` plans its checks from the diff against `master`. Lint covers
`src/` and `scripts/`. The typecheck runs two projects side by side:
`tsconfig.json` for `src/`, and `tsconfig.node.json` for the Vite and Vitest
configs and `scripts/`, whose JavaScript modules it checks through their JSDoc
types. The `src/` typecheck emits declarations only, so an edit that keeps a
module's API rechecks only that module, and a fresh worktree seeds its build
information from `.git/journey-review/`. `review:full` never uses that shared copy.

Beside the typecheck, `npm run import-cycles` (`scripts/import-cycles.mjs`)
guards the production bundle's module evaluation order. A cycle whose modules
reference each other only inside function bodies is allowed. A module that
reads a cycle partner's binding while it loads fails the check, because the
bundle may evaluate that partner later and throw "Cannot access … before
initialization" at page load, which the dev server hides. Registries that
share a cycle with their entries, such as the effect primitives and the step
kinds, therefore read each entry through a getter.

## Browser QA

QA runs through the globally configured Playwright MCP service
(`http://localhost:8931/mcp`; `playwright-mcp-service start` if it is down)
against your own Vite server on port **5174 or higher**. Port 5173 belongs to
the developer. Never launch browsers directly.

### Scenario runner

Scripted QA runs as a scenario through the runner, which owns the server, the
MCP client, the error buffer, and the captures:

```bash
node scripts/qa/run-scenario.mjs smoke --bead <bead-id>          # dev server
node scripts/qa/run-scenario.mjs smoke --bead <bead-id> --prod   # vite build + vite preview
```

| Option | Effect |
| --- | --- |
| `--bead <id>` | Required. Captures and the report go to `artifacts/qa/<id>/` of the primary checkout |
| `--port <n>` | Serve on `n` (5174 or higher); default: the first free port from 5174 |
| `--prod` | Build into a temporary directory and serve it with `vite preview`; unminified, so `__caps` names real identifiers |
| `--minify` | With `--prod`, keep the production minifier |
| `--cwd <checkout>` | Serve another checkout, such as a detached base worktree outside the repository |
| `--arg key=value` | Passed to the scenario as `qa.args` |
| `--viewports <list>` | Run the scenario once per viewport, `desktop` and/or `mobile` (default: the module's `viewports`, else `desktop`) |
| `--timeout <s>` | Time limit for the whole run, every call included (default 900) |

The runner starts its server in its own process group (`scripts/dev.mjs`, or
`vite preview`), connects its own MCP client with the primary checkout as the
first root (`scripts/screenshot-runtime.mjs`), runs the scenario, and stops
that process group on exit or on SIGINT/SIGTERM, then reports whether the
port is free. It prints a JSON report (result, log, captures, every document
whose `__caps` was not empty, wall times, host load) and writes it to
`artifacts/qa/<bead-id>/<scenario>[-prod].result.json`, beside the server's
log. It exits 1 when the scenario throws or any `__caps` is not empty.

`<scenario>` is a module path, a tracked scenario
(`scripts/qa/scenarios/<name>.mjs`), or a bead-local one
(`artifacts/qa/<bead-id>/<name>.mjs`). Its default export is one
self-contained function, `async (qa) => result`, or an array of them (the
steps). The runner sends each one's source, after the helper prelude
(`scripts/qa/prelude.mjs`), to the MCP's `browser_run_code_unsafe`, so it
runs in the MCP server with a Playwright page and may not read its module's
other bindings or imports. The sandbox has no `URL`, `setTimeout`, or
`require`.

**Steps and viewports.** One MCP call's response is lost when the call
outlasts about 300 s (likely Node fetch's body timeout in the MCP client), so
a longer walk is split:

- Each step runs in its own call on the same page, which keeps its document,
  game, and `__caps` buffer. A step reads what the previous step returned as
  `qa.carry` (`null` at the first step), and the last step's return is the
  result. The same function may serve several steps, branching on `qa.step`.
- `export const viewports = ["desktop", "mobile"]` (or `--viewports`) runs
  every step once per viewport, `qa.viewportName` and `qa.viewport` set for
  the pass; `qa.open` defaults to that viewport. With more than one viewport
  the result is keyed by viewport.
- The report lists each call's wall time in `calls`, and log lines carry
  `at: "<viewport>#<step>"` when there was more than one call. The runner
  warns about a call past 240 s, and stops waiting for one 15 s past the
  300 s limit, reporting the lost response instead of waiting out
  `--timeout`. The run stops at the first error.

The helpers:

- `qa.open(route, viewport?)`: sizes the viewport (`qa.viewport` by default;
  `qa.viewports.desktop` is 1440×900 and `qa.viewports.mobile` 390×844),
  loads the route with `qa.goto`, and also asserts the viewport. `__caps` is
  installed by `page.addInitScript`, so it records load-time errors too.
- `qa.goto(route, { allowErrors?, waitUntil? })`: loads a route at the
  current viewport and asserts the origin and an empty `__caps`. `qa.url`
  resolves its route on the runner's server: `/path?query`, `path`, and
  `?query` are relative (the sandbox's `page.goto` rejects them), and an
  absolute URL such as `page.url()` reloads that page. The buffer of the
  document it leaves goes into the report.
- `qa.click(target, { position?, minOpacity?, rest?, timeout? })`: waits
  until the target is rendered and `elementFromPoint` at its centre (or
  `position` in its box) is the target or inside it, clicks there with the
  pointer, then rests the pointer outside the viewport so no hover preview
  stays. A click on a covered target fails naming the covering element.
  Floating or animating targets need no stability wait.
- `qa.waitVisible(target, { minOpacity?, timeout? })`: waits until an element
  is in the viewport with an effective opacity (the product over its
  ancestors) of at least 0.95, so text that is in the DOM before it fades in
  does not count.
- A `target` is a CSS selector or `{ text: "<regex source>" }`, the deepest
  elements whose text matches.
- `qa.capture(name, { fullPage?, clip?, element?, pad?, minOpacity? })`
  writes `artifacts/qa/<bead-id>/<name>.png` at CSS scale: the viewport, the
  full page, a viewport rectangle `clip: { x, y, width, height }`, or the box
  of a rendered `element` target (waited for like `waitVisible`) grown by
  `pad` pixels. A clip is cut to the viewport; the report records it.
  `qa.captureDir` is that directory's absolute path, for any other file.
- `qa.trace(name, fn, { longTaskMs?, top? })` records a Chrome trace (CDP
  `Tracing`, with the V8 sampling profiler) around `fn`, between
  `performance.mark`s `qa-trace:<name>:start` and `:end`. It summarizes the
  renderer main thread's tasks that start between the marks: each long task
  (default 50 ms) with its start on the page's `performance.now()` clock (so
  it lines up with a `PerformanceObserver` or a log line's time), its self
  time by trace event (`FunctionCall`, `Layout`, `UpdateLayoutTree`,
  `EventDispatch <type>`, …), and its sampled JavaScript self time by
  function and source line, `top` (default 8) of each. It returns the
  summary with `fn`'s return as `value`, and the report collects every
  summary in `traces`. Tracing slows the page, so time a cost with and
  without it before quoting an absolute number.
- `qa.caps()`, `qa.assertCaps(label)`, `qa.note(label, data)`,
  `qa.sleep(ms)`, and `qa.page` for anything else.
- Waits and clicks fail at once when `__caps` records an error or rejection.

Tracked scenarios:

- `smoke` walks a fresh seed-1 game from the front door through Avatar
  selection, every Layer 1 site, and Battle Start, then passes until the AI
  has taken one turn. It uses no development-only parameter, so phase gates
  run it with `--prod`.
- `battle-result` (`--arg outcome=victory|defeat`) opens
  `?goto=battle-playable&debug=1`, raises the winner's score to the battle's
  `scoreToWin` through the engine debug panel at the human's decision,
  asserts the result surface, reloads the game and asserts it again, and
  captures the viewport and the surface's content.
- `ai-reveal` opens `?goto=prompt-lab-present-opponent`, where the AI holds
  the Day, and waits for its play reveal (`[data-battle-play-reveal]`),
  passing the human's turns if the AI plays nothing, so whichever policy
  answers the AI host reaches it. It captures the viewport and the revealed
  card and asserts the card travels on. `--arg trace=1` traces the wait.
- `card-lab-play` is the card sweep's per-card run (below).

### Interactive QA

For exploratory QA with the MCP tools directly:

1. **Start and track your server:** `npm run dev -- --port 5174`. It starts a
   process tree (npm, the dev wrapper, and Vite). Stop exactly
   that tree when done, never `pkill -f vite`, and confirm the port is free:
   `lsof -iTCP:5174 -sTCP:LISTEN -n -P`.
2. **Assert before acting.** Before every measurement or screenshot, evaluate
   `() => ({ href: location.href, width: innerWidth, height: innerHeight })`
   and confirm the port and viewport. Set the viewport with `browser_resize`.
3. **Capture errors.** Right after each full navigation, install the buffer.
   It misses errors thrown while the page loads; the runner's init script
   does not.

   ```js
   () => {
     window.__caps = { errors: [], rejections: [], consoleErrors: [] };
     addEventListener('error', e => window.__caps.errors.push(String(e.message)));
     addEventListener('unhandledrejection', e =>
       window.__caps.rejections.push(String(e.reason?.stack || e.reason)));
     const original = console.error;
     console.error = (...args) => {
       window.__caps.consoleErrors.push(args.map(String).join(' | '));
       original.apply(console, args);
     };
     return 'hooks installed';
   }
   ```

   After each meaningful action, `() => window.__caps` must have three empty
   arrays.
4. **Prefer structure over pixels.** Use accessibility snapshots, roles, test
   IDs, and `browser_evaluate` geometry for objective checks; use screenshots
   for appearance. Default budget per changed surface: one desktop capture
   (1440×900), one mobile capture (390×844), one changed interaction state.
   Captures go to the gitignored `artifacts/qa/<bead-id>/` of the primary
   checkout, outside every worktree, so they outlive the worktree. The MCP
   accepts a `filename` only inside its client's first root (the primary
   checkout) and does not create directories, so run
   `mkdir -p /Users/dthurn/dreamtides_web/artifacts/qa/<bead-id>` once and
   pass the absolute path to `browser_take_screenshot`:
   `filename: /Users/dthurn/dreamtides_web/artifacts/qa/<bead-id>/<name>.png`.
   Check each with `file <path>`. Captures are never committed.
5. **Close** your browser context with `browser_close` when done.

### URL parameters

Read once at page load (`src/runtime/runtime-config.ts`). Only development
builds honor `goto`, `card`, `variant`, `as`, `debug`, and `gambleGame`, and
only they show the journey menu's developer commands. A production build
compiles the QA scenes, the labs, and the debug panel out (P7):
`vite.config.ts` fails a production build whose chunks render any of them,
and `npm run review:full` runs that build.

| Parameter | Effect |
| --- | --- |
| `goto=<scene>` | Boot a fresh game straight onto a screen (below) |
| `seed=<n>` | Fixed seed (non-negative integer) for the game the URL creates and its battles |
| `ai=random` / `ai=greedy` | The policy the AI host runs for the enemy of the engine battle (default `greedy`) |
| `game=<id>` | Open that local game from IndexedDB |
| `gambleGame=<id>` | Force a Gamble game: `three-gate`, `ladder-climb`, `starway-stairs`, `four-suit-reprise`, `blackjack` |
| `card=<uuid>` | With an Exploration scene, use that source card's encounter; with `goto=card-lab`, the card to play |
| `variant=<v>` / `as=<side>` | With `goto=card-lab`: the variant (default `base`) and the side playing it (`player` or `enemy`, default `player`) |
| `debug=1` | Show the engine battle screen's debug panel |
| `tutorialSpeed=<x>` | Tutorial playback speed multiplier |
| `deviceFrame=<json>` | Inject device safe-area and cutout metrics |

### QA scenes (`?goto=`)

Scenes build a valid journey state from live content with the real
generators and park the run on a screen (`src/runtime/qa-scenes.ts`). They
only bootstrap a brand-new game; reloading a `?game=` URL resumes it. A scene
is built from the game seed, so `?goto=<scene>&seed=<n>` builds the same
scene on every load.

- **Journey start:** `avatar-select`, `tutorial-avatar-select`.
- **Atlas:** `atlas` (same as `atlas2`), `atlas2` … `atlas7` (the frontier on
  layer N), `tutorial-atlas`, `random-site-atlas`.
- **Battle:** `battle` (same as `battle1`), `battle1` … `battle7` (Battle
  Start preview with layer-tuned opponents), `battle-playable`,
  `tutorial-battle1`, `tutorial-battle2`, `tutorial-battle`,
  `tutorial-victory`.
- **Dreamscape and overlays:** `dreamscape`, `dreamscape-with-essence`,
  `reward`, `reward-at-cap`, `deckviewer`, `poolviewer`, `startingdeck`.
- **Sites** (append `-enhanced` for the home version where listed):
  `draft`, `shop`/`-enhanced`, `dreamsignbazaar`/`-enhanced`,
  `dreamsign-revelation`/`-enhanced`, `transfiguration`/`-enhanced`,
  `duplication`/`-enhanced`, `purge`/`-enhanced`, `augury`/`-enhanced`,
  `gamble`/`-enhanced`, `exploration`/`-enhanced`, `exploration-duplicates`,
  `exploration-purchases`, `random-site`, `random-site-home`.
- **End screens:** `journeycomplete`, `journeyfailed`.
- **Prompt lab** (`prompt-lab-<fixture>`): the playable battle with its engine
  battle replaced by a synthetic one (`src/engine/testing/prompt-lab.ts`) that
  stops at a prompt, response window, or decision of the battle screen's
  prompt host. Development builds add the lab's synthetic cards to the journey
  engine and the AI worker's catalog (`src/engine/development.ts`). Fixtures:
  `targets` (board targets with Cancel; up to two targets on the card picker),
  `auto-target` (an automatic answer and its notice), `choices` (a mode, a
  you-may, and an X cost), `up-to-one-target` (one optional target, or Skip),
  `arrange` (a cancellable arrangement among the top, the bottom, and the
  hand), `foresee`, `draw-discard` (present, then ask), `offering` (play route
  and offering cost), `void-cost` (the gallery card picker), `reclaim`
  (Reclaim from the void, Avatar and Dreamsign abilities from the status
  display), `capacity` (a full back rank), `ai-discard` (the human discards
  during the AI's turn), `ai-foresee` (the AI's private prompt), `respond` (a
  response window), `prevent` (pay or decline), `loop` (the loop shortcut),
  and the presentation fixtures `present-zones`, `present-status`,
  `present-challenge`, `present-costs`, `present-ending`, and
  `present-opponent`, which publish every engine event kind as a judged pass
  takes their `presents` steps through the UI. Add a fixture to
  `PROMPT_LAB_FIXTURES`.
- **Card-lab** (`goto=card-lab&card=<uuid>&variant=<v>&as=<player|enemy>`):
  the playable battle with one catalog card on a deterministic lab board
  (`src/engine/testing/card-lab.ts`). The setup solver
  (`src/engine/testing/lab-solver.ts`) gives the side playing the card ample
  energy and a character for each play-time target, on the side it selects;
  `src/engine/testing/lab-overrides.ts` adjusts the board per card UUID when
  the solver cannot make the card playable. `variant` is `base`,
  `amplified`, `empowered`, `kindled`, `resonant`, `inspired`, `enduring`,
  `hastened`, `attuned`, or `perfected`; the deck carries the variant, so
  its transfigured text shows. With `as=enemy` the battle opens on the AI's
  play of the card, on the stack, with the human holding a no-effect
  Interrupt so the response window shows it; the AI host answers its prompts.
  A request the content cannot serve (an unknown UUID, an unknown or
  ineligible variant, an unplayable board) loads the plain playable battle
  and reports why: a console error, a `debug_card_lab_rejected` log line,
  and `window.__cardLab`, which also lists the card's eligible variants.
- **Engine debug panel** (`debug=1` on any engine battle): engine debug
  actions (D4, `src/engine/debug/debug-actions.ts`) written to the log as
  `BATTLE_DEBUG` intents, so a reload replays them: add a card by UUID to a
  hand, deck top, void, Banished zone, or back rank; set a side's energy or
  score (reaching the score to win ends the battle); force a deck card to the
  top; reveal every hand and deck; and undo to an earlier intent. Each
  action applies only at a decision boundary and keeps the engine
  invariants, or bounces. Undo replays the battle's history (the lab board,
  or the state before the first debug action of a journey battle; Start
  History begins one) through the engine, so it never reaches across a
  battle. The panel publishes `window.__engineProbe` for the card sweep.

To add a scene, register it in `QA_SCENES`; site scenes use the `siteScene`
helper.

### Card sweep

```bash
node scripts/qa/card-sweep.mjs --bead <id> --cards <uuid,...|starter> \
  [--variants all|<v>,...] [--as player|enemy|both] [--timeout <s>] [--port <n>] [--capture]
```

The sweep (workflow § Card QA) opens one runner session (its own dev server
and MCP client) and, for each card, side, and variant, runs
`scripts/qa/scenarios/card-lab-play.mjs` in the card-lab with `debug=1`: it
plays the card through the UI, answers each human prompt with its first
legal choice, and passes until the stack is empty. A run fails on `__caps`
errors, a rejected lab, a human decision with no visible enabled control,
the card outside its expected zone (a character in play, an event in a void
or the Banished zone), no `resolved` engine event for it, no visible board
change, or no settled board within `--timeout` seconds (default 60); the
sweep then goes on. A card whose text is pending is recorded `pending`
rather than `pass`, and a variant the card cannot take is recorded `skip`
without a run. Verdicts append to `docs/plan/evidence/qa-ledger/<id>.jsonl`;
`--capture` writes each settled board to `artifacts/qa/<id>/`. It exits 1
when any verdict is `fail`.

## Architecture

- **Event log and fold.** Game state is a fold of an event log. The client
  writes intent events only (`src/session/actions.ts`); a pure reducer
  (`src/rules/`) applies them, with time and randomness supplied by the event
  context, so a reload replays to the same state. Each game's log is a
  `LocalLog` (`src/eventlog/local-log.ts`) persisted in IndexedDB; the game
  session (`src/session/`) opens, resumes, and creates games and holds a
  per-game lock so one tab writes a game at a time.
- **Journey rules.** `src/rules/journey/` holds the site, deck, shop, gamble,
  and lifecycle reducers. Generators live beside their domains: `src/atlas/`,
  `src/draft/` (tides4), `src/exploration/`, `src/journey_v2/` (Augury),
  `src/reward-selection/`, `src/shop/`, `src/transfiguration/`.
- **Rules engine.** `src/engine/` is a headless, deterministic battle engine
  (`docs/plan/engine-design.md`). Its state is plain JSON; a step runs rules
  code from one committed state to the next, and `createEngine(catalog)`
  exposes `createBattle`, `decision`, `legalActions`, `apply`, and `view`.
  Step kinds (`steps/kinds/`) and engine events (`events/kinds/`) are each
  registered from their own module. Rules code asks for player input with a
  synchronous `ctx.choose(prompt)`. Inline runs (AI, fuzzer, tests) answer
  at once; interactive play suspends the step and replays it from its start
  with the recorded answers (`fold/slice.ts`), and a prompt fingerprint
  check turns any nondeterminism into a loud `ReplayDivergence`. Abilities
  are typed DSL data beside each entity's printed text in `src/content/`
  (`abilities` plus a `verifiedText` hash, or `pending`/`vanilla`); each DSL
  primitive lives in its own module under `effects/primitives/`, and the
  content gates (`src/engine/content-gates.test.ts`) keep data and engine in
  agreement. The `dreamtides/engine-purity` lint rule
  bans the clock, ambient randomness, and module-level mutable state there.
- **Battle.** A journey battle is an engine battle in the fold
  (`src/rules/battle/engine-battle.ts`). Its screen
  (`src/battle/components/EngineBattleScreen.tsx`) renders
  `engine.view(display, player)` through the Cumulus battle screen, takes
  highlights, drop targets, and controls from `legalActions`, and writes the
  player's `BATTLE_ACTION`, `BATTLE_ANSWER`, and `BATTLE_CANCEL` intents; the
  view model is `src/screens/cumulus_adapters/engine-battle-view-model.ts`
  and its prompt mapping `engine-battle-prompt-view-model.ts`. The enemy is
  the AI host in a Web Worker (`src/battle/engine-ai/`). The standalone
  tutorial battle (fold mode `tutorial`) plays a sandbox board with its own
  scripted automation and planner in `src/battle/` and `src/rules/battle/`;
  each module only it uses starts with a `// tutorial-only until Phase 6`
  header.
- **UI.** Screens are built from the Cumulus design system (`src/cumulus/`):
  a view-model builder and adapter in `src/screens/cumulus_adapters/` turn
  journey state into a screen's props, and `src/components/` routes screens
  and hosts journey chrome.
- **Logging.** `src/logging.ts` writes structured events. Every build stores
  each game's journey log in IndexedDB beside its event log, and the game menu
  and the error fallback export it as JSONL; development builds also mirror
  events to `logs/journey-log.jsonl`.

## Data layout

- `src/content/`: the typed content catalogs, which `tsc` validates. Cards,
  Avatars, Dreamsigns, Dreamwell cards, and figments are one module per entity
  under `src/content/<kind>/`, named `<slug>-<uuid8>.ts`, with an explicit
  `index.ts`. Tunables and journey catalogs (battle, opponents, AI, atlas,
  dreamscapes, guides, sites, economy, shop, tides, exploration, gamble,
  augury, transfiguration, tutorial, glossary, resonance, and more) are one
  module each. `src/content/documents.ts` assembles them into the documents
  the runtime loaders validate.
- Art is symlinked into `public/` from the local caches by
  `scripts/setup-assets.ts` (`npm run setup-assets`).
- Test fixtures are synthetic and live in `src/testing/`.

## Conventions

- Identify content by UUID, never by name.
- Tunables live in the catalogs, not as literals in logic.
- Player-facing copy lives in UI modules.
- Tests pin observable contracts with synthetic fixtures; they never assert
  UI copy, timing, statistics, or production data.
- Never commit images or generated outputs.
- Documentation describes the current system.
