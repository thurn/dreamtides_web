import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, abandonSelfCost, activated, event, everyIn, fromVoid, self, target, characterYouControl, keyword } from "../../../dsl/builders";
import { onDissolved, onMaterialized, triggered, whenDissolved, triggeringCard } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, type BoardSetup } from "../../../testing/board";
import { playFromHand } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { eventSeenBy } from "../../../events";
import { resolveEffect } from "../../interpreter";
import { banishCards } from "../banish-cards";
import { gainEnergy } from "../gain-energy";
import { floating } from "../floating-trigger";
import { dissolve } from "../dissolve";
import { view } from "../../../view/view";
import { invariantViolations } from "../../../testing/invariants";
import { SIDES, opponent } from "../../../state/ids";
import { returnFromVoid } from "../return-from-void";
import { deck, v } from "./cards-support";

const fixture = (index: number, type: "event" | "character", abilities: EngineCardDefinition["abilities"]): EngineCardDefinition => ({
  id: syntheticId(0x7900 + index), cardType: type, costs: [], spark: type === "character" ? 1 : null,
  subtype: type === "character" ? "Warrior" : "", speed: "standard", status: "authored", abilities,
});
const recover = fixture(1, "event", () => [event(returnFromVoid(fromVoid({ cardType: "event" })))]);
const optional = fixture(2, "event", () => [event(returnFromVoid(everyIn("void"), { pay: 1 }))]);
const dissolved = fixture(3, "character", () => [activated([abandonSelfCost()], gainEnergy(0)), triggered(onDissolved(), returnFromVoid(self(), { pay: 1 }))]);
const chronicler = fixture(4, "character", () => [triggered(onMaterialized(), returnFromVoid(fromVoid({ cardType: "event" })))]);
const dynamo = fixture(5, "character", () => [activated([abandonCost()], returnFromVoid(fromVoid({ cardType: "character" })))]);
const interrupt: EngineCardDefinition = { ...fixture(6, "event", () => [event(banishCards([everyIn("void", {}, { player: "opponent" })]))]), speed: "interrupt" };
const failing: EngineCardDefinition = {
  ...fixture(7, "event", () => []),
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, returnFromVoid(everyIn("void"), { pay: 1 }), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic failure after void return");
  } },
};
const alreadyReturned = fixture(8, "character", () => [
  activated([abandonSelfCost()], gainEnergy(0)),
  triggered(onDissolved(), returnFromVoid(self())),
  triggered(onDissolved(), returnFromVoid(self(), { pay: 1 })),
]);
// A variable option is accepted structurally by the baseline builder, which ignores the new destination.
const namedOptions = { pay: 1, toYourHand: true } as const;
const farewell = fixture(9, "event", () => [event(floating(whenDissolved(characterYouControl()), returnFromVoid(triggeringCard(), namedOptions)))]);
const kill = fixture(10, "event", () => [event(dissolve(target(characterYouControl())))]);
const foreignRecover = fixture(11, "event", () => [event(returnFromVoid(fromVoid({ cardType: "event" }, { player: "opponent" }), namedOptions))]);
const namedGroup = fixture(12, "event", () => [event(returnFromVoid(everyIn("void", {}, { player: "opponent" }), namedOptions))]);
const namedDissolved = fixture(13, "character", () => [keyword("reclaim"), activated([abandonSelfCost()], gainEnergy(0)), triggered(onDissolved(), returnFromVoid(self(), namedOptions))]);
const namedFailing: EngineCardDefinition = {
  ...fixture(14, "event", () => []),
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, returnFromVoid(everyIn("void", {}, { player: "opponent" }), namedOptions), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic failure after named-hand return");
  } },
};
const engine = createEngine(testCatalog([recover, optional, dissolved, chronicler, dynamo, interrupt, failing, alreadyReturned, farewell, kill, foreignRecover, namedGroup, namedDissolved, namedFailing]));
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (prompt: Prompt) => Answer) {}
  answer(prompt: Prompt): Answer { this.prompts.push(prompt); return this.pick(prompt); }
}
const setup = (card: EngineCardDefinition, extra: NonNullable<BoardSetup["player"]> = {}): BoardSetup => ({
  active: "player", phase: "day", player: { hand: [card.id], deck, ...extra }, enemy: { deck },
});
const play = (board: BoardSetup, source: AnswerSource) => {
  const { state: start, ids } = boardState(engine.catalog, board);
  const played = engine.apply(start, "player", playFromHand(ids, "player").action, source);
  const rest = passUntil(engine, played.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0, source);
  return { start, ids, state: rest.state, events: [...played.events, ...rest.events] };
};
const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected applied intent without error");
  return outcome.slice;
};

