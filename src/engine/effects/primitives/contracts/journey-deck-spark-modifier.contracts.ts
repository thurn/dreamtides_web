/** Public C4 physical-origin, all-zone spark, privacy and recovery contracts. */
import { afterEach, describe, expect, it } from "vitest";
import { characteristicsOf } from "../../../continuous/characteristics";
import { everyIn } from "../../../dsl/builders";
import { createEngine, type Engine } from "../../../engine";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { activated, all, anyCharacter, characterYouControl, energy, event, keyword, self, staticAbility, target } from "../../../dsl/builders";
import { NO_DECK_MODS, type Ability, type StaticCondition } from "../../../dsl/types";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import { applyDebugOp, withHistory } from "../../../debug/debug-actions";
import { cloneState } from "../../../state/clone";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type InstanceId, type Side, type BattleSeed } from "../../../state/ids";
import type { BattleInit, BattleState, DeckEntry } from "../../../state/types";
import { InlineSource, NO_PROMPTS } from "../../../steps/sources";
import { randomLegalAnswer } from "../../../prompts/answers";
import { passUntil } from "../../../testing/trigger-harness";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseDreamsignId, parseGameId, parseClientId, parsePromptId } from "../../../../types/identifiers";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { assertJourneyDeckSparkCheckpoint, hasUnknownJourneyDeckSparkOrigins } from "../../../../rules/battle/journey-deck-spark-state";
import type { FoldState } from "../../../../rules/fold-state";
import { replayEngineBattle } from "../../../../rules/battle/engine-battle";
import { GAME_ENGINE_CONFIG } from "../../../../rules/replay/replay";
import { getBattleInitProvider, registerBattleInitProvider } from "../../../../rules/battle/journey-battle";
import { registerReplayFixtureProviders, clearReplayFixtureProviders } from "../../../../rules/replay/fixture-providers";
import { createMemoryKeyValueStore } from "../../../../session/key-value-store";
import { createGameRepository, type StoredCheckpoint } from "../../../../session/game-repository";
import { createLocalGame, openLocalGame } from "../../../../session/local-game";
import { decodeGenesis, decodeEvent, isFoldableGenesis } from "../../../../eventlog/wire";
import { hashState } from "../../../../eventlog/hash";
import battleFixture from "../../../../rules/replay/fixtures/battle.json";
import { journeyDeckSparkModifier as bonus } from "../journey-deck-spark-modifier";
import { createCopyInHand } from "../create-copy-in-hand";
import { createCard } from "../create-card";
import { materializeFigmentCopy } from "../materialize-figment-copy";
import { gainControl } from "../gain-control";
import { gainSpark } from "../gain-spark";
import { dissolve } from "../dissolve";
import { banish } from "../banish";
import { cardsIn, grantCardKeyword } from "../grant-card-keyword";
import { sparkModifier } from "../spark-modifier";
import { setBaseSpark } from "../set-base-spark";
import { sequence } from "../sequence";
import { shuffleInto } from "../shuffle-into";
import { draw } from "../draw";
import { takeFromAmong, opponentHand } from "../take-from-among";
import { giveAllTypes } from "../give-all-types";
import { gainEnergy } from "../gain-energy";

