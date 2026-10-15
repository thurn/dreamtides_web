import { describe, expect, it } from "vitest";
import { createCatalog, instanceCard, type EngineCardDefinition } from "../../catalog";
import { engineCardFromContent } from "../../content-catalog";
import * as b from "../../dsl/builders";
import { BASE_VARIANT, type Cost, type Variant } from "../../dsl/types";
import * as p from "../../effects/primitives";
import { createEngine } from "../../engine";
import { stateHash } from "../../state/hash";
import { NO_PROMPTS, ScriptedSource } from "../../steps/sources";
import { boardState } from "../../testing/board";
import { syntheticId } from "../../testing/synthetic-cards";
import { eligibleEngineTransfigurations } from "../../transfigurations";
import { engineDeckEntry } from "../../../battle/integration/engine-battle-init";
import { parseDeckEntryId } from "../../../types/identifiers";
import type { CardData } from "../../../types/cards";
import { triggered, onDawn, onMaterialized, either, onDissolved } from "../../dsl/triggers";
import { parseCardId, parseCardName } from "../../../types/card-identity";
import { applyTransfigurationToCard, buildTransfigurationDisplay, TRANSFIGURE_MARK_START, TRANSFIGURE_MARK_END, eligibleTransfigurations } from "../../../transfiguration/transfiguration-logic";
import { transfigurationFixture } from "../../../testing/transfiguration-fixture";
import { FORM_EVENT, FORM_FILLER, formContent, metadata } from "./transfigurations-01.fixtures";

const variant = (forms: NonNullable<Variant["transfigurations"]>): Variant => ({ amplified: false, transfigurations: forms });
const payer: EngineCardDefinition = { ...FORM_FILLER, id: syntheticId(0x2751), status: "authored", abilities: () => [b.activated([b.energy(2)], p.gainPoints(1))] };
const costs = (card: EngineCardDefinition, payments: readonly Cost[]): EngineCardDefinition => ({ ...card, abilities: () => [b.activated(payments, p.gainPoints(1))] });
const resolved = (card: EngineCardDefinition, forms: NonNullable<Variant["transfigurations"]>) => createCatalog([card], []).variantCard(card.id, variant(forms));

describe("Attuned immutable structural payments", () => {
  it("changes the first positive fixed token of the first eligible activated ability only", () => {
    const zero = b.activated([b.energy(0), b.energyX()], p.gainPoints(1));
    const first = b.activated([b.exhaustSelf(), b.energy(2), b.energy(3), b.energyX()], p.gainPoints(2), { oncePerTurn: true, zone: "hand" });
    const last = b.activated([b.energy(4)], p.gainPoints(3));
    const abilities = [zero, first, last];
    const card: EngineCardDefinition = { ...payer, abilities: () => abilities };
    const before = JSON.stringify(card.abilities(BASE_VARIANT));
    const transformed = resolved(card, ["Attuned"]).abilities(BASE_VARIANT);
    expect(transformed).toEqual([zero, { ...first, costs: [b.exhaustSelf(), b.energy(1), b.energy(3), b.energyX()] }, last]);
    expect(JSON.stringify(card.abilities(BASE_VARIANT))).toBe(before);
    expect(resolved(card, ["Attuned"]).abilities(BASE_VARIANT)).toEqual(transformed);
  });
  it("excludes pure X, zero, nonenergy and event instructions without changing them", () => {
    for (const payments of [[b.energy(0)], [b.energyX()], [b.exhaustSelf()], [b.pointsCost(2)], [b.energy(0), b.energyX()]] as const) {
      const card = costs(payer, payments);
      expect(eligibleEngineTransfigurations(card)).not.toContain("Attuned");
      expect(resolved(card, ["Attuned"]).abilities(BASE_VARIANT)).toEqual(card.abilities(BASE_VARIANT));
    }
    expect(eligibleEngineTransfigurations(FORM_EVENT)).not.toContain("Attuned");
    expect(resolved(costs(payer, [b.energy(1)]), ["Attuned"]).abilities(BASE_VARIANT)).toEqual([b.activated([b.energy(0)], p.gainPoints(1))]);
  });
  it("retains optional and alternative topology while changing one printed token", () => {
    const optional = costs(payer, [b.optionalCost(b.energy(2)), b.energy(4)]);
    expect(resolved(optional, ["Attuned"]).abilities(BASE_VARIANT)).toEqual([b.activated([b.optionalCost(b.energy(1)), b.energy(4)], p.gainPoints(1))]);
    const alternatives = costs(payer, [b.choiceCost([b.pointsCost(2)], [b.energy(3)], [b.energy(4)]), b.energy(5)]);
    expect(resolved(alternatives, ["Attuned"]).abilities(BASE_VARIANT)).toEqual([b.activated([b.choiceCost([b.pointsCost(2)], [b.energy(2)], [b.energy(4)]), b.energy(5)], p.gainPoints(1))]);
  });
  it("agrees with displayed eligibility for synthetic current authored tuples", () => {
    const rows = [
      { renderedText: "2●: Gain 1⍟.", abilities: () => [b.activated([b.energy(2)], p.gainPoints(1))] },
      { renderedText: "0●: Gain 1⍟.", abilities: () => [b.activated([b.energy(0)], p.gainPoints(1))] },
      { renderedText: "X●: Gain 1⍟.", abilities: () => [b.activated([b.energyX()], p.gainPoints(1))] },
      { renderedText: "☾, 1●: Gain 1⍟.", abilities: () => [b.activated([b.exhaustSelf(), b.energy(1)], p.gainPoints(1))] },
      { renderedText: "Gain 2●.", abilities: () => [b.event(p.gainEnergy(2))] },
      { renderedText: "1●: Gain 1⍟.\n\n3●: Gain 2⍟.", abilities: () => [b.activated([b.energy(1)], p.gainPoints(1)), b.activated([b.energy(3)], p.gainPoints(2))] },
    ];
    for (const row of rows) for (const cardType of ["Character", "Event"] as const) {
      const content = formContent({ ...row, cardType, spark: cardType === "Character" ? 1 : null });
      const display = { ...content, id: parseCardId(content.id), name: parseCardName(content.name), roles: content.roles === undefined ? undefined : [...content.roles], energyCosts: content.energyCosts === undefined ? undefined : [...content.energyCosts] };
      const engine = eligibleEngineTransfigurations(engineCardFromContent(content));
      const text = eligibleTransfigurations(transfigurationFixture(), display);
      for (const form of ["Attuned", "Perfected"] as const) expect(engine.includes(form)).toBe(text.includes(form));
    }
  });
});

