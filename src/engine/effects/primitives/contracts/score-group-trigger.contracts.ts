/** Settled positive scoring groups, exercised through engine and persisted fold contracts. */
import { afterEach, describe, expect, it } from "vitest";
import { createEngine } from "../../../engine";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { scoredAmount, self, thisCardIn } from "../../../dsl/builders";
import { either, onNight, triggered, whenScoreGroup, whenScores } from "../../../dsl/triggers";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { cloneState } from "../../../state/clone";
import { eventLogRecord } from "../../../log";
import { stateHash } from "../../../state/hash";
import { FRONT_RANK_SIZE, opponent, type Side } from "../../../state/ids";
import type { BattleInit, BattleState, DeckEntry } from "../../../state/types";
import type { Prompt, Answer } from "../../../prompts/types";
import { runStep } from "../../../steps/runner";
import { InlineSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { at, passUntil } from "../../../testing/trigger-harness";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseDreamsignId, parsePromptId, parseGameId, parseClientId } from "../../../../types/identifiers";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { assertScoreGroupCheckpoint, hasUnknownScoreGroup } from "../../../../rules/battle/score-group-state";
import { getBattleInitProvider, registerBattleInitProvider } from "../../../../rules/battle/journey-battle";
import { GAME_ENGINE_CONFIG } from "../../../../rules/replay/replay";
import { registerReplayFixtureProviders, clearReplayFixtureProviders } from "../../../../rules/replay/fixture-providers";
import { createMemoryKeyValueStore } from "../../../../session/key-value-store";
import { createGameRepository, type StoredCheckpoint } from "../../../../session/game-repository";
import { createLocalGame, openLocalGame } from "../../../../session/local-game";
import { decodeGenesis, decodeEvent, isFoldableGenesis } from "../../../../eventlog/wire";
import { hashState } from "../../../../eventlog/hash";
import type { FoldState } from "../../../../rules/fold-state";
import battleFixture from "../../../../rules/replay/fixtures/battle.json";
import rootStaff from "../../../../content/dreamsigns/root-staff-055f211d";
import * as p from "../index";

const card = (n: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition => ({ ...v.vanilla3, id: syntheticId(0x582000 + n), status: "authored", abilities });
const watch = card(1, () => [triggered(whenScoreGroup(2), p.draw(1))]);
const opposingWatch = card(2, () => [triggered(whenScoreGroup(2, "opponent"), p.draw(1))]);
const individual = card(3, () => [triggered(whenScores({ controller: "you" }), p.gainPoints(scoredAmount()))]);
const depart = card(4, () => [triggered(whenScores(), p.returnToHand(self()))]);
const thief = card(6, () => [triggered(whenScores({ controller: "opponent" }), p.gainControl({ kind: "subject" }))]);
const groupedScorer = card(7, () => [triggered(whenScoreGroup(2), p.draw(1))]);
const shuffled = card(8, () => [triggered(whenScores(), p.sequence(p.returnToHand(self()), p.shuffleInto([thisCardIn("hand")])))]);
const mover = card(9, () => [triggered(whenScores(), p.move(self()))]);
const flat = card(10, () => [triggered(onNight(), p.sequence(p.gainPoints(7), p.draw(1)))]);
const paused = card(11, () => [triggered(whenScores(), p.optional(p.gainEnergy(0)))]);
const faulty = card(12, () => [triggered(whenScoreGroup(2), p.sequence(p.draw(1), p.gainAdditionalSpark(self(), 1)))]);
const zero = { ...v.vanilla1, id: syntheticId(0x582005), spark: 0 };
const sign: EngineDreamsignDefinition = { status: "authored", id: parseDreamsignId(rootStaff.id), abilities: rootStaff.abilities! };
const engine = createEngine(testCatalog([watch, opposingWatch, individual, depart, zero, thief, groupedScorer, shuffled, mover, flat, paused, faulty], { dreamsigns: [sign] }));
const deck = Array.from({ length: 18 }, () => v.vanilla1.id);
const choose = (prompt: Prompt): Answer => {
  if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm") return true;
  throw new Error(`Unexpected prompt ${prompt.kind}`);
};
const source = { answer: choose };
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, attempt: 0, publishedEvents: 0 });
const applied = (out: IntentOutcome): BattleSlice => {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`Unexpected outcome ${JSON.stringify(out)}`);
  return out.slice;
};
function setup(side: Side, count = 2, staff = false) {
  return boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { front: Array.from({ length: count }, () => v.vanilla3.id), back: staff ? [] : [watch.id, individual.id], dreamsigns: staff ? [sign.id] : [], deck },
    [opponent(side)]: { back: [watch.id, opposingWatch.id], deck } });
}
const finish = (state: BattleState) => passUntil(engine, state, at(engine, opponent(state.turn.active), "day"), source);
const lists = (state: BattleState): Record<Side, DeckEntry[]> => Object.fromEntries((["player", "enemy"] as const).map(side => [side,
  Object.values(state.instances).filter(c => c.owner === side && c.printing.kind === "card").map(c => ({ cardId: (c.printing as Extract<typeof c.printing, {kind:"card"}>).cardId }))])) as Record<Side, DeckEntry[]>;
