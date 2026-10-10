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
// It reads the decision and the scores through `qa.battle`, from the debug
// panel's `window.__engineProbe`. The debug panel's controls carry no test
// IDs beyond the open button and the rail; the side tabs and the Score
// stepper are found by role, and the stepper by its developer-tool label.

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

  /** @param {import("../prelude.mjs").BattleState} battle */
  const score = (battle) => battle.probe?.scores[winner] ?? 0;
  // A debug action applies at a decision boundary; the human's is one the AI host does not race.
  const start = await qa.battle.waitFor(
    (battle) => battle.probe !== null && !battle.probe.inFlight && battle.probe.decision?.side === "player",
    { label: "the human's decision" },
  );
  const scoreToWin = start.probe?.scoreToWin ?? 0;
  qa.note("start", { score: score(start), scoreToWin });
  await qa.click("[data-testid=engine-debug-open]");
  await qa.waitVisible("[data-testid=engine-debug-panel]");
  if (winner === "enemy") {
    const enemyTab = "[data-testid=engine-debug-panel] [role=tablist] > [role=tab]:nth-child(2)";
    await qa.click(enemyTab);
    await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("aria-selected") === "true", enemyTab, { timeout: 5_000 });
  }
  const increase = '[data-testid=engine-debug-panel] [role=group][aria-label="Score"] button:last-of-type';
  for (let reached = score(start); reached < scoreToWin; reached++) {
    await qa.click(increase);
    await qa.battle.waitFor((battle) => score(battle) > reached || battle.probe?.ended === true, {
      label: `score ${String(reached + 1)}`,
      timeout: 10_000,
    });
  }
  const end = await qa.battle.waitFor((battle) => battle.probe?.ended === true, { label: "the battle's end", timeout: 10_000 });
  qa.note("end", { score: score(end), scoreToWin });

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
  return { outcome, viewport: qa.viewportName, scoreToWin, surface: geometry };
}
