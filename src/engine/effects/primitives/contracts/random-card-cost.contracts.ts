/** Random held-card setters compose with existing resolution, privacy and recovery. */
import { describe, expect, it } from "vitest";
import { parseDreamsignId } from "../../../../types/identifiers";
import type { EngineCardDefinition, EngineFigmentDefinition } from "../../../catalog";
import { adjustedEnergy, costModifier } from "../../../continuous/costs";
import { activated, additionalCost, energy, randomIn } from "../../../dsl/builders";
import { onDawn, triggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, parseFigmentId, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { StepResult } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { resolveEffect } from "../../interpreter";
import type { ResolvingEffect } from "../../registry";
import * as p from "../index";

const STREAM = "random:selection";
const signId = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000061301");
const figment: EngineFigmentDefinition = { id: parseFigmentId("5e5e5e5e-0000-4000-8000-000000061302"),
  subtype: "Warrior", spark: 1, status: "vanilla", abilities: () => [] };
const setter = (amount = 1) => p.changeCardCost(randomIn("hand", 1), { set: amount }, { duration: "untilEndOfTurn" });
const priced: EngineCardDefinition = { ...v.event0, id: syntheticId(0x61303), costs: [energy(5)],
  abilities: () => [additionalCost(energy(2))] };
const source = (effect: ResolvingEffect): EngineCardDefinition => ({ ...v.vanilla0, id: syntheticId(0x61304),
  status: "authored", abilities: () => [activated([], effect)] });
function world(side: Side, effect: ResolvingEffect = setter(), options: {
  hand?: readonly EngineCardDefinition["id"][]; copies?: number; activated?: boolean; validFigment?: boolean;
} = {}) {
  const card = source(effect);
  const sign = { id: signId, status: "authored" as const, abilities: () => [triggered(onDawn(), effect)] };
  const engine = createEngine(testCatalog([card, priced], { dreamsigns: [sign] }, options.validFigment ? [figment] : []));
  return { engine, ...boardState(engine.catalog, { active: side, phase: options.activated ? "day" : "draw",
    [side]: { hand: options.hand ?? [v.vanilla3.id, v.vanilla5.id, v.vanilla5.id],
      back: options.activated ? [card.id] : [], dreamsigns: options.activated ? [] : Array.from({ length: options.copies ?? 1 }, () => signId),
      deck: [v.vanilla5.id, v.vanilla5.id], energy: 20 },
    [opponent(side)]: { hand: [v.vanilla5.id], deck: [v.vanilla5.id, v.vanilla5.id] } }) };
}
function done(result: StepResult) {
  if (result.kind !== "done") throw new Error("Unexpected prompt");
  return result;
}
const changes = (events: readonly EngineEvent[]) => events.filter((e): e is Extract<EngineEvent, { kind: "effectStarted" }> =>
  e.kind === "effectStarted" && e.change.kind === "cardCost");
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome) {
  if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify(result));
  return result;
}
function dawn(w: ReturnType<typeof world>) {
  return done(runStep(w.state, { kind: "advancePhase" }, NO_PROMPTS, w.engine.catalog));
}
function settle(w: ReturnType<typeof world>, start: BattleState) {
  let state = start;
  const events: EngineEvent[] = [];
  while (state.triggerQueue.length > 0) {
    const next = done(runStep(state, { kind: "resolveTrigger" }, NO_PROMPTS, w.engine.catalog));
    state = next.state;
    events.push(...next.events);
  }
  return { state, events };
}
function price(w: ReturnType<typeof world>, state: BattleState, id: InstanceId, side: Side) {
  return w.engine.view(state, side).instances[id]?.characteristics.cost;
}
const activate = (w: ReturnType<typeof world>, side: Side) => ({ kind: "activate" as const, source: w.ids[side].back[0]!, ability: 0 });

