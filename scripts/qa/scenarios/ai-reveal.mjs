// The AI's play reveal: the opponent's played card at reading size before it
// travels to its destination (`BattlePlayReveal`). It opens the
// `prompt-lab-present-opponent` scene (seed 1 unless `--arg seed=<n>`), in
// which the AI holds the Day with energy and playable cards, and waits for
// the reveal. Whichever policy answers the AI host (the worker's, or the
// Random fallback when the worker is slow), the scenario asserts only the
// surface: if the AI ends its turn without playing, it passes the human's
// turn until the AI plays (up to `--arg turns=<n>`, default 4 human turns).
// It captures the viewport and the revealed card once the card has grown to
// the reveal's width, asserts the card leaves the reveal again (it travels), and asserts
// an empty `__caps`. `--arg trace=1` wraps the wait in `qa.trace`, so the
// report carries the main thread's long tasks up to the reveal.

/** @param {import("../prelude.mjs").Qa} qa */
export default async function aiReveal(qa) {
  const page = qa.page;
  const seed = qa.args.seed ?? "1";
  const turns = Number(qa.args.turns ?? "4");
  const name = `ai-reveal-${qa.viewportName}`;
  const reveal = "[data-battle-play-reveal]";
  const pass = "[data-battle-phase-next] button";
  await qa.open(`/?goto=prompt-lab-present-opponent&seed=${seed}`);
  await qa.waitVisible("[data-battle-mobile]", { timeout: 30_000 });

  /** Polls until the reveal shows (`reveal`), or the human may pass with no reveal yet (`pass`). */
  const next = async () => {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const state = await page.evaluate(
        ({ revealSelector, passSelector }) => {
          const dom = /** @type {Window & { __qa?: import("../prelude.mjs").QaDom }} */ (window).__qa;
          if (dom?.rendered({ selector: revealSelector }, 0.95) != null) return "reveal";
          const button = dom?.rendered({ selector: passSelector }, 0.95) ?? null;
          return button !== null && !button.hasAttribute("disabled") && button.getAttribute("aria-disabled") !== "true" ? "pass" : null;
        },
        { revealSelector: reveal, passSelector: pass },
      );
      if (state !== null) return state;
      if (Date.now() > deadline) throw new Error("ai-reveal: neither a reveal nor the human's pass within 60 s");
      await qa.sleep(50);
    }
  };
  const waitForReveal = async () => {
    for (let passed = 0; ; passed++) {
      if ((await next()) === "reveal") return passed;
      if (passed >= turns) throw new Error(`ai-reveal: the AI played nothing over ${String(turns)} human turns`);
      await qa.click(pass);
      await qa.sleep(500);
    }
  };

  let passed;
  if (qa.args.trace === "1") {
    const traced = await qa.trace(`${name}-wait`, waitForReveal);
    passed = traced.value;
    qa.note("trace", { longTasks: traced.longTasks.length, busyMs: traced.busyMs, windowMs: traced.windowMs });
  } else {
    passed = await waitForReveal();
  }
  // The card grows out of the AI's hand to the reveal's width; capture it there.
  const settled = await page
    .waitForFunction(
      (selector) => {
        const frame = document.querySelector(selector)?.getBoundingClientRect();
        const card = document.querySelector(`${selector} [data-battle-card-id]`)?.getBoundingClientRect();
        return frame !== undefined && card !== undefined && Math.abs(frame.width - card.width) < 1;
      },
      reveal,
      { timeout: 1_500, polling: 50 },
    )
    .then(() => true, () => false);
  const card = await page.evaluate((selector) => {
    const element = document.querySelector(`${selector} [data-battle-card-id]`);
    const box = element?.getBoundingClientRect();
    return box === undefined
      ? null
      : {
          id: element?.getAttribute("data-battle-card-id") ?? null,
          from: document.querySelector(selector)?.getAttribute("data-battle-play-reveal-from") ?? null,
          box: { x: box.x, y: box.y, width: box.width, height: box.height },
        };
  }, reveal);
  if (card === null) throw new Error("ai-reveal: the reveal shows no card");
  qa.note("reveal", { passed, settled, ...card });
  await qa.capture(name);
  await qa.capture(`${name}-card`, { element: `${reveal} [data-battle-card-id]`, pad: 12, minOpacity: 0.5 });
  // The reveal dwells, then the card travels to the board (and a later play may reveal the next card).
  await page.waitForFunction(
    ({ selector, id }) => document.querySelector(`${selector} [data-battle-card-id]`)?.getAttribute("data-battle-card-id") !== id,
    { selector: reveal, id: card.id },
    { timeout: 15_000 },
  );
  await qa.assertCaps("after the reveal");
  if (!settled) throw new Error(`ai-reveal: the revealed card did not grow to the reveal's width (${JSON.stringify(card.box)})`);
  return { viewport: qa.viewportName, passedTurns: passed, from: card.from, revealed: card.box };
}
