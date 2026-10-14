/** Active-turn predicates share public turn state across resolving and static contexts. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { characteristicsOf } from "../../../continuous/characteristics";
import { all, enemyCharacter, energy, event, self, staticAbility, turnOf } from "../../../dsl/builders";
import { onMaterialized, triggered, whenMaterialize, whenYouPlay } from "../../../dsl/triggers";
import type { PlayerRef } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { oncePerTurnKey } from "../../../rules/activation";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil, type Observed } from "../../../testing/trigger-harness";
import { conditionHolds } from "../../interpreter";
import type { Effect } from "../../registry";
import { banishUntil } from "../banish-until";
import { chooseOne } from "../choose-one";
import { eachPlayer } from "../each-player";
import { gainControl } from "../gain-control";
import { gainPoints } from "../gain-points";
import { ifThen } from "../if-then";
import { sequence } from "../sequence";
import { sparkModifier } from "../spark-modifier";
import { takeExtraTurn } from "../take-extra-turn";
import { decklists } from "./with-materialized-support";

const REFS = ["you", "opponent"] as const;
const spell = (index: number, effect: Effect): EngineCardDefinition => ({
  ...v.interruptEvent, id: syntheticId(0x62600 + index), costs: [energy(0)], status: "authored", abilities: () => [event(effect)],
});
const branch = (ref: PlayerRef) => ifThen(turnOf(ref), gainPoints(1), gainPoints(2));
const reads = REFS.map((ref, i) => spell(i, branch(ref)));
const statics = REFS.map((ref, i): EngineCardDefinition => ({ ...v.vanilla1, id: syntheticId(0x62610 + i), status: "authored",
  abilities: () => [staticAbility(sparkModifier(self(), 2), { while: turnOf(ref) })],
}));
const watchers = REFS.map((ref, i): EngineCardDefinition => ({ ...v.vanilla1, id: syntheticId(0x62620 + i), status: "authored",
  abilities: () => [triggered(whenYouPlay(), gainPoints(1), { condition: turnOf(ref), oncePerTurn: true })],
}));
const modal = REFS.map((ref, i) => spell(0x30 + i, chooseOne(branch(ref), gainPoints(3))));
const rebound = REFS.map((ref, i) => spell(0x40 + i, eachPlayer(branch(ref))));
const extra = spell(0x60, takeExtraTurn());
const returning: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x62670), costs: [energy(0)], status: "authored",
  abilities: () => [triggered(onMaterialized(), sequence(gainPoints(1), banishUntil(self(), "untilEndOfTurn")), { condition: turnOf("you") })],
};
const returnWatcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x62671), status: "authored",
  abilities: () => [triggered(whenMaterialize({ controller: "opponent" }), gainPoints(1), { condition: turnOf("opponent") })],
};
const transfer = spell(0x72, gainControl(all(enemyCharacter())));
const engine = createEngine(testCatalog([...reads, ...statics, ...watchers, ...modal, ...rebound, extra, returning, returnWatcher, transfer]));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla1.id, v.vanilla2.id];
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const applied = (out: IntentOutcome) => {
  if (out.kind !== "applied" || out.error !== null) throw new Error("unexpected active-turn fold outcome");
  return out;
};
const expected = (controller: Side, active: Side, ref: PlayerRef) => (ref === "you" ? controller : opponent(controller)) === active;
function scene(side: Side, active: Side, source = reads[0], watch = false, extraHand: readonly EngineCardDefinition[] = []) {
  return boardState(engine.catalog, { active, phase: "day", [side]: { hand: [source.id, ...extraHand.map(c => c.id)], back: [...statics, ...(watch ? watchers : [])].map(c => c.id), deck, energy: 10 },
    [opponent(side)]: { hand: [v.interruptEvent.id, v.event0.id], deck, energy: 10 } });
}
function cast(b: ReturnType<typeof scene>, side: Side) {
  const active = b.state.turn.active;
  const ready = active === side ? b.state : engine.apply(b.state, active, { kind: "play", card: b.ids[active].hand[1], from: "hand" }, NO_PROMPTS).state;
  return engine.apply(ready, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
}
const finish = (state: BattleState) => passUntil(engine, state, s => s.stack.length === 0);
function playResolved(state: BattleState, side: Side, card: InstanceId) {
  const steps: Observed[] = [];
  const played = engine.apply(state, side, { kind: "play", card, from: "hand" }, NO_PROMPTS,
    (next, step, events) => steps.push({ state: next, step, events }));
  const done = finish(played.state);
  return { state: done.state, events: [...played.events, ...done.events], steps: [...steps, ...done.steps] };
}
function checkStatic(state: BattleState, b: ReturnType<typeof scene>, side: Side) {
  for (const [i, ref] of REFS.entries()) {
    const holds = expected(side, state.turn.active, ref);
    expect(conditionHolds(state, engine.catalog, turnOf(ref), { controller: side, source: b.ids[side].back[i]!, optionalPaid: [] })).toBe(holds);
    expect(characteristicsOf(state, engine.catalog, b.ids[side].back[i]!).spark).toBe(holds ? 3 : 1);
  }
}


describe("active-turn condition", () => {
  it.each(SIDES)("%s resolves relative players and agrees with pure static inspection on either active side", side => {
    for (const active of SIDES) for (const [i, ref] of REFS.entries()) {
      const b = scene(side, active, reads[i]);
      const before = serializeState(b.state);
      for (const viewer of SIDES) {
        checkStatic(b.state, b, side);
        engine.legalActions(b.state, viewer);
        engine.view(b.state, viewer);
      }
      expect(serializeState(b.state)).toBe(before);
      expect(b.events).toEqual([]);
      const started = cast(b, side);
      const out = finish(started.state);
      expect(out.state.turn.active).toBe(active);
      expect(out.state.sides[side].score).toBe(expected(side, active, ref) ? 1 : 2);
      checkStatic(out.state, b, side);
      expect(invariantViolations(out.state, engine.catalog)).toEqual([]);
    }
  });

  it.each(SIDES)("%s reads an actual extra turn and the resumed normal turn", side => {
    const active = opponent(side);
    const b = scene(side, active, extra, false, reads);
    const granted = cast(b, side);
    const entered = passUntil(engine, granted.state, s => s.turn.extra && at(engine, side, "day")(s));
    expect(entered.events).toContainEqual(expect.objectContaining({ kind: "turnStarted", side, extra: true }));
    expect(entered.state.turn.lastNormal).toBe(active);
    checkStatic(entered.state, b, side);
    for (const ref of REFS) {
      expect(conditionHolds(deserializeState(serializeState(entered.state)), engine.catalog, turnOf(ref),
        { controller: side, source: b.ids[side].hand[0], optionalPaid: [] })).toBe(ref === "you");
    }
    let current = entered.state;
    for (const [i, ref] of REFS.entries()) {
      const played = engine.apply(current, side, { kind: "play", card: b.ids[side].hand[i + 1], from: "hand" }, NO_PROMPTS);
      current = finish(played.state).state;
      expect(current.sides[side].score).toBe(ref === "you" ? 1 : 3);
    }
    const normal = passUntil(engine, current, s => !s.turn.extra && at(engine, side, "day")(s));
    checkStatic(normal.state, b, side);
    const resumed = passUntil(engine, normal.state, at(engine, active, "day"));
    expect(resumed.state.turn.extra).toBe(false);
    checkStatic(resumed.state, b, side);
  });

  it.each(SIDES)("%s gates matching and normal resolution without spending a false condition's use", side => {
    for (const active of SIDES) {
      const b = scene(side, active, v.interruptEvent, true);
      const casted = cast(b, side);
      const done = finish(casted.state);
      const events = [...casted.events, ...done.events];
      for (const [i, ref] of REFS.entries()) {
        const source = b.ids[side].back[i + statics.length]!;
        const yes = expected(side, active, ref);
        expect(events.filter(e => e.kind === "triggerQueued" && e.source === source)).toHaveLength(yes ? 1 : 0);
        expect(events.filter(e => e.kind === "triggerResolved" && e.source === source)).toEqual(yes
          ? [expect.objectContaining({ controller: side, applied: true })] : []);
        expect(done.state.oncePerTurn.includes(oncePerTurnKey(source, 0))).toBe(yes);
      }
      expect(done.state.sides[side].score).toBe(1);
    }
  });

  it.each(SIDES)("%s preserves cancellation, refusal, concurrent actors, reload and replay", side => {
    for (const [i, ref] of REFS.entries()) {
      const b = scene(side, side, modal[i]);
      const fold = createFoldAdapter(engine, { checkEventPrefix: true });
      const intent = { kind: "battleAction" as const, side, action: { kind: "play" as const, card: b.ids[side].hand[0], from: "hand" as const } };
      const opened = applied(fold.reduce(slice(b.state), intent));
      const pending = fold.pending(opened.slice);
      if (pending === null) throw new Error("missing modal prompt");
      const before = serializeState(opened.slice.committed);
      checkStatic(pending.display, b, side);
      engine.legalActions(pending.display, side);
      for (const viewer of SIDES) engine.view(pending.display, viewer);
      const answer = { kind: "answer" as const, side, promptId: pending.prompt.id, value: 0 };
      expect(fold.reduce(opened.slice, { ...answer, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      expect(fold.reduce(opened.slice, { ...answer, value: 999 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(fold.reduce(opened.slice, { kind: "battleAction", side: opponent(side), action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
      expect(serializeState(opened.slice.committed)).toBe(before);
      const direct = applied(fold.reduce(opened.slice, answer));
      const reloaded = applied(createFoldAdapter(engine, { checkEventPrefix: true }).reduce(copy(opened.slice), answer));
      expect(stateHash(reloaded.slice.committed)).toBe(stateHash(direct.slice.committed));
      expect(reloaded.published).toEqual(direct.published);
      const resolved = finish(direct.slice.committed);
      expect(resolved.state.sides[side].score).toBe(expected(side, side, ref) ? 1 : 2);
      const cancelled = applied(fold.reduce(opened.slice, { kind: "cancel", side, promptId: pending.prompt.id }));
      expect(stateHash(cancelled.slice.committed)).toBe(stateHash(b.state));
      const restarted = applied(fold.reduce(cancelled.slice, intent));
      expect(fold.reduce(restarted.slice, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
      const next = fold.pending(restarted.slice);
      if (next === null) throw new Error("missing restarted prompt");
      const resumed = applied(fold.reduce(restarted.slice, { ...answer, promptId: next.prompt.id }));
      expect(stateHash(finish(resumed.slice.committed).state)).toBe(stateHash(resolved.state));
    }
  });

  it.each(SIDES)("%s uses the calling controller when eachPlayer retains the original physical source", side => {
    for (const [i, ref] of REFS.entries()) {
      const b = scene(side, side, rebound[i]);
      const out = finish(cast(b, side).state);
      const fold = createFoldAdapter(engine, { checkEventPrefix: true });
      const played = applied(fold.reduce(slice(b.state), { kind: "battleAction", side,
        action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } }));
      const pass = { kind: "battleAction" as const, side: opponent(side), action: { kind: "pass" as const } };
      const direct = applied(fold.reduce(played.slice, pass));
      const loaded = applied(createFoldAdapter(engine, { checkEventPrefix: true }).reduce(copy(played.slice), pass));
      expect(stateHash(direct.slice.committed)).toBe(stateHash(out.state));
      expect(stateHash(loaded.slice.committed)).toBe(stateHash(out.state));
      expect(loaded.published).toEqual(direct.published);
      for (const controller of SIDES) expect(out.state.sides[controller].score).toBe(expected(controller, side, ref) ? 1 : 2);
    }
  });

  it.each(SIDES)("%s keeps public turn results independent of hidden printings and sampled worlds", side => {
    const other = opponent(side);
    const boards = [deck, [...deck].reverse()].map(hidden => boardState(engine.catalog, { active: side, phase: "day",
      [side]: { hand: [reads[0].id], back: statics.map(c => c.id), deck, energy: 10 },
      [other]: { hand: [hidden[0]], deck: hidden.slice(1), energy: 10 } }));
    const views = boards.map(b => engine.view(b.state, side));
    expect(views[0]).toEqual(views[1]);
    expect(engine.legalActions(boards[0].state, side)).toEqual(engine.legalActions(boards[1].state, side));
    for (const b of boards) {
      const before = serializeState(b.state);
      for (const id of [...b.ids[other].hand, ...b.ids[other].deck]) expect(JSON.stringify(engine.view(b.state, side))).not.toContain(`"${id}"`);
      for (const random of [0, 0.999]) {
        const sampled = engine.determinize(copy(engine.view(b.state, side)), decklists(b.state), () => random);
        checkStatic(sampled, b, side);
        expect(engine.view(sampled, side)).toEqual(engine.view(b.state, side));
        const out = engine.apply(sampled, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
        expect(finish(out.state).state.sides[side].score).toBe(1);
      }
      expect(serializeState(b.state)).toBe(before);
    }
  });

  it.each(SIDES)("%s rechecks cleanup-born materialization triggers across the Ending turn boundary", side => {
    const other = opponent(side);
    for (const extraTurn of [false, true]) {
      const b = boardState(engine.catalog, { active: side, phase: "day",
        [side]: { hand: [returning.id, extra.id], deck, energy: 10 },
        [other]: { back: [returnWatcher.id], deck, energy: 10 } });
      const source = b.ids[side].hand[0];
      const watcher = b.ids[other].back[0]!;
      const sources = [source, watcher];
      let current = b.state;
      if (extraTurn) current = playResolved(current, side, b.ids[side].hand[1]).state;
      const played = playResolved(current, side, source);
      expect(played.state.instances[source].zone).toBe("banished");
      for (const controller of SIDES) expect(played.state.sides[controller].score).toBe(1);
      expect(played.events.filter(e => e.kind === "triggerResolved")).toHaveLength(2);
      for (const id of sources) expect(played.events).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source: id, applied: true }));
      const next = passUntil(engine, played.state, s => s.turn.turnNumber > current.turn.turnNumber &&
        at(engine, extraTurn ? side : other, "day")(s));
      const boundaryIndex = next.steps.findIndex(s => s.events.some(e => e.kind === "turnStarted"));
      expect(boundaryIndex).toBeGreaterThan(0);
      const boundary = next.steps[boundaryIndex];
      // Cleanup's returned character creates a fresh duration after that expiry pass.
      const cleanup = next.steps.slice(0, boundaryIndex).find(s => s.events.some(e => e.kind === "materialized" && e.instance === source));
      expect(cleanup?.state.turn.active).toBe(side);
      expect(cleanup?.state.triggerQueue.map(t => t.source)).toEqual(sources);
      const beforeBoundary = next.steps[boundaryIndex - 1].state;
      expect(beforeBoundary.turn.active).toBe(side);
      expect(beforeBoundary.instances[source].zone).toBe("banished");
      expect(beforeBoundary.floating).toContainEqual(expect.objectContaining({ change: { kind: "banishedUntil", instance: source, side } }));
      for (const controller of SIDES) expect(beforeBoundary.sides[controller].score).toBe(2);
      expect(boundary.step.kind).toBe("advancePhase");
      const started = boundary.events.findIndex(e => e.kind === "turnStarted");
      expect(boundary.events.slice(0, started)).toContainEqual(expect.objectContaining({ kind: "materialized", instance: source, side }));
      for (const [i, id] of sources.entries()) {
        const controller = i === 0 ? side : other;
        expect(boundary.events.slice(0, started)).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: id, controller }));
        expect(conditionHolds(beforeBoundary, engine.catalog, turnOf(REFS[i]), { controller, source: id, optionalPaid: [] })).toBe(true);
      }
      expect(boundary.state.triggerQueue.map(t => [t.source, t.controller])).toEqual([[source, side], [watcher, other]]);
      expect(boundary.events[started]).toMatchObject({ kind: "turnStarted", side: extraTurn ? side : other, extra: extraTurn });
      expect(boundary.state.turn.active).toBe(extraTurn ? side : other);
      const resolutions = next.steps.slice(boundaryIndex + 1).filter(s => s.step.kind === "resolveTrigger");
      expect(resolutions).toHaveLength(2);
      for (const [i, resolved] of resolutions.entries()) {
        expect(resolved.events).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source: sources[i], applied: extraTurn }));
        expect(resolved.events.filter(e => e.kind === "pointsScored")).toHaveLength(extraTurn ? 1 : 0);
        if (!extraTurn) expect(resolved.events.filter(e => e.kind === "banished" || e.kind === "effectStarted")).toEqual([]);
      }
      for (const controller of SIDES) expect(next.state.sides[controller].score).toBe(extraTurn ? 3 : 2);
      expect(next.state.instances[source].zone).toBe(extraTurn ? "banished" : "play");
      expect(next.state.floating.some(e => e.change.kind === "banishedUntil" && e.change.instance === source)).toBe(extraTurn);
      expect(invariantViolations(next.state, engine.catalog)).toEqual([]);
    }
  });

  it.each(SIDES)("%s binds transferred static and queued conditions to the current controller", side => {
    const owner = opponent(side);
    const b = boardState(engine.catalog, { active: side, phase: "day",
      [side]: { hand: [transfer.id, ...Array.from({ length: 4 }, () => v.interruptEvent.id)], deck, energy: 10 },
      [owner]: { back: [...statics, ...watchers].map(c => c.id), hand: [v.event0.id, v.event0.id], deck, energy: 10 } });
    const stolen = b.ids[owner].back.map(id => id!);
    const taken = playResolved(b.state, side, b.ids[side].hand[0]);
    expect(taken.events.filter(e => e.kind === "controlChanged")).toHaveLength(4);
    for (const instance of stolen) expect(taken.events).toContainEqual(expect.objectContaining({ kind: "controlChanged", instance, from: owner, to: side }));
    const inspect = (state: BattleState) => {
      for (const id of stolen) expect(state.instances[id]).toMatchObject({ owner, controller: side, zone: "play" });
      for (const [i, ref] of REFS.entries()) {
        expect(characteristicsOf(state, engine.catalog, stolen[i]).spark).toBe(expected(side, state.turn.active, ref) ? 3 : 1);
      }
    };
    let current = taken.state;
    for (const active of [side, owner]) {
      if (active === owner) current = passUntil(engine, current, at(engine, owner, "day")).state;
      inspect(current);
      const events = [] as ReturnType<typeof playResolved>["events"];
      const steps: Observed[] = [];
      for (let repeat = 0; repeat < 2; repeat++) {
        if (active === owner) {
          const opened = engine.apply(current, owner, { kind: "play", card: b.ids[owner].hand[repeat], from: "hand" }, NO_PROMPTS);
          current = opened.state;
          events.push(...opened.events);
        }
        const played = playResolved(current, side, b.ids[side].hand[1 + (active === side ? 0 : 2) + repeat]);
        current = played.state;
        events.push(...played.events);
        steps.push(...played.steps);
      }
      for (const [i, ref] of REFS.entries()) {
        const source = stolen[statics.length + i];
        const yes = expected(side, active, ref);
        expect(events.filter(e => e.kind === "triggerQueued" && e.source === source)).toHaveLength(yes ? 1 : 0);
        expect(events.filter(e => e.kind === "triggerResolved" && e.source === source)).toEqual(yes
          ? [expect.objectContaining({ controller: side, applied: true })] : []);
        expect(steps.flatMap(s => s.state.triggerQueue).filter(t => t.source === source)).toEqual(yes
          ? [expect.objectContaining({ controller: side, origin: { kind: "card", cardId: watchers[i].id, variant: { amplified: false } } })] : []);
        expect(current.oncePerTurn.includes(oncePerTurnKey(source, 0))).toBe(yes);
      }
      expect(current.sides[side].score).toBe(active === side ? 1 : 2);
      expect(current.sides[owner].score).toBe(0);
      inspect(current);
    }
    expect(invariantViolations(current, engine.catalog)).toEqual([]);
  });
});
