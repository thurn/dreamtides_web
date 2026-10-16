import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { activated, abandonSelfCost, choiceCost, costPaid, countersCost, discardCostFilter, energy, energyX, event, exhaustSelf, optionalCost, pointsCost, reclaim, revealSourceCost, staticAbility, target, targetWhen, enemyCharacter, winCondition, x } from "../../../dsl/builders";
import type { Ability, Cost, Variant } from "../../../dsl/types";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { ResolvingEffect } from "../../registry";
import type { Answer, Prompt } from "../../../prompts/types";
import { SIDES, opponent, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { invariantViolations } from "../../../testing/invariants";
import { passUntil } from "../../../testing/trigger-harness";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseDreamsignId } from "../../../../types/identifiers";
import * as p from "../index";

const route = { route: "activated" } as const;
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
function card(index: number, abilities: (variant: Variant) => readonly Ability[], fields: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return { ...v.vanilla1, ...fields, id: fields.id ?? syntheticId(0x630100 + index), status: "authored", costs: fields.costs ?? [energy(3)], abilities };
}
function payer(index = 0, costs: readonly Cost[] = [energy(3)], effect: ResolvingEffect = p.gainPoints(1), options: Parameters<typeof activated>[2] = {}) {
  return card(index, () => [activated(costs, effect, options)]);
}
function modifier(index: number, amount: number, player: "you" | "opponent" = "you", zone: "play" | "hand" | "any" = "play") {
  return card(index, () => [staticAbility(p.costModifier(player, { cardType: "character" }, amount, route), { zone })]);
}
function fixture(side: Side, definitions: readonly EngineCardDefinition[], mine: SideSetup, theirs: SideSetup = {}) {
  const engine = createEngine(testCatalog(definitions));
  return { engine, ...boardState(engine.catalog, { active: side, phase: "day", [side]: { energy: 10, score: 10, deck, ...mine }, [opponent(side)]: { deck, ...theirs } }) };
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function saved(slice: BattleSlice) {
  return { mode: { kind: "journey" }, init: { battleId: "battle-activated-cost", siteId: "site-activated-cost", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: "opponent-activated-cost", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [] },
    engine: { init: { seed: "activated-cost", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as BattleSlice } };
}
function activate(f: ReturnType<typeof fixture>, side: Side, source: AnswerSource = NO_PROMPTS, index = 0) {
  return f.engine.apply(f.state, side, { kind: "activate", source: f.ids[side].back[index]!, ability: 0 }, source);
}
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private next = 0;
  constructor(private readonly values: readonly Answer[]) {}
  answer(prompt: Prompt): Answer { this.prompts.push(prompt); const value = this.values[this.next++]; if (value === undefined) throw new Error("Missing synthetic answer"); return value; }
  exhausted() { expect(this.next).toBe(this.values.length); }
}
function nextModifier(f: ReturnType<typeof fixture>, side: Side, amount = -2) {
  f.state.floating.push({ id: "e1", source: f.ids[side].back[0]!, controller: side, timestamp: 0, expiry: { at: "never" },
    change: { kind: "cost", player: side, filter: {}, amount, next: true, route: "activated" } });
  f.state.nextEffect = 2;
}

for (const side of SIDES) describe(`${side} activated energy route`, () => {
  it("changes actual activation energy independently of normal, Reclaim, own and ordinal play changes", () => {
    const subject = payer(), discount = modifier(1, -2);
    const old = card(2, () => [staticAbility(p.costModifier("you", {}, 4)), staticAbility(p.costModifierNth("you", {}, 1, { set: 0 })), staticAbility(p.costModifierReclaim("you", { set: 0 }))]);
    const spell = card(3, () => [reclaim(energy(2)), event(p.gainPoints(1))], { ...v.event0, id: syntheticId(0x630103), costs: [energy(3)] });
    const f = fixture(side, [subject, discount, old, spell], { back: [subject.id, discount.id, old.id], hand: [spell.id], void: [spell.id] });
    expect(activate(f, side).state.sides[side].currentEnergy).toBe(9);
    for (const from of ["hand", "void"] as const) {
      const id = f.ids[side][from][0];
      expect(f.engine.apply(f.state, side, { kind: "play", card: id, from }, NO_PROMPTS).state.sides[side].currentEnergy).toBe(6);
    }
    expect(f.engine.view(f.state, side).instances[f.ids[side].back[0]!].characteristics.cost).toBe(4);
  });

  it("combines fixed, X, optional and alternative energy once while retaining every nonenergy payment", () => {
    const subject = payer(4, [energy(2), energyX(0), optionalCost(energy(2)), choiceCost([energy(1)], [pointsCost(2)]), discardCostFilter({}), countersCost(1), exhaustSelf(), pointsCost(1)], p.gainPoints(x()));
    const tax = modifier(5, 2), reduction = modifier(6, -3);
    const f = fixture(side, [subject, tax, reduction], { back: [subject.id, tax.id, reduction.id], hand: [v.vanilla1.id, v.vanilla2.id], energy: 10 });
    const id = f.ids[side].back[0]!; f.state.instances[id].status.counters = 2;
    const answers = new Answers([3, true, 0, [f.ids[side].hand[0]]]);
    const done = activate(f, side, answers); answers.exhausted();
    expect(done.state.sides[side].currentEnergy).toBe(3);
    expect(done.state.instances[id].status).toMatchObject({ counters: 1, exhausted: true });
    expect(done.state.instances[f.ids[side].hand[0]].zone).toBe("void");
    expect(done.state.sides[side].score).toBe(12);
    expect(invariantViolations(done.state, f.engine.catalog)).toEqual([]);
    const alternative = new Answers([0, false, 1, [f.ids[side].hand[0]]]);
    const other = activate(f, side, alternative); alternative.exhausted();
    expect(other.state.sides[side].currentEnergy).toBe(9);
    expect(other.state.sides[side].score).toBe(7);
  });

  it("floors energy after taxes and reductions while refusing an unpaid nonenergy cost", () => {
    const subject = payer(7, [energy(1), countersCost(2)]), reduction = modifier(8, -5), tax = modifier(9, 2);
    const f = fixture(side, [subject, reduction, tax], { back: [subject.id, reduction.id, tax.id], energy: 0 });
    const action = { kind: "activate", source: f.ids[side].back[0]!, ability: 0 } as const;
    expect(f.engine.legalActions(f.state, side)).not.toContainEqual(action);
    const g = fixture(side, [subject, reduction, tax], { back: [subject.id, reduction.id, tax.id], energy: 0 });
    g.state.instances[g.ids[side].back[0]!].status.counters = 2;
    expect(activate(g, side).state.sides[side].currentEnergy).toBe(0);
  });

  it("uses the same modifier when optional payment determines immediate targets", () => {
    const effect = p.dissolve(targetWhen(costPaid(), enemyCharacter({ sparkAtMost: 3 }), enemyCharacter({ sparkAtMost: 1 })));
    const subject = payer(10, [energy(2), optionalCost(energy(2))], effect), reduction = modifier(11, -2);
    const f = fixture(side, [subject, reduction], { back: [subject.id, reduction.id], energy: 2 }, { back: [v.vanilla1.id, v.vanilla3.id] });
    const answers = new Answers([true, [f.ids[opponent(side)].back[1]!]]);
    const done = activate(f, side, answers); answers.exhausted();
    expect(done.state.sides[side].currentEnergy).toBe(0);
    expect(done.state.instances[f.ids[opponent(side)].back[1]!].zone).toBe("void");
  });

  it("counts duplicate physical modifier sources and follows current controller and copiable variant", () => {
    const subject = card(12, variant => [activated([energy(variant.amplified ? 4 : 3)], p.gainPoints(1))]);
    const discount = modifier(13, -1), hostile = modifier(14, 2, "opponent");
    const f = fixture(side, [subject, discount, hostile], { back: [subject.id, discount.id, discount.id] }, { back: [hostile.id] });
    expect(activate(f, side).state.sides[side].currentEnergy).toBe(7);
    const altered = fixture(side, [subject, discount, hostile], { back: [subject.id, discount.id, discount.id] }, { back: [hostile.id] });
    const amplified = altered.ids[side].back[0]!;
    altered.state.instances[amplified] = { ...altered.state.instances[amplified], variant: { amplified: true } };
    expect(activate(altered, side).state.sides[side].currentEnergy).toBe(6);
    expect(f.ids[side].back[1]).not.toBe(f.ids[side].back[2]);
  });

  it("matches the source copiable variant and current control rather than its owner", () => {
    const subject = payer(30), discount = card(31, () => [staticAbility(p.costModifier("you", { costAtMost: 1 }, -2, route))]);
    const f = fixture(side, [subject, discount], { back: [subject.id, discount.id] });
    expect(activate(f, side).state.sides[side].currentEnergy).toBe(7);
    const g = fixture(side, [subject, discount], { back: [subject.id, discount.id] });
    const id = g.ids[side].back[0]!;
    g.state.instances[id] = { ...g.state.instances[id], variant: { amplified: false, deckMods: { sparkBonus: 0, costReduction: 2, fast: false, reclaim: null, typeChange: null } } };
    expect(activate(g, side).state.sides[side].currentEnergy).toBe(9);
    const steal = card(32, () => [event(p.gainControl(target(enemyCharacter())))], { cardType: "event", spark: null, costs: [energy(0)] });
    const ordinary = modifier(33, -1);
    const h = fixture(side, [subject, ordinary, steal], { back: [ordinary.id], hand: [steal.id] }, { back: [subject.id] });
    const taken = h.engine.apply(h.state, side, { kind: "play", card: h.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const source = h.ids[opponent(side)].back[0]!;
    expect(taken.state.instances[source]).toMatchObject({ owner: opponent(side), controller: side });
    const done = h.engine.apply(taken.state, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS);
    expect(done.state.sides[side].currentEnergy).toBe(8);
  });

  it("creates a routed next modifier through a resolving effect and samples its ceased producer anonymously", () => {
    const subject = payer(34);
    const producer = card(35, () => [event(p.costModifier("you", {}, -2, { ...route, next: true }))], { cardType: "event", spark: null, costs: [energy(0)] });
    const f = fixture(side, [subject, producer], { back: [subject.id], hand: [producer.id], energy: 3 });
    const source = f.ids[side].hand[0];
    f.state.instances[source] = { ...f.state.instances[source], journeyDeck: false, status: { ...f.state.instances[source].status, created: true } };
    const created = f.engine.apply(f.state, side, { kind: "play", card: source, from: "hand" }, NO_PROMPTS);
    expect(created.state.instances[source]).toBeUndefined();
    expect(created.events.some(event => event.kind === "effectStarted" && event.change.kind === "cost" && event.change.route === "activated" && event.change.next)).toBe(true);
    const view = f.engine.view(created.state, side);
    expect(view.floating).toHaveLength(1); expect(view.floating[0].source).toBeNull();
    const decklists = { [side]: [{ cardId: subject.id }, ...deck.map(cardId => ({ cardId }))], [opponent(side)]: deck.map(cardId => ({ cardId })) } as Record<Side, { cardId: typeof subject.id }[]>;
    for (const state of [created.state, f.engine.determinize(view, decklists, () => 0.5)]) {
      expect(parseJourneyBattleFoldState(saved(sliceOf(state)))).not.toBeNull();
      const paid = f.engine.apply(state, side, { kind: "activate", source: f.ids[side].back[0]!, ability: 0 }, NO_PROMPTS);
      expect(paid.state.sides[side].currentEnergy).toBe(2); expect(paid.state.floating).toEqual([]);
    }
  });

  it("matches card source filters in play, the holder hand and the owner void without granting access", () => {
    for (const zone of ["play", "hand", "void"] as const) {
      const subject = payer(15, [energy(2), ...(zone === "hand" ? [revealSourceCost()] : [])], p.gainPoints(1), { zone });
      const discount = modifier(16, -1);
      const f = fixture(side, [subject, discount], { back: [discount.id, ...(zone === "play" ? [subject.id] : [])], hand: zone === "hand" ? [subject.id] : [], void: zone === "void" ? [subject.id] : [] });
      const id = zone === "play" ? f.ids[side].back[1]! : f.ids[side][zone][0];
      const done = f.engine.apply(f.state, side, { kind: "activate", source: id, ability: 0 }, NO_PROMPTS);
      expect(done.state.sides[side].currentEnergy).toBe(9);
      if (zone === "hand") expect(done.events).toContainEqual({ kind: "revealed", side, instances: [id] });
    }
  });

  it("does not apply a card filter to an emblem activation", () => {
    const emblem = { id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000630101"), status: "authored" as const, abilities: () => [activated([energy(3)], p.gainPoints(1))] };
    const discount = modifier(17, -5);
    const engine = createEngine(testCatalog([discount], { dreamsigns: [emblem] }));
    const f = boardState(engine.catalog, { active: side, phase: "day", [side]: { dreamsigns: [emblem.id], back: [discount.id], energy: 5, deck }, [opponent(side)]: { deck } });
    const done = engine.apply(f.state, side, { kind: "activate", source: { kind: "dreamsign", side, index: 0 }, ability: 0 }, NO_PROMPTS);
    expect(done.state.sides[side].currentEnergy).toBe(2);
  });

  it("previews and cancels without spending energy, next effects or once-per-turn use", () => {
    const subject = payer(18, [energy(3), discardCostFilter({})], p.gainPoints(1), { oncePerTurn: true });
    const f = fixture(side, [subject], { back: [subject.id], hand: [v.vanilla1.id, v.vanilla2.id] }); nextModifier(f, side);
    const before = JSON.stringify(f.state), fold = createFoldAdapter(f.engine), initial = sliceOf(f.state);
    const action = { kind: "activate", source: f.ids[side].back[0]!, ability: 0 } as const;
    for (let i = 0; i < 3; i++) { expect(f.engine.legalActions(f.state, side)).toContainEqual(action); f.engine.view(f.state, side); }
    expect(JSON.stringify(f.state)).toBe(before);
    const opened = applied(fold.reduce(initial, { kind: "battleAction", side, action }));
    const prompt = fold.pending(opened)!.prompt;
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side, promptId: prompt.id }));
    expect(cancelled.committed).toEqual(f.state);
    const reopened = applied(fold.reduce(cancelled, { kind: "battleAction", side, action }));
    const paid = applied(fold.reduce(reopened, { kind: "answer", side, promptId: fold.pending(reopened)!.prompt.id, value: [f.ids[side].hand[0]] }));
    expect(paid.committed.sides[side].currentEnergy).toBe(9);
    expect(paid.committed.floating).toEqual([]);
    expect(paid.committed.oncePerTurn).toHaveLength(1);
    expect(f.engine.legalActions(paid.committed, side)).not.toContainEqual(action);
  });

  it("strictly reloads pending choices, refuses invalid/stale/competing actors and fully replays payment once", () => {
    const subject = payer(19, [energy(2), energyX(0), optionalCost(energy(1)), discardCostFilter({})], p.gainPoints(x()));
    const f = fixture(side, [subject], { back: [subject.id], hand: [v.vanilla1.id, v.vanilla2.id], energy: 4 }); nextModifier(f, side);
    const logs: EngineLogRecord[] = [], fold = createFoldAdapter(f.engine, { checkEventPrefix: true, log: record => logs.push(record) });
    const action: BattleIntent = { kind: "battleAction", side, action: { kind: "activate", source: f.ids[side].back[0]!, ability: 0 } };
    const initial = sliceOf(f.state); let slice = applied(fold.reduce(initial, action)); const intents: BattleIntent[] = [action];
    const stale = fold.pending(slice)!.prompt.id;
    const cancel: BattleIntent = { kind: "cancel", side, promptId: stale };
    slice = applied(fold.reduce(slice, cancel)); intents.push(cancel, action);
    slice = applied(fold.reduce(slice, action));
    const values: Answer[] = [2, true, [f.ids[side].hand[0]]];
    for (const value of values) {
      const parsed = parseJourneyBattleFoldState(saved(slice)); expect(parsed).not.toBeNull();
      const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
      const loaded = parsed!.engine.slice;
      const pending = cold.pending(loaded)!; expect(pending).toEqual(fold.pending(slice));
      expect(cold.reduce(loaded, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      expect(cold.reduce(loaded, { kind: "battleAction", side: opponent(side), action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
      expect(cold.reduce(loaded, { kind: "answer", side, promptId: stale, value }).kind).toBe("bounced");
      expect(cold.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: pending.prompt.kind === "chooseCards" ? [] : -1 }).kind).toBe("bounced");
      const intent: BattleIntent = { kind: "answer", side, promptId: pending.prompt.id, value };
      intents.push(intent); slice = applied(cold.reduce(loaded, intent));
    }
    expect(slice.committed.sides[side].currentEnergy).toBe(1);
    expect(slice.committed.floating).toEqual([]);
    expect(fold.reduce(slice, intents[intents.length - 1]).kind).toBe("bounced");
    const replay = intents.reduce((current, intent) => applied(fold.reduce(current, intent)), initial);
    expect(replay).toEqual(slice);
    expect(logs.some(record => record.event === "engine.action" && record.action.kind === "activate")).toBe(true);
    expect(logs.some(record => record.event === "engine.promptOpened" && record.cardId === subject.id)).toBe(true);
  });

  it("rejects malformed saved routes while accepting new and omitted old discriminators", () => {
    const f = fixture(side, [payer(20)], { back: [syntheticId(0x630114)] }); nextModifier(f, side);
    const raw = saved(sliceOf(f.state)); expect(parseJourneyBattleFoldState(raw)).not.toBeNull();
    const effect = raw.engine.slice.committed.floating[0];
    if (effect.change.kind !== "cost") throw new Error("Missing cost");
    Reflect.deleteProperty(effect.change, "route"); expect(parseJourneyBattleFoldState(raw)).not.toBeNull();
    for (const value of [null, false, "play", "reclaim", {}, 1]) {
      const malformed = { ...raw, engine: { ...raw.engine, slice: { ...raw.engine.slice, committed: { ...raw.engine.slice.committed, floating: [{ ...effect, change: { ...effect.change, route: value } }] } } } };
      expect(parseJourneyBattleFoldState(malformed)).toBeNull();
    }
  });

  it("rolls back a genuine post-payment failure and preserves a precommit answer failure", () => {
    const subject = card(21, () => [activated([energy(3), discardCostFilter({})], p.gainPoints(1), { oncePerTurn: true }),
      winCondition({ cond: "energyAtLeast", get amount(): number { throw new Error("synthetic victory read after payment"); } })]);
    const f = fixture(side, [subject], { back: [subject.id], hand: [v.vanilla1.id, v.vanilla2.id] }); nextModifier(f, side);
    const action = { kind: "activate", source: f.ids[side].back[0]!, ability: 0 } as const;
    const before = JSON.stringify(f.state); let paid: BattleState | null = null;
    expect(() => runStep(f.state, action, new ScriptedSource([[f.ids[side].hand[0]]]), f.engine.catalog, { observeEvent(event, snapshot) { if (event.kind === "abilityActivated") paid = snapshot(); } })).toThrow("synthetic victory read after payment");
    expect(paid).toMatchObject({ sides: { [side]: { currentEnergy: 9 } }, floating: [], oncePerTurn: [expect.any(String)] });
    expect((paid as BattleState | null)?.instances[f.ids[side].hand[0]].zone).toBe("void");
    expect(JSON.stringify(f.state)).toBe(before);
    expect(() => runStep(f.state, action, { answer() { throw new Error("synthetic answer failure"); } }, f.engine.catalog)).toThrow("synthetic answer failure");
    expect(JSON.stringify(f.state)).toBe(before);
    const fold = createFoldAdapter(f.engine); const opened = applied(fold.reduce(sliceOf(f.state), { kind: "battleAction", side, action }));
    const failed = fold.reduce(opened, { kind: "answer", side, promptId: fold.pending(opened)!.prompt.id, value: [f.ids[side].hand[0]] });
    expect(failed.kind).toBe("applied"); if (failed.kind !== "applied") throw new Error("Missing recovery");
    expect(failed.error).not.toBeNull(); expect(failed.slice.inFlight).toBeNull(); expect(failed.slice.committed).toEqual(f.state);
  });

  it("keeps the prepared adjustment when its source is abandoned as a payment", () => {
    const subject = payer(38, [energy(3), abandonSelfCost()]);
    const f = fixture(side, [subject], { back: [subject.id], energy: 2 }); nextModifier(f, side);
    const paid = activate(f, side);
    expect(paid.state.sides[side].currentEnergy).toBe(1);
    expect(paid.state.instances[f.ids[side].back[0]!].zone).toBe("void");
    expect(paid.state.floating).toEqual([]); expect(paid.state.sides[side].score).toBe(11);
  });

  it("retains committed payment and consumption when an Interrupt removes the source", () => {
    const subject = payer(22), interrupt = card(23, () => [event(p.returnToHand(target(enemyCharacter())))], { ...v.event0, id: syntheticId(0x630117), costs: [energy(0)], speed: "interrupt" });
    const f = fixture(side, [subject, interrupt], { back: [subject.id], energy: 3 }, { hand: [interrupt.id] }); nextModifier(f, side);
    const activated = activate(f, side); expect(activated.state.sides[side].currentEnergy).toBe(2); expect(activated.state.floating).toEqual([]);
    const answered = f.engine.apply(activated.state, opponent(side), { kind: "play", card: f.ids[opponent(side)].hand[0], from: "hand" }, NO_PROMPTS);
    const done = passUntil(f.engine, answered.state, state => state.stack.length === 0).state;
    expect(done.instances[f.ids[side].back[0]!].zone).toBe("hand"); expect(done.sides[side].currentEnergy).toBe(2); expect(done.sides[side].score).toBe(11); expect(done.floating).toEqual([]);
  });

  it("preserves hidden static reduction margin for X and optional energy through fair sampling", () => {
    const subject = payer(24, [energy(1), energyX(0), optionalCost(energy(1))], p.gainPoints(x()));
    const hidden = modifier(25, -3, "opponent", "hand"), smaller = modifier(26, -1, "opponent", "hand");
    const f = fixture(side, [subject, hidden, smaller], { back: [subject.id], energy: 1 }, { hand: [hidden.id], deck: [smaller.id] });
    const visible = f.engine.view(f.state, side), id = f.ids[side].back[0]!;
    expect(visible.instances[id].characteristics.activationCostModifier).toBe(-3);
    expect(visible.instances[f.ids[opponent(side)].hand[0]]).toBeUndefined(); expect(visible.floating).toEqual([]);
    const decklists = { [side]: [{ cardId: subject.id }, ...deck.map(cardId => ({ cardId }))], [opponent(side)]: [{ cardId: hidden.id }, { cardId: smaller.id }] } as Record<Side, { cardId: typeof subject.id }[]>;
    for (const state of [f.state, ...[0, 0.5, 0.99].map(draw => f.engine.determinize(visible, decklists, () => draw))]) {
      expect(f.engine.legalActions(state, side)).toEqual(f.engine.legalActions(f.state, side));
      const answers = new ScriptedSource([2, true]); const done = f.engine.apply(state, side, { kind: "activate", source: id, ability: 0 }, answers); answers.assertExhausted();
      expect(done.state.sides[side].currentEnergy).toBe(0); expect(done.state.sides[side].score).toBe(12);
    }
  });

  it("projects equal overlapping hidden producers without producer identities or counts", () => {
    const subject = payer(27), one = modifier(28, -1, "opponent", "hand"), two = modifier(29, -2, "opponent", "hand");
    const three = modifier(36, -3, "opponent", "hand"), neutral = card(37, () => []), definitions = [subject, one, two, three, neutral];
    const first = fixture(side, definitions, { back: [subject.id] }, { hand: [three.id, neutral.id], deck: [one.id, two.id] });
    const second = fixture(side, definitions, { back: [subject.id] }, { hand: [one.id, two.id], deck: [three.id, neutral.id] });
    const view = first.engine.view(first.state, side); expect(view).toEqual(second.engine.view(second.state, side));
    expect(view.instances[first.ids[side].back[0]!].characteristics.activationCostModifier).toBe(-3);
    for (const id of first.ids[opponent(side)].hand) expect(view.instances[id]).toBeUndefined();
    const decklists = { [side]: [{ cardId: subject.id }, ...deck.map(cardId => ({ cardId }))], [opponent(side)]: [{ cardId: one.id }, { cardId: two.id }, { cardId: three.id }, { cardId: neutral.id }] } as Record<Side, { cardId: typeof subject.id }[]>;
    expect(first.engine.determinize(view, decklists, () => 0.99)).toEqual(second.engine.determinize(second.engine.view(second.state, side), decklists, () => 0.99));
  });
});
