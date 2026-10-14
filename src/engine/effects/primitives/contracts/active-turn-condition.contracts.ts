/** Active-turn predicates share public turn state across resolving and static contexts. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { characteristicsOf } from "../../../continuous/characteristics";
import { energy, event, self, staticAbility, turnOf } from "../../../dsl/builders";
import { triggered, whenYouPlay } from "../../../dsl/triggers";
import type { PlayerRef } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { oncePerTurnKey } from "../../../rules/activation";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, parseFigmentId, SIDES, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { conditionHolds } from "../../interpreter";
import type { Effect } from "../../registry";
import { chooseOne } from "../choose-one";
import { eachPlayer } from "../each-player";
import { gainPoints } from "../gain-points";
import { ifThen } from "../if-then";
import { materializeFigments } from "../materialize-figments";
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
const missing = parseFigmentId("5e5e5e5e-0000-4000-8000-000000062699");
const faults = REFS.map((ref, i) => spell(0x50 + i, sequence(branch(ref), materializeFigments(missing))));
const extra = spell(0x60, takeExtraTurn());
const engine = createEngine(testCatalog([...reads, ...statics, ...watchers, ...modal, ...rebound, ...faults, extra]));
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

  it.each(SIDES)("%s rolls back a genuine error after the correct conditional branch and reloads its committed boundary", side => {
    for (const [i, ref] of REFS.entries()) {
      const b = scene(side, side, faults[i]);
      const started = cast(b, side);
      const before = serializeState(started.state);
      const observed: EngineEvent[] = [];
      const error = `Unknown figment ${missing}`;
      expect(() => runStep(started.state, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog, { observeEvent: e => observed.push(e) })).toThrow(error);
      expect(observed.filter(e => e.kind === "pointsScored")).toEqual([expect.objectContaining({ side, amount: expected(side, side, ref) ? 1 : 2 })]);
      expect(observed.filter(e => e.kind === "resolved" || e.kind === "pointsScored").map(e => e.kind)).toEqual(["resolved", "pointsScored"]);
      expect(serializeState(started.state)).toBe(before);
      const resolve = (state: BattleState) => createFoldAdapter(engine, { checkEventPrefix: true }).reduce(slice(state),
        { kind: "battleAction", side: opponent(side), action: { kind: "pass" } });
      const direct = resolve(started.state);
      const loaded = resolve(deserializeState(before));
      if (direct.kind !== "applied" || loaded.kind !== "applied") throw new Error("fault resolution bounced");
      expect(direct.error?.message).toBe(error);
      expect(loaded.error).toEqual(direct.error);
      expect(stateHash(direct.slice.committed)).toBe(stateHash(started.state));
      expect(stateHash(loaded.slice.committed)).toBe(stateHash(direct.slice.committed));
      expect(direct.slice.inFlight).toBeNull();
      expect(direct.slice.committed.stack).toHaveLength(1);
      expect(direct.published.filter(e => e.kind === "pointsScored" || e.kind === "resolved")).toEqual([]);
      expect(loaded.published).toEqual(direct.published);
    }
  });
});
