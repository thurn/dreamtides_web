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
| `npm run review` | Diff-aware pre-commit check: data validation, lint, typecheck, related tests, and the friction record schema when friction evidence changes |
| `npm run knip` | Unused files, exports, and dependencies |
| `npm run review:gate` | Tollgate's gate stage: a candidate's diff against its parent, with the typecheck, import cycles, lint of the changed files, the friction record schema when friction evidence changes, and the related tests, or the whole suite when more than 40 test files are related |
| `npm run review:full` | Tollgate's release stage: full lint, the typecheck, import cycles, knip, the friction record schema, the whole suite, and the production build |
| `npm run typecheck` | Incremental typecheck |
| `npm run import-cycles` | Fails on a module-load read inside an import cycle |
| `npm run build` | Production build into `dist/` |
| `npm run fuzz:engine -- --games 200` | Seeded rules-engine fuzzer: invariants after every step, replay check, every 10th game replayed interactively through the fold |
| `npm run fuzz:engine -- --games 300 --weight-uuids <entity-uuid,...>` | Target catalog cards, avatars, authored battle Dreamsigns, Dreamwell cards, and figments; report observed inclusion and exercise counts and preserve targets in failure repro commands |
| `npm run prepare-workspace` | Refresh art links and generated adapters |

The engine fuzzer resolves `--weight-uuids` by UUID into branded, kind-specific
identities. Repeated UUIDs are deduplicated. Unknown, malformed, ambiguous,
journey-only, and non-recurring Dreamwell targets fail before games or log writes.
Explicit Dreamsign targets require a non-empty authored battle ability list:
pending, vanilla and authored-empty Dreamsigns fail because they cannot exercise
battle text. Journey effects belong to the journey layer, outside the battle DSL. The full unweighted
emblem pool includes synthetic fixtures and catalog avatars and Dreamsigns;
selection uses the same seeded random policy. Catalog registration contributes
no target coverage.

Target inclusion and the `fuzz targets` summary have these contracts:

| Kind | Setup | `included` | `exercised` |
| --- | --- | --- | --- |
| Card | Reserve one entry per UUID in each otherwise random deck, up to 30 distinct targets | Actual deck entries across both sides | `cardPlayed` events |
| Avatar | Fill the two avatar slots from a deterministic window of requested UUIDs; one target fills both sides | Selected battle-init emblems | Applied triggered-ability resolutions and activations |
| Dreamsign | Add every requested UUID to both sides alongside randomly selected emblems | Selected battle-init emblems | Applied triggered-ability resolutions and activations |
| Dreamwell | In each targeted tier, choose a target window and fill the remaining candidate slots randomly to the catalog's `cardsPerRecurringOrder` limit; other tiers keep their full pool | Actual entries built into the shared Dreamwell deck at battle creation | `dreamwellDrawn` events |
| Figment | Add synthetic first-turn Dreamsign support to the starting side; materialize one of each selected type through ordinary effects, up to the back-rank capacity | Actual figments materialized | The same materialization count |

Emblem inclusion proves the requested identity participates in battle state; its
exercise counter records triggers and activations, without claiming static-ability
coverage or full text coverage. Dreamwell entries can remain undrawn in a short
battle. Figment support uses catalog spark and abilities; capacity or competing
first-turn effects can prevent materialization, which contributes zero coverage.
Requested entities always retain their definitions in the full engine catalog.

