// Deterministic browser regression: a reload destroys an active observation,
// the exact lab report returns, and staged instances persist in the saved game.
// --arg error=1 additionally proves departing-document console errors fail the run.
export const viewports = ["desktop", "mobile"];

/** @param {import("../prelude.mjs").Qa} qa */
export default async function qaHelperRecovery(qa) {
  const card = qa.args.card;
  if (card === undefined) throw new Error("qa-helper-recovery needs --arg card=<character uuid>");
  await qa.open(`/?goto=card-lab&card=${encodeURIComponent(card)}&variant=base&as=player&seed=1&debug=1`);
  const lab = await qa.waitFor("published lab", () => /** @type {Window & { __cardLab?: unknown }} */ (window).__cardLab ?? null, null);
  await qa.waitFor("engine probe", () => "__engineProbe" in window, null);
  await qa.click("[data-testid=engine-debug-open]");
  const field = qa.page.locator("[data-testid=engine-debug-card]");
  await field.fill(card);
  await qa.click("[data-engine-debug-zone] button");
  await qa.waitVisible("[role=listbox]");
  const menu = await qa.read(() => {
    const trigger = document.querySelector("[data-engine-debug-zone] button");
    const list = document.querySelector("[role=listbox]");
    const box = list?.getBoundingClientRect();
    if (trigger?.getAttribute("aria-expanded") !== "true" || box === undefined ||
        box.left < 0 || box.right > innerWidth || box.top < 0 || box.bottom > innerHeight) throw new Error("first-click menu geometry failed");
    return { href: location.href, width: innerWidth, height: innerHeight, x: box.x, y: box.y, widthMenu: box.width, heightMenu: box.height };
  }, null);
  qa.note("first-click Zone menu", menu);
  await qa.capture(`zone-menu-${qa.viewportName}`);
  await qa.click('[role=option][data-value=hand]');
  const ids = [];
  for (const side of /** @type {const} */ (["player", "enemy"])) {
    for (const zone of /** @type {const} */ (["hand", "play", "void"])) ids.push(await qa.labAddCard(zone, side, card));
  }
  if (new Set(ids).size !== 6) throw new Error("staging reused an instance id");
  const committed = await qa.read(() => JSON.stringify(/** @type {Window & { __engineProbe?: { slice: { committed: unknown } } }} */ (window).__engineProbe?.slice.committed), null);
  await qa.capture(`staged-${qa.viewportName}`);
  await qa.read(() => sessionStorage.removeItem("qa-helper-reload-once"), null);
  if (qa.args.error === "1") await qa.read(() => console.error("synthetic departing-document failure"), null);
  const restored = await qa.waitFor("report after forced mid-poll reload", () => {
    if (sessionStorage.getItem("qa-helper-reload-once") === null) {
      sessionStorage.setItem("qa-helper-reload-once", "1");
      location.reload();
      return new Promise(() => {});
    }
    return /** @type {Window & { __cardLab?: unknown }} */ (window).__cardLab ?? null;
  }, null, { timeout: 15_000, allowErrors: qa.args.error === "1" });
  if (JSON.stringify(restored) !== JSON.stringify(lab)) throw new Error("reload changed the published lab outcome");
  await qa.waitFor("resumed engine probe", () => "__engineProbe" in window, null, { allowErrors: qa.args.error === "1" });
  const resumed = await qa.read(() => JSON.stringify(/** @type {Window & { __engineProbe?: { slice: { committed: unknown } } }} */ (window).__engineProbe?.slice.committed), null);
  if (resumed !== committed) throw new Error("reload changed the staged battle");
  qa.note("mid-poll reload restored exact report and committed battle", { ids });
  await qa.read(() => sessionStorage.removeItem("qa-helper-reload-once"), null);
  if (qa.args.error !== "1") {
    let timedOut = false;
    try {
      await qa.waitFor("absent synthetic observation", () => null, null, { timeout: 100 });
    } catch (error) {
      if (!/Timeout/i.test(String(error))) throw error;
      timedOut = true;
    }
    if (!timedOut) throw new Error("absent observation did not time out");
    qa.note("bounded absent-observation timeout", { timedOut });
  }
  await qa.assertCaps("reloaded staged board");
  return { ids, reportRestored: true, battlePreserved: true };
}
