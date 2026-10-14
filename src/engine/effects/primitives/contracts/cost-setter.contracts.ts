/** Every qualifying normal-base play, through real public producers and payment consumers. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, additionalCost, characterYouControl, controls, discardCostFilter, energy, event, everyIn, optionalCost, randomIn, self, staticAbility } from "../../../dsl/builders";
import { NO_DECK_MODS, type FunctionalZone } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { DeckEntry } from "../../../state/types";
import type { EngineLogRecord } from "../../../log";
import { copiableCostOf } from "../../../continuous/characteristics";
import { stateHash } from "../../../state/hash";
import { SIDES, opponent, type Side } from "../../../state/ids";
import { NO_PROMPTS } from "../../../steps/sources";
import { SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import { invariantViolations } from "../../../testing/invariants";
import { determinize } from "../../../view/determinize";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import * as p from "../index";
import { nthFixture, nthPlay, nthSettle } from "./cost-modifier-nth-support";

const filter = { cardType: "character", costAtMost: 2 } as const;
const card = (index: number, fields: Partial<EngineCardDefinition> = {}): EngineCardDefinition => ({
  ...v.vanilla2, id: syntheticId(0x696200 + index), status: "authored", abilities: () => [], ...fields,
});
const provider = (index = 0, zone: FunctionalZone = "play", amount = 0) => card(index, {
  costs: [energy(1)], abilities: () => [staticAbility(p.costSetter("you", filter, amount), { zone }), activated([], p.returnToHand(self()))],
});
const sliceOf = (committed: BattleSlice["committed"]): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function saved(slice: BattleSlice) {
  return { mode: { kind: "journey" }, init: { battleId: parseBattleId("battle-continuous-setter"), siteId: parseSiteId("site-continuous-setter"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-continuous-setter"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "continuous-setter", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as BattleSlice } };
}

for (const side of SIDES) describe(`${side} continuous matching cost setter`, () => {
  it("sets every successive qualifying 0/1/2 play, excludes 3 and events, and preserves physical identities", () => {
    const source = provider(), subject = card(1);
    const f = nthFixture(side, [source, subject], { back: [source.id], hand: [v.vanilla0.id, v.vanilla1.id, subject.id, subject.id, v.vanilla3.id, v.event1.id], energy: 4 });
    let state = f.state;
    const original = stateHash(state);
    for (let index = 0; index < 4; index++) {
      const id = f.ids[side].hand[index];
      for (let preview = 0; preview < 2; preview++) {
        expect(f.engine.view(state, side).instances[id]?.characteristics.cost).toBe(0);
        expect(f.engine.legalActions(state, side)).toContainEqual({ kind: "play", card: id, from: "hand" });
      }
      const result = nthPlay(f.engine, state, side, id);
      expect(result.state.sides[side].currentEnergy).toBe(4);
      expect(result.state.turnLog.played[side].map(record => record.instance)).toEqual(f.ids[side].hand.slice(0, index + 1));
      expect(result.events.filter(e => e.kind === "cardPlayed")).toHaveLength(1);
      state = result.state;
    }
    expect(f.ids[side].hand[2]).not.toBe(f.ids[side].hand[3]);
    expect(f.engine.view(state, side).instances[f.ids[side].hand[4]]?.characteristics.cost).toBe(3);
    expect(f.engine.view(state, side).instances[f.ids[side].hand[5]]?.characteristics.cost).toBe(1);
    expect(state.turnLog.played[opponent(side)]).toEqual([]);
    expect(stateHash(f.state)).toBe(original);
    expect(invariantViolations(state, f.engine.catalog)).toEqual([]);
  });

  it("an ordinary source pays in hand, then discounts later plays until its public departure", () => {
    const source = provider(), subject = card(2);
    const f = nthFixture(side, [source, subject], { hand: [source.id, subject.id, subject.id], energy: 3 });
    const sourceId = f.ids[side].hand[0];
    expect(f.engine.view(f.state, side).instances[sourceId]?.characteristics.cost).toBe(1);
    let state = nthPlay(f.engine, f.state, side, sourceId).state;
    state = nthPlay(f.engine, state, side, f.ids[side].hand[1]).state;
    expect(state.sides[side].currentEnergy).toBe(2);
    state = nthSettle(f.engine, f.engine.apply(state, side, { kind: "activate", source: sourceId, ability: 1 }, NO_PROMPTS).state);
    expect(state.instances[sourceId].zone).toBe("hand");
    expect(f.engine.view(state, side).instances[f.ids[side].hand[2]]?.characteristics.cost).toBe(2);
    expect(nthPlay(f.engine, state, side, f.ids[side].hand[2]).state.sides[side].currentEnergy).toBe(0);
  });

  for (const zone of ["hand", "void", "any"] as const) it(`reads its existing ${zone} functional zone without a saved modifier`, () => {
    const source = provider(3, zone), subject = card(4);
    const place = zone === "void" ? { void: [source.id] } : { hand: [source.id] };
    const f = nthFixture(side, [source, subject], { ...place, hand: [...(place.hand ?? []), subject.id] });
    const id = f.ids[side].hand[f.ids[side].hand.length - 1];
    expect(nthPlay(f.engine, f.state, side, id).state.sides[side].currentEnergy).toBe(30);
    expect(f.state.floating).toEqual([]);
  });

  it("an any-zone source in deck applies, while a hand-only source in deck does not", () => {
    const subject = card(5);
    for (const zone of ["any", "hand"] as const) {
      const source = provider(6, zone);
      const f = nthFixture(side, [source, subject], { deck: [source.id, v.vanilla1.id], hand: [subject.id] });
      expect(nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state.sides[side].currentEnergy).toBe(zone === "any" ? 30 : 28);
    }
  });

  it("current controller, relative opponent, and a live board condition determine who receives the base", () => {
    const source = provider(7), subject = card(8);
    const steal = card(9, { cardType: "event", spark: null, costs: [energy(0)], abilities: () => [event(p.gainControl({ kind: "all", selector: { controller: "opponent" } }))] });
    const f = nthFixture(side, [source, subject, steal], { hand: [steal.id, subject.id] }, { back: [source.id] });
    expect(f.engine.view(f.state, side).instances[f.ids[side].hand[1]]?.characteristics.cost).toBe(2);
    const changed = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state;
    expect(changed.instances[f.ids[opponent(side)].back[0]!].controller).toBe(side);
    expect(nthPlay(f.engine, changed, side, f.ids[side].hand[1]).state.sides[side].currentEnergy).toBe(30);
    const opposing = card(10, { abilities: () => [staticAbility(p.costSetter("opponent", filter, 0))] });
    const g = nthFixture(side, [opposing, subject], { hand: [subject.id] }, { back: [opposing.id] });
    expect(nthPlay(g.engine, g.state, side, g.ids[side].hand[0]).state.sides[side].currentEnergy).toBe(30);
    const gated = card(11, { abilities: () => [staticAbility(p.costSetter("you", filter, 0), { while: controls(characterYouControl(), 2) })] });
    const h = nthFixture(side, [gated, subject], { back: [gated.id], hand: [subject.id, subject.id] });
    const first = nthPlay(h.engine, h.state, side, h.ids[side].hand[0]).state;
    expect(first.sides[side].currentEnergy).toBe(28);
    expect(nthPlay(h.engine, first, side, h.ids[side].hand[1]).state.sides[side].currentEnergy).toBe(28);
  });

  it("qualifies copiable variant and deck costs and current type, independently of paid-cost setters", () => {
    const source = provider(), three = card(12, { costs: [energy(3)] });
    const spell = card(13, { cardType: "event", spark: null });
    const entries: readonly DeckEntry[] = [
      { cardId: three.id, amplified: true },
      { cardId: three.id, deckMods: { ...NO_DECK_MODS, costReduction: 1 } },
      { cardId: spell.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character" as const, subtype: "Mage" } } },
      { cardId: three.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event" as const, subtype: "" } } },
    ];
    const f = nthFixture(side, [source, three, spell], { back: [source.id], hand: entries });
    expect(f.ids[side].hand.map(id => copiableCostOf(f.state, f.engine.catalog, id))).toEqual([3, 2, 2, 3]);
    expect(f.ids[side].hand.map(id => f.engine.view(f.state, side).instances[id]?.characteristics.cost)).toEqual([3, 0, 0, 3]);
    const variantSource = card(25, { costs: [energy(0)], abilities: variant => [staticAbility(p.costSetter("you", filter, variant.amplified ? 1 : 0), { zone: "any" })] });
    for (const amplified of [false, true]) {
      const variantFixture = nthFixture(side, [variantSource, spell], { hand: [{ cardId: variantSource.id, amplified }, { cardId: spell.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Mage" } } }] });
      expect(nthPlay(variantFixture.engine, variantFixture.state, side, variantFixture.ids[side].hand[1]).state.sides[side].currentEnergy).toBe(amplified ? 29 : 30);
    }
    const changed = card(14, { cardType: "event", spark: null, costs: [energy(0)], abilities: () => [event(p.changeCardCost(randomIn("hand", 1, { costAtLeast: 3 }), { set: 1 }))] });
    const g = nthFixture(side, [source, three, changed], { back: [source.id], hand: [changed.id, three.id] });
    const next = nthPlay(g.engine, g.state, side, g.ids[side].hand[0]).state;
    expect(copiableCostOf(next, g.engine.catalog, g.ids[side].hand[1])).toBe(3);
    expect(nthPlay(g.engine, next, side, g.ids[side].hand[1]).state.sides[side].currentEnergy).toBe(29);
  });

  it("a real created hand copy qualifies by the values it copied", () => {
    const source = provider(), subject = card(15);
    const copy = card(16, { cardType: "event", spark: null, costs: [energy(0)], abilities: () => [event(p.createCopyInHand(everyIn("void", filter)))] });
    const f = nthFixture(side, [source, subject, copy], { back: [source.id], hand: [copy.id], void: [subject.id], energy: 0 });
    const copied = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state;
    const id = copied.sides[side].hand[0];
    expect(copied.instances[id].status.created).toBe(true);
    expect(copiableCostOf(copied, f.engine.catalog, id)).toBe(2);
    expect(f.engine.view(copied, side).instances[id]?.characteristics.cost).toBe(0);
    expect(nthPlay(f.engine, copied, side, id).state.sides[side].currentEnergy).toBe(0);
  });

  it("latest individual/player setters compose with taxes, reductions, clamp and the existing nth setter", () => {
    const source = provider(), subject = card(17);
    const change = card(18, { cardType: "event", spark: null, costs: [energy(0)], abilities: () => [event(p.changeCardCost(randomIn("hand", 1, { ...filter, costAtLeast: 2 }), { set: 1 }))] });
    const f = nthFixture(side, [source, subject, change], { back: [source.id], hand: [change.id, subject.id] });
    const laterOwn = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state;
    expect(nthPlay(f.engine, laterOwn, side, f.ids[side].hand[1]).state.sides[side].currentEnergy).toBe(29);
    const g = nthFixture(side, [source, subject, change], { hand: [change.id, subject.id, source.id] });
    let laterPlayer = nthPlay(g.engine, g.state, side, g.ids[side].hand[0]).state;
    expect(g.engine.view(laterPlayer, side).instances[g.ids[side].hand[1]]?.characteristics.cost).toBe(1);
    laterPlayer = nthPlay(g.engine, laterPlayer, side, g.ids[side].hand[2]).state;
    expect(g.engine.view(laterPlayer, side).instances[g.ids[side].hand[1]]?.characteristics.cost).toBe(0);
    expect(nthPlay(g.engine, laterPlayer, side, g.ids[side].hand[1]).state.sides[side].currentEnergy).toBe(29);
    const stacked = card(19, { abilities: () => [staticAbility(p.costSetter("you", filter, 1)), staticAbility(p.costSetter("you", filter, 0)),
      staticAbility(p.costModifier("you", filter, 3)), staticAbility(p.costModifier("you", filter, -1)), staticAbility(p.costModifierNth("you", filter, 2, { set: 4 }))] });
    const h = nthFixture(side, [stacked, subject], { back: [stacked.id], hand: [subject.id, subject.id, subject.id] });
    let state = h.state;
    for (const [index, paid] of [2, 6, 2].entries()) {
      const before = state.sides[side].currentEnergy;
      state = nthPlay(h.engine, state, side, h.ids[side].hand[index]).state;
      expect(before - state.sides[side].currentEnergy).toBe(paid);
    }
    const clamped = card(20, { abilities: () => [staticAbility(p.costSetter("you", filter, 0)), staticAbility(p.costModifier("you", filter, 1)), staticAbility(p.costModifier("you", filter, -3))] });
    const j = nthFixture(side, [clamped, subject], { back: [clamped.id], hand: [subject.id], energy: 0 });
    expect(nthPlay(j.engine, j.state, side, j.ids[side].hand[0]).state.sides[side].currentEnergy).toBe(0);
  });

  it("free normal bases do not waive mandatory payment, and refused/failed choices change no payment or count", () => {
    const source = provider(), mandatory = card(21, { abilities: () => [additionalCost(energy(1))] });
    const f = nthFixture(side, [source, mandatory], { back: [source.id], hand: [mandatory.id], energy: 0 });
    const fold = createFoldAdapter(f.engine), before = sliceOf(f.state);
    const intent = { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[0], from: "hand" } } as const;
    expect(f.engine.legalActions(f.state, side)).not.toContainEqual(intent.action);
    expect(fold.reduce(before, intent)).toEqual({ kind: "bounced", reason: "illegalAction" });
    expect(stateHash(before.committed)).toBe(stateHash(f.state));
    expect(f.state.sides[side].currentEnergy).toBe(0);
    expect(f.state.turnLog.played[side]).toEqual([]);
  });

  it("cancelled optional payment, saved pending reload and full intent replay preserve repeatable eligibility", () => {
    const source = provider(), subject = card(22, { abilities: () => [additionalCost(optionalCost(energy(1)), discardCostFilter({ cardType: "character" }))] });
    const f = nthFixture(side, [source, subject], { back: [source.id], hand: [subject.id, v.vanilla1.id, subject.id, v.vanilla1.id], energy: 1 });
    const logs: EngineLogRecord[] = [];
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true, log: record => logs.push(record) });
    const intent: BattleIntent = { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[0], from: "hand" } };
    const opened = applied(fold.reduce(sliceOf(f.state), intent));
    const pending = fold.pending(opened)!;
    expect(pending.prompt.purpose.role).toBe("optionalCost");
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(f.state));
    const reopened = applied(fold.reduce(cancelled, intent));
    const loaded = parseJourneyBattleFoldState(saved(reopened))!.engine.slice;
    const fresh = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
    const current = fresh.pending(loaded)!;
    expect(fresh.reduce(loaded, { kind: "answer", side: opponent(side), promptId: current.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: true }).kind).toBe("bounced");
    const accept: BattleIntent = { kind: "answer", side, promptId: current.prompt.id, value: true };
    const costChoice = applied(fresh.reduce(loaded, accept));
    const choice = fresh.pending(costChoice)!;
    expect(fresh.reduce(costChoice, { kind: "answer", side, promptId: choice.prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const pay: BattleIntent = { kind: "answer", side, promptId: choice.prompt.id, value: [f.ids[side].hand[1]] };
    const paid = applied(fresh.reduce(costChoice, pay));
    expect(paid.committed.sides[side].currentEnergy).toBe(0);
    expect(paid.committed.turnLog.played[side].map(record => record.instance)).toEqual([f.ids[side].hand[0]]);
    expect(fresh.reduce(paid, pay).kind).toBe("bounced");
    const replay = [intent, { kind: "cancel", side, promptId: pending.prompt.id } as const, intent, accept, pay].reduce((slice, entry) => applied(fold.reduce(slice, entry)), sliceOf(f.state));
    expect(stateHash(replay.committed)).toBe(stateHash(paid.committed));
    expect(f.engine.view(paid.committed, side).instances[f.ids[side].hand[2]]?.characteristics.cost).toBe(0);
    expect(logs.some(record => record.event === "engine.action" && record.action.kind === "play" && record.action.card === f.ids[side].hand[0])).toBe(true);
    expect(logs.some(record => record.event === "engine.promptOpened" && record.cardId === subject.id)).toBe(true);
    expect(invariantViolations(paid.committed, f.engine.catalog)).toEqual([]);
  });

  it("keeps a hidden source/card private while reproducing observed costs and legal actions in a sample", () => {
    const hidden = card(23, { abilities: () => [staticAbility(p.costSetter("opponent", filter, 0), { zone: "hand" })] });
    const subject = card(24);
    const f = nthFixture(side, [hidden, subject], { hand: [subject.id], energy: 0 }, { hand: [hidden.id], deck: [v.vanilla1.id] });
    const view = f.engine.view(f.state, side), other = f.engine.view(f.state, opponent(side));
    expect(view.instances[f.ids[opponent(side)].hand[0]]).toBeUndefined();
    expect(other.instances[f.ids[side].hand[0]]).toBeUndefined();
    expect(view.floating).toEqual([]);
    expect(view.instances[f.ids[side].hand[0]]?.characteristics.cost).toBe(0);
    const decklists = { [side]: [{ cardId: subject.id }, ...Array.from({ length: 20 }, () => ({ cardId: v.vanilla1.id }))],
      [opponent(side)]: [{ cardId: hidden.id }, { cardId: v.vanilla1.id }] } as Record<Side, { cardId: EngineCardDefinition["id"] }[]>;
    const sampled = determinize(view, decklists, () => 0.5, f.engine.catalog);
    expect(f.engine.view(sampled, side).instances[f.ids[side].hand[0]]?.characteristics.cost).toBe(0);
    expect(f.engine.legalActions(sampled, side)).toEqual(f.engine.legalActions(f.state, side));
    const result = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]);
    expect(result.events.some(e => e.kind === "effectStarted" && e.change.kind === "cost")).toBe(false);
    expect(result.state.sides[side].currentEnergy).toBe(0);
  });

  it("rejects a saved floating setter because its public form is static-only", () => {
    const source = provider(), f = nthFixture(side, [source], { back: [source.id] });
    const raw = saved(sliceOf(f.state));
    raw.engine.slice.committed.nextEffect = 2;
    raw.engine.slice.committed.floating.push({ id: "e1", source: f.ids[side].back[0]!, controller: side, timestamp: 0, expiry: { at: "never" },
      change: { kind: "cost", player: side, filter, amount: 0, next: false, mode: "set" } });
    expect(parseJourneyBattleFoldState(raw)).toBeNull();
  });
});

it("the public continuous setter requires a nonnegative safe whole normal base", () => {
  for (const amount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => p.costSetter("you", filter, amount)).toThrow();
  }
});
