/** Filtered draw occasions compose with counters, captured cards and transactional replay. */
import { describe, expect, it } from "vitest";
import { parseDreamsignId } from "../../../../types/identifiers";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { adjustedEnergy, costModifier } from "../../../continuous/costs";
import { event } from "../../../dsl/builders";
import { triggered, triggeringCard, whenDraw } from "../../../dsl/triggers";
import { NO_DECK_MODS, type CardFilter, type Trigger } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { at, passUntil } from "../../../testing/trigger-harness";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { resolveEffect } from "../../interpreter";
import type { Effect } from "../../registry";
import { draw } from "../draw";
import { gainPoints } from "../gain-points";
import { changeCardCost } from "../modify-card-cost";
import { optional } from "../optional";
import { sequence } from "../sequence";

const signId = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000023501");
const reduction = () => changeCardCost(triggeringCard(), { reduce: 1 }, { duration: "untilEndOfTurn" });
function sign(trigger = whenDraw("you", undefined, { cardType: "character" }), oncePerTurn = true): EngineDreamsignDefinition {
  return { id: signId, status: "authored", abilities: () => [triggered(trigger, reduction(), { oncePerTurn })] };
}
function source(effect: Effect = draw(3)): EngineCardDefinition {
  return { ...v.event0, id: syntheticId(0x235002), status: "authored", abilities: () => [event(effect)] };
}
function world(side: Side, options: { trigger?: Trigger; once?: boolean; effect?: Effect; setup?: SideSetup; other?: SideSetup; card?: EngineCardDefinition } = {}) {
  const card = options.card ?? source(options.effect), emblem = sign(options.trigger, options.once);
  const engine = createEngine(testCatalog([card], { dreamsigns: [emblem] }));
  return { engine, card, ...boardState(engine.catalog, { active: side, phase: "day",
    [side]: { dreamsigns: [signId], hand: [card.id], deck: [v.event1.id, v.vanilla3.id, v.vanilla3.id, v.vanilla5.id], energy: 3, ...options.setup },
    [opponent(side)]: { deck: [v.vanilla5.id, v.vanilla5.id], ...options.other } }) };
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(value: IntentOutcome) {
  if (value.kind !== "applied" || value.error !== null) throw new Error(JSON.stringify(value));
  return value;
}
const play = (card: InstanceId) => ({ kind: "play" as const, card, from: "hand" as const });
const changes = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "effectStarted" && e.change.kind === "cardCost");
function cast(w: ReturnType<typeof world>, side: Side) {
  const result = w.engine.apply(w.state, side, play(w.ids[side].hand[0]), NO_PROMPTS);
  expect(invariantViolations(result.state, w.engine.catalog)).toEqual([]);
  return result;
}
function price(w: ReturnType<typeof world>, state: BattleState, id: InstanceId) {
  return adjustedEnergy(3, costModifier(state, w.engine.catalog, id, state.instances[id].controller));
}

