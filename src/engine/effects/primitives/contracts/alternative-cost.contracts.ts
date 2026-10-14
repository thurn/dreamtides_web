/** Card-defined replacement costs, through the real public engine on both actors. */
import { describe, expect, it } from "vitest";
import { additionalCost, alternativeCost, choiceCost, discardCostFilter, energy, energyX, event, giveOpponentPointsCost, keyword, optionalCost, playCondition, pointsCost, reclaim, stackItem, characterYouControl, target, x, staticAbility } from "../../../dsl/builders";
import type { Cost } from "../../../dsl/types";
import { playRoutes } from "../../../rules/timing";
import { opponent, SIDES } from "../../../state/ids";
import { NO_PROMPTS } from "../../../steps/sources";
import { passUntil } from "../../../testing/trigger-harness";
import { SYNTHETIC as v } from "../../../testing/synthetic-cards";
import { revealToBoth } from "../../../view/knowledge";
import { costModifier } from "../cost-modifier";
import { gainPoints } from "../gain-points";
import { playFromZone } from "../play-from-zone";
import { playImmediately } from "../play-immediately";
import { cannotPlay } from "../play-restriction";
import { returnToHand } from "../return-to-hand";
import { prevent } from "../prevent";
import { copyCard } from "../copy-card";
import { ruleModifier } from "../rule-modifier";
import { alternativeAnswers, alternativeCard, alternativeFixture, offeredAlternative } from "./alternative-cost-support";

