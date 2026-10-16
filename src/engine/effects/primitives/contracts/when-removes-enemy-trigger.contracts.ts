/** Causal removal contracts use real engine steps and synthetic cards/emblems. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { all, anyCharacter, characterYouControl, energy, event, everyIn, keyword, self, staticAbility, target, triggerSubjectCost } from "../../../dsl/builders";
import { NO_DECK_MODS, type Ability, type Trigger } from "../../../dsl/types";
import { atEndOfTurn, triggered, triggeringCard, whenDissolvesEnemyInChallenge, whenRemovesEnemy, whenScores } from "../../../dsl/triggers";
import { createEngine, type Engine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { INTERACTIVE, NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { Step } from "../../../steps/kinds";
import { boardState } from "../../../testing/board";
import { comparableView } from "../../../testing/determinization-fidelity";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { parseDreamsignId } from "../../../../types/identifiers";
import type { ResolvingEffect } from "../../registry";
import * as p from "../index";

const id = (n: number) => syntheticId(0x229000 + n);
const emblem = (n: number, abilities: readonly Ability[]): EngineDreamsignDefinition => ({
  id: parseDreamsignId(`5e5e5e5e-0000-4000-8000-${(0x229100 + n).toString(16).padStart(12, "0")}`), status: "authored", abilities: () => abilities,
});
const watcher = (n: number, trigger: Trigger, effect: ResolvingEffect = p.gainPoints(1), once = false) => emblem(n, [triggered(trigger, effect, { oncePerTurn: once })]);
const victim: EngineCardDefinition = { ...v.vanilla5, id: id(2), spark: 3 };
const actor: EngineCardDefinition = { ...v.vanilla3, id: id(3), costs: [energy(4)], spark: 3 };
const spell = (n: number, effect: ResolvingEffect, speed: "standard" | "interrupt" = "standard"): EngineCardDefinition => ({
  ...v.event0, id: id(n), status: "authored", speed, abilities: () => [event(effect)],
});
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
function world(effect: ResolvingEffect, signs = [watcher(1, whenRemovesEnemy())], side: Side = "player", extra: readonly EngineCardDefinition[] = [], foeDefinition = victim) {
  const cast = spell(1, effect);
  const engine = createEngine(testCatalog([cast, foeDefinition, actor, ...extra], { dreamsigns: signs }));
  const foe = opponent(side);
  const board = boardState(engine.catalog, {
    active: side, phase: "day", scoreToWin: 100,
    [side]: { hand: [cast.id, v.vanilla0.id, v.vanilla1.id], dreamsigns: signs.map(s => s.id), energy: 20, deck },
    [foe]: { back: [foeDefinition.id], hand: extra.map(c => c.id), energy: 20, deck },
  });
  board.state = { ...board.state, config: { ...board.state.config, autoAnswerForcedPrompts: false } };
  return { engine, ...board, side, foe, card: board.ids[side].hand[0], target: board.ids[foe].back[0]! };
}
function step(engine: Engine, state: BattleState, action: Step, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const result = runStep(state, action, answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers), engine.catalog);
  if (result.kind !== "done") throw new Error(`unexpected ${result.prompt.kind}`);
  return result;
}
function play(w: ReturnType<typeof world>, picks: readonly InstanceId[] = [w.target]) {
  return step(w.engine, w.state, { kind: "play", card: w.card, from: "hand" }, picks.length === 0 ? [] : [picks]);
}
function resolve(w: ReturnType<typeof world>, picks: readonly InstanceId[] = [w.target]) {
  const played = play(w, picks);
  return step(w.engine, played.state, { kind: "resolveTop" });
}
function drain(engine: Engine, start: BattleState) {
  let state = start;
  const events: EngineEvent[] = [];
  while (state.triggerQueue.length > 0) {
    const next = step(engine, state, { kind: "resolveTrigger" });
    state = next.state; events.push(...next.events);
  }
  return { state, events };
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`bad fold outcome ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

/** A real deck-modified actor is played, optionally copied, and repositioned for a lane. */
function lane(side: Side, options: { createdActor?: boolean; createdVictim?: boolean; vengeful?: boolean; weaker?: boolean; blocked?: boolean; reclaimed?: boolean; blockerWin?: boolean } = {}) {
  const signs = [watcher(1, whenRemovesEnemy(), p.gainPoints(triggerSubjectCost())),
    watcher(2, whenDissolvesEnemyInChallenge(), p.gainPoints(triggerSubjectCost())),
    watcher(3, whenDissolvesEnemyInChallenge(), p.gainSpark(triggeringCard(), 2))];
  const a = { ...actor, abilities: () => [keyword("awakened"), ...(options.vengeful ? [keyword("vengeful")] : [])] };
  const b = { ...victim, spark: options.blockerWin ? 4 : options.weaker ? 2 : 3, abilities: () => options.vengeful ? [keyword("vengeful")] : [] };
  const copy = spell(4, p.materializeFigmentCopy(target(characterYouControl())));
  const modifier = emblem(4, [staticAbility(p.costModifier("you", { cardType: "character" }, -1))]);
  const engine = createEngine(testCatalog([a, b, copy], { dreamsigns: [...signs, modifier] }));
  const foe = opponent(side);
  const board = boardState(engine.catalog, {
    active: side, phase: "day", scoreToWin: 100,
    [side]: { hand: [{ cardId: a.id, deckMods: { ...NO_DECK_MODS, costReduction: 1 } }, copy.id], dreamsigns: [...(options.blockerWin ? [] : signs), modifier].map(s => s.id), energy: 10, deck },
    [foe]: { front: options.blocked === false ? [] : [b.id], dreamsigns: options.blockerWin ? signs.map(s => s.id) : [], deck },
  });
  let state = step(engine, board.state, { kind: "play", card: board.ids[side].hand[0], from: "hand" }).state;
  // Copiable 3●, with a separate -1 play modifier: actual payment is 2●.
  expect(state.sides[side].currentEnergy).toBe(8);
  state = step(engine, state, { kind: "resolveTop" }).state;
  let mover = board.ids[side].hand[0];
  if (options.createdActor) {
    state = step(engine, state, { kind: "play", card: board.ids[side].hand[1], from: "hand" }, [[mover]]).state;
    const copied = step(engine, state, { kind: "resolveTop" }); state = copied.state;
    const created = copied.events.find(e => e.kind === "cardCreated");
    if (created?.kind !== "cardCreated") throw new Error("no actual copy");
    mover = created.instance;
  }
  const targetId = board.ids[foe].front[0];
  if (targetId !== null && targetId !== undefined) {
    if (options.createdVictim) state.instances[targetId].status.created = true;
    if (options.reclaimed) state.instances[targetId].status.reclaimed = true;
  }
  state = step(engine, state, { kind: "reposition", card: mover, to: { rank: "front", index: 0 } }).state;
  const result = passUntil(engine, state, at(engine, foe, "day"));
  const queued = result.steps.find(s => s.step.kind === "challengeLane" && s.state.triggerQueue.length > 0)?.state;
  return { engine, side, foe, mover, targetId, signs, queued, ...result };
}

