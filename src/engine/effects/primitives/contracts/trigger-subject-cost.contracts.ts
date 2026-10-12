/** Retained copiable subject costs across departure, privacy and replay. */
import { describe, expect, it } from "vitest";
import type { Engine } from "../../../engine";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { characterYouControl, energy, energyX, event, everyIn, fromVoid, self, staticAbility, triggerSubjectCost } from "../../../dsl/builders";
import { NO_DECK_MODS } from "../../../dsl/types";
import { thisCharacterSpark } from "../../../dsl/values";
import { triggered, whenDissolved, whenDraw } from "../../../dsl/triggers";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { eventSeenBy } from "../../../events";
import { stateHash } from "../../../state/hash";
import { SIDES, opponent, parseFigmentId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { runStep } from "../../../steps/runner";
import type { Step } from "../../../steps/kinds";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { comparableView } from "../../../testing/determinization-fidelity";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseAvatarId, parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import type { Effect } from "../../registry";
import * as p from "../index";

function step(engine: Engine, state: BattleState, action: Step, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const source = answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers);
  const result = runStep(state, action, source, engine.catalog);
  if (result.kind !== "done") throw new Error(`Unexpected ${result.prompt.kind}`);
  if (source instanceof ScriptedSource) source.assertExhausted();
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}
function world(side: Side, copy: boolean, body: Effect = p.gainPoints(triggerSubjectCost()), cost = 3, modified = false) {
  const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x560001), subtype: "Explorer", abilities: () => [triggered(whenDissolved(characterYouControl({ subtype: "Warrior" })), body)] };
  const subject: EngineCardDefinition = { ...v.vanilla3, id: syntheticId(0x560002), costs: [energy(cost), energyX(0)], subtype: "Warrior" };
  const prepare: EngineCardDefinition = { ...v.event0, id: syntheticId(0x560003), abilities: () => [event(p.materialize(everyIn("hand", { cardType: "character" })))] };
  const engine = createEngine(testCatalog([watcher, subject, prepare]));
  const initial = boardState(engine.catalog, { active: side, phase: "day", [side]: {
    back: modified ? [watcher.id] : [watcher.id, subject.id],
    hand: [copy ? v.dissolveFigmentCopy.id : v.dissolveVictim.id, ...(modified ? [prepare.id, { cardId: subject.id, deckMods: { ...NO_DECK_MODS, costReduction: 1 } }] : [])],
    void: [v.vanilla0.id, v.vanilla1.id, v.vanilla3.id, v.vanilla5.id], energy: 8,
  } });
  let state = { ...initial.state, config: { ...initial.state.config, autoAnswerForcedPrompts: false } };
  const subjectId = modified ? initial.ids[side].hand[2] : initial.ids[side].back[1]!;
  if (modified) {
    state = step(engine, state, { kind: "play", card: initial.ids[side].hand[1], from: "hand" }).state;
    state = step(engine, state, { kind: "resolveTop" }).state;
  }
  const cast = step(engine, state, { kind: "play", card: initial.ids[side].hand[0], from: "hand" }, [[subjectId]]);
  const departed = step(engine, cast.state, { kind: "resolveTop" });
  const queued = departed.events.find(item => item.kind === "triggerQueued");
  if (queued?.kind !== "triggerQueued" || queued.subject === null) throw new Error("Missing real subject trigger");
  return { engine, initial, watcher, subject, prepare, subjectId, departed, queued, side, cast, start: state };
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify(result));
  return result.slice;
}
function pendingFold(engine: Engine, committed: BattleState, side: Side, card: BattleState["sides"]["player"]["hand"][number], subject: BattleState["sides"]["player"]["hand"][number]) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const cast = applied(fold.reduce(sliceOf(committed), { kind: "battleAction", side, action: { kind: "play", card, from: "hand" } }));
  const initial = fold.pending(cast);
  if (initial === null) throw new Error("Missing public play target");
  const slice = applied(fold.reduce(cast, { kind: "answer", side, promptId: initial.prompt.id, value: [subject] }));
  return { fold, slice };
}
function saved(slice: BattleSlice) {
  return { mode: { kind: "journey" }, init: { battleId: parseBattleId("battle-subject-cost"), siteId: parseSiteId("site-subject-cost"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-subject-cost"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } };
}

describe("triggering subject copiable cost", () => {
  it.each(SIDES.flatMap(side => [false, true].flatMap(copy => [0, 3].map(cost => ({ side, copy, cost })))))("captures before departure for $side/copy=$copy/cost=$cost", ({ side, copy, cost }) => {
    const { engine, initial, subjectId, departed, queued } = world(side, copy, undefined, cost);
    expect(queued.lastKnownSubjectCost).toBe(cost);
    expect(queued.source).toBe(initial.ids[side].back[0]);
    expect(queued.subject).not.toBe(queued.source);
    if (copy) expect(departed.state.instances[queued.subject!]).toBeUndefined();
    else expect(queued.subject).toBe(subjectId);
    expect(step(engine, departed.state, { kind: "resolveTrigger" }).state.sides[side].score).toBe(cost);
  });

  it.each(SIDES)("uses deck-modified copied values with X counting zero for %s", side => {
    const { engine, departed, queued } = world(side, true, undefined, 3, true);
    expect(queued.lastKnownSubjectCost).toBe(2);
    expect(step(engine, departed.state, { kind: "resolveTrigger" }).state.sides[side].score).toBe(2);
  });

  it.each(SIDES)("keeps a ceased public subject's scalar in views and samples for %s", side => {
    const { engine, departed, queued, watcher, subject } = world(side, true);
    const view = engine.view(departed.state, side);
    expect(view.triggerQueue[0]).toMatchObject({ subject: null, lastKnownSubjectCost: 3 });
    const seen = eventSeenBy(queued, side, departed.state);
    expect(seen).toMatchObject({ subject: null, lastKnownSubjectCost: 3 });
    const lists = { [side]: [watcher.id, subject.id, v.dissolveFigmentCopy.id, v.vanilla0.id, v.vanilla1.id, v.vanilla3.id, v.vanilla5.id].map(cardId => ({ cardId })), [opponent(side)]: [] };
    const sample = engine.determinize(view, { player: lists.player, enemy: lists.enemy }, () => 0.4);
    expect(sample.triggerQueue[0].lastKnownSubjectCost).toBe(3);
    expect(comparableView(engine.view(sample, side))).toEqual(comparableView(view));
    expect(step(engine, sample, { kind: "resolveTrigger" }).state.sides[side].score).toBe(3);
  });

  it.each(SIDES)("withholds a hidden drawn subject's captured cost from %s", viewer => {
    const holder = opponent(viewer);
    const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x560010), abilities: () => [triggered(whenDraw("opponent"), p.gainPoints(triggerSubjectCost()))] };
    const draw: EngineCardDefinition = { ...v.event0, id: syntheticId(0x560011), abilities: () => [event(p.draw(1))] };
    const engine = createEngine(testCatalog([watcher, draw]));
    const initial = boardState(engine.catalog, { active: holder, phase: "day", [viewer]: { back: [watcher.id] }, [holder]: { hand: [draw.id], deck: [v.vanilla3.id] } });
    const cast = step(engine, initial.state, { kind: "play", card: initial.ids[holder].hand[0], from: "hand" });
    const drawn = step(engine, cast.state, { kind: "resolveTop" });
    const queued = drawn.events.find(item => item.kind === "triggerQueued");
    expect(queued).toHaveProperty("lastKnownSubjectCost", 3);
    expect(queued && eventSeenBy(queued, viewer, drawn.state)).not.toHaveProperty("lastKnownSubjectCost");
    const view = engine.view(drawn.state, viewer);
    expect(view.triggerQueue[0]).not.toHaveProperty("lastKnownSubjectCost");
    expect(view.triggerQueue[0]).toMatchObject({ subject: null, subjectCostHidden: true });
    const lists = { [viewer]: [{ cardId: watcher.id }], [holder]: [{ cardId: draw.id }, { cardId: v.vanilla3.id }] };
    const sample = engine.determinize(view, { player: lists.player, enemy: lists.enemy }, () => 0.4);
    expect(comparableView(engine.view(sample, viewer))).toEqual(comparableView(view));
    expect(step(engine, sample, { kind: "resolveTrigger" }).state.sides[viewer].score).toBe(3);
    for (const extra of [{ lastKnownSubjectCost: 3 }, { subject: initial.ids[holder].deck[0] }, { source: null }, { origin: null }]) {
      const invalid = { ...view, triggerQueue: [{ ...view.triggerQueue[0], ...extra }] };
      const before = structuredClone(invalid);
      expect(() => engine.determinize(invalid, { player: lists.player, enemy: lists.enemy }, () => 0.4)).toThrow(/hidden subject cost/);
      expect(invalid).toEqual(before);
    }
    expect(engine.view(drawn.state, holder).triggerQueue[0].lastKnownSubjectCost).toBe(3);
  });


  it.each(SIDES)("samples coherent first-draw costs for structured avatar sources of %s", viewer => {
    const holder = opponent(viewer), avatar = parseAvatarId("5e5e5e5e-0000-4000-8000-000000560040");
    const draw: EngineCardDefinition = { ...v.event0, id: syntheticId(0x560041), abilities: () => [event(p.draw(1))] };
    const abilities = () => [triggered(whenDraw("opponent", 1), p.gainPoints(triggerSubjectCost())), triggered(whenDraw("opponent", 1), p.gainPoints(triggerSubjectCost()))];
    const engine = createEngine(testCatalog([draw], { avatars: [{ id: avatar, status: "authored", abilities }] }));
    const initial = boardState(engine.catalog, { active: holder, phase: "day", [viewer]: { avatar }, [holder]: { hand: [draw.id, v.vanilla5.id], deck: [v.vanilla3.id] } });
    const cast = step(engine, initial.state, { kind: "play", card: initial.ids[holder].hand[0], from: "hand" });
    const drawn = step(engine, cast.state, { kind: "resolveTop" }), view = engine.view(drawn.state, viewer);
    expect(view.triggerQueue).toHaveLength(2);
    expect(view.triggerQueue.every(item => item.subjectCostHidden === true)).toBe(true);
    const lists = { [viewer]: [], [holder]: [draw.id, v.vanilla3.id, v.vanilla5.id].map(cardId => ({ cardId })) };
    let high = false;
    const alternating = () => { high = !high; return high ? 0 : 1 - Number.EPSILON; };
    for (const random of [() => 0, () => 1 - Number.EPSILON, alternating]) {
      const sample = engine.determinize(view, { player: lists.player, enemy: lists.enemy }, random);
      const costs = sample.triggerQueue.map(item => item.lastKnownSubjectCost);
      expect(costs[0]).toBe(costs[1]);
      expect([3, 5]).toContain(costs[0]);
      expect(comparableView(engine.view(sample, viewer))).toEqual(comparableView(view));
      const first = step(engine, sample, { kind: "resolveTrigger" });
      expect(step(engine, first.state, { kind: "resolveTrigger" }).state.sides[viewer].score).toBe(costs[0]! * 2);
    }
  });

  it.each(SIDES)("samples equal public views independently of the actual hidden drawn cost for %s", viewer => {
    const holder = opponent(viewer);
    const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x560044), abilities: () => [triggered(whenDraw("opponent", 1), p.gainPoints(triggerSubjectCost()))] };
    const draw: EngineCardDefinition = { ...v.event0, id: syntheticId(0x560045), abilities: () => [event(p.draw(1))] };
    const engine = createEngine(testCatalog([watcher, draw]));
    const views = [[v.vanilla3.id, v.vanilla5.id], [v.vanilla5.id, v.vanilla3.id]].map(deck => {
      const initial = boardState(engine.catalog, { active: holder, phase: "day", [viewer]: { back: [watcher.id] }, [holder]: { hand: [draw.id], deck } });
      const cast = step(engine, initial.state, { kind: "play", card: initial.ids[holder].hand[0], from: "hand" });
      const drawn = step(engine, cast.state, { kind: "resolveTop" });
      return engine.view(drawn.state, viewer);
    });
    expect(views[0]).toEqual(views[1]);
    const lists = { [viewer]: [{ cardId: watcher.id }], [holder]: [draw.id, v.vanilla3.id, v.vanilla5.id].map(cardId => ({ cardId })) };
    const samples = views.map(view => engine.determinize(view, { player: lists.player, enemy: lists.enemy }, () => 0.4));
    expect(stateHash(samples[0])).toBe(stateHash(samples[1]));
    for (const sample of samples) {
      expect([3, 5]).toContain(sample.triggerQueue[0].lastKnownSubjectCost);
      expect(comparableView(engine.view(sample, viewer))).toEqual(comparableView(views[0]));
      expect(step(engine, sample, { kind: "resolveTrigger" }).state.sides[viewer].score).toBe(sample.triggerQueue[0].lastKnownSubjectCost);
    }
  });

  it.each(SIDES)("keeps differently declared draw obligations separate for %s", viewer => {
    const holder = opponent(viewer);
    const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x560046), abilities: () => [
      triggered(whenDraw("you", 1), p.gainPoints(triggerSubjectCost())), triggered(whenDraw("opponent", 1), p.gainPoints(triggerSubjectCost())),
    ] };
    const draw: EngineCardDefinition = { ...v.event0, id: syntheticId(0x560047), abilities: () => [event(p.sequence(p.draw(1), p.draw(1, "opponent")))] };
    const engine = createEngine(testCatalog([watcher, draw]));
    const initial = boardState(engine.catalog, { active: holder, phase: "day", [viewer]: { back: [watcher.id], deck: [v.vanilla1.id] }, [holder]: { hand: [draw.id], deck: [v.vanilla3.id] } });
    const cast = step(engine, initial.state, { kind: "play", card: initial.ids[holder].hand[0], from: "hand" });
    const drawn = step(engine, cast.state, { kind: "resolveTop" }), view = engine.view(drawn.state, viewer);
    expect(view.triggerQueue.map(item => item.subjectCostHidden === true)).toEqual([true, false]);
    const lists = { [viewer]: [watcher.id, v.vanilla1.id].map(cardId => ({ cardId })), [holder]: [draw.id, v.vanilla3.id].map(cardId => ({ cardId })) };
    const sample = engine.determinize(view, { player: lists.player, enemy: lists.enemy }, () => 0.4);
    expect(sample.triggerQueue.map(item => item.lastKnownSubjectCost)).toEqual([3, 1]);
    expect(comparableView(engine.view(sample, viewer))).toEqual(comparableView(view));
    const first = step(engine, sample, { kind: "resolveTrigger" });
    expect(step(engine, first.state, { kind: "resolveTrigger" }).state.sides[viewer].score).toBe(4);
  });

  it.each(SIDES)("consumes the public multiset for different numbered draw obligations of %s", viewer => {
    const holder = opponent(viewer);
    const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x560048), abilities: () => [
      triggered(whenDraw("opponent", 1), p.gainPoints(triggerSubjectCost())),
      triggered(whenDraw("opponent", 1), p.gainPoints(triggerSubjectCost())),
      triggered(whenDraw("opponent", 2), p.gainPoints(triggerSubjectCost())),
    ] };
    const draw: EngineCardDefinition = { ...v.event0, id: syntheticId(0x560049), abilities: () => [event(p.draw(2))] };
    const engine = createEngine(testCatalog([watcher, draw]));
    const initial = boardState(engine.catalog, { active: holder, phase: "day", [viewer]: { back: [watcher.id] }, [holder]: { hand: [draw.id], deck: [v.vanilla3.id, v.vanilla5.id] } });
    const cast = step(engine, initial.state, { kind: "play", card: initial.ids[holder].hand[0], from: "hand" });
    const drawn = step(engine, cast.state, { kind: "resolveTop" }), view = engine.view(drawn.state, viewer);
    const lists = { [viewer]: [{ cardId: watcher.id }], [holder]: [draw.id, v.vanilla3.id, v.vanilla5.id].map(cardId => ({ cardId })) };
    for (const entropy of [0, 0.4, 1 - Number.EPSILON]) {
      const sample = engine.determinize(view, { player: lists.player, enemy: lists.enemy }, () => entropy);
      const costs = sample.triggerQueue.map(item => item.lastKnownSubjectCost!);
      expect(costs[0]).toBe(costs[1]);
      expect([costs[0], costs[2]].sort((a, b) => a - b)).toEqual([3, 5]);
      expect(comparableView(engine.view(sample, viewer))).toEqual(comparableView(view));
      let resolved = sample;
      for (const cost of costs) {
        const before = resolved.sides[viewer].score;
        resolved = step(engine, resolved, { kind: "resolveTrigger" }).state;
        expect(resolved.sides[viewer].score - before).toBe(cost);
      }
    }
  });

  it.each(SIDES)("preserves explicit zero and legacy missing bindings for hidden draws to %s", viewer => {
    const holder = opponent(viewer);
    const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x560042), abilities: () => [triggered(whenDraw("opponent"), p.gainPoints(triggerSubjectCost()))] };
    const draw: EngineCardDefinition = { ...v.event0, id: syntheticId(0x560043), abilities: () => [event(p.draw(1))] };
    const engine = createEngine(testCatalog([watcher, draw]));
    const initial = boardState(engine.catalog, { active: holder, phase: "day", [viewer]: { back: [watcher.id] }, [holder]: { hand: [draw.id], deck: [v.vanilla0.id] } });
    const cast = step(engine, initial.state, { kind: "play", card: initial.ids[holder].hand[0], from: "hand" });
    const drawn = step(engine, cast.state, { kind: "resolveTop" }), view = engine.view(drawn.state, viewer);
    const lists = { [viewer]: [{ cardId: watcher.id }], [holder]: [draw.id, v.vanilla0.id].map(cardId => ({ cardId })) };
    const sample = engine.determinize(view, { player: lists.player, enemy: lists.enemy }, () => 0.4);
    expect(sample.triggerQueue[0].lastKnownSubjectCost).toBe(0);
    expect(step(engine, sample, { kind: "resolveTrigger" }).state.sides[viewer].score).toBe(0);
    const { subjectCostHidden: omitted, ...legacyTrigger } = view.triggerQueue[0];
    expect(omitted).toBe(true);
    const legacy = engine.determinize({ ...view, triggerQueue: [legacyTrigger] }, { player: lists.player, enemy: lists.enemy }, () => 0.4);
    expect(legacy.triggerQueue[0]).not.toHaveProperty("lastKnownSubjectCost");
    expect(step(engine, legacy, { kind: "resolveTrigger" }).state.sides[viewer].score).toBe(0);
  });

  it.each(SIDES)("captures a generated figment's zero cost before it ceases for %s", side => {
    const figment = { id: parseFigmentId("5e5e5e5e-0000-4000-8000-000000560030"), subtype: "Warrior" as const, spark: 4, status: "authored" as const, abilities: () => [] };
    const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x560031), abilities: () => [triggered(whenDissolved(characterYouControl({ figment: true })), p.gainPoints(triggerSubjectCost()))] };
    const engine = createEngine(testCatalog([watcher], {}, [figment]));
    const initial = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [watcher.id], figments: [{ slot: { rank: "back", index: 1 }, printing: { kind: "figment", figment: figment.id, spark: 4 } }], hand: [v.dissolveVictim.id] } });
    const id = initial.state.sides[side].backRank[1]!;
    const cast = step(engine, initial.state, { kind: "play", card: initial.ids[side].hand[0], from: "hand" }, [[id]]);
    const departed = step(engine, cast.state, { kind: "resolveTop" });
    expect(departed.state.instances[id]).toBeUndefined();
    expect(departed.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", subject: id, lastKnownSubjectCost: 0 }));
    expect(step(engine, departed.state, { kind: "resolveTrigger" }).state.sides[side].score).toBe(0);
  });

  it.each(SIDES)("retains the binding through modal and deferred payment targeting for %s", side => {
    const returned = p.returnFromVoid(fromVoid({ subtype: "Warrior" }, { costLessThan: triggerSubjectCost() }));
    for (const [body, answers] of [
      [p.chooseOne(p.gainPoints(0), returned), [1, []]],
      [p.payTo({ energy: 1 }, returned), [true, []]],
    ] as const) {
      const { engine, initial, departed } = world(side, true, body);
      const target = initial.ids[side].void[1];
      const resolved = step(engine, departed.state, { kind: "resolveTrigger" }, [answers[0], [target]]);
      expect(resolved.state.instances[target].zone).toBe("hand");
      expect(resolved.events.filter(item => item.kind === "returnedToHand" && item.instance === target)).toHaveLength(1);
    }
  });

  it.each(SIDES)("emits no legal target at captured zero and preserves source-spark targeting for %s", side => {
    const ref = fromVoid({ subtype: "Warrior" }, { costLessThan: triggerSubjectCost() });
    const empty = world(side, true, p.returnFromVoid(ref), 0);
    const result = step(empty.engine, empty.departed.state, { kind: "resolveTrigger" });
    expect(result.events).toContainEqual({ kind: "noLegalTarget", source: empty.queued.source });
    expect(result.events.some(item => item.kind === "returnedToHand")).toBe(false);
    const sourceSpark = world(side, true, p.returnFromVoid(fromVoid({ subtype: "Warrior" }, { costLessThan: thisCharacterSpark() })));
    const zero = sourceSpark.initial.ids[side].void[0];
    expect(step(sourceSpark.engine, sourceSpark.departed.state, { kind: "resolveTrigger" }, [[zero]]).state.instances[zero].zone).toBe("hand");
  });

  it.each(SIDES)("contains an error after reading the captured value without partial committed writes for %s", side => {
    const missing = parseFigmentId("5e5e5e5e-0000-4000-8000-000000560099");
    const body = p.optional(p.sequence(p.gainPoints(triggerSubjectCost()), p.materializeFigments(missing)));
    const { engine, initial, start, subjectId } = world(side, true, body);
    const { fold, slice } = pendingFold(engine, start, side, initial.ids[side].hand[0], subjectId);
    const loaded = parseJourneyBattleFoldState(saved(slice))!.engine.slice;
    const prompt = fold.pending(loaded)!.prompt;
    const before = stateHash(loaded.committed);
    const result = fold.reduce(loaded, { kind: "answer", side, promptId: prompt.id, value: true });
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") throw new Error("Missing contained error");
    expect(result.error).not.toBeNull();
    expect(result.slice.committed.sides[side].score).toBe(0);
    expect(result.slice.committed.triggerQueue[0].lastKnownSubjectCost).toBe(3);
    expect(stateHash(loaded.committed)).toBe(before);
  });

  it("rejects static reading, while a resolving missing binding is safe zero", () => {
    const reader: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x560020), abilities: () => [staticAbility(p.sparkModifier(self(), triggerSubjectCost()))] };
    const engine = createEngine(testCatalog([reader]));
    const board = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [reader.id] } });
    expect(() => engine.view(board.state, "player")).toThrow(/static ability/);
    const eventReader: EngineCardDefinition = { ...v.event0, id: syntheticId(0x560021), abilities: () => [event(p.gainPoints(triggerSubjectCost()))] };
    const resolving = createEngine(testCatalog([eventReader]));
    const initial = boardState(resolving.catalog, { active: "player", phase: "day", player: { hand: [eventReader.id] } });
    const cast = step(resolving, initial.state, { kind: "play", card: initial.ids.player.hand[0], from: "hand" });
    expect(step(resolving, cast.state, { kind: "resolveTop" }).state.sides.player.score).toBe(0);
  });

  it.each(SIDES)("reloads, replays and validates suspended subject-cost resolution for %s", side => {
    const body = p.optional(p.returnFromVoid(fromVoid({ subtype: "Warrior" }, { costLessThan: triggerSubjectCost() })));
    const { engine, initial, start, subjectId } = world(side, true, body);
    const { fold, slice: before } = pendingFold(engine, start, side, initial.ids[side].hand[0], subjectId);
    const loaded = parseJourneyBattleFoldState(saved(before))!.engine.slice;
    const pending = fold.pending(loaded)!;
    if (pending.prompt.kind !== "chooseTargets") throw new Error("Missing real void target");
    expect(fold.pending(before)!.prompt).toEqual(pending.prompt);
    expect(pending.prompt.candidates).toEqual(initial.ids[side].void.slice(0, 2));
    expect(fold.reduce(loaded, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(loaded, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: [initial.ids[side].void[1]] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: [initial.ids[side].void[2]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const selected = applied(fold.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: [initial.ids[side].void[1]] }));
    expect(fold.reduce(selected, { kind: "answer", side, promptId: pending.prompt.id, value: [initial.ids[side].void[1]] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const confirm = fold.pending(selected)!;
    expect(confirm.prompt.kind).toBe("confirm");
    const restarted = parseJourneyBattleFoldState(saved(selected))!.engine.slice;
    const intent = { kind: "answer", side, promptId: confirm.prompt.id, value: true } as const;
    const done = applied(fold.reduce(restarted, intent)), direct = applied(fold.reduce(selected, intent));
    expect(stateHash(done.committed)).toBe(stateHash(direct.committed));
    expect(done.committed.instances[initial.ids[side].void[1]].zone).toBe("hand");
    expect(fold.reduce(done, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });
});
