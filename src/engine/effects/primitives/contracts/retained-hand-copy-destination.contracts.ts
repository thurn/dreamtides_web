/** Retained hand-copy destinations through real steps, saves and public views. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { energy, event, everyIn, self } from "../../../dsl/builders";
import { NO_DECK_MODS } from "../../../dsl/types";
import { triggered, triggeringCard, whenCopyTrigger, whenYouPlay } from "../../../dsl/triggers";
import { createEngine, type Engine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { comparableView } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { determinize } from "../../../view/determinize";
import { parseDreamsignId } from "../../../../types/identifiers";
import type { ResolvingEffect } from "../../registry";
import type { CopyCardTimesNode } from "../copy-card";
import * as p from "../index";
import { decklists } from "./with-materialized-support";

const id = (n: number) => syntheticId(0x8ddd00 + n);
const spell = (n: number, effect: ResolvingEffect): EngineCardDefinition => ({
  ...v.event0, id: id(n), status: "authored", costs: [energy(2)], abilities: () => [event(effect)],
});
const sign = (effect: ResolvingEffect, options: Parameters<typeof triggered>[2] = {}): EngineDreamsignDefinition => ({
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-0000008ddd10"), status: "authored",
  abilities: () => [triggered(whenCopyTrigger("opponent", { cardType: "event" }), effect, options)],
});
const copyEvents = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "cardCopied");
const play = (card: InstanceId): Step => ({ kind: "play", card, from: "hand" });
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
function step(engine: Engine, state: BattleState, action: Step, automatic = false) {
  const result = runStep(state, action, NO_PROMPTS, engine.catalog, { automatic });
  if (result.kind !== "done") throw new Error(`Unexpected ${result.prompt.kind}`);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}
function world(side: Side, watcher: EngineDreamsignDefinition, cards: readonly EngineCardDefinition[], mine: SideSetup, theirs: SideSetup = {}) {
  const other = opponent(side);
  const engine = createEngine(testCatalog(cards, { dreamsigns: [watcher] }));
  return { engine, side, other, ...boardState(engine.catalog, {
    active: side, phase: "day", scoreToWin: 100,
    [side]: { energy: 20, deck, ...mine },
    [other]: { energy: 20, deck, dreamsigns: [watcher.id], ...theirs },
  }) };
}
function handOccasion(side: Side, effect: ResolvingEffect, ephemeral = true, options: Parameters<typeof triggered>[2] = {}) {
  const subject = spell(1, p.createCopyInHand(self(), { ephemeral }));
  const maker = spell(2, p.createCard(subject.id));
  const watcher = sign(effect, options);
  const f = world(side, watcher, [subject, maker], { hand: [maker.id] });
  const made = step(f.engine, step(f.engine, f.state, play(f.ids[side].hand[0])).state, { kind: "resolveTop" });
  const original = made.state.sides[side].hand[0];
  const result = step(f.engine, step(f.engine, made.state, play(original)).state, { kind: "resolveTop" });
  expect(result.state.instances[original]).toBeUndefined();
  expect(result.state.triggerQueue).toHaveLength(1);
  expect(result.state.triggerQueue[0]).toMatchObject({ controller: f.other, subject: original,
    handCopy: { copier: side, printing: { kind: "card", cardId: subject.id }, variant: { amplified: false }, ephemeral } });
  return { ...f, ...result, original, subject, watcher };
}
function expectDestination(f: { engine: Engine; side: Side; other: Side }, result: ReturnType<typeof step>, count: number, original: InstanceId, tuple: { printing: unknown; variant: unknown; ephemeral: boolean }) {
  const copies = copyEvents(result.events);
  expect(copies).toHaveLength(count);
  expect(new Set(copies.map(e => e.copy)).size).toBe(count);
  for (const copy of copies) {
    expect(copy).toMatchObject({ side: f.side, zone: "hand", original });
    expect(result.state.instances[copy.copy]).toMatchObject({
      owner: f.side, controller: f.side, zone: "hand", printing: tuple.printing, variant: tuple.variant,
      status: { created: true, ephemeral: tuple.ephemeral },
    });
    expect(result.state.sides[f.side].hand).toContain(copy.copy);
    expect(result.state.sides[f.other].hand).not.toContain(copy.copy);
    expect(eventSeenBy(copy, f.side, result.state)).not.toBeNull();
    expect(eventSeenBy(copy, f.other, result.state)).toBeNull();
  }
}
function stackOccasion(side: Side, times: number) {
  const subject = spell(3, p.gainEnergy(1));
  const echo: EngineCardDefinition = { ...v.vanilla0, id: id(4), status: "authored",
    abilities: () => [triggered(whenYouPlay({ cardType: "event" }), p.copyCard(triggeringCard()))] };
  const watcher = sign(times === 1 ? p.copyCard(triggeringCard()) : p.copyCardTimes(triggeringCard(), times));
  const f = world(side, watcher, [subject, echo], { hand: [subject.id], back: [echo.id] });
  const played = step(f.engine, f.state, play(f.ids[side].hand[0]));
  const made = step(f.engine, played.state, { kind: "resolveTrigger" });
  expect(made.state.triggerQueue).toMatchObject([{ controller: f.other, subject: f.ids[side].hand[0] }]);
  return { ...f, ...made, original: f.ids[side].hand[0] };
}

for (const side of SIDES) describe(`${side} retained hand-copy destination`, () => {
  it.each([[1, false], [1, true], [2, false], [2, true]] as const)(
    "repeats %i captured copies ephemeral=%s after the original ceases and reloads", (count, ephemeral) => {
      const f = handOccasion(side, count === 1 ? p.copyCard(triggeringCard()) : p.copyCardTimes(triggeringCard(), count), ephemeral);
      const saved = deserializeState(serializeState(f.state));
      expect(stateHash(saved)).toBe(stateHash(f.state));
      const tuple = saved.triggerQueue[0].handCopy;
      if (tuple === undefined) throw new Error("Expected captured copy action");
      for (const viewer of SIDES) {
        const view = f.engine.view(saved, viewer);
        expect(view.triggerQueue[0].subject).toBe(f.original);
        if (viewer === side) expect(view.triggerQueue[0].handCopy).toEqual(tuple);
        else {
          expect(view.triggerQueue[0].handCopy).toBeUndefined();
          expect(view.triggerQueue[0].handCopyHidden).toBe(true);
          expect(view.triggerQueue[0].handCopyOriginal).toEqual({ printing: tuple.printing, variant: tuple.variant });
        }
        const sampled = determinize(view, decklists(saved), () => 0.25, f.engine.catalog);
        expect(comparableView(f.engine.view(sampled, viewer))).toEqual(comparableView(view));
        const repeated = step(f.engine, sampled, { kind: "resolveTrigger" });
        expect(copyEvents(repeated.events).every(e => e.side === side && repeated.state.instances[e.copy].controller === side)).toBe(true);
      }
      const repeated = step(f.engine, saved, { kind: "resolveTrigger" });
      expectDestination(f, repeated, count, f.original, tuple);
      expect(repeated.state.triggerQueue).toHaveLength(count);
      expect(repeated.state.triggerQueue.every(t => t.controller === f.other && t.handCopy?.copier === side)).toBe(true);
    });

  it("keeps a hidden original alias and its non-default variant separate from the ability owner", () => {
    const original = spell(5, p.gainEnergy(1));
    const maker = spell(6, p.createCopyInHand(everyIn("hand", { cardType: "event" }, { player: "opponent" }), { ephemeral: true }));
    const watcher = sign(p.copyCard(triggeringCard()), { oncePerTurn: true });
    const variant = { amplified: true, deckMods: { ...NO_DECK_MODS, fast: true } };
    const f = world(side, watcher, [original, maker], { hand: [maker.id] }, { hand: [{ cardId: original.id, ...variant }] });
    const made = step(f.engine, step(f.engine, f.state, play(f.ids[side].hand[0])).state, { kind: "resolveTop" });
    const saved = deserializeState(serializeState(made.state));
    const view = f.engine.view(saved, side);
    expect(view.triggerQueue[0].controller).toBe(f.other);
    expect(view.triggerQueue[0].subject).toBeNull();
    expect(view.triggerQueue[0].handCopy).toMatchObject({ copier: side, variant, ephemeral: true });
    expect(f.engine.view(saved, f.other).triggerQueue[0].handCopy).toBeUndefined();
    const sampled = determinize(view, decklists(saved), () => 0.25, f.engine.catalog);
    expect(comparableView(f.engine.view(sampled, side))).toEqual(comparableView(view));
    const repeated = step(f.engine, sampled, { kind: "resolveTrigger" });
    const [copy] = copyEvents(repeated.events);
    expect(copy).toBeDefined();
    expect(repeated.state.instances[copy.copy]).toMatchObject({ printing: { kind: "card", cardId: original.id }, variant, owner: side, controller: side, status: { ephemeral: true } });
    expect(eventSeenBy(copy, side, repeated.state)).toMatchObject({ original: null });
    expect(eventSeenBy(copy, f.other, repeated.state)).toBeNull();
  });

  it.each([1, 2])("uses the effect controller for %i stack copies and does not renew an opponent-only listener", count => {
    const f = stackOccasion(side, count);
    const repeated = step(f.engine, f.state, { kind: "resolveTrigger" }, true);
    expect(copyEvents(repeated.events)).toHaveLength(count);
    for (const copy of copyEvents(repeated.events)) {
      expect(copy).toEqual({ kind: "cardCopied", side: f.other, original: f.original, copy: copy.copy });
      expect(repeated.state.instances[copy.copy]).toMatchObject({ owner: f.other, controller: f.other, zone: "stack" });
    }
    expect(repeated.state.triggerQueue).toEqual([]);
    expect(repeated.state.result).toBeNull();
  });

  it("ends a genuine opponent-trigger hand renewal at the default mandatory threshold", () => {
    const f = handOccasion(side, p.copyCard(triggeringCard()));
    let state = f.state;
    const events: EngineEvent[] = [];
    // Test the configured accounting boundary with actual public steps. This
    // bound reports an absent required Draw; it does not invent a game result.
    for (let count = 0; count < f.state.config.mandatoryLoopCheckFrom && state.result === null; count++) {
      const repeated = step(f.engine, state, { kind: "resolveTrigger" }, true);
      state = repeated.state; events.push(...repeated.events);
    }
    expect(state.config).toEqual(f.state.config);
    expect(state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(state.automaticSteps).toBe(state.config.mandatoryLoopCheckFrom);
    expect(f.engine.decision(state)).toBeNull();
    expect(copyEvents(events).length).toBeGreaterThan(1);
    expect(new Set(copyEvents(events).map(e => e.copy)).size).toBe(copyEvents(events).length);
    expect(copyEvents(events).every(e => e.side === side && state.instances[e.copy].controller === side)).toBe(true);
    expect(state.sides[f.other].hand).toEqual([]);
    expect(stateHash(deserializeState(serializeState(state)))).toBe(stateHash(state));
  });

  it("finishes a once-only opposite-controller hand copy without a mandatory Draw", () => {
    const f = handOccasion(side, p.copyCard(triggeringCard()), true, { oncePerTurn: true });
    const repeated = step(f.engine, f.state, { kind: "resolveTrigger" }, true);
    expectDestination(f, repeated, 1, f.original, f.state.triggerQueue[0].handCopy!);
    expect(repeated.state.triggerQueue).toEqual([]);
    expect(repeated.state.result).toBeNull();
  });

  it("lets a conditional hand continuation finish beyond the mandatory threshold", () => {
    const initial = handOccasion(side, p.copyCard(triggeringCard()));
    const limit = initial.state.config.mandatoryLoopCheckFrom + 5;
    const f = handOccasion(side, p.copyCard(triggeringCard()), true,
      { condition: { cond: "cardsIn", zone: "hand", player: "opponent", atMost: limit - 1 } });
    let state = f.state;
    const events: EngineEvent[] = [];
    while (state.triggerQueue.length > 0 && state.result === null && state.sides[side].hand.length < limit) {
      const repeated = step(f.engine, state, { kind: "resolveTrigger" }, true);
      state = repeated.state; events.push(...repeated.events);
    }
    expect(state.result).toBeNull(); expect(state.triggerQueue).toEqual([]);
    expect(state.sides[side].hand).toHaveLength(limit);
    expect(copyEvents(events).length).toBeGreaterThan(state.config.mandatoryLoopCheckFrom);
    expect(state.sides[f.other].hand).toEqual([]);
  });

  it("rolls back a partial retained copy on error and resumes the saved queued action", () => {
    const invalid: CopyCardTimesNode = { op: "copyCardTimes", card: triggeringCard(), times: -1 };
    const f = handOccasion(side, p.sequence(p.copyCard(triggeringCard()), invalid), true, { oncePerTurn: true });
    const before = stateHash(f.state);
    expect(() => runStep(f.state, { kind: "resolveTrigger" }, NO_PROMPTS, f.engine.catalog)).toThrow(RangeError);
    expect(stateHash(f.state)).toBe(before);
    const saved = deserializeState(serializeState(f.state));
    const repaired = sign(p.copyCard(triggeringCard()), { oncePerTurn: true });
    const engine = createEngine(testCatalog([f.subject, spell(2, p.createCard(f.subject.id))], { dreamsigns: [repaired] }));
    const result = step(engine, saved, { kind: "resolveTrigger" });
    expectDestination({ ...f, engine }, result, 1, f.original, saved.triggerQueue[0].handCopy!);
    expect(result.state.triggerQueue).toEqual([]);
  });
});
