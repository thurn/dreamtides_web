// The helper prelude of `scripts/qa/run-scenario.mjs`. The runner sends
// `createQa`'s source, with the scenario's, to the Playwright MCP's
// `browser_run_code_unsafe`, so both run inside the MCP server process with a
// Playwright `page`. `createQa` therefore reads nothing from this module's
// scope, and the MCP's code sandbox has no `URL` global.

/**
 * The error buffer the init script installs on every document.
 *
 * @typedef {{ errors: string[], rejections: string[], consoleErrors: string[] }} Caps
 */

/** @typedef {{ width: number, height: number }} Viewport */

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

/** @typedef {Window & { __caps?: Caps, __qa?: QaDom }} QaWindow */

/**
 * The part of Playwright's `Page` the prelude and scenarios use. `locator`
 * and `getByRole` stay loose: scenarios may reach for any locator API.
 *
 * @typedef {object} QaPage
 * @property {(url: string, options?: { waitUntil?: "load" | "domcontentloaded" | "networkidle", timeout?: number }) => Promise<unknown>} goto
 * @property {() => string} url
 * @property {(size: Viewport) => Promise<void>} setViewportSize
 * @property {(script: () => void) => Promise<void>} addInitScript
 * @property {<R, A>(fn: (arg: A) => R | Promise<R>, arg: A) => Promise<R>} evaluate
 * @property {<A>(fn: (arg: A) => unknown, arg: A, options?: { timeout?: number, polling?: number | "raf" }) => Promise<{ jsonValue(): Promise<unknown> }>} waitForFunction
 * @property {(ms: number) => Promise<void>} waitForTimeout
 * @property {(selector: string, options?: { state?: "attached" | "visible" | "hidden" | "detached", timeout?: number }) => Promise<unknown>} waitForSelector
 * @property {(options: { path: string, scale?: "css" | "device", fullPage?: boolean }) => Promise<unknown>} screenshot
 * @property {{ click(x: number, y: number): Promise<void>, move(x: number, y: number, options?: { steps?: number }): Promise<void>, down(): Promise<void>, up(): Promise<void> }} mouse
 * @property {(selector: string) => any} locator
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
 * @property {Record<string, string>} args `--arg key=value` pairs.
 * @property {ViewportName} [viewport] The viewport this pass runs at (default `desktop`).
 * @property {number} [step] This call's step index (default 0).
 * @property {number} [steps] The scenario's step count (default 1).
 * @property {unknown} [carry] What the previous step of this viewport returned (default `null`).
 */

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
 * @property {(route: string, options?: { allowErrors?: boolean, waitUntil?: "load" | "domcontentloaded" | "networkidle" }) => Promise<{ href: string, width: number, height: number }>} goto
 *   Loads `route` (resolved by `url`) at the current viewport, and asserts
 *   the origin and an empty `__caps` (unless `allowErrors`). The buffer of
 *   the document it leaves goes into the report.
 * @property {(route: string, viewport?: Viewport, options?: { allowErrors?: boolean }) => Promise<{ href: string, width: number, height: number }>} open
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
 * @property {(label: string) => Promise<void>} assertCaps Throws unless `__caps` is empty.
 * @property {(label: string, data?: unknown) => void} note Adds a line to the report's log.
 * @property {(ms: number) => Promise<void>} sleep
 * @property {(result: unknown, error: string | null) => Promise<QaResult>} finish
 *   The call's report. The current document's buffer goes into it only at
 *   the scenario's last step or on an error: a later step reads the same
 *   document.
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
  /** @type {QaResult["caps"]} */
  const capsLog = [];
  /** @type {TraceSummary[]} */
  const traces = [];

  // Every call of a run (each step, each card of a sweep) adds this script
  // again; the first to run on a document installs the buffer.
  await page.addInitScript(() => {
    const qaWindow = /** @type {QaWindow} */ (window);
    if (qaWindow.__caps !== undefined) return;
    /** @type {Caps} */
    const caps = { errors: [], rejections: [], consoleErrors: [] };
    qaWindow.__caps = caps;
    addEventListener("error", (event) => {
      caps.errors.push(String(event.message));
    });
    addEventListener("unhandledrejection", (event) => {
      const reason = /** @type {unknown} */ (event.reason);
      caps.rejections.push(reason instanceof Error ? String(reason.stack ?? reason) : String(reason));
    });
    const original = console.error;
    console.error = (/** @type {unknown[]} */ ...args) => {
      caps.consoleErrors.push(args.map(String).join(" | "));
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

  /** @param {Caps | null} caps */
  const capsCount = (caps) =>
    caps === null ? 0 : caps.errors.length + caps.rejections.length + caps.consoleErrors.length;

  const readState = () =>
    page.evaluate(
      () => ({
        href: location.href,
        width: innerWidth,
        height: innerHeight,
        caps: /** @type {QaWindow} */ (window).__caps ?? null,
      }),
      null,
    );

  // Records the current document's buffer before a navigation replaces it.
  const recordCaps = async () => {
    if (!onOrigin(page.url())) return;
    const state = await readState();
    if (state.caps !== null && capsCount(state.caps) > 0) {
      capsLog.push({ href: state.href, caps: state.caps });
    }
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
      const outcome = await page.evaluate(({ kind, target, minOpacity, offset }) => {
        const qaWindow = /** @type {QaWindow} */ (window);
        const caps = qaWindow.__caps;
        if (caps !== undefined && caps.errors.length + caps.rejections.length > 0) {
          return { caps: JSON.stringify(caps), point: null };
        }
        const dom = qaWindow.__qa;
        if (dom === undefined) return { caps: null, point: null };
        if (kind === "rendered") {
          return { caps: null, point: dom.rendered(target, minOpacity) === null ? null : { x: 0, y: 0, covered: null } };
        }
        const hit = dom.hitPoint(target, minOpacity, offset);
        return { caps: null, point: hit !== null && hit.covered === null ? hit : null };
      }, probe);
      if (outcome.caps !== null) throw new Error(`${label}: __caps recorded ${outcome.caps}`);
      if (outcome.point !== null) return outcome.point;
      if (Date.now() >= deadline) throw new Error(`${label}: timed out after ${String(timeout)} ms`);
      await page.waitForTimeout(100);
    }
  };

  /** @type {Qa["waitVisible"]} */
  const waitVisible = async (rawTarget, { timeout = 15_000, minOpacity = 0.95 } = {}) => {
    const target = asTarget(rawTarget);
    await poll(`waitVisible ${describe(target)}`, { kind: "rendered", target, minOpacity }, timeout);
  };

  /** @type {Qa["goto"]} */
  const goto = async (route, { allowErrors = false, waitUntil = "load" } = {}) => {
    await recordCaps();
    await page.goto(url(route), { waitUntil });
    const state = await readState();
    if (!onOrigin(state.href)) throw new Error(`goto ${route}: landed on ${state.href}, not ${origin}`);
    if (state.caps === null) throw new Error(`goto ${route}: the __caps init script did not run`);
    if (!allowErrors && capsCount(state.caps) > 0) {
      throw new Error(`goto ${route}: load-time errors ${JSON.stringify(state.caps)}`);
    }
    return { href: state.href, width: state.width, height: state.height };
  };

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

  /** @type {Qa} */
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

    async open(route, viewport = viewports[viewportName], { allowErrors = false } = {}) {
      await page.setViewportSize(viewport);
      const state = await goto(route, { allowErrors });
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
        const last = await page.evaluate(
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
    rest,

    async capture(name, { fullPage = false, clip, element, pad = 0, minOpacity = 0.95 } = {}) {
      if (fullPage && (clip !== undefined || element !== undefined)) {
        throw new Error(`capture ${name}: fullPage takes no clip or element`);
      }
      if (element !== undefined) await waitVisible(element, { minOpacity });
      await rest();
      const state = await readState();
      if (!onOrigin(state.href)) throw new Error(`capture ${name}: page is on ${state.href}, not ${origin}`);
      /** @type {Rect | undefined} */
      let region = clip;
      if (element !== undefined) {
        const target = asTarget(element);
        const box = await page.evaluate(
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
        marks.start = await page.evaluate((label) => performance.mark(`${label}:start`).startTime, mark);
        value = await fn();
        await page.evaluate((label) => {
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
      return (await readState()).caps;
    },

    async assertCaps(label) {
      const state = await readState();
      if (capsCount(state.caps) > 0) throw new Error(`${label}: __caps ${JSON.stringify(state.caps)}`);
    },

    note(label, data) {
      log.push(data === undefined ? { label } : { label, data });
    },

    sleep: (ms) => page.waitForTimeout(ms),

    async finish(result, error) {
      if (step === steps - 1 || error !== null) await recordCaps();
      return { result, error, log, captures, caps: capsLog, traces };
    },
  };
  return qa;
}
