/** Provisional unregistered Aspects consumed as permanent emblems with synthetic cards. */
import { describe, expect, it } from "vitest";
import { dawnRecoveryAspectAbilities } from "../../../content/apollyon/aspects/aspect-57c65dfd-a125-440e-a410-c8c4a314b1d1";
import { warriorAnthemAspectAbilities } from "../../../content/apollyon/aspects/aspect-80b6296d-840e-4ed7-b684-5aadc0981bf4";
import type { EngineAvatarDefinition, EngineCardDefinition } from "../../../engine/catalog";
import { characterYouControl, energy, event, target } from "../../../engine/dsl/builders";
import { NO_DECK_MODS } from "../../../engine/dsl/types";
import { createEngine } from "../../../engine/engine";
import { resolveEffect } from "../../../engine/effects/interpreter";
import { gainPoints } from "../../../engine/effects/primitives/gain-points";
import { instanceOrigin } from "../../../engine/rules/activation";
import { instanceOf } from "../../../engine/rules/zones";
import { dissolve } from "../../../engine/effects/primitives/dissolve";
import { giveAllTypes } from "../../../engine/effects/primitives/give-all-types";
import { returnToHand } from "../../../engine/effects/primitives/return-to-hand";
import { eventSeenBy, type EngineEvent } from "../../../engine/events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../engine/fold/slice";
import type { Answer } from "../../../engine/prompts/types";
import { deserializeState, serializeState, stateHash } from "../../../engine/state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../../engine/state/ids";
import type { BattleState } from "../../../engine/state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../engine/steps/sources";
import { boardState, type SideSetup } from "../../../engine/testing/board";
import { invariantViolations } from "../../../engine/testing/invariants";
import { syntheticId, testCatalog } from "../../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../../engine/testing/trigger-harness";
import { parseAvatarId, parsePromptId } from "../../../types/identifiers";

