// Observes attributed engine events through the debug probe (`debug=1`)
// with the battle driver's event helpers (`qa.battle.eventCursor`,
// `events`, `waitForEvents`), matching each event by its engine identities
// rather than by its place in the event order.
//
// A declared card-lab gives the player a floating draw trigger's source
// (`--arg source=<uuid>`, default Quiet Reflection: "Until end of turn, when
// you materialize a character, draw a card") and a 1-cost synthetic
// character (`--arg character=<uuid>`). The scenario plays the source and
// matches its `effectStarted`; plays the character and matches the floating
// `triggerQueued` by source and controller, its `triggerResolved`, and the
// player's `cardDrawn` by side and the deck's top instance, whose printing
// UUID it checks; reads twice with no new event; then passes the turn and
// matches the enemy's `cardDrawn` by side and its deck's top instance.
export const viewports = ["desktop", "mobile"];

/** @param {import("../prelude.mjs").Qa} qa */
export default async function engineEvents(qa) {
  const sourceCard = qa.args.source ?? "f160fd01-b3c3-4904-b15f-339f6fcf5ca5";
  const characterCard = qa.args.character ?? "5e5e5e5e-0000-4000-8000-000000000002";
  const ids = await qa.labStage({ player: { hand: [sourceCard, characterCard], energy: 7 } }, { card: sourceCard, as: "player" });
  const [source, character] = ids.player.hand;
  if (source === undefined || character === undefined) throw new Error("engine-events: the declared hand is missing a card");
  await qa.waitVisible("[data-battle-mobile]");
  await qa.battle.waitFor((battle) => battle.window === "main" && battle.canPass, { label: "the player's main phase" });

  /** The committed zone of an instance, and each side's deck top with its printing UUID. */
  const read = (/** @type {string} */ instance) => qa.read((id) => {
    const probe = /** @type {Window & { __engineProbe?: { slice: import("../../../src/engine/fold/slice").BattleSlice } }} */ (window).__engineProbe;
    if (probe === undefined) throw new Error("engine-events: missing engine probe");
    const { committed } = probe.slice;
    /** @param {"player" | "enemy"} side */
    const top = (side) => {
      const first = committed.sides[side].deck[0] ?? null;
      const printing = first === null ? undefined : committed.instances[first]?.printing;
      return { instance: first, card: printing?.kind === "card" ? printing.cardId : null };
    };
    const entry = Object.values(committed.instances).find((candidate) => candidate.id === id);
    return { zone: entry?.zone ?? null, stack: committed.stack.length, player: top("player"), enemy: top("enemy") };
  }, instance);

  /** Plays a hand card through the UI, passing only respond windows, until it leaves the stack. */
  const play = async (/** @type {string} */ instance, /** @type {string} */ zone) => {
    const selector = `[data-battlefield-card][data-battle-card-id="${instance}"]`;
    for (let attempt = 0; attempt < 5 && (await read(instance)).zone === "hand"; attempt++) {
      await qa.battle.tap(selector);
      await qa.sleep(400);
    }
    await qa.battle.playUntil(async (battle) => {
      const now = await read(instance);
      return now.zone === zone && now.stack === 0 && battle.prompt === null && battle.window === "main" && battle.canPass;
    }, { label: `play ${instance} to ${zone}`, timeout: 60_000, passWhen: (battle) => (battle.probe?.stack ?? 0) > 0 });
  };

  const start = await qa.battle.eventCursor();
  await play(source, "void");
  const effect = await qa.battle.waitForEvents(start, { kind: "effectStarted", source, controller: "player" });

  const expected = (await read(character)).player;
  if (expected.instance === null || expected.card === null) throw new Error("engine-events: the player's deck has no card on top");
  const beforeCharacter = await qa.battle.eventCursor();
  await play(character, "play");
  const queued = await qa.battle.waitForEvents(beforeCharacter, { kind: "triggerQueued", source, controller: "player", subject: character });
  const trigger = queued.events[0]?.event;
  if (queued.events.length !== 1 || trigger?.kind !== "triggerQueued" || trigger.node === null) {
    throw new Error(`engine-events: expected one floating trigger, saw ${JSON.stringify(queued.events)}`);
  }
  if (queued.events[0]?.cards[source] !== sourceCard) throw new Error("engine-events: the trigger's source is not the declared source card");
  const resolved = await qa.battle.waitForEvents(beforeCharacter, { kind: "triggerResolved", source, controller: "player", node: trigger.node, applied: true });
  const drawn = await qa.battle.waitForEvents(beforeCharacter, { kind: "cardDrawn", side: "player", instance: expected.instance });
  if (drawn.events[0]?.cards[expected.instance] !== expected.card) throw new Error("engine-events: the drawn instance's printing changed");
  const draws = await qa.battle.events(beforeCharacter, { match: { kind: "cardDrawn" } });
  if (draws.events.length !== 1) throw new Error(`engine-events: expected exactly one draw, saw ${JSON.stringify(draws.events)}`);

  // Nothing acts at the player's settled main phase: two reads observe no new event.
  const settled = await qa.battle.eventCursor();
  const quiet = [await qa.battle.events(settled), await qa.battle.events(settled)];
  if (quiet.some((page) => page.events.length > 0 || JSON.stringify(page.cursor) !== JSON.stringify(settled))) {
    throw new Error(`engine-events: a settled battle published events ${JSON.stringify(quiet)}`);
  }

  await qa.waitVisible(`[data-battlefield-card][data-battle-card-id="${expected.instance}"]`);
  await qa.assertCaps("the floating trigger's draw");
  await qa.capture(`engine-events-${qa.viewportName}`);
  if (qa.viewportName === "desktop") {
    await qa.capture("engine-events-drawn-desktop", { element: `[data-battlefield-card][data-battle-card-id="${expected.instance}"]`, pad: 24 });
  }

  // The enemy's draw at its turn, matched by side and its deck's top instance.
  const enemyTop = (await read(character)).enemy;
  if (enemyTop.instance === null) throw new Error("engine-events: the enemy's deck has no card on top");
  const beforeTurn = await qa.battle.eventCursor();
  await qa.battle.playUntil(async () => (await qa.battle.events(beforeTurn, { match: { kind: "cardDrawn", side: "enemy" } })).events.length > 0,
    { label: "the enemy's draw", timeout: 90_000 });
  const enemyDraw = await qa.battle.waitForEvents(beforeTurn, { kind: "cardDrawn", side: "enemy" });
  const first = enemyDraw.events[0];
  if (first?.instance !== enemyTop.instance || first.cards[enemyTop.instance] !== enemyTop.card) {
    throw new Error(`engine-events: the enemy drew ${JSON.stringify(first)}, not its deck's top ${JSON.stringify(enemyTop)}`);
  }
  await qa.assertCaps("the enemy's draw");

  /** @param {{ events: Array<{ seq: number, index: number }> }} page */
  const keys = (page) => page.events.map(({ seq, index }) => [seq, index]);
  return {
    battleId: start.battleId,
    source: { instance: source, card: sourceCard, effect: keys(effect) },
    trigger: { key: keys(queued)[0], node: trigger.node, subject: character, resolved: keys(resolved) },
    playerDraw: { key: keys(drawn)[0], instance: expected.instance, card: expected.card },
    enemyDraw: { key: [first.seq, first.index], instance: first.instance, card: first.cards[enemyTop.instance] ?? null },
    quiet: settled,
  };
}
