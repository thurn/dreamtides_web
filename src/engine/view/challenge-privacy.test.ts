/** Public designation history follows anonymous observations across hidden-zone boundaries. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { activated, all, anyCharacter, characterYouControl, energy, event, everyIn, keyword, self, staticAbility, target } from "../dsl/builders";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../fold/slice";
import type { Answer, Prompt } from "../prompts/types";
import { deserializeState, serializeState, stateHash } from "../state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../state/ids";
import type { BattleInit, BattleState } from "../state/types";
import { InlineSource, NO_PROMPTS } from "../steps/sources";
import { boardState } from "../testing/board";
import { comparableView, determinizationDivergences } from "../testing/determinization-fidelity";
import { redactionViolations, strings } from "../testing/redaction";
import { syntheticId, SYNTHETIC as v, testCatalog } from "../testing/synthetic-cards";
import { at, passUntil } from "../testing/trigger-harness";
import { ZONE_FIGMENT } from "../testing/zone-cards";
import { parseEngineBattleFold } from "../../rules/battle/fold";
import type { BattleView } from "./view";

const mover: EngineCardDefinition = {
  ...v.vanilla2, id: syntheticId(0x9b10), costs: [energy(0)], speed: "interrupt", status: "authored",
  abilities: () => [keyword("awakened"), activated([], p.move(self()), { speed: "fast" })],
};
const bounce: EngineCardDefinition = {
  ...v.interruptEvent, id: syntheticId(0x9b11), costs: [energy(0)], status: "authored",
  abilities: () => [event(p.returnToHand(target(anyCharacter())))],
};
const shuffle: EngineCardDefinition = { ...bounce, id: syntheticId(0x9b12), abilities: () => [event(p.shuffleInto([], { chooseFromHand: 1 }))] };
const materialize: EngineCardDefinition = { ...bounce, id: syntheticId(0x9b13), abilities: () => [event(p.materialize(everyIn("deck", { cardType: "character" }), { awakened: true }))] };
const transfer: EngineCardDefinition = { ...bounce, id: syntheticId(0x9b14), abilities: () => [event(p.gainControl(target(anyCharacter())))] };
const challengerAnthem: EngineCardDefinition = {
  ...v.vanilla0, id: syntheticId(0x9b15), status: "authored",
  abilities: () => [staticAbility(p.sparkModifier(all(characterYouControl({ challenging: true })), 3))],
};
const blockerAnthem: EngineCardDefinition = {
  ...v.vanilla0, id: syntheticId(0x9b16), status: "authored",
  abilities: () => [staticAbility(p.sparkModifier(all(characterYouControl({ blocking: true })), 5))],
};
const summoner: EngineCardDefinition = {
  ...v.vanilla0, id: syntheticId(0x9b17), status: "authored",
  abilities: () => [activated([], p.sequence(
    p.materialize(everyIn("deck", { cardType: "character" }), { awakened: true }),
    p.materialize(everyIn("hand", { cardType: "character" }), { awakened: true }),
  ), { speed: "fast" })],
};
const engine = createEngine(testCatalog([mover, bounce, shuffle, materialize, transfer, challengerAnthem, blockerAnthem, summoner], {}, [ZONE_FIGMENT.warrior]));

function setup(active: Side, figment = false) {
  const defending = opponent(active);
  const board = boardState(engine.catalog, {
    active, phase: "day", scoreToWin: 100,
    [active]: { front: [figment ? null : mover.id, mover.id], back: [challengerAnthem.id, summoner.id], hand: [bounce.id, shuffle.id, materialize.id, transfer.id, v.interruptEvent.id], deck: [v.vanilla1.id], energy: 20,
      ...(figment ? { figments: [{ slot: { rank: "front" as const, index: 0 }, printing: { kind: "figment" as const, figment: ZONE_FIGMENT.warrior.id } }] } : {}) },
    [defending]: { front: [mover.id], back: [blockerAnthem.id], hand: [bounce.id, shuffle.id, v.interruptEvent.id], deck: [v.vanilla1.id], energy: 20 },
  });
  const state = passUntil(engine, board.state, at(engine, active, "night")).state;
  const original = state.sides[active].frontRank[0]!;
  const next = state.sides[active].frontRank[1]!;
  const blocker = state.sides[defending].frontRank[0]!;
  return { state, ids: board.ids, active, defending, original, next, blocker };
}

function answers(card?: InstanceId) {
  const answer = (prompt: Prompt): Answer => {
    if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") {
      if (card === undefined || !prompt.candidates.includes(card)) throw new Error("The chosen card is absent");
      return [card];
    }
    if (prompt.kind === "chooseSlot") return prompt.slots.findIndex((slot) => slot.rank === "front" && slot.index === 0);
    throw new Error(`Unexpected ${prompt.kind} prompt`);
  };
  return new InlineSource({ player: answer, enemy: answer });
}
function play(state: BattleState, side: Side, card: InstanceId, chosen?: InstanceId): BattleState {
  const source = answers(chosen);
  const played = engine.apply(state, side, { kind: "play", card, from: "hand" }, source).state;
  return passUntil(engine, played, (current) => current.stack.length === 0, source).state;
}
function activate(state: BattleState, side: Side, card: InstanceId): BattleState {
  const source = answers();
  const action = engine.legalActions(state, side).find((candidate) => candidate.kind === "activate" && candidate.source === card);
  if (action === undefined) throw new Error("The movement ability is unavailable");
  const activated = engine.apply(state, side, action, source).state;
  return passUntil(engine, activated, (current) => current.stack.length === 0, source).state;
}
function hidden(active: Side, figment = false) {
  const initial = setup(active, figment);
  let state = play(initial.state, active, initial.ids[active].hand[0], initial.original);
  const returned = state;
  if (!figment) state = play(state, active, initial.ids[active].hand[1], initial.original);
  return { ...initial, returned, state };
}
function mixed(active: Side) {
  const defending = opponent(active);
  const board = boardState(engine.catalog, {
    active, phase: "day", scoreToWin: 100,
    [active]: { front: [null, mover.id, mover.id], back: [challengerAnthem.id], hand: [bounce.id, bounce.id, shuffle.id], deck: [v.vanilla1.id], energy: 20,
      figments: [{ slot: { rank: "front" as const, index: 0 }, printing: { kind: "figment" as const, figment: ZONE_FIGMENT.warrior.id } }] },
    [defending]: { front: [mover.id, mover.id], back: [blockerAnthem.id], deck: [v.vanilla1.id], energy: 20 },
  });
  const designated = passUntil(engine, board.state, at(engine, active, "night")).state;
  const ceased = board.ids[active].front[0]!;
  const concealed = board.ids[active].front[1]!;
  const live = board.ids[active].front[2]!;
  let state = play(designated, active, board.ids[active].hand[0], ceased);
  state = play(state, active, board.ids[active].hand[1], concealed);
  state = play(state, active, board.ids[active].hand[2], concealed);
  state = activate(state, active, live);
  return { state, ceased, concealed, live, blocker: board.ids[defending].front[0]!, secondBlocker: board.ids[defending].front[1]! };
}
function entries(state: BattleState) {
  const owned = (side: Side): BattleInit["decks"][Side] => Object.values(state.instances).flatMap((instance) =>
    instance.owner === side && !instance.status.created && instance.printing.kind === "card"
      ? [{ cardId: instance.printing.cardId, amplified: instance.variant.amplified }] : []);
  return { player: owned("player"), enemy: owned("enemy") };
}
function sampled(state: BattleState, viewer: Side): BattleState {
  return engine.determinize(engine.view(state, viewer), entries(state), () => 0.4);
}
function legacy(state: BattleState): BattleState {
  const { rememberedCards: _memory, ...old } = JSON.parse(serializeState(state)) as BattleState;
  return deserializeState(JSON.stringify(old));
}
function load(state: BattleState) {
  return parseEngineBattleFold({ init: { seed: state.seed, scoreToWin: state.config.scoreToWin, startingSide: state.config.startingSide, decks: { player: [], enemy: [] }, dreamwell: [] },
    slice: { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 } });
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("An intent did not apply");
  return outcome.slice;
}

for (const active of SIDES) describe(`challenge privacy for ${active}`, () => {
  it("preserves the complete identified designation shape and live role characteristics", () => {
    const { state, original, blocker } = setup(active);
    for (const viewer of SIDES) {
      const seen = engine.view(state, viewer);
      expect(seen.challenge).toEqual(state.challenge);
      expect(seen.instances[original].characteristics.spark).toBe(5);
      expect(seen.instances[blocker].characteristics.spark).toBe(7);
    }
  });

  it("keeps a returned card identified while watched and anonymizes its shuffled designation", () => {
    const { state, returned, original } = hidden(active);
    for (const viewer of SIDES) {
      expect(engine.view(returned, viewer).challenge?.challengers).toContain(original);
      const seen = engine.view(state, viewer);
      expect(strings(seen).has(original)).toBe(false);
      expect(seen.challenge?.hidden?.challengers).toHaveLength(1);
      expect(redactionViolations(state, engine.catalog)).toEqual([]);
      expect(comparableView(engine.view(sampled(state, viewer), viewer))).toEqual(comparableView(seen));
    }
    expect(determinizationDivergences(engine, state, entries(state), state.seed, 0)).toEqual([]);
  });

  it("preserves a visible blocker independently of its hidden original challenger", () => {
    const initial = hidden(active);
    const state = activate(initial.state, active, initial.next);
    for (const viewer of SIDES) {
      const restored = sampled(state, viewer);
      expect(engine.view(state, viewer).instances[initial.blocker].characteristics.spark).toBe(7);
      expect(engine.view(restored, viewer).instances[initial.blocker].characteristics.spark).toBe(7);
      expect(engine.legalActions(restored, viewer)).toEqual(engine.legalActions(state, viewer));
    }
  });

  for (const departed of ["legacy", "ceased"] as const) it(`retains actual visible blocking after a ${departed} original association`, () => {
    const initial = hidden(active, departed === "ceased");
    const moved = activate(initial.state, active, initial.next);
    const state = departed === "legacy" ? legacy(moved) : moved;
    expect(load(state)).not.toBeNull();
    for (const viewer of SIDES) {
      const seen = engine.view(state, viewer);
      expect(strings(seen).has(initial.original)).toBe(false);
      expect(seen.challenge?.hidden?.blockers).toContainEqual({ challenger: null, blocker: initial.blocker });
      const restored = sampled(state, viewer);
      expect(restored.challenge?.unpairedBlockers).toEqual([initial.blocker]);
      expect(load(restored)).not.toBeNull();
      expect(engine.view(restored, viewer).instances[initial.blocker].characteristics.spark).toBe(7);
      expect(engine.legalActions(restored, viewer)).toEqual(engine.legalActions(state, viewer));
      expect(comparableView(engine.view(restored, viewer))).toEqual(comparableView(seen));
      const twice = sampled(restored, viewer);
      expect(comparableView(engine.view(twice, viewer))).toEqual(comparableView(seen));
      const actualLanes = engine.apply(state, active, { kind: "pass" }, NO_PROMPTS).events.filter((event) => event.kind === "laneResolved");
      const sampledLanes = engine.apply(restored, active, { kind: "pass" }, NO_PROMPTS).events.filter((event) => event.kind === "laneResolved");
      expect(sampledLanes).toEqual(actualLanes);
      expect(actualLanes).toContainEqual(expect.objectContaining({ challenger: initial.next, blocker: initial.blocker, challengerSpark: 5, blockerSpark: 7, scored: 0 }));
    }
  });

  it("binds both hidden endpoints to their observed members without physical identities", () => {
    const initial = hidden(active);
    const attacked = engine.apply(initial.state, active, { kind: "play", card: initial.ids[active].hand[4], from: "hand" }, NO_PROMPTS).state;
    let state = play(attacked, initial.defending, initial.ids[initial.defending].hand[0], initial.blocker);
    const response = engine.apply(state, active, { kind: "play", card: initial.ids[active].hand[3], from: "hand" }, answers(initial.next)).state;
    // The defender may interrupt before the controller's gain-control event resolves.
    state = play(response, initial.defending, initial.ids[initial.defending].hand[1], initial.blocker);
    for (const viewer of SIDES) {
      const seen = engine.view(state, viewer);
      expect(strings(seen).has(initial.original)).toBe(false);
      expect(strings(seen).has(initial.blocker)).toBe(false);
      const [binding] = seen.challenge?.hidden?.blockers ?? [];
      expect(typeof binding?.challenger).toBe("object");
      expect(typeof binding?.blocker).toBe("object");
      const restored = sampled(state, viewer);
      expect(comparableView(engine.view(restored, viewer))).toEqual(comparableView(seen));
    }
  });

  it("preserves complete mixed paired and unpaired blocker views through repeated JSON sampling", () => {
    const { state, ceased, concealed, live, blocker, secondBlocker } = mixed(active);
    const before = serializeState(state);
    const hash = stateHash(state);
    expect(state.instances[ceased]).toBeUndefined();
    expect(state.instances[concealed].zone).toBe("deck");
    for (const viewer of SIDES) {
      const seen = engine.view(state, viewer);
      expect(strings(seen).has(ceased)).toBe(false);
      expect(strings(seen).has(concealed)).toBe(false);
      expect(seen.challenge?.hidden?.blockers).toHaveLength(2);
      expect(seen.challenge?.hidden?.blockers).toContainEqual({ challenger: null, blocker });
      expect(seen.challenge?.hidden?.blockers).toContainEqual({ challenger: { member: 0 }, blocker: secondBlocker });
      const restored = engine.determinize(JSON.parse(JSON.stringify(seen)) as BattleView, entries(state), () => 0.4);
      expect(comparableView(engine.view(restored, viewer))).toEqual(comparableView(seen));
      expect(comparableView(engine.view(sampled(restored, viewer), viewer))).toEqual(comparableView(seen));
      expect(engine.view(restored, viewer).instances[blocker].characteristics.spark).toBe(7);
      expect(seen.instances[blocker].characteristics.spark).toBe(7);
      expect(engine.legalActions(restored, viewer)).toEqual(engine.legalActions(state, viewer));
      const actualLanes = engine.apply(state, active, { kind: "pass" }, NO_PROMPTS).events.filter((event) => event.kind === "laneResolved");
      const sampledLanes = engine.apply(restored, active, { kind: "pass" }, NO_PROMPTS).events.filter((event) => event.kind === "laneResolved");
      expect(sampledLanes).toEqual(actualLanes);
      expect(actualLanes).toContainEqual(expect.objectContaining({ challenger: live, blocker, challengerSpark: 5, blockerSpark: 7, scored: 0 }));
    }
    expect(redactionViolations(state, engine.catalog)).toEqual([]);
    expect(serializeState(state)).toBe(before);
    expect(stateHash(state)).toBe(hash);
  });

  it("preserves a visible challenger and hidden remembered blocker through repeated JSON sampling", () => {
    const initial = setup(active);
    let state = engine.apply(initial.state, active, { kind: "play", card: initial.ids[active].hand[4], from: "hand" }, NO_PROMPTS).state;
    state = play(state, initial.defending, initial.ids[initial.defending].hand[0], initial.blocker);
    const watched = state;
    state = engine.apply(state, active, { kind: "play", card: initial.ids[active].hand[3], from: "hand" }, answers(initial.next)).state;
    state = play(state, initial.defending, initial.ids[initial.defending].hand[1], initial.blocker);
    const before = serializeState(state);
    for (const viewer of SIDES) {
      expect(engine.view(watched, viewer).challenge).toEqual(watched.challenge);
      const seen = engine.view(state, viewer);
      expect(strings(seen).has(initial.blocker)).toBe(false);
      expect(seen.challenge?.challengers).toContain(initial.original);
      expect(seen.challenge?.hidden?.blockers).toContainEqual({ challenger: initial.original, blocker: { member: 0 } });
      const restored = engine.determinize(JSON.parse(JSON.stringify(seen)) as BattleView, entries(state), () => 0.4);
      expect(comparableView(engine.view(restored, viewer))).toEqual(comparableView(seen));
      expect(comparableView(engine.view(sampled(restored, viewer), viewer))).toEqual(comparableView(seen));
      expect(engine.legalActions(restored, viewer)).toEqual(engine.legalActions(state, viewer));
      expect(seen.instances[initial.original].characteristics.spark).toBe(5);
      const actualLanes = engine.apply(state, active, { kind: "pass" }, NO_PROMPTS).events.filter((event) => event.kind === "laneResolved");
      const sampledLanes = engine.apply(restored, active, { kind: "pass" }, NO_PROMPTS).events.filter((event) => event.kind === "laneResolved");
      expect(sampledLanes).toEqual(actualLanes);
      expect(actualLanes).toContainEqual(expect.objectContaining({ challenger: initial.original, blocker: null, challengerSpark: 5, scored: 5 }));
    }
    expect(redactionViolations(state, engine.catalog)).toEqual([]);
    expect(serializeState(state)).toBe(before);
  });

  it("retains a hidden member's designation when it materializes and moves forward again", () => {
    const initial = hidden(active);
    for (const viewer of SIDES) {
      for (const start of [initial.state, sampled(initial.state, viewer)]) {
        const original = start.challenge!.challengers[0];
        const entered = activate(start, active, initial.ids[active].back[1]!);
        expect(engine.view(entered, viewer).instances[original].characteristics.spark).toBe(2);
        const restored = activate(entered, active, original);
        expect(engine.view(restored, viewer).instances[original].characteristics.spark).toBe(5);
      }
    }
  });

  it("uses current control and front-rank position for restored blocker roles", () => {
    const initial = hidden(active);
    const state = play(initial.state, active, initial.ids[active].hand[3], initial.blocker);
    const moved = activate(state, active, initial.blocker);
    for (const viewer of SIDES) {
      const seen = engine.view(moved, viewer);
      expect(seen.instances[initial.blocker].controller).toBe(active);
      expect(seen.instances[initial.blocker].characteristics.spark).toBe(2);
      expect(engine.view(sampled(moved, viewer), viewer).instances[initial.blocker].characteristics.spark).toBe(2);
    }
  });

  it("clears reconstructed membership at a new designation and at turn end", () => {
    const initial = hidden(active, true);
    const state = sampled(activate(initial.state, active, initial.next), active);
    const dusk = deserializeState(serializeState(state));
    dusk.turn.phase = "dusk";
    const designated = passUntil(engine, dusk, at(engine, active, "night")).state;
    expect(designated.challenge?.unpairedBlockers).toBeUndefined();
    expect(designated.challenge?.blockers).toEqual({ [initial.next]: initial.blocker });
    const later = passUntil(engine, state, at(engine, initial.defending, "day"), NO_PROMPTS, 80).state;
    expect(later.challenge).toBeNull();
    expect(engine.view(later, active).challenge).toBeNull();
  });

  it("keeps snapshot, hashing, JSON transport, reload and different-game observations pure", () => {
    for (const viewer of SIDES) {
      const { state, next } = hidden(active);
      const before = serializeState(state);
      const hash = stateHash(state);
      const seen = engine.view(state, viewer);
      const seenBefore = JSON.stringify(seen);
      const other = engine.view(state, opponent(viewer));
      const otherBefore = JSON.stringify(other);
      const independent = engine.view(deserializeState(before), viewer);
      const independentBefore = JSON.stringify(independent);
      const different = engine.view(hidden(opponent(active)).state, viewer);
      expect(different).not.toEqual(seen);
      expect(different.turn.active).not.toBe(seen.turn.active);
      const transported = JSON.parse(seenBefore) as BattleView;
      expect(comparableView(engine.view(engine.determinize(transported, entries(state), () => 0.4), viewer))).toEqual(comparableView(seen));
      const restored = engine.determinize(seen, entries(state), () => 0.4);
      expect(comparableView(engine.view(restored, viewer))).toEqual(comparableView(seen));
      const sampledBefore = serializeState(restored);
      restored.challenge!.challengers.splice(0);
      restored.instances[next].status.gainedSpark += 1;
      restored.sides[active].hand.splice(0);
      expect(serializeState(restored)).not.toBe(sampledBefore);
      expect(JSON.stringify(seen)).toBe(seenBefore);
      expect(serializeState(state)).toBe(before);
      expect(stateHash(state)).toBe(hash);
      Reflect.set(seen.challenge!.challengers, "length", 0);
      Reflect.set(seen.instances[next].status, "gainedSpark", seen.instances[next].status.gainedSpark + 1);
      expect(JSON.stringify(other)).toBe(otherBefore);
      expect(JSON.stringify(independent)).toBe(independentBefore);
      expect(engine.view(deserializeState(before), viewer)).toEqual(independent);
      expect(serializeState(state)).toBe(before);
      expect(stateHash(state)).toBe(hash);
    }
  });

  it("reveals no hidden-zone position through designation-member bindings", () => {
    const { state } = hidden(active);
    const reordered = deserializeState(serializeState(state));
    reordered.sides[active].deck.reverse();
    expect(stateHash(reordered)).not.toBe(stateHash(state));
    for (const viewer of SIDES) {
      expect(engine.view(reordered, viewer)).toEqual(engine.view(state, viewer));
      expect(stateHash(sampled(reordered, viewer))).toBe(stateHash(sampled(state, viewer)));
    }
  });

  it("publishes private choices through the fold and rejects stale, illegal and cancelled writes", () => {
    const initial = hidden(active);
    const adapter = createFoldAdapter(engine, { checkEventPrefix: true });
    const before = serializeState(initial.returned);
    let slice: BattleSlice = { committed: initial.returned, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opened = adapter.reduce(slice, { kind: "battleAction", side: active, action: { kind: "play", card: initial.ids[active].hand[1], from: "hand" } });
    slice = applied(opened);
    while (adapter.pending(slice) === null) {
      const decision = engine.decision(slice.committed)!;
      slice = applied(adapter.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
    }
    const pending = adapter.pending(slice)!;
    for (const viewer of SIDES) expect(engine.view(pending.display, viewer).challenge?.challengers).toContain(initial.original);
    expect(adapter.reduce(slice, { kind: "cancel", side: active, promptId: pending.prompt.id }).kind).toBe("bounced");
    const answer = { kind: "answer" as const, side: active, promptId: pending.prompt.id, value: [initial.original] };
    expect(adapter.reduce(slice, { ...answer, value: [initial.blocker] }).kind).toBe("bounced");
    const reloaded = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const resumed = createFoldAdapter(engine, { checkEventPrefix: true });
    const done = applied(resumed.reduce(reloaded, answer));
    expect(stateHash(done.committed)).toBe(stateHash(initial.state));
    expect(redactionViolations(done.committed, engine.catalog)).toEqual([]);
    expect(resumed.reduce(done, answer).kind).toBe("bounced");
    expect(serializeState(initial.returned)).toBe(before);
    const committed = serializeState(done.committed);
    expect(() => engine.apply(done.committed, active, { kind: "play", card: initial.original, from: "hand" }, NO_PROMPTS)).toThrow();
    expect(serializeState(done.committed)).toBe(committed);
  });
});

describe("challenge bindings at the public transport boundary", () => {
  const invalid = [
    { challengers: [] },
    { challengers: [{ index: -1, member: 0 }], blockers: [] },
    { challengers: [{ index: 100, member: 0 }], blockers: [] },
    { challengers: [{ index: 0, member: -1 }], blockers: [] },
    { challengers: [{ index: 0, member: 100000 }], blockers: [] },
    { challengers: [{ index: 0, member: 0 }, { index: 0, member: 0 }], blockers: [] },
  ];
  for (const [index, bindings] of invalid.entries()) it(`rejects malformed or partial bindings ${String(index)} without input writes`, () => {
    const { state } = hidden("player");
    const original = engine.view(state, "player");
    const poisoned = JSON.parse(JSON.stringify({ ...original, challenge: { ...original.challenge, hidden: bindings } })) as BattleView;
    const before = JSON.stringify(poisoned);
    expect(() => engine.determinize(poisoned, entries(state), () => 0.4)).toThrow();
    expect(JSON.stringify(poisoned)).toBe(before);
    expect(engine.view(state, "player")).toEqual(original);
  });
  it("rejects duplicate restored blocker memberships and unbound hidden endpoints", () => {
    const { state, blocker } = hidden("player");
    const original = engine.view(state, "player");
    for (const blockers of [[{ challenger: null, blocker }, { challenger: null, blocker }], [{ challenger: null, blocker: { member: 100000 } }]]) {
      const poisoned = JSON.parse(JSON.stringify({ ...original, challenge: { ...original.challenge, hidden: { challengers: [], blockers } } })) as BattleView;
      expect(() => engine.determinize(poisoned, entries(state), () => 0.4)).toThrow();
    }
  });
  it("validates optional sampled membership while accepting ordinary older saves", () => {
    const { state } = setup("player");
    expect(load(state)).not.toBeNull();
    const initial = hidden("player");
    const sample = sampled(legacy(activate(initial.state, "player", initial.next)), "player");
    expect(sample.challenge?.unpairedBlockers).toEqual([initial.blocker]);
    expect(load(sample)).not.toBeNull();
    for (const invalid of [null, "i1", [1], ["not-an-instance"]]) {
      const malformed = JSON.parse(JSON.stringify({ ...sample, challenge: { ...sample.challenge, unpairedBlockers: invalid } })) as BattleState;
      expect(load(malformed)).toBeNull();
    }
  });
});
