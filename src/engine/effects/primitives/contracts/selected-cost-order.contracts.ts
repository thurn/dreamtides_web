import { describe, expect, it } from "vitest";
import { parseCardSubtype } from "../../../../types/card-identity";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, abandonSelfCost, activated, banishFromAnyVoidCost, banishFromVoidCost, banishXCost, choiceCost, discardCost, discardCostFilter, discardHandCost, energy, energyX, optionalCost, returnCost, revealCost, x } from "../../../dsl/builders";
import type { Cost, PaymentCost } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import { stateHash } from "../../../state/hash";
import type { InstanceId, Side } from "../../../state/ids";
import type { AnswerSource } from "../../../steps/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { gainEnergy } from "../gain-energy";

const victimSubtype = parseCardSubtype("Victim");
const payerSubtype = parseCardSubtype("Source");
const victim: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x6700), subtype: victimSubtype, costs: [energy(2)] };
const filter = { subtype: victimSubtype };
const deck = Array.from({ length: 4 }, () => v.vanilla1.id);
const forms: readonly PaymentCost[] = [
  discardCostFilter(filter, { count: 2 }), abandonCost(filter, 2), returnCost(filter, 2), revealCost(2, filter),
  banishFromVoidCost(2, filter), banishFromAnyVoidCost(2, filter, "any"), { cost: "banishFromHand", count: 2 },
];
function payer(index: number, costs: readonly Cost[], effect = gainEnergy(1)): EngineCardDefinition {
  return { id: syntheticId(0x6710 + index), cardType: "character", costs: [], spark: 1, subtype: payerSubtype, speed: "standard", status: "authored", abilities: () => [activated(costs, effect)] };
}
function board(card: EngineCardDefinition, side: Side = "player") {
  const engine = createEngine(testCatalog([card, victim]));
  const other: Side = side === "player" ? "enemy" : "player";
  const fixture = boardState(engine.catalog, {
    active: side, phase: "day",
    [side]: { back: [card.id, victim.id, victim.id], front: [victim.id], hand: [victim.id, v.event0.id, victim.id, victim.id], void: [victim.id, v.event0.id, victim.id, victim.id], energy: 5, deck },
    [other]: { back: [victim.id], hand: [victim.id], void: [victim.id, victim.id], deck },
  });
  const source = fixture.ids[side].back[0];
  if (source === null) throw new Error("Missing payer source");
  return { engine, other, action: { kind: "activate", source, ability: 0 } as const, ...fixture };
}
class Selecting implements AnswerSource {
  readonly prompts: Prompt[] = [];
  readonly submitted: Answer[] = [];
  constructor(private readonly reverse: boolean) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    let value: Answer;
    if (prompt.kind === "chooseCards") {
      const picks = [prompt.candidates[0], prompt.candidates[prompt.candidates.length - 1]];
      value = Object.freeze(this.reverse ? picks.reverse() : picks);
    } else if (prompt.kind === "chooseMode") value = 0;
    else if (prompt.kind === "confirm") value = true;
    else if (prompt.kind === "chooseNumber") value = 2;
    else throw new Error(`Unexpected cost prompt ${prompt.kind}`);
    this.submitted.push(value);
    return value;
  }
}
function pair(card: EngineCardDefinition, side: Side = "player") {
  const fixture = board(card, side);
  const a = new Selecting(false), b = new Selecting(true);
  const forward = fixture.engine.apply(fixture.state, side, fixture.action, a);
  const reverse = fixture.engine.apply(fixture.state, side, fixture.action, b);
  expect(invariantViolations(forward.state, fixture.engine.catalog)).toEqual([]);
  expect(invariantViolations(reverse.state, fixture.engine.catalog)).toEqual([]);
  expect(reverse.events).toEqual(forward.events);
  expect(stateHash(reverse.state)).toBe(stateHash(forward.state));
  expect(reverse.answers.map(answer => answer.value)).toEqual(b.submitted);
  return { ...fixture, forward, reverse, a, b };
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected successful cost intent");
  return outcome.slice;
}

