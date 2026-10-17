import { afterEach, describe, expect, it } from "vitest";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { pendingEnginePrompt } from "../battle/engine-battle";
import { createLocalLog } from "../../eventlog/local-log";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { GENESIS, ctx, event, initial, accepted, apply, entry, purgePayload, TEETH, JELLY, FRUIT, TOME, battleWorld, installStarter, tutorialBattle, clear } from "./journey-rewards272-fixtures";
import { testCardId, testEventActor } from "../../types/test-identities";
import { parseCardTypeChangePredicateId } from "../../types/identifiers";
import { foldEvents } from "../../eventlog/fold";
import { engine as tutorialEngine } from "../battle/tutorial-contracts-fixture";
import { parseBattleId, parseTutorialRunId } from "../../types/identifiers";
import { parseCardSubtype } from "../../types/card-identity";
afterEach(clear);
describe("starter acquisition public fold", () => {
  it("offers zero through the catalog limit of exact starter entries, with UUID duplicate physical entries distinct", () => {
    const before = initial([FRUIT], [entry(1, 1), entry(2, 1), entry(3), entry(4), entry(5), entry(9)]);
    const gained = accepted(before, "ADD_DREAMSIGN", { dreamsignId: TEETH });
    expect(gained.journey.screen).toMatchObject({ type: "journeyStarterPurge", choice: { sources: [{ maxCount: 4, heldIndex: 1 }] } });
    for (const bad of [["rewards272-entry-1", "rewards272-entry-1"], ["rewards272-entry-9"], ["missing"], [1], [1, 2, 3, 4, 5].map((n) => `rewards272-entry-${n}`)]) {
      const result = apply(gained, "RESOLVE_STARTER_PURGE", purgePayload(gained.journey, bad));
      expect(result.state).toBe(gained); expect(result.outcome).toBe("bounced");
    }
    const selected = [1, 2, 3, 4].map((n) => `rewards272-entry-${n}`), payload = purgePayload(gained.journey, selected);
    const result = apply(gained, "RESOLVE_STARTER_PURGE", payload);
    expect(result.state.journey.deck.map((card) => card.entryId)).toEqual(["rewards272-entry-5", "rewards272-entry-9"]);
    expect(result.state.journey.essence).toBe(112); expect(result.outcome === "applied" ? result.purges : []).toHaveLength(4);
    expect(result.logRecords?.find((row) => row.event === "journey_starter_purge_resolved")?.fields.purges).toHaveLength(4);
    expect(apply(result.state, "RESOLVE_STARTER_PURGE", payload).state).toBe(result.state);
    expect(before.journey.deck).toHaveLength(6);
  });
  it.each([0, 1, 4, 8])("declines an earned choice with %i starters and consumes no Essence", (count) => {
    let s = initial([], Array.from({ length: count }, (_, n) => entry(n + 1, 1)));
    s = accepted(s, "ADD_DREAMSIGN", { dreamsignId: TEETH });
    s = accepted(s, "RESOLVE_STARTER_PURGE", purgePayload(s.journey));
    expect(s.journey.deck).toHaveLength(count); expect(s.journey.essence).toBe(100); expect(s.journey.screen.type).toBe("journeyStart");
  });
  it("retains an earned source after loss/reload, rejects stale confirmations, and prevents late acquisitions", () => {
    let s = accepted(initial(), "ADD_DREAMSIGN", { dreamsignId: TEETH }, { seq: 21 });
    const payload = purgePayload(s.journey, ["rewards272-entry-1"]);
    for (const patch of [{ permissionSeq: 20 }, { heldIndex: 7 }, { choiceIndex: 1 }]) expect(apply(s, "RESOLVE_STARTER_PURGE", { ...payload, ...patch }).state).toBe(s);
    expect(apply(s, "ADD_DREAMSIGN", { dreamsignId: TEETH }).state).toBe(s);
    s = accepted(s, "REMOVE_DREAMSIGN", { dreamsignId: TEETH });
    s = accepted(s, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(s.journey)) });
    s = accepted(s, "RESOLVE_STARTER_PURGE", payload); expect(s.journey.deck).toHaveLength(5);
  });
  it("uses base starter identity despite permanent variant changes, and does not trust a loaded fabricated choice", () => {
    const base = initial(); base.journey.deck[0] = { ...base.journey.deck[0], typeChange: { predicateId: parseCardTypeChangePredicateId("starter-modified"), cardType: "Character", subtype: parseCardSubtype("Warrior"), label: "" } };
    const gained = accepted(base, "ADD_DREAMSIGN", { dreamsignId: TEETH });
    if (gained.journey.screen.type !== "journeyStarterPurge") throw new Error("missing permission");
    const choice = gained.journey.screen.choice;
    for (const patch of [{ index: -1 }, { permissionSeq: "1" }, { sources: [{ ...choice.sources[0], maxCount: 100 }] }, { continuation: { type: "journeyStarterPurge", choice } }, { suspendedBattle: { battleId: "foreign", mode: "journey" } }]) {
      expect(apply(gained, "LOAD_STATE", { snapshot: { ...gained.journey, screen: { type: "journeyStarterPurge", choice: { ...choice, ...patch } } } }).state).toBe(gained);
    }
    expect(accepted(gained, "RESOLVE_STARTER_PURGE", purgePayload(gained.journey, [base.journey.deck[0].entryId])).journey.deck).toHaveLength(5);
  });
  it("perfects every eligible unformed starter, preserving UUID identity, preformed cards and D39 fields", () => {
    const before = initial([TOME], [entry(1), entry(2), entry(8), entry(9)]);
    before.journey.deck[0] = { ...before.journey.deck[0], sparkBonus: 3, typeChange: { predicateId: parseCardTypeChangePredicateId("starter-modified"), cardType: "Character", subtype: parseCardSubtype("Warrior"), label: "" } };
    before.journey.deck[1] = { ...before.journey.deck[1], transfiguration: "Inspired" };
    const result = apply(before, "ADD_DREAMSIGN", { dreamsignId: JELLY });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.deck).toEqual([{ ...before.journey.deck[0], transfiguration: "Perfected" }, ...before.journey.deck.slice(1)]);
    expect(result.logRecords?.find((row) => row.fields.dreamsignId === JELLY)?.fields.transformations).toEqual([{ entryId: before.journey.deck[0].entryId, cardId: testCardId("rewards272-card-1"), type: "Perfected" }]);
    const repeated = accepted(result.state, "ADD_DREAMSIGN", { dreamsignId: JELLY }); expect(repeated.journey.deck).toEqual(result.state.journey.deck);
  });
  it("supplies actual Event transformations to held copy sources without recursively copying gains", () => {
    const before = initial([TOME], [entry(1), entry(2)]);
    const result = accepted(before, "ADD_DREAMSIGN", { dreamsignId: JELLY });
    expect(result.journey.deck).toHaveLength(4); expect(new Set(result.journey.deck.map((e) => e.entryId)).size).toBe(4);
    expect(result.journey.deck.every((e) => e.transfiguration === "Perfected")).toBe(true);
  });
  it("suspends the exact battle and resolves a restored earned choice while the battle owes a prompt", () => {
    const w = battleWorld({ discard: true, held: [] }); installStarter();
    const suspended = accepted(w.state, "ADD_DREAMSIGN", { dreamsignId: TEETH });
    expect(suspended.battle).toBe(w.state.battle);
    const card = w.state.battle!.engine.slice.committed.sides.player.hand[0];
    let played = accepted(w.state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } });
    for (let n = 0; n < 4 && pendingEnginePrompt(played.battle, w.engine) === null; n++) {
      const side = w.engine.decision(played.battle!.engine.slice.committed)?.side;
      if (side === undefined) throw new Error("No pass before fixture prompt");
      played = accepted(played, "BATTLE_ACTION", { side, action: { kind: "pass" } });
    }
    expect(pendingEnginePrompt(played.battle, w.engine)).not.toBeNull();
    let restored = accepted(suspended, "LOAD_STATE", { snapshot: structuredClone(suspended.journey), battle: structuredClone(played.battle) });
    const payload = purgePayload(restored.journey);
    expect(apply(restored, "RESOLVE_STARTER_PURGE", { ...payload, permissionSeq: -1 }).state).toBe(restored);
    expect(apply(restored, "BATTLE_CANCEL", { side: "player", promptId: pendingEnginePrompt(restored.battle, w.engine)!.prompt.id }).state).toBe(restored);
    restored = accepted(restored, "RESOLVE_STARTER_PURGE", payload);
    expect(restored.battle).toEqual(played.battle); expect(restored.journey.screen).toEqual(w.state.journey.screen);
  });
  it.each(["atlas", "journeyComplete", "journeyFailed"] as const)("restores the exact %s continuation and separates repeated same-slot acquisitions by sequence", (route) => {
    const before = initial([TEETH]); before.journey.screen = { type: route };
    let state = accepted(before, "ADD_DREAMSIGN", { dreamsignId: TEETH }, { seq: 20 });
    const old = purgePayload(state.journey);
    state = accepted(state, "RESOLVE_STARTER_PURGE", old);
    expect(state.journey.screen).toEqual(before.journey.screen);
    state = accepted(state, "ADD_DREAMSIGN", { dreamsignId: TEETH, purgeIndex: 1 }, { seq: 22 });
    expect(purgePayload(state.journey)).toMatchObject({ heldIndex: 1, permissionSeq: 22 });
    expect(apply(state, "RESOLVE_STARTER_PURGE", old).state).toBe(state);
    state = accepted(state, "RESOLVE_STARTER_PURGE", purgePayload(state.journey));
    expect(state.journey.screen).toEqual(before.journey.screen); expect(state.journey.deck).toEqual(before.journey.deck);
  });
  it("contains unavailable content atomically in the actual log and retries from the same acquisition", () => {
    const initialState = initial([], [entry(1), entry(2)]);
    let fail = true;
    registerJourneyTransfigurationProvider({ resolve: (e) => { if (fail && e.cardNumber === 2) throw new Error("synthetic starter content failure"); return { cardId: testCardId(`rewards272-card-${e.cardNumber}`), cardType: "Event", subtype: parseCardSubtype(""), forms: [], starter: true, perfectedEligible: true }; } });
    const config = { ...GAME_ENGINE_CONFIG, genesisState: () => initialState, reducer: (state: typeof initialState, intent: ReturnType<typeof event>, context: ReturnType<typeof ctx>) => apply(state, intent.type as "ADD_DREAMSIGN", intent.payload, context) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: testEventActor("alice"), devMode: false, now: () => ctx().timestamp });
    const records: unknown[] = []; log.subscribe((record) => records.push(record));
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: JELLY } }); expect(log.state()).toEqual(initialState);
    fail = false; log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: JELLY } }); expect(log.state().journey.deck.every((e) => e.transfiguration === "Perfected")).toBe(true);
    expect(records[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" });
  });
});

