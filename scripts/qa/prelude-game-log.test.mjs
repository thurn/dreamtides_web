// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext, runInThisContext } from "node:vm";
import { createQa } from "./prelude.mjs";
import { buildScenarioCode, runScenarioPlan } from "./run-scenario.mjs";

const ORIGIN = "http://localhost:5174";
const GAME = "game-a";
const OTHER = "game-b";

/** @type {string[]} */
const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * A synthetic `indexedDB` over one `records` store, firing request callbacks
 * asynchronously as the browser does. `exists: false` is a browser without
 * the application's database; `listsDatabases: false` lacks `databases()`.
 *
 * @param {Map<string, unknown> | null} records
 * @param {{ listsDatabases?: boolean }} [options]
 */
function fakeIndexedDb(records, { listsDatabases = true } = {}) {
  const state = { created: false, opened: 0 };
  /** @param {() => unknown} produce */
  const request = (produce) => {
    /** @type {{ result?: unknown, error?: unknown, onsuccess?: () => void, onerror?: () => void }} */
    const req = {};
    queueMicrotask(() => {
      req.result = produce();
      req.onsuccess?.();
    });
    return req;
  };
  const database = {
    objectStoreNames: { contains: (/** @type {string} */ name) => name === "records" },
    close: vi.fn(),
    transaction: () => ({
      objectStore: () => ({
        getAll: (/** @type {{ lower: string, upper: string }} */ range) => request(() =>
          [...(records ?? /** @type {Map<string, unknown>} */ (new Map())).entries()]
            .filter(([key]) => key >= range.lower && key < range.upper)
            .sort(([left], [right]) => (left < right ? -1 : 1))
            .map(([, value]) => value)),
      }),
    }),
  };
  const indexedDB = {
    ...(listsDatabases ? { databases: () => Promise.resolve(records === null ? [] : [{ name: "dreamtides-local-games", version: 1 }]) } : {}),
    open: (/** @type {string} */ name) => {
      state.opened += 1;
      /** @type {{ result?: unknown, error?: unknown, transaction?: { abort(): void }, onsuccess?: () => void, onerror?: () => void, onupgradeneeded?: () => void }} */
      const req = {};
      queueMicrotask(() => {
        if (name === "dreamtides-local-games" && records !== null) {
          req.result = database;
          req.onsuccess?.();
          return;
        }
        let aborted = false;
        req.transaction = { abort: () => { aborted = true; } };
        req.onupgradeneeded?.();
        if (aborted) {
          req.error = new Error("AbortError");
          req.onerror?.();
        } else {
          state.created = true;
          req.result = database;
          req.onsuccess?.();
        }
      });
      return req;
    },
  };
  return { indexedDB, state, database };
}

/** One chunk of JSONL lines, as `game-repository.ts` stores it. */
const chunk = (/** @type {Array<Record<string, unknown>>} */ rows) => rows.map((row) => JSON.stringify(row));

/** Stored records of two games, inserted out of key order. */
function storedGames() {
  return new Map(/** @type {Array<[string, unknown]>} */ ([
    [`game/${GAME}/log/000000000002`, chunk([{ event: "e", n: 4 }])],
    [`games/${GAME}`, { gameId: GAME, updatedAt: 10 }],
    [`game/${GAME}/log/000000000000`, chunk([{ event: "e", n: 1 }, { event: "e", n: 2 }])],
    [`game/${GAME}/events/000000000001`, "not a log line"],
    [`game/${OTHER}/log/000000000000`, chunk([{ event: "other" }])],
    [`games/${OTHER}`, { gameId: OTHER, updatedAt: 20 }],
    [`game/${GAME}/log/000000000001`, chunk([{ event: "e", n: 3 }])],
  ]));
}

/**
 * A synthetic page on `href` whose `evaluate` runs page functions against
 * `indexedDB` and returns their JSON serialization, as Playwright does.
 *
 * @param {ReturnType<typeof fakeIndexedDb>["indexedDB"]} indexedDB
 * @param {string} [href]
 */