const SIGN = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000058901");
const fixture = (n: number, abilities: readonly Ability[], cost = 0): EngineCardDefinition => ({
  ...v.vanilla1, id: syntheticId(0x589000 + n), costs: [energy(cost)], status: "authored", abilities: () => abilities,
});
const drawer = fixture(1, [activated([], sequence(shuffleInto(), draw(1)))]);
const copier = fixture(2, [activated([], createCopyInHand(self())), activated([], materializeFigmentCopy(self())), activated([], createCard(v.vanilla1.id))], 2);
const thief = fixture(3, [activated([], gainControl(target(anyCharacter()))), activated([], takeFromAmong(opponentHand())), activated([], shuffleInto([everyIn("hand")]))]);
const killer = { ...fixture(4, [event(dissolve(target(anyCharacter())))]), cardType: "event" as const, spark: null };
const banisher = { ...fixture(5, [event(banish(target(anyCharacter())))]), cardType: "event" as const, spark: null };
const pump = fixture(6, [activated([], sequence(gainSpark(target(anyCharacter()), 2), setBaseSpark(target(anyCharacter()), 4)))]);
const ordinary = fixture(7, [staticAbility(sparkModifier(all(characterYouControl()), 2))]);
const handFilter = fixture(8, [staticAbility(grantCardKeyword(cardsIn("hand", { sparkAtLeast: 3 }), "offering"))]);
const response = { ...v.interruptEvent, id: syntheticId(0x589009), status: "authored" as const, costs: [energy(0)], abilities: () => [event(gainEnergy(0))] };
const source = fixture(10, [staticAbility(bonus(2, 1)), keyword("reclaim")]);
const allCards = [drawer, copier, thief, killer, banisher, pump, ordinary, handFilter, response, source];
type Entry = DeckEntry;
const entry = (card: EngineCardDefinition): Entry => ({ cardId: card.id });
interface Options { readonly own?: readonly Entry[]; readonly other?: readonly Entry[]; readonly placements?: BattleInit["setup"]; readonly signs?: number; readonly gate?: StaticCondition; readonly seed?: BattleSeed; readonly sign?: boolean }
function world(side: Side, options: Options = {}) {
  const sign: EngineDreamsignDefinition = { id: SIGN, status: "authored", abilities: () => [staticAbility(bonus(2, 1), options.gate === undefined ? {} : { while: options.gate })] };
  const engine = createEngine(testCatalog(allCards, { dreamsigns: [sign] }));
  const own = options.own ?? [entry(v.vanilla1), entry(v.vanilla2), entry(v.vanilla3), entry(v.vanilla1)];
  const other = options.other ?? [entry(v.vanilla1)];
  const decks = { player: side === "player" ? own : other, enemy: side === "enemy" ? own : other };
  const init: BattleInit = { seed: options.seed ?? battleSeed(`c4-${side}`), startingSide: side, scoreToWin: 1000, decks, dreamwell: [],
    ...(options.sign === false ? {} : { dreamsigns: { [side]: Array.from({ length: options.signs ?? 1 }, () => SIGN) } }),
    setup: options.placements ?? { placements: [{ side, deckIndex: 0, zone: "play", slot: { rank: "back", index: 0 } }, { side, deckIndex: 1, zone: "hand" }, { side, deckIndex: 2, zone: "void" }],
      sides: { player: { currentEnergy: 10, maxEnergy: 10, score: 0 }, enemy: { currentEnergy: 10, maxEnergy: 10, score: 0 } },
      turn: { active: side, phase: "day", round: 1, turnNumber: 1, sideTurns: { player: side === "player" ? 1 : 0, enemy: side === "enemy" ? 1 : 0 }, lastNormal: side }, dreamwell: { deck: [], next: 0 } } };
  const result = engine.createBattle(init, NO_PROMPTS);
  return { engine, init, state: result.state, original: new Set(Object.keys(result.state.instances)) };
}
const ids = (state: BattleState, owner: Side) => Object.values(state.instances).filter(card => card.owner === owner).map(card => card.id);
const spark = (engine: Engine, state: BattleState, id: InstanceId) => characteristicsOf(state, engine.catalog, id).spark;
function act(w: ReturnType<typeof world>, state: BattleState, side: Side, action: Parameters<Engine["apply"]>[2], selected?: InstanceId) {
  const before = serializeState(state);
  const answer = new InlineSource({ player: p => (p.kind === "chooseCards" || p.kind === "chooseTargets") && selected !== undefined && p.candidates.includes(selected) ? [selected] : randomLegalAnswer(p, () => 0),
    enemy: p => (p.kind === "chooseCards" || p.kind === "chooseTargets") && selected !== undefined && p.candidates.includes(selected) ? [selected] : randomLegalAnswer(p, () => 0) });
  const started = w.engine.apply(state, side, action, answer);
  const settled = passUntil(w.engine, started.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, answer);
  expect(serializeState(state)).toBe(before); expect(invariantViolations(settled.state, w.engine.catalog)).toEqual([]);
  return { state: settled.state, events: [...started.events, ...settled.events] };
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function legacy(state: BattleState): BattleState {
  const saved = JSON.parse(serializeState(state)) as BattleState;
  for (const card of Object.values(saved.instances)) delete (card as { journeyDeck?: boolean }).journeyDeck;
  if (saved.rememberedCards !== undefined) for (const records of Object.values(saved.rememberedCards)) for (const card of records) delete (card as { journeyDeck?: boolean }).journeyDeck;
  return saved;
}
afterEach(() => clearReplayFixtureProviders());

describe("journey-deck spark", () => {
  it.each(SIDES)("keeps distinct originals in every initial zone and reads copiable boundary for %s", side => {
    const w = world(side); const owned = ids(w.state, side);
    expect(owned.map(id => [w.state.instances[id].zone, spark(w.engine, w.state, id)])).toEqual([["play", 2], ["hand", 3], ["void", 3], ["deck", 2]]);
    expect(new Set(owned).size).toBe(4); expect(owned.every(id => w.state.instances[id].journeyDeck === true)).toBe(true);
    expect(owned.every(id => w.state.instances[id].status.gainedSpark === 0)).toBe(true);
    expect(ids(w.state, opponent(side)).map(id => spark(w.engine, w.state, id))).toEqual([1]);
    const saved = serializeState(w.state); expect(cloneState(w.state)).toEqual(w.state); expect(stateHash(cloneState(w.state))).toBe(stateHash(w.state));
    expect(w.engine.view(deserializeState(saved), side)).toEqual(w.engine.view(w.state, side)); expect(serializeState(w.state)).toBe(saved);
  });
  it.each(SIDES)("uses deck-entry cost/type changes and preserves variants for %s", side => {
    const mods = (costReduction: number, cardType?: "character" | "event") => ({ ...NO_DECK_MODS, costReduction, ...(cardType === undefined ? {} : { typeChange: { cardType, subtype: "Mage" as const } }) });
    const own: Entry[] = [{ cardId: v.vanilla1.id }, { cardId: v.vanilla3.id, amplified: true, deckMods: mods(1) }, { cardId: v.vanilla3.id, deckMods: mods(0) },
      { cardId: v.event1.id, deckMods: mods(0, "character") }, { cardId: v.vanilla1.id, deckMods: mods(0, "event") }];
    const w = world(side, { own }); const before = serializeState(w.state);
    expect(ids(w.state, side).map(id => spark(w.engine, w.state, id))).toEqual([2, 4, 3, 1, null]);
    expect(serializeState(w.state)).toBe(before);
  });
  it.each(SIDES)("keeps the bonus on the real stack and Banished visit for %s", side => {
    const w = world(side, { own: [entry(v.vanilla1), entry(v.vanilla2), entry(banisher), entry(v.vanilla1)], other: [entry(response)] });
    // Put the opponent's response into its hand through a declared placement.
    const init = { ...w.init, setup: { ...w.init.setup!, placements: [...w.init.setup!.placements, { side: opponent(side), deckIndex: 0, zone: "hand" as const }] } };
    const start = w.engine.createBattle(init, NO_PROMPTS).state; const played = start.sides[side].hand[0];
    const stacked = w.engine.apply(start, side, { kind: "play", card: played, from: "hand" }, NO_PROMPTS).state;
    expect(stacked.instances[played].zone).toBe("stack"); expect(spark(w.engine, stacked, played)).toBe(3);
    const playedState = passUntil(w.engine, stacked, s => s.stack.length === 0).state;
    // Banisher starts in the declared void; debug adds an executable spell without changing the original cohort.
    const debug = applyDebugOp(w.engine, withHistory(slice(playedState)), { kind: "addCard", side, card: banisher.id, zone: "hand" });
    if (debug.kind !== "applied") throw Error("debug spell rejected"); const spell = debug.slice.committed.sides[side].hand[0];
    const removed = act(w, debug.slice.committed, side, { kind: "play", card: spell, from: "hand" }, played);
    expect(removed.state.instances[played].zone).toBe("banished"); expect(spark(w.engine, removed.state, played)).toBe(3);
  });
  it.each(SIDES)("excludes same-printing created hand/card/figment copies and debug additions for %s", side => {
    const w = world(side, { own: [entry(copier), entry(v.vanilla2), entry(v.vanilla3), entry(v.vanilla1)] }); const sourceId = w.state.sides[side].backRank[0]!;
    expect(spark(w.engine, w.state, sourceId)).toBe(2);
    let state = w.state;
    for (const ability of [0, 1, 2]) state = act(w, state, side, { kind: "activate", source: sourceId, ability }).state;
    const made = Object.values(state.instances).filter(c => !w.original.has(c.id)); expect(made).toHaveLength(3);
    expect(made.every(c => c.status.created && c.journeyDeck === false)).toBe(true);
    expect(made.map(c => spark(w.engine, state, c.id))).toEqual([1, 1, 1]);
    const debug = applyDebugOp(w.engine, withHistory(slice(state)), { kind: "addCard", side, card: v.vanilla1.id, zone: "hand" });
    if (debug.kind !== "applied") throw Error("debug rejected"); const added = debug.slice.committed.sides[side].hand[0];
    expect(debug.slice.committed.instances[added]).toMatchObject({ journeyDeck: false, status: { created: false } }); expect(spark(w.engine, debug.slice.committed, added)).toBe(1);
  });
  it.each(SIDES)("keeps origin under stolen control and a foreign held hand for %s", owner => {
    const side = opponent(owner); const w = world(side, { sign: false, own: [entry(thief), entry(v.vanilla2), entry(v.vanilla3), entry(v.vanilla1)], other: [entry(v.vanilla1), entry(v.vanilla1)] });
    const init = { ...w.init, dreamsigns: { [owner]: [SIGN] }, setup: { ...w.init.setup!, placements: [...w.init.setup!.placements, { side: owner, deckIndex: 0, zone: "play" as const, slot: { rank: "back" as const, index: 0 } }, { side: owner, deckIndex: 1, zone: "hand" as const }] } };
    let state = w.engine.createBattle(init, NO_PROMPTS).state; const sourceId = state.sides[side].backRank[0]!, victim = state.sides[owner].backRank[0]!, held = state.sides[owner].hand[0];
    state = act(w, state, side, { kind: "activate", source: sourceId, ability: 0 }, victim).state;
    state = act(w, state, side, { kind: "activate", source: sourceId, ability: 1 }, held).state;
    for (const id of [victim, held]) { expect(state.instances[id]).toMatchObject({ owner, controller: side, journeyDeck: true }); expect(spark(w.engine, state, id)).toBe(2); }
    for (const viewer of SIDES) { const seen = w.engine.view(state, viewer); const sampled = w.engine.determinize(seen, init.decks, () => 0.4); expect(w.engine.view(sampled, viewer)).toEqual(seen); }
  });
  it.each(SIDES)("includes C4 in ordinary final hand spark filters without recursive reads for %s", side => {
    const w = world(side, { own: [entry(handFilter), entry(v.vanilla2), entry(v.vanilla3), entry(v.vanilla1)] }); const held = w.state.sides[side].hand[0];
    expect(w.engine.view(w.state, side).instances[held].characteristics).toMatchObject({ spark: 3, keywords: ["offering"] });
    const many = world(side, { signs: 2 }); expect(spark(many.engine, many.state, many.state.sides[side].hand[0])).toBe(4);
  });
  it.each(SIDES)("composes ordinary in-play anthems, gained/base spark and source lifecycle for %s", side => {
    const w = world(side, { own: [entry(source), entry(killer), entry(v.vanilla1), entry(v.vanilla1)] }); const sourceId = w.state.sides[side].backRank[0]!;
    expect(spark(w.engine, w.state, w.state.sides[side].void[0])).toBe(3);
    const gone = act(w, w.state, side, { kind: "play", card: w.state.sides[side].hand[0], from: "hand" }, sourceId).state;
    expect(gone.instances[sourceId].zone).toBe("void"); expect(spark(w.engine, gone, w.state.sides[side].void[0])).toBe(2);
    const returned = act(w, gone, side, { kind: "play", card: sourceId, from: "void" }).state;
    expect(spark(w.engine, returned, w.state.sides[side].void[0])).toBe(3);
    const boosted = world(side, { own: [entry(ordinary), entry(v.vanilla2), entry(v.vanilla3), entry(v.vanilla1)] });
    expect(spark(boosted.engine, boosted.state, boosted.state.sides[side].backRank[0]!)).toBe(4);
    const varied = world(side, { own: [entry(pump), entry(v.vanilla2), entry(v.vanilla3), entry(v.vanilla1)] }); const changed = varied.state.sides[side].backRank[0]!;
    const earned = act(varied, varied.state, side, { kind: "activate", source: changed, ability: 0 }, changed).state;
    expect(earned.instances[changed].status.gainedSpark).toBe(2); expect(spark(varied.engine, earned, changed)).toBe(7);
  });
  it.each(SIDES)("avoids recursion through ordinary type-layer final-spark conditions for %s", side => {
    const typing = fixture(12, [staticAbility(giveAllTypes(all(characterYouControl())), { while: { cond: "cardsIn", player: "you", zone: "void", filter: { sparkAtLeast: 3 }, atLeast: 1 } })]);
    const own = [entry(typing), entry(v.vanilla1), entry(v.vanilla2), entry(v.vanilla1)];
    const sign: EngineDreamsignDefinition = { id: SIGN, status: "authored", abilities: () => [staticAbility(bonus(2, 1), { while: { cond: "cardsIn", player: "you", zone: "void", atLeast: 1 } })] };
    const base = world(side, { sign: false }); const declared = { ...base.init, decks: { ...base.init.decks, [side]: own } }; const engine = createEngine(testCatalog([...allCards, typing], { dreamsigns: [sign] }));
    const state = engine.createBattle({ ...declared, dreamsigns: { [side]: [SIGN] } }, NO_PROMPTS).state;
    const shown = engine.view(state, side), source = state.sides[side].backRank[0]!, departed = state.sides[side].void[0];
    expect(shown.instances[source].characteristics.allTypes).toBe(true); expect(shown.instances[departed].characteristics.spark).toBe(3);
    const plain = engine.createBattle(declared, NO_PROMPTS).state;
    expect(engine.view(plain, side).instances[plain.sides[side].backRank[0]!].characteristics.allTypes).toBe(false);
  });
  it.each(SIDES)("admits only direct public state conditions for %s", side => {
    const gated = world(side, { gate: { cond: "energyAtLeast", amount: 11 } }); expect(spark(gated.engine, gated.state, gated.state.sides[side].backRank[0]!)).toBe(1);
    expect(() => world(side, { gate: { cond: "cardsIn", player: "you", zone: "void", filter: { sparkAtLeast: 2 }, atLeast: 1 } })).toThrow();
    expect(() => world(side, { gate: { cond: "controls", selector: characterYouControl(), atLeast: 1 } })).toThrow();
  });
  it.each([-1, 0.5, NaN, Infinity])("rejects invalid literal bounds %s", value => { expect(() => bonus(value, 1)).toThrow(RangeError); if (value !== -1) expect(() => bonus(2, value)).toThrow(RangeError); });
  it.each(SIDES)("rejects unknown required provenance and accepts unrelated legacy states for %s", side => {
    const w = world(side); const old = legacy(w.state); const fold = { init: w.init, slice: slice(old) };
    expect(hasUnknownJourneyDeckSparkOrigins(fold, w.engine.catalog)).toBe(true); expect(parseEngineBattleFold(fold, w.engine.catalog)).toBeNull();
    expect(() => w.engine.view(old, side)).toThrow(); expect(parseEngineBattleFold({ init: w.init, slice: slice(w.state) }, w.engine.catalog)).not.toBeNull();
    const unrelated = world(side, { sign: false }); expect(parseEngineBattleFold({ init: unrelated.init, slice: slice(legacy(unrelated.state)) }, unrelated.engine.catalog)).not.toBeNull();
    const malformed = JSON.parse(JSON.stringify({ init: w.init, slice: slice(w.state) })) as typeof fold;
    (Object.values(malformed.slice.committed.instances)[0] as unknown as { journeyDeck: unknown }).journeyDeck = "true";
    expect(parseEngineBattleFold(malformed, w.engine.catalog)).toBeNull();
  });
  it.each(SIDES)("preserves an unknown legacy creation marker while sampling both viewers for %s", side => {
    const w = world(side, { own: [entry(copier), entry(v.vanilla1), entry(v.vanilla3), entry(v.vanilla1)] });
    const made = act(w, w.state, side, { kind: "activate", source: w.state.sides[side].backRank[0]!, ability: 0 }).state;
    const copied = Object.values(made.instances).find(c => c.status.created)!.id;
    // A legacy save may omit an exempt created card's bit while its ordinary original cohort is exact.
    const saved = deserializeState(serializeState(made)); delete (saved.instances[copied] as { journeyDeck?: boolean }).journeyDeck;
    for (const records of Object.values(saved.rememberedCards ?? {})) for (const record of records) if (record.instance === copied) delete (record as { journeyDeck?: boolean }).journeyDeck;
    expect(parseEngineBattleFold({ init: w.init, slice: slice(saved) }, w.engine.catalog)).not.toBeNull();
    for (const viewer of SIDES) {
      const seen = w.engine.view(saved, viewer), sampled = w.engine.determinize(seen, w.init.decks, () => 0.3);
      expect(w.engine.view(sampled, viewer)).toEqual(seen);
      if (viewer === side) expect(sampled.instances[copied].journeyDeck).toBeUndefined();
    }
  });
  it.each(SIDES)("keeps private draw permutations equal and conserves sampled global origin for %s", side => {
    const byOrigin = new Map<boolean, { state: BattleState; engine: Engine; init: BattleInit }>();
    for (let index = 0; index < 64 && byOrigin.size < 2; index++) {
      const w = world(side, { own: [entry(drawer), entry(v.vanilla1), entry(v.vanilla3)], seed: battleSeed(`c4-hidden-${side}-${index}`), sign: false });
      const debug = applyDebugOp(w.engine, withHistory(slice(w.state)), { kind: "addCard", side, card: v.vanilla2.id, zone: "deck" }); if (debug.kind !== "applied") throw Error("debug rejected");
      const originalDeck = w.state.sides[side].deck[0];
      // This layout has no original deck entry; use the declared extra ordinary entry below.
      const init = { ...w.init, decks: { ...w.init.decks, [side]: [...w.init.decks[side], entry(v.vanilla1)] } };
      const start = w.engine.createBattle(init, NO_PROMPTS).state;
      const added = applyDebugOp(w.engine, withHistory(slice(start)), { kind: "addCard", side, card: v.vanilla2.id, zone: "deck" }); if (added.kind !== "applied") throw Error("debug rejected");
      const next = act(w, added.slice.committed, side, { kind: "activate", source: start.sides[side].backRank[0]!, ability: 0 }).state;
      const drawn = next.sides[side].hand[next.sides[side].hand.length - 1]; if (drawn === originalDeck) throw Error("unexpected cohort");
      byOrigin.set(next.instances[drawn].journeyDeck === true, { state: next, engine: w.engine, init });
    }
    expect(byOrigin.size).toBe(2); const a = byOrigin.get(true)!, b = byOrigin.get(false)!;
    const viewer = opponent(side); expect(a.engine.view(a.state, viewer)).toEqual(b.engine.view(b.state, viewer));
    for (const w of [a, b]) for (const random of [0.05, 0.7]) {
      const seen = w.engine.view(w.state, viewer); const sampled = w.engine.determinize(seen, w.init.decks, () => random);
      expect(w.engine.view(sampled, viewer)).toEqual(seen); expect(Object.values(sampled.instances).filter(c => c.journeyDeck === true)).toHaveLength(5);
      expect(Object.values(sampled.instances).filter(c => c.journeyDeck === false && !c.status.created)).toHaveLength(1);
    }
  });
  it.each(SIDES.flatMap(side => [false, true].map(extra => ({ side, extra }))))("preserves an observed $extra origin through a foreign hand and hidden return: $side", ({ side, extra }) => {
    const owner = opponent(side); const w = world(side, { sign: false, own: [entry(thief), entry(v.vanilla2), entry(v.vanilla3), entry(v.vanilla1)], other: [entry(v.vanilla1)] });
    const init = { ...w.init, dreamsigns: { [owner]: [SIGN] }, setup: { ...w.init.setup!, placements: [...w.init.setup!.placements, { side: owner, deckIndex: 0, zone: "hand" as const }] } };
    const start = w.engine.createBattle(init, NO_PROMPTS).state;
    const debug = applyDebugOp(w.engine, withHistory(slice(start)), { kind: "addCard", side: owner, card: v.vanilla1.id, zone: "hand" }); if (debug.kind !== "applied") throw Error("debug rejected");
    const original = start.sides[owner].hand[0], added = debug.slice.committed.sides[owner].hand[0], chosen = extra ? added : original, caller = start.sides[side].backRank[0]!;
    let state = act(w, debug.slice.committed, side, { kind: "activate", source: caller, ability: 1 }, chosen).state;
    expect(state.instances[chosen]).toMatchObject({ owner, controller: side, journeyDeck: !extra }); expect(spark(w.engine, state, chosen)).toBe(extra ? 1 : 2);
    state = act(w, state, side, { kind: "activate", source: caller, ability: 2 }).state;
    expect(state.instances[chosen].zone).toBe("deck");
    for (const viewer of SIDES) for (const random of [0.1, 0.8]) {
      const seen = w.engine.view(state, viewer); expect(seen.instances[chosen]).toBeUndefined();
      const sampled = w.engine.determinize(seen, init.decks, () => random); expect(w.engine.view(sampled, viewer)).toEqual(seen);
      expect(Object.values(sampled.instances).filter(c => c.journeyDeck === true)).toHaveLength(5);
      expect(Object.values(sampled.instances).filter(c => c.journeyDeck === false && !c.status.created)).toHaveLength(1);
    }
  });
  it.each(SIDES)("keeps provenance through refusal, pending reload, cancel and partial resolution failure for %s", side => {
    const w = world(side, { own: [entry(thief), entry(v.vanilla2), entry(v.vanilla3), entry(v.vanilla1)], other: [entry(v.vanilla1), entry(v.vanilla2)] });
    const init = { ...w.init, setup: { ...w.init.setup!, placements: [...w.init.setup!.placements, { side: opponent(side), deckIndex: 0, zone: "play" as const, slot: { rank: "back" as const, index: 0 } }, { side: opponent(side), deckIndex: 1, zone: "play" as const, slot: { rank: "back" as const, index: 1 } }] } };
    const adapter = createFoldAdapter(w.engine), started = adapter.start(init); if (started.kind !== "applied" || started.error !== null) throw Error("start rejected");
    const before = serializeState(started.slice.committed), caller = started.slice.committed.sides[side].backRank[0]!;
    const pending = adapter.reduce(started.slice, { kind: "battleAction", side, action: { kind: "activate", source: caller, ability: 0 } });
    if (pending.kind !== "applied" || pending.error !== null) throw Error("activation rejected"); const prompt = adapter.pending(pending.slice); if (prompt === null) throw Error("missing target prompt");
    const cold = JSON.parse(JSON.stringify(pending.slice)) as BattleSlice;
    expect(adapter.pending(cold)?.prompt).toEqual(prompt.prompt); expect(serializeState(cold.committed)).toBe(before);
    expect(adapter.reduce(cold, { kind: "answer", side: opponent(side), promptId: prompt.prompt.id, value: [] }).kind).toBe("bounced");
    expect(adapter.reduce(cold, { kind: "cancel", side, promptId: parsePromptId("999:999:999") }).kind).toBe("bounced");
    const cancelled = adapter.reduce(cold, { kind: "cancel", side, promptId: prompt.prompt.id }); if (cancelled.kind !== "applied") throw Error("cancel rejected");
    expect(serializeState(cancelled.slice.committed)).toBe(before);
    const broken = { ...v.event0, id: syntheticId(0x589011), status: "authored" as const, abilities: () => [event(sequence(createCard(v.vanilla1.id), bonus(2, 1)))] };
    const brokenEngine = createEngine(testCatalog([...allCards, broken]));
    const other = opponent(side); const brokenInit: BattleInit = { ...init, dreamsigns: undefined, decks: { ...init.decks, [side]: init.decks[side].map((card, index) => index === 1 ? entry(broken) : card), [other]: [...init.decks[other], entry(response)] }, setup: { ...init.setup, placements: [...init.setup.placements, { side: other, deckIndex: 2, zone: "hand" }] } };
    const badAdapter = createFoldAdapter(brokenEngine), badStart = badAdapter.start(brokenInit); if (badStart.kind !== "applied" || badStart.error !== null) throw Error("bad fixture start rejected");
    const spell = badStart.slice.committed.sides[side].hand[0];
    const played = badAdapter.reduce(badStart.slice, { kind: "battleAction", side, action: { kind: "play", card: spell, from: "hand" } });
    if (played.kind !== "applied" || played.error !== null) throw Error("play rejected"); expect(played.slice.committed.instances[spell].zone).toBe("stack");
    const failed = badAdapter.reduce(played.slice, { kind: "battleAction", side: other, action: { kind: "pass" } });
    if (failed.kind !== "applied") throw Error("expected contained engine error"); expect(failed.error).not.toBeNull();
    expect(failed.slice.committed.instances).toEqual(played.slice.committed.instances); expect(failed.slice.committed.nextInstance).toBe(played.slice.committed.nextInstance);
    expect(failed.slice.committed.floating).toEqual(played.slice.committed.floating);
  });
  it("rejects only C4 legacy checkpoints and uses the normal persisted-genesis fallback", async () => {
    registerReplayFixtureProviders(); const provider = getBattleInitProvider(); if (provider === null) throw Error("fixture provider missing");
    const sign: EngineDreamsignDefinition = { id: SIGN, status: "authored", abilities: () => [staticAbility(bonus(2, 1))] };
    const catalog = { ...provider.engine.catalog, dreamsign: (id: typeof SIGN) => id === SIGN ? sign : provider.engine.catalog.dreamsign(id) };
    const engine = createEngine(catalog);
    registerBattleInitProvider({ ...provider, engine, beginBattle(input) { const declared = provider.beginBattle(input); return declared === null ? null : { ...declared, engineInit: { ...declared.engineInit, dreamsigns: { player: [SIGN] } } }; } });
    const genesis = decodeGenesis(JSON.stringify(battleFixture.genesis)); if (genesis === null || !isFoldableGenesis(genesis)) throw Error("fixture genesis missing");
    const store = createMemoryKeyValueStore(), repository = createGameRepository(store), gameId = parseGameId("c4-origin-reload");
    const game = await createLocalGame(repository, GAME_ENGINE_CONFIG, { gameId, genesis, localPlayerId: parseClientId("c4-origin-actor") }, { checkpointInterval: 1, now: () => 0, eventClock: () => "2026-01-01T00:00:00.000Z" });
    try {
      for (const record of battleFixture.events) { const e = decodeEvent(JSON.stringify(record.event)); game.log.append({ type: e.type, payload: e.payload }); if (e.type === "BEGIN_BATTLE") break; }
      await game.flush(); const current = GAME_ENGINE_CONFIG.encode(game.log.state());
      const checkpoint = await store.get(`game/${gameId}/checkpoint`) as StoredCheckpoint;
      const snapshot = JSON.parse(checkpoint.state) as FoldState;
      if (snapshot.battle === null) throw Error("missing battle"); const old = { ...snapshot, battle: { ...snapshot.battle, engine: { ...snapshot.battle.engine, slice: { ...snapshot.battle.engine.slice, committed: legacy(snapshot.battle.engine.slice.committed) } } } };
      expect(() => assertJourneyDeckSparkCheckpoint(old)).toThrow();
      await store.putAll([[`game/${gameId}/checkpoint`, { ...checkpoint, state: JSON.stringify(old), stateHash: hashState(old) }]]);
      const reloaded = await openLocalGame(repository, GAME_ENGINE_CONFIG, gameId, { now: () => 0 }); if (reloaded === null) throw Error("reload missing");
      try { expect(reloaded.opened).toMatchObject({ checkpointSeq: 0, checkpointRejected: true, replayedEvents: checkpoint.seq, replayFoldErrors: 0 }); expect(GAME_ENGINE_CONFIG.encode(reloaded.log.state())).toBe(current); } finally { await reloaded.close(); }
      const envelope = decodeEvent(JSON.stringify(battleFixture.events[0].event));
      const raw = { seq: checkpoint.seq + 1, event: { ...envelope, type: "LOAD_STATE" as const, payload: { snapshot: old.journey, battle: old.battle } } };
      expect(replayEngineBattle(engine, old.battle, [raw], () => []).kind).toBe("failed");
      expect(replayEngineBattle(engine, snapshot.battle, [{ ...raw, event: { ...raw.event, payload: { snapshot: snapshot.journey, battle: snapshot.battle } } }], () => []).kind).toBe("done");
      game.log.append({ type: raw.event.type, payload: raw.event.payload }); expect(GAME_ENGINE_CONFIG.encode(game.log.state())).toBe(current);
      registerBattleInitProvider(provider); expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(old))).not.toThrow();
    } finally { await game.close(); }
  });

});
