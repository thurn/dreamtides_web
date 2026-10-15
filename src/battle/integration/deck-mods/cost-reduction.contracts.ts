/** Public synthetic preparation; original hv-umm2.281 owns the full real-content sweep and judgment. */
import { describe, expect, it } from "vitest";
import { createCatalog, instanceCard, type EngineCardDefinition } from "../../../engine/catalog";
import { cardMatchesFilter, characteristicsOf, copiableCostOf } from "../../../engine/continuous/characteristics";
import * as b from "../../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../../engine/dsl/triggers";
import * as p from "../../../engine/effects/primitives";
import { createEngine } from "../../../engine/engine";
import { createFoldAdapter, type IntentOutcome } from "../../../engine/fold/slice";
import { cloneState } from "../../../engine/state/clone";
import { stateHash } from "../../../engine/state/hash";
import { opponent, SIDES, type Side } from "../../../engine/state/ids";
import type { BattleInit, BattleState } from "../../../engine/state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../engine/steps/sources";
import { syntheticId } from "../../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../../engine/testing/trigger-harness";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../../journey_v2/testing/fixtures";
import { applyJourneyRewardEffect, type JourneyRewardEffect } from "../../../rules/journey/reward-effects";
import { testJourneyState } from "../../../testing/journey-genesis";
import { parseCardSubtype } from "../../../types/card-identity";
import { parseCardTypeChangePredicateId, parseDeckEntryId } from "../../../types/identifiers";
import type { DeckEntry, JourneyState } from "../../../types/journey";
import { createEngineBattleInit, engineDeckEntry } from "../engine-battle-init";

const warrior = parseCardSubtype("Warrior"), mage = parseCardSubtype("Mage");
const character: EngineCardDefinition = {
  id: syntheticId(0x63201), cardType: "character", costs: [b.energy(2), b.energy(3)], spark: 4,
  subtype: warrior, speed: "standard", status: "authored",
  transfiguration: { amplified: true, resonant: { base: "materialized", amplified: "materialized" } },
  abilities: variant => [triggered(onMaterialized(), p.gainPoints(variant.amplified ? 5 : 2)),
    b.activated([b.energy(3)], p.gainPoints(1)), b.activated([], p.returnToHand(b.self())),
    b.activated([], p.dissolve(b.self()))],
};
const eventCard: EngineCardDefinition = { ...character, id: syntheticId(0x63202), cardType: "event", spark: null,
  subtype: parseCardSubtype(""), transfiguration: { amplified: true, resonant: { base: null, amplified: null } },
  abilities: variant => [b.event(p.gainPoints(variant.amplified ? 5 : 2))] };
const variable: EngineCardDefinition = { ...character, id: syntheticId(0x63203), costs: [b.energyX()], spark: "x" };
const mixed: EngineCardDefinition = { ...variable, id: syntheticId(0x63204), costs: [b.energy(2), b.energyX()] };
const extra: EngineCardDefinition = { ...eventCard, id: syntheticId(0x63205), costs: [b.energy(1)],
  abilities: () => [b.event(p.gainPoints(2)), b.additionalCost(b.energy(2), b.discardCost())] };
const zero: EngineCardDefinition = { ...eventCard, id: syntheticId(0x63206), costs: [b.energy(0)] };
const single: EngineCardDefinition = { ...eventCard, id: syntheticId(0x63207), costs: [b.energy(5)] };
const definitions = [character, eventCard, variable, mixed, extra, zero, single];
const catalog = createCatalog(definitions, []), engine = createEngine(catalog);
const cards = definitions.map((card, index) => makeAuguryTestCard({ id: card.id, cardNumber: 63201 + index,
  cardType: card.cardType === "character" ? "Character" : "Event", subtype: card.subtype,
  energyCost: index === 2 ? null : index === 3 ? 2 : index === 4 ? 1 : index === 5 ? 0 : 5,
  spark: typeof card.spark === "number" ? card.spark : null, sparkVariable: card.spark === "x" }));
const content = makeAuguryTestContent({ cards });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const printed = () => JSON.stringify(definitions.map(card => ({ ...card,
  baseAbilities: card.abilities({ amplified: false }), amplifiedAbilities: card.abilities({ amplified: true }) })));