describe("Perfected captures original eligibility and folds the catalog once", () => {
  it("leaves a one-constituent card unchanged", () => {
    const card = { ...FORM_FILLER, costs: [b.energyX()] };
    expect(eligibleEngineTransfigurations(card)).toEqual(["Kindled"]);
    expect(resolved(card, ["Perfected"])).toMatchObject({ costs: card.costs, spark: card.spark });
  });
  it("uses authored amplified abilities but excludes newly eligible constituents", () => {
    const card = { ...FORM_FILLER, costs: [b.energy(0)], transfiguration: metadata(), abilities: (v: Variant) => v.amplified ? [b.activated([b.energy(3)], p.gainPoints(2))] : [] };
    expect(eligibleEngineTransfigurations(card)).toEqual(["Amplified", "Kindled", "Perfected"]);
    expect(resolved(card, ["Perfected"]).abilities(BASE_VARIANT)).toEqual(card.abilities({ amplified: true }));
    expect(resolved(card, ["Perfected"]).spark).toBe(2);
    expect(resolved(card, ["Attuned", "Perfected"]).abilities(BASE_VARIANT)).toEqual([b.activated([b.energy(2)], p.gainPoints(2))]);
  });
  it("captures Attuned eligibility before an authored replacement removes its target", () => {
    const card = { ...payer, transfiguration: metadata(), abilities: (v: Variant) => v.amplified ? [] : payer.abilities(v) };
    expect(eligibleEngineTransfigurations(card)).toContain("Attuned");
    expect(resolved(card, ["Perfected"]).abilities(BASE_VARIANT)).toEqual([]);
  });
  it("preserves all eight constituent operations in catalog order across synthetic types", () => {
    const character = { ...payer, spark: 3, costs: [b.energy(5)], transfiguration: metadata("oncePerTurn"), abilities: (v: Variant) => [b.activated([b.energy(v.amplified ? 4 : 2)], p.gainPoints(v.amplified ? 3 : 1), { oncePerTurn: true })] };
    const result = resolved(character, ["Perfected"]);
    expect(result).toMatchObject({ costs: [b.energy(2)], spark: 6 });
    expect(result.abilities(BASE_VARIANT)).toEqual([b.activated([b.energy(3)], p.gainPoints(3))]);
    const event = { ...FORM_EVENT, transfiguration: metadata(), abilities: (v: Variant) => [b.event(p.gainPoints(v.amplified ? 3 : 1))] };
    const transformed = resolved(event, ["Perfected", "Inspired", "Enduring", "Empowered"]);
    expect(transformed).toMatchObject({ costs: [b.energy(0)], speed: "fast" });
    expect(transformed.abilities(BASE_VARIANT)).toEqual([b.event(p.gainPoints(3)), b.event({ op: "draw", count: 1, player: "you" }), b.keyword("reclaim")]);
  });
});

