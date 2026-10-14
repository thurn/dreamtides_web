/** Public source-counter reads and variable payments, with synthetic physical sources. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonSelfCost, abandonXCost, activated, choiceCost, countersCost, countersXCost, discardCostFilter, discardHandCost, energy, energyX, enemyCharacter, event, everyIn, optionalCost, returnCost, storedCounters, target, x } from "../../../dsl/builders";
import type { Cost } from "../../../dsl/types";
import { whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import { payCosts, planCosts } from "../../../rules/costs";
import { stateHash, serializeState, deserializeState } from "../../../state/hash";
import { opponent, SIDES, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { unannouncedChanges } from "../../../testing/announced-changes";
import type { Effect } from "../../registry";
import { draw } from "../draw";
import { delayed } from "../floating-trigger";
import { materialize } from "../materialize";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";
import { gainEnergy } from "../gain-energy";
import { optional } from "../optional";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";
import { storeCounters } from "../store-counters";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";

const deck = Array.from({ length: 16 }, () => v.vanilla1.id);
const exact = target(enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() }));
const response: EngineCardDefinition = { ...v.interruptEvent, id: syntheticId(0x950ff), costs: [energy(0)], status: "authored",
  abilities: () => [event(returnToHand(target(enemyCharacter())))] };
const reenterResponse: EngineCardDefinition = { ...v.interruptEvent, id: syntheticId(0x950fe), costs: [energy(0)], status: "authored",
  abilities: () => [event(materialize(everyIn("void", {}, { player: "opponent" })))] };
function definition(costs: readonly Cost[], effect: Effect): EngineCardDefinition {
  return { ...v.vanilla1, id: syntheticId(0x95000), status: "authored", abilities: () => [activated(costs, effect)] };
}
function fixture(side: Side, costs: readonly Cost[] = [countersXCost(0)], effect: Effect = dissolve(exact), count = 4, responseCard = response) {
  const card = definition(costs, effect);
  const engine = createEngine(testCatalog([card, responseCard]));
  const other = opponent(side);
  const { state: placed, ids } = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { back: [card.id, card.id], hand: [v.event1.id, v.vanilla2.id], energy: 5, deck },
    [other]: { back: [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], hand: [responseCard.id], energy: 5, deck },
  });
  const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
  const source = ids[side].back[0]!;
  state.instances[source].status.counters = count;
  state.instances[ids[side].back[1]!].status.counters = 7;
  state.instances[source].status.x = 3;
  const action = { kind: "activate", source, ability: 0 } as const;
  return { card, responseCard, engine, state, ids, side, other, source, action };
}
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private next = 0;
  constructor(private readonly values: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const value = this.values[this.next++];
    if (value === undefined) throw new Error(`missing answer ${prompt.purpose.role}`);
    return value;
  }
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected applied intent ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
function resolve(f: ReturnType<typeof fixture>, state: BattleState) {
  const result = f.engine.apply(state, f.other, { kind: "pass" }, NO_PROMPTS);
  expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
  expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
  return result;
}
function saved(state: BattleState): Record<string, unknown> {
  return { mode: { kind: "journey" }, init: {
    battleId: parseBattleId("battle-counters"), siteId: parseSiteId("site-counters"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-counters"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
    avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: state.seed, scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: slice(state) } };
}
function lists(f: ReturnType<typeof fixture>) {
  const own = [...deck, f.card.id, f.card.id, v.event1.id, v.vanilla2.id].map(cardId => ({ cardId }));
  const other = [...deck, v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, f.responseCard.id].map(cardId => ({ cardId }));
  return f.side === "player" ? { player: own, enemy: other } : { player: other, enemy: own };
}

describe.each(SIDES)("stored counter values and payments for %s", side => {
  it("prepares a shared numeric X before exact targets and spends that X, not the remaining count", () => {
    const f = fixture(side);
    const answers = new Answers([2, [f.ids[f.other].back[2]!]]);
    const before = stateHash(f.state);
    const paid = f.engine.apply(f.state, side, f.action, answers);
    expect(answers.prompts.map(prompt => prompt.purpose.role)).toEqual(["chooseX", "target"]);
    expect(answers.prompts[0]).toMatchObject({ kind: "chooseNumber", min: 0, max: 3 });
    expect(paid.state.stack[0]?.x).toBe(2);
    expect(paid.state.instances[f.source].status.counters).toBe(2);
    expect(paid.state.instances[f.ids[side].back[1]!].status.counters).toBe(7);
    expect(paid.state.sides[side].currentEnergy).toBe(5);
    expect(paid.events).toContainEqual({ kind: "countersChanged", instance: f.source, counters: 2 });
    expect(resolve(f, paid.state).state.instances[f.ids[f.other].back[2]!].zone).toBe("void");
    expect(stateHash(f.state)).toBe(before);
  });

  it("permits meaningful zero targets with zero counters, while the default positive minimum is unavailable", () => {
    const f = fixture(side, [countersXCost(0)], dissolve(exact), 0);
    const paid = f.engine.apply(f.state, side, f.action, new ScriptedSource([0, [f.ids[f.other].back[0]!]]));
    expect(paid.state.stack[0]?.x).toBe(0);
    expect(paid.events.filter(e => e.kind === "countersChanged")).toEqual([]);
    expect(resolve(f, paid.state).state.instances[f.ids[f.other].back[0]!].zone).toBe("void");
    const positive = fixture(side, [countersXCost()], gainPoints(x()), 0);
    expect(positive.engine.legalActions(positive.state, side)).not.toContainEqual(positive.action);
  });

  it("adds fixed counters and repeated variable parts while sharing energy-X and discard-X", () => {
    const f = fixture(side, [energy(1), energyX(1), countersCost(1), countersXCost(), countersXCost(), discardCostFilter({}, { count: "x", min: 1 })], gainPoints(x()), 5);
    const paid = f.engine.apply(f.state, side, f.action, new ScriptedSource([2, f.ids[side].hand]));
    expect(paid.state.stack[0]?.x).toBe(2);
    expect(paid.state.instances[f.source].status.counters).toBe(0);
    expect(paid.state.sides[side].currentEnergy).toBe(2);
    expect(paid.state.sides[side].hand).toEqual([]);
    expect(paid.events.filter(e => e.kind === "countersChanged").map(e => e.counters)).toEqual([4, 2, 0]);
    expect(resolve(f, paid.state).state.sides[side].score).toBe(2);
  });

  it("shares counter-X with mandatory abandon-X and energy-X, retaining paid X after both sources depart", () => {
    const f = fixture(side, [energyX(0), countersXCost(0), abandonXCost({ min: 1 })], gainPoints(x()), 4, { ...v.interruptEvent, id: syntheticId(0x950fd) });
    const answers = new Answers([2, f.ids[side].back.filter(id => id !== null)]);
    const paid = f.engine.apply(f.state, side, f.action, answers);
    expect(answers.prompts[0]).toMatchObject({ kind: "chooseNumber", min: 1, max: 2 });
    expect(paid.state.stack[0]?.x).toBe(2);
    expect(paid.state.sides[side].currentEnergy).toBe(3);
    expect(paid.events).toContainEqual({ kind: "countersChanged", instance: f.source, counters: 2 });
    expect(paid.events.filter(event => event.kind === "abandoned")).toHaveLength(2);
    expect(paid.state.instances[f.source]).toMatchObject({ zone: "void", status: { counters: 0 } });
    expect(resolve(f, paid.state).state.sides[side].score).toBe(2);
    const impossible = fixture(side, [energyX(3), countersXCost(0), abandonXCost({ min: 1 })], gainPoints(x()), 4);
    expect(impossible.engine.legalActions(impossible.state, side)).not.toContainEqual(impossible.action);
  });

  it("rejects directly authored nested counter-X before any targets and rejects inconsistent positive minima", () => {
    for (const costs of [[choiceCost([countersXCost(0)])], [optionalCost(countersXCost(0))]]) {
      const f = fixture(side, costs, dissolve(exact));
      expect(f.engine.legalActions(f.state, side)).not.toContainEqual(f.action);
    }
    const bounded = fixture(side, [countersXCost(0), countersXCost(3)], gainPoints(x()), 4);
    expect(bounded.engine.legalActions(bounded.state, side)).not.toContainEqual(bounded.action);
    const joint = fixture(side, [energyX(3), countersXCost(1)], gainPoints(x()), 2);
    expect(joint.engine.legalActions(joint.state, side)).not.toContainEqual(joint.action);
  });

  it("reads live source counters after earlier instructions, independently for identical physical cards", () => {
    const f = fixture(side, [discardHandCost()], sequence(storeCounters(1), draw(storedCounters())), 2);
    const paid = f.engine.apply(f.state, side, f.action, NO_PROMPTS);
    expect(paid.state.sides[side].hand).toEqual([]);
    expect(paid.state.stack[0]).not.toHaveProperty("paymentSourceCounters");
    const result = resolve(f, paid.state);
    expect(result.state.sides[side].hand).toHaveLength(3);
    expect(result.state.instances[f.source].status.counters).toBe(3);
    expect(result.state.instances[f.ids[side].back[1]!].status.counters).toBe(7);
    const second = f.engine.apply(result.state, side, { ...f.action, source: f.ids[side].back[1]! }, NO_PROMPTS);
    expect(resolve(f, second.state).state.sides[side].hand).toHaveLength(8);
  });

  it("reads cleared zero if a response removes the source after activation, with paid X preserved", () => {
    const f = fixture(side, [countersXCost(1)], sequence(gainPoints(storedCounters()), gainPoints(x())), 4);
    const paid = f.engine.apply(f.state, side, f.action, new ScriptedSource([2]));
    const responded = f.engine.apply(paid.state, f.other, { kind: "play", card: f.ids[f.other].hand[0], from: "hand" }, new ScriptedSource([[f.source]]));
    let current = f.engine.apply(responded.state, side, { kind: "pass" }, NO_PROMPTS).state;
    if (current.stack.length > 0) current = resolve(f, current).state;
    expect(current.instances[f.source]).toMatchObject({ zone: "hand", status: { counters: 0 } });
    expect(current.sides[side].score).toBe(2);
  });

  it.each(["ordinary", "created", "return"] as const)("retains only this value's count immediately before its %s own payment departure", replacement => {
    const f = fixture(side, [countersCost(1), replacement === "return" ? returnCost({ another: false }) : abandonSelfCost()], gainPoints(storedCounters()), 4);
    if (replacement === "created") f.state.instances[f.source].status.created = true;
    const answers = [[f.source]];
    const paid = f.engine.apply(f.state, side, f.action, new ScriptedSource(answers));
    expect(paid.state.stack[0]).toMatchObject({ kind: "ability", source: f.source, paymentSourceCounters: 3 });
    if (replacement === "created") expect(paid.state.instances[f.source]).toBeUndefined();
    else expect(paid.state.instances[f.source].status.counters).toBe(0);
    const reload = deserializeState(serializeState(paid.state));
    expect(stateHash(reload)).toBe(stateHash(paid.state));
    expect(resolve(f, reload).state.sides[side].score).toBe(3);
    for (const viewer of SIDES) {
      const seen = f.engine.view(paid.state, viewer);
      expect(seen.stack[0]).toMatchObject({ paymentSourceCounters: 3 });
      const sampled = f.engine.determinize(seen, lists(f), () => 0.5);
      expect(f.engine.view(sampled, viewer)).toEqual(seen);
      const result = runStep(sampled, { kind: "resolveTop" }, NO_PROMPTS, f.engine.catalog);
      if (result.kind !== "done") throw new Error("expected resolved counter snapshot");
      expect(result.state.sides[side].score).toBe(3);
    }
  });

  it("does not forward a payment snapshot into a deferred trigger's fresh resolving context", () => {
    const f = fixture(side, [abandonSelfCost()], delayed(whenYouPlay({ cardType: "event" }), gainPoints(storedCounters())));
    const paid = f.engine.apply(f.state, side, f.action, new ScriptedSource([[f.source]]));
    expect(paid.state.stack[0]).toMatchObject({ paymentSourceCounters: 4 });
    const waiting = resolve(f, paid.state).state;
    expect(waiting.floating).toHaveLength(1);
    expect(waiting.floating[0].change).not.toHaveProperty("paymentSourceCounters");
    const triggered = f.engine.apply(waiting, side, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    expect(triggered.state.sides[side].score).toBe(0);
  });

  it("requires positive counter-X before source departure, while zero after departure remains payable", () => {
    const invalid = fixture(side, [abandonSelfCost(), countersXCost()], gainPoints(x()));
    expect(invalid.engine.legalActions(invalid.state, side)).not.toContainEqual(invalid.action);
    const zero = fixture(side, [abandonSelfCost(), countersXCost(0)], dissolve(exact));
    const result = zero.engine.apply(zero.state, side, zero.action, new ScriptedSource([0, [zero.ids[zero.other].back[0]!], [zero.source]]));
    expect(result.state.stack[0]?.x).toBe(0);
    expect(resolve(zero, result.state).state.instances[zero.ids[zero.other].back[0]!].zone).toBe("void");
    const unrelated = fixture(side, [abandonSelfCost()], gainPoints(1));
    expect(unrelated.engine.apply(unrelated.state, side, unrelated.action, new ScriptedSource([[unrelated.source]])).state.stack[0]).not.toHaveProperty("paymentSourceCounters");
  });

  it("restores counter-X and target choices with stale, invalid, foreign and concurrent answers refused before payment", () => {
    const f = fixture(side);
    const adapter = createFoldAdapter(f.engine, { checkEventPrefix: true });
    const opened = applied(adapter.reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
    const pending = adapter.pending(opened)!;
    const reloaded = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
    expect(cold.pending(reloaded)).toEqual(pending);
    const answer = (value: Answer, by = side, current = reloaded) => cold.reduce(current, { kind: "answer", side: by, promptId: pending.prompt.id, value });
    expect(answer(5)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer(2, f.other)).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(reloaded, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const cancelled = applied(cold.reduce(reloaded, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(f.state);
    const reopened = applied(cold.reduce(cancelled, { kind: "battleAction", side, action: f.action }));
    expect(answer(2, side, reopened)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const targeted = applied(answer(2));
    expect(targeted.committed).toEqual(f.state);
    const targetPrompt = cold.pending(targeted)!;
    expect(cold.reduce(targeted, { kind: "answer", side, promptId: targetPrompt.prompt.id, value: [f.ids[f.other].back[1]!] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const final = applied(cold.reduce(JSON.parse(JSON.stringify(targeted)) as BattleSlice,
      { kind: "answer", side, promptId: targetPrompt.prompt.id, value: [f.ids[f.other].back[2]!] }));
    const direct = f.engine.apply(f.state, side, f.action, new ScriptedSource([2, [f.ids[f.other].back[2]!]]));
    expect(stateHash(final.committed)).toBe(stateHash(direct.state));
    expect(cold.reduce(final, { kind: "answer", side, promptId: targetPrompt.prompt.id, value: [f.ids[f.other].back[2]!] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("reloads a postcommit optional value read without permitting cancellation or replaying payment", () => {
    const f = fixture(side, [countersXCost(1)], optional(gainPoints(storedCounters())), 4);
    const adapter = createFoldAdapter(f.engine, { checkEventPrefix: true });
    const open = applied(adapter.reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
    const paid = applied(adapter.reduce(open, { kind: "answer", side, promptId: adapter.pending(open)!.prompt.id, value: 2 }));
    const waiting = applied(adapter.reduce(paid, { kind: "battleAction", side: f.other, action: { kind: "pass" } }));
    const prompt = adapter.pending(waiting)!.prompt;
    expect(prompt).toMatchObject({ kind: "confirm", cancellable: false });
    expect(waiting.committed.instances[f.source].status.counters).toBe(2);
    expect(adapter.reduce(waiting, { kind: "cancel", side, promptId: prompt.id }).kind).toBe("bounced");
    const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
    const reload = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
    const done = applied(cold.reduce(reload, { kind: "answer", side, promptId: prompt.id, value: true }));
    expect(done.committed.sides[side].score).toBe(2);
    expect(done.committed.instances[f.source].status.counters).toBe(2);
    expect(cold.reduce(done, { kind: "answer", side, promptId: prompt.id, value: true }).kind).toBe("bounced");
  });
});

describe("stored counter boundary and rollback", () => {
  it("rejects malformed minima and saved payment scalars while accepting absence and integer zero", () => {
    for (const min of [-1, 0.5, Infinity, NaN]) expect(() => countersXCost(min)).toThrow();
    expect(countersXCost()).toEqual({ cost: "countersX", min: 1 });
    const f = fixture("player", [abandonSelfCost()], gainPoints(storedCounters()));
    const paid = f.engine.apply(f.state, "player", f.action, new ScriptedSource([[f.source]])).state;
    expect(parseJourneyBattleFoldState(saved(paid))).not.toBeNull();
    for (const value of [undefined, 0, 6, -1, 0.5, "3", null, Infinity, NaN]) {
      const state = deserializeState(serializeState(paid));
      state.stack = state.stack.map(item => item.kind === "ability" ? { ...item, paymentSourceCounters: value as number } : item);
      if (value === undefined || value === 0 || value === 6) expect(parseJourneyBattleFoldState(saved(state))).not.toBeNull();
      else expect(parseJourneyBattleFoldState(saved(state))).toBeNull();
    }
  });

  it("rolls back a successful resolution prefix using the new live read when a later primitive fails", () => {
    const f = fixture("player", [], sequence(gainEnergy(storedCounters()), storeCounters(-1)), 3);
    const paid = f.engine.apply(f.state, "player", f.action, NO_PROMPTS).state;
    const before = stateHash(paid);
    const observed: EngineEvent[] = [];
    expect(() => runStep(paid, { kind: "resolveTop" }, NO_PROMPTS, f.engine.catalog, { observeEvent: event => observed.push(event) })).toThrow();
    expect(observed.some(event => event.kind === "energyChanged")).toBe(true);
    expect(stateHash(paid)).toBe(before);
    const outcome = createFoldAdapter(f.engine).reduce(slice(paid), { kind: "battleAction", side: f.other, action: { kind: "pass" } });
    if (outcome.kind !== "applied") throw new Error("expected resolution failure");
    expect(outcome.error).not.toBeNull();
    expect(outcome.published).toEqual([]);
    expect(stateHash(outcome.slice.committed)).toBe(before);
  });

  it("rolls back an actual successful counter-X payment prefix when the paying step then fails", () => {
    const failing: EngineCardDefinition = { ...v.event0, id: syntheticId(0x950fc), synthetic: { resolve(ctx) {
      const source = ctx.state.sides.player.backRank[0];
      if (source === null) throw new Error("missing synthetic counter payment source");
      const plan = planCosts(ctx, "player", source, [energy(1), countersXCost(1)], 1,
        role => ({ source, cardId: v.vanilla1.id, ability: 0, role }), []);
      payCosts(ctx, "player", source, plan);
      throw new Error("synthetic failure after counter-X payment");
    } } };
    const engine = createEngine(testCatalog([failing]));
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [failing.id], back: [v.vanilla1.id], energy: 3, deck }, enemy: { hand: [v.interruptEvent.id], energy: 1, deck } });
    const source = ids.player.back[0]!;
    state.instances[source].status.counters = 4;
    const paid = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS).state;
    const observed: EngineEvent[] = [];
    expect(() => runStep(paid, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog, { observeEvent: event => observed.push(event) })).toThrow(/synthetic failure after counter-X payment/);
    expect(observed).toContainEqual({ kind: "countersChanged", instance: source, counters: 3 });
    expect(observed.some(event => event.kind === "energyChanged")).toBe(true);
    const outcome = createFoldAdapter(engine).reduce(slice(paid), { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    if (outcome.kind !== "applied") throw new Error("expected counter-X payment failure");
    expect(outcome.error).not.toBeNull();
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.committed).toEqual(paid);
  });

  it("keeps unrelated hidden instances private and reads actual reset counters after public response materialization", () => {
    const f = fixture("player", [abandonSelfCost()], gainPoints(storedCounters()), 4, reenterResponse);
    const paid = f.engine.apply(f.state, "player", f.action, new ScriptedSource([[f.source]])).state;
    for (const viewer of SIDES) {
      const shown = f.engine.view(paid, viewer);
      expect(shown.stack[0]).toMatchObject({ paymentSourceCounters: 4 });
      for (const hidden of [...f.ids[opponent(viewer)].deck, ...f.ids[opponent(viewer)].hand]) {
        expect(shown.instances).not.toHaveProperty(hidden);
      }
    }
    const response = f.engine.apply(paid, "enemy", { kind: "play", card: f.ids.enemy.hand[0], from: "hand" }, NO_PROMPTS);
    const restored = f.engine.apply(response.state, "player", { kind: "pass" }, NO_PROMPTS);
    expect([...response.events, ...restored.events].some(event => event.kind === "materialized" && event.instance === f.source)).toBe(true);
    expect(restored.state.instances[f.source]).toMatchObject({ zone: "play", controller: "enemy", status: { counters: 0 } });
    expect(restored.state.sides.player.score).toBe(0);
  });
});
