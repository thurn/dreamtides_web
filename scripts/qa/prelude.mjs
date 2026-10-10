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
 */

/**
 * @typedef {object} QaConfig
 * @property {string} baseUrl Origin of the runner's own server.
 * @property {string} bead
 * @property {string} captureDir Absolute capture directory of the bead.
 * @property {boolean} prod
 * @property {Record<string, string>} args `--arg key=value` pairs.
 */

/**
 * @typedef {object} QaResult
 * @property {unknown} result What the scenario returned.
 * @property {string | null} error The scenario's thrown error, with stack.
 * @property {Array<{ label: string, data?: unknown }>} log
 * @property {Array<{ path: string, href: string, width: number, height: number }>} captures
 * @property {Array<{ href: string, caps: Caps }>} caps Every document whose buffer was not empty.
 */

/**
 * The helpers a scenario receives.
 *
 * @typedef {object} Qa
 * @property {QaPage} page
 * @property {string} baseUrl
 * @property {string} bead
 * @property {boolean} prod
 * @property {Record<string, string>} args
 * @property {{ desktop: Viewport, mobile: Viewport }} viewports
 * @property {(route: string, viewport?: Viewport, options?: { allowErrors?: boolean }) => Promise<{ href: string, width: number, height: number }>} open
 *   Sizes the viewport, loads `route` on the runner's server, and asserts the
 *   origin, the viewport, and an empty `__caps` (unless `allowErrors`).
 * @property {(target: string | Target, options?: { position?: { x?: number, y?: number }, rest?: boolean, timeout?: number, minOpacity?: number }) => Promise<{ x: number, y: number }>} click
 *   Waits until the target is rendered (at `minOpacity`, default 0.95) and
 *   `elementFromPoint` at its centre (or `position` within its box) is the
 *   target or inside it, clicks there with the pointer, and rests the pointer
 *   outside the viewport. Floating or animating targets need no stability
 *   wait.
 * @property {(target: string | Target, options?: { timeout?: number, minOpacity?: number }) => Promise<void>} waitVisible
 *   Waits until the target is rendered at `minOpacity` (default 0.95).
 * @property {() => Promise<void>} rest Moves the pointer outside the viewport.
 * @property {(name: string, options?: { fullPage?: boolean }) => Promise<string>} capture
 *   Writes `<captureDir>/<name>.png` at CSS scale, pointer at rest.
 * @property {() => Promise<Caps | null>} caps
 * @property {(label: string) => Promise<void>} assertCaps Throws unless `__caps` is empty.
 * @property {(label: string, data?: unknown) => void} note Adds a line to the report's log.
 * @property {(ms: number) => Promise<void>} sleep
 * @property {(result: unknown, error: string | null) => Promise<QaResult>} finish
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
  const origin = config.baseUrl.replace(/\/+$/, "");
  /** @param {string} href */
  const onOrigin = (href) => href === origin || href.startsWith(`${origin}/`);
  /** @type {QaResult["log"]} */
  const log = [];
  /** @type {QaResult["captures"]} */
  const captures = [];
  /** @type {QaResult["caps"]} */
  const capsLog = [];

  await page.addInitScript(() => {
    const qaWindow = /** @type {QaWindow} */ (window);
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

  /** @type {Qa} */
  const qa = {
    page,
    baseUrl: config.baseUrl,
    bead: config.bead,
    prod: config.prod,
    args: config.args,
    viewports,

    async open(route, viewport = viewports.desktop, { allowErrors = false } = {}) {
      await recordCaps();
      await page.setViewportSize(viewport);
      await page.goto(`${origin}${route.startsWith("/") ? "" : "/"}${route}`, { waitUntil: "load" });
      const state = await readState();
      if (!onOrigin(state.href)) throw new Error(`open ${route}: landed on ${state.href}, not ${origin}`);
      if (state.width !== viewport.width || state.height !== viewport.height) {
        throw new Error(
          `open ${route}: viewport is ${String(state.width)}x${String(state.height)}, not ${String(viewport.width)}x${String(viewport.height)}`,
        );
      }
      if (state.caps === null) throw new Error(`open ${route}: the __caps init script did not run`);
      if (!allowErrors && capsCount(state.caps) > 0) {
        throw new Error(`open ${route}: load-time errors ${JSON.stringify(state.caps)}`);
      }
      return { href: state.href, width: state.width, height: state.height };
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

    async capture(name, { fullPage = false } = {}) {
      await rest();
      const state = await readState();
      if (!onOrigin(state.href)) throw new Error(`capture ${name}: page is on ${state.href}, not ${origin}`);
      const path = `${config.captureDir}/${name}.png`;
      await page.screenshot({ path, scale: "css", fullPage });
      captures.push({ path, href: state.href, width: state.width, height: state.height });
      return path;
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
      await recordCaps();
      return { result, error, log, captures, caps: capsLog };
    },
  };
  return qa;
}