for (const side of ["player", "enemy"] as const) describe(`${side} actual transformed payments and reconstruction`, () => {
  it("combines Attuned with the delivered activated-cost route and preserves nonenergy payment", () => {
    const subject = costs(payer, [b.energy(3), b.pointsCost(1)]);
    const discount = { ...FORM_FILLER, id: syntheticId(0x2752), status: "authored" as const, abilities: () => [b.staticAbility(p.costModifier("you", {}, -1, { route: "activated" }))] };
    const catalog = createCatalog([subject, discount], []), engine = createEngine(catalog);
    const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { back: [subject.id, discount.id], energy: 10, score: 5 } });
    state.instances[ids[side].back[0]!] = { ...state.instances[ids[side].back[0]!], variant: variant(["Attuned"]) };
    const result = engine.apply(state, side, { kind: "activate", source: ids[side].back[0]!, ability: 0 }, NO_PROMPTS);
    expect(result.state.sides[side].currentEnergy).toBe(9);
    expect(result.state.sides[side].score).toBe(5);
    expect(state.sides[side].currentEnergy).toBe(10);
  });
  it("pays optional changed energy only when accepted", () => {
    const subject = costs(payer, [b.optionalCost(b.energy(2))]);
    const catalog = createCatalog([subject], []), engine = createEngine(catalog);
    const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { back: [subject.id], energy: 2 } });
    state.instances[ids[side].back[0]!] = { ...state.instances[ids[side].back[0]!], variant: variant(["Attuned"]) };
    for (const [answer, expected] of [[true, 1], [false, 2]] as const) {
      const result = engine.apply(state, side, { kind: "activate", source: ids[side].back[0]!, ability: 0 }, new ScriptedSource([answer]));
      expect(result.state.sides[side].currentEnergy).toBe(expected);
    }
  });
  it("reconstructs Perfected catalogs and saved battle state without extra operations", () => {
    const subject = { ...FORM_EVENT, transfiguration: metadata(), abilities: (v: Variant) => [b.event(p.gainPoints(v.amplified ? 3 : 1))] };
    const original = createCatalog([subject, FORM_FILLER], []);
    const catalogs = [original, createCatalog(original.cardDefinitions, []), createCatalog([original.card(subject.id), original.card(FORM_FILLER.id)], [])];
    const hashes = catalogs.map(catalog => {
      const engine = createEngine(catalog);
      const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { hand: [{ cardId: subject.id, transfigurations: ["Perfected"] }], deck: [FORM_FILLER.id, FORM_FILLER.id], energy: 10 } });
      const action = { kind: "play", card: ids[side].hand[0], from: "hand" } as const;
      const result = engine.apply(state, side, action, NO_PROMPTS);
      expect(result.state.sides[side].score).toBe(3);
      expect(result.state.sides[side].hand).toHaveLength(1);
      const saved = JSON.parse(JSON.stringify(state)) as typeof state;
      expect(stateHash(engine.apply(saved, side, action, NO_PROMPTS).state)).toBe(stateHash(result.state));
      expect(instanceCard(catalog, state.instances[action.card]).speed).toBe("fast");
      return stateHash(result.state);
    });
    expect(new Set(hashes).size).toBe(1);
  });
  it("refuses unaffordable or foreign activations and preserves the source tuple", () => {
    const catalog = createCatalog([payer], []), engine = createEngine(catalog);
    const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { back: [payer.id], energy: 0 } });
    state.instances[ids[side].back[0]!] = { ...state.instances[ids[side].back[0]!], variant: variant(["Attuned"]) };
    const action = { kind: "activate", source: ids[side].back[0]!, ability: 0 } as const;
    const before = stateHash(state);
    expect(engine.legalActions(state, side)).not.toContainEqual(action);
    expect(engine.legalActions(state, side === "player" ? "enemy" : "player")).not.toContainEqual(action);
    expect(stateHash(state)).toBe(before);
    expect(instanceCard(catalog, state.instances[action.source]).abilities(BASE_VARIANT)).toEqual([b.activated([b.energy(1)], p.gainPoints(1))]);
  });
});