const provider = getBattleInitProvider();
afterEach(() => registerBattleInitProvider(provider));

describe("settled scoring-group trigger", () => {
  it.each(["player", "enemy"] as const)("distinguishes zero/one/two/three scorers and individual awards for %s", side => {
    for (const count of [0, 1, 2, 3]) {
      const b = setup(side, count), before = stateHash(b.state), done = finish(b.state);
      expect(done.events.filter(e => e.kind === "scoreGroup")).toEqual(count === 0 ? [] : [{ kind: "scoreGroup", side, count }]);
      const own = b.ids[side].back[0], other = b.ids[opponent(side)].back;
      const queued = done.events.filter(e => e.kind === "triggerQueued");
      expect(queued.filter(e => e.source === own)).toHaveLength(Number(count >= 2));
      expect(queued.filter(e => e.source === other[0])).toHaveLength(0);
      expect(queued.filter(e => e.source === other[1])).toHaveLength(Number(count >= 2));
      expect(queued.filter(e => e.source === b.ids[side].back[1]).map(e => e.scored)).toEqual(Array.from({ length: count }, () => 3));
      expect(done.state.sides[side].score).toBe(6 * count);
      expect(stateHash(b.state)).toBe(before);
      const settled = done.steps.find(step => step.step.kind === "challengeLane" && step.step.lane === FRONT_RANK_SIZE - 1)!;
      expect(settled.state.challenge?.scoring).toEqual({ settled: true, scorers: b.ids[side].front.map(instance => ({ instance, controller: side })) });
      expect(done.steps.filter(step => step.step.kind === "challengeLane" && step.step.lane < FRONT_RANK_SIZE - 1).every(step => !step.events.some(e => e.kind === "scoreGroup"))).toBe(true);
      expect(done.state.challenge?.scoring).toBeUndefined();
    }
  });

  it.each(["player", "enemy"] as const)("counts positive blocked wins but excludes ties, losses, zero and many controlled nonscorers for %s", side => {
    const other = opponent(side), b = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
      [side]: { front: [v.vanilla3.id, v.vanilla1.id, v.vanilla1.id, zero.id], back: [watch.id, v.vanilla3.id, v.vanilla3.id], deck },
      [other]: { front: [v.vanilla1.id, v.vanilla1.id, v.vanilla3.id], deck } });
    const done = finish(b.state);
    expect(done.events.filter(e => e.kind === "scoreGroup")).toEqual([{ kind: "scoreGroup", side, count: 1 }]);
    expect(done.events.filter(e => e.kind === "triggerQueued" && e.source === b.ids[side].back[0])).toEqual([]);
    expect(done.state.sides[side].score).toBe(2);
  });

  it.each(["player", "enemy"] as const)("retains a departed first scorer and earlier lane reaction order for %s", side => {
    const b = setup(side);
    b.state.instances[b.ids[side].front[0]!] = { ...b.state.instances[b.ids[side].front[0]!], printing: { kind: "card", cardId: depart.id } };
    const done = finish(b.state), departure = done.events.findIndex(e => e.kind === "returnedToHand");
    const second = done.events.findIndex(e => e.kind === "laneResolved" && e.lane === 1);
    expect(departure).toBeGreaterThan(-1); expect(departure).toBeLessThan(second);
    expect(done.events.filter(e => e.kind === "scoreGroup")).toEqual([{ kind: "scoreGroup", side, count: 2 }]);
    const settled = done.steps.find(s => s.step.kind === "challengeLane" && s.step.lane === FRONT_RANK_SIZE - 1)!.state;
    expect(settled.challenge?.scoring?.scorers[0]).toEqual({ instance: b.ids[side].front[0], controller: side });
  });

  it.each(["player", "enemy"] as const)("executes the actual leaf once, drawing before its discard for %s", side => {
    const b = setup(side, 3, true), done = finish(b.state);
    const group = done.steps.find(s => s.step.kind === "resolveTrigger" && s.events.some(e => e.kind === "triggerResolved" && typeof e.source === "object" && e.source?.kind === "dreamsign"))!;
    expect(group.events.filter(e => e.kind === "cardDrawn" || e.kind === "discarded").map(e => e.kind)).toEqual(["cardDrawn", "discarded"]);
    expect(done.events.filter(e => e.kind === "triggerResolved" && typeof e.source === "object" && e.source?.kind === "dreamsign")).toHaveLength(1);
    expect(group.events.filter(e => e.kind === "discarded")).toHaveLength(1);
  });

  it.each(["player", "enemy"] as const)("saves exact cohort, hashes/clones it, and preserves concealed historical membership for %s", side => {
    const b = setup(side); b.state.instances[b.ids[side].front[0]!] = { ...b.state.instances[b.ids[side].front[0]!], printing: { kind: "card", cardId: depart.id } };
    const done = finish(b.state), state = done.steps.find(s => s.step.kind === "challengeLane" && s.step.lane === 1)!.state;
    const cloned = cloneState(state); expect(stateHash(cloned)).toBe(stateHash(state));
    cloned.challenge!.scoring!.scorers.pop(); expect(stateHash(cloned)).not.toBe(stateHash(state));
    const saved = JSON.parse(JSON.stringify(state)) as BattleState; expect(stateHash(saved)).toBe(stateHash(state));
    for (const viewer of [side, opponent(side)]) {
      const view = engine.view(state, viewer), shown = view.challenge!.scoring!;
      expect(shown.scorers).toHaveLength(2);
      expect(shown.scorers[0].controller).toBe(side);
      const sampled = engine.determinize(view, lists(b.state), () => .3);
      expect(engine.view(sampled, viewer)).toEqual(view);
      expect(sampled.challenge!.scoring!.scorers).toHaveLength(2);
    }
  });

  it.each(["player", "enemy"] as const)("reloads a pending discard, rejects stale/wrong/invalid/duplicate answers and commits once for %s", side => {
    const b = setup(side, 2, true), adapter = createFoldAdapter(engine);
    let current = slice(b.state);
    for (let n = 0; adapter.pending(current) === null; n++) {
      if (n > 20) throw Error("Missing group discard");
      current = applied(adapter.reduce(current, { kind: "battleAction", side: engine.decision(current.committed)!.side, action: { kind: "pass" } }));
    }
    const pending = adapter.pending(current)!;
    expect(pending.prompt.kind).toBe("chooseCards");
    const cold = JSON.parse(JSON.stringify(current)) as BattleSlice, before = stateHash(cold.committed);
    expect(adapter.pending(cold)?.prompt).toEqual(pending.prompt);
    for (const intent of [
      { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: [] },
      { kind: "answer", side, promptId: parsePromptId("999:999:999"), value: [] },
      { kind: "answer", side, promptId: pending.prompt.id, value: [] },
    ] as const) expect(adapter.reduce(cold, intent).kind).toBe("bounced");
    expect(stateHash(cold.committed)).toBe(before);
    const prompt = pending.prompt; if (prompt.kind !== "chooseCards") throw Error("Wrong prompt");
    const answer = { kind: "answer" as const, side, promptId: prompt.id, value: prompt.candidates.slice(0, prompt.min) };
    const complete = applied(adapter.reduce(cold, answer));
    expect(adapter.reduce(complete, answer).kind).toBe("bounced");
    expect(complete.committed.sides[side].void.length - cold.committed.sides[side].void.length).toBe(1);
    expect(complete.committed.sides[side].hand.length).toBe(cold.committed.sides[side].hand.length);
    expect(stateHash(cold.committed)).toBe(before);
  });

  it.each(["player", "enemy"] as const)("rejects required unknown/malformed saved cohorts while accepting exact and unrelated legacy for %s", side => {
    const b = setup(side, 2, true), done = finish(b.state);
    const state = done.steps.find(s => s.step.kind === "challengeLane" && s.step.lane === 0)!.state;
    const init = { seed: state.seed, scoreToWin: 100, startingSide: side, decks: lists(b.state), dreamwell: [], dreamsigns: { [side]: [sign.id] } };
    const fold = { init, slice: slice(state) };
    expect(parseEngineBattleFold(fold, engine.catalog)).not.toBeNull();
    const legacy = JSON.parse(JSON.stringify(fold)) as typeof fold; delete legacy.slice.committed.challenge!.scoring;
    expect(hasUnknownScoreGroup(legacy, engine.catalog)).toBe(true);
    expect(parseEngineBattleFold(legacy, engine.catalog)).toBeNull();
    registerBattleInitProvider({ engine, battleInit: () => init } as unknown as NonNullable<ReturnType<typeof getBattleInitProvider>>);
    expect(() => assertScoreGroupCheckpoint(legacy)).toThrow();
    expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify({ battle: { engine: legacy } }))).toThrow();
    const before = JSON.stringify(legacy); expect(parseEngineBattleFold(legacy, engine.catalog)).toBeNull(); expect(JSON.stringify(legacy)).toBe(before);
    legacy.slice.committed.turn.challengeLane = 0;
    expect(parseEngineBattleFold(legacy, engine.catalog)).not.toBeNull();
    const unrelated = setup(side, 1), doneOther = finish(unrelated.state);
    const otherState = doneOther.steps.find(s => s.step.kind === "challengeLane" && s.step.lane === 0)!.state;
    const unrelatedFold = { init: { ...init, dreamsigns: undefined, decks: lists(unrelated.state) }, slice: slice(otherState) };
    delete unrelatedFold.slice.committed.challenge!.scoring;
    // Its declared deck includes the group watcher, so use a catalog with an actually unrelated definition.
    const unrelatedEngine = createEngine(testCatalog([{ ...watch, abilities: () => [] }, { ...opposingWatch, abilities: () => [] }]));
    expect(hasUnknownScoreGroup(unrelatedFold, unrelatedEngine.catalog)).toBe(false);
    for (const patch of [{ settled: "yes", scorers: [] }, { settled: false, scorers: [{ instance: "bad", controller: side }] },
      { settled: false, scorers: [state.challenge!.scoring!.scorers[0], state.challenge!.scoring!.scorers[0]] }]) {
      const invalid = JSON.parse(JSON.stringify(fold)) as typeof fold;
      Object.assign(invalid.slice.committed.challenge!, { scoring: patch });
      expect(parseEngineBattleFold(invalid, engine.catalog)).toBeNull();
    }
    const history = { ...fold, slice: { ...fold.slice, history: { base: legacy.slice, entries: [] } } };
    legacy.slice.committed.turn.challengeLane = 1;
    expect(hasUnknownScoreGroup(history, engine.catalog)).toBe(true);
  });

  it.each(["player", "enemy"] as const)("captures scoring controller and uses source control at settlement for %s", side => {
    const b = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
      [side]: { front: [groupedScorer.id, v.vanilla3.id], deck }, [opponent(side)]: { back: [thief.id], deck } });
    const done = finish(b.state), first = b.ids[side].front[0]!;
    expect(done.state.instances[first].controller).toBe(opponent(side));
    expect(done.events.filter(e => e.kind === "scoreGroup")).toEqual([{ kind: "scoreGroup", side, count: 2 }]);
    expect(done.events.filter(e => e.kind === "triggerQueued" && e.source === first)).toEqual([]);
    const settled = done.steps.find(s => s.step.kind === "challengeLane" && s.step.lane === FRONT_RANK_SIZE - 1)!.state;
    expect(settled.challenge!.scoring!.scorers.map(e => e.controller)).toEqual([side, side]);
  });

  it.each(["player", "enemy"] as const)("keeps flat gains and Fatigue outside scoring groups for %s", side => {
    const b = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
      [side]: { back: [watch.id, flat.id], deck: [] }, [opponent(side)]: { deck } });
    const done = finish(b.state);
    expect(done.state.sides[side].score).toBeGreaterThan(0);
    expect(done.state.sides[side].fatigueCount).toBe(1);
    expect(done.events.filter(e => e.kind === "scoreGroup" || e.kind === "laneResolved")).toEqual([]);
  });

  it.each(["player", "enemy"] as const)("deduplicates one physical scorer moving into another lane for %s", side => {
    const b = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
      [side]: { front: [mover.id, v.vanilla3.id], back: [watch.id], deck }, [opponent(side)]: { deck } });
    let moves = 0;
    const moveAnswer = (prompt: Prompt): Answer => {
      if (prompt.kind === "chooseSlot") {
        const wanted = moves++ === 0 ? { rank: "front", index: 2 } : { rank: "back", index: 1 };
        const index = prompt.slots.findIndex(slot => slot.rank === wanted.rank && slot.index === wanted.index);
        if (index < 0) throw Error("Missing move destination"); return index;
      }
      return choose(prompt);
    };
    const answers = new InlineSource({ player: moveAnswer, enemy: moveAnswer });
    const done = passUntil(engine, b.state, at(engine, opponent(side), "day"), answers);
    expect(done.events.filter(e => e.kind === "laneResolved" && e.scored > 0)).toHaveLength(3);
    expect(done.events.filter(e => e.kind === "scoreGroup")).toEqual([{ kind: "scoreGroup", side, count: 2 }]);
    expect(done.events.filter(e => e.kind === "triggerQueued" && e.source === b.ids[side].back[0])).toHaveLength(1);
  });

  it.each(["player", "enemy"] as const)("projects shuffled and ceased scorer history without a physical identity leak for %s", side => {
    for (const ceased of [false, true]) {
      const b = setup(side); const first = b.ids[side].front[0]!;
      b.state.instances[first] = { ...b.state.instances[first], printing: { kind: "card", cardId: shuffled.id }, status: { ...b.state.instances[first].status, created: ceased } };
      const done = finish(b.state), state = done.steps.find(s => s.step.kind === "challengeLane" && s.step.lane === 1)!.state;
      expect(done.events.filter(e => e.kind === "scoreGroup")).toEqual([{ kind: "scoreGroup", side, count: 2 }]);
      if (ceased) expect(state.instances[first]).toBeUndefined();
      const view = engine.view(state, opponent(side)), record = view.challenge!.scoring!.scorers[0];
      expect(record.instance).not.toBe(first);
      if (ceased) expect(record.instance).toBeNull();
      const sampled = engine.determinize(view, lists(b.state), () => .3);
      expect(engine.view(sampled, opponent(side))).toEqual(view);
      if (record.instance !== null && typeof record.instance !== "string") {
        expect(sampled.challenge!.challengers).toContain(sampled.challenge!.scoring!.scorers[0].instance);
      }
    }
  });

  it.each(["player", "enemy"] as const)("starts each Challenge empty and stops groups when an earlier lane ends the battle for %s", side => {
    const b = setup(side, 2, true), first = finish(b.state);
    const second = passUntil(engine, first.state, at(engine, side, "day"), source);
    const third = finish(second.state);
    expect(third.events.filter(e => e.kind === "scoreGroup")).toEqual([{ kind: "scoreGroup", side, count: 2 }]);
    const designated = third.steps.find(s => s.events.some(e => e.kind === "challengersDesignated"))!.state;
    expect(designated.challenge?.scoring).toEqual({ settled: false, scorers: [] });
    const ending = setup(side, 2, true); const state = { ...ending.state, config: { ...ending.state.config, scoreToWin: 1 } };
    const done = passUntil(engine, state, s => s.result !== null, source);
    expect(done.events.some(e => e.kind === "laneResolved")).toBe(true);
    expect(done.events.filter(e => e.kind === "scoreGroup")).toEqual([]);
  });

  it.each(["player", "enemy"] as const)("rolls back a failed group body while retaining the committed settled occasion for %s", side => {
    const b = setup(side); const observer = b.ids[side].back[0]!;
    b.state.instances[observer] = { ...b.state.instances[observer], printing: { kind: "card", cardId: faulty.id } };
    const adapter = createFoldAdapter(engine); let current = slice(b.state), error = false;
    for (let n = 0; n < 20 && !error; n++) {
      const out = adapter.reduce(current, { kind: "battleAction", side: engine.decision(current.committed)!.side, action: { kind: "pass" } });
      if (out.kind !== "applied") throw Error("Missing error path");
      current = out.slice; error = out.error !== null;
    }
    expect(error).toBe(true); expect(current.committed.challenge!.scoring!.settled).toBe(true);
    expect(current.committed.sides[side].hand).toHaveLength(0);
    expect(current.committed.triggerQueue.some(trigger => trigger.source === observer)).toBe(true);
    const cold = JSON.parse(JSON.stringify(current)) as BattleSlice;
    expect(stateHash(cold.committed)).toBe(stateHash(current.committed));
    expect(eventLogRecord({ kind: "scoreGroup", side, count: 2 }, current.committed.version)).toEqual({ event: "engine.scoreGroup", version: current.committed.version, detail: { kind: "scoreGroup", side, count: 2 } });
  });

  it.each(["player", "enemy"] as const)("recovers canonical hashed checkpoints from genesis and refuses raw imports without losing saved events for %s", async side => {
    registerReplayFixtureProviders(); const baseProvider = getBattleInitProvider()!;
    const init: BattleInit = { seed: setup(side).state.seed, startingSide: side, scoreToWin: 100,
      decks: { [side]: [{ cardId: paused.id }, { cardId: v.vanilla3.id }, ...deck.map(cardId => ({cardId}))], [opponent(side)]: deck.map(cardId => ({cardId})) } as Record<Side, DeckEntry[]>,
      dreamwell: [], dreamsigns: { [side]: [sign.id] }, setup: {
        placements: [0,1].map(deckIndex => ({ side, deckIndex, zone: "play", slot: { rank: "front", index: deckIndex } })),
        sides: { player: {currentEnergy:0,maxEnergy:0,score:0}, enemy: {currentEnergy:0,maxEnergy:0,score:0} },
        turn: { active: side, phase: "day", round:1, turnNumber:1, sideTurns: { player:Number(side === "player"), enemy:Number(side === "enemy") }, lastNormal: side }, dreamwell:{deck:[],next:0} } };
    registerBattleInitProvider({ engine, beginBattle(input) { const declared = baseProvider.beginBattle(input); return declared === null ? null : { ...declared, engineInit: init }; } });
    const genesis = decodeGenesis(JSON.stringify(battleFixture.genesis)); if (genesis === null || !isFoldableGenesis(genesis)) throw Error("Missing genesis");
    const store = createMemoryKeyValueStore(), repository = createGameRepository(store), gameId = parseGameId(`score-group-reload-${side}`);
    const game = await createLocalGame(repository, GAME_ENGINE_CONFIG, {gameId,genesis,localPlayerId:parseClientId(`score-group-${side}`)}, {checkpointInterval:1,now:()=>0,eventClock:()=>"2026-01-01T00:00:00.000Z"});
    try {
      for (const record of battleFixture.events) { const e = decodeEvent(JSON.stringify(record.event)); game.log.append({type:e.type,payload:e.payload}); if (e.type === "BEGIN_BATTLE") break; }
      for (let n = 0; ; n++) {
        const battle = game.log.state().battle; if (battle === null || n > 20) throw Error("Missing pending battle");
        if (createFoldAdapter(engine).pending(battle.engine.slice) !== null) break;
        game.log.append({type:"BATTLE_ACTION",payload:{side:engine.decision(battle.engine.slice.committed)!.side,action:{kind:"pass"}}});
      }
      await game.flush(); const current = GAME_ENGINE_CONFIG.encode(game.log.state());
      const checkpoint = await store.get(`game/${gameId}/checkpoint`) as StoredCheckpoint;
      const original = JSON.parse(checkpoint.state) as FoldState;
      const exact = await openLocalGame(repository,GAME_ENGINE_CONFIG,gameId,{now:()=>0}); if (exact === null) throw Error("Missing exact reload");
      try { expect(exact.opened).toMatchObject({checkpointRejected:false,replayedEvents:0}); } finally { await exact.close(); }
      for (const boundary of ["current","history"] as const) {
        const saved = JSON.parse(JSON.stringify(original)) as FoldState;
        const fold = saved.battle!.engine;
        if (boundary === "current") delete fold.slice.committed.challenge!.scoring;
        else {
          const base = JSON.parse(JSON.stringify(fold.slice)) as BattleSlice;
          delete base.committed.challenge!.scoring;
          Object.assign(fold,{slice:{...fold.slice,history:{base,entries:[]}}});
          expect(fold.slice.committed.challenge!.scoring).toEqual(original.battle!.engine.slice.committed.challenge!.scoring);
        }
        await store.putAll([[`game/${gameId}/checkpoint`,{...checkpoint,state:JSON.stringify(saved),stateHash:hashState(saved)}]]);
        const restored = await openLocalGame(repository,GAME_ENGINE_CONFIG,gameId,{now:()=>0}); if (restored === null) throw Error("Missing fallback");
        try { expect(restored.opened).toMatchObject({checkpointSeq:0,checkpointRejected:true,replayFoldErrors:0}); expect(GAME_ENGINE_CONFIG.encode(restored.log.state())).toBe(current); } finally { await restored.close(); }
        const before = (await repository.readEvents(gameId,0)).length;
        game.log.append({type:"LOAD_STATE",payload:{snapshot:saved.journey,battle:saved.battle}}); await game.flush();
        expect(GAME_ENGINE_CONFIG.encode(game.log.state())).toBe(current);
        expect((await repository.readEvents(gameId,0)).length).toBe(before+1);
      }
    } finally { await game.close(); clearReplayFixtureProviders(); registerBattleInitProvider(provider); }
  });

  it.each(["player", "enemy"] as const)("guards a replayed final boundary against a duplicate scoring group for %s", side => {
    const done = finish(setup(side).state);
    const settled = done.steps.find(s => s.step.kind === "challengeLane" && s.step.lane === FRONT_RANK_SIZE - 1)!.state;
    const before = stateHash(settled);
    const replayed = runStep(settled, { kind: "challengeLane", lane: FRONT_RANK_SIZE - 1 }, source, engine.catalog);
    if (replayed.kind !== "done") throw Error("Repeated empty final lane suspended");
    expect(replayed.events.filter(e => e.kind === "scoreGroup")).toEqual([]);
    expect(replayed.state.triggerQueue).toEqual(settled.triggerQueue);
    expect(stateHash(settled)).toBe(before);
  });

  it("validates threshold and keeps either branches typed", () => {
    for (const count of [0, -1, .5, Infinity]) expect(() => whenScoreGroup(count)).toThrow();
    expect(either(whenScoreGroup(2), whenScoreGroup(3, "opponent")).on).toBe("either");
  });
});
