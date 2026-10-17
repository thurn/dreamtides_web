// Public synthetic mixed-feasibility payments, using the existing prompt lab,
// normal controls and read-only debug probe. Each viewport pays both bases.
export const viewports = ["desktop", "mobile"];

/** @param {import("../prelude.mjs").Qa} qa */
export default async function routeMetadata(qa) {
  const results = [];
  const read = () => qa.read(() => {
    const probe = /** @type {Window & { __engineProbe?: { slice: import("../../../src/engine/fold/slice").BattleSlice, pending: import("../../../src/engine/prompts/types").Prompt | null } }} */ (window).__engineProbe;
    if (probe === undefined) throw new Error("missing synthetic probe");
    return { state: probe.slice.committed, pending: probe.pending, inFlight: probe.slice.inFlight !== null };
  }, null);
  for (const mode of [2, 3]) {
    await qa.open(`/?goto=prompt-lab-route-metadata&seed=1&debug=1&route-case=${String(mode)}`);
    await qa.waitFor("synthetic route probe", () => "__engineProbe" in window, null);
    await qa.battle.waitFor(battle => battle.window === "main" && battle.canPass);
    const openingSource = (await read()).state.sides.player.hand[0];
    if (openingSource === undefined || !(await qa.battle.tap(`[data-battlefield-card][data-battle-card-id="${openingSource}"]`))) {
      throw new Error("synthetic source has no reachable hand control");
    }
    await qa.battle.waitFor(battle => battle.prompt?.surface === "choice" && battle.prompt.answerable);
    const before = await read();
    const prompt = before.pending;
    const source = before.state.sides.player.hand[0];
    const discard = before.state.sides.player.hand[1];
    if (prompt?.kind !== "chooseMode" || source === undefined || discard === undefined ||
      JSON.stringify(prompt.options.map(option => [option.mode, option.route, option.legal])) !==
      JSON.stringify([[0, "normal", false], [1, "offering", false], [2, "eventAlternative", true], [3, "alternativeCost", true]]) ||
      JSON.stringify(prompt.options[3].costs) !== JSON.stringify([{ cost: "energy", amount: 0 }, { cost: "giveOpponentPoints", amount: 5 }])) {
      throw new Error("mixed feasibility lost semantic payment descriptors");
    }
    const offered = await qa.read(() => Array.from(document.querySelectorAll("[data-battle-choice-prompt-controls] button")).map(button => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { label: button.textContent?.trim() ?? "", width: box.width, height: box.height,
        inViewport: box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        hit: hit !== null && button.contains(hit) };
    }), null);
    if (offered.length !== 2 || new Set(offered.map(option => option.label)).size !== 2 ||
      offered.some(option => !option.label || option.width <= 0 || option.height <= 0 || !option.inViewport || !option.hit)) {
      throw new Error("semantic choices are not distinct and reachable");
    }
    if (mode === 2) await qa.capture(`route-metadata-choices-${qa.viewportName}`);
    const cursor = await qa.battle.eventCursor();
    await qa.click(`[data-testid=battle-choice-prompt-option-${String(mode - 2)}]`);
    await qa.battle.playUntil(async () => (await read()).state.instances[source]?.zone === "void", {
      label: `route ${String(mode)} pays and resolves`, timeout: 60_000,
      passWhen: battle => (battle.probe?.stack ?? 0) > 0,
    });
    const after = await read();
    const played = await qa.battle.events(cursor, { match: { kind: "cardPlayed", instance: source } });
    const discarded = await qa.battle.events(cursor, { match: { kind: "discarded", instance: discard } });
    const granted = await qa.battle.events(cursor, { match: { kind: "pointsScored", side: "enemy" } });
    if (after.inFlight || after.pending !== null || after.state.sides.player.currentEnergy !== (mode === 2 ? 1 : 2) ||
      after.state.sides.player.score !== 1 || after.state.sides.enemy.score !== (mode === 2 ? 0 : 5) ||
      after.state.instances[discard]?.zone !== "void" || played.events.length !== 1 || discarded.events.length !== 1 ||
      granted.events.length !== (mode === 2 ? 0 : 1) ||
      (mode === 3 && (granted.events[0]?.event.kind !== "pointsScored" || granted.events[0].event.amount !== 5))) {
      throw new Error("selected base did not pay and resolve exactly once");
    }
    await qa.battle.waitFor(battle => battle.prompt === null && battle.canPass, { label: "payment presentation settled" });
    await qa.assertCaps(`route ${String(mode)} complete`);
    if (mode === 3) await qa.capture(`route-metadata-paid-${qa.viewportName}`);
    results.push({ mode, route: prompt.options[mode].route, source, sourcePrinting: before.state.instances[source]?.printing,
      discard, discardPrinting: before.state.instances[discard]?.printing, options: prompt.options, offered,
      energy: after.state.sides.player.currentEnergy, scores: [after.state.sides.player.score, after.state.sides.enemy.score],
      played: played.events, discarded: discarded.events, granted: granted.events });
  }
  return { viewport: qa.viewportName, results };
}