describe("returnFromVoid", () => {
  it("rejects invalid optional payments", () => {
    for (const pay of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => returnFromVoid(self(), { pay })).toThrow();
  });

  it("targets only matching void cards and returns the physical card publicly without drawing", () => {
    const source = new Answers((prompt) => {
      if (prompt.kind !== "chooseTargets") throw new Error("expected target");
      return [prompt.candidates[1]];
    });
    const result = play(setup(recover, { void: [v.vanilla1.id, v.event0.id, v.event0.id] }), source);
    const [character, first, chosen] = result.ids.player.void;
    expect(source.prompts).toHaveLength(1);
    expect(source.prompts[0]).toMatchObject({ kind: "chooseTargets", candidates: [first, chosen] });
    expect(result.state.sides.player.hand).toEqual([chosen]);
    expect(result.state.sides.player.void).toEqual([result.ids.player.hand[0], character, first]);
    expect(result.events).toContainEqual({ kind: "leftVoid", instance: chosen, side: "player", to: "hand" });
    const returned = { kind: "returnedToHand", instance: chosen, side: "player" } as const;
    expect(result.events).toContainEqual(returned);
    for (const side of ["player", "enemy"] as const) expect(eventSeenBy(returned, side, result.state)).toEqual(returned);
    expect(result.events.filter((event) => event.kind === "cardDrawn")).toEqual([]);
    expect(unannouncedChanges(result.events, result.start, result.state)).toEqual([]);
  });

  it("makes materialized void choices at resolution and does nothing when no event is eligible", () => {
    const source = new Answers((prompt) => prompt.kind === "chooseTargets" ? [prompt.candidates[0]] : false);
    const returned = play(setup(chronicler, { void: [v.event0.id, v.event1.id] }), source);
    expect(source.prompts).toHaveLength(1);
    expect(source.prompts[0]).toMatchObject({ kind: "chooseTargets", cancellable: false });
    expect(returned.state.sides.player.hand).toEqual([returned.ids.player.void[0]]);
    const empty = play(setup(chronicler, { void: [v.vanilla1.id] }), NO_PROMPTS);
    expect(empty.state.sides.player.void).toEqual(empty.ids.player.void);
    expect(empty.events.filter((event) => event.kind === "returnedToHand")).toEqual([]);
  });

  it("pays once for the complete return, declines without spending, and disables unaffordable acceptance", () => {
    for (const [energy, accept] of [[2, true], [2, false], [0, false]] as const) {
      const source = new Answers(() => accept);
      const result = play(setup(optional, { energy, void: [v.event0.id, v.vanilla1.id] }), source);
      expect(source.prompts).toHaveLength(energy >= 1 ? 1 : 0);
      if (energy >= 1) expect(source.prompts[0]).toMatchObject({ kind: "payOrDecline", energy: 1, payable: energy >= 1, purpose: { role: "optionalPayment" } });
      expect(result.state.sides.player.currentEnergy).toBe(energy - (accept ? 1 : 0));
      expect(result.state.sides.player.hand).toEqual(accept ? result.ids.player.void : []);
      expect(result.events.filter((event) => event.kind === "returnedToHand")).toHaveLength(accept ? 2 : 0);
    }
    const source = new Answers(() => true);
    play(setup(optional), source);
    expect(source.prompts).toEqual([]);
  });

  it("does not return a void target that an actual interrupt banishes before resolution", () => {
    const { state: start, ids } = boardState(engine.catalog, { ...setup(recover, { void: [v.event0.id] }), enemy: { hand: [interrupt.id], deck } });
    const played = engine.apply(start, "player", playFromHand(ids, "player").action, new ScriptedSource([[ids.player.void[0]]]));
    const response = engine.apply(played.state, "enemy", playFromHand(ids, "enemy").action, NO_PROMPTS);
    const rest = passUntil(engine, response.state, (state) => state.stack.length === 0);
    expect(rest.state.sides.player.hand).toEqual([]);
    expect(rest.state.sides.player.banished).toEqual(ids.player.void);
    expect([...response.events, ...rest.events]).toContainEqual({ kind: "noLegalTarget", source: ids.player.hand[0] });
    expect(rest.events.filter((event) => event.kind === "returnedToHand")).toEqual([]);
  });

  it("chooses a void target before abandonment and permits abandoning the activating source", () => {
    const { state: start, ids } = boardState(engine.catalog, setup(dynamo, { hand: [], back: [dynamo.id, v.vanilla2.id], void: [v.vanilla1.id, v.vanilla3.id], energy: 0 }));
    const source = new ScriptedSource([[ids.player.void[0]], [ids.player.back[0]!]]);
    const activated = engine.apply(start, "player", { kind: "activate", source: ids.player.back[0]!, ability: 0 }, source);
    const rest = passUntil(engine, activated.state, (state) => state.stack.length === 0, source);
    source.assertExhausted();
    expect(rest.state.sides.player.hand).toEqual([ids.player.void[0]]);
    expect(rest.state.sides.player.void).toEqual([ids.player.back[0], ids.player.void[1]]);
    const empty = boardState(engine.catalog, setup(dynamo, { hand: [], back: [dynamo.id] }));
    expect(engine.legalActions(empty.state, "player").filter((action) => action.kind === "activate")).toEqual([]);
  });

  it("uses the last controller's payment while returning a stolen dissolved source to its owner", () => {
    const { state: start, ids } = boardState(engine.catalog, setup(dissolved, { hand: [], back: [dissolved.id], energy: 2 }));
    const id = ids.player.back[0]!;
    start.instances[id] = { ...start.instances[id], owner: "enemy" };
    const source = new Answers(() => true);
    const result = engine.apply(start, "player", { kind: "activate", source: id, ability: 0 }, source);
    const rest = passUntil(engine, result.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0, source);
    expect(source.prompts).toHaveLength(1);
    expect(source.prompts[0]).toMatchObject({ side: "player", purpose: { source: id, role: "optionalPayment" } });
    expect(rest.state.sides.enemy.hand).toEqual([id]);
    expect(rest.state.sides.player.hand).toEqual([]);
    expect(rest.state.sides.player.currentEnergy).toBe(1);
    expect(rest.state.sides.enemy.currentEnergy).toBe(0);
  });

  it("does not charge again when an earlier Dissolved trigger already returned the still-existing source", () => {
    const { state: start, ids } = boardState(engine.catalog, setup(alreadyReturned, { hand: [], back: [alreadyReturned.id], energy: 2 }));
    const id = ids.player.back[0]!;
    const result = engine.apply(start, "player", { kind: "activate", source: id, ability: 0 }, NO_PROMPTS);
    const rest = passUntil(engine, result.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0);
    expect(rest.state.sides.player.hand).toEqual([id]);
    expect(rest.state.sides.player.currentEnergy).toBe(2);
    expect([...result.events, ...rest.events].filter((event) => event.kind === "returnedToHand")).toEqual([
      { kind: "returnedToHand", instance: id, side: "player" },
    ]);
  });

  it("asks no payment for a dissolved created source that ceased to exist", () => {
    const { state: start, ids } = boardState(engine.catalog, setup(dissolved, { hand: [], back: [dissolved.id], energy: 2 }));
    const id = ids.player.back[0]!;
    start.instances[id].status.created = true;
    const result = engine.apply(start, "player", { kind: "activate", source: id, ability: 0 }, NO_PROMPTS);
    const rest = passUntil(engine, result.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0);
    expect(rest.state.instances[id]).toBeUndefined();
    expect(rest.state.sides.player.currentEnergy).toBe(2);
    expect([...result.events, ...rest.events]).toContainEqual(expect.objectContaining({ kind: "ceasedToExist", instance: id }));
    expect(rest.events.filter((event) => event.kind === "returnedToHand")).toEqual([]);
  });
});

