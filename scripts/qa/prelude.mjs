// The helper prelude of `scripts/qa/run-scenario.mjs`. The runner sends the
// source of `createQa` and `createBattleDriver`, with the scenario's, to the
// Playwright MCP's `browser_run_code_unsafe`, so they run inside the MCP
// server process with a Playwright `page`. They therefore read nothing else
// from this module's scope, and the MCP's code sandbox has no `URL` global.

/**
 * The error buffer the init script installs on every document.
 *
 * @typedef {{ errors: string[], rejections: string[], consoleErrors: string[] }} Caps
 */

/** @typedef {{ width: number, height: number }} Viewport */

/** URL-boundary UUID strings; the application validates and brands them before staging.
 * @typedef {{ front?: (string | null)[], back?: (string | null)[], hand?: string[], void?: string[], energy?: number }} LabStageSide
 * @typedef {{ zone: "front" | "back" | "hand" | "void", index: number }} LabStageRef
 * @typedef {{ player?: LabStageSide, enemy?: LabStageSide, enemyScript?: ({ kind: "play", ref: LabStageRef } | { kind: "advance", ref: LabStageRef, lane: number } | { kind: "activate", ref: LabStageRef, ability: number } | { kind: "challenge" })[] }} LabStageInput
 * @typedef {{ front: (import("../../src/engine/state/ids").InstanceId | null)[], back: (import("../../src/engine/state/ids").InstanceId | null)[], hand: import("../../src/engine/state/ids").InstanceId[], void: import("../../src/engine/state/ids").InstanceId[] }} LabPhysicalSide
 */

/**
 * A CSS selector, or `text`: a regular expression source matched against the
 * whitespace-normalized text of the deepest elements that contain it.
 *
 * @typedef {{ selector?: string, text?: string }} Target
 */

/**
 * Where a click on a target would land: `covered` describes the element
 * `elementFromPoint` finds there when it is not the target or inside it.
 *
 * @typedef {{ x: number, y: number, covered: string | null }} HitPoint
 */

/**
 * Page-side helpers the init script installs as `window.__qa`.
 *
 * @typedef {object} QaDom
 * @property {(target: Target, minOpacity: number) => Element | null} rendered
 *   The first element of `target` with a box inside the viewport, no hidden or
 *   undisplayed ancestor, and an effective opacity (the product over its
 *   ancestors) of at least `minOpacity`.
 * @property {(target: Target, minOpacity: number, offset?: { x?: number, y?: number }) => HitPoint | null} hitPoint
 */

/** @typedef {Window & { __caps?: Caps, __qa?: QaDom, __qaDocumentId?: string }} QaWindow */

/**
 * The part of Playwright's `Page` the prelude and scenarios use. `locator`
 * exposes text entry; `getByRole` stays loose for scenario-specific locators.
 *
 * @typedef {object} QaPage
 * @property {(url: string, options?: { waitUntil?: "load" | "domcontentloaded" | "networkidle", timeout?: number }) => Promise<unknown>} goto
 * @property {(event: string, listener: (...args: any[]) => void) => unknown} on
 * @property {(event: string, listener: (...args: any[]) => void) => unknown} off
 * @property {() => string} url
 * @property {(size: Viewport) => Promise<void>} setViewportSize
 * @property {(script: () => void) => Promise<void>} addInitScript
 * @property {<R, A>(fn: (arg: A) => R | Promise<R>, arg: A) => Promise<R>} evaluate
 * @property {<A>(fn: (arg: A) => unknown, arg: A, options?: { timeout?: number, polling?: number | "raf" }) => Promise<{ jsonValue(): Promise<unknown>, dispose(): Promise<void> }>} waitForFunction
 * @property {(ms: number) => Promise<void>} waitForTimeout
 * @property {(selector: string, options?: { state?: "attached" | "visible" | "hidden" | "detached", timeout?: number }) => Promise<unknown>} waitForSelector
 * @property {(options: { path: string, scale?: "css" | "device", fullPage?: boolean }) => Promise<unknown>} screenshot
 * @property {{ click(x: number, y: number): Promise<void>, move(x: number, y: number, options?: { steps?: number }): Promise<void>, down(): Promise<void>, up(): Promise<void> }} mouse
 * @property {(selector: string) => { fill(value: string, options?: { timeout?: number }): Promise<void> }} locator
 * @property {(role: string, options?: { name?: string | RegExp, exact?: boolean }) => any} getByRole
 * @property {() => { newCDPSession(page: QaPage): Promise<CdpSession> }} context
 */

/**
 * The part of Playwright's `CDPSession` `qa.trace` uses.
 *
 * @typedef {object} CdpSession
 * @property {(method: string, params?: Record<string, unknown>) => Promise<unknown>} send
 * @property {(event: string, listener: (payload: any) => void) => unknown} on
 * @property {() => Promise<void>} detach
 */

/**
 * A Chrome trace event, as CDP `Tracing.dataCollected` reports it.
 *
 * @typedef {{ name: string, ph: string, pid: number, tid: number, ts: number, dur?: number, id?: string, args?: { data?: TraceEventData, name?: string } }} TraceEvent
 */

/**
 * The `args.data` fields `qa.trace` reads: an `EventDispatch`'s type, a
 * `Profile`'s start, and a `ProfileChunk`'s nodes, samples, and deltas.
 *
 * @typedef {object} TraceEventData
 * @property {string} [type]
 * @property {number} [startTime]
 * @property {{ nodes?: Array<{ id: number, callFrame?: { functionName?: string, url?: string, lineNumber?: number } }>, samples?: number[] }} [cpuProfile]
 * @property {number[]} [timeDeltas]
 */

/** @typedef {"desktop" | "mobile"} ViewportName */

/**
 * One `browser_run_code_unsafe` call of a scenario run: a scenario is one
 * step, or several that each run in their own call on the same page, once
 * per viewport (`run-scenario.mjs`).
 *
 * @typedef {object} QaConfig
 * @property {string} baseUrl Origin of the runner's own server.
 * @property {string} bead
 * @property {string} captureDir Absolute capture directory of the bead.
 * @property {boolean} prod
 * @property {number} [timeoutMs] This call's execution budget; helper deadlines share it.
 * @property {Record<string, string>} args `--arg key=value` pairs.
 * @property {ViewportName} [viewport] The viewport this pass runs at (default `desktop`).
 * @property {number} [step] This call's step index (default 0).
 * @property {number} [steps] The scenario's step count (default 1).
 * @property {unknown} [carry] What the previous step of this viewport returned (default `null`).
 * @property {boolean} [exportGameLog] Put the current game's persisted log in
 *   the report (`QaResult.gameLog`) at the last step or on an error.
 */

/**
 * The current game's persisted journey log as the game menu's JSONL export
 * writes it: `lines` are the stored JSONL lines, oldest first. The game is
 * the URL's `?game=` (`selectedBy: "url"`), else the most recently updated
 * stored game (`"latest"`). With no game, `gameId` and `selectedBy` are null
 * and `reason` says why.
 *
 * @typedef {object} GameLogRead
 * @property {string | null} gameId
 * @property {"url" | "latest" | null} selectedBy
 * @property {string[]} lines
 * @property {string | null} reason
 */

/** One parsed journey-log line. @typedef {Record<string, unknown>} GameLogRow */

/** @typedef {{ x: number, y: number, width: number, height: number }} Rect */

/**
 * A main-thread task in a trace: its start on the page's `performance.now()`
 * clock (or the trace's, from its first event, when the start mark is
 * missing), its duration, the trace events that took its time (self time,
 * by event name), and the JavaScript functions the CPU profiler sampled in
 * it (self time).
 *
 * @typedef {{ startMs: number, durMs: number, self: Array<{ name: string, ms: number }>, js: Array<{ fn: string, ms: number }> }} TraceTask
 */

/**
 * What `qa.trace` measured on the renderer's main thread between its start
 * and end marks.
 *
 * @typedef {object} TraceSummary
 * @property {string} name
 * @property {"page" | "trace"} clock Which clock `startMs` values use.
 * @property {number} windowMs The traced window, mark to mark.
 * @property {number} taskCount
 * @property {number} busyMs Summed task time.
 * @property {number} longTaskMs The long-task threshold.
 * @property {TraceTask[]} longTasks The long tasks, longest first.
 * @property {Array<{ name: string, ms: number }>} self Self time by event name over every task.
 * @property {Array<{ fn: string, ms: number }>} js Sampled JavaScript self time over every task.
 */

/**
 * @typedef {object} QaResult
 * @property {unknown} result What the scenario returned.
 * @property {string | null} error The scenario's thrown error, with stack.
 * @property {Array<{ label: string, data?: unknown }>} log
 * @property {Array<{ path: string, href: string, width: number, height: number, clip?: Rect }>} captures
 * @property {Array<{ href: string, caps: Caps }>} caps Every document whose buffer was not empty.
 * @property {TraceSummary[]} traces
 * @property {GameLogRead} [gameLog] With `exportGameLog`, at the last step or
 *   on an error: the persisted log, or why there is none.
 */

/**
 * The control a prompt the player owes is answered through: the Foresee or
 * arrangement editor's confirm, the number picker, a choice prompt's
 * options, the card picker's gallery, the card picker on the board, or the
 * targets of a card awaiting them (`[data-battle-targeting-card-stage]`).
 * The screen marks no candidate of a `target` surface, so only the probe
 * (`debug=1`) names them.
 *
 * @typedef {"foresee" | "arrange" | "number" | "choice" | "gallery" | "board" | "target"} BattleSurface
 */

/**
 * One engine event retained from eager development battle-load observation:
 * live batches use the applied intent's
 * log `seq` and the event's `index` in that intent's published batch, which
 * name it uniquely and order it, and the engine's own `event`, unredacted,
 * with its typed identities (`side`, `source`, `controller`, `instance`).
 *
 * @typedef {object} ProbeEvent
 * @property {number} seq
 * @property {number} index
 * @property {import("../../src/engine").EngineEventKind} kind
 * @property {import("../../src/engine/state/ids").InstanceId | null} instance
 * @property {import("../../src/engine").EngineEvent} event
 */

/**
 * A position in one battle's recorded engine events, collected from battle
 * load before the lazy debug panel mounts: after the event keyed
 * `(seq, index)`; `seq` and `index` are -1 before the first event.
 * Lab constructor events share the actual loading intent's seq and contiguous
 * indices; live events use their applied intent's seq. These are not
 * engine.action log sequence numbers. A reload begins a fresh observation history.
 *
 * @typedef {{ battleId: import("../../src/types/identifiers").BattleId, seq: number, index: number }} EventCursor
 */

/**
 * A recorded event as `qa.battle.events` returns it, with `cards`: the
 * printing UUID that each instance the event names (its `instance`,
 * `source`, `subject`, and any other instance-valued field) has in the
 * committed state as read, or `null` for an instance no longer there or not
 * a card printing.
 *
 * @typedef {ProbeEvent & { cards: Partial<Record<import("../../src/engine/state/ids").InstanceId, import("../../src/types/card-identity").CardId | null>> }} ObservedEvent
 */

/**
 * Fields an event must have, compared by value with the engine event's own
 * fields: `{ kind: "cardDrawn", side: "enemy" }`, or
 * `{ kind: "triggerQueued", source: { kind: "avatar", side: "player" } }`.
 *
 * @typedef {Partial<Record<string, unknown>>} EventMatch
 */

/**
 * What one `qa.battle.events` read observed: the matching events after the
 * cursor, oldest first, at most `limit`; `cursor` continues the read without
 * skipping or repeating one (the last returned event while `more`, else the
 * last recorded event, else the given cursor).
 *
 * @typedef {{ events: ObservedEvent[], cursor: EventCursor, more: boolean }} EventPage
 */

/**
 * The part of the engine debug panel's `window.__engineProbe` (`debug=1`,
 * `src/battle/components/EngineDebugPanel.tsx`) the battle driver reads.
 *
 * @typedef {object} EngineProbeView
 * @property {import("../../src/types/identifiers").BattleId} battleId
 * @property {{ kind: string, side: string } | null} decision
 * @property {{ kind: string, side: string, id: string, candidates?: string[], purpose?: { role: import("../../src/engine/prompts/types").PromptRole } } | null} pending
 * @property {ProbeEvent[]} events
 * @property {{ committed: { stack: unknown[], result: unknown, sides: Record<string, { score: number }>, config: { scoreToWin: number }, instances: Partial<Record<import("../../src/engine/state/ids").InstanceId, { printing: { kind: string, cardId?: import("../../src/types/card-identity").CardId } }>> }, inFlight: { answers: Array<{ value: import("../../src/engine").Answer, auto?: true }> } | null, publishedEvents: number }} slice
 *   `publishedEvents` counts the in-flight step's events already published.
 */

