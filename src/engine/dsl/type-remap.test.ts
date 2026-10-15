import { describe, expect, it } from "vitest";
import { parseCardSubtype } from "../../types/card-identity";
import { parseDreamsignId } from "../../types/identifiers";
import { createCatalog, type EngineCardDefinition, type EngineFigmentDefinition } from "../catalog";
import { createEngine, type Engine } from "../engine";
import * as b from "./builders";
import { triggered, whenYouPlay } from "./triggers";
import type { AbilityList, Variant } from "./types";
import * as p from "../effects/primitives";
import { CHOSEN_SUBTYPE } from "../effects/primitives/choose-subtype";
import { randomLegalAnswer } from "../prompts/answers";
import { InlineSource } from "../steps/sources";
import { opponent, parseFigmentId, SIDES, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { serializeState } from "../state/hash";
import { boardState } from "../testing/board";
import { syntheticId } from "../testing/synthetic-cards";
import { passUntil } from "../testing/trigger-harness";
import { invariantViolations } from "../testing/invariants";

const SIGN = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000072330");
const WARRIOR = parseCardSubtype("Warrior"), MAGE = parseCardSubtype("Mage"), SHADOW = parseCardSubtype("Shadow");
const fixture = (n: number, subtype = WARRIOR, abilities: AbilityList = () => [], event = false): EngineCardDefinition => ({
  id: syntheticId(0x72300 + n), cardType: event ? "event" : "character", costs: [b.energy(event ? 0 : 4)], spark: event ? null : 2,
  subtype: event ? parseCardSubtype("") : subtype, speed: "standard", status: "authored", abilities,
});
const warrior = fixture(1), mage = fixture(2, MAGE);
const originalFigment: EngineFigmentDefinition = { id: parseFigmentId(syntheticId(0x72303)), subtype: WARRIOR, spark: 2, status: "vanilla", abilities: () => [] };
const shadowFigment: EngineFigmentDefinition = { id: parseFigmentId(syntheticId(0x72304)), subtype: SHADOW, spark: 5, status: "vanilla", abilities: () => [] };
function world(side: Side, abilities: AbilityList, options: { character?: boolean; emblem?: boolean; variant?: Variant; figments?: readonly EngineFigmentDefinition[]; back?: readonly EngineCardDefinition[] } = {}) {
  const source = fixture(0, parseCardSubtype("Explorer"), abilities, !options.character);
  const engine = createEngine(createCatalog([source, warrior, mage], [], { dreamsigns: [{ id: SIGN, status: "authored", abilities: () => [b.activated([], p.gainPoints(b.count(controlled)))] }] }, options.figments ?? [originalFigment, shadowFigment]));
  const placed = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 1000,
    [side]: { hand: [{ cardId: source.id, ...(options.variant ?? { amplified: false, typeRemap: MAGE }) }, { cardId: mage.id }, { cardId: warrior.id }],
      back: (options.back ?? [warrior, mage, mage]).map(card => card.id), deck: [mage.id, warrior.id], void: [mage.id, warrior.id, warrior.id], energy: 20, dreamsigns: options.emblem ? [SIGN] : [] },
    [opponent(side)]: { back: [warrior.id, mage.id], deck: [warrior.id], energy: 20 } });
  return { engine, source, ...placed };
}
type World = ReturnType<typeof world>;
function act(w: World, state: BattleState, side: Side, action: Parameters<Engine["apply"]>[2], subtype?: typeof MAGE) {
  const policy: ConstructorParameters<typeof InlineSource>[0]["player"] = prompt => prompt.kind === "chooseMode" && prompt.purpose.role === "chooseSubtype" && subtype !== undefined
    ? w.engine.catalog.characterTypes.indexOf(subtype) : randomLegalAnswer(prompt, () => 0);
  const answers = new InlineSource({ player: policy, enemy: policy });
  const before = serializeState(state), paid = w.engine.apply(state, side, action, answers);
  const settled = passUntil(w.engine, paid.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, answers);
  expect(serializeState(state)).toBe(before);
  expect(invariantViolations(settled.state, w.engine.catalog)).toEqual([]);
  return { state: settled.state, events: [...paid.events, ...settled.events] };
}
const play = (w: World, side: Side, subtype?: typeof MAGE) => act(w, w.state, side, { kind: "play", card: w.ids[side].hand[0], from: "hand" }, subtype);
const controlled = { controller: "you" as const, subtype: WARRIOR };

