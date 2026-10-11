// A one-call judged-QA setup: --arg card=<lab uuid> --arg
// stage=hand:player:<uuid>,play:enemy:<uuid>,void:player:<uuid>.
// A bead-local judged scenario can use the same helpers, then exercise its
// card-specific interactions before taking captures and returning evidence.
export const viewports = ["desktop", "mobile"];

/** @param {import("../prelude.mjs").Qa} qa */
export default async function cardLabStage(qa) {
  const card = qa.args.card;
  if (card === undefined) throw new Error("card-lab-stage needs --arg card=<uuid>");
  if (qa.args.probeHistory === "1") {
    // Plain as=enemy performs a genuine constructor-script play before the
    // debug panel's lazy import. Later response passes are live intents.
    await qa.open(`/?goto=card-lab&card=${encodeURIComponent(card)}&variant=base&as=enemy&seed=1&debug=1`);
    await qa.waitFor("the load-time engine probe", () => "__engineProbe" in window, null);
    const setup = await qa.battle.events(null, { match: { kind: "cardPlayed", side: "enemy" } });
    const played = setup.events[0];
    if (setup.events.length !== 1 || played?.instance === null || played === undefined ||
        played.cards[played.instance] !== card || played.event.kind !== "cardPlayed") {
      throw new Error(`load-time constructor play missing its physical and printing identities: ${JSON.stringify(setup)}`);
    }
    const source = played.instance;
    const cursor = await qa.battle.eventCursor();
    await qa.battle.playUntil(async (battle) => {
      const zone = await qa.read((id) => {
        const probe = /** @type {Window & { __engineProbe?: { slice: import("../../../src/engine/fold/slice").BattleSlice } }} */ (window).__engineProbe;
        return probe?.slice.committed.instances[id]?.zone ?? null;
      }, source);
      return zone === "play" && battle.canPass && (battle.probe?.stack ?? 0) === 0;
    }, { label: "load-time enemy character materializes through live response intents", timeout: 60_000,
      passWhen: (battle) => (battle.probe?.stack ?? 0) > 0 });
    const live = await qa.battle.events(cursor);
    if (!live.events.some(({ event }) => event.kind === "materialized" && event.instance === source) ||
        live.events.some(({ seq }) => seq <= played.seq)) {
      throw new Error(`live events must follow the setup load: ${JSON.stringify(live)}`);
    }
    await qa.battle.pass();
    const later = await qa.battle.waitForEvents(live.cursor, {}, { label: "a subsequent committed response or phase batch" });
    await qa.battle.waitFor((battle) => battle.canPass && battle.prompt === null,
      { label: "the next human response or phase control" });
    const all = await qa.battle.events(null, { limit: 500 });
    const retained = new Set(all.events.map(({ seq, index }) => `${String(seq)}:${String(index)}`));
    if (live.events.some(({ seq, index }) => !retained.has(`${String(seq)}:${String(index)}`)) ||
        later.events.some(({ seq }) => seq <= live.cursor.seq)) {
      throw new Error("earlier live publications must survive a later committed intent");
    }
    if (all.more) throw new Error("probe history fixture exceeds one complete comparison page");
    const paged = [];
    /** @type {import("../prelude.mjs").EventCursor | null} */
    let after = null;
    let more = true;
    while (more) {
      const page = await qa.battle.events(after, { limit: 1 });
      paged.push(...page.events);
      after = page.cursor;
      more = page.more;
    }
    const keys = (/** @type {import("../prelude.mjs").ObservedEvent[]} */ records) =>
      records.map(({ seq, index }) => `${String(seq)}:${String(index)}`);
    if (JSON.stringify(keys(paged)) !== JSON.stringify(keys(all.events)) ||
        new Set(keys(paged)).size !== paged.length) throw new Error("paged history lost or duplicated sibling events");
    const tail = await qa.battle.events(after);
    if (tail.events.length !== 0 || JSON.stringify(tail.cursor) !== JSON.stringify(after)) throw new Error("empty history read changed its cursor");
    const geometry = await qa.read(() => {
      const opener = document.querySelector('[data-testid="engine-debug-open"]');
      const box = opener?.getBoundingClientRect();
      const hit = box === undefined ? null : document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { x: box?.x ?? -1, y: box?.y ?? -1, width: box?.width ?? 0, height: box?.height ?? 0,
        inViewport: box !== undefined && box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        hit: opener !== null && hit !== null && opener.contains(hit) };
    }, null);
    if (!geometry.inViewport || !geometry.hit || geometry.width <= 0 || geometry.height <= 0) throw new Error("debug opener geometry is not actionable");
    await qa.assertCaps("constructor seed, live publication and cursor paging");
    return { source, printing: card, setup: played, setupCount: setup.events.length, live: live.events, later: later.events,
      keys: keys(paged), tail, geometry };
  }
  if (qa.args.declared === "1") {
    const one = "5e5e5e5e-0000-4000-8000-000000000002";
    const three = "5e5e5e5e-0000-4000-8000-000000000004";
    const event = "5e5e5e5e-0000-4000-8000-00000000000b";
    const interrupt = "5e5e5e5e-0000-4000-8000-00000000000e";
    const spell = "5e5e5e5e-0000-4000-8000-0000000000d1";
    const ids = await qa.labStage({
      player: { front: [null, three], back: [null, one, one], hand: [interrupt, spell], void: [event], energy: 7 },
      enemy: { back: [card, card], hand: [event, event], energy: 9 },
      enemyScript: [
        { kind: "play", ref: { zone: "hand", index: 1 } },
        { kind: "advance", ref: { zone: "back", index: 1 }, lane: 2 },
        { kind: "challenge" },
      ],
    }, { card, as: "enemy" });
    const selected = ids.enemy.back[1];
    const played = ids.enemy.hand[1];
    if (selected === null || selected === undefined || played === undefined || ids.enemy.back[0] === selected || ids.enemy.hand[0] === played) throw new Error("declared lab collapsed duplicate physical cards");
    const read = () => qa.read(() => {
      const probe = /** @type {Window & { __engineProbe?: { slice: import("../../../src/engine/fold/slice").BattleSlice, events: { kind: string, instance: import("../../../src/engine/state/ids").InstanceId | null }[] } }} */ (window).__engineProbe;
      if (probe === undefined) throw new Error("declared lab probe missing");
      return { state: probe.slice.committed, events: probe.events };
    }, null);
    await qa.battle.playUntil(async (battle) => {
      const state = (await read()).state;
      return state.challenge?.challengers.includes(selected) === true && state.turn.phase === "dusk" && battle.canPass && battle.prompt === null;
    },
      { label: "selected enemy physical character designated for Challenge", timeout: 60_000, passWhen: (battle) => (battle.probe?.stack ?? 0) > 0 });
    const designated = await read();
    if (designated.state.sides.enemy.frontRank[2] !== selected || designated.state.sides.enemy.backRank[0] !== ids.enemy.back[0] || designated.state.instances[played]?.zone !== "void") throw new Error("declared lab selected the wrong physical instance");
    if (designated.state.sides.player.frontRank[1] !== ids.player.front[1] || designated.state.sides.player.backRank[1] !== ids.player.back[1] || designated.state.sides.player.backRank[2] !== ids.player.back[2]) throw new Error("declared F1 requires both adjacent B1/B2 supporters");
    for (const instance of [ids.player.front[1], ids.player.back[1], ids.player.back[2], selected]) {
      await qa.waitVisible(`[data-battlefield-card][data-battle-card-id="${instance}"]`);
    }
    const geometry = await qa.read((physical) => physical.map((id) => {
      const element = document.querySelector(`[data-battlefield-card][data-battle-card-id="${id}"]`);
      const box = element?.getBoundingClientRect();
      const point = box === undefined ? null : document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { id, slot: element?.closest("[data-battle-slot-id]")?.getAttribute("data-battle-slot-id") ?? null, rank: element?.closest("[data-battle-rank]")?.getAttribute("data-battle-rank") ?? null, width: box?.width ?? 0, height: box?.height ?? 0, hit: element !== null && point !== null && element.contains(point) };
    }), [ids.player.front[1], ids.player.back[1], ids.player.back[2], selected]);
    if (geometry.some((box) => box.width <= 0 || box.height <= 0 || !box.hit)) throw new Error(`declared lab board geometry ${JSON.stringify(geometry)}`);
    if (geometry[0]?.slot !== "F1" || geometry[0]?.rank !== "player-front" || geometry[1]?.slot !== "B1" || geometry[1]?.rank !== "player-back" || geometry[2]?.slot !== "B2" || geometry[2]?.rank !== "player-back") throw new Error(`declared lab support DOM links ${JSON.stringify(geometry)}`);
    await qa.capture(`card-lab-declared-${qa.viewportName}`);
    const resolved = await qa.battle.playUntil(async (battle) => {
      const now = await read();
      return now.events.some((event) => event.kind === "laneResolved") && now.state.turn.active === "player" && now.state.turn.phase === "day" && battle.canPass;
    }, { label: "selected enemy Challenge resolves through normal phases", timeout: 60_000 });
    // The declared human energy permits this 2-energy Fast spell on its real turn.
    const humanSpell = ids.player.hand[1];
    if (humanSpell === undefined) throw new Error("declared spell physical reference missing");
    await qa.battle.tap(`[data-battlefield-card][data-battle-card-id="${humanSpell}"]`);
    await qa.battle.playUntil(async () => (await read()).state.instances[humanSpell]?.zone === "void",
      { label: "declared human energy pays for the spell", timeout: 60_000, passWhen: (battle) => (battle.probe?.stack ?? 0) > 0 });
    const paid = (await read()).state.sides.player;
    if (paid.currentEnergy !== 5 || paid.maxEnergy !== 7) throw new Error("declared human spell requires exact 7 to 5 energy payment");
    const logs = await qa.waitFor("persisted declared script action logs", async ({ played, selected }) => {
      const game = new URLSearchParams(location.search).get("game");
      if (game === null) return null;
      /** @type {Promise<IDBDatabase>} */
      const opened = new Promise((resolve, reject) => {
        const request = indexedDB.open("dreamtides-local-games");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("declared lab database open failed"));
      });
      const database = await opened;
      try {
        const prefix = `game/${game}/log/`;
        /** @type {Promise<unknown[]>} */
        const reading = new Promise((resolve, reject) => {
          const request = database.transaction("records", "readonly").objectStore("records").getAll(IDBKeyRange.bound(prefix, `${prefix}￿`, false, true));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error("declared lab log read failed"));
        });
        const chunks = await reading;
        const actions = chunks.flatMap((chunk) => {
          if (!Array.isArray(chunk)) throw new Error("declared lab log chunk malformed");
          return chunk.flatMap((line) => {
            if (typeof line !== "string") throw new Error("declared lab log line malformed");
            const entry = /** @type {unknown} */ (JSON.parse(line));
            if (entry === null || typeof entry !== "object" || !("event" in entry) || entry.event !== "engine.action" || !("side" in entry) || entry.side !== "enemy" || !("action" in entry)) return [];
            const action = entry.action;
            if (action === null || typeof action !== "object" || !("kind" in action) || typeof action.kind !== "string") throw new Error("declared lab action log malformed");
            return [{ kind: action.kind, card: "card" in action && typeof action.card === "string" ? action.card : null }];
          });
        });
        return actions.some((action) => action.kind === "play" && action.card === played) && actions.some((action) => action.kind === "reposition" && action.card === selected) && actions.some((action) => action.kind === "pass") ? actions : null;
      } finally { database.close(); }
    }, { played, selected });
    await qa.assertCaps("declared staging, live script, Challenge and human spell");
    if (qa.viewportName === "desktop") await qa.capture("card-lab-declared-spell-desktop");
    return { ids, selected, played, geometry, resolved, logs, payment: { current: paid.currentEnergy, maximum: paid.maxEnergy } };
  }
  await qa.open(`/?goto=card-lab&card=${encodeURIComponent(card)}&variant=${encodeURIComponent(qa.args.variant ?? "base")}&as=${encodeURIComponent(qa.args.as ?? "player")}&seed=1&debug=1`);
  await qa.waitFor("the engine probe", () => "__engineProbe" in window, null);
  const instances = [];
  for (const item of (qa.args.stage ?? "").split(",").filter(Boolean)) {
    const [zone, side, uuid] = item.split(":");
    instances.push(await qa.labAddCard(
      /** @type {"hand" | "play" | "void"} */ (zone),
      /** @type {"player" | "enemy"} */ (side),
      uuid,
    ));
  }
  await qa.assertCaps("staged board");
  await qa.capture(`card-lab-stage-${qa.viewportName}`);
  return { instances };
}
