import { describe, expect, it } from "vitest";
import { activated, additionalCost, all, characterYouControl, controls, energy, energyX, event, everyIn, keyword, optionalCost, pointsCost, reclaim, self, staticAbility, x } from "../../../dsl/builders";
import { NO_DECK_MODS, type Ability, type FunctionalZone } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { SIDES, opponent } from "../../../state/ids";
import { parseDreamsignId } from "../../../../types/identifiers";
import { stateHash } from "../../../state/hash";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { SYNTHETIC as v } from "../../../testing/synthetic-cards";
import { invariantViolations } from "../../../testing/invariants";
import * as p from "../index";
import { reclaimCard, reclaimFixture, reclaimPlay, reclaimSettle } from "./cost-modifier-reclaim-support";

const modifier = (index = 0, change: { set: number } | { reduce: number } = { set: 0 }, zone: FunctionalZone = "play") =>
  reclaimCard(index, { cardType: "character", spark: 1, subtype: v.vanilla1.subtype, costs: [energy(0)],
    abilities: () => [staticAbility(p.costModifierReclaim("you", change), { zone }), activated([], p.returnToHand(self()))] });

for (const side of SIDES) describe(`${side} Reclaim cost modifier`, () => {
  it("sets a multi-part explicit base, preserving X, mandatory energy, nonenergy and ordinary tax", () => {
    const source = modifier();
    const subject = reclaimCard(1, { abilities: () => [reclaim(energy(2), energy(3), energyX(0)), additionalCost(energy(1), pointsCost(1))] });
    const tax = reclaimCard(2, { ...v.vanilla0, id: reclaimCard(2).id, status: "authored", abilities: () => [staticAbility(p.costModifier("you", {}, 1))] });
    const f = reclaimFixture(side, [source, subject, tax], { back: [source.id, tax.id], void: [subject.id], energy: 4 });
    const id = f.ids[side].void[0], before = stateHash(f.state);
    const choices = new ScriptedSource([2]);
    let x: number | null | undefined;
    const paid = f.engine.apply(f.state, side, { kind: "play", card: id, from: "void" }, choices, (state, step) => {
      if (step.kind === "play") x = state.stack.find(item => item.kind === "card" && item.instance === id)?.x;
    });
    choices.assertExhausted();
    expect(x).toBe(2);
    expect(paid.state.sides[side].currentEnergy).toBe(0);
    expect(paid.state.sides[side].score).toBe(9);
    expect(paid.state.instances[id].status.playedViaReclaim).toBe(true);
    expect(f.engine.view(f.state, side).instances[id].characteristics).toMatchObject({ cost: 5, reclaimCost: 2 });
    expect(stateHash(f.state)).toBe(before);
    expect(invariantViolations(paid.state, f.engine.catalog)).toEqual([]);
  });

  it("bounds affordable X from the set base and keeps mandatory energy payable", () => {
    const source = modifier();
    const subject = reclaimCard(3, { abilities: () => [reclaim(energy(5), energyX(0)), additionalCost(energy(1))] });
    const f = reclaimFixture(side, [source, subject], { back: [source.id], void: [subject.id], energy: 3 });
    let maximum = -1;
    const paid = reclaimPlay(f.engine, f.state, side, f.ids[side].void[0], "void", { answer(prompt) {
      if (prompt.kind !== "chooseNumber") throw new Error("Expected X");
      maximum = prompt.max;
      return 2;
    } });
    expect(maximum).toBe(2);
    expect(paid.state.sides[side].currentEnergy).toBe(0);
    const poor = reclaimFixture(side, [source, subject], { back: [source.id], void: [subject.id], energy: 0 });
    expect(poor.engine.legalActions(poor.state, side)).not.toContainEqual({ kind: "play", card: poor.ids[side].void[0], from: "void" });
  });

  it("keeps a nonenergy-only Reclaim cost and floors an already-zero energy base", () => {
    const source = modifier(0, { reduce: 1 });
    const subject = reclaimCard(4, { abilities: () => [reclaim(pointsCost(2))] });
    const f = reclaimFixture(side, [source, subject], { back: [source.id], void: [subject.id], energy: 0, score: 2 });
    const done = reclaimPlay(f.engine, f.state, side, f.ids[side].void[0]);
    expect(f.engine.view(f.state, side).instances[f.ids[side].void[0]].characteristics.reclaimCost).toBe(-1);
    expect(done.state.sides[side].currentEnergy).toBe(0);
    expect(done.state.sides[side].score).toBe(0);
    expect(done.state.instances[f.ids[side].void[0]].zone).toBe("banished");
    const poor = reclaimFixture(side, [source, subject], { back: [source.id], void: [subject.id], energy: 0, score: 1 });
    expect(poor.engine.legalActions(poor.state, side)).not.toContainEqual({ kind: "play", card: poor.ids[side].void[0], from: "void" });
  });

  it.each(["normal", "nth", "individual"] as const)("plain Reclaim uses the latest %s or Reclaim setter without double counting", kind => {
    const subject = reclaimCard(5, { abilities: () => [keyword("reclaim")] });
    const normal = kind === "nth" ? p.costModifierNth("you", {}, 1, { set: 2 }) : p.costSetter("you", {}, 2);
    for (const reclaimLast of [false, true]) {
      const abilities: Ability[] = reclaimLast
        ? [staticAbility(normal), staticAbility(p.costModifierReclaim("you", { set: 0 }))]
        : [staticAbility(p.costModifierReclaim("you", { set: 0 })), staticAbility(normal)];
      const source = reclaimCard(6, { ...v.vanilla0, id: reclaimCard(6).id, status: "authored", abilities: () => abilities });
      const f = reclaimFixture(side, [source, subject], { back: [source.id], void: [subject.id] });
      if (kind === "individual") {
        // A resolved individual setter is synthetic starting-state data; the Reclaim producer remains a real static ability.
        if (reclaimLast) {
          f.state.instances[f.ids[side].back[0]!].enteredZoneAt = 1;
          f.state.clock = 1;
        }
        f.state.floating.push({ id: "e1", source: f.ids[side].back[0]!, controller: side, timestamp: reclaimLast ? 0 : 1,
          expiry: { at: "never" }, change: { kind: "cardCost", instance: f.ids[side].void[0], mode: "set", amount: 4 } });
        f.state.nextEffect = 2;
      }
      const result = reclaimPlay(f.engine, f.state, side, f.ids[side].void[0]);
      const expected = reclaimLast ? 0 : kind === "individual" ? 4 : 2;
      expect(f.state.sides[side].currentEnergy - result.state.sides[side].currentEnergy).toBe(expected);
    }
  });

  it("explicit Reclaim excludes later normal setters while latest Reclaim setters and reductions compose", () => {
    const subject = reclaimCard(7, { abilities: () => [reclaim(energy(5))] });
    const source = reclaimCard(8, { ...v.vanilla0, id: reclaimCard(8).id, status: "authored", abilities: () => [
      staticAbility(p.costModifierReclaim("you", { set: 1 })), staticAbility(p.costModifierReclaim("you", { set: 3 })),
      staticAbility(p.costSetter("you", {}, 9)), staticAbility(p.costModifierNth("you", {}, 1, { set: 8 })),
      staticAbility(p.costModifierReclaim("you", { reduce: 1 })), staticAbility(p.costModifierReclaim("you", { reduce: 1 })),
      staticAbility(p.costModifier("you", {}, 2)),
    ] });
    const f = reclaimFixture(side, [source, subject], { back: [source.id], void: [subject.id] });
    const result = reclaimPlay(f.engine, f.state, side, f.ids[side].void[0]);
    expect(result.state.sides[side].currentEnergy).toBe(27);
  });

  it("uses the latest costed grant, preserves it on a plain gain, and reads deck-entry Reclaim", () => {
    const source = modifier(0, { reduce: 1 });
    const subject = reclaimCard(9, { abilities: () => [reclaim(energy(5))] });
    const grants = reclaimCard(10, { costs: [energy(0)], abilities: () => [event(p.sequence(
      p.grantReclaim(everyIn("void"), { costs: [energy(4)] }), p.grantReclaim(everyIn("void"), { costs: [energy(2)] }), p.grantReclaim(everyIn("void")),
    ))] });
    const f = reclaimFixture(side, [source, subject, grants], { back: [source.id], hand: [grants.id], void: [subject.id] });
    const granted = reclaimPlay(f.engine, f.state, side, f.ids[side].hand[0], "hand").state;
    expect(f.engine.view(granted, side).instances[f.ids[side].void[0]].characteristics.reclaimCost).toBe(1);
    expect(reclaimPlay(f.engine, granted, side, f.ids[side].void[0]).state.sides[side].currentEnergy).toBe(29);

    const discard = reclaimCard(11, { costs: [energy(0)], abilities: () => [event(p.discard(1))] });
    const modified = reclaimFixture(side, [source, subject, discard], { back: [source.id], hand: [discard.id,
      { cardId: subject.id, deckMods: { ...NO_DECK_MODS, reclaim: 3, costReduction: 1 } }], energy: 4 });
    const inVoid = reclaimPlay(modified.engine, modified.state, side, modified.ids[side].hand[0], "hand").state;
    expect(modified.engine.view(inVoid, side).instances[modified.ids[side].hand[1]].characteristics.reclaimCost).toBe(2);
    const paid = reclaimPlay(modified.engine, inVoid, side, modified.ids[side].hand[1]);
    expect(paid.state.sides[side].currentEnergy).toBe(2);
  });

  it.each(["play", "hand", "void", "any"] as const)("uses the real source's %s functional zone and live board condition", zone => {
    const subject = reclaimCard(12, { abilities: () => [keyword("reclaim")] });
    const source = reclaimCard(13, { ...v.vanilla0, id: reclaimCard(13).id, status: "authored", abilities: () => [
      staticAbility(p.costModifierReclaim("you", { reduce: 1 }), { zone, while: controls(characterYouControl()) }),
    ] });
    const f = reclaimFixture(side, [source, subject], {
      hand: zone === "hand" || zone === "any" ? [source.id] : [],
      back: zone === "play" ? [source.id, v.vanilla0.id] : [v.vanilla0.id],
      void: zone === "void" ? [source.id, subject.id] : [subject.id],
    });
    expect(reclaimPlay(f.engine, f.state, side, f.ids[side].void[zone === "void" ? 1 : 0]).state.sides[side].currentEnergy).toBe(28);
    const missing = reclaimFixture(side, [source, subject], { hand: [source.id], void: [subject.id] });
    expect(reclaimPlay(missing.engine, missing.state, side, missing.ids[side].void[0]).state.sides[side].currentEnergy).toBe(27);
  });

  it("stops applying after its source departs, with distinct same-UUID subjects and no allowance consumption", () => {
    const source = modifier(0, { reduce: 1 }), subject = reclaimCard(14, { abilities: () => [keyword("reclaim")] });
    const f = reclaimFixture(side, [source, subject], { back: [source.id], void: [subject.id, subject.id] });
    const first = reclaimPlay(f.engine, f.state, side, f.ids[side].void[0]).state;
    expect(first.sides[side].currentEnergy).toBe(28);
    expect(f.ids[side].void[0]).not.toBe(f.ids[side].void[1]);
    const departed = reclaimSettle(f.engine, f.engine.apply(first, side, { kind: "activate", source: f.ids[side].back[0]!, ability: 1 }, NO_PROMPTS).state);
    expect(departed.instances[f.ids[side].back[0]!].zone).toBe("hand");
    expect(reclaimPlay(f.engine, departed, side, f.ids[side].void[1]).state.sides[side].currentEnergy).toBe(25);
    expect(first.floating.some(record => record.change.kind === "reclaimCost")).toBe(false);
  });

  it("emblem order selects the last base and opponent-relative scope follows the source controller", () => {
    const a = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000234001"), b = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000234002");
    const subject = reclaimCard(15, { abilities: () => [keyword("reclaim")] });
    const emblems = { dreamsigns: [
      { id: a, status: "authored" as const, abilities: () => [staticAbility(p.costModifierReclaim("opponent", { set: 1 }))] },
      { id: b, status: "authored" as const, abilities: () => [staticAbility(p.costModifierReclaim("opponent", { set: 2 }))] },
    ] };
    const f = reclaimFixture(side, [subject], { void: [subject.id] }, { dreamsigns: [a, b] }, emblems);
    expect(reclaimPlay(f.engine, f.state, side, f.ids[side].void[0]).state.sides[side].currentEnergy).toBe(28);
    const reversed = reclaimFixture(side, [subject], { void: [subject.id] }, { dreamsigns: [b, a] }, emblems);
    expect(reclaimPlay(reversed.engine, reversed.state, side, reversed.ids[side].void[0]).state.sides[side].currentEnergy).toBe(29);
  });

  it("grants no void access and leaves activation and resolving payments at their declared prices", () => {
    const source = modifier(), subject = reclaimCard(16);
    const payer = reclaimCard(17, { ...v.vanilla0, id: reclaimCard(17).id, status: "authored", abilities: () => [activated([energy(2)], p.payTo({ energy: 1 }, p.gainPoints(1)))] });
    const f = reclaimFixture(side, [source, subject, payer], { back: [source.id, payer.id], void: [subject.id], energy: 3 });
    expect(f.engine.legalActions(f.state, side)).not.toContainEqual({ kind: "play", card: f.ids[side].void[0], from: "void" });
    const answers = new ScriptedSource([true]);
    const result = f.engine.apply(f.state, side, { kind: "activate", source: f.ids[side].back[1]!, ability: 0 }, answers);
    const done = reclaimSettle(f.engine, result.state, answers);
    answers.assertExhausted();
    expect(done.sides[side].currentEnergy).toBe(0);
    expect(done.sides[side].score).toBe(11);
    expect(done.sides[opponent(side)].currentEnergy).toBe(30);
  });

  it.each(["plain", "explicit", "granted"] as const)("keeps a hidden hand source private while preserving observed Reclaim legality in determinization (%s)", shape => {
    const subject = reclaimCard(19, { abilities: () => shape === "plain" ? [keyword("reclaim")] : shape === "explicit" ? [reclaim(energy(4))] : [] });
    const hidden = reclaimCard(20, { abilities: () => [staticAbility(p.costModifierReclaim("opponent", { set: 0 }), { zone: "hand" })] });
    const grant = reclaimCard(23, { costs: [energy(0)], abilities: () => [event(p.grantReclaim(everyIn("void"), { costs: [energy(4)] }))] });
    const other = opponent(side);
    const f = reclaimFixture(side, [subject, hidden, grant], { void: [subject.id], hand: shape === "granted" ? [grant.id] : [], energy: 0 }, { hand: [hidden.id], deck: [v.vanilla1.id] });
    const state = shape === "granted" ? reclaimPlay(f.engine, f.state, side, f.ids[side].hand[0], "hand").state : f.state;
    const visible = f.engine.view(state, side);
    expect(visible.instances[f.ids[other].hand[0]]).toBeUndefined();
    expect(visible.floating.some(record => record.change.kind === "reclaimCost")).toBe(false);
    const action = { kind: "play", card: f.ids[side].void[0], from: "void" } as const;
    expect(visible.instances[action.card].characteristics.reclaimCost).toBe(0);
    expect(f.engine.legalActions(state, side)).toContainEqual(action);
    const decklists = { [side]: [{ cardId: subject.id }, ...(shape === "granted" ? [{ cardId: grant.id }] : []), ...Array.from({ length: 20 }, () => ({ cardId: v.vanilla1.id }))],
      [other]: [{ cardId: hidden.id }, { cardId: v.vanilla1.id }] } as Record<typeof side, { cardId: typeof subject.id }[]>;
    for (const draw of [0, 0.5, 0.99]) {
      const sampled = f.engine.determinize(visible, decklists, () => draw);
      expect(f.engine.legalActions(sampled, side)).toEqual(f.engine.legalActions(state, side));
      expect(reclaimPlay(f.engine, sampled, side, f.ids[side].void[0]).state.sides[side].currentEnergy).toBe(0);
    }
  });

  it("retains hidden reduction margin for X and paid optional energy at the zero floor", () => {
    const subject = reclaimCard(24, { abilities: () => [reclaim(energy(1), energyX(0)), additionalCost(optionalCost(energy(1))), event(p.gainPoints(x()))] });
    const hidden = reclaimCard(25, { abilities: () => [staticAbility(p.costModifierReclaim("opponent", { reduce: 3 }), { zone: "hand" })] });
    const smaller = reclaimCard(29, { abilities: () => [staticAbility(p.costModifierReclaim("opponent", { reduce: 1 }), { zone: "hand" })] });
    const other = opponent(side);
    const f = reclaimFixture(side, [subject, hidden, smaller], { void: [subject.id], energy: 1 }, { hand: [hidden.id], deck: [smaller.id] });
    const view = f.engine.view(f.state, side), id = f.ids[side].void[0];
    expect(view.instances[id].characteristics.reclaimCost).toBe(-2);
    expect(view.instances[f.ids[other].hand[0]]).toBeUndefined();
    const decklists = { [side]: [{ cardId: subject.id }, ...Array.from({ length: 20 }, () => ({ cardId: v.vanilla1.id }))],
      [other]: [{ cardId: hidden.id }, { cardId: smaller.id }] } as Record<typeof side, { cardId: typeof subject.id }[]>;
    // Both possible hand reductions floor the fixed1 price to0; X2 plus optional1 distinguishes payment1 from3.
    for (const state of [f.state, ...[0, 0.5, 0.99].map(draw => f.engine.determinize(view, decklists, () => draw))]) {
      const answers = new ScriptedSource([2, true]);
      const paid = reclaimPlay(f.engine, state, side, id, "void", answers);
      answers.assertExhausted();
      expect(paid.state.sides[side].currentEnergy).toBe(0);
      expect(paid.state.sides[side].score).toBe(12);
    }
  });

  it("keeps an any-zone hidden source anonymous across observationally equal hand/deck placements", () => {
    const subject = reclaimCard(30, { abilities: () => [reclaim(energy(2))] });
    const hidden = reclaimCard(31, { abilities: () => [staticAbility(p.costModifierReclaim("opponent", { set: 0 }), { zone: "any" })] });
    const other = opponent(side);
    const a = reclaimFixture(side, [subject, hidden], { void: [subject.id], energy: 0 }, { hand: [hidden.id], deck: [v.vanilla1.id] });
    const b = reclaimFixture(side, [subject, hidden], { void: [subject.id], energy: 0 }, { hand: [v.vanilla1.id], deck: [hidden.id] });
    const av = a.engine.view(a.state, side), bv = b.engine.view(b.state, side);
    expect(av).toEqual(bv);
    expect(av.instances[a.ids[other].hand[0]]).toBeUndefined();
    const decklists = { [side]: [{ cardId: subject.id }, ...Array.from({ length: 20 }, () => ({ cardId: v.vanilla1.id }))],
      [other]: [{ cardId: hidden.id }, { cardId: v.vanilla1.id }] } as Record<typeof side, { cardId: typeof subject.id }[]>;
    const as = a.engine.determinize(av, decklists, () => 0), bs = b.engine.determinize(bv, decklists, () => 0);
    expect(stateHash(as)).toBe(stateHash(bs));
    expect(reclaimPlay(a.engine, as, side, a.ids[side].void[0]).state.sides[side].currentEnergy).toBe(0);
  });

  it("quotes only an available current-void Reclaim and observes a real keyword loss", () => {
    const subject = reclaimCard(26, { ...v.vanilla1, id: reclaimCard(26).id, status: "authored", abilities: () => [reclaim(energy(2))] });
    const loss = reclaimCard(27, { costs: [energy(0)], abilities: () => [event(p.sequence(p.loseKeyword(all(characterYouControl()), "reclaim"), p.abandon()))] });
    const source = modifier(28, { reduce: 1 }, "void");
    const f = reclaimFixture(side, [subject, source, loss], { back: [subject.id], hand: [loss.id, subject.id], void: [source.id, subject.id] });
    const before = f.engine.view(f.state, side);
    expect(before.instances[f.ids[side].void[1]].characteristics.reclaimCost).toBe(1);
    for (const id of [f.ids[side].void[0], f.ids[side].back[0]!, f.ids[side].hand[1]]) expect(before.instances[id].characteristics).not.toHaveProperty("reclaimCost");
    const lost = reclaimPlay(f.engine, f.state, side, f.ids[side].hand[0], "hand").state;
    const id = f.ids[side].back[0]!;
    expect(lost.instances[id].zone).toBe("void");
    expect(f.engine.view(lost, side).instances[id].characteristics).not.toHaveProperty("reclaimCost");
    expect(f.engine.legalActions(lost, side)).not.toContainEqual({ kind: "play", card: id, from: "void" });
  });

  it("reconstructs a hidden Reclaim setter after a later layer-six normal setter", () => {
    const subject = reclaimCard(21, { abilities: () => [keyword("reclaim")] });
    const hidden = reclaimCard(22, { abilities: () => [staticAbility(p.costModifierReclaim("opponent", { set: 0 }), { zone: "hand" })] });
    const other = opponent(side);
    const f = reclaimFixture(side, [subject, hidden], { back: [v.vanilla0.id], void: [subject.id], energy: 0 }, { hand: [hidden.id], deck: [v.vanilla1.id] });
    const id = f.ids[side].void[0];
    f.state.instances[f.ids[other].hand[0]].enteredZoneAt = 6;
    f.state.clock = 6;
    f.state.floating.push({ id: "e1", source: f.ids[side].back[0]!, controller: side, timestamp: 5, expiry: { at: "never" },
      change: { kind: "cardCost", instance: id, mode: "set", amount: 2 } });
    f.state.nextEffect = 2;
    const visible = f.engine.view(f.state, side);
    expect(visible.instances[f.ids[other].hand[0]]).toBeUndefined();
    expect(visible.instances[id].characteristics).toMatchObject({ cost: 2, reclaimCost: 0 });
    const decklists = { [side]: [{ cardId: subject.id }, { cardId: v.vanilla0.id }, ...Array.from({ length: 20 }, () => ({ cardId: v.vanilla1.id }))],
      [other]: [{ cardId: hidden.id }, { cardId: v.vanilla1.id }] } as Record<typeof side, { cardId: typeof subject.id }[]>;
    const sampled = f.engine.determinize(visible, decklists, () => 0);
    expect(f.engine.view(sampled, side).instances[id].characteristics.reclaimCost).toBe(0);
    expect(f.engine.legalActions(sampled, side)).toEqual(f.engine.legalActions(f.state, side));
    expect(reclaimPlay(f.engine, sampled, side, id).state.sides[side].currentEnergy).toBe(0);
  });
});

it("Reclaim modifier construction rejects invalid energy amounts and resolving misuse commits nothing", () => {
  for (const amount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => p.costModifierReclaim("you", { set: amount })).toThrow();
    expect(() => p.costModifierReclaim("you", { reduce: amount })).toThrow();
  }
  const invalid = reclaimCard(18, { costs: [energy(0)], abilities: () => [event(p.costModifierReclaim("you", { set: 0 }))] });
  const f = reclaimFixture("player", [invalid], { hand: [invalid.id] });
  const before = stateHash(f.state);
  expect(() => f.engine.apply(f.state, "player", { kind: "play", card: f.ids.player.hand[0], from: "hand" }, NO_PROMPTS)).toThrow();
  expect(stateHash(f.state)).toBe(before);
  expect(createEngine(f.engine.catalog).legalActions(f.state, "player")).toContainEqual({ kind: "play", card: f.ids.player.hand[0], from: "hand" });
});
