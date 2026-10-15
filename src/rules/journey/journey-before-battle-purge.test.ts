import { afterEach, describe, expect, it } from "vitest";
import { createLocalLog } from "../../eventlog/local-log";
import { eventRng } from "../../eventlog/rng";
import { foldEvents } from "../../eventlog/fold";
import { parseAtlasNodeId, parseJourneyId } from "../../types/identifiers";
import { layerAtOrdinal } from "../../types/layer-name";
import { testCardId, testEventActor } from "../../types/test-identities";
import { reduceGameEvent } from "../reducer";
import { journeyBattleOf } from "../battle/fold";
import { takeEngineLogRecords } from "../battle/engine-battle";
import { BONE, SKULL, battleWorld, tutorialBattle } from "./journey-rewards272-fixtures";
import { journeyEssence } from "./journey-essence";
import { journeyPurge } from "./journey-purge";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { registerBattleInitProvider } from "../battle/journey-battle";
import { clearReplayFixtureProviders } from "../replay/fixture-providers";
import { GENESIS } from "./lifecycle-fixtures";
import { SOURCE, LOWER, FRUIT, GUARD, OBSERVER, SITE_ID, ctx, event, apply, initial, pending, payload, provider, registry, config, sign } from "./journey-before-battle-purge-fixtures";

