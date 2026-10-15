/** Prepayment ordinal qualification uses committed captured plays, with normal-base setters. */
import { describe, expect, it } from "vitest";
import { activated, additionalCost, all, characterYouControl, controls, choiceCost, discardCostFilter, energy, event, keyword, randomIn, self, staticAbility } from "../../../dsl/builders";
import { triggered, triggeringCard, whenYouPlay, whenCopyTrigger } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { nextAutomaticStep } from "../../../steps/driver";
import { runStep } from "../../../steps/runner";
import { boardState } from "../../../testing/board";
import { testCatalog } from "../../../testing/synthetic-cards";
import { parseDreamsignId } from "../../../../types/identifiers";
import type { CardFilter, Speed } from "../../../dsl/types";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { SIDES, opponent } from "../../../state/ids";
import { NO_PROMPTS } from "../../../steps/sources";
import { at, passUntil } from "../../../testing/trigger-harness";
import { invariantViolations } from "../../../testing/invariants";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import { costModifierNth } from "../cost-modifier";
import { copyCard } from "../copy-card";
import { giveAllTypes } from "../give-all-types";
import { returnToHand } from "../return-to-hand";
import { takeExtraTurn } from "../take-extra-turn";
import { playFromZone } from "../play-from-zone";
import { revealDeckTop } from "../reveal-deck-top";
import { ruleModifier } from "../rule-modifier";
import { gainPoints } from "../gain-points";
import { changeCardCost } from "../modify-card-cost";
import { nthCard, nthFixture, nthPlay, nthSettle } from "./cost-modifier-nth-support";