it("acquires, reloads and resolves a tutorial starter permission while retaining the run and resuming its actual battle", () => {
  const before = tutorialBattle();
  expect(before.journey.screen.type).toBe("journeyStart");
  const config = { ...GAME_ENGINE_CONFIG, genesisState: () => before, reducer: (state: typeof before, intent: ReturnType<typeof event>, context: ReturnType<typeof ctx>) => apply(state, intent.type as "ADD_DREAMSIGN", intent.payload, context) };
  const log = createLocalLog({ config, genesis: GENESIS, localActor: testEventActor("tutorial-starter"), devMode: false, now: () => ctx().timestamp });
  const outcomes: unknown[] = []; log.subscribe((record) => outcomes.push(record));
  log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: TEETH } });
  expect(outcomes[outcomes.length - 1]).toMatchObject({ outcome: "applied" });
  const earned = log.state(); expect(earned.journey.screen).toMatchObject({ type: "journeyStarterPurge", choice: { continuation: before.journey.screen, suspendedBattle: { mode: "tutorial", battleId: before.battle!.init.battleId } } });
  expect(earned.battle).toBe(before.battle); expect(earned.frontDoor).toBe(before.frontDoor);
  const snapshot = structuredClone(earned.journey), battle = structuredClone(earned.battle);
  const payload = purgePayload(earned.journey);
  expect(apply(earned, "LOAD_STATE", { snapshot }).state).toBe(earned);
  expect(apply(earned, "LOAD_STATE", { snapshot, battle: { ...battle!, init: { ...battle!.init, battleId: parseBattleId("foreign-tutorial") } } }).state).toBe(earned);
  const wrongPhase = { ...earned, frontDoor: { ...earned.frontDoor, phase: "journey" as const } };
  expect(apply(wrongPhase, "LOAD_STATE", { snapshot, battle }).state).toBe(wrongPhase);
  const wrongRun = { ...earned, frontDoor: { ...earned.frontDoor, tutorial: { ...before.frontDoor.tutorial!, runId: parseTutorialRunId("foreign-run") } } };
  expect(apply(wrongRun, "LOAD_STATE", { snapshot, battle }).state).toBe(wrongRun);
  log.append({ type: "LOAD_STATE", payload: { snapshot, battle } }); expect(outcomes[outcomes.length - 1]).toMatchObject({ outcome: "applied" });
  const restored = log.state(); expect(restored.journey.screen).toEqual(earned.journey.screen); expect(restored.journey.deck).toEqual(earned.journey.deck); expect(restored.battle).toEqual(earned.battle); expect(restored.frontDoor).toBe(earned.frontDoor);
  expect(apply(restored, "RESOLVE_STARTER_PURGE", { ...payload, permissionSeq: -1 }).state).toBe(restored);
  log.append({ type: "RESOLVE_STARTER_PURGE", payload }); expect(outcomes[outcomes.length - 1]).toMatchObject({ outcome: "applied" });
  const resolved = log.state(); expect(resolved.journey.screen).toEqual(before.journey.screen); expect(resolved.battle).toBe(restored.battle); expect(resolved.frontDoor).toBe(restored.frontDoor);
  const side = tutorialEngine.decision(resolved.battle!.engine.slice.committed)?.side; expect(side).toBeDefined();
  log.append({ type: "BATTLE_ACTION", payload: { side, action: { kind: "pass" } } }); expect(outcomes[outcomes.length - 1]).toMatchObject({ outcome: "applied" });
  expect(log.state().battle).not.toBe(resolved.battle); expect(log.state().frontDoor).toBe(resolved.frontDoor);
  expect(foldEvents(config, GENESIS, { seq: 0, state: before }, [...(JSON.parse(JSON.stringify(log.events())) as ReturnType<typeof log.events>)]).state).toEqual(JSON.parse(JSON.stringify(log.state())));
});