/**
 * What the engine debug panel's `window.__engineProbe` (`debug=1`) adds to a
 * battle state.
 *
 * @typedef {object} BattleProbeState
 * @property {{ kind: string, side: string } | null} decision The pending top-level decision (`main` or `respond`); null while an intent is in flight.
 * @property {{ kind: string, side: string, id: string, candidates: string[] } | null} pending The pending prompt of either side.
 * @property {number} stack
 * @property {boolean} inFlight
 * @property {boolean} ended
 * @property {Record<string, number>} scores Each side's score, by `player` and `enemy`.
 * @property {number} scoreToWin
 * @property {number} events Engine events published so far.
 */

/**
 * The prompt the player owes.
 *
 * @typedef {object} BattlePrompt
 * @property {BattleSurface | null} surface Null while the probe reports a prompt the screen does not show yet.
 * @property {string | null} kind The engine's prompt kind with the probe, else the surface.
 * @property {string | null} id
 * @property {string[]} candidates A card prompt's candidates: the probe's instance ids, else the rendered candidates' ids.
 * @property {boolean} answerable Its control is rendered and enabled.
 */

/**
 * The battle as the screen shows it, plus the probe's view with `debug=1`.
 *
 * @typedef {object} BattleState
 * @property {string | null} phase `[data-battle-phase]`: `dawn`, `day`, `dusk`, `night`, or `challenge`.
 * @property {"near" | "far" | null} side Whose turn it is (`[data-battle-side]`); `near` is the human's.
 * @property {string | null} at `<side>:<phase>`.
 * @property {BattlePrompt | null} prompt
 * @property {"main" | "respond" | null} window
 *   What the player's pass answers: with the probe, the human's pending
 *   decision; without it, `respond` whenever the player may pass in the far
 *   side's turn, else `main`.
 * @property {boolean} canPass The phase button is rendered, enabled, and uncovered.
 * @property {string | null} waiting The side the screen says it waits on (`[data-battle-prompt-waiting]`).
 * @property {"victory" | "defeat" | null} result The result surface shown.
 * @property {string} board Every rendered battle card with the rank, row, or zone it sits in.
 * @property {BattleProbeState | null} probe
 * @property {number} caps The current document's `__caps` entries.
 */

/**
 * What `qa.battle.promptOrAutoAnswer` saw first for a prompt role of the
 * player's: the answerable rendered prompt (`rendered`, with the state that
 * shows it), or the engine's `promptAutoAnswered` event (`autoAnswered`).
 * `cursor` follows the auto-answered event, else the last recorded event as
 * read. `answer` is the forced answer while its step is still in flight (the
 * probe's recorded in-flight answers); the event itself carries none, so it
 * is `null` once the step commits.
 *
 * @typedef {{ outcome: "rendered", prompt: BattlePrompt, state: BattleState, cursor: EventCursor }
 *   | { outcome: "autoAnswered", event: ObservedEvent, answer: import("../../src/engine").Answer | null, cursor: EventCursor }} PromptOrAutoAnswer
 */

/**
 * What a `playUntil` run did.
 *
 * @typedef {object} BattleRun
 * @property {string} label
 * @property {string[]} history Each `at` the run saw, in order, repeats collapsed.
 * @property {number} turns How many times the turn passed to the other side.
 * @property {number} passes Phase-button presses.
 * @property {number} responds Passes in the far side's turn whose `window` is `respond`.
 * @property {number} answers Prompts answered.
 * @property {number} ms
 */

/**
 * @typedef {object} PlayOptions
 * @property {number} [timeout] The run's time limit (default 120 000 ms).
 * @property {number} [stallMs] Fail when the battle shows no progress this long (default 45 000 ms).
 * @property {number} [pollMs] The wait between reads while nothing can act (default 100 ms).
 * @property {string} [label] Names the run in its log line and errors.
 * @property {(state: BattleState, run: BattleRun) => boolean | Promise<boolean>} [before]
 *   Runs before the driver acts; returning true means it acted itself (it
 *   responded, or dismissed something), which counts as progress, and the
 *   driver reads the battle again.
 * @property {(state: BattleState) => boolean} [passWhen] Whether to pass in this state (default always).
 */

/**
 * `qa.battle`: one battle driver for every scenario.
 *
 * @typedef {object} BattleDriver
 * @property {() => Promise<BattleState>} state
 * @property {(state?: BattleState) => Promise<boolean>} pass
 *   Presses the phase button (a main-phase pass, or a pass in a respond
 *   window); true once the battle shows progress.
 * @property {(state?: BattleState) => Promise<boolean>} answer
 *   Answers the prompt the player owes with its first legal choice; false
 *   when its control is not ready.
 * @property {(selector: string) => Promise<boolean>} tap
 *   Clicks the first point of the element that `elementFromPoint` resolves
 *   to it, as on a card in a fanned hand; false when no point does.
 * @property {(predicate: (state: BattleState, run: BattleRun) => boolean | Promise<boolean>, options?: PlayOptions) => Promise<BattleRun & { state: BattleState }>} playUntil
 *   Until `predicate` holds: answers each prompt the player owes, else
 *   passes, else waits. Fails with a diagnostic on `__caps`, a battle that
 *   ends first, no progress within `stallMs`, or `timeout`.
 * @property {(predicate: (state: BattleState) => boolean | Promise<boolean>, options?: { timeout?: number, pollMs?: number, label?: string }) => Promise<BattleState>} waitFor
 *   Waits, without acting, until `predicate` holds.
 * @property {() => Promise<EventCursor>} eventCursor
 *   The position after the last engine event the probe (`debug=1`) has
 *   recorded, for a later `events` or `waitForEvents` read.
 * @property {(cursor: EventCursor | null, options?: { match?: EventMatch, limit?: number }) => Promise<EventPage>} events
 *   Reads, without acting or waiting, the recorded events after `cursor`
 *   (`null`: from the first) that have `match`'s fields, at most `limit`
 *   (default 100, at most 500). Fails when the probe is missing or shows
 *   another battle than the cursor's. Options and match must be non-null,
 *   non-array objects; unknown top-level option fields fail before reading.
 * @property {(cursor: EventCursor | null, match: EventMatch, options?: { count?: number, limit?: number, timeout?: number, label?: string }) => Promise<EventPage>} waitForEvents
 *   Waits, without acting, until at least `count` (default 1) recorded
 *   events after `cursor` have `match`'s fields, then reads them as
 *   `events` does. Fails on `__caps`, another battle, or `timeout` (default
 *   15 000 ms).
 * @property {(options: { role: import("../../src/engine/prompts/types").PromptRole, since: EventCursor | null, timeout?: number, pollMs?: number, label?: string }) => Promise<PromptOrAutoAnswer>} promptOrAutoAnswer
 *   Waits, without acting, for the player's prompt whose purpose has `role`
 *   (`debug=1`): resolves once it is rendered and answerable, or once a
 *   player `promptAutoAnswered` event with that role is recorded after
 *   `since` (an auto-answer the engine gave for a single legal choice),
 *   whichever the battle reached first. Fails on `__caps`, another battle,
 *   or `timeout` (default 15 000 ms) with a `QaTimeoutError`.
 * @property {(options?: { seed?: string, query?: string, atFrontDoor?: () => Promise<void> }) => Promise<{ sites: Array<string | null> }>} enterFirstBattle
 *   Opens a fresh game (`/?seed=<seed>&<query>`, seed 1) and walks the front
 *   door to the first battle with no development-only parameter: Avatar
 *   selection, every Layer 1 site, and Battle Start, up to the player's
 *   phase button. `atFrontDoor` runs once the front door shows.
 */

/**
 * The helpers a scenario receives.
 *
 * @typedef {object} Qa
 * @property {QaPage} page
 * @property {string} baseUrl
 * @property {string} bead
 * @property {string} captureDir Absolute capture directory of the bead.
 * @property {boolean} prod
 * @property {Record<string, string>} args
 * @property {{ desktop: Viewport, mobile: Viewport }} viewports
 * @property {ViewportName} viewportName The viewport this pass runs at.
 * @property {Viewport} viewport Its size; `open`'s default.
 * @property {number} step This call's step index.
 * @property {number} steps The scenario's step count.
 * @property {unknown} carry What the previous step of this viewport returned; `null` at its first step.
 * @property {(route: string) => string} url
 *   The absolute URL of `route` (`/path?query`, `path`, or `?query`) on the
 *   runner's server; an absolute URL is returned as is.
 * @property {(route: string, options?: { allowErrors?: boolean, waitUntil?: "load" | "domcontentloaded" | "networkidle", timeout?: number }) => Promise<{ href: string, width: number, height: number }>} goto
 *   Loads `route` (resolved by `url`) at the current viewport, and asserts
 *   the origin and an empty `__caps` (unless `allowErrors`). The buffer of
 *   the document it leaves goes into the report.
 * @property {(route: string, viewport?: Viewport, options?: { allowErrors?: boolean, timeout?: number }) => Promise<{ href: string, width: number, height: number }>} open
 *   Sizes the viewport (default `qa.viewport`), then `goto`s `route` and
 *   also asserts the viewport.
 * @property {(target: string | Target, options?: { position?: { x?: number, y?: number }, rest?: boolean, timeout?: number, minOpacity?: number }) => Promise<{ x: number, y: number }>} click
 *   Waits until the target is rendered (at `minOpacity`, default 0.95) and
 *   `elementFromPoint` at its centre (or `position` within its box) is the
 *   target or inside it, clicks there with the pointer, and rests the pointer
 *   outside the viewport. Floating or animating targets need no stability
 *   wait.
 * @property {(target: string | Target, options?: { timeout?: number, minOpacity?: number }) => Promise<void>} waitVisible
 *   Waits until the target is rendered at `minOpacity` (default 0.95).
 * @property {(target: string | Target, options?: { minOpacity?: number }) => Promise<boolean>} isVisible
 *   Whether the target is rendered at `minOpacity` (default 0.95) now.
 * @property {<R, A>(fn: (arg: A) => R | Promise<R>, arg: A, options?: { timeout?: number }) => Promise<R>} read
 *   Evaluates an observation, retrying only destroyed navigation contexts within one deadline.
 * @property {<R, A>(label: string, fn: (arg: A) => R | Promise<R>, arg: A, options?: { timeout?: number, pollMs?: number, allowErrors?: boolean }) => Promise<NonNullable<R>>} waitFor
 *   Waits for a truthy page-side observation, re-attaching across navigation.
 * @property {(zone: "hand" | "play" | "void", side: "player" | "enemy", uuid: string, options?: { timeout?: number }) => Promise<string>} labAddCard
 *   Stages one card through the debug UI, returning its new instance id after committed-state confirmation.
 * @property {(stage: LabStageInput, options?: { card?: string, variant?: string, as?: "player" | "enemy", timeout?: number }) => Promise<{ battleId: import("../../src/types/identifiers").BattleId, player: LabPhysicalSide, enemy: LabPhysicalSide }>} labStage
 *   Opens one declared scene, verifies its immutable initial board, and returns physical IDs even when the AI has already moved.
 * @property {BattleDriver} battle
 * @property {() => Promise<void>} rest Moves the pointer outside the viewport.
 * @property {(name: string, options?: { fullPage?: boolean, clip?: Rect, element?: string | Target, pad?: number, minOpacity?: number }) => Promise<string>} capture
 *   Writes `<captureDir>/<name>.png` at CSS scale, pointer at rest: the
 *   viewport, the full page (`fullPage`), a viewport rectangle (`clip`), or
 *   the box of the first rendered element of `element` (waited for like
 *   `waitVisible`), grown by `pad` CSS pixels. A clip is cut to the viewport.
 * @property {<T>(name: string, fn: () => Promise<T>, options?: { longTaskMs?: number, top?: number }) => Promise<TraceSummary & { value: T }>} trace
 *   Records a Chrome trace (CDP `Tracing`) around `fn`, bracketed by
 *   `performance.mark`s `qa-trace:<name>:start` and `:end` that put the
 *   trace on the page's `performance.now()` clock, and summarizes the
 *   renderer main thread's tasks between them: each long task (default
 *   50 ms) with its self time by trace event and its sampled JavaScript
 *   functions, `top` (default 8) of each. The summary also goes into the
 *   report's `traces`; `value` is what `fn` returned.
 * @property {() => Promise<Caps | null>} caps
 * @property {(label: string, options?: { timeout?: number }) => Promise<void>} assertCaps Throws unless `__caps` is empty.
 * @property {(message: string, cause?: unknown) => Error} timeoutError Creates a structured helper deadline failure.
 * @property {(error: unknown) => boolean} isTimeout Recognizes structured helper deadline failures through causes.
 * @property {(label: string, data?: unknown) => void} note Adds a line to the report's log.
 * @property {(ms: number) => Promise<void>} sleep
 * @property {GameLogHelpers} gameLog
 * @property {(result: unknown, error: string | null) => Promise<QaResult>} finish
 *   The call's report. The current document's buffer goes into it only at
 *   the scenario's last step or on an error: a later step reads the same
 *   document. So does the persisted game log, with `exportGameLog`.
 */