Limited target windows rotate by the absolute game ordinal (`--first`), so enough
consecutive games select every requested avatar, Dreamwell card and figment. The
same seed, targets, ordinal and catalog reproduce setup and outcomes. Failure
records retain targets, actual coverage and ordinal; printed repro commands retain
`--first`, targets and interactive replay frequency. Passing games write no logs.

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
| `--port <n>` | Serve on `n` when it belongs to the held browser slot; otherwise use that slot's first free port and report the choice. Default: the first free port from `5174 + 100 × slot` |
| `--prod` | Build into a temporary directory and serve it with `vite preview`; unminified, so `__caps` names real identifiers |
| `--minify` | With `--prod`, keep the production minifier |
| `--cwd <checkout>` | Serve another checkout, such as a detached base worktree outside the repository |
| `--arg key=value` | Passed to the scenario as `qa.args` |
| `--viewports <list>` | Run the scenario once per viewport, `desktop` and/or `mobile` (default: the module's `viewports`, else `desktop`) |
| `--timeout <s>` | Time limit for the whole run, every call included (default 900) |

The scenario runner and card sweep automatically take one of the repository's
**browser slots**, shared by every worktree, so up to `BROWSER_QA_SLOTS`
runs (two; `scripts/qa/browser-qa-capacity.mjs`) use the Playwright MCP
service at once. Each slot is a native kernel lock in the primary checkout:
slot 0 is `artifacts/browser-qa.lock`, and slot `s` of 1 or more is
`artifacts/qa/.browser-qa.slot-<s>.lock`. A waiting command starts its server
and MCP connection only once it holds a slot, which its previous holder
releases after finishing browser and server cleanup.

Each run owns what it starts: its MCP client and the browser context the
service creates for that client alone (`browser.isolated`), its server's
process group, its port, its slot's ownership record, and the evidence its
bead and label name. Its cleanup touches nothing else, so one run's close,
failure, signal, or crash never closes or erases another live run's.

- **Admission.** Waiters are served first come, first served. Each takes a
  ticket, `artifacts/qa/.browser-qa.lock.queue/<sequence>-<pid>`, and
  attempts the slots only while its ticket is the oldest live one, taking
  the first free slot from the highest down; it refreshes the ticket while it
  waits and removes it once it holds a slot or gives up. Waiters reap a
  ticket ahead of them whose process has exited or that has not been
  refreshed for 30 s, so a killed waiter never blocks the queue. The kernel
  locks alone exclude holders: a process that takes a lock without a ticket
  may run ahead of the queue, but never shares a slot.
- **Ports.** Slot `s` owns ports from `5174 + 100 × s` through the next
  99 ports (`QA_PORTS_PER_SLOT`). A run honors `--port` inside its held
  slot's range with a strict port; an occupied requested port fails. A request
  outside the held slot's range selects its first free port and reports the
  choice. Each fresh lease, including a sweep reopening after yielding,
  selects against its current slot, so two slot holders choose distinct
  ports. Once the server answers, every process listening on the port must
  descend from the run's own server, or the run fails rather than use a
  server it did not start.
- **Startup.** Runs serving the same checkout start their servers one at a
  time, under a kernel lock keyed by the checkout
  (`artifacts/qa/.serve-<hash>.lock`), because workspace preparation is not
  safe to run twice at once in one checkout; `wallMs.serveWait` records that
  wait.
- **Evidence.** Each new run allocates
  `artifacts/qa/<bead-id>/invocations/run-<unique>/` and prints this
  `evidenceDir` in its JSON report. The directory holds the server log,
  result, game logs, and captures. Same-bead, same-label runs have separate
  directories, including when a legacy runner writes at the bead root.
  Sweeps allocate `invocations/sweep-<unique>/`, with one `run-*` directory
  per session and an invocation-scoped `summary.json`. Ledger `invocation`,
  `evidenceDir`, and `rawReport` paths identify the exact evidence; stdout
  includes the summary's invocation and absolute evidence directory.
- **Yielding.** The card sweep yields at card boundaries: before each card
  after the first, when the oldest live waiter needs its held slot and has
  no eligible free slot. An empty legacy ticket needs slot 0; a slot-0
  sweep yields to it even while slot 1 is free. A slot-1 sweep keeps running
  while that legacy waiter needs only slot 0. New tickets declare their slot
  capacity. When yielding, the sweep closes its session (browser, server,
  and slot) and opens a fresh one behind the waiters. Its
  summary records `sessions`, `leaseYields`, and `wallMs.browserLeaseWait`,
  `serve`, `scenario`, and `cleanup` summed over its sessions, with
  `execution` as the total less lease wait. A lease wait that costs a bead
  friction is recorded under the canonical tag `browser-lease-wait`
  (`docs/plan/evidence/friction-tags.json` aliases its variants).

SIGINT/SIGTERM cancels waiting or drains startup and cleanup before releasing
the slot. Each slot's ownership record, `<slot lock>.owner.json` (slot 0's is
`artifacts/browser-qa.lock.owner.json`), covers MCP connection and use and
names the run's bead, label, slot, port, and pid. Normal cleanup closes the
browser, drains active RPC calls, then closes the SDK transport while
retaining the slot through owned server cleanup. A signal first aborts
startup and stops the current owned server or builder, then joins that
cleanup sequence. Confirmed browser close and settled provider responses
clear the runner's exact ownership record. An uncertain RPC makes its session
non-runnable; a failed close, uncertain transport rejection, or caller crash
leaves the provider record. Either a provider record or a server record
protects its slot before and after lock acquisition: later runs pass over
retained slots and use another usable slot, and refuse startup when every
slot is retained. A live holder's locked slot remains ordinary contention.
Yield checks use the same usable-slot rules as admission. Reconcile the
recorded provider execution before clearing that record. Kernel release on
pipe EOF proves local lock recovery; provider completion requires separate
confirmation. Before any browser tool, the runner requires a safe stateful
session ID, canonical HTTP(S) endpoint and negotiated protocol identity. It
publishes complete owner images atomically, flushes the staged file and parent
directory, and checks the exact bytes before admitting browser execution.
The initial record is `startup-unconfirmed` until that admission succeeds.
Unsupported identity rejects startup with `metadata-unverified`; failed
identity publication retains `startup-unconfirmed`. Both paths disconnect
only the local SDK transport and issue no browser tool or completion receipt.
The shared identity validator also governs reconciliation. A local clear
failure reports its verification, unlink or directory-flush phase separately
from provider completion. Failed unlink preserves the current evidence;
successful unlink followed by a flush error does not recreate the record.
To reconcile a retained provider record, run
`node scripts/qa/provider-ownership.mjs <exact-slot-lock-path>`. Admitted records
carry the exact MCP transport session ID, endpoint and negotiated protocol.
The runner durably records `mcpExecutionCompleted` after a successful
`browser_close` response and settled, certain RPCs, before SDK transport close.
The command holds that slot's kernel lock and requires that receipt, a dead
runner, an absent server record and a free recorded QA port. It sends read-only `tools/list`
with the recorded session header; only Playwright's exact missing-session
response certifies absence. It rechecks the guards and unchanged record, then
atomically archives its exact bytes beside the record. This reconciles a
transport-close failure or crash following confirmed execution and teardown.
Timed-out calls, uncertain browser close, missing completion receipts, live
sessions, unknown responses and changed records remain protected: session-map
absence alone cannot certify asynchronous provider teardown. Waiters print the
exact reconciliation command once per retained record, with the server first.
Records without supported transport identity report `unverified`; records
without a completed execution receipt remain completion-unconfirmed. These
startup outcomes are not eligible for automated retirement. Unknown provider
execution requires investigation through the bounded incident workflow before
record-removal authority can be established; a free kernel lock or absent
session alone is insufficient evidence.
The [MCP session protocol](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management)
and [Playwright transport](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/tools/utils/mcp/http.ts)
define the absence response. The slots are separate from
`artifacts/heavy.lock`: browser runs (`run-scenario`, `card-sweep`) take a
browser slot only, never the heavy slot, and no command holds the heavy slot
while it waits for a browser slot. `wallMs.browserLeaseWait` records slot
wait separately from build, serve, and scenario execution.

