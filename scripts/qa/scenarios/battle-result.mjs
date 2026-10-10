// The battle result surface: `--arg outcome=victory|defeat` (default
// victory) of the playable Layer 1 battle (`?goto=battle-playable`, seed 1
// unless `--arg seed=<n>`). It waits for the human's decision, then raises
// the winning side's score to the battle's `scoreToWin` through the engine
// debug panel (`debug=1`), one Score press at a time, which ends the battle
// whatever the AI has played. It asserts the result surface for the outcome
// renders, then reloads the game (the battle's end is in its log, and the
// reload closes the debug rail) and asserts it again, captures the viewport
// and the surface's content, and asserts an empty `__caps`. A victory waits
// for the reward's count-up to enable Continue.
//
// It reads `window.__engineProbe` (the debug panel's) for the decision and
// the scores. The debug panel's controls carry no test IDs beyond the open
// button and the rail; the side tabs and the Score stepper are found by
// role, and the stepper by its developer-tool label.

/**
 * @typedef {{ slice: { committed: { config: { scoreToWin: number }, sides: Record<string, { score: number }>, result: unknown }, inFlight: unknown }, decision: { side: string } | null, pending: unknown }} ResultProbe
 * @typedef {Window & { __engineProbe?: ResultProbe }} ResultWindow
 */

/** @param {import("../prelude.mjs").Qa} qa */
export default async function battleResult(qa) {
  const page = qa.page;
  const outcome = qa.args.outcome ?? "victory";
  if (outcome !== "victory" && outcome !== "defeat") throw new Error(`battle-result: outcome is victory or defeat, not ${outcome}`);
  const winner = outcome === "victory" ? "player" : "enemy";
  const seed = qa.args.seed ?? "1";
  const name = `battle-result-${outcome}-${qa.viewportName}`;
  await qa.open(`/?goto=battle-playable&seed=${seed}&debug=1`);
  await qa.waitVisible("[data-battle-mobile]", { timeout: 30_000 });

  /** The scores, the win score, and whether the human holds a settled decision. */
  const read = () =>
    page.evaluate((side) => {
      const probe = /** @type {ResultWindow} */ (window).__engineProbe;
      if (probe === undefined) return null;
      const { committed, inFlight } = probe.slice;
      return {
        score: committed.sides[side]?.score ?? 0,
        scoreToWin: committed.config.scoreToWin,
        ended: committed.result !== null,
        humanDecides: inFlight === null && probe.decision?.side === "player",
      };
    }, winner);
  const until = async (/** @type {string} */ label, /** @type {(state: NonNullable<Awaited<ReturnType<typeof read>>>) => boolean} */ test, timeout = 60_000) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      const state = await read();
      if (state !== null && test(state)) return state;
      if (Date.now() > deadline) throw new Error(`battle-result: timed out waiting for ${label} (${JSON.stringify(state)})`);
      await qa.sleep(150);
    }
  };

  // A debug action applies at a decision boundary; the human's is one the AI host does not race.
  const start = await until("the human's decision", (state) => state.humanDecides);
  qa.note("start", start);
  await qa.click("[data-testid=engine-debug-open]");
  await qa.waitVisible("[data-testid=engine-debug-panel]");
  if (winner === "enemy") {
    const enemyTab = "[data-testid=engine-debug-panel] [role=tablist] > [role=tab]:nth-child(2)";
    await qa.click(enemyTab);
    await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("aria-selected") === "true", enemyTab, { timeout: 5_000 });
  }
  const increase = '[data-testid=engine-debug-panel] [role=group][aria-label="Score"] button:last-of-type';
  for (let score = start.score; score < start.scoreToWin; score++) {
    await qa.click(increase);
    await until(`score ${String(score + 1)}`, (state) => state.score > score || state.ended, 10_000);
  }
  const end = await until("the battle's end", (state) => state.ended, 10_000);
  qa.note("end", end);

  const surface = `[data-battle-result-surface=${outcome}]`;
  const settled = async () => {
    await qa.waitVisible(surface, { timeout: 15_000 });
    if (outcome === "victory") {
      await page.waitForFunction(
        () => {
          const button = document.querySelector("[data-testid=battle-reward-continue]");
          return button !== null && !button.hasAttribute("disabled") && button.getAttribute("aria-disabled") !== "true";
        },
        null,
        { timeout: 15_000 },
      );
    } else {
      await qa.waitVisible("[data-testid=battle-result-action-panel]");
    }
  };
  await settled();
  await qa.assertCaps("on the result surface");
  // The URL carries `game=<id>`, so it resumes this game rather than building the scene again.
  const resumed = await qa.goto(page.url());
  qa.note("resumed", resumed.href);
  await settled();
  const geometry = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    const box = element?.getBoundingClientRect();
    return box === undefined ? null : { x: box.x, y: box.y, width: box.width, height: box.height, innerWidth, innerHeight };
  }, surface);
  qa.note("surface", geometry);
  await qa.assertCaps("on the result surface");
  await qa.capture(name);
  await qa.capture(`${name}-content`, { element: "[data-battle-result-layout-content]", pad: 8 });
  return { outcome, viewport: qa.viewportName, scoreToWin: end.scoreToWin, surface: geometry };
}