function fakePage(indexedDB, href = `${ORIGIN}/battle?game=${GAME}`) {
  const search = href.includes("?") ? href.slice(href.indexOf("?")) : "";
  const context = {
    window: { __caps: { errors: [], rejections: [], consoleErrors: [] } },
    location: { href, search },
    innerWidth: 1440,
    innerHeight: 900,
    URLSearchParams,
    IDBKeyRange: { bound: (/** @type {string} */ lower, /** @type {string} */ upper) => ({ lower, upper }) },
    indexedDB,
  };
  const evaluate = vi.fn(async (/** @type {Function} */ fn, /** @type {unknown} */ arg) => {
    const value = /** @type {unknown} */ (await runInNewContext(`(${String(fn)})(arg)`, { ...context, arg }));
    return value === undefined ? undefined : /** @type {unknown} */ (JSON.parse(JSON.stringify(value)));
  });
  const page = /** @type {import('./prelude.mjs').QaPage} */ (/** @type {unknown} */ ({
    evaluate,
    addInitScript: vi.fn().mockResolvedValue(undefined),
    url: () => href,
    on: () => {},
    off: () => {},
    waitForTimeout: (/** @type {number} */ ms) => new Promise((done) => setTimeout(done, ms)),
  }));
  return { page, evaluate };
}

const config = { baseUrl: ORIGIN, bead: "fixture", captureDir: "/fixture", prod: false, args: {} };

/** @param {unknown} value @returns {boolean} */
function hasThenable(value) {
  if (typeof value !== "object" || value === null) return false;
  if ("then" in value && typeof value.then === "function") return true;
  return Object.values(value).some(hasThenable);
}

describe("qa.gameLog", () => {
  it("returns the URL game's stored lines in chunk key order, as the JSONL export does", async () => {
    const { indexedDB } = fakeIndexedDb(storedGames());
    const qa = await createQa(fakePage(indexedDB).page, config);
    const read = await qa.gameLog.read();
    expect(read).toEqual({ gameId: GAME, selectedBy: "url", reason: null, lines: [
      '{"event":"e","n":1}', '{"event":"e","n":2}', '{"event":"e","n":3}', '{"event":"e","n":4}',
    ] });
    expect((await qa.gameLog.rows()).map((row) => row.n)).toEqual([1, 2, 3, 4]);
  });

  it("selects the most recently updated stored game when the URL names none", async () => {
    const { indexedDB } = fakeIndexedDb(storedGames());
    const qa = await createQa(fakePage(indexedDB, `${ORIGIN}/`).page, config);
    expect(await qa.gameLog.read()).toEqual({ gameId: OTHER, selectedBy: "latest", reason: null, lines: ['{"event":"other"}'] });
  });

  it("reports no game without creating the application's database or failing", async () => {
    for (const listsDatabases of [true, false]) {
      const { indexedDB, state } = fakeIndexedDb(null, { listsDatabases });
      const qa = await createQa(fakePage(indexedDB, `${ORIGIN}/`).page, config);
      const read = await qa.gameLog.read();
      expect(read).toMatchObject({ gameId: null, selectedBy: null, lines: [] });
      expect(read.reason).toEqual(expect.any(String));
      expect(await qa.gameLog.rows()).toEqual([]);
      expect(state.created).toBe(false);
    }
    const empty = fakeIndexedDb(new Map());
    const qa = await createQa(fakePage(empty.indexedDB, `${ORIGIN}/`).page, config);
    expect(await qa.gameLog.read()).toMatchObject({ gameId: null, lines: [] });
    expect(empty.database.close).toHaveBeenCalled();
  });

  it("does not read a page off the runner's origin", async () => {
    const { indexedDB, state } = fakeIndexedDb(storedGames());
    const { page, evaluate } = fakePage(indexedDB, "about:blank");
    const qa = await createQa(page, config);
    expect(await qa.gameLog.read()).toMatchObject({ gameId: null, lines: [] });
    expect(evaluate).not.toHaveBeenCalled();
    expect(state.opened).toBe(0);
  });

  it("polls until the predicate holds over the rows, and times out with a structured error", async () => {
    const records = storedGames();
    const { indexedDB } = fakeIndexedDb(records);
    const qa = await createQa(fakePage(indexedDB).page, config);
    let reads = 0;
    const found = await qa.gameLog.waitFor("the fifth row", (rows, log) => {
      reads += 1;
      if (reads === 2) records.set(`game/${GAME}/log/000000000003`, chunk([{ event: "e", n: 5 }]));
      return rows.find((row) => row.n === 5) === undefined ? null : { game: log.gameId, rows: rows.length };
    }, { pollMs: 1 });
    expect(found).toEqual({ game: GAME, rows: 5 });
    expect(reads).toBe(3);
    const failure = await qa.gameLog.waitFor("never", () => false, { timeout: 20, pollMs: 1 }).catch((/** @type {unknown} */ error) => error);
    expect(qa.isTimeout(failure)).toBe(true);
  });
});

