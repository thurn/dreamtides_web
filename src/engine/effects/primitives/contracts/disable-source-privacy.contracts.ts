/** Hidden producer contracts compare public views and ordinary future play. */
import { describe, expect, it } from "vitest";
import { activated, all, anyCharacter, characterYouControl, energy, event, everyIn } from "../../../dsl/builders";
import { triggered, whenDraw } from "../../../dsl/triggers";
import type { Condition } from "../../../dsl/types";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { battleSeed, SIDES, type InstanceId, type Side } from "../../../state/ids";
import { stateHash } from "../../../state/hash";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { comparableView, determinizationDivergences } from "../../../testing/determinization-fidelity";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { resolveEffect } from "../../interpreter";
import * as p from "../index";

const conditions: readonly (Condition | null)[] = [null, { cond: "sourceIn", zone: "hand" }];
function fixture(condition: Condition | null, publicProducer = false, side: Side = "player") {
  const other: Side = side === "player" ? "enemy" : "player";
  const disable = p.disableTriggers(all(anyCharacter()), "permanent", condition, "triggeredAndActivated");
  const hand = (index: number, nth?: number): EngineCardDefinition => ({ ...v.vanilla1, id: syntheticId(0x77b10 + index), costs: [energy(0)],
    abilities: () => [triggered(whenDraw("opponent", nth), disable, { zone: "hand" })] });
  const [twice, first, second] = [hand(0), hand(1, 1), hand(2, 2)];
  const starter: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x77b20), cardType: "event", spark: null, subtype: "", costs: [energy(0)], abilities: () => [event(publicProducer ? disable : p.draw(2))] };
  const target: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x77b21), abilities: () => [activated([energy(0)], p.gainPoints(1))] };
  const observer: EngineCardDefinition = { ...starter, id: syntheticId(0x77b22), synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, p.sequence(p.draw(2), p.reveal("opponent"), p.shuffleInto([everyIn("hand", {}, { player: "opponent" })]), p.discard(1)), {
      controller: item.controller, source: item.instance, origin: instanceOrigin(ctx.state.instances[item.instance]), ability: 0, x: null,
      optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("Synthetic failure after publishing attribution");
  } } };
  const revealer: EngineCardDefinition = { ...starter, id: syntheticId(0x77b23), abilities: () => [event(p.reveal("opponent"))] };
  const engine = createEngine(testCatalog([twice, first, second, starter, target, observer, revealer]));
  function world(shared: boolean, known = false) {
    const initial = boardState(engine.catalog, { active: side, phase: "day", [side]: {
      back: publicProducer ? [target.id, target.id] : [target.id], hand: [starter.id, observer.id, ...(known ? [revealer.id] : [])], deck: [v.vanilla3.id, v.vanilla5.id], energy: 8,
    }, [other]: { hand: publicProducer ? [v.vanilla1.id, v.interruptEvent.id] : shared ? [twice.id, v.vanilla1.id, v.interruptEvent.id] : [first.id, second.id, v.interruptEvent.id], deck: shared ? [first.id, second.id] : [twice.id, v.vanilla1.id], energy: 8 } });
    const entries = (side: Side) => Object.values(initial.state.instances).filter((instance) => instance.owner === side)
      .sort((a, b) => JSON.stringify(a.printing).localeCompare(JSON.stringify(b.printing)))
      .flatMap((instance) => instance.printing.kind === "card" ? [{ cardId: instance.printing.cardId }] : []);
    const lists = { player: entries("player"), enemy: entries("enemy") };
    const before = known ? passUntil(engine, engine.apply(initial.state, side, { kind: "play", card: initial.ids[side].hand[2], from: "hand" }, NO_PROMPTS).state, (state) => state.stack.length === 0).state : initial.state;
    const cast = engine.apply(before, side, { kind: "play", card: initial.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const done = passUntil(engine, cast.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0);
    return { ...initial, state: done.state, lists, view: engine.view(done.state, side), events: [...cast.events, ...done.events] };
  }
  return { engine, world };
}
function aliasWorld(shared: boolean) {
  const targets = [1, 2].map((cost): EngineCardDefinition => ({ ...v.vanilla1, id: syntheticId(0x77b40 + cost), costs: [energy(cost)], abilities: () => [activated([energy(0)], p.gainPoints(1))] }));
  const hand: EngineCardDefinition = { ...v.event0, id: syntheticId(0x77b43), abilities: () => [event(p.sequence()), triggered(whenDraw("you"), p.sequence(
    p.disableTriggers(all(anyCharacter(shared ? {} : { costAtMost: 1 })), "permanent", { cond: "sourceIn", zone: "hand" }, "triggeredAndActivated"),
    p.putInDeck([everyIn("hand", { cardType: "character" })], "bottom"),
  ), { zone: "hand" })] };
  const deck: EngineCardDefinition = { ...v.event0, id: syntheticId(0x77b44), abilities: () => [event(p.sequence()), triggered(whenDraw("you"), p.sequence(
    p.putInDeck([everyIn("hand", { cardType: "event", costAtLeast: 1 })], "bottom"),
    p.disableTriggers(all(anyCharacter({ costAtLeast: 2 })), "permanent", { cond: "sourceIn", zone: "deck" }, "triggeredAndActivated"),
  ), { zone: "hand" })], costs: [energy(1)] };
  const reveal: EngineCardDefinition = { ...v.event0, id: syntheticId(0x77b45), abilities: () => [event(p.reveal("opponent"))] };
  const engine = createEngine(testCatalog([...targets, hand, deck, reveal]));
  const initial = boardState(engine.catalog, { active: "enemy", phase: "day", player: { hand: shared ? [hand.id] : [hand.id, deck.id], deck: [v.vanilla5.id], energy: 8 }, enemy: { hand: [reveal.id], back: targets.map((target) => target.id), energy: 8 } });
  const cast = engine.apply(initial.state, "enemy", { kind: "play", card: initial.ids.enemy.hand[0], from: "hand" }, NO_PROMPTS);
  const shown = passUntil(engine, cast.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0).state;
  const state = passUntil(engine, shown, (next) => at(engine, "player", "day")(next) && next.triggerQueue.length === 0 && next.stack.length === 0).state;
  const lists = { player: [hand.id, ...(shared ? [] : [deck.id]), v.vanilla5.id].map((cardId) => ({ cardId })), enemy: [reveal.id, ...targets.map((target) => target.id)].map((cardId) => ({ cardId })) };
  return { engine, state, lists, view: engine.view(state, "enemy"), targets: initial.ids.enemy.back };
}
function ceasedWorld(visibleTargets: number) {
  const target: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x77b30), abilities: () => [activated([energy(0)], p.gainPoints(1))] };
  const source: EngineCardDefinition = { ...v.event0, id: syntheticId(0x77b31), abilities: () => [event(p.disableTriggers(all(anyCharacter()), "permanent", null, "triggeredAndActivated"))] };
  const copy: EngineCardDefinition = { ...v.event0, id: syntheticId(0x77b32), abilities: () => [event(p.createCopyInHand(everyIn("void")))] };
  const conceal: EngineCardDefinition = { ...v.event0, id: syntheticId(0x77b33), abilities: () => [event(p.sequence(p.returnToHand(all(characterYouControl())), p.shuffleInto([everyIn("hand")])))] };
  const engine = createEngine(testCatalog([target, source, copy, conceal]));
  const initial = boardState(engine.catalog, { active: "player", phase: "day", player: {
    back: [target.id], hand: [copy.id, conceal.id], void: [source.id], energy: 8,
  }, enemy: { back: Array.from({ length: visibleTargets }, () => target.id), energy: 8 } });
  const cast = (state: BattleState, card: InstanceId) => passUntil(engine,
    engine.apply(state, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS).state,
    (next) => next.stack.length === 0 && next.triggerQueue.length === 0).state;
  const copied = cast(initial.state, initial.ids.player.hand[0]);
  const created = copied.sides.player.hand.find((id) => copied.instances[id].status.created);
  if (created === undefined) throw new Error("Missing public created source");
  const observed = cast(copied, created), state = cast(observed, initial.ids.player.hand[1]);
  const lists = { player: [target.id, source.id, copy.id, conceal.id].map((cardId) => ({ cardId })),
    enemy: Array.from({ length: visibleTargets }, () => ({ cardId: target.id })) };
  return { engine, state, observed, created, lists, view: engine.view(state, "enemy") };
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Expected successful fold intent: ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
function saved(slice: BattleSlice): Record<string, unknown> {
  return { mode: { kind: "journey" }, init: {
    battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
    avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } };
}
function sources(state: BattleState): InstanceId[] {
  return state.floating.map((effect) => { if (typeof effect.source !== "string") throw new Error("Expected reconstructed card source"); return effect.source; });
}