afterEach(() => clearReplayFixtureProviders());
describe("earned optional pre-init purges", () => {
  it("validates catalog floors and keeps the descriptor tunable", () => {
    for (const floor of [-1, NaN, Infinity, 1.5]) expect(() => journeyPurge(SOURCE, { kind: "beforeBattlePurge", minimumDeckSize: floor })).toThrow();
    expect(journeyPurge(SOURCE, { kind: "beforeBattlePurge", minimumDeckSize: 0 }).journeyPurge).toEqual({ kind: "beforeBattlePurge", minimumDeckSize: 0 });
  });
  it("uses original provider seed intent and actual resolution sequence for committed opening rewards and engine logs", () => {
    const world = battleWorld({ openingRemoval: true, held: [BONE, SKULL] });
    const mods = createJourneyModifierRegistry([journeyPurge(SOURCE, { kind: "beforeBattlePurge", minimumDeckSize: 0 }), journeyEssence(BONE, { kind: "enemyRemovalOutsideChallengeEssence", amount: 7 })]);
    const s = { ...world.state, battle: null, journey: { ...world.state.journey, dreamsigns: [...world.state.journey.dreamsigns, sign(SOURCE)], deck: initial().journey.deck } };
    const siteId = world.state.battle!.init.siteId;
    const p = apply(s, "BEGIN_BATTLE", { siteId, seedOverride: 123 }, mods, { seq: 91 });
    expect(p.state.battle).toBeNull(); expect(p.state.journey.essence).toBe(s.journey.essence);
    takeEngineLogRecords(91); takeEngineLogRecords(92);
    const result = apply(p.state, "RESOLVE_JOURNEY_PURGE", payload(p.state), mods, { seq: 92 });
    expect(result.outcome).toBe("applied"); expect(result.state.journey.essence).toBe(s.journey.essence + 7);
    expect(result.logRecords?.filter((row) => row.fields.hook === "battle_step_committed")).toMatchObject([{ fields: { seq: 92, dreamsignId: BONE } }]);
    expect(takeEngineLogRecords(91)).toEqual([]); expect(takeEngineLogRecords(92).length).toBeGreaterThan(0);
    expect(apply(result.state, "RESOLVE_JOURNEY_PURGE", payload(p.state), mods, { seq: 93 }).state).toBe(result.state);
  });
  it("keeps real tutorial ownership and later/final ordinary battle starts", () => {
    const tutorial = tutorialBattle();
    expect(apply(tutorial, "BEGIN_BATTLE", { siteId: SITE_ID }).state).toBe(tutorial);
    expect(tutorial.battle?.mode.kind).toBe("tutorial");
    provider();
    for (const completionLevel of [1, 6]) {
      const base = initial(), s = { ...base, journey: { ...base.journey, completionLevel, runId: parseJourneyId("before729-later-run") } };
      const nodeId = s.journey.currentDreamscape!; const node = s.journey.atlas.nodes[nodeId]; node.layer = layerAtOrdinal(completionLevel)!;
      const prior = Array.from({ length: completionLevel }, (_, n) => ({ ...node, id: parseAtlasNodeId(`before729-completed-${n}`), layer: layerAtOrdinal(n)!, state: "completed" as const, sites: [] }));
      s.journey.atlas = { ...s.journey.atlas, nodes: { ...Object.fromEntries(prior.map((item) => [item.id, item])), [nodeId]: node }, layers: [...prior.map((item) => [item.id]), [nodeId]], bossNodeId: nodeId };

      const p = pending(s), result = apply(p, "RESOLVE_JOURNEY_PURGE", payload(p));
      expect(result.state.battle?.init.completionLevelAtStart).toBe(completionLevel);
    }
  });

  it.each([0, 1, 2])("starts immediately at or below floor with %s entries", (count) => {
    provider(); const result = apply(initial([SOURCE], count), "BEGIN_BATTLE", { siteId: SITE_ID });
    expect(result.outcome).toBe("applied"); expect(result.state.battle).not.toBeNull();
  });
  it.each([[[]], [[0]], [[0, 1]]])("starts once after free concrete selection %j including Bane", (indices) => {
    const seen: Parameters<ReturnType<typeof provider>["beginBattle"]>[0][] = [];
    provider((input) => seen.push(input)); const before = initial([SOURCE, FRUIT]);
    const p = pending(before); expect(seen).toHaveLength(0); expect(p.battle).toBeNull();
    const ids = indices.map((n) => before.journey.deck[n].entryId);
    const result = apply(p, "RESOLVE_JOURNEY_PURGE", payload(p, ids));
    expect(result.outcome).toBe("applied"); expect(seen).toHaveLength(1);
    const expected = before.journey.deck.filter((e) => !ids.includes(e.entryId));
    expect(seen[0].journey.deck).toEqual(expected); expect(seen[0].journey.essence).toBe(50 + ids.length * 7);
    expect(result.state.journey.essence).toBe(50 + ids.length * 7);
    expect(seen[0]).toMatchObject({ seq: 10, timestamp: "1970-01-01T00:00:00.000Z", seedOverride: null });
    expect(seen[0].rng(0)).toBe(eventRng(before.journey.seed, 10)(0));
    expect(journeyBattleOf(result.state.battle)?.engine.init.decks.player).toHaveLength(expected.length);
    expect(new Set(journeyBattleOf(result.state.battle)?.engine.init.decks.player.map(({ cardId }) => cardId)).size).toBe(expected.length === 0 ? 0 : 1);
    expect(apply(result.state, "RESOLVE_JOURNEY_PURGE", payload(p, ids)).state).toBe(result.state);
  });
  it("unions identical and distinct floors once, attributes first lowest physical source", () => {
    provider();
    for (const held of [[SOURCE, SOURCE], [SOURCE, LOWER, LOWER], [LOWER, SOURCE, LOWER]]) {
      const p = pending(initial(held));
      expect(p.journey.screen).toMatchObject({ type: "journeyPurge", choice: { minimumDeckSize: held.includes(LOWER) ? 1 : 2, heldIndex: held.indexOf(held.includes(LOWER) ? LOWER : SOURCE) } });
      const result = apply(p, "RESOLVE_JOURNEY_PURGE", payload(p));
      expect(result.state.battle).not.toBeNull(); expect(result.state.journey.screen.type).toBe("site");
    }
  });
  it("keeps original permission through source loss, reordering and later lower-floor gain", () => {
    provider(); const p = pending(initial([SOURCE, FRUIT]));
    const lost = apply(p, "REMOVE_DREAMSIGN", { dreamsignId: SOURCE }).state;
    const gained = apply(lost, "ADD_DREAMSIGN", { dreamsignId: LOWER }).state;
    expect(gained.journey.screen).toEqual(p.journey.screen);
    expect(apply(gained, "RESOLVE_JOURNEY_PURGE", payload(gained, gained.journey.deck.slice(0, 3).map((e) => e.entryId))).state).toBe(gained);
    expect(apply(gained, "RESOLVE_JOURNEY_PURGE", payload(gained, [gained.journey.deck[0].entryId])).state.battle).not.toBeNull();
  });
  it("validates ordinary starts before granting any permission", () => {
    provider(); const s = initial();
    for (const patch of [{ siteId: "foreign" }, { seedOverride: -1 }, { seedOverride: 1.2 }]) expect(apply(s, "BEGIN_BATTLE", { siteId: SITE_ID, ...patch }).state).toBe(s);
    for (const screen of [{ type: "atlas" as const }, { type: "dreamscape" as const }]) {
      const wrong = { ...s, journey: { ...s.journey, screen } }; expect(apply(wrong, "BEGIN_BATTLE", { siteId: SITE_ID }).state).toBe(wrong);
    }
    registerBattleInitProvider(null); expect(apply(s, "BEGIN_BATTLE", { siteId: SITE_ID }).state).toBe(s);
  });
  it("rejects malformed, stale, future, duplicate and over-budget selections atomically", () => {
    provider(); const p = pending(); const id = p.journey.deck[0].entryId;
    for (const patch of [{ siteId: "foreign" }, { dreamsignId: LOWER }, { heldIndex: 1 }, { choiceIndex: 1 }, { earnedSeq: 9 }, { earnedSeq: 11 }, { earnedSeq: undefined }, { entryIds: [id, id] }, { entryIds: ["foreign"] }, { entryIds: [3] }, { entryIds: p.journey.deck.map((e) => e.entryId) }]) expect(apply(p, "RESOLVE_JOURNEY_PURGE", { ...payload(p), ...patch }).state).toBe(p);
    expect(apply(p, "RESOLVE_JOURNEY_PURGE", payload(p), registry(), { seq: 10 }).state).toBe(p);
  });
  it("treats administrative removal as no purge and permits zero below the earned floor", () => {
    provider(); const before = initial([SOURCE, FRUIT]);
    const debug = apply(before, "REMOVE_DECK_ENTRY", { entryId: before.journey.deck[0].entryId }).state;
    expect(debug.journey.essence).toBe(50); expect(debug.journey.deck).toHaveLength(3);
    const p = pending(before), s = apply(p, "LOAD_STATE", { snapshot: { ...p.journey, deck: p.journey.deck.slice(0, 1) } }).state;
    expect(s.journey.essence).toBe(50); expect(s.journey.screen).toEqual(p.journey.screen);
    const result = apply(s, "RESOLVE_JOURNEY_PURGE", payload(s));
    expect(result.state.battle).not.toBeNull(); expect(result.state.journey.deck).toHaveLength(1); expect(result.state.journey.essence).toBe(50);
  });
  it("retains live prohibition before rewards, with zero decline valid and RNG-free", () => {
    provider(); const p = pending(initial([SOURCE, FRUIT, GUARD]));
    expect(apply(p, "RESOLVE_JOURNEY_PURGE", payload(p, [p.journey.deck[0].entryId])).state).toBe(p);
    const zero = apply(p, "RESOLVE_JOURNEY_PURGE", payload(p), registry(), { rng: () => { throw new Error("decline consumed RNG"); } });
    expect(zero.state.battle).not.toBeNull(); expect(zero.state.journey.essence).toBe(50);
  });
  it("observes the fully drained deck, Essence and holdings, without a synthetic BEGIN reaction", () => {
    const seen: Parameters<ReturnType<typeof provider>["beginBattle"]>[0][] = []; provider((input) => seen.push(input));
    const mods = registry([{ dreamsignId: OBSERVER, afterJourneyEvent: ({ journey, purges, eventType }) => {
      if (eventType === "BEGIN_BATTLE") throw new Error("preparation must not react");
      return purges?.length ? { journey: { ...journey, essence: journey.essence + 13, deck: journey.deck.slice(1), dreamsigns: journey.dreamsigns.filter((s) => s.id !== OBSERVER) }, before: {}, after: {} } : null;
    } }]);
    const p = pending(initial([SOURCE, FRUIT, OBSERVER]), mods), result = apply(p, "RESOLVE_JOURNEY_PURGE", payload(p, [p.journey.deck[0].entryId]), mods);
    expect(result.outcome).toBe("applied"); expect(seen[0].journey.deck.map((e) => e.entryId)).toEqual(p.journey.deck.slice(2).map((e) => e.entryId));
    expect(seen[0].journey.essence).toBe(70); expect(seen[0].journey.dreamsigns).toEqual([sign(SOURCE), sign(FRUIT)]);
  });
  it.each(["absent", "decline", "throw", "observer", "engine"])("contains %s failure with no partial state and retries the same permission", (failure) => {
    let failing = true; const base = provider();
    const mods = registry([{ dreamsignId: OBSERVER, afterJourneyEvent: ({ eventType }) => { if (failing && failure === "observer" && eventType === "RESOLVE_JOURNEY_PURGE") throw new Error("observer failure"); return null; } }]);
    const p = pending(initial([SOURCE, FRUIT, OBSERVER]), mods);
    if (failure === "absent") registerBattleInitProvider(null);
    else registerBattleInitProvider({ ...base, beginBattle(input) { if (failing && failure === "throw") throw new Error("provider failure"); if (failing && failure === "decline") return null; const start = base.beginBattle(input); return failing && failure === "engine" && start ? { ...start, engineInit: { ...start.engineInit, decks: { ...start.engineInit.decks, player: [{ cardId: testCardId("before729-missing-engine-card") }] } } } : start; } });
    const cfg = config(p, mods), log = createLocalLog({ config: cfg, genesis: { ...GENESIS, seed: p.journey.seed }, localActor: testEventActor("alice"), now: () => "1970-01-01T00:00:00.000Z", base: { seq: 10, state: p, intentKeys: [] }, devMode: false });
    const records: { readonly outcome: string; readonly logRecords?: readonly unknown[] }[] = []; log.subscribe((record) => records.push(record));
    log.append({ type: "RESOLVE_JOURNEY_PURGE", payload: payload(p, [p.journey.deck[0].entryId]) });
    expect(records[0]).toMatchObject({ outcome: "bounced" }); expect(records[0].logRecords).toBeUndefined();
    expect(log.state()).toBe(p); expect(log.state().journey.essence).toBe(50);
    failing = false; if (failure === "absent") registerBattleInitProvider(base);
    log.append({ type: "RESOLVE_JOURNEY_PURGE", payload: payload(p, [p.journey.deck[0].entryId]) });
    expect(log.state().battle).not.toBeNull(); expect(log.state().journey.essence).toBe(57);
  });
  it("accepts both actors through clear and self-chain windows and rejects the competing resolution", () => {
    provider(); const p = pending();
    for (const actor of ["alice", "bob"]) for (const intervening of [[], [{ seq: 10, actor: testEventActor(actor), type: "ADD_DREAMSIGN" as const }]]) {
      const result = reduceGameEvent(p, event("RESOLVE_JOURNEY_PURGE", payload(p), actor), ctx({ seq: 11, intervening }), registry());
      expect(result.outcome).toBe("applied"); expect(result.state.battle).not.toBeNull();
      const competitor = actor === "alice" ? "bob" : "alice";
      expect(reduceGameEvent(result.state, event("RESOLVE_JOURNEY_PURGE", payload(p), competitor), ctx({ seq: 12, intervening: [{ seq: 11, actor: testEventActor(actor), type: "RESOLVE_JOURNEY_PURGE" }] }), registry()).state).toBe(result.state);
    }
  });
  it("preserves strict actor CAS and replay exactly once", () => {
    provider(); const p = pending(), cfg = config(p, registry());
    for (const actor of ["alice", "bob"]) for (const intervening of ["unknown" as const, [{ seq: 10, actor: testEventActor(actor === "alice" ? "bob" : "alice"), type: "ADD_DREAMSIGN" as const }]]) expect(reduceGameEvent(p, event("RESOLVE_JOURNEY_PURGE", payload(p), actor), ctx({ seq: 11, intervening }), registry()).state).toBe(p);
    const log = createLocalLog({ config: cfg, genesis: { ...GENESIS, seed: p.journey.seed }, localActor: testEventActor("alice"), base: { seq: 10, state: p, intentKeys: [] } });
    log.append({ type: "RESOLVE_JOURNEY_PURGE", payload: payload(p) }); log.append({ type: "RESOLVE_JOURNEY_PURGE", payload: payload(p) });
    const replay = foldEvents(cfg, { ...GENESIS, seed: p.journey.seed }, { seq: 10, state: p }, [...log.events()]);
    expect(replay.state).toEqual(log.state()); expect(replay.outcomes.map((o) => o.outcome)).toEqual(["applied", "bounced"]);
  });
});