const aspects = {
  dawn: { id: parseAvatarId("e4261c6a-af79-4b94-adbb-91e69b9de0dc"), status: "authored", abilities: dawnRecoveryAspectAbilities },
  warrior: { id: parseAvatarId("61ade662-2bfe-474a-860c-5f8aa586babc"), status: "authored", abilities: warriorAnthemAspectAbilities },
} as const satisfies Record<string, EngineAvatarDefinition>;
function card(index: number, cardType: "character" | "event", cost: number, abilities: EngineCardDefinition["abilities"], extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return { id: syntheticId(0x64100 + index), cardType, costs: [energy(cost)], spark: cardType === "character" ? 2 : null,
    subtype: cardType === "character" ? "Warrior" : "", speed: "standard", status: "authored", abilities, ...extra };
}
const cards = {
  warrior: card(0, "character", 0, () => [], { status: "vanilla" }),
  mage: card(1, "character", 2, () => [], { subtype: "Mage", status: "vanilla" }),
  expensive: card(2, "character", 3, () => [], { status: "vanilla" }),
  plainEvent: card(3, "event", 1, () => [], { status: "vanilla" }),
  dissolve: card(4, "event", 0, () => [event(dissolve(target(characterYouControl())))]),
  types: card(5, "event", 0, () => [event(giveAllTypes(target(characterYouControl()), "untilEndOfTurn"))]),
  return: card(6, "event", 0, () => [event(returnToHand(target(characterYouControl())))]),
  fault: card(7, "event", 0, () => [], { synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, gainPoints(1), { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
    throw new Error("synthetic later resolution fault");
  } } }),
  cheap: card(8, "character", 1, () => [], { status: "vanilla" }),
} as const;
const E = createEngine(testCatalog(Object.values(cards), { avatars: Object.values(aspects) }));
const deck = Array.from({ length: 8 }, () => cards.warrior.id);
function setup(kind: keyof typeof aspects, side: Side, own: SideSetup, other: SideSetup = {}, active = side) {
  return boardState(E.catalog, { active, phase: "day", scoreToWin: 100,
    [side]: { avatar: aspects[kind].id, energy: 10, deck, ...own }, [opponent(side)]: { energy: 10, deck, ...other } });
}
function play(state: BattleState, side: Side, instance: InstanceId, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const start = E.apply(state, side, { kind: "play", card: instance, from: "hand" }, source);
  const rest = passUntil(E, start.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  source.assertExhausted();
  expect(invariantViolations(rest.state, E.catalog)).toEqual([]);
  return { state: rest.state, events: [...start.events, ...rest.events] };
}
const queues = (events: readonly EngineEvent[], side: Side) => events.filter(entry => entry.kind === "triggerQueued" && entry.controller === side && typeof entry.source === "object" && entry.source?.kind === "avatar");
const day = (state: BattleState, side: Side) => passUntil(E, state, at(E, side, "day"), NO_PROMPTS, 100);
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Expected applied intent: ${JSON.stringify(outcome)}`);
  return outcome;
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function foldDay(start: BattleSlice, side: Side) {
  const fold = createFoldAdapter(E);
  let current = start;
  const events: EngineEvent[] = [];
  const observed: BattleState[] = [];
  for (let count = 0; !at(E, side, "day")(current.committed); count++) {
    const decision = E.decision(current.committed);
    if (decision === null || count >= 100) throw new Error("Missing pass decision");
    const result = applied(fold.reduce(current, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }, { presented: () => true, limit: 256 }));
    for (const entry of result.published) {
      const state = fold.observed(entry);
      if (state === undefined) throw new Error("Missing published state");
      observed.push(state);
    }
    events.push(...result.published);
    current = result.slice;
    expect(current.inFlight).toBeNull();
  }
  return { fold, slice: current, events, observed };
}

for (const side of SIDES) describe(`${side} pair-291 permanent Aspects`, () => {
  const other = opponent(side);
  it("returns one eligible own physical card on own Dawn, with reproducible isolated RNG and public provenance", () => {
    const f = setup("dawn", side, { void: [cards.mage.id, cards.cheap.id, cards.expensive.id, cards.plainEvent.id] }, { void: [cards.warrior.id] }, other);
    const run = day(f.state, side);
    const returned = run.events.filter(entry => entry.kind === "returnedToHand");
    expect(returned).toHaveLength(1);
    const id = returned[0].instance;
    expect(f.ids[side].void.slice(0, 2)).toContain(id);
    expect(run.state.sides[side].void).toEqual(f.ids[side].void.filter(item => item !== id));
    expect(run.state.sides[other].void).toEqual(f.ids[other].void);
    const queued = queues(run.events, side);
    expect(queued).toEqual([expect.objectContaining({ source: { kind: "avatar", side }, subject: null })]);
    expect(run.state.rng).toEqual({ ...f.state.rng, "random:selection": (f.state.rng["random:selection"] ?? 0) + 1 });
    const replay = day(deserializeState(serializeState(f.state)), side);
    expect({ hash: stateHash(replay.state), events: replay.events }).toEqual({ hash: stateHash(run.state), events: run.events });
    for (const viewer of SIDES) {
      expect(E.view(run.state, viewer).sides[side].avatar?.id).toBe(aspects.dawn.id);
      expect(E.view(run.state, viewer).instances[id]?.printing).toMatchObject({ kind: "card" });
      for (const entry of [...queued, ...returned]) expect(eventSeenBy(entry, viewer, run.state)).toEqual(entry);
    }
    const opposing = day(run.state, other);
    expect(queues(opposing.events, side)).toEqual([]);
    expect(opposing.events.filter(entry => entry.kind === "returnedToHand")).toEqual([]);
    expect(opposing.state.rng).toEqual(run.state.rng);
  });

  it("handles empty or ineligible voids without a random draw and returns through a full battlefield", () => {
    for (const voidCards of [[], [cards.expensive.id, cards.plainEvent.id]]) {
      const f = setup("dawn", side, { void: voidCards }, { void: [cards.warrior.id] }, other);
      const run = day(f.state, side);
      expect(queues(run.events, side)).toHaveLength(1);
      expect(run.events.filter(entry => entry.kind === "returnedToHand")).toEqual([]);
      expect(run.state.rng).toEqual(f.state.rng);
      expect(run.state.sides[side].void).toEqual(f.ids[side].void);
    }
    const f = setup("dawn", side, { back: Array.from({ length: 10 }, () => cards.warrior.id), void: [cards.mage.id] }, {}, other);
    const run = day(f.state, side);
    expect(run.state.instances[f.ids[side].void[0]].zone).toBe("hand");
    expect(run.state.sides[side].backRank).toEqual(f.state.sides[side].backRank);
    expect(run.events.filter(entry => entry.kind === "capacityReached")).toEqual([]);
  });

  it("selects effective types and copiable reduced costs after actual plays and departures", () => {
    for (const candidate of [
      { cardId: cards.expensive.id, deckMods: { ...NO_DECK_MODS, costReduction: 1 } },
      { cardId: cards.plainEvent.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character" as const, subtype: "Warrior" as const } } },
    ]) {
      const f = setup("dawn", side, { hand: [candidate, cards.dissolve.id, { cardId: cards.warrior.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "" } } }] });
      const entered = play(f.state, side, f.ids[side].hand[0]);
      const left = play(entered.state, side, f.ids[side].hand[1]);
      const excluded = play(left.state, side, f.ids[side].hand[2]);
      const opposing = day(excluded.state, other);
      const run = day(opposing.state, side);
      expect(run.events.filter(entry => entry.kind === "returnedToHand")).toEqual([{ kind: "returnedToHand", instance: f.ids[side].hand[0], side }]);
      expect(run.state.instances[f.ids[side].hand[2]].zone).toBe("void");
    }
  });

  it("continuously gives only controlled Warriors spark through actual entry, departure and replay", () => {
    const f = setup("warrior", side, { back: [cards.warrior.id, cards.mage.id], hand: [cards.warrior.id, cards.return.id] }, { back: [cards.warrior.id] });
    const mine = f.ids[side].back[0]!;
    const mage = f.ids[side].back[1]!;
    const enemy = f.ids[other].back[0]!;
    for (const viewer of SIDES) {
      const view = E.view(f.state, viewer);
      expect(view.sides[side].avatar?.id).toBe(aspects.warrior.id);
      expect([view.instances[mine].characteristics.spark, view.instances[mage].characteristics.spark, view.instances[enemy].characteristics.spark]).toEqual([3, 2, 2]);
    }
    const id = f.ids[side].hand[0];
    const entered = play(f.state, side, id);
    expect(E.view(entered.state, side).instances[id].characteristics.spark).toBe(3);
    expect(entered.state.instances[id].status.gainedSpark).toBe(0);
    expect(entered.events.filter(entry => entry.kind === "sparkGained")).toEqual([]);
    const left = play(entered.state, side, f.ids[side].hand[1], [[id]]);
    expect(E.view(left.state, side).instances[id].characteristics.spark).toBe(2);
    const replay = play(left.state, side, id);
    expect(E.view(replay.state, side).instances[id].characteristics.spark).toBe(3);
    const loaded = deserializeState(serializeState(replay.state));
    for (const viewer of SIDES) expect(E.view(loaded, viewer)).toEqual(E.view(replay.state, viewer));
  });

  it("reads effective Warrior membership live and stops the bonus when the type effect expires", () => {
    const f = setup("warrior", side, { back: [cards.mage.id], hand: [cards.types.id] }, { back: [cards.mage.id] });
    const mine = f.ids[side].back[0]!;
    const enemy = f.ids[other].back[0]!;
    const changed = play(f.state, side, f.ids[side].hand[0]);
    for (const viewer of SIDES) {
      expect(E.view(changed.state, viewer).instances[mine].characteristics).toMatchObject({ allTypes: true, spark: 3 });
      expect(E.view(changed.state, viewer).instances[enemy].characteristics.spark).toBe(2);
    }
    const expired = day(changed.state, other);
    expect(E.view(expired.state, side).instances[mine].characteristics).toMatchObject({ allTypes: false, spark: 2 });
  });

  it("commits a prompt-free Dawn in the fold, preserves observation and rejects absent-prompt and foreign intents", () => {
    const f = setup("dawn", side, { void: [cards.mage.id, cards.cheap.id], hand: [cards.plainEvent.id] }, {}, other);
    const run = foldDay(slice(f.state), side);
    const replay = foldDay(slice(deserializeState(serializeState(f.state))), side);
    expect({ hash: stateHash(run.slice.committed), events: run.events }).toEqual({ hash: stateHash(replay.slice.committed), events: replay.events });
    expect(run.events.filter(entry => entry.kind === "returnedToHand")).toHaveLength(1);
    const returned = run.events.find(entry => entry.kind === "returnedToHand");
    if (returned?.kind !== "returnedToHand") throw new Error("Missing return");
    expect(run.observed.some(state => state.instances[returned.instance].zone === "hand")).toBe(true);
    const hidden = f.ids[side].hand[0];
    expect(E.view(run.slice.committed, other).instances[hidden]).toBeUndefined();
    const before = stateHash(run.slice.committed);
    const promptId = parsePromptId("999999:0:0");
    for (const actor of SIDES) {
      expect(run.fold.reduce(run.slice, { kind: "cancel", side: actor, promptId })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
      expect(run.fold.reduce(run.slice, { kind: "answer", side: actor, promptId, value: [] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    }
    expect(run.fold.reduce(run.slice, { kind: "battleAction", side: other, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "notYourDecision" });
    expect(stateHash(run.slice.committed)).toBe(before);
    expect(invariantViolations(run.slice.committed, E.catalog)).toEqual([]);
  });

  it("preserves an already committed Dawn return when a later real played effect fails", () => {
    const f = setup("dawn", side, { void: [cards.mage.id], hand: [cards.fault.id] }, {}, other);
    const run = foldDay(slice(f.state), side);
    const fault = run.fold.reduce(run.slice, { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[0], from: "hand" } });
    if (fault.kind !== "applied" || fault.error === null) throw new Error("Expected later effect failure");
    expect(fault.error?.kind).toBe("engine_error");
    expect(fault.slice.inFlight).toBeNull();
    expect(fault.slice.committed.instances[f.ids[side].void[0]].zone).toBe("hand");
    expect(fault.slice.committed.stack).toEqual([expect.objectContaining({ kind: "card", instance: f.ids[side].hand[0], controller: side })]);
    expect(fault.slice.committed.sides[side].score).toBe(0);
    expect(fault.published.filter(entry => entry.kind === "pointsScored")).toEqual([]);
    expect(fault.published.filter(entry => entry.kind === "returnedToHand")).toEqual([]);
    expect(stateHash(deserializeState(serializeState(fault.slice.committed)))).toBe(stateHash(fault.slice.committed));
    expect(invariantViolations(fault.slice.committed, E.catalog)).toEqual([]);
  });
});