describe("runner game log export", () => {
  beforeEach(() => { vi.spyOn(process.stderr, "write").mockReturnValue(true); });
  const captureDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-game-log-"));
    tempDirs.push(dir);
    return dir;
  };

  /**
   * The runner's `run` over a synthetic page: the generated MCP code, then
   * the JSON the MCP response carries.
   *
   * @param {import('./prelude.mjs').QaPage} page
   * @param {string} dir
   * @param {Array<import('./prelude.mjs').QaResult>} reports Each raw report, before serialization.
   */
  const runOn = (page, dir, reports) => vi.fn(/** @type {import('./run-scenario.mjs').QaSession["run"]} */ (async (source, args, timeoutMs, call) => {
    const code = buildScenarioCode(source, { ...config, captureDir: dir, args, timeoutMs, ...call });
    const loaded = /** @type {unknown} */ (runInThisContext(`(${code})`));
    const fn = /** @type {(page: unknown) => Promise<import('./prelude.mjs').QaResult>} */ (loaded);
    const report = await fn(page);
    reports.push(report);
    const serialized = /** @type {unknown} */ (JSON.parse(JSON.stringify(report)));
    return /** @type {import('./prelude.mjs').QaResult} */ (serialized);
  }));

  it("writes each pass's log when the scenario throws, as plain data with no promise", async () => {
    const dir = captureDir();
    const { indexedDB } = fakeIndexedDb(storedGames());
    /** @type {import('./prelude.mjs').QaResult[]} */
    const reports = [];
    const run = runOn(fakePage(indexedDB).page, dir, reports);
    const plan = { steps: ["async () => null", 'async () => { throw new Error("scenario failed"); }'], viewports: /** @type {import('./prelude.mjs').ViewportName[]} */ (["desktop"]) };
    const merged = await runScenarioPlan(run, plan, {}, 60_000, { captureDir: dir, gameLogName: "fixture", runnable: () => true });
    expect(merged.error).toMatch(/scenario failed/);
    expect(run).toHaveBeenCalledTimes(2);
    expect(reports[0]?.gameLog).toBeUndefined();
    const path = join(dir, "fixture-desktop.jsonl");
    expect(merged.gameLogs).toEqual([{ viewport: "desktop", path, gameId: GAME, selectedBy: "url", rows: 4, reason: null }]);
    expect(readFileSync(path, "utf8").split("\n")).toEqual(['{"event":"e","n":1}', '{"event":"e","n":2}', '{"event":"e","n":3}', '{"event":"e","n":4}', ""]);
    const last = reports[1];
    expect(hasThenable(last)).toBe(false);
    expect(JSON.parse(JSON.stringify(last))).toEqual(last);
  });

  it("exports through one more call when a call fails without a report", async () => {
    const dir = captureDir();
    const { indexedDB } = fakeIndexedDb(storedGames());
    const exported = runOn(fakePage(indexedDB).page, dir, []);
    let calls = 0;
    const run = vi.fn(/** @type {import('./run-scenario.mjs').QaSession["run"]} */ (async (...args) => {
      calls += 1;
      if (calls === 1) throw new Error("tool error");
      return exported(...args);
    }));
    const plan = { steps: ["async () => null"], viewports: /** @type {import('./prelude.mjs').ViewportName[]} */ (["mobile"]) };
    await expect(runScenarioPlan(run, plan, {}, 60_000, { captureDir: dir, gameLogName: "fixture", runnable: () => true })).rejects.toThrow(/tool error/);
    expect(run.mock.calls[1]?.[3]).toMatchObject({ viewport: "mobile", exportGameLog: true });
    expect(readFileSync(join(dir, "fixture-mobile.jsonl"), "utf8").trim().split("\n")).toHaveLength(4);
  });

  it("records a pass with no game cleanly, without a file or a failure", async () => {
    const dir = captureDir();
    const stale = join(dir, "fixture-desktop.jsonl");
    writeFileSync(stale, "{}\n");
    const { indexedDB } = fakeIndexedDb(null);
    const run = runOn(fakePage(indexedDB, `${ORIGIN}/`).page, dir, []);
    const plan = { steps: ['async () => "done"'], viewports: /** @type {import('./prelude.mjs').ViewportName[]} */ (["desktop"]) };
    const merged = await runScenarioPlan(run, plan, {}, 60_000, { captureDir: dir, gameLogName: "fixture", runnable: () => true });
    expect(merged.error).toBeNull();
    expect(merged.result).toBe("done");
    expect(merged.gameLogs).toMatchObject([{ viewport: "desktop", path: null, gameId: null, selectedBy: null, rows: 0 }]);
    expect(typeof merged.gameLogs[0]?.reason).toBe("string");
    expect(existsSync(stale)).toBe(false);
  });
});