describe("whenRemovesEnemy", () => {
  it.each(SIDES)("records the resolving controller and pre-departure victim cost on an actual enemy dissolve for %s", side => {
    const w = world(p.dissolve(target(anyCharacter())), [], side);
    const result = resolve(w);
    expect(result.state.instances[w.target].zone).toBe("void");
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "dissolved", instance: w.target,
      removal: { kind: "effect", controller: side, victimCost: 5 } }));
  });

  it.each(SIDES)("counts confirmed effect outcomes and rejects ordinary returns/created-return cessation for %s", side => {
    for (const kind of ["dissolve", "banish", "banishUntil", "return", "deck", "phase"] as const) {
      for (const reclaimed of [false, true]) {
        const subject = target(anyCharacter());
        const effect = kind === "dissolve" ? p.dissolve(subject) : kind === "banish" ? p.banish(subject)
          : kind === "banishUntil" ? p.banishUntil(subject, "untilEndOfTurn") : kind === "return" ? p.returnToHand(subject)
          : kind === "phase" ? p.phase(subject) : p.putInDeck([subject], "top");
        const signs = [watcher(1, whenRemovesEnemy()), watcher(2, whenDissolvesEnemyInChallenge())];
        const w = world(effect, signs, side); w.state.instances[w.target].status.reclaimed = reclaimed;
        // Legacy deck-placement banishment names owner; causal opposition names the actual controller.
        w.state.instances[w.target] = { ...w.state.instances[w.target], owner: side };
        const result = resolve(w); const done = drain(w.engine, result.state);
        const qualifying = reclaimed || ["dissolve", "banish", "banishUntil"].includes(kind);
        expect(done.state.sides[side].score, `${kind}/${reclaimed}`).toBe(qualifying ? 1 : 0);
        expect(result.state.triggerQueue.every(t => t.ability === 0 && typeof t.source === "object" && t.source.kind === "dreamsign" && t.source.index === 0)).toBe(true);
      }
    }
    const createdReturn = world(p.returnToHand(target(anyCharacter())), undefined, side);
    createdReturn.state.instances[createdReturn.target].status.created = true;
    expect(resolve(createdReturn).state.triggerQueue).toEqual([]);
  });

  it.each(SIDES)("counts created dissolve/explicit banish once while preserving public ceased subject cost for %s", side => {
    for (const banish of [false, true]) {
      const w = world(banish ? p.banish(target(anyCharacter())) : p.dissolve(target(anyCharacter())),
        [watcher(1, whenRemovesEnemy(), p.gainPoints(triggerSubjectCost()))], side);
      w.state.instances[w.target].status.created = true;
      const result = resolve(w);
      expect(result.state.instances[w.target]).toBeUndefined();
      expect(result.state.triggerQueue).toHaveLength(1);
      expect(result.state.triggerQueue[0]).toMatchObject({ subject: w.target, lastKnownSubjectCost: 5 });
      for (const viewer of SIDES) {
        expect(w.engine.view(result.state, viewer).triggerQueue[0]).toMatchObject({ subject: null, lastKnownSubjectCost: 5 });
        const queued = result.events.find(e => e.kind === "triggerQueued")!;
        expect(eventSeenBy(queued, viewer, result.state)).toMatchObject({ subject: null, lastKnownSubjectCost: 5 });
      }
      expect(drain(w.engine, result.state).state.sides[side].score).toBe(5);
    }
  });

  it("does not credit Veil prevention, ally removal, opponent effects, pile banishment, status cleanup or ordinary cessation", () => {
    const protectedEnemy: EngineCardDefinition = { ...victim, id: id(5), abilities: () => [keyword("veil")] };
    const w = world(p.dissolve(target(anyCharacter())), undefined, "player", [], protectedEnemy);
    expect(resolve(w).state.triggerQueue).toEqual([]);
    const ally = world(p.dissolve(target(anyCharacter())));
    const own = step(ally.engine, ally.state, { kind: "play", card: ally.ids.player.hand[1], from: "hand" });
    const entered = step(ally.engine, own.state, { kind: "resolveTop" });
    expect(resolve({ ...ally, state: entered.state, target: ally.ids.player.hand[1] }).state.triggerQueue).toEqual([]);
    const foreign = world(p.dissolve(target(anyCharacter())), [watcher(1, whenRemovesEnemy())], "enemy");
    foreign.state.sides.player.dreamsigns = foreign.state.sides.enemy.dreamsigns;
    foreign.state.sides.enemy.dreamsigns = [];
    expect(resolve(foreign).state.triggerQueue).toEqual([]);
    const piles = world(p.banishCards([everyIn("hand", {}, { player: "opponent" })]));
    expect(resolve(piles, []).state.triggerQueue).toEqual([]);
    const cleanup = world(p.sequence()); cleanup.state.instances[cleanup.target].status.offering = true;
    const ended = passUntil(cleanup.engine, cleanup.state, at(cleanup.engine, "enemy", "day"));
    expect(ended.events.some(e => e.kind === "banished" && e.instance === cleanup.target)).toBe(true);
    expect(ended.events.some(e => e.kind === "triggerQueued")).toBe(false);
  });

  it("suppresses causal attribution when the opponent abandons a reclaimed enemy, including the replacement banishment", () => {
    const w = world(p.abandon("opponent"));
    w.state.instances[w.target].status.reclaimed = true;
    const played = play(w, []);
    const result = step(w.engine, played.state, { kind: "resolveTop" }, [[w.target]]);
    expect(result.state.instances[w.target].zone).toBe("banished");
    expect(result.state.triggerQueue).toEqual([]);
    expect(result.events.filter(e => e.kind === "banished")).toEqual([{ kind: "banished", instance: w.target, side: w.foe }]);
  });

  it("publishes no hidden effect-source identity through public removal provenance", () => {
    const hidden: EngineCardDefinition = { ...v.event0, id: id(10), status: "authored", abilities: () => [
      triggered(atEndOfTurn(), p.banish(target(anyCharacter())), { zone: "hand" }),
    ] };
    const signs = [watcher(1, whenRemovesEnemy())];
    const engine = createEngine(testCatalog([hidden, victim], { dreamsigns: signs }));
    const board = boardState(engine.catalog, { active: "player", phase: "day", scoreToWin: 100,
      player: { hand: [hidden.id], dreamsigns: signs.map(s => s.id), deck }, enemy: { back: [victim.id], deck } });
    const result = passUntil(engine, board.state, at(engine, "enemy", "day"), new ScriptedSource([[board.ids.enemy.back[0]!]]));
    const removed = result.events.find(e => e.kind === "banished")!;
    expect(eventSeenBy(removed, "enemy", result.state)).toEqual({ kind: "banished", instance: board.ids.enemy.back[0], side: "enemy",
      removal: { kind: "effect", controller: "player", victimCost: 5 } });
    const privateTrigger = result.events.find(e => e.kind === "triggerQueued" && e.source === board.ids.player.hand[0])!;
    expect(eventSeenBy(privateTrigger, "enemy", result.state)).toBeNull();
    expect(result.state.sides.player.score).toBe(1);
  });

  it("uses once-per-turn allowances for each source and renews them at the next turn", () => {
    const signs = [watcher(1, whenRemovesEnemy(), p.gainPoints(1), true), watcher(2, whenRemovesEnemy(), p.gainPoints(1), true)];
    const w = world(p.dissolve(all(anyCharacter())), signs);
    const board = boardState(w.engine.catalog, { active: "player", phase: "day", scoreToWin: 100,
      player: { hand: [id(1)], back: [v.vanilla0.id], dreamsigns: signs.map(s => s.id), deck },
      enemy: { back: [victim.id, victim.id], deck } });
    // Two enemies consume each independent allowance once; the ally consumes neither.
    const result = resolve({ ...w, ...board, card: board.ids.player.hand[0] }, []);
    expect(result.state.triggerQueue).toHaveLength(2);
    const done = drain(w.engine, result.state);
    expect(done.state.sides.player.score).toBe(2);
    const next = passUntil(w.engine, done.state, at(w.engine, "enemy", "day"));
    expect(next.state.oncePerTurn).toEqual([]);
  });

  it("retains a delayed captured banishment's creating controller after control changes and cold reload", () => {
    const summon = spell(6, p.withMaterialized(p.materialize(everyIn("void", { cardType: "character" })),
      p.delayed(atEndOfTurn(), p.banishCards([p.capturedCards()]))));
    const steal = spell(7, p.gainControl(target(anyCharacter())), "interrupt");
    const neutral = spell(9, p.sequence());
    const signs = [watcher(1, whenRemovesEnemy())];
    const engine = createEngine(testCatalog([summon, steal, neutral, victim], { dreamsigns: signs }));
    const board = boardState(engine.catalog, { active: "player", phase: "day", scoreToWin: 100,
      player: { hand: [summon.id, neutral.id], void: [victim.id], dreamsigns: signs.map(s => s.id), deck },
      enemy: { hand: [steal.id], deck } });
    let state = step(engine, board.state, { kind: "play", card: board.ids.player.hand[0], from: "hand" }).state;
    state = step(engine, state, { kind: "resolveTop" }).state;
    state = step(engine, state, { kind: "play", card: board.ids.player.hand[1], from: "hand" }).state;
    state = step(engine, state, { kind: "play", card: board.ids.enemy.hand[0], from: "hand" }, [[board.ids.player.void[0]]]).state;
    state = step(engine, state, { kind: "resolveTop" }).state;
    state = step(engine, state, { kind: "resolveTop" }).state;
    const loaded = deserializeState(serializeState(state));
    const normal = passUntil(engine, state, at(engine, "enemy", "day"));
    const replay = passUntil(engine, loaded, at(engine, "enemy", "day"));
    expect(replay.events).toEqual(normal.events); expect(stateHash(replay.state)).toBe(stateHash(normal.state));
    expect(replay.state.sides.player.score).toBe(1);
  });

  it("rolls back an error after removal and safely replays a suspended partial resolution with stale competing answers rejected", () => {
    const bad = world(p.sequence(p.dissolve(target(anyCharacter())), p.gainAdditionalSpark(self(), 1)));
    const played = play(bad); const before = stateHash(played.state);
    expect(() => step(bad.engine, played.state, { kind: "resolveTop" })).toThrow("gainAdditionalSpark");
    expect(stateHash(played.state)).toBe(before); expect(played.state.instances[bad.target].zone).toBe("play");
    const w = world(p.sequence(p.dissolve(target(anyCharacter())), p.discard(1)));
    const start = play(w).state; const hash = stateHash(start);
    const suspended = runStep(start, { kind: "resolveTop" }, INTERACTIVE, w.engine.catalog);
    expect(suspended.kind).toBe("suspended"); expect(stateHash(start)).toBe(hash);
    const adapter = createFoldAdapter(w.engine);
    const choosing = applied(adapter.reduce(sliceOf(w.state), { kind: "battleAction", side: "player", action: { kind: "play", card: w.card, from: "hand" } }));
    const targetPrompt = adapter.pending(choosing)!;
    const waiting = applied(adapter.reduce(choosing, { kind: "answer", side: "player", promptId: targetPrompt.prompt.id, value: [w.target] }));
    const saved = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
    expect(stateHash(saved.committed)).toBe(hash);
    const cold = createFoldAdapter(w.engine); const pending = cold.pending(saved)!;
    const wrong = cold.reduce(saved, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [w.ids.player.hand[1]] });
    expect(wrong).toMatchObject({ kind: "bounced", reason: "notYourPrompt" });
    const intent = { kind: "answer" as const, side: "player" as const, promptId: pending.prompt.id, value: [w.ids.player.hand[1]] };
    const finished = applied(cold.reduce(saved, intent));
    expect(finished.committed.sides.player.score).toBe(1);
    expect(cold.reduce(finished, intent)).toMatchObject({ kind: "bounced", reason: "noPendingPrompt" });
    expect(finished.committed.instances[w.target].zone).toBe("void");
  });

  it("rejects a target that left play in response without attributing the stale attempted dissolve", () => {
    const bounce = spell(8, p.returnToHand(target(anyCharacter())), "interrupt");
    const w = world(p.dissolve(target(anyCharacter())), undefined, "player", [bounce]);
    let state = play(w).state;
    state = step(w.engine, state, { kind: "play", card: w.ids.enemy.hand[0], from: "hand" }, [[w.target]]).state;
    state = step(w.engine, state, { kind: "resolveTop" }).state;
    const killed = step(w.engine, state, { kind: "resolveTop" });
    expect(killed.state.triggerQueue).toEqual([]);
    expect(killed.events).toContainEqual(expect.objectContaining({ kind: "noLegalTarget" }));
  });
});