describe("returnFromVoid fold recovery", () => {
  const open = (card = optional) => {
    const adapter = createFoldAdapter(engine, { checkEventPrefix: true });
    const foreign = card === namedGroup || card === namedFailing;
    const { state, ids } = boardState(engine.catalog, foreign ? { ...setup(card, { energy: 2 }), enemy: { void: [v.event0.id], deck } } : setup(card, { energy: 2, void: [v.event0.id] }));
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    return { adapter, state, ids, start, pending: applied(adapter.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action })) };
  };
  it("reloads an unpaid return, rejects invalid, foreign, stale and concurrent input, and commits exactly once", () => {
    for (const card of [optional, namedGroup]) {
    const { adapter, ids, pending } = open(card);
    const owner = card === namedGroup ? "enemy" : "player";
    const expected = ids[owner].void;
    expect(pending.committed.sides.player.hand).toEqual([]);
    expect(pending.committed.sides[owner].void).toEqual(expected);
    expect(pending.committed.sides.player.currentEnergy).toBe(2);
    const reloaded = JSON.parse(JSON.stringify(pending)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const prompt = fresh.pending(reloaded)!.prompt;
    expect(prompt).toEqual(adapter.pending(pending)!.prompt);
    const answer = { kind: "answer", side: "player", promptId: prompt.id, value: true } as const;
    expect(fresh.reduce(reloaded, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce({ ...reloaded, attempt: reloaded.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(reloaded, { ...answer, value: 1 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(reloaded, { kind: "cancel", side: "player", promptId: prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(reloaded.committed).toEqual(pending.committed);
    const outcome = fresh.reduce(reloaded, answer);
    const done = applied(outcome);
    expect(done.committed.sides.player.hand).toEqual(expected);
    expect(done.committed.sides.player.currentEnergy).toBe(1);
    expect(done.inFlight).toBeNull();
    expect(fresh.reduce(done, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(stateHash(applied(adapter.reduce(pending, answer)).committed)).toBe(stateHash(done.committed));
    }
  });
  it("rolls back both payment and returned cards if the same step throws afterwards", () => {
    for (const card of [failing, namedFailing]) {
    const { adapter, pending } = open(card);
    const prompt = adapter.pending(pending)!.prompt;
    const outcome = adapter.reduce(pending, { kind: "answer", side: "player", promptId: prompt.id, value: true });
    if (outcome.kind !== "applied") throw new Error("expected applied error");
    expect(outcome.error).not.toBeNull();
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.committed).toEqual(pending.committed);
    expect(outcome.slice.inFlight).toBeNull();
    }
  });
});


describe("returnFromVoid named hand", () => {
  for (const side of SIDES) it(`uses the captured ${side} floating-trigger controller after a foreign-owned character dissolves`, () => {
    const owner = opponent(side);
    const { state: start, ids } = boardState(engine.catalog, {
      active: side, phase: "day", [side]: { hand: [farewell.id, kill.id], back: [v.vanilla1.id], energy: 2, deck }, [owner]: { deck },
    });
    const subject = ids[side].back[0]!;
    start.instances[subject] = { ...start.instances[subject], owner };
    const granted = engine.apply(start, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const ready = passUntil(engine, granted.state, (state) => state.stack.length === 0);
    expect(ready.state.instances[ids[side].hand[0]].zone).toBe("void");
    const paid = new Answers((prompt) => prompt.kind === "chooseTargets" ? [subject] : true);
    const played = engine.apply(ready.state, side, { kind: "play", card: ids[side].hand[1], from: "hand" }, paid);
    const returned = passUntil(engine, played.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0, paid);
    expect(paid.prompts.find((prompt) => prompt.kind === "payOrDecline")).toMatchObject({ side, purpose: { source: ids[side].hand[0], role: "optionalPayment" } });
    expect(returned.state.sides[side].currentEnergy).toBe(1);
    expect(returned.state.sides[owner].currentEnergy).toBe(0);
    expect(returned.state.sides[side].hand).toContain(subject);
    expect(returned.state.sides[owner].hand).not.toContain(subject);
    expect(returned.state.instances[subject]).toMatchObject({ owner, controller: side, zone: "hand" });
    const events = [...played.events, ...returned.events];
    const announcement = { kind: "returnedToHand", instance: subject, side } as const;
    expect(events).toContainEqual({ kind: "dissolved", instance: subject, side });
    expect(events).toContainEqual(announcement);
    for (const viewer of SIDES) {
      expect(eventSeenBy(announcement, viewer, returned.state)).toEqual(announcement);
      const seen = view(returned.state, viewer, engine.catalog);
      expect(seen.sides[side].hand.count).toBe(returned.state.sides[side].hand.length);
      expect(seen.sides[side].hand.known.map((card) => card.id)).toContain(subject);
      expect(seen.instances[subject].printing).toEqual(start.instances[subject].printing);
    }
    expect(unannouncedChanges(events, ready.state, returned.state)).toEqual([]);
    expect(invariantViolations(returned.state, engine.catalog)).toEqual([]);
  });

  it("keeps ownership when returning an opponent's event, whose later normal resolution goes to its owner", () => {
    const result = play({ ...setup(foreignRecover, { energy: 2 }), enemy: { void: [v.event0.id], deck } }, new Answers((prompt) => prompt.kind === "chooseTargets" ? [prompt.candidates[0]] : true));
    const subject = result.ids.enemy.void[0];
    expect(result.state.sides.player.hand).toContain(subject);
    expect(result.state.instances[subject]).toMatchObject({ owner: "enemy", controller: "player", zone: "hand" });
    const played = engine.apply(result.state, "player", { kind: "play", card: subject, from: "hand" }, NO_PROMPTS);
    const resolved = passUntil(engine, played.state, (state) => state.stack.length === 0);
    expect(resolved.state.sides.enemy.void).toContain(subject);
    expect(resolved.state.sides.player.void).not.toContain(subject);
    expect(invariantViolations(resolved.state, engine.catalog)).toEqual([]);
  });

  it("preserves one payment for a foreign group, declines and unaffordability, and skips an empty group", () => {
    for (const [energy, accept] of [[2, true], [2, false], [0, false]] as const) {
      const result = play({ ...setup(namedGroup, { energy }), enemy: { void: [v.event0.id, v.vanilla1.id], deck } }, new Answers(() => accept));
      expect(result.state.sides.player.currentEnergy).toBe(energy - (accept ? 1 : 0));
      expect(result.state.sides.player.hand).toEqual(accept ? result.ids.enemy.void : []);
      expect(result.state.sides.enemy.void).toEqual(accept ? [] : result.ids.enemy.void);
      expect(result.events.filter((e) => e.kind === "returnedToHand")).toEqual(accept ? result.ids.enemy.void.map((instance) => ({ kind: "returnedToHand", instance, side: "player" })) : []);
    }
    const answers = new Answers(() => true);
    play(setup(namedGroup), answers);
    expect(answers.prompts).toEqual([]);
  });

  it("does not recover a created source that ceased or a genuinely reclaimed source that was banished instead of dissolved", () => {
    const created = boardState(engine.catalog, setup(namedDissolved, { hand: [], back: [namedDissolved.id], energy: 2 }));
    const id = created.ids.player.back[0]!;
    created.state.instances[id].status.created = true;
    const gone = engine.apply(created.state, "player", { kind: "activate", source: id, ability: 1 }, NO_PROMPTS);
    const ceased = passUntil(engine, gone.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0);
    expect(ceased.state.instances[id]).toBeUndefined();
    expect(ceased.state.sides.player.currentEnergy).toBe(2);
    const reclaimed = boardState(engine.catalog, setup(namedDissolved, { hand: [], void: [namedDissolved.id], energy: 2 }));
    const r = reclaimed.ids.player.void[0];
    const played = engine.apply(reclaimed.state, "player", { kind: "play", card: r, from: "void" }, NO_PROMPTS);
    const ready = passUntil(engine, played.state, (state) => state.stack.length === 0);
    const abandoned = engine.apply(ready.state, "player", { kind: "activate", source: r, ability: 1 }, NO_PROMPTS);
    const banished = passUntil(engine, abandoned.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0);
    expect(banished.state.sides.player.banished).toContain(r);
    expect(banished.state.sides.player.hand).not.toContain(r);
    expect(banished.events.filter((e) => e.kind === "returnedToHand")).toEqual([]);
    expect(banished.state.sides.player.currentEnergy).toBe(2);
  });
});