/**
 * `qa.gameLog`: the current game's persisted journey log (`GameLogRead`),
 * read inside the page and awaited there, so results are plain data. Lines
 * captured in the last moment may still be queued for writing; poll with
 * `waitFor` for rows a scenario expects.
 *
 * @typedef {object} GameLogHelpers
 * @property {(options?: { timeout?: number }) => Promise<GameLogRead>} read
 * @property {(options?: { timeout?: number }) => Promise<GameLogRow[]>} rows
 *   The parsed lines, oldest first; empty with no game. Fails on a line that
 *   is not a JSON object.
 * @property {<R>(label: string, predicate: (rows: GameLogRow[], log: GameLogRead) => R | Promise<R>, options?: { timeout?: number, pollMs?: number }) => Promise<NonNullable<R>>} waitFor
 *   Reads the rows until `predicate` returns a truthy value, and returns it.
 *   The predicate runs in the runner's sandbox, not the page, so it may use
 *   the scenario's variables. Fails on `__caps` or after `timeout` (default
 *   15 000 ms, polling every `pollMs`, default 250 ms).
 */

/**
 * Builds the helpers on `page`. The init script installs `__caps` and
 * `__qa` on every later document before its own scripts run, so `__caps`
 * records load-time errors too. Waits fail at once when `__caps` records an
 * error or a rejection.
 *
 * @param {QaPage} page
 * @param {QaConfig} config
 * @returns {Promise<Qa>}
 */
