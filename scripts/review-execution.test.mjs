// @vitest-environment node

import { setImmediate } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { runConcurrentReviewSteps } from "./review-execution.mjs";

const steps = [
  { step: "static", args: ["selected.ts"] },
  { step: "tests", args: ["selected.ts"] },
];

describe("concurrent review execution", () => {
  it("starts every step and drains them before returning the first failing code", async () => {
    /** @type {((code: number) => void)[]} */
    const finish = [];
    /** @type {string[]} */
    const observed = [];
    const execution = runConcurrentReviewSteps(steps, (step, args) => {
      observed.push(step, ...args);
      return new Promise((resolve) => finish.push(resolve));
    });
    const drained = execution.then((code) => {
      observed.push("restore");
      return code;
    });
    expect(observed).toEqual(["static", "selected.ts", "tests", "selected.ts"]);
    finish[1](9);
    await Promise.resolve();
    expect(observed).not.toContain("restore");
    finish[0](7);
    await expect(drained).resolves.toBe(7);
    expect(observed.at(-1)).toBe("restore");
  });

  it("drains a surviving step before surfacing a start error to cleanup", async () => {
    const failure = new Error("synthetic spawn failure");
    /** @type {((code: number) => void) | undefined} */
    let finish;
    let restored = false;
    const execution = runConcurrentReviewSteps(steps, async (step) => {
      if (step === "static") throw failure;
      return new Promise((resolve) => { finish = resolve; });
    });
    const drained = execution.finally(() => { restored = true; });
    const assertion = expect(drained).rejects.toMatchObject({ cause: failure });
    // Drain queued promise reactions while the surviving consumer stays pending.
    await setImmediate();
    expect(restored).toBe(false);
    if (finish === undefined) throw new Error("Step was not started");
    finish(0);
    await assertion;
    expect(restored).toBe(true);
  });

  it("returns success when every step succeeds, including an empty group", async () => {
    await expect(runConcurrentReviewSteps(steps, () => Promise.resolve(0))).resolves.toBe(0);
    await expect(runConcurrentReviewSteps([], () => Promise.resolve(0))).resolves.toBe(0);
  });
});