const entry = (index = 0, form: DeckEntry["transfiguration"] = null, suffix = "subject"): DeckEntry => ({
  entryId: parseDeckEntryId(`cost:${index}:${suffix}`), cardNumber: cards[index].cardNumber, transfiguration: form, isBane: false,
});
function apply(state: JourneyState, effect: JourneyRewardEffect): JourneyState {
  const before = copy(state), result = applyJourneyRewardEffect({ state, journeyContent: content, effect });
  expect(state).toEqual(before);
  if (result === null) throw new Error("Synthetic cost reward refused");
  return result;
}
function target(state: JourneyState) {
  const subject = state.deck[0], card = content.cardDatabase.get(subject.cardNumber);
  if (card === undefined) throw new Error("Missing synthetic printing");
  return { entryId: subject.entryId, cardUuid: card.id, cardNumber: card.cardNumber };
}
function journey(index = 0, reduction = 3, form: DeckEntry["transfiguration"] = null, stacked = false): JourneyState {
  let state = { ...testJourneyState("cost-contract"), deck: [entry(index, form), entry(index, null, "neighbor"),
    entry(5, null, "payment"), ...Array.from({ length: 8 }, (_, i) => entry(5, null, `filler:${i}`))] };
  if (reduction > 0) state = apply(state, { kind: "reduce_deck_entry_energy_cost", ...target(state), amount: reduction });
  if (stacked) state = apply(state, { kind: "composite", children: [
    { kind: "change_deck_entry_keywords", ...target(state), keywords: { fast: true, setReclaim: 1 } },
    { kind: "change_deck_entry_type", ...target(state), typeChange: {
      predicateId: parseCardTypeChangePredicateId("cost-type"), label: "", cardType: index === 0 ? "Character" : "Event", subtype: mage } },
    { kind: "add_deck_entry_spark_bonus", ...target(state), amount: 3 },
  ] });
  return state;
}
function init(state: JourneyState, side: Side, energy = 30, prepared = true, handCount = 3): BattleInit {
  const mapped = createEngineBattleInit({ seed: 632, scoreToWin: 1000, startingSide: side, journey: state,
    enemy: { deck: Array.from({ length: 9 }, () => character.id), avatar: null, dreamsigns: [] },
    cardDatabase: content.cardDatabase, transfigurationData: content.transfigurationData, minimumDeckSize: 1, dreamwell: [] });
  expect(mapped.decks.player[0]).toEqual(engineDeckEntry(state.deck[0], cards.find(card => card.cardNumber === state.deck[0].cardNumber)!, content.transfigurationData));
  // The production journey mapper addresses player; this fixture seats its complete mapped deck on either actor.
  const seated = side === "player" ? mapped : { ...mapped, decks: { player: mapped.decks.enemy, enemy: mapped.decks.player } };
  if (!prepared) return seated;
  return { ...seated, setup: {
    placements: [...Array.from({ length: handCount }, (_, deckIndex) => ({ side, deckIndex, zone: "hand" as const })),
      { side: opponent(side), deckIndex: 0, zone: "hand" }],
    sides: { player: { currentEnergy: energy, maxEnergy: energy, score: 0 }, enemy: { currentEnergy: energy, maxEnergy: energy, score: 0 } },
    turn: { active: side, phase: "day", round: 1, turnNumber: 1,
      sideTurns: { player: side === "player" ? 1 : 0, enemy: side === "enemy" ? 1 : 0 }, lastNormal: side },
    dreamwell: { deck: [], next: 0 },
  } };
}
function applied(result: IntentOutcome) {
  expect(result.kind).toBe("applied");
  if (result.kind !== "applied") throw new Error("Synthetic cost intent bounced");
  expect(result.error).toBeNull();
  return result.slice;
}
const playable = (state: BattleState, side: Side, card = state.sides[side].hand[0]) =>
  engine.legalActions(state, side).some(action => action.kind === "play" && action.card === card && action.from === "hand");
const play = (state: BattleState, side: Side, x?: number) => engine.apply(state, side,
  { kind: "play", card: state.sides[side].hand[0], from: "hand" }, x === undefined ? NO_PROMPTS : new ScriptedSource([x])).state;
const paymentRows = [
  { index: 6, reduction: 3, fixed: 2 }, { index: 0, reduction: 3, fixed: 2 },
  { index: 0, reduction: 5, fixed: 0 }, { index: 0, reduction: 9, fixed: 0 },
  { index: 5, reduction: 9, fixed: 0 }, { index: 2, reduction: 9, fixed: 0, x: 3 },
  { index: 3, reduction: 1, fixed: 1, x: 3 }, { index: 3, reduction: 9, fixed: 0, x: 3 },
] as const;
const forms = [
  { index: 0, form: null, cost: 4 }, { index: 0, form: "Amplified", cost: 4 },
  { index: 0, form: "Empowered", cost: 1 }, { index: 0, form: "Kindled", cost: 4 },
  { index: 0, form: "Resonant", cost: 4 }, { index: 0, form: "Attuned", cost: 4 },
  { index: 0, form: "Perfected", cost: 1 }, { index: 1, form: "Inspired", cost: 4 },
  { index: 1, form: "Enduring", cost: 4 }, { index: 1, form: "Hastened", cost: 4 },
  { index: 1, form: "Perfected", cost: 1 },
] as const;

