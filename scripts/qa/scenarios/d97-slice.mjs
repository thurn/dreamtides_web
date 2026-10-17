// The Dreamtides 97 slice loop through `qa.d97` and `qa.battle.win`, on
// desktop and mobile: a new run on the development dream
// (`?goto=d97-overworld&debug=1`), a walk to the nearest challenger, its
// encounter preview, the battle won through the engine debug panel, and the
// reward's Continue back to the overworld.
//
// Three steps per viewport, each its own runner call on the same page:
//
// 0. The overworld: walk to the challenger nearest the arrival tile, which
//    interacts with it, and wait for its encounter preview.
// 1. Fight: the preview's Fight opens the battle; `qa.battle.win` raises the
//    player's score at the human's decision until the victory surface shows.
// 2. Continue: the reward's Continue returns to the overworld, whose surface
//    comes back on the same map; the persisted log holds the applied battle
//    begin and end.
//
// Waits use test IDs, data attributes, and anchor UUIDs from the overworld
// state, never copy. Captures: the overworld, the preview, the victory, and
// the overworld after the battle, per viewport.

/** @typedef {{ anchorId: import("../../../src/types/identifiers").DreamAnchorId, mapId: import("../../../src/types/identifiers").DreamMapId, walkedTo: import("../prelude.mjs").D97Player }} Carry */

/** @param {import("../prelude.mjs").Qa} qa */
async function d97Slice(qa) {
  const viewport = qa.viewportName;
  const name = (/** @type {string} */ beat) => `d97-slice-${beat}-${viewport}`;

  if (qa.step === 0) {
    await qa.open("/?goto=d97-overworld&debug=1");
    await qa.d97.waitForPanel("overworld", { timeout: 30_000 });
    const start = await qa.d97.state({ timeout: 30_000 });
    const [x, y] = start.player.tile;
    const challenger = start.anchors
      .filter((anchor) => anchor.kind === "challenger")
      .sort((a, b) => Math.abs(a.at[0] - x) + Math.abs(a.at[1] - y) - (Math.abs(b.at[0] - x) + Math.abs(b.at[1] - y)))[0];
    if (challenger === undefined) throw new Error(`d97-slice ${viewport}: the development dream has no challenger`);
    qa.note("start", { tile: start.player.tile, mapId: start.mapId, challenger });
    await qa.capture(name("overworld"));

    const walkedTo = await qa.d97.walkTo(challenger.id, { timeout: 90_000 });
    const preview = await qa.d97.waitForPanel("encounter-preview");
    if (preview.id !== challenger.id) throw new Error(`d97-slice ${viewport}: the preview shows ${String(preview.id)}, not ${challenger.id}`);
    const [fx, fy] = walkedTo.faced;
    if (fx !== challenger.at[0] || fy !== challenger.at[1]) throw new Error(`d97-slice ${viewport}: the walk ended facing ${JSON.stringify(walkedTo.faced)}, not the challenger`);
    await qa.assertCaps(`${viewport} encounter preview`);
    await qa.capture(name("preview"));
    /** @type {Carry} */
    const carry = { anchorId: challenger.id, mapId: start.mapId, walkedTo };
    return carry;
  }

  const carry = /** @type {Carry} */ (qa.carry);
  if (qa.step === 1) {
    await qa.click("[data-testid=d97-preview-fight]");
    await qa.waitVisible("[data-battle-mobile]", { timeout: 30_000 });
    const won = await qa.battle.win({ timeout: 120_000 });
    await qa.waitVisible("[data-battle-result-surface=victory]");
    await qa.waitFor("the reward's Continue enables", () => {
      const button = document.querySelector("[data-testid=battle-reward-continue]");
      return button !== null && !button.hasAttribute("disabled") && button.getAttribute("aria-disabled") !== "true";
    }, null);
    await qa.capture(name("victory"));
    return { ...carry, scores: won.probe?.scores ?? null };
  }

  await qa.click("[data-testid=battle-reward-continue]");
  await qa.d97.waitForPanel("overworld", { timeout: 30_000 });
  const back = await qa.d97.state({ timeout: 30_000 });
  if (back.mapId !== carry.mapId) throw new Error(`d97-slice ${viewport}: returned to map ${back.mapId}, not ${carry.mapId}`);
  if (!back.anchors.some((anchor) => anchor.id === carry.anchorId)) throw new Error(`d97-slice ${viewport}: the challenger ${carry.anchorId} is gone`);
  const battle = await qa.gameLog.waitFor("the applied battle begin and end", (rows) => {
    const applied = (/** @type {string} */ type) => rows.findLastIndex((row) => row.event === "game_event" && row.type === type && row.outcome === "applied");
    const begin = applied("D97_BEGIN_BATTLE");
    const end = applied("D97_END_BATTLE");
    return begin >= 0 && end > begin ? { begin: rows[begin], end: rows[end] } : null;
  });
  qa.note("battle log", battle);
  await qa.assertCaps(`${viewport} back on the overworld`);
  await qa.capture(name("returned"));
  return { viewport, anchorId: carry.anchorId, walkedTo: carry.walkedTo, returnedTo: back.player };
}

export const viewports = ["desktop", "mobile"];

export default [d97Slice, d97Slice, d97Slice];