describe("whenDissolvesEnemyInChallenge", () => {
  it.each(SIDES)("captures victim 5● and deck-modified actor 3● separately across tie/Vengeful cessation and reload for %s", side => {
    for (const vengeful of [false, true]) {
      const result = lane(side, { createdActor: true, createdVictim: true, vengeful, weaker: vengeful });
      const queued = result.queued!;
      expect(queued.instances[result.mover]).toBeUndefined();
      expect(queued.triggerQueue.map(t => t.lastKnownSubjectCost)).toEqual([5, 3, undefined]);
      const reload = deserializeState(serializeState(queued));
      const normal = drain(result.engine, queued); const replay = drain(result.engine, reload);
      expect(replay.events).toEqual(normal.events); expect(stateHash(replay.state)).toBe(stateHash(normal.state));
      for (const viewer of SIDES) {
        const seen = result.engine.view(reload, viewer);
        expect(seen.triggerQueue.map(t => t.subject)).toEqual([null, null, null]);
        expect(seen.triggerQueue.map(t => t.lastKnownSubjectCost)).toEqual([5, 3, undefined]);
        const lists = { player: [actor.id, victim.id].map(cardId => ({ cardId })), enemy: [actor.id, victim.id].map(cardId => ({ cardId })) };
        const sample = result.engine.determinize(seen, lists, () => 0.4);
        expect(comparableView(result.engine.view(sample, viewer))).toEqual(comparableView(seen));
        expect(drain(result.engine, sample).state.sides[side].score).toBe(normal.state.sides[side].score);
      }
    }
  });

  it("attributes a winning blocker's dissolve to the defending controller and its physical actor", () => {
    const result = lane("player", { blockerWin: true });
    expect(result.queued!.triggerQueue.map(t => t.lastKnownSubjectCost)).toEqual([3, 5, undefined]);
    expect(result.queued!.triggerQueue[1].subject).toBe(result.targetId);
    expect(result.state.instances[result.targetId!].status.gainedSpark).toBe(2);
    expect(result.state.sides.enemy.score).toBe(8);
  });

  it("gives a surviving remover spark but rejects scoring-only lanes and challenge Reclaim banishment", () => {
    const win = lane("player", { weaker: true });
    expect(win.state.instances[win.mover].status.gainedSpark).toBe(2);
    expect(win.events.some(e => e.kind === "triggerQueued" && e.subject === win.mover)).toBe(true);
    const unpaired = lane("player", { blocked: false });
    expect(unpaired.events.some(e => e.kind === "triggerQueued")).toBe(false);
    const replaced = lane("player", { weaker: true, reclaimed: true });
    expect(replaced.queued!.triggerQueue).toHaveLength(1);
    expect(replaced.state.instances[replaced.mover].status.gainedSpark).toBe(0);
  });

  it("keeps supplementary point composition independent of character scoring and removal", () => {
    const signs = [watcher(1, whenScores(characterYouControl()), p.gainPoints(1)),
      watcher(2, whenScores(characterYouControl()), p.gainPoints(1)), watcher(3, whenRemovesEnemy())];
    const engine = createEngine(testCatalog([], { dreamsigns: signs }));
    const board = boardState(engine.catalog, { active: "player", phase: "day", scoreToWin: 100,
      player: { front: [v.vanilla3.id, v.vanilla0.id], dreamsigns: signs.map(s => s.id), deck }, enemy: { deck } });
    const result = passUntil(engine, board.state, at(engine, "enemy", "day"));
    expect(result.state.sides.player.score).toBe(5);
    expect(result.events.filter(e => e.kind === "triggerQueued").map(e => e.kind === "triggerQueued" ? e.scored : null)).toEqual([3, 3]);
    expect(result.events.filter(e => e.kind === "pointsScored" && e.cause === "effect")).toHaveLength(2);
  });
});