**Orphan server reconciliation.** The runner records its gated server launcher
identity before releasing the launch gate in `<slot lock>.server.json`:
runner and launcher PID, start time and exact command, random command token,
checkout, and port. The launcher owns an isolated process group; QA dev
children remain in that group. EOF before the gate opens starts no server.
To reconcile a dead runner's local server, run:

```sh
node scripts/qa/server-ownership.mjs <exact-slot-lock-path>
```

The command takes that slot's kernel lock, protects every live runner PID,
verifies the launcher's exact identity, and signals only that isolated group.
Shutdown durably records verified group-member identities before signaling
and waits for whole-group settlement. OS process state identifies recorded
same-lifetime zombies, which wait for reaping without another signal; live
process commands still match exactly for signaling. After a verified own
signal, a same-lifetime ambiguous command observation disables every further
signal and permits only bounded observation until the leader is absent and
the group is empty. A bounded observation of known same-lifetime ambiguity
after a verified signal reports `server-observation-unsettled` when it remains
unsettled. A present mismatched identity before signaling, or an unknown or
reused lifetime observed after signaling, reports `identity-mismatch`.
Insufficient or missing pre-signal identity evidence can report `unverified`.
An ordinary verified group that remains unsettled reports `server-unsettled`.
Changed records and unknown or reused lifetimes retain their evidence. Unknown
new members disable further signals and can leave a live server protected
pending reconciliation. Signal and normal-close cleanup share one shutdown
operation. Reconciliation checks descendant identities and whole-group
settlement, preserving malformed, partial, reused, changed, or ambiguous
records for inspection.
An absent launcher with durable member identities can settle those verified
survivors; unknown survivors protect the record. An empty group is settled.
A stopped server clears only its exact server record. The provider's
`.owner.json` remains intact: a dead runner does not certify browser closure,
and provider reconciliation is still required before admitting that slot.

