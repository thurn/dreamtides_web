// Declared enemy activation through the normal host; the host chooses the
// void target, and evidence records the accepted physical target.
export const viewports = ["desktop", "mobile"];

/** @param {import("../prelude.mjs").Qa} qa */
export default async function enemyActivate(qa) {
  const card = "db4618f6-121b-4c97-98d3-c29849c5824e";
  const targetCard = "5e5e5e5e-0000-4000-8000-00000000000c";
  const ids = await qa.labStage({
    player: { hand: ["5e5e5e5e-0000-4000-8000-00000000000e", "5e5e5e5e-0000-4000-8000-00000000000d"], energy: 1 },
    enemy: { back: [null, card], hand: [], void: [targetCard, targetCard], energy: 0 },
    enemyScript: [{ kind: "activate", ref: { zone: "back", index: 1 }, ability: 0 }],
  }, { card, as: "enemy" });
  const source = ids.enemy.back[1];
  const other = ids.enemy.back[0];
  if (source === null || source === undefined || other === source) throw new Error("activation source is not a distinct physical card");
  const read = () => qa.read(() => {
    const probe = /** @type {Window & { __engineProbe?: { slice: import("../../../src/engine/fold/slice").BattleSlice } }} */ (window).__engineProbe;
    if (probe === undefined) throw new Error("activation probe missing");
    return probe.slice;
  }, null);
  const control = { geometry: /** @type {{ x: number, y: number, width: number, height: number, hit: boolean, viewport: { width: number, height: number } } | null} */ (null) };
  await qa.battle.playUntil(async () => {
    const slice = await read();
    return slice.inFlight === null && slice.committed.stack.length === 0 && slice.committed.floating.some((effect) => effect.source === source && effect.change.kind === "keyword");
  }, { label: "declared enemy activation grants reclaim", timeout: 60_000, before: async (battle) => {
    if (control.geometry === null && battle.canPass && battle.window === "respond") control.geometry = await qa.read(() => {
      const element = document.querySelector("[data-battle-phase-next] button");
      const box = element?.getBoundingClientRect();
      const hit = box === undefined ? null : document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { x: box?.x ?? -1, y: box?.y ?? -1, width: box?.width ?? 0, height: box?.height ?? 0, hit: element !== null && hit !== null && element.contains(hit), viewport: { width: innerWidth, height: innerHeight } };
    }, null);
    return false;
  }, passWhen: (battle) => (battle.probe?.stack ?? 0) > 0 });
  if (control.geometry === null || control.geometry.width <= 0 || control.geometry.height <= 0 || !control.geometry.hit) throw new Error("activation response control geometry missing");
  const slice = await read();
  const state = slice.committed;
  const activation = await qa.battle.waitForEvents(null, { kind: "abilityActivated", side: "enemy", source, ability: 0 });
  const effects = await qa.battle.waitForEvents(null, { kind: "effectStarted", controller: "enemy", source });
  const event = effects.events[0]?.event;
  if (activation.events.length !== 1 || activation.events[0]?.cards[source] !== card || event?.kind !== "effectStarted" || event.change.kind !== "keyword") throw new Error("activation event provenance mismatch");
  const change = event.change;
  if (effects.events.length !== 1 || change.kind !== "keyword" || change.keyword !== "reclaim" || !change.gains || !ids.enemy.void.includes(change.instance)) throw new Error("activation did not grant reclaim to a declared void card");
  const target = change.instance;
  if (state.instances[source]?.status.exhausted !== true || (other !== null && other !== undefined && state.instances[other]?.status.exhausted !== false) || state.instances[target]?.zone !== "void" || state.sides.enemy.currentEnergy !== 0) throw new Error("activation cost or target state mismatch");
  const intents = slice.history?.entries.flatMap((entry) => "intent" in entry ? [entry.intent] : []) ?? [];
  if (!intents.some((intent) => intent.kind === "battleAction" && intent.side === "enemy" && intent.action.kind === "activate" && intent.action.source === source && intent.action.ability === 0)) throw new Error("activation bypassed the intent history");
  const answers = intents.filter((intent) => intent.kind === "answer" && intent.side === "enemy");
  if (!answers.some((intent) => intent.kind === "answer" && Array.isArray(intent.value) && intent.value.includes(target))) throw new Error("activation target has no accepted enemy answer");
  const selector = `[data-battlefield-card][data-battle-card-id="${source}"]`;
  await qa.waitVisible(selector);
  const geometry = await qa.read((selector) => {
    const element = document.querySelector(selector);
    const box = element?.getBoundingClientRect();
    return { slot: element?.closest("[data-battle-slot-id]")?.getAttribute("data-battle-slot-id"), rank: element?.closest("[data-battle-rank]")?.getAttribute("data-battle-rank"), x: box?.x ?? -1, y: box?.y ?? -1, width: box?.width ?? 0, height: box?.height ?? 0, viewport: { width: innerWidth, height: innerHeight } };
  }, selector);
  if (geometry.slot !== "B1" || geometry.rank !== "enemy-back" || geometry.width <= 0 || geometry.height <= 0 || geometry.x < 0 || geometry.y < 0 || geometry.x + geometry.width > geometry.viewport.width || geometry.y + geometry.height > geometry.viewport.height) throw new Error(`activation source geometry ${JSON.stringify(geometry)}`);
  const logs = await qa.waitFor("persisted enemy activation and UUID prompt logs", async ({ source, target, card }) => {
    const game = new URLSearchParams(location.search).get("game");
    if (game === null) return null;
    /** @type {IDBDatabase} */
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open("dreamtides-local-games"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("activation log read failed")); });
    try {
      const prefix = `game/${game}/log/`;
      /** @type {unknown[]} */
      const chunks = await new Promise((resolve, reject) => { const request = database.transaction("records", "readonly").objectStore("records").getAll(IDBKeyRange.bound(prefix, `${prefix}￿`, false, true)); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("activation log read failed")); });
      /** @param {unknown} value @returns {value is Record<string, unknown>} */
      const record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
      const records = chunks.flatMap((chunk) => {
        if (!Array.isArray(chunk)) throw new Error("invalid activation log chunk");
        return /** @type {unknown[]} */ (chunk).map((line) => { if (typeof line !== "string") throw new Error("invalid activation log line"); const entry = /** @type {unknown} */ (JSON.parse(line)); if (!record(entry)) throw new Error("invalid activation log record"); return entry; });
      });
      const action = records.find((line) => line.event === "engine.action" && line.side === "enemy" && record(line.action) && line.action.kind === "activate" && line.action.source === source && line.action.ability === 0);
      const opened = records.find((line) => line.event === "engine.promptOpened" && line.side === "enemy" && line.cardId === card);
      const answered = records.find((line) => line.event === "engine.promptAnswered" && line.side === "enemy" && Array.isArray(line.value) && line.value.includes(target));
      return action !== undefined && opened !== undefined && answered !== undefined ? { game, action, opened, answered } : null;
    } finally { database.close(); }
  }, { source, target, card });
  await qa.assertCaps("declared enemy activation, cost, target and persisted intent");
  await qa.capture(`card-lab-enemy-activate-${qa.viewportName}`);
  return { battleId: ids.battleId, ids, source: { instance: source, card, ability: 0, exhausted: state.instances[source]?.status.exhausted }, target: { instance: target, card: targetCard, zone: state.instances[target]?.zone }, activation: activation.events, effect: effects.events, answers, geometry, controlGeometry: control.geometry, logs };
}