describe("selected cost order contracts", () => {
  for (const [index, cost] of forms.entries()) for (const side of ["player", "enemy"] as const) {
    it(`${side} pays ${cost.cost} selections in eligible candidate order with equal full state and events`, () => {
      const { ids, forward, a, b, other } = pair(payer(index, [cost]), side);
      const prompt = a.prompts[0];
      if (prompt?.kind !== "chooseCards") throw new Error("Expected selected payment");
      const selected = [prompt.candidates[0], prompt.candidates[prompt.candidates.length - 1]];
      expect(selected[0]).not.toBe(selected[1]);
      expect(b.submitted[0]).toEqual([...selected].reverse());
      const expected = cost.cost === "abandon" || cost.cost === "return" ? [ids[side].back[1], ids[side].front[0]]
        : cost.cost === "banishFromAnyVoid" ? [ids[side].void[0], ids[other].void[1]]
        : cost.cost === "banishFromVoid" ? [ids[side].void[0], ids[side].void[3]]
        : [ids[side].hand[0], ids[side].hand[3]];
      expect(selected).toEqual(expected);
      if (cost.cost === "discard") expect(forward.events.filter(event => event.kind === "discarded").map(event => event.instance)).toEqual(expected);
      else if (cost.cost === "return") expect(forward.events.filter(event => event.kind === "returnedToHand").map(event => event.instance)).toEqual(expected);
      else if (cost.cost === "abandon") expect(forward.events.filter(event => event.kind === "leftPlay").map(event => event.instance)).toEqual(expected);
      else if (cost.cost === "reveal") expect(forward.events.find(event => event.kind === "revealed")).toMatchObject({ instances: expected });
      else expect(forward.events.filter(event => event.kind === "banished").map(event => event.instance)).toEqual(expected);
    });
  }

  it("preserves printed multi-cost sequence and excludes cards reserved by each earlier selected cost", () => {
    const card = payer(20, [revealCost(2, filter), discardCost(1)]);
    const fixture = board(card);
    const selected = [fixture.ids.player.hand[0], fixture.ids.player.hand[3]];
    const source = (reverse: boolean): AnswerSource => ({ answer(prompt) {
      if (prompt.kind !== "chooseCards") throw new Error("Expected card cost");
      if (prompt.purpose.role === "revealCost") return reverse ? [...selected].reverse() : selected;
      expect(prompt.candidates).toEqual([fixture.ids.player.hand[1], fixture.ids.player.hand[2]]);
      return [fixture.ids.player.hand[2]];
    } });
    const forward = fixture.engine.apply(fixture.state, "player", fixture.action, source(false));
    const reverse = fixture.engine.apply(fixture.state, "player", fixture.action, source(true));
    expect(reverse.events).toEqual(forward.events);
    expect(stateHash(reverse.state)).toBe(stateHash(forward.state));
    expect(forward.events.findIndex(event => event.kind === "revealed")).toBeLessThan(forward.events.findIndex(event => event.kind === "discarded"));
    expect(forward.state.sides.player.hand).toEqual(fixture.ids.player.hand.filter(id => id !== fixture.ids.player.hand[2]));
  });

  it("normalizes sets inside chosen alternatives and paid optional groups while retaining group order", () => {
    const card = payer(21, [choiceCost([revealCost(2, filter)], [energy(1)]), optionalCost(banishFromVoidCost(2, filter))]);
    const { forward, a } = pair(card);
    expect(a.prompts.map(prompt => prompt.kind)).toEqual(["chooseMode", "chooseCards", "confirm", "chooseCards"]);
    expect(forward.events.findIndex(event => event.kind === "revealed")).toBeLessThan(forward.events.findIndex(event => event.kind === "banished"));
    expect(forward.state.sides.player.currentEnergy).toBe(6);
  });

  for (const [index, cost] of [discardCostFilter(filter, { count: "x", min: 1 }), banishXCost({ min: 1, filter })].entries()) {
    it(`preserves selected ${cost.cost} count captured as X`, () => {
      const { forward, a } = pair(payer(22 + index, [cost], gainEnergy(x())));
      expect(a.prompts[0]).toMatchObject({ kind: "chooseCards", min: 1, max: 3 });
      expect(forward.state.sides.player.currentEnergy).toBe(7);
    });
  }

  it("preserves a chosen energy X bound and the count of each selected payment", () => {
    const { forward, a } = pair(payer(24, [energyX(1), discardCostFilter(filter, { count: "x" })], gainEnergy(x())));
    expect(a.prompts[0]).toMatchObject({ kind: "chooseNumber", min: 1, max: 3 });
    expect(a.prompts[1]).toMatchObject({ kind: "chooseCards", min: 2, max: 2 });
    expect(forward.state.sides.player.currentEnergy).toBe(5);
  });

  it("keeps whole-hand and single self costs forced without changing their ordered payment groups", () => {
    const card = payer(25, [discardHandCost(), abandonSelfCost()]);
    const fixture = board(card);
    const result = fixture.engine.apply(fixture.state, "player", fixture.action, NO_PROMPTS);
    expect(result.events.filter(event => event.kind === "discarded").map(event => event.instance)).toEqual(fixture.ids.player.hand);
    expect(result.answers).toEqual([expect.objectContaining({ auto: true, value: [fixture.action.source] })]);
    expect(result.events.findIndex(event => event.kind === "discarded")).toBeLessThan(result.events.findIndex(event => event.kind === "leftPlay"));
  });

  it("preserves a single captured printed cost as X", () => {
    const fixture = board(payer(26, [discardCostFilter(filter, { captureCost: true })], gainEnergy(x())));
    const selected = fixture.ids.player.hand[0];
    const result = fixture.engine.apply(fixture.state, "player", fixture.action, new ScriptedSource([[selected]]));
    expect(result.events.filter(event => event.kind === "discarded")).toEqual([{ kind: "discarded", side: "player", instance: selected }]);
    expect(result.state.sides.player.currentEnergy).toBe(7);
  });

  it("reloads a raw selected prefix before payment, cancels without writes, rejects invalid actors and stale inputs, and commits equivalent sets once", () => {
    const fixture = board(payer(27, [revealCost(2, filter), discardCost(1)]));
    const fold = createFoldAdapter(fixture.engine, { checkEventPrefix: true });
    const initial: BattleSlice = { committed: fixture.state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const waiting = applied(fold.reduce(initial, { kind: "battleAction", side: "player", action: fixture.action }));
    const first = fold.pending(waiting)?.prompt;
    if (first?.kind !== "chooseCards") throw new Error("Missing first cost selection");
    const selected = [fixture.ids.player.hand[0], fixture.ids.player.hand[3]];
    const finish = (value: readonly InstanceId[]) => {
      const prefix = applied(fold.reduce(waiting, { kind: "answer", side: "player", promptId: first.id, value }));
      const saved = JSON.parse(JSON.stringify(prefix)) as BattleSlice;
      const reload = createFoldAdapter(fixture.engine, { checkEventPrefix: true });
      const pending = reload.pending(saved);
      if (pending?.prompt.kind !== "chooseCards") throw new Error("Missing second cost selection");
      expect(pending).toEqual(fold.pending(prefix));
      expect(saved.inFlight?.answers[0]?.value).toEqual(value);
      expect(stateHash(saved.committed)).toBe(stateHash(fixture.state));
      const id = pending.prompt.id;
      expect(reload.reduce(saved, { kind: "answer", side: "enemy", promptId: id, value: [fixture.ids.player.hand[2]] }).kind).toBe("bounced");
      expect(reload.reduce(saved, { kind: "answer", side: "player", promptId: first.id, value: [fixture.ids.player.hand[2]] }).kind).toBe("bounced");
      expect(reload.reduce(saved, { kind: "answer", side: "player", promptId: id, value: [selected[0]] }).kind).toBe("bounced");
      expect(reload.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }).kind).toBe("bounced");
      expect(applied(reload.reduce(saved, { kind: "cancel", side: "player", promptId: id })).committed).toEqual(fixture.state);
      const outcome = reload.reduce(saved, { kind: "answer", side: "player", promptId: id, value: [fixture.ids.player.hand[2]] });
      const done = applied(outcome);
      expect(reload.reduce(done, { kind: "answer", side: "player", promptId: id, value: [fixture.ids.player.hand[2]] }).kind).toBe("bounced");
      expect(invariantViolations(done.committed, fixture.engine.catalog)).toEqual([]);
      return { done, outcome };
    };
    const forward = finish(selected), reverse = finish([...selected].reverse());
    expect(stateHash(reverse.done.committed)).toBe(stateHash(forward.done.committed));
    if (reverse.outcome.kind !== "applied" || forward.outcome.kind !== "applied") throw new Error("Expected committed payment");
    expect(reverse.outcome.published).toEqual(forward.outcome.published);
  });
});