export async function createQa(page, config) {
  const callDeadline = config.timeoutMs === undefined ? null : Date.now() + config.timeoutMs;
  const timeoutError = (/** @type {string} */ message, /** @type {unknown} */ cause = undefined) => {
    const error = new Error(message, cause === undefined ? undefined : { cause });
    error.name = "QaTimeoutError";
    return error;
  };
  const isTimeout = (/** @type {unknown} */ error) => {
    const seen = new Set();
    while (typeof error === "object" && error !== null && !seen.has(error)) {
      seen.add(error);
      if ("name" in error && (error.name === "QaTimeoutError" || error.name === "TimeoutError")) return true;
      error = "cause" in error ? error.cause : null;
    }
    return false;
  };
  const viewports = {
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844 },
  };
  const viewportName = config.viewport ?? "desktop";
  const step = config.step ?? 0;
  const steps = config.steps ?? 1;
  const origin = config.baseUrl.replace(/\/+$/, "");
  /** @param {string} href */
  const onOrigin = (href) => href === origin || href.startsWith(`${origin}/`);
  /** @param {string} route */
  const url = (route) =>
    /^[a-z][a-z0-9+.-]*:\/\//i.test(route) ? route : `${origin}${route.startsWith("/") ? "" : "/"}${route}`;
  /** @type {QaResult["log"]} */
  const log = [];
  /** @type {QaResult["captures"]} */
  const captures = [];
  /** @type {TraceSummary[]} */
  const traces = [];

  // Observe errors outside the document too: a reload must not discard them.
  /** @type {Map<string, { href: string, caps: Caps }>} */
  const observed = new Map();
  const consoleMessage = (/** @type {{ type(): string, text(): string }} */ message) => {
    const prefix = "dreamtides:qa:caps:";
    if (message.type() !== "debug" || !message.text().startsWith(prefix)) return;
    /** @type {unknown} */
    let event;
    try { event = JSON.parse(message.text().slice(prefix.length)); } catch { return; }
    if (event === null || typeof event !== "object" ||
        !("documentId" in event) || typeof event.documentId !== "string" || !("href" in event) || typeof event.href !== "string" ||
        !("message" in event) || typeof event.message !== "string" || !("index" in event) || typeof event.index !== "number" ||
        !Number.isSafeInteger(event.index) || event.index < 1 || !("kind" in event) ||
        (event.kind !== "errors" && event.kind !== "rejections" && event.kind !== "consoleErrors")) return;
    let entry = observed.get(event.documentId);
    if (entry === undefined) {
      entry = { href: event.href, caps: { errors: [], rejections: [], consoleErrors: [] } };
      observed.set(event.documentId, entry);
    }
    if (entry.caps[event.kind].length < event.index) entry.caps[event.kind].push(event.message);
  };
  page.on("console", consoleMessage);

  // Every call of a run (each step, each card of a sweep) adds this script
  // again; the first to run on a document installs the buffer.
  try {
    await page.addInitScript(() => {
    const qaWindow = /** @type {QaWindow} */ (window);
    if (qaWindow.__caps !== undefined) return;
    // One tab-scoped observation, tied to the exact persisted game/request.
    // It preserves the scene's published outcome, including rejection, while
    // the saved battle resumes. It never builds or writes application state.
    const key = () => {
      const query = new URLSearchParams(location.search);
      return query.get("game") === null ? null : JSON.stringify(
        ["game", "goto", "card", "variant", "as", "seed", "labStage"].map((name) => query.get(name)),
      );
    };
    const storageKey = "dreamtides-qa-card-lab-report";
    const stored = sessionStorage.getItem(storageKey);
    if (stored !== null) {
      const saved = /** @type {unknown} */ (JSON.parse(stored));
      if (typeof saved === "object" && saved !== null && "key" in saved && "report" in saved && saved.key === key()) {
        Object.assign(window, { __cardLab: saved.report });
      }
    }
    addEventListener("pagehide", () => {
      const report = /** @type {Window & { __cardLab?: unknown }} */ (window).__cardLab;
      const request = key();
      if (request !== null && report !== undefined) sessionStorage.setItem(storageKey, JSON.stringify({ key: request, report }));
      else sessionStorage.removeItem(storageKey);
    });
    /** @type {Caps} */
    const caps = { errors: [], rejections: [], consoleErrors: [] };
    qaWindow.__caps = caps;
    const documentId = crypto.randomUUID();
    qaWindow.__qaDocumentId = documentId;
    const send = console.debug.bind(console);
    const report = (/** @type {keyof Caps} */ kind, /** @type {string} */ message) => {
      caps[kind].push(message);
      send(`dreamtides:qa:caps:${JSON.stringify({ documentId, href: location.href, kind, message, index: caps[kind].length })}`);
    };
    addEventListener("error", (event) => {
      report("errors", String(event.message));
    });
    addEventListener("unhandledrejection", (event) => {
      const reason = /** @type {unknown} */ (event.reason);
      report("rejections", reason instanceof Error ? String(reason.stack ?? reason) : String(reason));
    });
    const original = console.error;
    console.error = (/** @type {unknown[]} */ ...args) => {
      report("consoleErrors", args.map(String).join(" | "));
      original.apply(console, args);
    };

    /** @param {Element} element */
    const text = (element) => (element.textContent ?? "").replace(/\s+/g, " ");
    /** @param {Target} target */
    const candidates = (target) => {
      if (target.selector !== undefined) return [...document.querySelectorAll(target.selector)];
      const pattern = new RegExp(target.text ?? "");
      return [...document.body.querySelectorAll("*")].filter(
        (element) => pattern.test(text(element)) && ![...element.children].some((child) => pattern.test(text(child))),
      );
    };
    /** @param {Element} element */
    const opacity = (element) => {
      let product = 1;
      for (let node = /** @type {Element | null} */ (element); node !== null; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.visibility === "hidden" || style.display === "none") return 0;
        product *= Number(style.opacity);
      }
      return product;
    };
    /** @param {Element} element */
    const describe = (element) => {
      const marked = element.closest("[data-testid], [role], [aria-label], [id]") ?? element;
      const attributes = [...marked.attributes]
        .filter((attribute) => ["data-testid", "role", "aria-label", "id"].includes(attribute.name))
        .map((attribute) => `[${attribute.name}="${attribute.value.slice(0, 40)}"]`)
        .join("");
      const self = marked === element ? "" : ` > ${element.tagName.toLowerCase()}`;
      return `${marked.tagName.toLowerCase()}${attributes}${self}`;
    };
    /** @type {QaDom["rendered"]} */
    const rendered = (target, minOpacity) =>
      candidates(target).find((element) => {
        const box = element.getBoundingClientRect();
        return box.width >= 1 && box.height >= 1 &&
          box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth &&
          opacity(element) >= minOpacity;
      }) ?? null;
    qaWindow.__qa = {
      rendered,
      hitPoint(target, minOpacity, offset) {
        const element = rendered(target, minOpacity);
        if (element === null) return null;
        const box = element.getBoundingClientRect();
        const x = Math.min(Math.max(box.left + (offset?.x ?? box.width / 2), 1), innerWidth - 1);
        const y = Math.min(Math.max(box.top + (offset?.y ?? box.height / 2), 1), innerHeight - 1);
        const hit = document.elementFromPoint(x, y);
        const covered = hit === null ? "nothing" : element.contains(hit) ? null : describe(hit);
        return { x, y, covered };
      },
    };
    });
  } catch (error) {
    page.off("console", consoleMessage);
    throw error;
  }

  /** @param {Caps | null} caps */
  const capsCount = (caps) =>
    caps === null ? 0 : caps.errors.length + caps.rejections.length + caps.consoleErrors.length;

  /** @type {Qa["read"]} */
  const read = async (fn, arg, { timeout = 15_000 } = {}) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      try {
        return await page.evaluate(fn, arg);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/Execution context was destroyed|Cannot find context with specified id/i.test(message)) throw error;
        if (Date.now() >= deadline) throw timeoutError(`qa.read: navigation did not settle within ${String(timeout)} ms`, error);
        await page.waitForTimeout(Math.min(100, Math.max(1, deadline - Date.now())));
      }
    }
  };

  const assertObserved = (/** @type {string} */ label) => {
    if (observed.size > 0) throw new Error(`${label}: __caps ${JSON.stringify([...observed.values()])}`);
  };

  const readState = (timeout = 15_000) =>
    read(
      () => ({
        href: location.href,
        width: innerWidth,
        height: innerHeight,
        caps: /** @type {QaWindow} */ (window).__caps ?? null,
        documentId: /** @type {QaWindow} */ (window).__qaDocumentId ?? location.href,
      }),
      null,
      { timeout },
    );

  // Merge observations by document and occurrence, retaining repeated errors.
  const mergeCaps = (/** @type {Awaited<ReturnType<typeof readState>>} */ state) => {
    if (state.caps === null || capsCount(state.caps) === 0) return;
    const documentId = state.documentId ?? state.href;
    let entry = observed.get(documentId);
    if (entry === undefined) {
      entry = { href: state.href, caps: { errors: [], rejections: [], consoleErrors: [] } };
      observed.set(documentId, entry);
    }
    for (const kind of /** @type {const} */ (["errors", "rejections", "consoleErrors"])) {
      const prior = entry.caps[kind];
      const counts = new Map(prior.map((message) => [message, prior.filter((item) => item === message).length]));
      /** @type {Map<string, number>} */
      const seen = new Map();
      for (const message of state.caps[kind]) {
        const count = (seen.get(message) ?? 0) + 1;
        seen.set(message, count);
        if (count > (counts.get(message) ?? 0)) prior.push(message);
      }
    }
  };

  // Records the current document's buffer before a navigation replaces it.
  const recordCaps = async (timeout = 15_000) => {
    if (!onOrigin(page.url())) return;
    const state = await readState(timeout);
    mergeCaps(state);
  };

  const rest = () => page.mouse.move(-5, -5);

  /**
   * @param {string | Target} target
   * @returns {Target}
   */
  const asTarget = (target) => (typeof target === "string" ? { selector: target } : target);

  /** @param {Target} target */
  const describe = (target) => target.selector ?? `text /${target.text ?? ""}/`;

  /**
   * Polls the page every 100 ms until the target is rendered (`rendered`) or
   * also uncovered at its click point (`hit`). Fails on timeout, or at once
   * when `__caps` records an error or a rejection.
   *
   * @param {string} label
   * @param {{ kind: "rendered" | "hit", target: Target, minOpacity: number, offset?: { x?: number, y?: number } }} probe
   * @param {number} timeout
   * @returns {Promise<HitPoint>}
   */
  const poll = async (label, probe, timeout) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      assertObserved(label);
      const outcome = await read(({ kind, target, minOpacity, offset }) => {
        const qaWindow = /** @type {QaWindow} */ (window);
        const caps = qaWindow.__caps;
        if (caps !== undefined && caps.errors.length + caps.rejections.length + caps.consoleErrors.length > 0) {
          return { caps: JSON.stringify(caps), point: null };
        }
        const dom = qaWindow.__qa;
        if (dom === undefined) return { caps: null, point: null };
        if (kind === "rendered") {
          return { caps: null, point: dom.rendered(target, minOpacity) === null ? null : { x: 0, y: 0, covered: null } };
        }
        const hit = dom.hitPoint(target, minOpacity, offset);
        return { caps: null, point: hit !== null && hit.covered === null ? hit : null };
      }, probe, { timeout: Math.max(1, deadline - Date.now()) });
      if (outcome.caps !== null) throw new Error(`${label}: __caps recorded ${outcome.caps}`);
      if (outcome.point !== null) return outcome.point;
      if (Date.now() >= deadline) throw timeoutError(`${label}: timed out after ${String(timeout)} ms`);
      await page.waitForTimeout(100);
    }
  };

  /** @type {Qa["waitVisible"]} */
  const waitVisible = async (rawTarget, { timeout = 15_000, minOpacity = 0.95 } = {}) => {
    const target = asTarget(rawTarget);
    await poll(`waitVisible ${describe(target)}`, { kind: "rendered", target, minOpacity }, timeout);
  };

  /**
   * @param {string} route
   * @param {{allowErrors: boolean, waitUntil: "load" | "domcontentloaded" | "networkidle"}} options
   * @param {number | null} deadline
   */
  const navigate = async (route, { allowErrors, waitUntil }, deadline) => {
    const remaining = () => {
      if (deadline === null) return 15_000;
      const budget = deadline - Date.now();
      if (budget <= 0) throw timeoutError("qa.open/goto: navigation deadline expired");
      return budget;
    };
    await recordCaps(remaining());
    // DOMContentLoaded settles the navigation without depending on resource
    // load under host pressure; the helpers wait for their actual UI contracts.
    await page.goto(url(route), { waitUntil, ...(deadline === null ? {} : { timeout: remaining() }) });
    const state = await readState(remaining());
    remaining();
    if (!onOrigin(state.href)) throw new Error(`goto ${route}: landed on ${state.href}, not ${origin}`);
    if (state.caps === null) throw new Error(`goto ${route}: the __caps init script did not run`);
    if (allowErrors) {
      observed.clear();
      await read(() => {
        const caps = /** @type {QaWindow} */ (window).__caps;
        if (caps !== undefined) for (const values of Object.values(caps)) values.length = 0;
      }, null, { timeout: remaining() });
      remaining();
    }
    if (!allowErrors) assertObserved(`goto ${route}`);
    if (!allowErrors && capsCount(state.caps) > 0) {
      throw new Error(`goto ${route}: load-time errors ${JSON.stringify(state.caps)}`);
    }
    return { href: state.href, width: state.width, height: state.height };
  };


  /** @type {Qa["goto"]} */
  const goto = (route, { allowErrors = false, waitUntil = "domcontentloaded", timeout } = {}) =>
    navigate(route, { allowErrors, waitUntil }, timeout === undefined ? null : Date.now() + timeout);

  /**
   * Summarizes the renderer main thread's tasks between a trace's marks.
   *
   * @param {string} name
   * @param {TraceEvent[]} events
   * @param {{ start: number | null }} marks The start mark's `startTime` on the page clock.
   * @param {{ longTaskMs: number, top: number }} options
   * @returns {TraceSummary}
   */
  const summarizeTrace = (name, events, marks, { longTaskMs, top }) => {
    const startMark = events.find((event) => event.name === `qa-trace:${name}:start`);
    const endMark = events.find((event) => event.name === `qa-trace:${name}:end`);
    // The marks are emitted on the main thread; without them (`fn` threw
    // before its end mark, or navigated), the busiest renderer main thread.
    let main = startMark ?? endMark;
    if (main === undefined) {
      const renderers = new Set(
        events
          .filter((event) => event.name === "thread_name" && event.args?.name === "CrRendererMain")
          .map((event) => `${String(event.pid)}:${String(event.tid)}`),
      );
      /** @type {Map<string, number>} */
      const busy = new Map();
      for (const event of events) {
        const key = `${String(event.pid)}:${String(event.tid)}`;
        if (event.name !== "RunTask" || event.dur === undefined || !renderers.has(key)) continue;
        busy.set(key, (busy.get(key) ?? 0) + event.dur);
      }
      const [key] = [...busy.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
      main = events.find((event) => key !== undefined && `${String(event.pid)}:${String(event.tid)}` === key);
    }
    const empty = { name, clock: /** @type {const} */ ("trace"), windowMs: 0, taskCount: 0, busyMs: 0, longTaskMs, longTasks: [], self: [], js: [] };
    if (main === undefined) return empty;
    const { pid, tid } = main;
    // A trace holds hundreds of thousands of events: no spread into Math.min.
    let first = Infinity;
    let last = 0;
    for (const event of events) {
      if (event.ts > 0 && event.ts < first) first = event.ts;
      last = Math.max(last, event.ts + (event.dur ?? 0));
    }
    const from = startMark?.ts ?? first;
    const to = endMark?.ts ?? last;
    const pageClock = startMark !== undefined && marks.start !== null;
    const zeroUs = pageClock ? startMark.ts - /** @type {number} */ (marks.start) * 1000 : first;
    /** @param {number} us */
    const ms = (us) => Math.round(us / 100) / 10;

    const slices = events
      .filter((event) => event.pid === pid && event.tid === tid && event.ph === "X" && event.dur !== undefined)
      .sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));
    /** @type {TraceEvent[]} */
    const tasks = [];
    for (const event of slices) {
      if (event.name !== "RunTask") continue;
      const last = tasks[tasks.length - 1];
      if (last !== undefined && event.ts < last.ts + (last.dur ?? 0)) continue;
      // A task that began before the start mark holds the profiler's start-up, not `fn`'s work.
      if (event.ts < from || event.ts > to) continue;
      tasks.push(event);
    }

    /** @param {TraceEvent} event */
    const label = (event) => {
      const data = event.args?.data;
      if (event.name === "EventDispatch" && data?.type !== undefined) return `EventDispatch ${data.type}`;
      return event.name;
    };
    // Self time per slice: its duration less its direct children's.
    /** @type {Array<Map<string, number>>} */
    const selfByTask = tasks.map(() => new Map());
    let taskIndex = 0;
    /** @type {Array<{ end: number, label: string, self: number }>} */
    const stack = [];
    /** @param {number} index */
    const close = (index) => {
      const open = stack.pop();
      const totals = selfByTask[index];
      if (open !== undefined && totals !== undefined) totals.set(open.label, (totals.get(open.label) ?? 0) + open.self);
    };
    for (const event of slices) {
      while (taskIndex < tasks.length && event.ts >= (tasks[taskIndex]?.ts ?? 0) + (tasks[taskIndex]?.dur ?? 0)) {
        while (stack.length > 0) close(taskIndex);
        taskIndex += 1;
      }
      const task = tasks[taskIndex];
      if (task === undefined) break;
      if (event.ts < task.ts) continue;
      while (stack.length > 0 && event.ts >= (stack[stack.length - 1]?.end ?? 0)) close(taskIndex);
      const parent = stack[stack.length - 1];
      const dur = event.dur ?? 0;
      if (parent !== undefined) parent.self -= dur;
      stack.push({ end: event.ts + dur, label: label(event), self: dur });
    }
    while (stack.length > 0) close(taskIndex);

    // The CPU profiler's samples of the main thread, each weighted by its time delta.
    /** @type {Array<Map<string, number>>} */
    const jsByTask = tasks.map(() => new Map());
    // A profile's `Profile` event comes from its isolate's thread, so a
    // worker's profile (the AI host) is told apart by thread; its chunks come
    // from the profiler thread and join by id.
    /** @type {Map<string, { start: number, onMain: boolean, nodes: Map<number, string>, samples: Array<{ ts: number, node: number, weight: number }> }>} */
    const profiles = new Map();
    for (const event of events) {
      if (event.name === "Profile" && event.id !== undefined && event.pid === pid) {
        profiles.set(event.id, {
          start: event.args?.data?.startTime ?? event.ts,
          onMain: event.tid === tid,
          nodes: new Map(),
          samples: [],
        });
      }
    }
    for (const event of events) {
      if (event.name !== "ProfileChunk" || event.id === undefined) continue;
      const profile = profiles.get(event.id);
      if (profile === undefined) continue;
      const data = event.args?.data ?? {};
      for (const node of data.cpuProfile?.nodes ?? []) {
        const frame = node.callFrame ?? {};
        const where = (frame.url ?? "").replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/\?.*$/, "");
        const fn = frame.functionName === undefined || frame.functionName === "" ? "(anonymous)" : frame.functionName;
        profile.nodes.set(node.id, where === "" ? fn : `${fn} ${where}:${String((frame.lineNumber ?? 0) + 1)}`);
      }
      const deltas = data.timeDeltas ?? [];
      let at = profile.samples[profile.samples.length - 1]?.ts ?? profile.start;
      for (const [index, node] of (data.cpuProfile?.samples ?? []).entries()) {
        const delta = deltas[index] ?? 0;
        at += delta;
        profile.samples.push({ ts: at, node, weight: delta });
      }
    }
    const mainProfile = [...profiles.values()].sort(
      (a, b) => Number(b.onMain) - Number(a.onMain) || b.samples.length - a.samples.length,
    )[0];
    if (mainProfile !== undefined) {
      let cursor = 0;
      for (const sample of mainProfile.samples.sort((a, b) => a.ts - b.ts)) {
        while (cursor < tasks.length && sample.ts >= (tasks[cursor]?.ts ?? 0) + (tasks[cursor]?.dur ?? 0)) cursor += 1;
        const task = tasks[cursor];
        if (task === undefined) break;
        if (sample.ts < task.ts) continue;
        const fn = mainProfile.nodes.get(sample.node) ?? "(unknown)";
        if (fn === "(idle)" || fn === "(root)") continue;
        const js = jsByTask[cursor];
        if (js !== undefined) js.set(fn, (js.get(fn) ?? 0) + sample.weight);
      }
    }

    /** @param {Map<string, number>} totals */
    const ranked = (totals) =>
      [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).filter(([, us]) => us >= 100);
    /** @param {Array<Map<string, number>>} maps */
    const sum = (maps) => {
      /** @type {Map<string, number>} */
      const totals = new Map();
      for (const map of maps) for (const [key, us] of map) totals.set(key, (totals.get(key) ?? 0) + us);
      return totals;
    };
    const longTasks = tasks
      .map((task, index) => ({ task, index }))
      .filter(({ task }) => (task.dur ?? 0) >= longTaskMs * 1000)
      .sort((a, b) => (b.task.dur ?? 0) - (a.task.dur ?? 0))
      .map(({ task, index }) => ({
        startMs: ms(task.ts - zeroUs),
        durMs: ms(task.dur ?? 0),
        self: ranked(selfByTask[index] ?? new Map()).map(([event, us]) => ({ name: event, ms: ms(us) })),
        js: ranked(jsByTask[index] ?? new Map()).map(([fn, us]) => ({ fn, ms: ms(us) })),
      }));
    return {
      name,
      clock: pageClock ? "page" : "trace",
      windowMs: ms(to - from),
      taskCount: tasks.length,
      busyMs: ms(tasks.reduce((total, task) => total + (task.dur ?? 0), 0)),
      longTaskMs,
      longTasks,
      self: ranked(sum(selfByTask)).map(([event, us]) => ({ name: event, ms: ms(us) })),
      js: ranked(sum(jsByTask)).map(([fn, us]) => ({ fn, ms: ms(us) })),
    };
  };

  /**
   * Reads the persisted log inside the page, as `game-repository.ts` stores
   * it in `browser-repository.ts`'s database: one `records` store whose
   * `game/<gameId>/log/<chunk>` values are arrays of JSONL lines, in key order.
   *
   * @param {number} [timeout]
   * @returns {Promise<GameLogRead>}
   */
  const readGameLog = async (timeout) => {
    if (!onOrigin(page.url())) return { gameId: null, selectedBy: null, lines: [], reason: `the page ${page.url()} is not on ${origin}` };
    return read(async () => {
      const DATABASE = "dreamtides-local-games";
      const STORE = "records";
      const END = "￿";
      const none = (/** @type {string} */ reason) => ({ gameId: null, selectedBy: null, lines: [], reason });
      /** @returns {Promise<unknown>} */
      const result = (/** @type {IDBRequest} */ request) => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
      });
      if (typeof indexedDB === "undefined") return none("IndexedDB is unavailable");
      if (typeof indexedDB.databases === "function" && !(await indexedDB.databases()).some((database) => database.name === DATABASE)) {
        return none("no local games database");
      }
      const open = indexedDB.open(DATABASE);
      // Never create the application's database without its store.
      open.onupgradeneeded = () => open.transaction?.abort();
      /** @type {IDBDatabase} */
      let database;
      try {
        database = /** @type {IDBDatabase} */ (await result(open));
      } catch {
        return none("no local games database");
      }
      try {
        if (!database.objectStoreNames.contains(STORE)) return none("no local games store");
        const range = (/** @type {string} */ prefix) =>
          result(database.transaction(STORE, "readonly").objectStore(STORE).getAll(IDBKeyRange.bound(prefix, `${prefix}${END}`, false, true)));
        /** @type {"url" | "latest"} */
        let selectedBy = "url";
        let gameId = new URLSearchParams(location.search).get("game");
        if (gameId === null) {
          selectedBy = "latest";
          let updatedAt = -Infinity;
          for (const record of /** @type {unknown[]} */ (await range("games/"))) {
            if (typeof record !== "object" || record === null || !("gameId" in record) || typeof record.gameId !== "string" ||
                !("updatedAt" in record) || typeof record.updatedAt !== "number" || record.updatedAt <= updatedAt) continue;
            gameId = record.gameId;
            updatedAt = record.updatedAt;
          }
          if (gameId === null) return none("no stored game");
        }
        const chunks = /** @type {unknown[]} */ (await range(`game/${gameId}/log/`));
        /** @type {string[]} */
        const lines = [];
        for (const chunk of chunks) {
          if (!Array.isArray(chunk)) throw new Error(`game ${String(gameId)} has a malformed log chunk`);
          for (const line of /** @type {unknown[]} */ (chunk)) {
            if (typeof line !== "string") throw new Error(`game ${String(gameId)} has a malformed log line`);
            lines.push(line);
          }
        }
        return { gameId, selectedBy, lines, reason: null };
      } finally {
        database.close();
      }
    }, null, timeout === undefined ? undefined : { timeout });
  };

  /** @param {GameLogRead} log */
  const parseGameLogRows = (log) => log.lines.map((line, index) => {
    const row = /** @type {unknown} */ (JSON.parse(line));
    if (typeof row !== "object" || row === null || Array.isArray(row)) throw new Error(`game ${String(log.gameId)} log line ${String(index)} is not an object`);
    return /** @type {GameLogRow} */ (row);
  });

  /** @type {GameLogHelpers} */
  const gameLog = {
    read: ({ timeout } = {}) => readGameLog(timeout),
    rows: async ({ timeout } = {}) => parseGameLogRows(await readGameLog(timeout)),
    async waitFor(label, predicate, { timeout = 15_000, pollMs = 250 } = {}) {
      const deadline = Date.now() + timeout;
      for (;;) {
        assertObserved(label);
        const log = await readGameLog(Math.max(1, deadline - Date.now()));
        const value = await predicate(parseGameLogRows(log), log);
        if (value) return /** @type {NonNullable<typeof value>} */ (value);
        if (Date.now() >= deadline) {
          throw timeoutError(`${label}: the persisted log of game ${String(log.gameId)} (${String(log.lines.length)} lines${log.reason === null ? "" : `; ${log.reason}`}) did not satisfy the predicate within ${String(timeout)} ms`);
        }
        await page.waitForTimeout(Math.min(pollMs, Math.max(1, deadline - Date.now())));
      }
    },
  };

  /** @type {Omit<Qa, "battle">} */
  const qa = {
    page,
    baseUrl: config.baseUrl,
    bead: config.bead,
    captureDir: config.captureDir,
    prod: config.prod,
    args: config.args,
    viewports,
    viewportName,
    viewport: viewports[viewportName],
    step,
    steps,
    carry: config.carry ?? null,
    url,
    goto,
    timeoutError,
    isTimeout,

    async open(route, viewport = viewports[viewportName], { allowErrors = false, timeout } = {}) {
      const deadline = timeout === undefined ? null : Date.now() + timeout;
      await page.setViewportSize(viewport);
      const state = await navigate(route, { allowErrors, waitUntil: "domcontentloaded" }, deadline);
      if (state.width !== viewport.width || state.height !== viewport.height) {
        throw new Error(
          `open ${route}: viewport is ${String(state.width)}x${String(state.height)}, not ${String(viewport.width)}x${String(viewport.height)}`,
        );
      }
      return state;
    },

    async click(rawTarget, { position, rest: restAfter = true, timeout = 15_000, minOpacity = 0.95 } = {}) {
      const target = asTarget(rawTarget);
      let point;
      try {
        point = await poll(`click ${describe(target)}`, { kind: "hit", target, minOpacity, offset: position }, timeout);
      } catch (error) {
        const last = await read(
          ({ probeTarget, threshold, offset }) =>
            /** @type {QaWindow} */ (window).__qa?.hitPoint(probeTarget, threshold, offset) ?? null,
          { probeTarget: target, threshold: minOpacity, offset: position },
        );
        const detail = last === null
          ? "no rendered element"
          : `(${String(Math.round(last.x))}, ${String(Math.round(last.y))}) hits ${String(last.covered)}`;
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`${reason}; last probe: ${detail}`, { cause: error });
      }
      await page.mouse.click(point.x, point.y);
      if (restAfter) await rest();
      return { x: point.x, y: point.y };
    },

    waitVisible,
    read,
    async waitFor(label, fn, arg, { timeout = 15_000, pollMs = 100, allowErrors = false } = {}) {
      const deadline = Date.now() + timeout;
      if (!allowErrors) await qa.assertCaps(label, { timeout });
      const dispose = async (/** @type {Awaited<ReturnType<QaPage["waitForFunction"]>> | null} */ handle) => {
        if (handle === null) return;
        try {
          await handle.dispose();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/Execution context was destroyed|Cannot find context with specified id/i.test(message)) throw error;
        }
      };
      for (;;) {
        /** @type {Awaited<ReturnType<QaPage["waitForFunction"]>> | null} */
        let handle = null;
        try {
          // Native waiting survives navigation and bounds async predicates.
          handle = await page.waitForFunction(fn, arg, { timeout: Math.max(1, deadline - Date.now()), polling: pollMs });
          const value = await handle.jsonValue();
          if (!allowErrors) await qa.assertCaps(label, { timeout: Math.max(1, deadline - Date.now()) });
          return /** @type {NonNullable<Awaited<ReturnType<typeof fn>>>} */ (value);
        } catch (error) {
          if (!allowErrors) assertObserved(label);
          const message = error instanceof Error ? error.message : String(error);
          // A reload can land between resolving the waiter and serializing
          // its handle too; every re-attachment keeps the original deadline.
          if (/Execution context was destroyed|Cannot find context with specified id/i.test(message) && Date.now() < deadline) continue;
          if (error instanceof Error && error.name === "TimeoutError") throw timeoutError(`${label}: ${message}`, error);
          throw new Error(`${label}: ${message}`, { cause: error });
        } finally {
          await dispose(handle);
        }
      }
    },
    async labStage(stage, { card = qa.args.card, variant = qa.args.variant ?? "base", as: side = "player", timeout = callDeadline === null ? 15_000 : Math.max(1, callDeadline - Date.now()) } = {}) {
      if (card === undefined || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(card)) throw new Error("qa.labStage requires a source card UUID");
      const encoded = JSON.stringify(stage);
      const deadline = Math.min(Date.now() + timeout, callDeadline ?? Date.now() + timeout);
      const remaining = () => {
        const budget = deadline - Date.now();
        if (budget <= 0) throw timeoutError("qa.labStage: call or explicit staging deadline expired");
        return budget;
      };
      await qa.open(`/?goto=card-lab&card=${encodeURIComponent(card)}&variant=${encodeURIComponent(variant)}&as=${side}&seed=1&debug=1&labStage=${encodeURIComponent(encoded)}`, qa.viewport, { timeout: remaining() });
      const report = await qa.waitFor("declared lab report", () =>
        /** @type {Window & { __cardLab?: { status: string, stage: string | null, reason: string | null, detail: string | null } }} */ (window).__cardLab ?? null,
      null, { timeout: remaining() });
      if (report.status !== "ready" || report.stage !== encoded) throw new Error(`qa.labStage rejected: ${report.reason ?? "request mismatch"} ${report.detail ?? ""}`);
      const initial = await qa.waitFor("declared lab initial physical board", () => {
        const probe = /** @type {Window & { __engineProbe?: { battleId: import("../../src/types/identifiers").BattleId, slice: import("../../src/engine/fold/slice").BattleSlice } }} */ (window).__engineProbe;
        const base = probe?.slice.history?.base.committed;
        return base === undefined || probe === undefined ? null : { battleId: probe.battleId, ...base };
      }, null, { timeout: remaining() });
      const physical = (/** @type {"player" | "enemy"} */ owner) => {
        const state = initial.sides[owner];
        const ids = { front: state.frontRank, back: state.backRank, hand: state.hand, void: state.void };
        const declared = stage[owner];
        if (declared?.energy !== undefined && (state.currentEnergy !== declared.energy || state.maxEnergy !== declared.energy)) throw new Error(`qa.labStage ${owner} energy mismatch`);
        for (const zone of /** @type {const} */ (["front", "back", "hand", "void"])) {
          const requested = declared?.[zone];
          if (requested === undefined) continue;
          if ((zone === "hand" || zone === "void") && ids[zone].length !== requested.length) throw new Error(`qa.labStage ${owner} ${zone} count mismatch`);
          for (const [index, entry] of requested.entries()) {
            const id = ids[zone][index];
            if (entry === null) { if (id !== null) throw new Error("qa.labStage rank hole mismatch"); continue; }
            const instance = id === null || id === undefined ? undefined : initial.instances[id];
            if (instance?.owner !== owner || instance.controller !== owner || instance.printing.kind !== "card" || instance.printing.cardId !== entry.toLowerCase()) throw new Error(`qa.labStage ${owner} ${zone}[${String(index)}] printing mismatch`);
          }
        }
        return ids;
      };
      const result = { battleId: initial.battleId, player: physical("player"), enemy: physical("enemy") };
      await qa.assertCaps("declared lab stage", { timeout: remaining() });
      qa.note("qa.labStage", result);
      return result;
    },
    async labAddCard(zone, side, uuid, { timeout = 15_000 } = {}) {
      if (!["hand", "play", "void"].includes(zone) || !["player", "enemy"].includes(side) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(uuid)) {
        throw new Error("qa.labAddCard: invalid zone, side, or card UUID");
      }
      const deadline = Date.now() + timeout;
      const remaining = () => Math.max(1, deadline - Date.now());
      const snapshot = () => read(() => {
        const probe = /** @type {Window & { __engineProbe?: { battleId: string, slice: { committed: { version: number, instances: Record<string, { id: string, owner: string, zone: string, printing: { kind: string, cardId?: string } }> }, inFlight: unknown } } }} */ (window).__engineProbe;
        if (probe === undefined) throw new Error("qa.labAddCard: missing engine probe (use debug=1)");
        return { battleId: probe.battleId, version: probe.slice.committed.version, instances: probe.slice.committed.instances, inFlight: probe.slice.inFlight !== null };
      }, null, { timeout: remaining() });
      const before = await snapshot();
      if (before.inFlight) throw new Error("qa.labAddCard: an intent is in flight");
      if (!(await qa.isVisible("[data-testid=engine-debug-panel]"))) await qa.click("[data-testid=engine-debug-open]", { timeout: remaining() });
      await qa.click(`[data-engine-debug-side] button:nth-of-type(${side === "player" ? "1" : "2"})`, { timeout: remaining() });
      const field = page.locator("[data-testid=engine-debug-card]");
      await field.fill(uuid, { timeout: remaining() });
      await qa.click("[data-engine-debug-zone] button", { timeout: remaining() });
      await qa.click(`[role=option][data-value="${zone}"]`, { timeout: remaining() });
      await qa.waitFor("qa.labAddCard fields", ({ side, zone }) =>
        document.querySelector("[data-engine-debug-side]")?.getAttribute("data-engine-debug-side") === side &&
        document.querySelector("[data-engine-debug-zone]")?.getAttribute("data-engine-debug-zone") === zone,
      { side, zone }, { timeout: remaining() });
      const still = await snapshot();
      if (still.battleId !== before.battleId || still.version !== before.version || still.inFlight ||
          JSON.stringify(still.instances) !== JSON.stringify(before.instances)) throw new Error("qa.labAddCard: battle changed while staging");
      await qa.click("[data-testid=engine-debug-add]", { timeout: remaining() });
      let instance = null;
      for (;;) {
        await qa.assertCaps("qa.labAddCard", { timeout: remaining() });
        const after = await snapshot();
        if (after.battleId !== before.battleId) throw new Error("qa.labAddCard: battle changed after submit");
        const added = Object.values(after.instances).filter((entry) => !(entry.id in before.instances) &&
          entry.owner === side && entry.zone === zone && entry.printing.kind === "card" && entry.printing.cardId === uuid);
        if (added.length > 1 || after.version > before.version + 1) throw new Error("qa.labAddCard: ambiguous concurrent changes");
        instance = after.inFlight ? null : added[0]?.id ?? null;
        if (instance !== null) break;
        if (Date.now() >= deadline) throw new Error("qa.labAddCard: timed out confirming the submitted intent; do not retry blindly");
        await page.waitForTimeout(Math.min(100, remaining()));
      }
      qa.note("qa.labAddCard", { uuid, side, zone, instance, battleId: before.battleId });
      return instance;
    },
    async isVisible(rawTarget, { minOpacity = 0.95 } = {}) {
      return read(
        ({ target, threshold }) => (/** @type {QaWindow} */ (window).__qa?.rendered(target, threshold) ?? null) !== null,
        { target: asTarget(rawTarget), threshold: minOpacity },
      );
    },
    rest,

    async capture(name, { fullPage = false, clip, element, pad = 0, minOpacity = 0.95 } = {}) {
      if (fullPage && (clip !== undefined || element !== undefined)) {
        throw new Error(`capture ${name}: fullPage takes no clip or element`);
      }
      if (element !== undefined) await waitVisible(element, { minOpacity });
      await qa.waitFor(`capture ${name}: images`, () => [...document.images].every((image) => {
        const rect = image.getBoundingClientRect();
        return rect.width === 0 || rect.height === 0 || rect.bottom <= 0 || rect.right <= 0 ||
          rect.top >= innerHeight || rect.left >= innerWidth || image.complete;
      }), null);
      await rest();
      const state = await readState();
      if (!onOrigin(state.href)) throw new Error(`capture ${name}: page is on ${state.href}, not ${origin}`);
      /** @type {Rect | undefined} */
      let region = clip;
      if (element !== undefined) {
        const target = asTarget(element);
        const box = await read(
          ({ probeTarget, threshold }) => {
            const found = /** @type {QaWindow} */ (window).__qa?.rendered(probeTarget, threshold) ?? null;
            if (found === null) return null;
            const rect = found.getBoundingClientRect();
            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          },
          { probeTarget: target, threshold: minOpacity },
        );
        if (box === null) throw new Error(`capture ${name}: ${describe(target)} is not rendered`);
        region = { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad };
      }
      if (region !== undefined) {
        const x = Math.max(0, Math.floor(region.x));
        const y = Math.max(0, Math.floor(region.y));
        const right = Math.min(state.width, Math.ceil(region.x + region.width));
        const bottom = Math.min(state.height, Math.ceil(region.y + region.height));
        if (right <= x || bottom <= y) throw new Error(`capture ${name}: ${JSON.stringify(region)} is outside the viewport`);
        region = { x, y, width: right - x, height: bottom - y };
      }
      const path = `${config.captureDir}/${name}.png`;
      await page.screenshot({ path, scale: "css", fullPage, ...(region === undefined ? {} : { clip: region }) });
      captures.push({ path, href: state.href, width: state.width, height: state.height, ...(region === undefined ? {} : { clip: region }) });
      return path;
    },

    async trace(name, fn, { longTaskMs = 50, top = 8 } = {}) {
      const cdp = await page.context().newCDPSession(page);
      /** @type {TraceEvent[]} */
      const events = [];
      cdp.on("Tracing.dataCollected", (/** @type {{ value: TraceEvent[] }} */ payload) => {
        for (const event of payload.value) events.push(event);
      });
      const complete = new Promise((done) => cdp.on("Tracing.tracingComplete", done));
      await cdp.send("Tracing.start", {
        transferMode: "ReportEvents",
        traceConfig: {
          recordMode: "recordAsMuchAsPossible",
          includedCategories: [
            "toplevel",
            "devtools.timeline",
            "disabled-by-default-devtools.timeline",
            "blink.user_timing",
            "v8.execute",
            "disabled-by-default-v8.cpu_profiler",
          ],
        },
      });
      const mark = `qa-trace:${name}`;
      /** @type {{ start: number | null }} */
      const marks = { start: null };
      /** @type {unknown} */
      let value;
      try {
        marks.start = await read((label) => performance.mark(`${label}:start`).startTime, mark);
        value = await fn();
        await read((label) => {
          performance.mark(`${label}:end`);
        }, mark);
      } finally {
        await cdp.send("Tracing.end");
        await complete;
        await cdp.detach();
      }
      const summary = summarizeTrace(name, events, marks, { longTaskMs, top });
      traces.push(summary);
      return /** @type {any} */ ({ ...summary, value });
    },

    async caps() {
      const state = await readState();
      mergeCaps(state);
      if (observed.size === 0) return state.caps;
      /** @type {Caps} */
      const merged = { errors: [], rejections: [], consoleErrors: [] };
      for (const entry of observed.values()) {
        merged.errors.push(...entry.caps.errors);
        merged.rejections.push(...entry.caps.rejections);
        merged.consoleErrors.push(...entry.caps.consoleErrors);
      }
      return merged;
    },

    async assertCaps(label, { timeout = 15_000 } = {}) {
      assertObserved(label);
      const state = await readState(timeout);
      if (state.caps === null) throw new Error(`${label}: __caps init script is missing`);
      if (capsCount(state.caps) > 0) throw new Error(`${label}: __caps ${JSON.stringify(state.caps)}`);
    },

    note(label, data) {
      log.push(data === undefined ? { label } : { label, data });
    },

    sleep: (ms) => page.waitForTimeout(ms),

    gameLog,

    async finish(result, error) {
      try {
        const last = step === steps - 1 || error !== null;
        /** @type {{ gameLog?: GameLogRead }} */
        const exported = {};
        // Before the caps read, which may fail on a broken page: the log is
        // what explains the failure.
        if (last && config.exportGameLog === true) {
          try {
            exported.gameLog = await readGameLog();
          } catch (failure) {
            exported.gameLog = { gameId: null, selectedBy: null, lines: [], reason: `log read failed: ${failure instanceof Error ? failure.message : String(failure)}` };
          }
        }
        if (last) await recordCaps();
        return { result, error, log, captures, caps: [...observed.values()], traces, ...exported };
      } finally {
        page.off("console", consoleMessage);
      }
    },
  };
  return { ...qa, battle: createBattleDriver(qa) };
}