const quiet = event(gainPoints(0));
describe.each(SIDES)("alternativeCost by %s", side => {
  const other = opponent(side);
  it("pays the selected route only, before the card is played and before its target dissolves", () => {
    for (const route of ["normal", "alternativeCost"] as const) {
      const f = alternativeFixture(side);
      const answers = alternativeAnswers(route);
      const result = f.engine.apply(f.state, side, f.action, answers.source);
      expect(result.state.sides[side].currentEnergy).toBe(route === "normal" ? 7 : 10);
      expect(result.state.sides[side].score).toBe(0);
      expect(result.state.sides[other].score).toBe(route === "normal" ? 0 : 5);
      expect(result.state.stack).toHaveLength(1);
      expect(result.state.instances[f.ids[other].back[0]!].zone).toBe("play");
      expect(result.state.turnLog.played[side]).toHaveLength(1);
      const grants = result.events.filter(event => event.kind === "pointsScored");
      expect(grants).toEqual(route === "normal" ? [] : [{ kind: "pointsScored", side: other, amount: 5, cause: "effect" }]);
      if (route === "alternativeCost") expect(result.events.findIndex(event => event.kind === "pointsScored")).toBeLessThan(result.events.findIndex(event => event.kind === "cardPlayed"));
      const resolved = f.engine.apply(result.state, other, { kind: "pass" }, NO_PROMPTS);
      expect(resolved.state.instances[f.ids[other].back[0]!].zone).toBe("void");
      expect(resolved.state.instances[f.id].zone).toBe("void");
      expect(resolved.state.sides[other].score).toBe(route === "normal" ? 0 : 5);
    }
  });
  it("offers zero-energy payment with zero payer score and keeps grant exact under taxes and reductions", () => {
    for (const [tax, reduction, available, paid] of [[0, 0, 0, 0], [3, 1, 3, 2], [1, 4, 0, 0]] as const) {
      const provider = alternativeCard(2, [staticAbility(costModifier("you", {}, tax)), staticAbility(costModifier("you", {}, -reduction))], { cardType: "character", spark: 1 });
      const f = alternativeFixture(side, alternativeCard(1), { back: [provider.id], energy: available }, {}, [provider]);
      expect(offeredAlternative(f)).toBe(true);
      const result = f.engine.apply(f.state, side, f.action, alternativeAnswers().source);
      expect(result.state.sides[side].currentEnergy).toBe(available - paid);
      expect(result.state.sides[side].score).toBe(0);
      expect(result.state.sides[other].score).toBe(5);
    }
  });
  it("keeps targets, timing, prohibitions, play requirements and additional score budgets mandatory", () => {
    const requirement = alternativeCard(3, [alternativeCost(energy(0), giveOpponentPointsCost(5)), playCondition({ cond: "energyAtLeast", amount: 20 }), quiet]);
    const expensive = alternativeCard(4, [alternativeCost(energy(0), giveOpponentPointsCost(5)), additionalCost(pointsCost(1)), quiet]);
    const restriction = alternativeCard(5, [staticAbility(cannotPlay("you", {}))], { cardType: "character", spark: 1 });
    const cases = [alternativeFixture(side, undefined, {}, { back: [] }), alternativeFixture(side, requirement), alternativeFixture(side, expensive),
      alternativeFixture(side, undefined, { back: [restriction.id] }, {}, [restriction])];
    const wrongWindow = alternativeFixture(side);
    cases.push({ ...wrongWindow, state: { ...wrongWindow.state, turn: { ...wrongWindow.state.turn, active: other, phase: "day" as const } } });
    for (const f of cases) {
      expect(offeredAlternative(f)).toBe(false);
      expect(() => f.engine.apply(f.state, side, f.action, alternativeAnswers().source)).toThrow();
      expect(f.state.sides[other].score).toBe(0);
      expect(f.state.instances[f.id].zone).toBe("hand");
    }
  });
  it("plays the alternative as an Interrupt response to the opponent’s item", () => {
    const f = alternativeFixture(side, undefined, {}, { hand: [v.event1.id, v.interruptEvent.id] });
    const start = { ...f.state, turn: { ...f.state.turn, active: other } };
    const opener = f.engine.apply(start, other, { kind: "play", card: f.ids[other].hand[0], from: "hand" }, NO_PROMPTS);
    expect(opener.state.stack).toHaveLength(1);
    const response = f.engine.apply(opener.state, side, f.action, alternativeAnswers().source);
    expect(response.state.stack).toHaveLength(2);
    expect(response.state.stack[1]).toMatchObject({ instance: f.id, controller: side });
    expect(response.state.sides[other].score).toBe(5);
    expect(response.state.priority).toBe(other);
  });
  it("withholds a replacement fixed at X zero when a positive additional count shares that X", () => {
    const card = alternativeCard(16, [alternativeCost(energy(0), giveOpponentPointsCost(5)), additionalCost(discardCostFilter({}, { count: "x", min: 1 })), quiet], { costs: [energy(3), energyX()] });
    const f = alternativeFixture(side, card, { hand: [card.id, v.event0.id, v.event0.id] });
    const answers = alternativeAnswers("normal", { chooseX: 1 });
    const result = f.engine.apply(f.state, side, f.action, answers.source);
    const route = answers.prompts[0];
    expect(route).toMatchObject({ kind: "chooseMode", options: [{ mode: 0, legal: true }, { mode: 1, legal: false }] });
    expect(result.state.stack[0]?.x).toBe(1);
    expect(result.state.sides[other].score).toBe(0);
  });
  it("does not grant void or deck access, combine Reclaim, Offering or another event base", () => {
    const card = alternativeCard(6, [alternativeCost(energy(0), giveOpponentPointsCost(5)), reclaim(energy(2)), keyword("offering"), quiet]);
    const alone = alternativeFixture(side, card, {}, {}, [], "void");
    expect(playRoutes(alone.state, alone.engine.catalog, alone.id, "void")).toEqual(["reclaim"]);
    expect(alone.engine.apply(alone.state, side, alone.action, alternativeAnswers().source).state.sides[other].score).toBe(0);
    const deck = alternativeFixture(side, card, {}, {}, [], "deck");
    revealToBoth(deck.state, [deck.id]);
    expect(offeredAlternative(deck)).toBe(false);
    const provider = alternativeCard(7, [staticAbility(playFromZone("void", {}, { oncePerTurn: true })), staticAbility(playFromZone("deck")), staticAbility(ruleModifier({ rule: "eventAlternative", energy: 1 }))], { cardType: "character", spark: 1 });
    for (const from of ["hand", "void", "deck"] as const) {
      const f = alternativeFixture(side, card, { back: [provider.id], hand: from === "hand" ? [card.id, v.event0.id] : [] }, {}, [provider], from);
      if (from === "deck") revealToBoth(f.state, [f.id]);
      const routes = playRoutes(f.state, f.engine.catalog, f.id, from);
      expect(routes).toEqual(from === "hand" ? ["hand", "offering", "eventAlternative", "alternativeCost"] : from === "void" ? ["permission", "reclaim", "eventAlternative", "alternativeCost"] : ["permission", "eventAlternative", "alternativeCost"]);
      const paid = f.engine.apply(f.state, side, f.action, alternativeAnswers().source).state;
      expect(paid.sides[other].score).toBe(5);
      expect(paid.instances[f.id].status.playedViaReclaim).toBe(false);
      expect(paid.instances[f.id].status.offering).toBe(false);
      expect(paid.oncePerTurn.length - f.state.oncePerTurn.length).toBe(from === "void" ? 1 : 0);
    }
  });
  it("binds alternate energy-X, fixes replaced printed X, and keeps additional choices separate", () => {
    const rows = [
      { base: [energy(3), energyX()], alternate: [energy(1), energyX(), giveOpponentPointsCost(5)], x: 2, energy: 6 },
      { base: [energy(3), energyX()], alternate: [energy(0), giveOpponentPointsCost(5)], x: 0, energy: 9 },
    ];
    for (const row of rows) {
      const card = alternativeCard(8, [alternativeCost(...row.alternate), additionalCost(optionalCost(energy(1)), choiceCost([energy(0)], [pointsCost(2)])), quiet], { costs: row.base });
      const f = alternativeFixture(side, card);
      const answers = alternativeAnswers("alternativeCost", { chooseX: row.x, chooseCost: 0 });
      const paid = f.engine.apply(f.state, side, f.action, answers.source).state;
      expect(paid.stack[0]?.x).toBe(row.x);
      expect(paid.stack[0]?.optionalPaid).toEqual([true]);
      expect(paid.sides[side].currentEnergy).toBe(row.energy);
      expect(paid.sides[other].score).toBe(5);
    }
  });
  it("grants only accepted or selected payment branches and keeps ordinary payer points separate", () => {
    const card = alternativeCard(9, [additionalCost(choiceCost([giveOpponentPointsCost(2)], [pointsCost(1)]), optionalCost(giveOpponentPointsCost(3))), quiet]);
    for (const [choice, optional, score, opponentScore] of [[0, true, 4, 5], [0, false, 4, 2], [1, false, 3, 0]] as const) {
      const f = alternativeFixture(side, card, { score: 4 });
      const paid = f.engine.apply(f.state, side, f.action, alternativeAnswers("normal", { chooseCost: choice, optionalCost: optional }).source).state;
      expect(paid.sides[side].score).toBe(score);
      expect(paid.sides[other].score).toBe(opponentScore);
    }
  });
  it("binds an additional discard count on a non-X printed card without adding energy", () => {
    const card = alternativeCard(22, [alternativeCost(energy(0), giveOpponentPointsCost(5)), additionalCost(discardCostFilter({}, { count: "x", min: 1 })), event(gainPoints(x()))]);
    const f = alternativeFixture(side, card, { hand: [card.id, v.event0.id, v.event0.id] });
    const answers = alternativeAnswers("alternativeCost", { discardCost: f.ids[side].hand.slice(1) });
    const paid = f.engine.apply(f.state, side, f.action, answers.source);
    expect(paid.state.stack[0]?.x).toBe(2);
    expect(paid.state.sides[side].currentEnergy).toBe(10);
    expect(paid.state.sides[side].score).toBe(0);
    expect(paid.state.sides[other].score).toBe(5);
    expect(paid.events.filter(event => event.kind === "discarded")).toHaveLength(2);
    expect(f.engine.apply(paid.state, other, { kind: "pass" }, NO_PROMPTS).state.sides[side].score).toBe(2);
  });
  it("keeps a committed grant when an Interrupt makes its chosen target invalid", () => {
    const bouncer = alternativeCard(23, [event(returnToHand(target(characterYouControl())))], { costs: [energy(0)] });
    const f = alternativeFixture(side, undefined, {}, { hand: [bouncer.id] }, [bouncer]);
    const paid = f.engine.apply(f.state, side, f.action, alternativeAnswers().source);
    const reply = f.engine.apply(paid.state, other, { kind: "play", card: f.ids[other].hand[0], from: "hand" }, alternativeAnswers().source);
    const done = reply;
    expect(done.state.instances[f.ids[other].back[0]!].zone).toBe("hand");
    expect(done.state.instances[f.id].zone).toBe("void");
    expect(done.state.sides[other].score).toBe(5);
    expect(done.events.some(event => event.kind === "noLegalTarget")).toBe(true);
    expect(done.events.some(event => event.kind === "pointsScored")).toBe(false);
  });
  it("assigns the payment by the controller holding a foreign-owned physical card", () => {
    const borrowed = alternativeCard(24, [alternativeCost(energy(0), giveOpponentPointsCost(5)), quiet]);
    const filler = alternativeCard(25, [quiet], { costs: [energy(0)] });
    const bouncer = alternativeCard(26, [event(returnToHand({ kind: "stackTarget", selector: stackItem({ controller: "you" }) }, { toOpponentHand: true }))], { costs: [energy(0)] });
    const f = alternativeFixture(side, borrowed, { hand: [filler.id] }, { hand: [borrowed.id, bouncer.id] }, [filler, bouncer]);
    const start = { ...f.state, turn: { ...f.state.turn, active: other } };
    const id = f.ids[other].hand[0];
    const first = f.engine.apply(start, other, { kind: "play", card: id, from: "hand" }, alternativeAnswers("normal").source);
    const second = f.engine.apply(first.state, side, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const third = f.engine.apply(second.state, other, { kind: "play", card: f.ids[other].hand[1], from: "hand" }, alternativeAnswers("normal").source);
    const returned = third;
    expect(returned.state.instances[id]).toMatchObject({ owner: other, controller: side, zone: "hand" });
    const dusk = passUntil(f.engine, returned.state, state => state.turn.phase === "dusk" && f.engine.decision(state)?.side === side).state;
    const paid = f.engine.apply(dusk, side, { kind: "play", card: id, from: "hand" }, alternativeAnswers().source);
    expect(paid.state.sides[side].score).toBe(0);
    expect(paid.state.sides[other].score).toBe(5);
    expect(paid.events.filter(event => event.kind === "pointsScored")).toEqual([{ kind: "pointsScored", side: other, amount: 5, cause: "effect" }]);
  });
  it("checks victory after the play and before resolution, without dissolving the target", () => {
    const f = alternativeFixture(side, undefined, {}, { score: 20 });
    const result = f.engine.apply(f.state, side, f.action, alternativeAnswers().source);
    expect(result.state.result).toEqual({ kind: "victory", winner: other, reason: "score" });
    expect(result.state.stack[0]).toMatchObject({ instance: f.id });
    expect(result.state.instances[f.ids[other].back[0]!].zone).toBe("play");
    expect(result.events.some(event => event.kind === "resolved")).toBe(false);
  });
  it("does not refund a prevented play or charge a copied stack item", () => {
    const preventer = alternativeCard(10, [event(prevent(stackItem({ controller: "opponent" })))], { costs: [energy(0)] });
    const copier = alternativeCard(11, [event(copyCard({ kind: "stackTarget", selector: stackItem({ controller: "opponent" }) }))], { costs: [energy(0)] });
    for (const responder of [preventer, copier]) {
      const f = alternativeFixture(side, undefined, {}, { hand: [responder.id], energy: 10 }, [responder]);
      const paid = f.engine.apply(f.state, side, f.action, alternativeAnswers().source);
      const response = f.engine.apply(paid.state, other, { kind: "play", card: f.ids[other].hand[0], from: "hand" }, alternativeAnswers().source);
      const done = passUntil(f.engine, response.state, state => state.stack.length === 0, alternativeAnswers().source);
      expect(done.state.sides[other].score).toBe(5);
      expect(response.events.filter(event => event.kind === "pointsScored")).toEqual([]);
      expect(done.events.filter(event => event.kind === "pointsScored")).toEqual([]);
      expect(done.state.instances[f.id].zone).toBe("void");
      expect(done.state.turnLog.played[side]).toHaveLength(1);
    }
  });
  it("allows the card alternative during an immediate character play, with requirements preserved", () => {
    const character = alternativeCard(12, [alternativeCost(energy(0), giveOpponentPointsCost(5)), playCondition({ cond: "energyAtLeast", amount: 1 })], { cardType: "character", spark: 1 });
    const instruction = alternativeCard(13, [event(playImmediately("void"))], { costs: [energy(0)] });
    const f = alternativeFixture(side, instruction, { void: [character.id], energy: 1 }, {}, [character]);
    const source = alternativeAnswers("alternativeCost", { target: [f.ids[side].void[0]] }).source;
    const played = f.engine.apply(f.state, side, f.action, source);
    const result = f.engine.apply(played.state, other, { kind: "pass" }, source);
    expect(result.state.sides[other].score).toBe(5);
    expect(result.state.stack.some(item => item.kind === "card" && item.instance === f.ids[side].void[0])).toBe(true);
    const short = alternativeFixture(side, instruction, { void: [character.id], energy: 0 }, {}, [character]);
    const shortPlay = short.engine.apply(short.state, side, short.action, alternativeAnswers().source);
    const declined = short.engine.apply(shortPlay.state, other, { kind: "pass" }, alternativeAnswers().source);
    expect(declined.state.sides[other].score).toBe(0);
    expect(declined.state.instances[short.ids[side].void[0]].zone).toBe("void");
  });
  it("rejects malformed grant amounts and duplicate declarations instead of paying a different meaning", () => {
    for (const amount of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => giveOpponentPointsCost(amount)).toThrow();
      const costs: Cost[] = [energy(0), { cost: "giveOpponentPoints", amount }];
      const f = alternativeFixture(side, alternativeCard(14, [alternativeCost(...costs), quiet]), { energy: 0 });
      expect(offeredAlternative(f)).toBe(false);
    }
    const duplicate = alternativeCard(15, [alternativeCost(energy(0)), alternativeCost(energy(1)), quiet]);
    const f = alternativeFixture(side, duplicate);
    expect(() => playRoutes(f.state, f.engine.catalog, f.id, "hand")).toThrow(/more than one/);
  });
});