describe("Attuned display cost boundaries and authored tint composition", () => {
  it("excludes selector comparisons and changes the actual identical payment token", () => {
    for (const selector of ["≤2● cost", "≤ 2● cost", "≥12● cost", "2● cost"]) {
      for (const paid of [false, true]) {
        const content = formContent({ cardType: "Character", spark: 1,
          renderedText: `Discard a ${selector} character${paid ? ", 2●" : ""}: Gain 1⍟.`,
          abilities: () => [b.activated([b.discardCostFilter({ costAtMost: 2 }), ...(paid ? [b.energy(2)] : [])], p.gainPoints(1))] });
        const display = { ...content, id: parseCardId(content.id), name: parseCardName(content.name), roles: undefined, energyCosts: undefined };
        expect(eligibleTransfigurations(transfigurationFixture(), display).includes("Attuned")).toBe(paid);
        expect(eligibleEngineTransfigurations(engineCardFromContent(content)).includes("Attuned")).toBe(paid);
        const changed = applyTransfigurationToCard(transfigurationFixture(), display, "Attuned");
        expect(changed.renderedText).toBe(paid ? display.renderedText.replace(", 2●:", ", 1●:") : display.renderedText);
      }
    }
  });
  it("keeps marked and plain numeric replacement aligned through authored Amplified", () => {
    for (const [base, amplified] of [["2", "3"], ["2", "12"], ["12", "2"], ["12", "13"]]) {
      const content = formContent({ cardType: "Character", spark: 1,
        renderedText: `Discard a ≤${amplified}● cost character, ${base}●: Gain 1⍟.`,
        amplifiedText: `Discard a ≤${amplified}● cost character, ${amplified}●: Gain 2⍟.` });
      const display = { ...content, id: parseCardId(content.id), name: parseCardName(content.name), roles: undefined, energyCosts: undefined };
      const result = buildTransfigurationDisplay(transfigurationFixture(), display, "Perfected");
      const plain = result.display.markedText.split(TRANSFIGURE_MARK_START).join("").split(TRANSFIGURE_MARK_END).join("");
      expect(plain).toBe(result.card.renderedText);
      expect(result.card.renderedText).toContain(`≤${amplified}● cost`);
      expect(result.card.renderedText).toContain(`, ${Number(amplified) - 1}●:`);
      let depth = 0;
      for (const character of result.display.markedText) {
        if (character === TRANSFIGURE_MARK_START) depth += 1;
        if (character === TRANSFIGURE_MARK_END) depth -= 1;
        expect(depth).toBeGreaterThanOrEqual(0);
        expect(depth).toBeLessThanOrEqual(1);
      }
      expect(depth).toBe(0);
    }
  });
  it("excludes an already selected Amplified form from current Perfected eligibility", () => {
    const content = formContent({ energyCost: 0, cardType: "Character", spark: 1, renderedText: "Gain 1⍟.", amplifiedText: "Gain 2⍟.", abilities: v => [b.event(p.gainPoints(v.amplified ? 2 : 1))] });
    const definition = engineCardFromContent(content);
    const display = { ...content, renderedText: content.amplifiedText!, id: parseCardId(content.id), name: parseCardName(content.name), roles: undefined, energyCosts: undefined };
    expect(eligibleEngineTransfigurations(definition, { amplified: true })).toEqual(["Kindled"]);
    expect(eligibleTransfigurations(transfigurationFixture(), display)).toEqual(["Kindled"]);
    expect(resolved(definition, ["Amplified", "Perfected"]).spark).toBe(1);
    expect(resolved(definition, ["Perfected"]).spark).toBe(2);
    expect(definition.transfiguration?.amplified).toBe(true);
  });
});

// Exercise the public journey DTO before resolving the same physical card.
const brandedCardData = (content: ReturnType<typeof formContent>): CardData => ({
  ...content, id: parseCardId(content.id), name: parseCardName(content.name),
  roles: content.roles === undefined ? undefined : [...content.roles],
  energyCosts: content.energyCosts === undefined ? undefined : [...content.energyCosts],
});