for (const side of SIDES) describe(`${side} synthetic permanent cost-reduction contracts`, () => {
  it("accumulates actual reward DTOs through real mapping and ordinary deal without leaking to another copy or actor", () => {
    const initial = journey(0, 1), before = copy(initial), immutable = printed();
    const rewarded = apply(initial, { kind: "reduce_deck_entry_energy_cost", ...target(initial), amount: 2 });
    expect(rewarded.deck[0].keywordModification?.energyCostReduction).toBe(3);
    const input = init(rewarded, side, 30, false), inputBefore = copy(input), state = engine.createBattle(input, NO_PROMPTS).state;
    const subjects = Object.values(state.instances).filter(card => card.owner === side && card.variant.deckMods?.costReduction === 3);
    expect(subjects).toHaveLength(1);
    const subject = subjects[0];
    expect(subject).toMatchObject({ controller: side, printing: { kind: "card", cardId: character.id } });
    expect(instanceCard(catalog, subject).costs).toEqual([b.energy(0), b.energy(2)]);
    expect(copiableCostOf(state, catalog, subject.id)).toBe(2);
    const neighbors = Object.values(state.instances).filter(card => card.id !== subject.id && card.printing.kind === "card" && card.printing.cardId === character.id);
    expect(neighbors.some(card => card.owner !== side)).toBe(true);
    expect(neighbors.every(card => copiableCostOf(state, catalog, card.id) === 5)).toBe(true);
    expect(initial).toEqual(before); expect(input).toEqual(inputBefore); expect(printed()).toBe(immutable);
  });

  it.each(paymentRows)("pays fixed $fixed for definition $index with reduction $reduction and its separate X", row => {
    const x = "x" in row ? row.x : undefined, total = row.fixed + (x ?? 0), minimum = row.fixed + (x === undefined ? 0 : 1);
    const state = engine.createBattle(init(journey(row.index, row.reduction), side, total), NO_PROMPTS).state;
    const before = copy(state), [id, neighbor] = state.sides[side].hand;
    expect(copiableCostOf(state, catalog, id)).toBe(row.fixed);
    expect(copiableCostOf(state, catalog, neighbor)).toBe(row.index === 2 ? 0 : row.index === 3 ? 2 : row.index === 5 ? 0 : 5);
    expect(playable(state, side)).toBe(true);
    if (minimum > 0) {
      const short = engine.createBattle(init(journey(row.index, row.reduction), side, minimum - 1), NO_PROMPTS).state;
      expect(playable(short, side)).toBe(false);
      expect(() => play(short, side, x)).toThrow();
    }
    const paid = play(state, side, x);
    expect(paid.sides[side].currentEnergy).toBe(0);
    expect(paid.sides[opponent(side)].currentEnergy).toBe(total);
    expect(paid.instances[id].zone).toBe(definitions[row.index].cardType === "character" ? "play" : "void");
    if (x !== undefined) { expect(paid.instances[id].status.x).toBe(x); expect(characteristicsOf(paid, catalog, id).spark).toBe(x); }
    expect(cardMatchesFilter(paid, catalog, id, { costAtLeast: row.fixed, costAtMost: row.fixed })).toBe(true);
    expect(state).toEqual(before);
  });

  it("preserves mandatory energy and a distinct discard after the printed base reaches zero", () => {
    const reward = journey(4, 9);
    const short = engine.createBattle(init(reward, side, 1), NO_PROMPTS).state;
    expect(playable(short, side)).toBe(false);
    const alone = engine.createBattle(init(reward, side, 2, true, 1), NO_PROMPTS).state;
    expect(playable(alone, side)).toBe(false);
    const state = engine.createBattle(init(reward, side, 2), NO_PROMPTS).state, [id, , payment] = state.sides[side].hand;
    const paid = engine.apply(state, side, { kind: "play", card: id, from: "hand" }, new ScriptedSource([[payment]])).state;
    expect(paid.sides[side].currentEnergy).toBe(0); expect(paid.instances[payment].zone).toBe("void");
    expect(paid.instances[id].zone).toBe("void"); expect(paid.sides[side].score).toBe(2);
    expect(state.sides[side].currentEnergy).toBe(2); expect(state.instances[payment].zone).toBe("hand");
  });

  for (const stacked of [false, true]) it.each(forms)(`applies $form before permanent reduction and stacked modifications ${stacked}`, row => {
    const reward = journey(row.index, 1, row.form, stacked), before = copy(reward), immutable = printed();
    const state = engine.createBattle(init(reward, side), NO_PROMPTS).state, [id, neighbor] = state.sides[side].hand;
    const paid = play(state, side), amplified = row.form === "Amplified" || row.form === "Perfected";
    expect(paid.sides[side].currentEnergy).toBe(30 - row.cost);
    expect(paid.sides[side].score).toBe(amplified ? 5 : 2);
    expect(copiableCostOf(paid, catalog, id)).toBe(row.cost); expect(copiableCostOf(paid, catalog, neighbor)).toBe(5);
    expect(instanceCard(catalog, paid.instances[id])).toMatchObject({ subtype: stacked ? mage : row.index === 0 ? warrior : parseCardSubtype(""),
      speed: stacked || row.form === "Hastened" || row.index === 1 && row.form === "Perfected" ? "fast" : "standard" });
    const inspired = row.index === 1 && (row.form === "Inspired" || row.form === "Perfected");
    expect(paid.sides[side].hand.length).toBe(state.sides[side].hand.length - 1 + (inspired ? 1 : 0));
    if (row.index === 0) {
      const kindled = row.form === "Kindled" || row.form === "Perfected", attuned = row.form === "Attuned" || row.form === "Perfected";
      expect(characteristicsOf(paid, catalog, id).spark).toBe((kindled ? 8 : 4) + (stacked ? 3 : 0));
      const activated = engine.apply(paid, side, { kind: "activate", source: id, ability: 1 }, NO_PROMPTS).state;
      expect(activated.sides[side].currentEnergy).toBe(30 - row.cost - (attuned ? 2 : 3));
      const dissolved = engine.apply(activated, side, { kind: "activate", source: id, ability: 3 }, NO_PROMPTS).state;
      expect(dissolved.instances[id].zone).toBe("void");
      expect(dissolved.sides[side].score).toBe((amplified ? 5 : 2) + 1 + (row.form === "Resonant" || row.form === "Perfected" ? amplified ? 5 : 2 : 0));
    } else if (row.form === "Enduring" || row.form === "Perfected") {
      const reclaimed = engine.apply(paid, side, { kind: "play", card: id, from: "void" }, NO_PROMPTS).state;
      expect(reclaimed.sides[side].currentEnergy).toBe(30 - row.cost - (stacked ? 1 : row.cost));
      expect(reclaimed.instances[id].zone).toBe("banished");
    }
    expect(reward).toEqual(before); expect(printed()).toBe(immutable);
  });

  it("keeps original Event eligibility before a permanent Character conversion", () => {
    let reward = journey(1, 1, "Inspired");
    reward = apply(reward, { kind: "change_deck_entry_type", ...target(reward), typeChange: {
      predicateId: parseCardTypeChangePredicateId("cost-event-conversion"), label: "", cardType: "Character", subtype: mage } });
    const state = engine.createBattle(init(reward, side), NO_PROMPTS).state, id = state.sides[side].hand[0], paid = play(state, side);
    expect(paid.instances[id].zone).toBe("play"); expect(paid.sides[side].currentEnergy).toBe(26);
    expect(paid.sides[side].hand.length).toBe(state.sides[side].hand.length);
    expect(characteristicsOf(paid, catalog, id)).toMatchObject({ cardType: "character", subtype: mage, spark: 0 });
  });

  it("keeps X separate for pure-X Empowered and applies fixed-plus-X Empowered before reduction", () => {
    const pure = engine.createBattle(init(journey(2, 9, "Empowered"), side), NO_PROMPTS).state;
    expect(play(pure, side, 3).sides[side].currentEnergy).toBe(27);
    const fixed = engine.createBattle(init(journey(3, 1, "Empowered"), side), NO_PROMPTS).state;
    expect(play(fixed, side).sides[side].currentEnergy).toBe(30);
  });

  it("retains the physical reduction through repeated play, turn change, clone, reload and a fresh battle", () => {
    const reward = journey(0, 3), input = init(reward, side), start = engine.createBattle(input, NO_PROMPTS).state;
    const id = start.sides[side].hand[0], paid = play(start, side);
    const hashes = [paid, cloneState(paid), copy(paid)].map(saved => {
      const returned = engine.apply(saved, side, { kind: "activate", source: id, ability: 2 }, NO_PROMPTS).state;
      expect(returned.instances[id].zone).toBe("hand"); expect(copiableCostOf(returned, catalog, id)).toBe(2);
      const replayed = engine.apply(returned, side, { kind: "play", card: id, from: "hand" }, NO_PROMPTS).state;
      expect(replayed.sides[side].currentEnergy).toBe(26);
      const later = passUntil(engine, replayed, at(engine, opponent(side), "day")).state;
      expect(later.instances[id].variant).toEqual(start.instances[id].variant); expect(copiableCostOf(later, catalog, id)).toBe(2);
      return stateHash(later);
    });
    expect(hashes[1]).toBe(hashes[0]); expect(hashes[2]).toBe(hashes[0]);
    expect(stateHash(createEngine(catalog).createBattle(copy(input), NO_PROMPTS).state)).toBe(stateHash(start));
    expect(reward.deck[0].keywordModification?.energyCostReduction).toBe(3);
  });

  it("cancels a real payment, refuses competing and stale inputs, and reloads/replays one committed debit", () => {
    const fold = createFoldAdapter(engine), base = applied(fold.start(init(journey(4, 9), side, 2)));
    const [id, neighbor, payment] = base.committed.sides[side].hand, before = copy(base);
    const intent = { kind: "battleAction", side, action: { kind: "play", card: id, from: "hand" } } as const;
    const pending = applied(fold.reduce(base, intent)), prompt = fold.pending(pending)?.prompt;
    if (prompt === undefined) throw new Error("Missing real discard payment prompt");
    expect(prompt.kind).toBe("chooseCards"); expect(prompt.cancellable).toBe(true); expect(pending.committed).toEqual(base.committed);
    expect(fold.reduce(pending, intent)).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(base, { ...intent, side: opponent(side) }).kind).toBe("bounced");
    expect(fold.reduce(pending, { kind: "answer", side, promptId: prompt.id, value: [id] }).kind).toBe("bounced");
    const cancelled = applied(fold.reduce(pending, { kind: "cancel", side, promptId: prompt.id }));
    expect(cancelled.committed.sides).toEqual(base.committed.sides); expect(cancelled.committed.instances[id].variant).toEqual(base.committed.instances[id].variant);
    const cold = createFoldAdapter(createEngine(catalog)), retried = applied(cold.reduce(copy(cancelled), intent)), current = cold.pending(retried)?.prompt;
    if (current === undefined) throw new Error("Missing retried payment prompt");
    expect(current.id).not.toBe(prompt.id);
    expect(cold.reduce(retried, { kind: "answer", side, promptId: prompt.id, value: [payment] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(cold.reduce(retried, { kind: "answer", side: opponent(side), promptId: current.id, value: [payment] }).kind).toBe("bounced");
    const saved = copy(retried), answer = { kind: "answer", side, promptId: current.id, value: [payment] } as const;
    const committed = applied(cold.reduce(saved, answer)), replayed = applied(createFoldAdapter(createEngine(catalog)).reduce(copy(retried), answer));
    expect(stateHash(committed.committed)).toBe(stateHash(replayed.committed)); expect(committed.inFlight).toBeNull();
    expect(committed.committed.sides[side].currentEnergy).toBe(0); expect(committed.committed.sides[side].score).toBe(2);
    expect(committed.committed.instances[payment].zone).toBe("void"); expect(committed.committed.instances[neighbor].zone).toBe("hand");
    expect(cold.reduce(committed, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(base).toEqual(before); expect(retried).toEqual(saved);
  });
});

describe("cost-reduction reward refusal", () => {
  it("refuses invalid physical targets and amounts atomically, preserving source and catalog", () => {
    const state = journey(0, 1), before = copy(state), immutable = printed();
    const valid = { kind: "reduce_deck_entry_energy_cost", ...target(state), amount: 2 } as const;
    for (const patch of [{ entryId: parseDeckEntryId("missing-cost-entry") }, { cardUuid: eventCard.id }, { cardNumber: cards[1].cardNumber },
      { amount: 0 }, { amount: -1 }, { amount: NaN }, { amount: Infinity }]) {
      const invalid = { ...valid, ...patch };
      expect(applyJourneyRewardEffect({ state, journeyContent: content, effect: invalid })).toBeNull();
      expect(applyJourneyRewardEffect({ state, journeyContent: content, effect: { kind: "composite", children: [valid, invalid] } })).toBeNull();
      expect(state).toEqual(before);
    }
    expect(() => createEngineBattleInit({ seed: 632, scoreToWin: 25, startingSide: "player", journey: state,
      enemy: { deck: [character.id], avatar: null, dreamsigns: [] }, cardDatabase: new Map(),
      transfigurationData: content.transfigurationData, minimumDeckSize: 1, dreamwell: [] })).toThrow();
    expect(printed()).toBe(immutable); expect(state).toEqual(before);
  });
});