describe("combined disabling private source attribution", () => {
  it.each(conditions)("conceals private alias, printing, owner and existence for %j", (condition) => {
    const { engine, world } = fixture(condition), shared = world(true), separate = world(false);
    const redacted = (outcome: typeof shared) => outcome.events.map((item) => eventSeenBy(item, "player", outcome.state));
    expect(redacted(shared)).toEqual(redacted(separate));
    expect(shared.view).toEqual(separate.view);
    expect(shared.view.floating).toHaveLength(2);
    const malformed = { ...shared.view, floating: shared.view.floating.map((effect) => ({ ...effect, rememberedSource: { obligation: shared.view.floating[1].id } })) };
    expect(() => engine.determinize(malformed, shared.lists, () => 0.4)).toThrow(/invalid source obligation/);
    for (const effect of shared.view.floating) {
      expect(effect.source).toBeNull();
      expect(effect.rememberedSource).toEqual({ obligation: effect.id });
      expect(effect).not.toHaveProperty("sourceObservedBy");
    }
    const absent = structuredClone(shared.state);
    for (const id of new Set(sources(absent))) {
      const replacement: InstanceId = `i${absent.nextInstance++}`;
      absent.instances[replacement] = { ...absent.instances[id], id: replacement, printing: { kind: "card", cardId: v.vanilla1.id } };
      delete absent.instances[id];
      absent.sides.enemy.hand = absent.sides.enemy.hand.map((entry) => entry === id ? replacement : entry);
    }
    if (condition === null) expect(engine.view(absent, "player")).toEqual(shared.view);
    for (const random of [() => 0.4, () => 0.99]) {
      const left = engine.determinize(shared.view, shared.lists, random), right = engine.determinize(separate.view, separate.lists, random);
      expect(stateHash(left)).toBe(stateHash(right));
      expect(comparableView(engine.view(left, "player"))).toEqual(comparableView(shared.view));
      expect(determinizationDivergences(engine, shared.state, shared.lists, battleSeed("private-producer"), 7)).toEqual([]);
    }
  });

  it.each([true, false])("retains a constrained private alias and its executed future ($shared)", (shared) => {
    const { engine, state, lists, view, targets } = aliasWorld(shared);
    const firstTarget = targets[0];
    if (firstTarget == null) throw new Error("Missing physical target");
    expect(view.floating).toHaveLength(2);
    expect(view.disabledActivations).toEqual(targets);
    expect(view.floating.every((effect) => effect.source === null)).toBe(true);
    const sample = engine.determinize(view, lists, () => 0.4), ids = sources(sample);
    expect(ids[0] === ids[1]).toBe(shared);
    const source = ids[0];
    expect(sample.instances[source].zone).toBe("hand");
    expect(sample.instances[source].controller).toBe("player");
    expect(engine.legalActions(sample, "player")).toContainEqual({ kind: "play", card: source, from: "hand" });
    const played = engine.apply(sample, "player", { kind: "play", card: source, from: "hand" }, NO_PROMPTS);
    const done = passUntil(engine, played.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0);
    expect(done.state.instances[source].zone).toBe("void");
    expect(engine.view(done.state, "enemy").disabledActivations).toEqual(shared ? [] : [targets[1]]);
    const ready = passUntil(engine, done.state, at(engine, "enemy", "day")).state;
    expect(engine.legalActions(ready, "enemy")).toContainEqual({ kind: "activate", source: firstTarget, ability: 0 });
    const activated = engine.apply(ready, "enemy", { kind: "activate", source: firstTarget, ability: 0 }, NO_PROMPTS);
    const resolved = passUntil(engine, activated.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0).state;
    expect(resolved.sides.enemy.score).toBe(ready.sides.enemy.score + 1);
    expect(state.floating).toHaveLength(2);
  });

  it.each(SIDES.flatMap((side) => conditions.map((condition) => ({ side, condition }))))("keeps a real previously revealed producer opaque and fixed for $side/$condition", ({ side, condition }) => {
    const other: Side = side === "player" ? "enemy" : "player";
    const { engine, world } = fixture(condition, false, side), original = world(true, true);
    const producer = original.ids[other].hand[0], seen = original.view;
    expect(original.state.floating.every((effect) => effect.source === producer)).toBe(true);
    expect(seen.instances[producer]).toMatchObject(original.state.instances[producer]);
    expect(seen.sides[other].hand.known[0]).toEqual({ index: 0, id: producer });
    const started = original.events.filter((event) => event.kind === "effectStarted");
    expect(started).toHaveLength(2);
    expect(started.map((event) => eventSeenBy(event, side, original.state))).toEqual(started.map((event) => ({ ...event, source: null })));
    expect(seen.floating.every((effect) => effect.source === null && effect.rememberedSource != null && "obligation" in effect.rememberedSource)).toBe(true);
    const sample = engine.determinize(seen, original.lists, () => 0.4);
    expect(sample.instances[producer]).toEqual(original.state.instances[producer]);
    expect(sample.sides[other].hand.indexOf(producer)).toBe(original.state.sides[other].hand.indexOf(producer));
    expect(comparableView(engine.view(sample, side))).toEqual(comparableView(seen));
    expect(engine.legalActions(sample, side)).toEqual(engine.legalActions(original.state, side));
    // An actual later engine step learns physical cards without publishing past causes.
    const next = passUntil(engine, sample, at(engine, other, "day")).state;
    expect(next.floating.every((effect) => effect.sourceObservedBy?.includes(side) === false)).toBe(true);
  });

  it("keeps later physical revelation separate from causal attribution and validates strict modes", () => {
    const { engine, world } = fixture(null), original = world(true);
    const observed = structuredClone(original.state);
    const fold = createFoldAdapter(engine);
    // The ordinary reveal identifies cards while the original private relationship stays opaque.
    const cast = applied(fold.reduce(sliceOf(observed), { kind: "battleAction", side: "player", action: { kind: "play", card: original.ids.player.hand[1], from: "hand" } }));
    const suspended = applied(fold.reduce(cast, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const pending = fold.pending(suspended)!;
    expect(pending.display.floating.every((effect) => effect.sourceObservedBy?.includes("player") === false)).toBe(true);
    const parsed = parseJourneyBattleFoldState(saved({ ...suspended, committed: pending.display }))!;
    expect(stateHash(parsed.engine.slice.committed)).toBe(stateHash(pending.display));
    const seen = engine.view(parsed.engine.slice.committed, "player");
    expect(seen.floating.map((effect) => effect.rememberedSource)).toEqual(seen.floating.map((effect) => ({ obligation: effect.id })));
    const legacy = structuredClone(parsed.engine.slice.committed);
    legacy.floating = legacy.floating.map(({ sourceObservedBy: _observed, ...effect }) => effect);
    expect(parseJourneyBattleFoldState(saved(sliceOf(legacy)))).not.toBeNull();
    expect(engine.view(legacy, "player").floating.map((effect) => effect.rememberedSource)).toEqual(legacy.floating.map((effect) => ({ obligation: effect.id })));
    for (const malformed of [null, true, "player", ["player", "player"], ["other"], ["player", 1]]) {
      const data = saved(sliceOf(original.state));
      const engineData = data.engine as { slice: { committed: { floating: { sourceObservedBy: unknown }[] } } };
      engineData.slice.committed.floating[0].sourceObservedBy = malformed;
      expect(parseJourneyBattleFoldState(data)).toBeNull();
    }
    for (const mode of [undefined, "triggered"] as const) {
      const state = structuredClone(original.state), effect = state.floating[0];
      if (effect.change.kind !== "disableTriggers") throw new Error("Missing combined effect");
      state.floating[0] = { ...effect, sourceObservedBy: ["enemy"], change: { ...effect.change, mode } };
      expect(parseJourneyBattleFoldState(saved(sliceOf(state)))).toBeNull();
    }
  });

  it("retains legacy public sources while explicit empty observations stay opaque", () => {
    const { engine, world } = fixture(null, true), original = world(true);
    const source = original.ids.player.hand[0];
    const legacy = structuredClone(original.state);
    legacy.floating = legacy.floating.map(({ sourceObservedBy: _flags, ...effect }) => effect);
    const legacyView = engine.view(legacy, "player");
    expect(legacyView.floating.map((effect) => effect.source)).toEqual([source, source]);
    const started = original.events.filter((event) => event.kind === "effectStarted");
    expect(started.map((event) => eventSeenBy(event, "player", legacy))).toEqual(started);
    expect(parseJourneyBattleFoldState(saved(sliceOf(legacy)))).not.toBeNull();
    const opaque = structuredClone(legacy);
    opaque.floating = opaque.floating.map((effect) => ({ ...effect, sourceObservedBy: [] }));
    expect(engine.view(opaque, "player").floating.every((effect) => effect.source === null)).toBe(true);
    expect(started.map((event) => eventSeenBy(event, "player", opaque))).toEqual(started.map((event) => ({ ...event, source: null })));
  });

  it.each([1, 2])("anchors only the %i visible observed ceased effects", (count) => {
    const { engine, state, created, lists, view } = ceasedWorld(count);
    expect(state.instances[created]).toBeUndefined();
    expect(state.floating).toHaveLength(count + 1);
    expect(view.floating).toHaveLength(count);
    expect(view.floating.map((effect) => effect.rememberedSource)).toEqual(count === 1 ? [null] : view.floating.map(() => ({ ceased: view.floating[0].id })));
    const sample = engine.determinize(view, lists, () => 0.4);
    expect(new Set(sources(sample)).size).toBe(1);
    expect(sources(sample).every((id) => sample.instances[id] === undefined)).toBe(true);
    expect(comparableView(engine.view(sample, "enemy"))).toEqual(comparableView(view));
  });

  it("rejects malformed or contradictory ceased anchors without mutating its public input", () => {
    const { engine, lists, view } = ceasedWorld(2);
    const [first, second] = view.floating;
    if (second.change.kind !== "disableTriggers") throw new Error("Missing combined target");
    const target = second.change.instance;
    const invalid = [
      { ...view, floating: view.floating.map((effect) => ({ ...effect, rememberedSource: { ceased: second.id } })) },
      { ...view, floating: [{ ...first, rememberedSource: { ceased: first.id } }] },
      { ...view, floating: [first, { ...second, source: target }] },
      { ...view, floating: view.floating.map((effect) => ({ ...effect, rememberedSource: { ceased: first.id, member: 0 } })) },
      { ...view, floating: [first, { ...second, change: { kind: "disableTriggers" as const, instance: target, mode: "triggered" as const } }] },
    ];
    for (const seen of invalid) {
      const before = structuredClone(seen);
      expect(() => engine.determinize(seen, lists, () => 0.4)).toThrow(/invalid ceased source anchor/);
      expect(seen).toEqual(before);
    }
  });

  it("reloads published observation, rejects invalid concurrent and stale input, and retains attribution on error", () => {
    const { engine, world } = fixture(null, true), original = world(true), fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const cast = applied(fold.reduce(sliceOf(original.state), { kind: "battleAction", side: "player", action: { kind: "play", card: original.ids.player.hand[1], from: "hand" } }));
    const pendingSlice = applied(fold.reduce(cast, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const loaded = parseJourneyBattleFoldState(saved(pendingSlice))!.engine.slice, pending = fold.pending(loaded)!;
    expect(pending.prompt.kind).toBe("chooseCards");
    expect(fold.pending(pendingSlice)!.prompt).toEqual(pending.prompt);
    expect(fold.reduce(loaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(loaded, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(loaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(loaded, { kind: "cancel", side: "player", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [pending.display.sides.player.hand[0]] } as const;
    const failed = fold.reduce(loaded, answer), direct = fold.reduce(pendingSlice, answer);
    if (failed.kind !== "applied" || direct.kind !== "applied") throw new Error("Expected contained error");
    expect(failed.error).not.toBeNull(); expect(stateHash(failed.slice.committed)).toBe(stateHash(direct.slice.committed));
    expect(failed.slice.inFlight).toBeNull(); expect(failed.slice.committed.floating).toHaveLength(2);
    expect(failed.slice.committed.floating.every((effect) => effect.sourceObservedBy?.includes("player"))).toBe(true);
    expect(failed.slice.committed.sides.enemy.hand).toEqual(cast.committed.sides.enemy.hand);
    const restarted = applied(fold.reduce(failed.slice, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    expect(fold.reduce(restarted, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(parseJourneyBattleFoldState(saved(failed.slice))).not.toBeNull();
  });
});