for (const side of ["player", "enemy"] as const) describe(`${side} Perfected journey-to-engine constituents`, () => {
  const setup = (changes: Parameters<typeof formContent>[0]) => {
    const content = formContent({ cardType: "Character", subtype: "Warrior", energyCost: 0, spark: 1, ...changes });
    const display = brandedCardData(content), data = transfigurationFixture();
    const entry = { entryId: parseDeckEntryId(`perfected-bridge-${side}`), cardNumber: content.cardNumber, transfiguration: "Perfected" as const, isBane: false };
    const before = JSON.stringify({ content, entry, display, data });
    const definition = engineCardFromContent(content), catalog = createCatalog([definition], []);
    const dto = engineDeckEntry(entry, display, data);
    const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { hand: [dto], energy: 6 } });
    const id = ids[side].hand[0];
    const saved = JSON.parse(JSON.stringify(state)) as typeof state;
    const cards = [state, saved].map(value => instanceCard(catalog, value.instances[id]));
    const shown = applyTransfigurationToCard(data, display, "Perfected");
    for (const card of cards) {
      expect(card.spark).toBe(shown.spark);
      expect(card.costs).toEqual([b.energy(shown.energyCost!)]);
    }
    expect(JSON.stringify({ content, entry, display, data })).toBe(before);
    expect(stateHash(saved)).toBe(stateHash(state));
    return { cards, definition, catalog, state, saved, id };
  };
  it("retains the two original constituents of a zero-cost one-spark printing", () => {
    const { cards, definition } = setup({ renderedText: "Gain 1⍟.", amplifiedText: "Gain 2⍟.", abilities: () => [] });
    expect(eligibleEngineTransfigurations(definition)).toEqual(["Amplified", "Kindled", "Perfected"]);
    for (const card of cards) expect(card.spark).toBe(2);
  });
  it("pays the full newly authored activation after ordinary play and reload", () => {
    const { cards, catalog, state, saved, id } = setup({ renderedText: "Gain 1⍟.", amplifiedText: "3●: Gain 2⍟.", abilities: v => v.amplified ? [b.activated([b.energy(3)], p.gainPoints(2))] : [] });
    for (const card of cards) expect(card.abilities(BASE_VARIANT)).toEqual([b.activated([b.energy(3)], p.gainPoints(2))]);
    const engine = createEngine(catalog), before = stateHash(state);
    const results = [state, saved].map(initial => {
      const played = engine.apply(initial, side, { kind: "play", card: id, from: "hand" }, NO_PROMPTS).state;
      const playedHash = stateHash(played);
      const action = { kind: "activate", source: id, ability: 0 } as const;
      expect(engine.legalActions(played, side)).toContainEqual(action);
      const activated = engine.apply(played, side, action, NO_PROMPTS).state;
      expect(activated.sides[side].currentEnergy).toBe(3);
      expect(activated.sides[side].score).toBe(2);
      expect(stateHash(played)).toBe(playedHash);
      return stateHash(activated);
    });
    expect(results[0]).toBe(results[1]);
    expect(stateHash(state)).toBe(before);
  });
  it("retains original Attuned selection when the amplified printing has no activation", () => {
    const { cards, definition } = setup({ renderedText: "2●: Gain 1⍟.", amplifiedText: "Gain 2⍟.", abilities: v => v.amplified ? [] : [b.activated([b.energy(2)], p.gainPoints(1))] });
    expect(eligibleEngineTransfigurations(definition)).toContain("Attuned");
    for (const card of cards) expect(card.abilities(BASE_VARIANT)).toEqual([]);
  });
  it("uses current amplified Resonant metadata only for an initially selected constituent", () => {
    const { cards, definition } = setup({ renderedText: "▸Dawn: Gain 1⍟.", amplifiedText: "▸Materialized: Gain 2⍟.", abilities: v => [triggered(v.amplified ? onMaterialized() : onDawn(), p.gainPoints(v.amplified ? 2 : 1))] });
    expect(definition.transfiguration?.resonant).toEqual({ base: "dawn", amplified: "materialized" });
    for (const card of cards) expect(card.abilities(BASE_VARIANT)).toEqual([triggered(either(onMaterialized(), onDissolved()), p.gainPoints(2))]);
  });
  it("preserves a newly authored once-per-turn limit when the base has no Resonant eligibility", () => {
    const { cards, definition } = setup({ renderedText: "Gain 1⍟.", amplifiedText: "3●: Gain 2⍟. Activate once per turn.", abilities: v => v.amplified ? [b.activated([b.energy(3)], p.gainPoints(2), { oncePerTurn: true })] : [] });
    expect(definition.transfiguration?.resonant).toEqual({ base: null, amplified: "oncePerTurn" });
    for (const card of cards) expect(card.abilities(BASE_VARIANT)).toEqual([b.activated([b.energy(3)], p.gainPoints(2), { oncePerTurn: true })]);
  });
});