/**
 * The battle driver behind `qa.battle`. It reads the battle from the
 * screen's data attributes, and from `window.__engineProbe` when the URL
 * carries `debug=1`, and acts only through the pointer, as a player would.
 * The runner sends its source beside `createQa`'s, so it reads nothing else
 * from this module's scope.
 *
 * @param {Omit<Qa, "battle">} qa
 * @returns {BattleDriver}
 */
export function createBattleDriver(qa) {
  const page = qa.page;
  const PASS = "[data-battle-phase-next] button";
  const SUBMIT = "[data-testid=battle-card-picker-submit]";
  const SKIP = "[data-testid=battle-card-picker-skip]";
  /** @type {Record<Exclude<BattleSurface, "gallery" | "board" | "target">, string>} */
  const CONTROLS = {
    foresee: "[data-testid=battle-foresee-confirm]",
    arrange: "[data-testid=battle-arrange-confirm]",
    number: "[data-testid=battle-number-picker-submit]",
    choice: "[data-battle-choice-prompt-controls] [data-testid=battle-choice-prompt-option-0]",
  };
  /** How long an action waits for the battle to show its effect. */
  const SETTLE_MS = 10_000;

  /** @type {BattleDriver["state"]} */
  const state = () =>
    qa.read(
      ({ pass, submit, skip, controls }) => {
        const win = /** @type {QaWindow & { __engineProbe?: EngineProbeView }} */ (window);
        const dom = win.__qa;
        /** @param {string} selector */
        const shown = (selector) => dom?.rendered({ selector }, 0.95) ?? null;
        /** @param {Element | null} element */
        const enabled = (element) =>
          element !== null && !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true";

        const indicator = document.querySelector("[data-battle-phase]");
        const phase = indicator?.getAttribute("data-battle-phase") ?? null;
        const rawSide = indicator?.getAttribute("data-battle-side") ?? null;
        const side = rawSide === "near" || rawSide === "far" ? rawSide : null;

        // The phase button's row also holds a choice prompt's options or a number picker.
        const next = document.querySelector("[data-battle-phase-next]");
        const passRow =
          next !== null &&
          !next.hasAttribute("data-battle-choice-prompt-controls") &&
          next.querySelector("[data-battle-number-picker]") === null;
        const passHit = passRow ? (dom?.hitPoint({ selector: pass }, 0.95) ?? null) : null;
        const canPass = passHit !== null && passHit.covered === null && enabled(shown(pass));

        /** @type {Array<[BattleSurface, string]>} */
        const surfaces = [
          ["foresee", controls.foresee],
          ["arrange", controls.arrange],
          ["number", controls.number],
          ["choice", controls.choice],
          ["gallery", "[data-battle-card-picker-gallery]"],
          ["board", "[data-battle-card-picker-controls]"],
          ["target", "[data-battle-targeting-card-stage]"],
        ];
        let surface = surfaces.find(([, selector]) => shown(selector) !== null) ?? null;
        /** @type {string[]} */
        let rendered = [];
        if (surface?.[0] === "gallery") {
          rendered = [...document.querySelectorAll("[data-battle-card-picker-gallery] [data-testid^='battle-card-picker-candidate-']")]
            .map((element) => (element.getAttribute("data-testid") ?? "").replace("battle-card-picker-candidate-", ""));
        } else if (surface?.[0] === "board") {
          rendered = [...document.querySelectorAll("[data-battle-card-picker-candidate=true]")]
            .map((element) =>
              element.getAttribute("data-battle-card-id") ??
              element.querySelector("[data-battle-card-id]")?.getAttribute("data-battle-card-id") ??
              element.getAttribute("data-battle-slot-id") ??
              "")
            .filter((id) => id !== "");
        }

        const probe = win.__engineProbe;
        /** @type {BattleProbeState | null} */
        const probed = probe === undefined
          ? null
          : {
              decision: probe.decision === null ? null : { kind: probe.decision.kind, side: probe.decision.side },
              pending: probe.pending === null
                ? null
                : { kind: probe.pending.kind, side: probe.pending.side, id: probe.pending.id, candidates: [...(probe.pending.candidates ?? [])] },
              stack: probe.slice.committed.stack.length,
              inFlight: probe.slice.inFlight !== null,
              ended: probe.slice.committed.result !== null,
              scores: Object.fromEntries(Object.entries(probe.slice.committed.sides).map(([key, value]) => [key, value.score])),
              scoreToWin: probe.slice.committed.config.scoreToWin,
              events: probe.events.length,
            };

        // With the probe, the player owes a prompt exactly when the engine says so.
        const owed = probed?.pending?.side === "player" ? probed.pending : null;
        // Activated single-target choices use the visible banner and legal
        // battlefield controls, without a card-play source stage.
        /** @type {string[] | null} */
        let inlineTargets = null;
        const banner = shown("[data-battle-prompt-banner]");
        if (surface === null && owed?.kind === "chooseTargets" &&
            banner?.getAttribute("data-battle-prompt-id") === owed.id) {
          inlineTargets = owed.candidates.filter((id) => {
            const selector = `[data-battlefield-card][data-battle-card-id="${id}"]`;
            const card = shown(selector);
            const hit = dom?.hitPoint({ selector }, 0.95) ?? null;
            return enabled(card) && card?.getAttribute("role") === "button" &&
              card.closest("[data-battle-rank]") !== null && hit !== null && hit.covered === null;
          });
          if (inlineTargets.length > 0) surface = ["target", "[data-battle-prompt-banner]"];
        }
        /** @type {BattlePrompt | null} */
        let prompt = null;
        if (probed === null ? surface !== null : owed !== null) {
          const candidates = inlineTargets ?? (owed !== null && owed.candidates.length > 0 ? owed.candidates : rendered);
          prompt = {
            surface: surface?.[0] ?? null,
            kind: owed?.kind ?? surface?.[0] ?? null,
            id: owed?.id ?? document.querySelector("[data-battle-prompt-banner]")?.getAttribute("data-battle-prompt-id") ?? null,
            candidates,
            answerable: surface === null
              ? false
              : surface[0] === "target"
                ? candidates.length > 0
                : surface[0] === "gallery" || surface[0] === "board"
                  ? candidates.length > 0 || enabled(shown(submit)) || enabled(shown(skip))
                  : enabled(shown(surface[1])),
          };
        }

        /** @type {"main" | "respond" | null} */
        let passWindow = null;
        if (probed !== null) {
          const kind = probed.decision?.side === "player" ? probed.decision.kind : null;
          passWindow = kind === "main" || kind === "respond" ? kind : null;
        } else if (canPass) {
          passWindow = side === "far" ? "respond" : "main";
        }
        const result = document.querySelector("[data-battle-result-surface]")?.getAttribute("data-battle-result-surface") ?? null;
        const caps = win.__caps;
        return {
          phase,
          side,
          at: side === null || phase === null ? null : `${side}:${phase}`,
          prompt,
          window: passWindow,
          canPass,
          waiting: document.querySelector("[data-battle-prompt-waiting]")?.getAttribute("data-battle-prompt-waiting") ?? null,
          result: result === "victory" || result === "defeat" ? result : null,
          board: [...document.querySelectorAll("[data-battle-card-id]")]
            .map((element) => {
              const rank = element.closest("[data-battle-rank]")?.getAttribute("data-battle-rank");
              const row = element.closest("[data-battle-mobile-row]")?.getAttribute("data-battle-mobile-row");
              return `${String(element.getAttribute("data-battle-card-id"))}@${String(rank ?? row ?? element.getAttribute("data-battle-card-zone"))}`;
            })
            .sort()
            .join(","),
          probe: probed,
          caps: caps === undefined ? 0 : caps.errors.length + caps.rejections.length + caps.consoleErrors.length,
        };
      },
      { pass: PASS, submit: SUBMIT, skip: SKIP, controls: CONTROLS },
    );

  /**
   * What changes when the battle moves on; the phase button's enabled state
   * does not count, so a press the screen ignores is no progress.
   *
   * @param {BattleState} battle
   */
  const progressKey = (battle) =>
    JSON.stringify([
      battle.at,
      battle.prompt === null ? null : [battle.prompt.surface, battle.prompt.id],
      battle.waiting,
      battle.result,
      battle.board,
      battle.probe === null
        ? null
        : [battle.probe.events, battle.probe.stack, battle.probe.decision, battle.probe.pending?.id ?? null],
    ]);

  /** @param {BattleState} battle */
  const describe = (battle) =>
    JSON.stringify({
      at: battle.at,
      prompt: battle.prompt,
      window: battle.window,
      canPass: battle.canPass,
      waiting: battle.waiting,
      result: battle.result,
      probe: battle.probe === null ? null : { ...battle.probe, scores: undefined },
    });

  /**
   * @param {BattleState} battle
   * @param {string} label
   */
  const failOnCaps = async (battle, label) => {
    await qa.assertCaps(`${label} at ${describe(battle)}`);
  };

  /**
   * Reads the battle until its progress key leaves `before`; false after `timeout`.
   *
   * @param {string} before
   * @param {number} timeout
   * @param {string} label
   */
  const settle = async (before, timeout, label) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      const battle = await state();
      await failOnCaps(battle, label);
      if (progressKey(battle) !== before) return true;
      if (Date.now() >= deadline) return false;
      await qa.sleep(100);
    }
  };

  /** @type {BattleDriver["tap"]} */
  const tap = async (selector) => {
    const point = await qa.read((target) => {
      const element = document.querySelector(target);
      if (element === null) return null;
      const box = element.getBoundingClientRect();
      for (const fy of [0.5, 0.3, 0.7, 0.15]) {
        for (let x = Math.max(1, box.left + 4); x < Math.min(innerWidth - 1, box.right); x += 4) {
          const y = Math.min(innerHeight - 2, box.top + box.height * fy);
          const hit = document.elementFromPoint(x, y);
          if (hit !== null && element.contains(hit)) return { x, y };
        }
      }
      return null;
    }, selector);
    if (point === null) return false;
    await page.mouse.click(point.x, point.y);
    await qa.rest();
    return true;
  };

  /** @param {string} selector */
  const enabledControl = (selector) =>
    qa.read((target) => {
      const element = /** @type {QaWindow} */ (window).__qa?.rendered({ selector: target }, 0.95) ?? null;
      return element !== null && element.getAttribute("aria-disabled") !== "true" && !element.hasAttribute("disabled");
    }, selector);

  /** Candidate taps per prompt, so a prompt that wants more than one card takes the next. */
  /** @type {Map<string, number>} */
  const taps = new Map();

  /** @type {BattleDriver["answer"]} */
  const answer = async (given) => {
    const battle = given ?? (await state());
    const prompt = battle.prompt;
    if (prompt === null || prompt.surface === null) return false;
    const before = progressKey(battle);
    if (prompt.surface === "gallery" || prompt.surface === "board" || prompt.surface === "target") {
      const key = `${String(prompt.id)}:${prompt.surface}:${String(battle.at)}`;
      const count = taps.get(key) ?? 0;
      const candidate = prompt.candidates[count % Math.max(1, prompt.candidates.length)];
      let tapped = false;
      if (candidate !== undefined) {
        taps.set(key, count + 1);
        for (const selector of [
          `[data-testid="battle-card-picker-candidate-${candidate}"]`,
          `[data-battlefield-card][data-battle-card-id="${candidate}"]`,
          `[data-battle-card-id="${candidate}"]`,
          `[data-battle-slot-id="${candidate}"]`,
        ]) {
          if (selector.startsWith("[data-testid") && !(await enabledControl(selector))) continue;
          if (await tap(selector)) {
            tapped = true;
            break;
          }
        }
        await qa.sleep(250);
      }
      if (await enabledControl(SUBMIT)) {
        await qa.click(SUBMIT);
      } else if (!tapped && (await enabledControl(SKIP))) {
        await qa.click(SKIP);
      } else {
        // A target is taken on the tap; a picker that wants another card shows no progress.
        if (tapped) await settle(before, 2_000, `answer ${prompt.surface}`);
        return tapped;
      }
    } else {
      const control = CONTROLS[prompt.surface];
      if (!(await enabledControl(control))) return false;
      await qa.click(control);
    }
    await settle(before, SETTLE_MS, `answer ${prompt.surface}`);
    return true;
  };

  /** @type {BattleDriver["pass"]} */
  const pass = async (given) => {
    const battle = given ?? (await state());
    if (!battle.canPass) return false;
    const before = progressKey(battle);
    try {
      await qa.click(PASS, { timeout: 5_000 });
    } catch {
      // Covered or gone since the read (an overlay, the turn moving on): the caller reads again.
      return false;
    }
    return settle(before, SETTLE_MS, `pass at ${String(battle.at)}`);
  };

  /** @type {BattleDriver["playUntil"]} */
  const playUntil = async (predicate, { timeout = 120_000, stallMs = 45_000, pollMs = 100, label = "playUntil", before, passWhen = () => true } = {}) => {
    const started = Date.now();
    /** @type {BattleRun} */
    const run = { label, history: [], turns: 0, passes: 0, responds: 0, answers: 0, ms: 0 };
    let lastKey = "";
    let lastProgress = started;
    let lastAction = "none";
    let lastRespond = "";
    /** @type {number | null} */
    let endedAt = null;
    /** @param {string} reason @param {BattleState} battle */
    const fail = (reason, battle) =>
      new Error(`qa.battle ${label}: ${reason}; last action ${lastAction}; ${describe(battle)}; history ${run.history.slice(-10).join(" > ")}`);
    for (;;) {
      const battle = await state();
      await failOnCaps(battle, `qa.battle ${label}`);
      const previous = run.history[run.history.length - 1];
      if (battle.at !== null && battle.at !== previous) {
        if (previous !== undefined && !previous.startsWith(`${String(battle.side)}:`)) run.turns += 1;
        run.history.push(battle.at);
      }
      const key = progressKey(battle);
      if (key !== lastKey) {
        lastKey = key;
        lastProgress = Date.now();
      }
      run.ms = Date.now() - started;
      if (await predicate(battle, run)) {
        qa.note(`qa.battle ${label}`, { ...run });
        return { ...run, state: battle };
      }
      // The result surface ends the battle; the predicate gets a few reads to see it.
      endedAt = battle.result === null ? null : (endedAt ?? Date.now());
      if (endedAt !== null) {
        if (Date.now() - endedAt > 3_000) throw fail(`the battle ended in ${String(battle.result)} first`, battle);
        await qa.sleep(pollMs);
        continue;
      }
      if (Date.now() - started > timeout) throw qa.timeoutError(fail(`timed out after ${String(timeout)} ms`, battle).message);
      if (Date.now() - lastProgress > stallMs) throw fail(`stalled: no progress for ${String(stallMs)} ms`, battle);
      if (before !== undefined && (await before(battle, run))) {
        lastAction = "the scenario's own";
        lastProgress = Date.now();
        continue;
      }
      // A prompt the player owes is answered, never passed; its control may still be presenting.
      if (battle.prompt !== null) {
        if (battle.prompt.answerable && (await answer(battle))) {
          run.answers += 1;
          lastAction = `answer ${String(battle.prompt.kind)} at ${String(battle.at)}`;
        } else {
          await qa.sleep(pollMs);
        }
        continue;
      }
      if (battle.canPass && passWhen(battle)) {
        run.passes += 1;
        if (battle.window === "respond" && battle.side === "far" && key !== lastRespond) {
          run.responds += 1;
          lastRespond = key;
        }
        lastAction = `pass (${String(battle.window)}) at ${String(battle.at)}`;
        await pass(battle);
        continue;
      }
      await qa.sleep(pollMs);
    }
  };

  /** @type {BattleDriver["waitFor"]} */
  const waitFor = async (predicate, { timeout = 60_000, pollMs = 150, label = "waitFor" } = {}) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      const battle = await state();
      await failOnCaps(battle, `qa.battle ${label}`);
      if (await predicate(battle)) return battle;
      if (Date.now() > deadline) throw qa.timeoutError(`qa.battle ${label}: timed out after ${String(timeout)} ms; ${describe(battle)}`);
      await qa.sleep(pollMs);
    }
  };

  /**
   * The page-side read behind `events` and `waitForEvents`: self-contained,
   * since it is evaluated in the page. With `count` above 0 it returns
   * `null` until that many events match, so a wait keeps polling; a missing
   * probe or another battle returns an `error` at once.
   *
   * @param {{ cursor: EventCursor | null, match: EventMatch, limit: number, count: number }} request
   * @returns {(EventPage & { error?: undefined }) | { error: string } | null}
   */
  const observeEvents = ({ cursor, match, limit, count }) => {
    const probe = /** @type {Window & { __engineProbe?: EngineProbeView }} */ (window).__engineProbe;
    if (probe === undefined) return { error: "missing engine probe (use debug=1)" };
    if (cursor !== null && probe.battleId !== cursor.battleId) {
      return { error: `the probe shows battle ${probe.battleId}, not the cursor's ${cursor.battleId}` };
    }
    /** @type {(a: unknown, b: unknown) => boolean} */
    const equal = (a, b) => {
      if (a === b) return true;
      if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
      const left = /** @type {Record<string, unknown>} */ (a);
      const right = /** @type {Record<string, unknown>} */ (b);
      const keys = Object.keys(left);
      return keys.length === Object.keys(right).length && keys.every((key) => key in right && equal(left[key], right[key]));
    };
    const fresh = probe.events.filter((entry) =>
      cursor === null || entry.seq > cursor.seq || (entry.seq === cursor.seq && entry.index > cursor.index));
    const matching = fresh.filter((entry) => {
      const event = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (entry.event));
      return Object.entries(match).every(([key, value]) => equal(event[key], value));
    });
    if (count > 0 && matching.length < count) return null;
    const page = matching.slice(0, limit);
    const more = matching.length > limit;
    const instances = probe.slice.committed.instances;
    // The instances an event field names: an instance id, or a list of them.
    /**
     * @param {unknown} value
     * @returns {import("../../src/engine/state/ids").InstanceId[]}
     */
    const named = (value) => {
      /** @type {unknown[]} */
      const items = Array.isArray(value) ? value : [value];
      return /** @type {import("../../src/engine/state/ids").InstanceId[]} */ (
        items.filter((item) => typeof item === "string" && /^i\d+$/.test(item) && item in instances));
    };
    const events = page.map((entry) => {
      /** @type {ObservedEvent["cards"]} */
      const cards = {};
      for (const value of Object.values(entry.event)) {
        for (const id of named(value)) {
          const printing = instances[id]?.printing;
          cards[id] = printing?.kind === "card" ? printing.cardId ?? null : null;
        }
      }
      return { ...entry, cards };
    });
    const last = more ? page[page.length - 1] : fresh[fresh.length - 1];
    return {
      events,
      more,
      cursor: last === undefined
        ? cursor ?? { battleId: probe.battleId, seq: -1, index: -1 }
        : { battleId: probe.battleId, seq: last.seq, index: last.index },
    };
  };

  /** @param {number} limit */
  const boundedLimit = (limit) => {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error(`qa.battle.events: limit ${String(limit)} is not 1 to 500`);
    return limit;
  };

  /** @type {BattleDriver["eventCursor"]} */
  const eventCursor = async () => {
    const cursor = await qa.read(() => {
      const probe = /** @type {Window & { __engineProbe?: EngineProbeView }} */ (window).__engineProbe;
      if (probe === undefined) return null;
      const last = probe.events[probe.events.length - 1];
      return { battleId: probe.battleId, seq: last?.seq ?? -1, index: last?.index ?? -1 };
    }, null);
    if (cursor === null) throw new Error("qa.battle.eventCursor: missing engine probe (use debug=1)");
    return cursor;
  };

  /** @type {BattleDriver["events"]} */
  const events = async (cursor, options = {}) => {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new Error("qa.battle.events: options must be a non-null, non-array object; use { match: { ... }, limit }");
    }
    const unknown = Reflect.ownKeys(options).find((key) => key !== "match" && key !== "limit");
    if (unknown !== undefined) {
      throw new Error(`qa.battle.events: unknown options field ${String(unknown)}; event fields belong in match`);
    }
    const { match = {}, limit = 100 } = options;
    if (match === null || typeof match !== "object" || Array.isArray(match)) {
      throw new Error("qa.battle.events: match must be a non-null, non-array object");
    }
    const page = await qa.read(observeEvents, { cursor, match, limit: boundedLimit(limit), count: 0 });
    if (page === null || page.error !== undefined) throw new Error(`qa.battle.events: ${page?.error ?? "no observation"}`);
    return page;
  };

  /** @type {BattleDriver["waitForEvents"]} */
  const waitForEvents = async (cursor, match, { count = 1, limit = 100, timeout = 15_000, label = `qa.battle.waitForEvents ${JSON.stringify(match)}` } = {}) => {
    if (!Number.isSafeInteger(count) || count < 1) throw new Error(`${label}: count ${String(count)} is not a positive integer`);
    const page = await qa.waitFor(label, observeEvents, { cursor, match, limit: boundedLimit(Math.max(limit, count)), count }, { timeout });
    if (page.error !== undefined) throw new Error(`${label}: ${page.error}`);
    qa.note(label, { cursor, keys: page.events.map(({ seq, index }) => [seq, index]) });
    return page;
  };

  /**
   * The page-side read behind `promptOrAutoAnswer`: the pending prompt's
   * owner and purpose role, and the forced answer of the auto-answered event
   * keyed `key` while its step is in flight. The in-flight step's published
   * events are the probe's last `publishedEvents`, and their auto-answered
   * events pair in order with the record's automatic answers; any mismatch
   * (a reload's partial history) reports no answer.
   *
   * @param {{ key: { seq: number, index: number } | null }} request
   */
  const observeOwed = ({ key }) => {
    const probe = /** @type {Window & { __engineProbe?: EngineProbeView }} */ (window).__engineProbe;
    if (probe === undefined) return null;
    const pending = probe.pending === null
      ? null
      : { id: probe.pending.id, side: probe.pending.side, role: probe.pending.purpose?.role ?? null };
    /** @type {import("../../src/engine").Answer | null} */
    let answer = null;
    const { inFlight, publishedEvents } = probe.slice;
    if (key !== null && inFlight !== null && publishedEvents > 0 && probe.events.length >= publishedEvents) {
      const auto = probe.events.slice(-publishedEvents).filter((entry) => entry.kind === "promptAutoAnswered");
      const recorded = inFlight.answers.filter((entry) => entry.auto === true);
      const at = auto.findIndex((entry) => entry.seq === key.seq && entry.index === key.index);
      if (at >= 0 && auto.length === recorded.length) answer = recorded[at]?.value ?? null;
    }
    return { pending, answer };
  };

  /** @type {BattleDriver["promptOrAutoAnswer"]} */
  const promptOrAutoAnswer = async ({ role, since, timeout = 15_000, pollMs = 100, label = `qa.battle.promptOrAutoAnswer ${String(role)}` }) => {
    const given = /** @type {unknown} */ (role);
    if (typeof given !== "string" || given === "") throw new Error(`${label}: role must be a prompt purpose role`);
    if (since === undefined) throw new Error(`${label}: since must be an event cursor, or null for every recorded event`);
    const deadline = Date.now() + timeout;
    /** The player's auto-answered events after `cursor`, a page at a time. */
    const read = async (/** @type {EventCursor | null} */ cursor) => {
      const page = await qa.read(observeEvents, { cursor, match: { kind: "promptAutoAnswered", side: "player" }, limit: 500, count: 0 });
      if (page?.error === "missing engine probe (use debug=1)") return null;
      if (page === null || page.error !== undefined) throw new Error(`${label}: ${page?.error ?? "no observation"}`);
      return page;
    };
    /** @param {EventPage} page */
    const pick = (page) => page.events.find(({ event }) => event.kind === "promptAutoAnswered" && event.purpose.role === role) ?? null;
    for (;;) {
      const battle = await state();
      await failOnCaps(battle, label);
      let page = await read(since);
      let found = page === null ? null : pick(page);
      while (found === null && page !== null && page.more) {
        page = await read(page.cursor);
        found = page === null ? null : pick(page);
      }
      const owed = page === null ? null : await qa.read(observeOwed, { key: found === null ? null : { seq: found.seq, index: found.index } });
      if (found !== null && page !== null && owed !== null) {
        const cursor = { battleId: page.cursor.battleId, seq: found.seq, index: found.index };
        qa.note(label, { outcome: "autoAnswered", key: [found.seq, found.index], answer: owed.answer });
        return { outcome: "autoAnswered", event: found, answer: owed.answer, cursor };
      }
      const prompt = battle.prompt;
      if (page !== null && owed !== null && prompt !== null && prompt.answerable && owed.pending !== null && owed.pending.side === "player" &&
          owed.pending.role === role && owed.pending.id === prompt.id) {
        qa.note(label, { outcome: "rendered", id: prompt.id, surface: prompt.surface });
        return { outcome: "rendered", prompt, state: battle, cursor: page.cursor };
      }
      if (Date.now() >= deadline) {
        throw qa.timeoutError(`${label}: timed out after ${String(timeout)} ms with neither a rendered ${String(role)} prompt nor its auto-answer; ${describe(battle)}`);
      }
      await qa.sleep(pollMs);
    }
  };

  /** @type {BattleDriver["enterFirstBattle"]} */
  const enterFirstBattle = async ({ seed = "1", query = "", atFrontDoor } = {}) => {
    await qa.open(`/?seed=${seed}${query === "" ? "" : `&${query}`}`);
    const choose = "[data-journey-screen=journeyStart] button[data-glass-variant=accent]";
    await qa.waitVisible(choose);
    if (atFrontDoor !== undefined) await atFrontDoor();
    await qa.click(choose);
    await qa.click("[role=dialog] button[data-glass-variant=accent]");
    await qa.waitVisible("[data-journey-screen=dreamscape] [data-site-type]");

    // Visit every open site; the Battle site opens once the others are visited.
    const openSite = "[data-journey-screen=dreamscape] [data-site-type][data-interactive=true]";
    /** @type {Array<string | null>} */
    const sites = [];
    for (let visit = 0; visit < 12; visit++) {
      await qa.waitVisible(openSite);
      const site = await qa.read(
        (selector) => document.querySelector(selector)?.getAttribute("data-site-type") ?? null,
        openSite,
      );
      sites.push(site);
      const path = page.url();
      await qa.click(`${openSite}[data-site-type=${String(site)}]`);
      if (site === "Battle") break;
      await page.waitForFunction((from) => location.href !== from, path, { timeout: 10_000 });
      if (site === "Draft") {
        const pick = "[data-journey-screen=site] [role=button][data-card-id]";
        while (page.url().includes("/draft")) {
          const length = await qa.read(() => document.body.innerText.length, null);
          await qa.click(pick);
          await page.waitForFunction(
            (was) => !location.pathname.endsWith("/draft") || document.body.innerText.length !== was,
            length,
            { timeout: 10_000 },
          );
          await qa.sleep(400);
        }
      } else if (site === "DreamsignRevelation") {
        await qa.click("[data-testid=dreamsign-revelation-art-0]");
      } else if (site === "Purge") {
        await qa.click("[data-testid=cumulus-purge-header-action]");
      } else {
        throw new Error(`qa.battle enterFirstBattle: no route through a ${String(site)} site`);
      }
      await page.waitForFunction(() => /\/dreamscape\/[^/]+$/.test(location.pathname), null, { timeout: 10_000 });
    }
    qa.note("qa.battle enterFirstBattle", { sites });
    await qa.click("[data-testid=cumulus-battle-start-begin]");
    await qa.waitVisible(PASS, { timeout: 30_000 });
    return { sites };
  };

  return { state, pass, answer, tap, playUntil, waitFor, eventCursor, events, waitForEvents, promptOrAutoAnswer, enterFirstBattle };
}
