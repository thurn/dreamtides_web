// The phase-gate smoke: the front door of a fresh game (seed 1 unless
// `--arg seed=<n>`), Avatar selection, every Layer 1 site, Battle Start, and
// the first turn of the engine battle through one full AI turn. It uses no
// development-only URL parameter, so it runs the same with --prod.

/** @param {import("../prelude.mjs").Qa} qa */
export default async function smoke(qa) {
  const seed = qa.args.seed ?? "1";
  const mode = qa.prod ? "prod" : "dev";
  await qa.open(`/?seed=${seed}`);
  const choose = "[data-journey-screen=journeyStart] button[data-glass-variant=accent]";
  await qa.waitVisible(choose);
  await qa.capture(`smoke-${mode}-front-door`);
  await qa.click(choose);
  await qa.click("[role=dialog] button[data-glass-variant=accent]");
  await qa.waitVisible("[data-journey-screen=dreamscape] [data-site-type]");

  // Visit every open site; the Battle site opens once the others are visited.
  const openSite = "[data-journey-screen=dreamscape] [data-site-type][data-interactive=true]";
  const visited = [];
  for (let visit = 0; visit < 12; visit++) {
    await qa.waitVisible(openSite);
    const site = await qa.page.evaluate(
      (selector) => document.querySelector(selector)?.getAttribute("data-site-type") ?? null,
      openSite,
    );
    visited.push(site);
    const path = qa.page.url();
    await qa.click(`${openSite}[data-site-type=${String(site)}]`);
    if (site === "Battle") break;
    await qa.page.waitForFunction((before) => location.href !== before, path, { timeout: 10_000 });
    if (site === "Draft") {
      const pick = "[data-journey-screen=site] [role=button][data-card-id]";
      while (qa.page.url().includes("/draft")) {
        const before = await qa.page.evaluate(() => document.body.innerText.length, null);
        await qa.click(pick);
        await qa.page.waitForFunction(
          (length) => !location.pathname.endsWith("/draft") || document.body.innerText.length !== length,
          before,
          { timeout: 10_000 },
        );
        await qa.sleep(400);
      }
    } else if (site === "DreamsignRevelation") {
      await qa.click("[data-testid=dreamsign-revelation-art-0]");
    } else if (site === "Purge") {
      await qa.click("[data-testid=cumulus-purge-header-action]");
    } else {
      throw new Error(`smoke: no route through a ${String(site)} site`);
    }
    await qa.page.waitForFunction(() => /\/dreamscape\/[^/]+$/.test(location.pathname), null, { timeout: 10_000 });
  }
  qa.note("sites", visited);

  await qa.click("[data-testid=cumulus-battle-start-begin]");
  const turnState = () =>
    qa.page.evaluate(() => {
      const phase = document.querySelector("[data-battle-phase]");
      return phase === null
        ? null
        : `${String(phase.getAttribute("data-battle-side"))}:${String(phase.getAttribute("data-battle-phase"))}`;
    }, null);
  const pass = "[data-battle-phase-next] button";
  await qa.waitVisible(pass, { timeout: 30_000 });
  await qa.capture(`smoke-${mode}-battle-start`);

  // Pass until the far side has taken a turn and the near side is back. A
  // press the screen ignores (input still in flight) is pressed again.
  const turns = [await turnState()];
  let sawFar = false;
  for (let step = 0; step < 16; step++) {
    await qa.waitVisible(pass, { timeout: 60_000 });
    const now = await turnState();
    if (now !== turns[turns.length - 1]) turns.push(now);
    if (now?.startsWith("far")) sawFar = true;
    if (sawFar && now?.startsWith("near")) break;
    let after = now;
    for (let press = 0; press < 6 && after === now; press++) {
      await qa.click(pass);
      after = /** @type {string | null} */ (await (await qa.page.waitForFunction(
        (before) => {
          const phase = document.querySelector("[data-battle-phase]");
          const state = phase === null
            ? null
            : `${String(phase.getAttribute("data-battle-side"))}:${String(phase.getAttribute("data-battle-phase"))}`;
          return state !== before ? state : false;
        },
        now,
        { timeout: 10_000 },
      ).catch(() => ({ jsonValue: () => Promise.resolve(now) }))).jsonValue());
    }
    if (after === now) throw new Error(`smoke: passing ${String(now)} changed nothing (${turns.join(" > ")})`);
    turns.push(after);
    if (after?.startsWith("far")) sawFar = true;
  }
  if (!sawFar || turns[turns.length - 1]?.startsWith("near") !== true) throw new Error(`smoke: the AI turn did not complete (${turns.join(" > ")})`);
  await qa.assertCaps("after the AI turn");
  await qa.capture(`smoke-${mode}-after-ai-turn`);
  return { sites: visited, turns };
}