for (const side of SIDES) describe(`${side} randomCardCost`, () => {
  it("sets one current Dawn card without moving or disclosing it, replays and expires", () => {
    const w = world(side), before = stateHash(w.state), queued = dawn(w);
    expect(queued.state.triggerQueue).toHaveLength(1);
    expect(queued.state.rng).toEqual(w.state.rng);
    const result = settle(w, queued.state), started = changes(result.events);
    expect(started).toHaveLength(1);
    const selected = started[0];
    if (selected.kind !== "effectStarted" || selected.change.kind !== "cardCost") throw new Error("Missing setter");
    const id = selected.change.instance;
    expect(w.ids[side].hand).toContain(id);
    expect(selected).toMatchObject({ expiry: { at: "endOfTurn" }, change: { mode: "set", amount: 1 } });
    for (const candidate of w.ids[side].hand) {
      expect(result.state.instances[candidate]).toEqual(w.state.instances[candidate]);
      expect(price(w, result.state, candidate, side)).toBe(candidate === id ? 1 : price(w, w.state, candidate, side));
    }
    for (const owner of SIDES) {
      expect(result.state.sides[owner].hand).toEqual(w.state.sides[owner].hand);
      expect(result.state.sides[owner].deck).toEqual(w.state.sides[owner].deck);
      expect(result.state.sides[owner].void).toEqual(w.state.sides[owner].void);
    }
    expect(result.state.knownTo).toEqual(w.state.knownTo);
    expect(result.events.some(e => ["cardDrawn", "revealed", "returnedToHand", "cardTaken", "noLegalTarget"].includes(e.kind))).toBe(false);
    expect(eventSeenBy(selected, opponent(side), result.state)).toBeNull();
    expect(w.engine.view(result.state, opponent(side)).instances[id]).toBeUndefined();
    expect(w.engine.view(result.state, opponent(side)).floating).toEqual([]);
    expect(w.engine.view(result.state, side).floating).toHaveLength(1);
    const replay = settle(w, deserializeState(serializeState(queued.state)));
    expect(stateHash(replay.state)).toBe(stateHash(result.state));
    expect(replay.events).toEqual(result.events);
    const saved = deserializeState(serializeState(result.state));
    for (const viewer of SIDES) expect(w.engine.view(saved, viewer)).toEqual(w.engine.view(result.state, viewer));
    const day = done(runStep(saved, { kind: "advancePhase" }, NO_PROMPTS, w.engine.catalog)).state;
    const ended = passUntil(w.engine, day, at(w.engine, opponent(side), "day"));
    expect(ended.events).toContainEqual({ kind: "effectEnded", effect: selected.effect });
    expect(price(w, ended.state, id, side)).toBe(price(w, w.state, id, side));
    expect(ended.state.rng[STREAM]).toBe(1);
    expect(stateHash(w.state)).toBe(before);
    expect(invariantViolations(result.state, w.engine.catalog)).toEqual([]);
    expect(eventRedactionViolations(result.events, queued.state, result.state)).toEqual([]);
  });

  it("resolves duplicate Dawn sources independently and preserves scripted setter chronology", () => {
    const w = world(side, setter(), { copies: 2 }), queued = dawn(w);
    expect(queued.state.triggerQueue).toHaveLength(2);
    const result = settle(w, queued.state);
    expect(changes(result.events)).toHaveLength(2);
    expect(result.state.rng[STREAM]).toBe(2);
    expect(new Set(result.state.floating.map(e => e.id)).size).toBe(2);
    expect(result.state.floating[0].timestamp).toBeLessThanOrEqual(result.state.floating[1].timestamp);
    for (const change of result.state.floating) {
      expect(change.change.kind).toBe("cardCost");
      if (change.change.kind === "cardCost") expect(w.ids[side].hand).toContain(change.change.instance);
    }
    const streams: string[] = [];
    const scripted: EngineCardDefinition = { ...v.event0, id: syntheticId(0x61305), synthetic: { resolve(ctx, item) {
      const original = ctx.random.bind(ctx), draws = [0, .99, 0];
      ctx.random = stream => { streams.push(stream); original(stream); return draws.shift()!; };
      try { resolveEffect(ctx, p.sequence(setter(5), setter(5), setter()), { source: item.instance,
        origin: instanceOrigin(ctx.state.instances[item.instance]), ability: 0, controller: item.controller,
        x: null, optionalPaid: [], choices: { modes: [], targets: [] } }); }
      finally { ctx.random = original; }
    } } };
    const engine = createEngine(testCatalog([scripted]));
    const f = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [scripted.id, v.vanilla3.id, v.vanilla5.id] } });
    const played = done(runStep(f.state, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS, engine.catalog));
    const resolved = done(runStep(played.state, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog));
    expect(streams).toEqual([STREAM, STREAM, STREAM]);
    expect(changes(resolved.events).map(e => e.change)).toEqual([
      { kind: "cardCost", instance: f.ids[side].hand[1], mode: "set", amount: 5 },
      { kind: "cardCost", instance: f.ids[side].hand[2], mode: "set", amount: 5 },
      { kind: "cardCost", instance: f.ids[side].hand[1], mode: "set", amount: 1 },
    ]);
    expect(resolved.state.rng[STREAM]).toBe(3);
    expect(engine.view(resolved.state, side).instances[f.ids[side].hand[1]].characteristics.cost).toBe(1);
    const stamps = resolved.state.floating.map(e => e.timestamp);
    expect(stamps[0]).toBeLessThanOrEqual(stamps[1]);
    expect(stamps[1]).toBeLessThanOrEqual(stamps[2]);
  });

  it("sets printed five to one before taxes, reductions and an additional payment", () => {
    const w = world(side, p.sequence(setter(), p.costModifier("you", {}, 3), p.costModifier("you", {}, -1)), { hand: [priced.id] });
    const result = settle(w, dawn(w).state), id = w.ids[side].hand[0];
    expect(adjustedEnergy(5, costModifier(result.state, w.engine.catalog, id, side))).toBe(3);
    expect(price(w, result.state, id, side)).toBe(5);
    const ready = done(runStep(result.state, { kind: "advancePhase" }, NO_PROMPTS, w.engine.catalog)).state;
    const played = w.engine.apply(ready, side, { kind: "play", card: id, from: "hand" }, NO_PROMPTS);
    expect(played.state.sides[side].currentEnergy).toBe(ready.sides[side].currentEnergy - 5);
    expect(played.events.filter((e): e is Extract<EngineEvent, { kind: "energyChanged" }> =>
      e.kind === "energyChanged" && e.cause === "payment").reduce((n, e) => n + e.change, 0)).toBe(-5);
  });

  it("does nothing to an empty pool or other RNG streams while continuing the effect", () => {
    for (const populated of [false, true]) {
      const w = world(side, p.sequence(setter(), p.gainPoints(1)), { hand: populated ? [v.vanilla5.id] : [] });
      const result = settle(w, dawn(w).state);
      expect(changes(result.events)).toHaveLength(populated ? 1 : 0);
      expect(result.state.rng).toEqual(populated ? { ...w.state.rng, [STREAM]: 1 } : w.state.rng);
      expect(result.state.sides[side].score).toBe(1);
      expect(result.state.sides[opponent(side)].hand).toEqual(w.state.sides[opponent(side)].hand);
    }
  });

  it("reloads a genuine post-set prompt and rejects stale, foreign and competing answers", () => {
    const w = world(side, p.sequence(setter(), p.optional(p.gainPoints(1))), { activated: true });
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(w.state), { kind: "battleAction", side, action: activate(w, side) }));
    const pending = fold.pending(opened.slice)!;
    expect(pending.prompt.kind).toBe("confirm");
    expect(pending.display.rng[STREAM]).toBe(1);
    expect(pending.display.floating).toHaveLength(1);
    expect(w.engine.view(pending.display, opponent(side)).floating).toEqual([]);
    expect(opened.slice.committed.rng[STREAM] ?? 0).toBe(0);
    expect(opened.slice.committed.floating).toEqual([]);
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const fresh = createFoldAdapter(createEngine(w.engine.catalog), { checkEventPrefix: true });
    expect(fresh.pending(saved)).toEqual(pending);
    const intent = { kind: "answer" as const, side, promptId: pending.prompt.id, value: false };
    const before = stateHash(saved.committed);
    expect(fresh.reduce(saved, { ...intent, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(saved, { ...intent, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, intent)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(pending.prompt.cancellable).toBe(false);
    expect(fresh.reduce(saved, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(saved.committed)).toBe(before);
    const result = applied(fresh.reduce(saved, intent));
    const inline = w.engine.apply(w.state, side, activate(w, side), new ScriptedSource([false]));
    expect(stateHash(result.slice.committed)).toBe(stateHash(inline.state));
    expect(result.slice).toEqual(applied(fold.reduce(opened.slice, intent)).slice);
    expect(changes([...opened.published, ...result.published])).toHaveLength(1);
    expect(result.slice.committed.rng[STREAM]).toBe(1);
    expect(fresh.reduce(result.slice, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("proves a real setter prefix before late failure and rolls it back with a valid success control", () => {
    const effect = p.optional(p.sequence(setter(), p.materializeFigments(figment.id)));
    const w = world(side, effect, { activated: true }), good = world(side, effect, { activated: true, validFigment: true });
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(w.state), { kind: "battleAction", side, action: activate(w, side) })).slice;
    const pending = fold.pending(opened)!;
    expect(pending.prompt.kind).toBe("confirm");
    expect(pending.display.floating).toEqual([]);
    const actualStep = opened.inFlight!.step, before = stateHash(opened.committed);
    const observed: { event: EngineEvent; state: BattleState }[] = [];
    expect(() => runStep(opened.committed, actualStep, new ScriptedSource([true]), w.engine.catalog,
      { observeEvent: (event, snapshot) => { observed.push({ event, state: snapshot() }); } })).toThrow();
    const prefix = observed.find(({ event }) => event.kind === "effectStarted" && event.change.kind === "cardCost");
    expect(prefix).toBeDefined();
    if (prefix?.event.kind !== "effectStarted" || prefix.event.change.kind !== "cardCost") throw new Error("Missing mutation prefix");
    expect(prefix.state.rng[STREAM]).toBe(1);
    expect(price(w, prefix.state, prefix.event.change.instance, side)).toBe(1);
    const success = done(runStep(opened.committed, actualStep, new ScriptedSource([true]), good.engine.catalog));
    expect(changes(success.events)).toHaveLength(1);
    expect(success.events.some(e => e.kind === "materialized")).toBe(true);
    expect(success.state.rng[STREAM]).toBe(1);
    expect(stateHash(success.state)).not.toBe(before);
    const loaded = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const fresh = createFoldAdapter(createEngine(w.engine.catalog), { checkEventPrefix: true });
    expect(fresh.pending(loaded)).toEqual(pending);
    const failed = fresh.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: true });
    if (failed.kind !== "applied") throw new Error("Unexpected bounce");
    expect(failed.error?.kind).toBe("engine_error");
    expect(stateHash(failed.slice.committed)).toBe(before);
    expect(failed.slice.committed.knownTo).toEqual(opened.committed.knownTo);
    expect(failed.slice.inFlight).toBeNull();
    expect(changes(failed.published)).toEqual([]);
    expect(stateHash(opened.committed)).toBe(before);
  });
});