describe("drawTriggerFilter", () => {
  it("preserves omitted-filter builder data, including numbered and opponent draws", () => {
    expect(whenDraw()).toEqual({ on: "draw", player: "you" });
    expect(whenDraw("opponent", 2)).toEqual({ on: "draw", player: "opponent", nth: 2 });
  });

  for (const side of SIDES) {
    it(side + " spends its allowance only on the first matching physical draw in a batch", () => {
      const w = world(side), result = cast(w, side);
      const [nonmatch, first, later] = w.ids[side].deck;
      expect(result.events.filter(e => e.kind === "cardDrawn").map(e => e.instance)).toEqual([nonmatch, first, later]);
      expect(result.state.turnLog.drawn[side]).toBe(3);
      expect(changes(result.events)).toEqual([expect.objectContaining({ expiry: { at: "endOfTurn" },
        change: { kind: "cardCost", instance: first, mode: "reduce", amount: 1 } })]);
      expect([first, later].map(id => price(w, result.state, id))).toEqual([2, 3]);
      expect(result.state.oncePerTurn).toHaveLength(1);
      expect(result.events.filter(e => e.kind === "triggerResolved")).toHaveLength(1);
      const paid = w.engine.apply(result.state, side, play(first), NO_PROMPTS);
      expect(paid.state.sides[side].currentEnergy).toBe(1);
      expect(paid.state.instances[first].zone).toBe("play");
      const ended = passUntil(w.engine, paid.state, at(w.engine, opponent(side), "day")).state;
      expect(ended.floating).toEqual([]);
      expect(price(w, ended, first)).toBe(3);
    });

    it(side + " retains all-draw ordinals while conjoining filters and player ownership", () => {
      for (const [trigger, expected] of [
        [whenDraw("you", 2), 1], [whenDraw("you", 2, { cardType: "character" }), 1],
        [whenDraw("you", 1, { cardType: "character" }), 0], [whenDraw("opponent", undefined, { cardType: "character" }), 0],
      ] as const) {
        const w = world(side, { trigger }), result = cast(w, side);
        expect(changes(result.events)).toHaveLength(expected);
        if (expected > 0) expect(changes(result.events)[0]).toMatchObject({ change: { instance: w.ids[side].deck[1] } });
      }
      const other = world(side, { trigger: whenDraw("opponent", undefined, { cardType: "character" }), effect: draw(1, "opponent"),
        other: { deck: [v.vanilla3.id] } });
      expect(changes(cast(other, side).events)).toEqual([expect.objectContaining({ controller: side, change: { kind: "cardCost",
        instance: other.ids[opponent(side)].deck[0], mode: "reduce", amount: 1 } })]);
    });

    it(side + " matches effective card characteristics in hand, not a retained card or printed type", () => {
      const filter: CardFilter = { cardType: "character", subtype: "Mage", costAtLeast: 1, costAtMost: 1, sparkAtLeast: 0, sparkAtMost: 0, fast: true };
      const w = world(side, { trigger: whenDraw("you", undefined, filter), effect: draw(1), setup: { deck: [v.event1.id], hand: [source().id, v.vanilla3.id] } });
      const top = w.ids[side].deck[0];
      w.state.instances[top] = { ...w.state.instances[top], variant: { amplified: false, deckMods: { ...NO_DECK_MODS,
        typeChange: { cardType: "character", subtype: "Mage" }, sparkBonus: 4, fast: true } } };
      expect(changes(cast(w, side).events)).toMatchObject([{ change: { instance: top } }]);
      const wrong = world(side, { trigger: whenDraw("you", undefined, { cardType: "event" }), effect: draw(1), setup: { deck: [v.vanilla3.id] } });
      expect(changes(cast(wrong, side).events)).toEqual([]);
    });

    it(side + " preserves hidden subject and floating-cost visibility", () => {
      const w = world(side), result = cast(w, side), hidden = w.ids[side].deck[1], viewer = opponent(side);
      const queued = result.events.find(e => e.kind === "triggerQueued")!;
      expect(queued).toMatchObject({ subject: hidden, subjectHiddenFrom: [viewer] });
      expect(eventSeenBy(queued, viewer, result.state)).toMatchObject({ subject: null });
      expect(w.engine.view(result.state, viewer).instances[hidden]).toBeUndefined();
      expect(w.engine.view(result.state, viewer).floating).toEqual([]);
      expect(w.engine.view(result.state, side).floating).toHaveLength(1);
      expect(eventSeenBy(changes(result.events)[0], viewer, result.state)).toBeNull();
    });

    it(side + " ignores Fatigue and allows a matching draw after the turn resets", () => {
      const empty = world(side, { setup: { deck: [] }, effect: draw(1) }), fatigued = cast(empty, side);
      expect(changes(fatigued.events)).toEqual([]);
      expect(fatigued.state.oncePerTurn).toEqual([]);
      expect(fatigued.state.turnLog.drawn[side]).toBe(0);
      const w = world(side, { effect: draw(1), setup: { deck: [v.vanilla3.id, v.vanilla3.id, v.vanilla3.id] } }), first = cast(w, side);
      const opposite = passUntil(w.engine, first.state, at(w.engine, opponent(side), "day")).state;
      const next = passUntil(w.engine, opposite, at(w.engine, side, "day")).state;
      expect(next.floating).toHaveLength(1);
      expect(next.floating[0].change).toMatchObject({ kind: "cardCost", instance: w.ids[side].deck[1] });
      expect(price(w, next, w.ids[side].deck[0])).toBe(3);
    });

    it(side + " reloads a queued matching draw while retaining its physical subject", () => {
      const w = world(side, { effect: draw(1), setup: { deck: [v.vanilla3.id] } });
      const played = runStep(w.state, { kind: "play", card: w.ids[side].hand[0], from: "hand" }, NO_PROMPTS, w.engine.catalog);
      if (played.kind !== "done") throw new Error("Unexpected prompt");
      const drawn = runStep(played.state, { kind: "resolveTop" }, NO_PROMPTS, w.engine.catalog);
      if (drawn.kind !== "done") throw new Error("Unexpected draw prompt");
      expect(drawn.state.triggerQueue).toHaveLength(1);
      const loaded = deserializeState(serializeState(drawn.state));
      const resolve = (state: BattleState) => runStep(state, { kind: "resolveTrigger" }, NO_PROMPTS, w.engine.catalog);
      const first = resolve(drawn.state), restarted = resolve(loaded);
      if (first.kind !== "done" || restarted.kind !== "done") throw new Error("Unexpected trigger prompt");
      expect(stateHash(first.state)).toBe(stateHash(restarted.state));
      expect(first.events).toEqual(restarted.events);
      expect(changes(first.events)).toHaveLength(1);
      expect(first.state.oncePerTurn).toHaveLength(1);
    });
  }

  it("rolls back a failed draw's partial queue, counter and allowance, then retries exactly once", () => {
    const effect = draw(1), card = source(effect);
    const failure: EngineCardDefinition = { ...card, synthetic: { resolve(ctx, item) {
      resolveEffect(ctx, effect, { source: item.instance, origin: instanceOrigin(ctx.state.instances[item.instance]),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
      throw new Error("synthetic failure after filtered draw");
    } } };
    const w = world("player", { card: failure, setup: { deck: [v.vanilla3.id] } });
    const played = runStep(w.state, { kind: "play", card: w.ids.player.hand[0], from: "hand" }, NO_PROMPTS, w.engine.catalog);
    if (played.kind !== "done") throw new Error("Unexpected prompt");
    const before = stateHash(played.state);
    expect(() => runStep(played.state, { kind: "resolveTop" }, NO_PROMPTS, w.engine.catalog)).toThrow("synthetic failure");
    expect(stateHash(played.state)).toBe(before);
    expect(played.state.turnLog.drawn.player).toBe(0);
    expect(played.state.oncePerTurn).toEqual([]);
    expect(played.state.triggerQueue).toEqual([]);
    const repaired = createEngine(testCatalog([card], { dreamsigns: [sign()] }));
    const retried = repaired.apply(played.state, "enemy", { kind: "pass" }, NO_PROMPTS);
    expect(retried.state.turnLog.drawn.player).toBe(1);
    expect(changes(retried.events)).toHaveLength(1);
  });

  it("resumes a saved prompt after drawing, rejects stale or foreign answers, and publishes one reduction", () => {
    const w = world("player", { effect: sequence(draw(3), optional(gainPoints(1))) });
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(w.state), { kind: "battleAction", side: "player", action: play(w.ids.player.hand[0]) }));
    const pending = fold.pending(opened.slice)!;
    expect(pending.prompt.kind).toBe("confirm");
    expect(pending.display.turnLog.drawn.player).toBe(3);
    expect(pending.display.oncePerTurn).toHaveLength(1);
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const fresh = createFoldAdapter(createEngine(w.engine.catalog), { checkEventPrefix: true });
    expect(fresh.pending(saved)).toEqual(pending);
    expect(fresh.reduce(saved, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: true }).kind).toBe("bounced");
    expect(fresh.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [] }).kind).toBe("bounced");
    const intent = { kind: "answer" as const, side: "player" as const, promptId: pending.prompt.id, value: false };
    const result = applied(fresh.reduce(saved, intent));
    expect(result.slice.committed.turnLog.drawn.player).toBe(3);
    expect(changes([...opened.published, ...result.published])).toHaveLength(1);
    expect(fresh.reduce(result.slice, intent).kind).toBe("bounced");
    const inline = w.engine.apply(w.state, "player", play(w.ids.player.hand[0]), new ScriptedSource([false]));
    expect(stateHash(inline.state)).toBe(stateHash(result.slice.committed));
  });
});
