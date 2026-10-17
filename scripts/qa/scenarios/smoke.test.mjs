// @vitest-environment node
import { expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { createQa } from "../prelude.mjs";
import { runScenarioPlan } from "../run-scenario.mjs";
import smoke from "./smoke.mjs";

it.each([false, true])("retains every viewport's smoke capture in one invocation (prod=%s)", async (prod) => {
  // Model the external screenshot sink by destination: writing a path twice
  // replaces its previous viewport, just as the browser's file output does.
  const images = new Map();
  const run = /** @type {Parameters<typeof runScenarioPlan>[0]} */ (async (source, args, _timeout, call) => {
    const viewport = call?.viewport === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 };
    const href = "http://localhost:5174/synthetic";
    const page = /** @type {import("../prelude.mjs").QaPage} */ (/** @type {unknown} */ ({
      evaluate: vi.fn().mockResolvedValue({ href, ...viewport, caps: { errors: [], rejections: [], consoleErrors: [] } }),
      addInitScript: vi.fn(), on: vi.fn(), off: vi.fn(), url: () => href,
      mouse: { move: vi.fn() },
      waitForFunction: vi.fn().mockResolvedValue({ jsonValue: () => Promise.resolve(true), dispose: vi.fn() }),
      screenshot: (/** @type {{ path: string }} */ { path }) => { images.set(path, viewport); return Promise.resolve(); },
    }));
    const qa = await createQa(page, { baseUrl: "http://localhost:5174", bead: "fixture", captureDir: "/fixture", prod, args, ...call });
    // Synthetic journey/battle observations leave the scenario's captures and
    // the maintained capture helper/report merger running together unchanged.
    qa.battle.enterFirstBattle = async ({ atFrontDoor } = {}) => {
      await atFrontDoor?.();
      return { sites: [] };
    };
    qa.battle.playUntil = () => Promise.resolve(/** @type {Awaited<ReturnType<typeof qa.battle.playUntil>>} */ (/** @type {unknown} */ ({ history: [], responds: 0 })));
    const result = /** @type {unknown} */ (await runInNewContext(`(${source})(qa)`, { qa }));
    return qa.finish(result, null);
  });
  const report = await runScenarioPlan(run, { steps: [String(smoke)], viewports: ["desktop", "mobile"] }, {}, 60_000,
    { captureDir: "/fixture", runnable: () => true });

  expect(report.error).toBeNull();
  expect(report.captures).toHaveLength(6);
  expect(new Set(report.captures.map(({ path }) => path)).size).toBe(6);
  expect(images.size).toBe(6);
  for (const { path, width, height } of report.captures) {
    expect(images.get(path)).toEqual({ width, height });
  }
});
