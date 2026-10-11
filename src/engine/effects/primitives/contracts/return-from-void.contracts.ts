import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, abandonSelfCost, activated, event, everyIn, fromVoid, self } from "../../../dsl/builders";
import { onDissolved, onMaterialized, triggered } from "../../../dsl/triggers";
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
const engine = createEngine(testCatalog([recover, optional, dissolved, chronicler, dynamo, interrupt, failing, alreadyReturned]));
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
    const { state, ids } = boardState(engine.catalog, setup(card, { energy: 2, void: [v.event0.id] }));
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    return { adapter, state, ids, start, pending: applied(adapter.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action })) };
  };
  it("reloads an unpaid return, rejects invalid, foreign, stale and concurrent input, and commits exactly once", () => {
    const { adapter, ids, pending } = open();
    expect(pending.committed.sides.player.hand).toEqual([]);
    expect(pending.committed.sides.player.void).toEqual(ids.player.void);
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
    expect(done.committed.sides.player.hand).toEqual(ids.player.void);
    expect(done.committed.sides.player.currentEnergy).toBe(1);
    expect(done.inFlight).toBeNull();
    expect(fresh.reduce(done, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(stateHash(applied(adapter.reduce(pending, answer)).committed)).toBe(stateHash(done.committed));
  });
  it("rolls back both payment and returned cards if the same step throws afterwards", () => {
    const { adapter, pending } = open(failing);
    const prompt = adapter.pending(pending)!.prompt;
    const outcome = adapter.reduce(pending, { kind: "answer", side: "player", promptId: prompt.id, value: true });
    if (outcome.kind !== "applied") throw new Error("expected applied error");
    expect(outcome.error).not.toBeNull();
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.committed).toEqual(pending.committed);
    expect(outcome.slice.inFlight).toBeNull();
  });
});