**Single-slot peers.** A runner from an older checkout takes only slot 0,
reads only slot 0's ownership record, and waits in the same ticket queue,
attempting only at its head; the slot protocol with a capacity of one is
exactly that protocol. Together they never exceed the capacity: the older
runner contends with slot 0's holder, and may run beside a holder of
another slot, whose resources its cleanup never touches (it stops only its
own process groups, closes only its own MCP client, and removes only its own
exact record at slot 0's path). Slot holders take slot 0 last, leaving it to
older runners while another slot is free. An older waiter at the head of the
queue waits for slot 0 even while another slot is free, and the waiters
behind it keep their place.

The runner starts its server in its own process group (`scripts/dev.mjs`, or
`vite preview`), connects its own MCP client with the primary checkout as the
first root (`scripts/screenshot-runtime.mjs`), runs the scenario, and stops
that process group on exit or on SIGINT/SIGTERM, then reports whether the
port is free. Log descriptors, temporary production build directories and
local locks are independently cleaned up even when server settlement fails;
the exact unsettled server record remains available for reconciliation. It prints a JSON report (result, log, captures, every document
whose `__caps` was not empty, wall times, host load) and writes it to
`artifacts/qa/<bead-id>/invocations/run-*/<scenario>[-prod].result.json`, beside the server's
log. It exits 1 when the scenario throws or any `__caps` is not empty.

**Game logs.** At each viewport pass's last call, also when the scenario
throws, the runner reads the current game's persisted journey log (the
lines the game menu's JSONL export downloads) and saves it as
`artifacts/qa/<bead-id>/invocations/run-*/<scenario>[-prod]-<viewport>.jsonl` before the
browser closes. When a call fails without a report, one export-only call
follows while the session can still run. The report's `gameLogs` lists each
pass's file, game id, and row count; a pass with no game writes no file,
removes a stale one, and records the `reason` without failing the run.

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
  current viewport and asserts the origin and an empty `__caps`. The default
  navigation wait is DOMContentLoaded; helpers wait for the relevant UI.
  `allowErrors` clears the accepted errors from both observation buffers so
  subsequent helpers check new failures.
  `qa.url`
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
  Dismiss dialogs through their rendered close control and wait for the
  underlying control to become visible before acting; a keyboard Escape
  press does not establish that the dialog closed.
- `qa.capture(name, { fullPage?, clip?, element?, pad?, minOpacity? })`
  writes `artifacts/qa/<bead-id>/<name>.png` at CSS scale: the viewport, the
  full page, a viewport rectangle `clip: { x, y, width, height }`, or the box
  of a rendered `element` target (waited for like `waitVisible`) grown by
  `pad` pixels. A clip is cut to the viewport; the report records it.
  Captures wait until viewport images finish loading, including failed loads;
  offscreen lazy images do not delay the capture.
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
- `qa.read(fn, arg, { timeout? })` observes the page, re-attaching when
  navigation destroys its execution context. It retries only navigation
  context errors within the original deadline; application exceptions propagate.
- `qa.waitFor(label, fn, arg, { timeout?, pollMs?, allowErrors? })` uses
  Playwright's navigation-safe waiter until a page-side predicate returns a
  truthy value. Its timeout also bounds async predicates interrupted by reload.
  The default is 15 s; errors fail the wait unless `allowErrors` is explicit.
- `qa.labAddCard(zone, side, uuid, { timeout? })` drives the engine debug
  panel (`debug=1`) to stage one card into `hand`, `play`, or `void`, for
  `player` or `enemy`. It returns the new instance id after checking the
  committed printing UUID, owner, and zone. Repeated UUIDs create distinct
  instances. It submits once and rejects stale or concurrent battle changes;
  the selected side and zone attributes are checked before submission;
  a timeout after submission requires inspecting state before another call.
- `qa.gameLog` reads the current game's persisted journey log inside the
  page: the URL's `?game=`, else the most recently updated stored game.
  `qa.gameLog.read()` returns `{ gameId, selectedBy, lines, reason }`, the
  stored JSONL lines oldest first, with `gameId: null` and a `reason` when
  there is no game; it never creates the application's database.
  `qa.gameLog.rows()` parses the lines into records, and
  `qa.gameLog.waitFor(label, (rows, log) => value, { timeout?, pollMs? })`
  rereads until the predicate returns a truthy value and returns it. The
  predicate runs in the runner's sandbox, so it may use the scenario's
  variables. Use these rather than opening `dreamtides-local-games` in a
  scenario.
- `qa.caps()`, `qa.assertCaps(label)`, `qa.note(label, data)`,
  `qa.sleep(ms)`, and `qa.page` for anything else.
- `qa.isVisible(target, { minOpacity? })`: whether the target is rendered
  now, without waiting.
- Waits and clicks check `__caps`: application errors, unhandled rejections,
  and calls to `console.error`. Browser resource failures are outside this
  buffer. The init script forwards each error with its document identity;
  host observations retain errors from documents replaced by navigation and
  combine matching buffer entries once, preserving repeated errors;
  `qa.caps()`, battle waits, sweep verdicts, and the final report include them.
  Observers are detached when the call finishes.

The init script preserves one exact published `__cardLab` report in tab-scoped
session storage across a reload of the same persisted `game`, `goto`, `card`,
`variant`, `as`, and `seed` request. Ready and rejected outcomes are preserved
as published; another request or game cannot use the cached report. This is QA
observation metadata: the saved battle and its event log remain authoritative.

**Battles.** `qa.battle` is the one battle driver; a scenario that plays a
battle uses it rather than its own pass loop:

- `qa.battle.state()` reads the battle from the screen's data attributes:
  `phase` and `side` (`[data-battle-phase]`, `[data-battle-side]`; `near` is
  the human's turn) as `at` (`near:day`), the prompt the player owes
  (`prompt`: its `surface`, `id`, `candidates`, and whether it is
  `answerable`), whether the phase button can be pressed (`canPass`:
  rendered, enabled, and uncovered), what a pass answers (`window`: `main`,
  or `respond` for any pass in the far side's turn), the side the screen
  waits on, the result surface, and a `board` signature of every rendered
  card's place.
  With `debug=1` it adds `probe`, from the debug panel's
  `window.__engineProbe`: the engine's decision (`main` or `respond`), its
  pending prompt with candidates, the stack size, whether an intent is in
  flight, the scores, and the event count; then `prompt` and `window`
  follow the engine exactly. The screen marks no candidate of a card
  awaiting a target on the board, so answering those needs `debug=1`.
- `qa.battle.answer()` answers the owed prompt with its first legal choice,
  through the surface that shows it: the Foresee or arrangement confirm,
  the number picker's submit, a choice prompt's first option, or the first
  candidate of the card picker (gallery or board) or of a card's targets,
  then the picker's submit (or Skip). `qa.battle.pass()` presses the phase
  button, a main-phase pass or a pass in a respond window, and reports
  whether the battle moved on. `qa.battle.tap(selector)` clicks the first
  point that hits an element, as on a card in a fanned hand, scrolling it
  into view within its scroll containers first.
- `qa.battle.playUntil(predicate, { timeout?, stallMs?, pollMs?, label?,
  before?, passWhen? })` reads the battle until `predicate(state, run)`
  holds; meanwhile it answers each owed prompt, else passes (when
  `passWhen(state)`, default always), else waits. `before(state, run)` runs
  first and returns true when the scenario acted itself, such as a response
  or a dismissed overlay. `run` counts `turns` (each time the turn changes
  sides), `passes`, `responds` (passes in the far side's turn whose
  `window` is `respond`), and `answers`, with the `history` of `at` values. A run fails
  with a diagnostic (the state, the last action, and the history) on any
  `__caps` entry, a result surface the predicate does not accept, no
  progress within `stallMs` (default 45 s), or `timeout` (default 120 s);
  progress is any change of the phase, prompt, board, or probe, so a press
  the screen ignores is pressed again rather than counted.
- `qa.battle.waitFor(predicate, { timeout?, pollMs?, label? })` waits
  without acting.
- With `debug=1`, battle-load observation starts in the eager battle
  screen and remains available when the lazy debug panel mounts. The probe
  records each engine event an applied intent published as `{ seq, index, kind, instance, event }`: the intent's log
  sequence and the event's index in its batch name and order it, so a
  repeated event (two draws in one batch) stays distinct, and `event` is
  the engine's own unredacted event with its identities (`side`, `source`,
  `controller`, `instance`, `node`). Lab constructor script events are
  genuine engine publications retained under the matching `LOAD_STATE`
  intent's sequence, with contiguous indices across setup steps. These are
  load setup observations, rather than separately committed play actions or
  `engine.action` log sequences. Live batches retain their own intent
  sequences. A reload records events published after it; constructor
  observations belong to the original development load. History belongs to
  the current mounted battle, and the panel clears its probe on unmount.
  The event helpers only read it:
  - `qa.battle.eventCursor()` returns `{ battleId, seq, index }`, the
    position after the last recorded event (`-1`s before the first).
  - `qa.battle.events(cursor, { match?, limit? })` returns `{ events,
    cursor, more }` without waiting: the recorded events after `cursor`
    (`null` for all) whose engine event has `match`'s fields, compared by
    value (`{ kind: "cardDrawn", side: "enemy" }`, or an emblem `source`
    such as `{ kind: "avatar", side: "player" }`), at most `limit`
    (default 100, at most 500). Each carries `cards`, the printing UUID of
    every instance the event names in the committed state as read. The
    returned cursor continues the read without skipping or repeating an
    event; a read with nothing new returns no events and the same cursor.
    For example, `qa.battle.events(cursor, { match: { kind: "laneResolved",
    challenger: source } })` scopes a read to that challenger. Omit options
    for an unfiltered read. Options accept only `match` and `limit`; options
    and `match` must be non-null, non-array objects.
  - `qa.battle.waitForEvents(cursor, match, { count?, limit?, timeout?,
    label? })` waits until `count` (default 1) such events exist, then reads
    them as `events` does, failing on `__caps` or `timeout` (default 15 s).

  Both fail when the probe shows another battle than the cursor's. Take a
  cursor before acting and match each expected event by its identities,
  never by its position in the order.
- `qa.battle.promptOrAutoAnswer({ role, since, timeout?, pollMs?, label? })`
  waits, without acting, for the player's prompt whose purpose has `role`
  (`debug=1`). The engine answers a prompt with a single legal choice
  itself and records `promptAutoAnswered` instead of rendering it, so a
  scenario that plays into a prompt waits for either. It resolves with
  `{ outcome: "rendered", prompt, state, cursor }` once that prompt is
  rendered and answerable, or `{ outcome: "autoAnswered", event, answer,
  cursor }` once the player's `promptAutoAnswered` event with that role is
  recorded after `since`, whichever came first; `cursor` follows the event
  for a chained wait. `answer` is the forced answer while its step is still
  in flight, else `null`. Auto-answers for another role or the enemy are
  ignored. It fails on `__caps`, another battle, or `timeout` (default
  15 s) with a `QaTimeoutError`:

  ```js
  const since = await qa.battle.eventCursor();
  await qa.battle.tap(`[data-battle-card-id="${card}"]`);
  const target = await qa.battle.promptOrAutoAnswer({ role: "target", since });
  if (target.outcome === "rendered") await qa.battle.answer(target.state);
  ```

  A forced single-target choice follows this auto-answer path too. Take the
  event cursor before playing and wait with `promptOrAutoAnswer` instead of
  requiring a target picker to appear.

- `qa.battle.enterFirstBattle({ seed?, query?, atFrontDoor? })` opens a
  fresh game (`/?seed=<seed>&<query>`, seed 1) and walks the front door to
  the first battle: Avatar selection, every Layer 1 site, and Battle Start,
  up to the player's phase button. It uses no development-only parameter,
  so it runs with `--prod`; `query: "debug=1"` adds the probe in a dev run.

Tracked scenarios:

- `smoke` walks a fresh seed-1 game from the front door through Avatar
  selection, every Layer 1 site, and Battle Start
  (`qa.battle.enterFirstBattle`), then plays until the AI has taken one
  turn. It uses no development-only parameter, so phase gates run it with
  `--prod`.
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
- `tutorial-walk` walks a fresh game (`/main?seed=1`, `--arg seed=<n>`)
  through the tutorial on desktop and mobile, beats 01–31 of
  `docs/plan/evidence/measurements/hv-33id.1.md`: the main menu, the loading
  screen's Begin, the scripted stage, the live tutorial battle to Victory, and
  New Journey to the tutorial Avatar offer. It runs three steps per viewport
  (front door and scripted stage, live battle, Avatar offer) and asserts an
  empty `__caps` at every beat. After the player's guided turn `qa.battle`
  presses the phase button until Victory, and the scenario only records and
  clears the guidance the enemy's turn raises, so it reaches Victory
  whichever policy plays the enemy
  (`--arg ai=<policy>` adds `?ai=` to the entry). Its waits use test IDs,
  data attributes, and card UUIDs, never copy.
- `card-lab-play` is the card sweep's per-card run (below).
- `card-lab-stage` opens a lab with `--arg card=<uuid>` and stages
  `--arg stage=hand:player:<uuid>,play:enemy:<uuid>,void:player:<uuid>` through
  the debug UI. It captures desktop and mobile with the error init script.
- `engine-events` declares a card-lab whose player holds a floating draw
  trigger's source (`--arg source=<uuid>`, default Quiet Reflection) and a
  1-cost character (`--arg character=<uuid>`), on desktop and mobile. It
  plays both through the UI and matches the source's `effectStarted`, the
  floating `triggerQueued` and `triggerResolved` by source, controller, and
  node, and the player's `cardDrawn` by side and the deck's top instance
  and its printing UUID; reads twice with no new event; then passes the
  turn and matches the enemy's `cardDrawn` the same way.
- `qa-helper-recovery` (`--arg card=<character uuid>`) verifies the first
  Zone click, all six staging combinations, and a forced reload during a
  pending observation. It checks that the exact report and committed battle
  survive, and that an absent observation times out. `--arg error=1` injects
  a departing-document error and intentionally exits with a failing report.

A dev-server run breaks when its checkout changes under it. Saving a file
outside the module graph, such as `README.md`, reloads the page mid-step.
Anything that runs `scripts/prepare-workspace.mjs` (`npm test`,
`npm run review`, a build, another runner) rewrites the typed token mirror,
and the hot update remounts the app, which restarts the game from the URL the
page loaded with: a `?seed=` entry starts a fresh game on the main menu. Run
and edit nothing on a checkout while a runner serves it.

### Interactive QA

A judged-QA setup can run in one call through the runner, which installs
`__caps` before loading the app and handles server/context cleanup:

```bash
node scripts/qa/run-scenario.mjs card-lab-stage --bead <id> --arg card=<uuid> --arg stage=hand:player:<uuid>,play:enemy:<uuid>,void:player:<uuid>
```

For exact ranks, supporters, both sides' energy and an opponent hand, use
`qa.labStage(stage, { card: uuid, as: "enemy" })`. Staging defaults to the
remaining scenario-call deadline, including navigation and successive load
observations. An explicit `timeout` shares that absolute limit. Direct helper
callers without a configured call budget use the existing 15 s default.
This opens a fresh
`goto=card-lab&labStage=<URL-encoded JSON>` scene in one call. For example:

```js
const ids = await qa.labStage({
  player: { front: [null, frontUuid], back: [null, supporterUuid, supporterUuid], energy: 7 },
  enemy: { back: [subjectUuid, subjectUuid], hand: [spellUuid, spellUuid], energy: 9 },
  enemyScript: [
    { kind: "play", ref: { zone: "hand", index: 1 } },
    { kind: "advance", ref: { zone: "back", index: 1 }, lane: 2 },
    { kind: "challenge" },
  ],
}, { card: subjectUuid, as: "enemy" });
```

`player` and `enemy` accept `front`, `back`, `hand`, `void`, and `energy`.
Supplied zones replace the solver's zones; omitted fields retain its defaults.
Ranks use zero-based slots, with `null` holes, at most nine front and ten back
slots. Hand and void entries, and occupied rank slots, are catalog UUIDs for
base printings. Energy is a non-negative safe integer. Declared boards need
not offer a play of the source card, and preserve the declared human hand and
energy when `as=enemy`. The helper verifies the immutable initial history
board and returns `{ battleId, player, enemy }` with physical IDs by zone,
so duplicate UUIDs remain distinct even if the live AI has already moved.
To exercise an amplified source, retain the solver's hand with
`{ variant: "amplified" }` and play that source through its normal hand control;
declared rank entries stage base printings even with that variant option.

`enemyScript` selects live legal enemy Day actions through the normal intent
driver. References name an **initial enemy physical slot**, retained across
zone changes; a character played from hand can subsequently advance using
that same hand reference. `activate` names an initial physical reference and
its non-negative safe-integer `ability` index, for example
`{ kind: "activate", ref: { zone: "back", index: 0 }, ability: 0 }`; the
ability must be legal in the live state. `advance` is a normal move to front `lane`, and
`challenge` passes the enemy Day into normal designation, Dusk and Challenge
resolution. Prompts and responses use the normal host and human controls.
Successful replayed intents determine progress; pending prompts, cancellation,
errors, response passes, reload and debug undo preserve that contract. An
illegal or stale next action stops the script at its first invalid enemy Day
boundary and hands the battle to its normal policy. The per-game log carries
`debug_card_lab_script_failed`, a stable `action-not-legal` reason, the script
step and history indices, the physical instance and its printing UUID. Replayed
history preserves the stop through reloads and later legality changes; debug
undo before the failure restores the earlier script. Malformed fields, invalid ranks,
unknown cards or missing references reject the whole staged fixture and report
the error; the existing plain-battle fallback receives no staged cards.
Production builds ignore `labStage` and compile its automation out.
The tracked `card-lab-enemy-activate` scenario observes a declared enemy
activation, its prompt answer, physical source and effect, and persisted intent
logs on desktop and mobile; this is a scripted action through the normal host.

The tracked acceptance workflow stages duplicate physical cards, advances and
challenges the selected enemy character, and casts the human's staged spell:

```bash
node scripts/qa/run-scenario.mjs card-lab-stage --bead <id> --arg card=<character-uuid> --arg declared=1
```

For card-specific judgment, put one self-contained scenario in
`artifacts/qa/<id>/judged.mjs` of the primary checkout. Open the lab, call
`qa.labAddCard` for the board setup, exercise the relevant player workflow,
then call `qa.assertCaps` and `qa.capture`. Run it with
`node scripts/qa/run-scenario.mjs judged --bead <id> --viewports desktop,mobile`.
The report preserves load-time and departing-document errors throughout the
pass; a later step uses the same game and buffer through `qa.carry`.

For exploratory QA with the MCP tools directly:

1. **Start and track your server:** `npm run dev -- --port 5174 --strictPort`. It starts a
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
     if (window.__caps !== undefined) return;
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
builds honor `goto`, `card`, `variant`, `as`, `labStage`, `debug`, and `gambleGame`, and
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
| `card=<uuid>` | With an Exploration scene, use that source card's encounter; with `goto=card-lab`, the card to play (a card that targets a stack item answers a synthetic opener the opposing side plays first) |
| `variant=<v>` / `as=<side>` | With `goto=card-lab`: the variant (default `base`) and the active side (`player` or `enemy`, default `player`) |
| `labStage=<JSON>` | With `goto=card-lab`, exact declared zones, rank slots, both energies and optional live enemy actions; URL-encode the JSON |
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
  and offering cost), `take-two-from-among` (Erode, then an optional exact
  two-card choice among the eroded cards), `void-cost` (the gallery card
  picker), `reclaim`
  (Reclaim from the void, Avatar and Dreamsign abilities from the status
  display), `capacity` (a full back rank), `ai-discard` (the human discards
  during the AI's turn), `ai-foresee` (the AI's private prompt), `respond` (a
  response window), `prevent` (pay or decline), `pay-to-end` (pay to end an
  effect from the battle UI), `loop` (the loop shortcut),
  and the presentation fixtures `present-zones`, `present-status`,
  `present-challenge`, `present-costs`, `present-ending`,
  `present-opponent`, and `card-statuses` (reclaimed, ephemeral, and created
  cards), which publish every engine event kind as a judged pass
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
  its transfigured text shows. Without `labStage`, `as=enemy` opens on the AI's
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

Run `npm run lab:preflight -- --cards <uuid,...> [--variants all|<v>,...] [--as player|enemy|both]` first for Node-only fixture and resolution checks; the browser sweep provides acceptance.

Dreamwell UUIDs use the same `--cards` flag and
`?goto=card-lab&card=<uuid>&variant=base&as=player|enemy` URL. Their lab parks
on the preceding side's Night with that UUID as the next shared draw. A normal
pass enters the requested side's turn, applies its catalog energy, and publishes
`dreamwellDrawn`; the persisted `engine.dreamwell` log records UUID, side and
energy. The complete Dreamwell catalog remains available for recurring cycles.
Dreamwell cards accept the base variant and report other variants as ineligible.
Optional `labStage` JSON supplies initial hands before the first pass, for example
`{"player":{"hand":["<card-uuid>"]},"enemy":{"hand":[]}}`. Only `player`,
`enemy`, and their `hand` lists are accepted; omitted hands are empty. The URL and card-lab report record the declaration; the persisted initial battle
and history retain its physical cards. The preflight and browser sweep check the actual
draw and settled prompts/stack, and classify a successful pending definition as
`pending`. Ordinary card UUIDs use their played-instance and resolution checks.

```bash
node scripts/qa/card-sweep.mjs --bead <id> --cards <uuid,...|starter> \
  [--variants all|<v>,...] [--as player|enemy|both] [--timeout <s>] [--port <n>] [--capture]
```

Avatar emblems use `?goto=card-lab&avatar=<uuid>&as=player|enemy` and the
base variant. The requested side starts a normal battle with that exact
emblem; the other side has no emblem. First-turn triggers and choices use
the normal fold and persist with the battle. The selected portrait and
ability presentation follow the same UUID. Explicit avatar requests reject
unknown or cross-domain UUIDs, simultaneous `card` and `avatar` parameters,
and `labStage` declarations. Other recognized variants are ineligible.

Both the sweep and `npm run lab:preflight --` accept `--avatars <uuid,...>`
in place of `--cards`. Avatar results prove initialization and settled
first-turn progression; `exercised` separately reports observed source-scoped
ability resolution. A pending definition reports `pending`, including when
initialization succeeds. Content-specific trigger and activation workflows
remain part of each avatar's authored QA.

The sweep (workflow § Card QA) opens a runner session (its own dev server
and MCP client, reopened at a card boundary where it yields its browser slot;
see [Browser QA](#browser-qa)) and, for each card, side, and variant, runs
`scripts/qa/scenarios/card-lab-play.mjs` in the card-lab with `debug=1`: it
plays the card through the UI, and `qa.battle` answers each human prompt
with its first legal choice and passes until the stack is empty. A run
fails on `__caps`
errors, a rejected lab, a human decision with no visible enabled control,
the card outside its expected zone (a character in play, an event in a void
or the Banished zone), no `resolved` engine event for it, no visible board
change, or no settled board within `--timeout` seconds (default 60) or the
driver's stall limit. A cell whose structured failures are all deadline
timeouts, with an empty report error buffer and a runnable session, gets
one fresh retry. Semantic failures, mixed failures, stalls, and transport
exceptions each retain a failing effective verdict. A card whose text is pending is recorded `pending`
rather than `pass`, and a variant the card cannot take is recorded `skip`
without a run. Verdicts append to `docs/plan/evidence/qa-ledger/<id>.jsonl`;
`--capture` writes each settled board to `artifacts/qa/<id>/`. It exits 1
when any effective cell verdict is `fail`. Ledger attempts carry
`attempt`, `effective`, `failureKinds`, and `rawReport`; both the timeout
failure and its retry are retained. Each invocation owns a unique artifact
subdirectory, with separate reports and captures per attempt. Summaries show
effective cell counts and raw attempt counts separately, plus total wall
time, browser slot wait, and execution excluding that wait.

Navigation observations are retained as `qa.navigation` entries in the raw
report log and copied into each sweep ledger attempt's `navigation` field.
They identify the requested URL, observed URL and document IDs when readable,
cell UUID/variant/controller, ordered main-frame requests and page lifecycle
observations, overlapping helper operations, deadlines, and the actual failed
phase. Event storage is bounded with explicit overflow counts. Helper
operation phases carry `scope: "operation"` and their `initiatingOperation`.
Page lifecycle events carry `scope: "page"` and `initiatingOperation: null`:
they are shared observations retained in every active diagnostic, and URL
equality does not establish which operation initiated a request. Terminal
outcome and diagnostic listener cleanup remain separate. Missing observations
and failed observer cleanup retain uncertainty. These diagnostics preserve
original errors, Caps, verdicts and the timeout-only retry policy. A manual
fresh-session diagnostic pairs the exact affected cell with a healthy control;
its result is additional evidence, and the original attempt remains retained.

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