for (const side of SIDES) describe(`${side} copiable type remap`, () => {
  it("maps nested negative predicates, conditions and grouped counts without changing amounts/controllers", () => {
    const body = p.sequence(
      p.ifThen(b.controls({ ...controlled, anyOf: [{ subtype: WARRIOR }] }, 2), p.gainPoints(b.countGroups(controlled, 2))),
      p.gainSpark(b.all({ controller: "you", notSubtype: WARRIOR }), 3),
      p.ifThen({ cond: "cardsIn", zone: "void", player: "you", filter: { subtype: WARRIOR }, atLeast: 1, atMost: 1 }, p.gainPoints(7)),
      p.ifThen({ cond: "topOfDeck", player: "you", filter: { subtype: WARRIOR } }, p.gainPoints(b.countCards("void", { subtype: WARRIOR }))),
    );
    const w = world(side, () => [b.event(body)]), result = play(w, side);
    expect(result.state.sides[side].score).toBe(9);
    expect(result.state.sides[opponent(side)].score).toBe(0);
    expect(w.engine.view(result.state, side).instances[w.ids[side].back[0]!]?.characteristics.spark).toBe(5);
    expect(w.engine.view(result.state, side).instances[w.ids[side].back[1]!]?.characteristics.spark).toBe(2);
  });

  it("maps static conditions/cost filters, trigger filters and actual activated costs after variant expansion", () => {
    const w = world(side, variant => [
      b.staticAbility(p.costSetter("you", { subtype: WARRIOR }, variant.amplified ? 1 : 2), { while: b.controls(controlled, 2) }),
      triggered(whenYouPlay({ subtype: WARRIOR }), p.gainPoints(7)),
      b.activated([b.abandonCost({ subtype: WARRIOR })], p.gainPoints(3)),
    ], { character: true, variant: { amplified: true, typeRemap: MAGE } });
    const placed = play(w, side), view = w.engine.view(placed.state, side);
    expect(view.instances[w.ids[side].hand[1]]?.characteristics.cost).toBe(1);
    expect(view.instances[w.ids[side].hand[2]]?.characteristics.cost).toBe(4);
    expect(view.instances[w.ids[side].hand[0]]?.characteristics.subtype).toBe(parseCardSubtype("Explorer"));
    const played = act(w, placed.state, side, { kind: "play", card: w.ids[side].hand[1], from: "hand" });
    expect(played.state.sides[side].score).toBe(7);
    const paid = act(w, played.state, side, { kind: "activate", source: w.ids[side].hand[0], ability: 2 });
    expect(paid.state.instances[w.ids[side].back[1]!].zone).toBe("void");
    expect(paid.state.instances[w.ids[side].back[0]!].zone).toBe("play");
    expect(paid.state.sides[side].score).toBe(10);
  });

  for (const [chosen, spark, expectedId, expectedSpark] of [
    [SHADOW, null, shadowFigment.id, 2], [SHADOW, 7, shadowFigment.id, 7], [MAGE, null, originalFigment.id, 2],
  ] as const) it(`creates the correct physical figment for ${chosen}/${String(spark)}`, () => {
    const w = world(side, () => [b.event(p.materializeFigments(originalFigment.id, 1, { spark: spark ?? undefined }))],
      { variant: { amplified: false, typeRemap: chosen }, back: [] });
    const result = play(w, side);
    const created = Object.values(result.state.instances).filter(instance => instance.status.created);
    expect(created).toHaveLength(1);
    expect(created[0].printing).toEqual({ kind: "figment", figment: expectedId, spark: expectedSpark });
    expect(created[0].controller).toBe(side);
    expect(result.state.sides[side].backRank).toContain(created[0].id);
  });

  it("preserves the zero-spark materialization option while remapping its void filter", () => {
    const w = world(side, () => [b.event(p.materialize(b.fromVoid({ subtype: WARRIOR }), { zeroSpark: true }))]);
    const id = w.ids[side].void[0], result = play(w, side);
    expect(result.state.instances[id].zone).toBe("play");
    expect(w.engine.view(result.state, side).instances[id]?.characteristics.spark).toBe(0);
    expect(result.state.instances[w.ids[side].void[1]].zone).toBe("void");
  });

  it("keeps later chosen-type bindings independent of a literal remap", () => {
    const w = world(side, () => [b.event(p.chooseSubtype({ then: p.sequence(
      p.gainPoints(b.count({ controller: "you", subtype: CHOSEN_SUBTYPE })),
      p.gainPoints(b.count({ controller: "you", subtype: WARRIOR })),
    ) }))], { variant: { amplified: false, typeRemap: SHADOW } });
    expect(play(w, side, MAGE).state.sides[side].score).toBe(2);
  });

  it("preserves paired moved-card instruction identity through nested mapping", () => {
    const eroded = p.erode(1);
    const w = world(side, () => [b.event(p.sequence(
      p.takeFromAmong(p.movedBy(eroded), { filter: { subtype: WARRIOR } }),
      p.gainPoints(b.costOf(b.cardsMovedBy(eroded))),
    ))]);
    const result = play(w, side);
    expect(result.state.sides[side].score).toBe(4);
    expect(result.state.sides[side].hand).toContain(w.ids[side].deck[0]);
  });

  it("retains conditional target branches and rejects the old type as an actual target", () => {
    const subject = b.target(controlled);
    const w = world(side, () => [b.event(p.dissolve({ ...subject,
      when: { condition: b.controls(controlled, 2), otherwise: { controller: "opponent", subtype: WARRIOR } },
    }))]);
    const result = play(w, side);
    expect(result.state.instances[w.ids[side].back[1]!].zone).toBe("void");
    expect(result.state.instances[w.ids[side].back[0]!].zone).toBe("play");
    expect(result.state.instances[w.ids[opponent(side)].back[1]!].zone).toBe("play");
  });

  for (const reverse of [false, true]) it(`selects explicit canonical targets over false/unmarked same-type decoys (${String(reverse)})`, () => {
    const excluded = { ...shadowFigment, id: parseFigmentId(syntheticId(0x72305)), typeRemapTarget: false };
    const implicit = { ...shadowFigment, id: parseFigmentId(syntheticId(0x72306)) };
    const choices = [originalFigment, excluded, implicit, { ...shadowFigment, typeRemapTarget: true }];
    const w = world(side, () => [b.event(p.materializeFigments(originalFigment.id))],
      { variant: { amplified: false, typeRemap: SHADOW }, figments: reverse ? choices.reverse() : choices, back: [] });
    const created = Object.values(play(w, side).state.instances).filter(instance => instance.status.created);
    expect(created.map(instance => instance.printing)).toEqual([{ kind: "figment", figment: shadowFigment.id, spark: 2 }]);
  });

  it("refuses genuinely ambiguous canonical targets without changing authored definitions", () => {
    const ambiguous = { ...shadowFigment, id: parseFigmentId(syntheticId(0x72305)), typeRemapTarget: true };
    const body = p.materializeFigments(originalFigment.id), before = JSON.stringify(body);
    expect(() => world(side, () => [b.event(body)],
      { variant: { amplified: false, typeRemap: SHADOW }, figments: [originalFigment, { ...shadowFigment, typeRemapTarget: true }, ambiguous] })).toThrow();
    expect(JSON.stringify(body)).toBe(before);
  });

  it("maps the card while ordinary emblem abilities keep their literal type", () => {
    const w = world(side, () => [b.event(p.gainPoints(b.count(controlled)))], { emblem: true });
    const played = play(w, side);
    expect(played.state.sides[side].score).toBe(2);
    const result = act(w, played.state, side, { kind: "activate", source: { kind: "dreamsign", side, index: 0 }, ability: 0 });
    expect(result.state.sides[side].score).toBe(3);
  });
});