const sliceOf = (committed: BattleSlice["committed"]): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify(result));
  return result.slice;
}
function saved(slice: BattleSlice) {
  return { mode: { kind: "journey" }, init: { battleId: parseBattleId("battle-nth-cost"), siteId: parseSiteId("site-nth-cost"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-nth-cost"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "nth-cost", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as BattleSlice } };
}

for (const side of SIDES) describe(`${side} static nth costs`, () => {
  for (const nth of [1, 2, 3]) for (const mode of ["set", "reduce"] as const) {
    it(`${mode} applies to qualifying play ${nth} before payment, once at cost zero too`, () => {
      const filter = { cardType: "character", costAtMost: 2 } as const;
      const provider = nthCard(1, { costs: [energy(0)], abilities: () => [staticAbility(costModifierNth("you", filter, nth, mode === "set" ? { set: 0 } : { reduce: 1 }))] });
      const subject = nthCard(2);
      const f = nthFixture(side, [provider, subject], { back: [provider.id], hand: [subject.id, subject.id, subject.id] });
      let state = f.state;
      for (let index = 0; index < 3; index++) {
        const id = f.ids[side].hand[index];
        const expected = index === nth - 1 ? mode === "set" ? 0 : 1 : 2;
        for (let preview = 0; preview < 2; preview++) {
          expect(f.engine.view(state, side).instances[id]?.characteristics.cost).toBe(expected);
          expect(f.engine.legalActions(state, side)).toContainEqual({ kind: "play", card: id, from: "hand" });
          expect(state.turnLog.played[side]).toHaveLength(index);
        }
        const before = state.sides[side].currentEnergy;
        const result = nthPlay(f.engine, state, side, id);
        expect(before - result.state.sides[side].currentEnergy).toBe(expected);
        expect(result.events.filter(e => e.kind === "cardPlayed")).toHaveLength(1);
        expect(result.state.turnLog.played[side].map(record => record.instance)).toEqual(f.ids[side].hand.slice(0, index + 1));
        expect(result.state.turnLog.played[opponent(side)]).toEqual([]);
        expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
        state = result.state;
      }
    });
  }

  it("a zero-copiable-cost matching play occupies first even though no energy is paid", () => {
    const provider = nthCard(3, { abilities: () => [staticAbility(costModifierNth("you", { cardType: "character", costAtMost: 2 }, 1, { set: 0 }))] });
    const zero = nthCard(4, { costs: [energy(0)] }), two = nthCard(5);
    const f = nthFixture(side, [provider, zero, two], { back: [provider.id], hand: [zero.id, two.id] });
    const first = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]);
    expect(first.state.sides[side].currentEnergy).toBe(30);
    expect(f.engine.view(first.state, side).instances[f.ids[side].hand[1]]?.characteristics.cost).toBe(2);
    expect(nthPlay(f.engine, first.state, side, f.ids[side].hand[1]).state.sides[side].currentEnergy).toBe(28);
  });

  it("nonmatching types and cost above the inclusive cap do not occupy first", () => {
    const provider = nthCard(6, { abilities: () => [staticAbility(costModifierNth("you", { cardType: "character", costAtMost: 2 }, 1, { set: 0 }))] });
    const three = nthCard(7, { costs: [energy(3)] });
    const spell = nthCard(8, { cardType: "event", spark: null, costs: [energy(1)], abilities: () => [event(gainPoints(0))] });
    const two = nthCard(9);
    const f = nthFixture(side, [provider, three, spell, two], { back: [provider.id], hand: [three.id, spell.id, two.id] });
    let state = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state;
    state = nthPlay(f.engine, state, side, f.ids[side].hand[1]).state;
    expect(state.sides[side].currentEnergy).toBe(26);
    expect(f.engine.view(state, side).instances[f.ids[side].hand[2]]?.characteristics.cost).toBe(0);
    expect(nthPlay(f.engine, state, side, f.ids[side].hand[2]).state.sides[side].currentEnergy).toBe(26);
  });

  for (const speed of ["fast", "interrupt"] as const satisfies readonly Speed[]) it(`${speed} matches Fast, while Standard and another subtype do not`, () => {
    const filter = { cardType: "character", subtype: "Warrior", fast: true } as const;
    const provider = nthCard(10, { abilities: () => [staticAbility(costModifierNth("you", filter, 2, { reduce: 2 }))] });
    const standard = nthCard(11, { subtype: "Warrior" }), mage = nthCard(12, { subtype: "Mage", speed });
    const match = nthCard(13, { subtype: "Warrior", speed });
    const f = nthFixture(side, [provider, standard, mage, match], { back: [provider.id], hand: [standard.id, mage.id, match.id, match.id] });
    let state = f.state;
    for (let i = 0; i < 3; i++) state = nthPlay(f.engine, state, side, f.ids[side].hand[i]).state;
    expect(state.sides[side].currentEnergy).toBe(24);
    expect(nthPlay(f.engine, state, side, f.ids[side].hand[3]).state.sides[side].currentEnergy).toBe(24);
  });

  it("the player named relative to the source is the payer whose history is counted", () => {
    const source = nthCard(14, { abilities: () => [staticAbility(costModifierNth("opponent", { cardType: "character" }, 1, { set: 0 }))] });
    const subject = nthCard(15);
    const f = nthFixture(side, [source, subject], { hand: [subject.id] }, { back: [source.id] });
    expect(nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state.sides[side].currentEnergy).toBe(30);
  });

  it("a source in hand pays normally, and its qualifying committed play occupies first", () => {
    const source = nthCard(16, { costs: [energy(1)], abilities: () => [keyword("veil"), staticAbility(costModifierNth("you", { cardType: "character", costAtMost: 2 }, 1, { set: 0 }))] });
    const subject = nthCard(17);
    const f = nthFixture(side, [source, subject], { hand: [source.id, subject.id] });
    expect(f.engine.view(f.state, side).instances[f.ids[side].hand[0]]?.characteristics.cost).toBe(1);
    const entered = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state;
    expect(entered.sides[side].currentEnergy).toBe(29);
    expect(f.engine.view(entered, side).instances[f.ids[side].hand[1]]?.characteristics.cost).toBe(2);
    expect(nthPlay(f.engine, entered, side, f.ids[side].hand[1]).state.sides[side].currentEnergy).toBe(27);
  });

  it("a matching play before the source entered still occupies first", () => {
    const source = nthCard(18, { costs: [energy(4)], abilities: () => [staticAbility(costModifierNth("you", { cardType: "character", costAtMost: 2 }, 1, { set: 0 }))] });
    const subject = nthCard(19);
    const f = nthFixture(side, [source, subject], { hand: [subject.id, source.id, subject.id] });
    let state = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state;
    state = nthPlay(f.engine, state, side, f.ids[side].hand[1]).state;
    expect(nthPlay(f.engine, state, side, f.ids[side].hand[2]).state.sides[side].currentEnergy).toBe(22);
  });

  it("a matching play while the static board condition was false still occupies first", () => {
    const source = nthCard(20, { abilities: () => [staticAbility(costModifierNth("you", { cardType: "character" }, 1, { set: 0 }), { while: controls(characterYouControl(), 2) })] });
    const subject = nthCard(21);
    const f = nthFixture(side, [source, subject], { back: [source.id], hand: [subject.id, subject.id] });
    const first = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state;
    expect(first.sides[side].currentEnergy).toBe(28);
    expect(nthPlay(f.engine, first, side, f.ids[side].hand[1]).state.sides[side].currentEnergy).toBe(26);
  });

  it("captured all-types qualification survives return and loss of the granting source", () => {
    const filter: CardFilter = { cardType: "character", subtype: "Warrior" };
    const provider = nthCard(22, { abilities: () => [staticAbility(costModifierNth("you", filter, 2, { set: 0 }))] });
    const giver = nthCard(23, { costs: [energy(0)], abilities: () => [activated([], giveAllTypes(all(characterYouControl()), "whileSourceInPlay")), activated([], returnToHand(self()))] });
    const mage = nthCard(24, { subtype: "Mage", abilities: () => [activated([], returnToHand(self()))] }), warrior = nthCard(25, { subtype: "Warrior" });
    const f = nthFixture(side, [provider, giver, mage, warrior], { back: [provider.id, giver.id, mage.id], hand: [warrior.id] });
    const giverId = f.ids[side].back[1]!, mageId = f.ids[side].back[2]!;
    let state = nthSettle(f.engine, f.engine.apply(f.state, side, { kind: "activate", source: giverId, ability: 0 }, NO_PROMPTS).state);
    state = nthSettle(f.engine, f.engine.apply(state, side, { kind: "activate", source: mageId, ability: 0 }, NO_PROMPTS).state);
    state = nthPlay(f.engine, state, side, mageId).state;
    expect(state.turnLog.played[side][0]).toMatchObject({ instance: mageId, subtype: "Mage", allTypes: true });
    state = nthSettle(f.engine, f.engine.apply(state, side, { kind: "activate", source: giverId, ability: 1 }, NO_PROMPTS).state);
    expect(f.engine.view(state, side).instances[mageId]?.characteristics.allTypes).toBe(false);
    expect(nthPlay(f.engine, state, side, f.ids[side].hand[0]).state.sides[side].currentEnergy).toBe(28);
  });

  it("stack copies and their cessation do not consume another matching ordinal", () => {
    const filter = { cardType: "event" } as const;
    const provider = nthCard(26, { abilities: () => [staticAbility(costModifierNth("you", filter, 2, { set: 0 })), triggered(whenYouPlay(filter), copyCard(triggeringCard()))] });
    const subject = nthCard(27, { cardType: "event", spark: null, abilities: () => [event(gainPoints(0))] });
    const f = nthFixture(side, [provider, subject], { back: [provider.id], hand: [subject.id, subject.id] });
    const first = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]);
    expect(first.state.turnLog.played[side]).toHaveLength(1);
    const second = nthPlay(f.engine, first.state, side, f.ids[side].hand[1]);
    expect(second.state.sides[side].currentEnergy).toBe(28);
    expect(second.state.turnLog.played[side]).toHaveLength(2);
  });

  it("a new global turn and an extra turn each reset both sides' qualification", () => {
    const provider = nthCard(28, { abilities: () => [staticAbility(costModifierNth("you", { cardType: "character" }, 1, { set: 0 }))] });
    const subject = nthCard(29), extra = nthCard(30, { cardType: "event", spark: null, costs: [energy(0)], abilities: () => [event(takeExtraTurn())] });
    const f = nthFixture(side, [provider, subject, extra], { back: [provider.id], hand: [subject.id, extra.id, subject.id, subject.id] });
    let state = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state;
    state = nthPlay(f.engine, state, side, f.ids[side].hand[1]).state;
    const number = state.turn.turnNumber;
    state = passUntil(f.engine, state, next => next.turn.turnNumber > number && at(f.engine, side, "day")(next)).state;
    expect(state.turnLog.played).toEqual({ player: [], enemy: [] });
    const paid = nthPlay(f.engine, state, side, f.ids[side].hand[2]).state;
    expect(paid.sides[side].currentEnergy).toBe(state.sides[side].currentEnergy);
    state = passUntil(f.engine, paid, next => next.turn.turnNumber > number + 1 && at(f.engine, side, "day")(next)).state;
    expect(state.turnLog.played).toEqual({ player: [], enemy: [] });
    expect(nthPlay(f.engine, state, side, f.ids[side].hand[3]).state.sides[side].currentEnergy).toBe(state.sides[side].currentEnergy);
  });

  it("a later own normal-base setter wins over the earlier nth setter in payment and preview", () => {
    const filter = { cardType: "character", costAtMost: 2 } as const;
    const provider = nthCard(31, { abilities: () => [staticAbility(costModifierNth("you", filter, 1, { set: 0 }))] });
    const subject = nthCard(32);
    const setter = nthCard(33, { cardType: "event", spark: null, costs: [energy(0)], abilities: () => [event(changeCardCost(randomIn("hand", 1, filter), { set: 1 }))] });
    const f = nthFixture(side, [provider, subject, setter], { back: [provider.id], hand: [setter.id, subject.id] });
    const changed = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state;
    expect(nthPlay(f.engine, changed, side, f.ids[side].hand[1]).state.sides[side].currentEnergy).toBe(29);
    expect(f.engine.view(changed, side).instances[f.ids[side].hand[1]]?.characteristics.cost).toBe(1);
  });

  for (const reentry of [false, true]) it(`later nth provider ${reentry ? "reentry" : "entry"} wins over an existing individual setter`, () => {
    const filter = { cardType: "character", subtype: "Warrior" } as const;
    const provider = nthCard(40, { subtype: "Mage", costs: [energy(4)], abilities: () => [
      staticAbility(costModifierNth("you", filter, 1, { set: 0 })), activated([], returnToHand(self())),
    ] });
    const subject = nthCard(41, { subtype: "Warrior" });
    const setter = nthCard(42, { cardType: "event", spark: null, costs: [energy(0)], abilities: () => [event(changeCardCost(randomIn("hand", 1, filter), { set: 1 }))] });
    const f = nthFixture(side, [provider, subject, setter], { back: reentry ? [provider.id] : [],
      hand: [setter.id, subject.id, ...(reentry ? [] : [provider.id])] });
    const providerId = reentry ? f.ids[side].back[0]! : f.ids[side].hand[2];
    const subjectId = f.ids[side].hand[1];
    let state = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state;
    expect(f.engine.view(state, side).instances[subjectId]?.characteristics.cost).toBe(1);
    if (reentry) state = nthSettle(f.engine, f.engine.apply(state, side, { kind: "activate", source: providerId, ability: 1 }, NO_PROMPTS).state);
    state = nthPlay(f.engine, state, side, providerId).state;
    expect(f.engine.view(state, side).instances[subjectId]?.characteristics.cost).toBe(0);
    const before = state.sides[side].currentEnergy;
    const played = nthPlay(f.engine, state, side, subjectId);
    expect(before - played.state.sides[side].currentEnergy).toBe(0);
    expect(played.state.turnLog.played[side].filter(record => record.instance === subjectId)).toHaveLength(1);
  });

  it("applies nth qualification to the actual known deck top permission", () => {
    const filter = { cardType: "event" } as const;
    const provider = nthCard(43, { abilities: () => [staticAbility(costModifierNth("you", filter, 1, { set: 0 })),
      staticAbility(playFromZone("deck", filter)), staticAbility(revealDeckTop())] });
    const subject = nthCard(44, { cardType: "event", spark: null, abilities: () => [event(gainPoints(0))] });
    const f = nthFixture(side, [provider, subject], { back: [provider.id], deck: [subject.id, subject.id], energy: 2 });
    const [first, second] = f.ids[side].deck;
    expect(f.engine.legalActions(f.state, side)).toContainEqual({ kind: "play", card: first, from: "deck" });
    const played = nthPlay(f.engine, f.state, side, first, "deck");
    expect(played.state.sides[side].currentEnergy).toBe(2);
    expect(f.engine.view(played.state, side).instances[second]?.characteristics.cost).toBe(2);
    expect(nthPlay(f.engine, played.state, side, second, "deck").state.sides[side].currentEnergy).toBe(0);
  });

  it("offers an nth play at its least mandatory choice energy and rejects one less", () => {
    const provider = nthCard(45, { abilities: () => [staticAbility(costModifierNth("you", { cardType: "event" }, 1, { set: 0 }))] });
    const subject = nthCard(46, { cardType: "event", spark: null, abilities: () => [additionalCost(choiceCost([energy(2)], [energy(4)])), event(gainPoints(0))] });
    for (const energy of [1, 2]) {
      const f = nthFixture(side, [provider, subject], { back: [provider.id], hand: [subject.id], energy });
      const action = { kind: "play", card: f.ids[side].hand[0], from: "hand" } as const;
      if (energy === 2) expect(f.engine.legalActions(f.state, side)).toContainEqual(action);
      else expect(f.engine.legalActions(f.state, side)).not.toContainEqual(action);
      if (energy === 2) {
        const paid = nthPlay(f.engine, f.state, side, action.card, "hand", { answer: () => 0 });
        expect(paid.state.sides[side].currentEnergy).toBe(0);
        expect(paid.state.turnLog.played[side].map(record => record.instance)).toEqual([action.card]);
      }
    }
  });

  it.each([false, true])("proves the nth copy FIFO while preserving an unreviewed static guard=%s", unreviewed => {
    const sign = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000704001");
    const subject = nthCard(47, { cardType: "event", spark: null, costs: [energy(0)], abilities: () => [event(gainPoints(0))] });
    const engine = createEngine(testCatalog([subject], { dreamsigns: [{ id: sign, status: "authored", abilities: () => [
      staticAbility(costModifierNth("you", { cardType: "event" }, 2, { set: 0 })),
      triggered(whenYouPlay({ cardType: "event" }), copyCard(triggeringCard())),
      triggered(whenCopyTrigger("you", { cardType: "event" }), copyCard(triggeringCard())),
      ...(unreviewed ? [staticAbility(ruleModifier({ rule: "carryEnergy" }))] : []),
    ] }] }));
    const f = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [subject.id], dreamsigns: [sign] } });
    const initial = { ...f.state, config: { ...f.state.config, mandatoryLoopCheckFrom: 8, mandatoryLoopWindow: 16, resolutionCap: 128 } };
    const played = runStep(initial, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS, engine.catalog);
    if (played.kind !== "done") throw new Error("Synthetic play unexpectedly suspended");
    let state = played.state, copies = 0;
    for (let i = 0; i < 24 && state.result === null; i++) {
      const step = nextAutomaticStep(state, engine.catalog, engine.memo);
      if (step === null) throw new Error("Expected renewing copy FIFO");
      const input = serializeState(state), loaded = deserializeState(input);
      const next = runStep(loaded, step, NO_PROMPTS, engine.catalog, { automatic: true });
      expect(serializeState(loaded)).toBe(input);
      if (next.kind !== "done") throw new Error("Synthetic copy unexpectedly suspended");
      copies += next.events.filter(e => e.kind === "cardCopied").length;
      state = next.state;
    }
    expect(copies).toBeGreaterThan(1);
    expect(state.result).toEqual(unreviewed ? null : { kind: "draw", reason: "mandatoryLoop" });
    if (!unreviewed) expect(state.automaticSteps).toBe(initial.config.mandatoryLoopCheckFrom);
    expect(state.turn).toEqual(initial.turn);
    expect(state.turnLog.played[side]).toHaveLength(1);
  });

  it("cancel, saved reload, illegal/foreign/stale and concurrent answers never double-consume first", () => {
    const provider = nthCard(34, { abilities: () => [staticAbility(costModifierNth("you", { cardType: "character" }, 1, { set: 0 }))] });
    const subject = nthCard(35, { abilities: () => [additionalCost(discardCostFilter({ cardType: "character" }))] }), fodder = nthCard(36);
    const f = nthFixture(side, [provider, subject, fodder], { back: [provider.id], hand: [subject.id, fodder.id, fodder.id], energy: 0 });
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
    const intent = { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[0], from: "hand" } } as const;
    const opened = applied(fold.reduce(sliceOf(f.state), intent));
    const pending = fold.pending(opened)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", min: 1, max: 1 });
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(f.state));
    const reopened = applied(fold.reduce(cancelled, intent));
    expect(fold.reduce(reopened, { kind: "answer", side, promptId: pending.prompt.id, value: [f.ids[side].hand[1]] }).kind).toBe("bounced");
    const loaded = parseJourneyBattleFoldState(saved(reopened))!.engine.slice;
    const fresh = createFoldAdapter(f.engine, { checkEventPrefix: true });
    const next = fresh.pending(loaded)!;
    expect(fresh.reduce(loaded, { kind: "answer", side: opponent(side), promptId: next.prompt.id, value: [f.ids[side].hand[1]] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(loaded, { kind: "answer", side, promptId: next.prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const answer = { kind: "answer", side, promptId: next.prompt.id, value: [f.ids[side].hand[1]] } as const;
    const paid = applied(fresh.reduce(loaded, answer));
    expect(paid.committed.sides[side].currentEnergy).toBe(0);
    expect(paid.committed.turnLog.played[side].map(record => record.instance)).toEqual([f.ids[side].hand[0]]);
    expect(paid.committed.instances[f.ids[side].hand[1]].zone).toBe("void");
    expect(fresh.reduce(paid, answer).kind).toBe("bounced");
    expect(stateHash(applied(fold.reduce(reopened, answer)).committed)).toBe(stateHash(paid.committed));
    expect(f.engine.view(paid.committed, side).instances[f.ids[side].hand[2]]?.characteristics.cost).toBe(2);
    expect(invariantViolations(paid.committed, f.engine.catalog)).toEqual([]);
  });

  it("saved floating records reject static-only ordinal and set fields", () => {
    const source = nthCard(37), f = nthFixture(side, [source], { back: [source.id] });
    const baseline = saved(sliceOf(f.state));
    baseline.engine.slice.committed.nextEffect = 2;
    baseline.engine.slice.committed.floating.push({ id: "e1", source: f.ids[side].back[0]!, controller: side, timestamp: 0, expiry: { at: "never" },
      change: { kind: "cost", player: side, filter: {}, amount: 0, next: false } });
    expect(parseJourneyBattleFoldState(baseline)).not.toBeNull();
    for (const fields of [{ nth: 1 }, { nth: 1, mode: "set" as const }]) {
      const raw = saved(baseline.engine.slice);
      const effect = raw.engine.slice.committed.floating[0];
      if (effect.change.kind !== "cost") throw new Error("Expected baseline numeric cost change");
      raw.engine.slice.committed.floating[0] = { ...effect, change: { ...effect.change, ...fields } };
      expect(parseJourneyBattleFoldState(raw)).toBeNull();
    }
  });
});

it("the public nth builder rejects unsafe ordinals and negative payment components", () => {
  for (const nth of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) expect(() => costModifierNth("you", {}, nth, { set: 0 })).toThrow();
  for (const amount of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) expect(() => costModifierNth("you", {}, 1, { reduce: amount })).toThrow();
});
