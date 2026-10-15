import { describe, expect, it } from "vitest";
import { createCatalog, instanceCard, type EngineCardDefinition } from "../../../engine/catalog";
import { cardMatchesFilter, characteristicsOf } from "../../../engine/continuous/characteristics";
import * as b from "../../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../../engine/dsl/triggers";
import * as p from "../../../engine/effects/primitives";
import { createEngine } from "../../../engine/engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../engine/fold/slice";
import { cloneState } from "../../../engine/state/clone";
import { stateHash } from "../../../engine/state/hash";
import { opponent, SIDES, type Side } from "../../../engine/state/ids";
import type { BattleInit, BattleState } from "../../../engine/state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../engine/steps/sources";
import { syntheticId } from "../../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../../engine/testing/trigger-harness";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../../journey_v2/testing/fixtures";
import { applyJourneyRewardEffect, type JourneyRewardEffect } from "../../../rules/journey/reward-effects";
import { SELECTION_RULES_VERSION } from "../../../reward-selection";
import { buildExplorationRuntime, resolveExplorationChoice } from "../../../session/providers/exploration-provider";
import { testJourneyState } from "../../../testing/journey-genesis";
import { parseCardSubtype } from "../../../types/card-identity";
import { parseCardTypeChangePredicateId, parseDeckEntryId, parseSiteId } from "../../../types/identifiers";
import type { DeckEntry, JourneyState, SiteState } from "../../../types/journey";
import { testExplorationActionId } from "../../../types/test-identities";
import { createEngineBattleInit, engineDeckEntry } from "../engine-battle-init";

const warrior = parseCardSubtype("Warrior"), mage = parseCardSubtype("Mage");
const character: EngineCardDefinition = {
  id: syntheticId(0x63101), cardType: "character", subtype: warrior, spark: 4,
  costs: [b.energy(4)], speed: "standard", status: "authored",
  transfiguration: { amplified: true, resonant: { base: "materialized", amplified: "materialized" } },
  abilities: variant => [triggered(onMaterialized(), p.gainPoints(variant.amplified ? 5 : 2)),
    b.activated([b.energy(3)], p.gainSpark(b.self(), 3)), b.activated([], p.returnToHand(b.self()))],
};
const variable: EngineCardDefinition = { ...character, id: syntheticId(0x63102), spark: "x", costs: [b.energyX()] };
const eventCard: EngineCardDefinition = { ...character, id: syntheticId(0x63103), cardType: "event", subtype: parseCardSubtype(""), spark: null,
  transfiguration: { amplified: true, resonant: { base: null, amplified: null } },
  abilities: variant => [b.event(p.gainPoints(variant.amplified ? 5 : 2))] };
const temporary: EngineCardDefinition = { ...eventCard, id: syntheticId(0x63104), costs: [b.energy(1)],
  abilities: () => [b.event(p.gainSpark(b.target(b.anyCharacter()), 3, "untilEndOfTurn"))] };
const definitions = [character, variable, eventCard, temporary];
const catalog = createCatalog(definitions, []), engine = createEngine(catalog);
const cards = definitions.map((card, index) => makeAuguryTestCard({ id: card.id, cardNumber: 63101 + index,
  cardType: card.cardType === "character" ? "Character" : "Event", subtype: card.subtype,
  spark: typeof card.spark === "number" ? card.spark : null, sparkVariable: card.spark === "x",
  energyCost: card === variable ? null : card === temporary ? 1 : 4 }));
const content = makeAuguryTestContent({ cards });
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const printed = () => JSON.stringify(definitions.map(card => ({ ...card,
  baseAbilities: card.abilities({ amplified: false }), amplifiedAbilities: card.abilities({ amplified: true }) })));
const entry = (index: number, form: DeckEntry["transfiguration"] = null, suffix = "subject"): DeckEntry => ({
  entryId: parseDeckEntryId(`spark:${index}:${suffix}`), cardNumber: cards[index].cardNumber, transfiguration: form, isBane: false,
});
function apply(journey: JourneyState, effect: JourneyRewardEffect): JourneyState {
  const before = json(journey), result = applyJourneyRewardEffect({ state: journey, journeyContent: content, effect });
  expect(journey).toEqual(before);
  if (result === null) throw new Error("Synthetic spark reward refused");
  return result;
}
function bonus(journey: JourneyState, amount: number): JourneyState {
  const subject = journey.deck[0], card = content.cardDatabase.get(subject.cardNumber);
  if (card === undefined) throw new Error("Missing synthetic card");
  return apply(journey, { kind: "add_deck_entry_spark_bonus", entryId: subject.entryId, cardUuid: card.id, cardNumber: card.cardNumber, amount });
}
function journey(form: DeckEntry["transfiguration"] = null, index = 0, stacked = false, amount = 3, extras: number[] = []): JourneyState {
  const deck = [entry(index, form), entry(index, null, "neighbor"), ...extras.map(i => entry(i)),
    ...Array.from({ length: 8 }, (_, i) => entry(0, null, `filler:${i}`))];
  let state = { ...testJourneyState("spark-contract"), deck };
  state = bonus(bonus(state, amount - 1), 1);
  if (stacked) {
    const subject = state.deck[0], card = cards[index], target = { entryId: subject.entryId, cardUuid: card.id, cardNumber: card.cardNumber };
    state = apply(state, { kind: "composite", children: [
      { kind: "change_deck_entry_keywords", ...target, keywords: { energyCostReduction: 1, fast: true, setReclaim: 1 } },
      { kind: "change_deck_entry_type", ...target, typeChange: { predicateId: parseCardTypeChangePredicateId("spark-type"), label: "", cardType: "Character", subtype: mage } },
    ] });
  }
  return state;
}
function init(state: JourneyState, side: Side, prepared = true): BattleInit {
  const projected = createEngineBattleInit({ seed: 631, scoreToWin: 1000, startingSide: side, journey: state,
    enemy: { deck: Array.from({ length: 9 }, () => character.id), avatar: null, dreamsigns: [] },
    cardDatabase: content.cardDatabase, transfigurationData: content.transfigurationData, minimumDeckSize: 1, dreamwell: [] });
  // The real bridge addresses the journey player; this explicit fixture seats its complete deck on either actor.
  const seated = side === "player" ? projected : { ...projected, decks: { player: projected.decks.enemy, enemy: projected.decks.player } };
  if (!prepared) return seated;
  return { ...seated, setup: {
    placements: [...Array.from({ length: state.deck.length - 8 }, (_, deckIndex) => ({ side, deckIndex, zone: "hand" as const })),
      { side: opponent(side), deckIndex: 0, zone: "hand" }],
    sides: { player: { currentEnergy: 30, maxEnergy: 30, score: 0 }, enemy: { currentEnergy: 30, maxEnergy: 30, score: 0 } },
    turn: { active: side, phase: "day", round: 1, turnNumber: 1, sideTurns: { player: side === "player" ? 1 : 0, enemy: side === "enemy" ? 1 : 0 }, lastNormal: side },
    dreamwell: { deck: [], next: 0 },
  } };
}
function applied(result: IntentOutcome): BattleSlice {
  expect(result.kind).toBe("applied");
  if (result.kind !== "applied") throw new Error("Synthetic intent bounced");
  expect(result.error).toBeNull();
  return result.slice;
}
function spark(state: BattleState, id: Parameters<typeof characteristicsOf>[2]) {
  return characteristicsOf(state, catalog, id).spark;
}
const forms = [
  { form: null, base: 4, cost: 4, activation: 3, points: 2 },
  { form: "Amplified", base: 4, cost: 4, activation: 3, points: 5 },
  { form: "Empowered", base: 4, cost: 2, activation: 3, points: 2 },
  { form: "Kindled", base: 8, cost: 4, activation: 3, points: 2 },
  { form: "Resonant", base: 4, cost: 4, activation: 3, points: 2 },
  { form: "Attuned", base: 4, cost: 4, activation: 2, points: 2 },
  { form: "Perfected", base: 8, cost: 2, activation: 2, points: 5 },
] as const;

for (const side of SIDES) describe(`${side} synthetic spark reward handoff`, () => {
  it("deals the actual reward DTO to distinct physical instances without changing the printing", () => {
    const state = journey("Amplified"), before = json(state), immutable = printed(), input = init(state, side, false);
    expect(input.decks[side][0]).toEqual(engineDeckEntry(state.deck[0], cards[0], content.transfigurationData));
    const start = engine.createBattle(input, NO_PROMPTS).state;
    const subject = Object.values(start.instances).find(i => i.owner === side && i.variant.deckMods?.sparkBonus === 3);
    if (subject === undefined) throw new Error("Reward DTO did not reach a physical card");
    expect(subject).toMatchObject({ owner: side, controller: side, printing: { kind: "card", cardId: character.id }, variant: { amplified: true } });
    expect(spark(start, subject.id)).toBe(7);
    expect(Object.values(start.instances).filter(i => i.id !== subject.id && i.printing.kind === "card" && i.printing.cardId === character.id).every(i => spark(start, i.id) === 4)).toBe(true);
    expect(state).toEqual(before); expect(printed()).toBe(immutable);
  });

  for (const stacked of [false, true]) it.each(forms)(`applies $form before the spark reward with other modifications ${stacked}`, row => {
    const state = journey(row.form, 0, stacked), before = json(state), immutable = printed(), input = init(state, side);
    const started = engine.createBattle(input, NO_PROMPTS).state, [id, neighbor] = started.sides[side].hand;
    const original = stateHash(started), expected = row.base + 3;
    expect(spark(started, id)).toBe(expected); expect(spark(started, neighbor)).toBe(4);
    if (stacked) expect(started.instances[id].variant.deckMods).toEqual({ sparkBonus: 3, costReduction: 1, fast: true, reclaim: 1, typeChange: { cardType: "character", subtype: mage } });
    expect(instanceCard(catalog, started.instances[id])).toMatchObject({ subtype: stacked ? mage : warrior,
      speed: stacked ? "fast" : "standard", costs: [b.energy(row.cost - (stacked ? 1 : 0))] });
    const played = engine.apply(started, side, { kind: "play", card: id, from: "hand" }, NO_PROMPTS);
    expect(played.state.instances[id].zone).toBe("play");
    expect(played.state.sides[side].currentEnergy).toBe(30 - row.cost + (stacked ? 1 : 0));
    expect(played.state.sides[side].score).toBe(row.points);
    const gained = engine.apply(played.state, side, { kind: "activate", source: id, ability: 1 }, NO_PROMPTS).state;
    expect(gained.sides[side].currentEnergy).toBe(30 - row.cost + (stacked ? 1 : 0) - row.activation);
    expect(spark(gained, id)).toBe(expected + 3);
    expect(cardMatchesFilter(gained, catalog, id, { sparkAtLeast: expected + 3, sparkAtMost: expected + 3 })).toBe(true);
    for (const viewer of SIDES) expect(engine.view(gained, viewer).instances[id].characteristics.spark).toBe(expected + 3);
    const seen = engine.view(gained, side), sampled = engine.determinize(seen, input.decks, () => 0.5);
    expect(engine.view(sampled, side).instances[id].characteristics).toEqual(seen.instances[id].characteristics);
    expect(spark(gained, neighbor)).toBe(4); expect(stateHash(started)).toBe(original);
    expect(state).toEqual(before); expect(printed()).toBe(immutable);
  });

  it("keeps Event spark excluded after structural forms and a later Character type change", () => {
    for (const form of [null, "Amplified", "Empowered", "Kindled", "Inspired", "Enduring", "Hastened", "Resonant", "Attuned", "Perfected"] as const) {
      for (const converted of [false, true]) {
        let state = journey(form, 2);
        const target = { entryId: state.deck[0].entryId, cardUuid: eventCard.id, cardNumber: cards[2].cardNumber };
        if (converted) state = apply(state, { kind: "change_deck_entry_type", ...target,
          typeChange: { predicateId: parseCardTypeChangePredicateId("spark-event-type"), label: "", cardType: "Character", subtype: mage } });
        const started = engine.createBattle(init(state, side), NO_PROMPTS).state, [id, neighbor] = started.sides[side].hand;
        expect(spark(started, id)).toBe(converted ? 0 : null); expect(spark(started, neighbor)).toBeNull();
        const result = engine.apply(started, side, { kind: "play", card: id, from: "hand" }, NO_PROMPTS).state;
        expect(result.instances[id].zone).toBe(converted ? "play" : "void");
        expect(spark(result, id)).toBe(converted ? 0 : null);
        expect(result.sides[side].score).toBe(form === "Amplified" || form === "Perfected" ? 5 : 2);
        expect(result.sides[side].currentEnergy).toBe(form === "Empowered" || form === "Perfected" ? 28 : 26);
        expect(result.sides[side].hand.length).toBe(started.sides[side].hand.length - 1 + (form === "Inspired" || form === "Perfected" ? 1 : 0));
        expect(instanceCard(catalog, result.instances[id]).speed).toBe(form === "Hastened" || form === "Perfected" ? "fast" : "standard");
        if (!converted) expect(engine.legalActions(result, side).some(action => action.kind === "play" && action.card === id && action.from === "void")).toBe(form === "Enduring" || form === "Perfected");
      }
    }
    let state = journey("Kindled");
    const target = { entryId: state.deck[0].entryId, cardUuid: character.id, cardNumber: cards[0].cardNumber };
    state = apply(state, { kind: "change_deck_entry_type", ...target,
      typeChange: { predicateId: parseCardTypeChangePredicateId("spark-character-type"), label: "", cardType: "Event", subtype: parseCardSubtype("") } });
    const started = engine.createBattle(init(state, side), NO_PROMPTS).state, id = started.sides[side].hand[0];
    expect(spark(started, id)).toBeNull();
    const result = engine.apply(started, side, { kind: "play", card: id, from: "hand" }, NO_PROMPTS).state;
    expect(result.instances[id].zone).toBe("void"); expect(spark(result, id)).toBeNull(); expect(result.sides[side].score).toBe(0);
  });

  it("separates chosen-X payment, a fixed Kindled base and signed permanent spark", () => {
    for (const [index, form, amount, hand, played, gained] of [
      [1, null, 3, 3, 7, 10], [1, "Kindled", 3, 4, 4, 7], [0, null, -6, 0, 0, 1], [1, null, -6, 0, 0, 1],
    ] as const) {
      const started = engine.createBattle(init(journey(form, index, false, amount), side), NO_PROMPTS).state, id = started.sides[side].hand[0];
      expect(spark(started, id)).toBe(hand);
      const paid = engine.apply(started, side, { kind: "play", card: id, from: "hand" }, index === 1 ? new ScriptedSource([4]) : NO_PROMPTS).state;
      expect(paid.sides[side].currentEnergy).toBe(26); expect(spark(paid, id)).toBe(played);
      const boosted = engine.apply(paid, side, { kind: "activate", source: id, ability: 1 }, NO_PROMPTS).state;
      expect(spark(boosted, id)).toBe(gained);
    }
  });

  it("retains the physical bonus through gained spark, return, expiry, clone and saved replay", () => {
    const input = init(journey("Kindled", 0, true, 3, [3]), side), initial = engine.createBattle(input, NO_PROMPTS).state;
    const [id, neighbor, boost] = initial.sides[side].hand;
    let state = engine.apply(initial, side, { kind: "play", card: id, from: "hand" }, NO_PROMPTS).state;
    state = engine.apply(state, side, { kind: "play", card: neighbor, from: "hand" }, NO_PROMPTS).state;
    state = engine.apply(state, side, { kind: "activate", source: id, ability: 1 }, NO_PROMPTS).state;
    state = engine.apply(state, side, { kind: "play", card: boost, from: "hand" }, new ScriptedSource([[id]])).state;
    expect(spark(state, id)).toBe(17); expect(spark(state, neighbor)).toBe(4);
    const hashes = [state, cloneState(state), json(state)].map(saved => {
      const returned = engine.apply(saved, side, { kind: "activate", source: id, ability: 2 }, NO_PROMPTS).state;
      expect(returned.instances[id].zone).toBe("hand"); expect(spark(returned, id)).toBe(17);
      const expired = passUntil(engine, returned, at(engine, opponent(side), "day")).state;
      expect(spark(expired, id)).toBe(14); expect(spark(expired, neighbor)).toBe(4);
      expect(expired.instances[id].variant).toEqual(initial.instances[id].variant);
      return stateHash(expired);
    });
    expect(hashes[1]).toBe(hashes[0]); expect(hashes[2]).toBe(hashes[0]);
  });

  it("cancels a real target prompt, rejects competing/stale intents, and reloads/replays one committed gain", () => {
    const input = init(journey(null, 0, false, 3, [3]), side), fold = createFoldAdapter(engine);
    let base = applied(fold.start(input));
    const [id, neighbor, boost] = base.committed.sides[side].hand;
    for (const card of [id, neighbor]) base = applied(fold.reduce(base, { kind: "battleAction", side, action: { kind: "play", card, from: "hand" } }));
    const before = json(base), intent = { kind: "battleAction", side, action: { kind: "play", card: boost, from: "hand" } } as const;
    const pending = applied(fold.reduce(base, intent)), prompt = fold.pending(pending)?.prompt;
    if (prompt === undefined) throw new Error("Missing actual spark target prompt");
    expect(prompt.cancellable).toBe(true); expect(pending.committed).toEqual(base.committed);
    expect(fold.reduce(pending, intent)).toMatchObject({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(base, { ...intent, side: opponent(side) }).kind).toBe("bounced");
    const cancelled = applied(fold.reduce(pending, { kind: "cancel", side, promptId: prompt.id }));
    expect(cancelled.committed.sides).toEqual(base.committed.sides);
    expect(spark(cancelled.committed, id)).toBe(7); expect(spark(cancelled.committed, neighbor)).toBe(4);
    const cold = createFoldAdapter(createEngine(catalog)), retried = applied(cold.reduce(json(cancelled), intent)), current = cold.pending(retried)?.prompt;
    if (current === undefined) throw new Error("Missing retried spark target prompt");
    expect(current.id).not.toBe(prompt.id);
    for (const rejected of [
      { kind: "answer", side, promptId: prompt.id, value: [id] },
      { kind: "answer", side: opponent(side), promptId: current.id, value: [id] },
      { kind: "answer", side, promptId: current.id, value: [boost] },
    ] as const) expect(cold.reduce(retried, rejected).kind).toBe("bounced");
    const saved = json(retried), answer = { kind: "answer", side, promptId: current.id, value: [id] } as const;
    const first = applied(cold.reduce(saved, answer)), replay = applied(createFoldAdapter(createEngine(catalog)).reduce(json(retried), answer));
    expect(first.inFlight).toBeNull(); expect(stateHash(first.committed)).toBe(stateHash(replay.committed));
    expect(spark(first.committed, id)).toBe(10); expect(spark(first.committed, neighbor)).toBe(4);
    expect(first.committed.sides[side].currentEnergy).toBe(base.committed.sides[side].currentEnergy - 1);
    expect(cold.reduce(first, answer).kind).toBe("bounced");
    expect(base).toEqual(before); expect(retried).toEqual(saved);
  });
});

function offer(kind: "increase-spark-all" | "purge-random-subtype-and-increase-spark", state: JourneyState) {
  const site: SiteState = { id: parseSiteId("spark-exploration"), type: "Exploration", isEnhanced: false, isVisited: false };
  const action = { id: testExplorationActionId("spark-action"), label: "", effectKind: kind, subtype: warrior, sparkBonus: 3 };
  const local = { ...content, exploration: { ...content.exploration, encounters: [{ cardId: eventCard.id, prose: "", actions: [action] }] } };
  const runtime = buildExplorationRuntime(state, site, local, () => 0, eventCard.id);
  if (runtime === null) throw new Error("Synthetic spark offer refused");
  return { journey: { ...state, siteRuntime: { ...state.siteRuntime, [site.id]: runtime } }, site, seq: 1, content: local,
    payload: { actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION,
      selection: { entryIds: runtime.actionOffers[0].offeredDeckEntryIds ?? [] } } };
}

describe("spark reward transaction boundaries", () => {
  it.each(["increase-spark-all", "purge-random-subtype-and-increase-spark"] as const)("consumes the actual %s offer once and carries the reward into engine start", kind => {
    const request = offer(kind, { ...testJourneyState("spark-offer"), deck: [entry(0), entry(0, null, "neighbor"), entry(2)] });
    const before = json(request.journey);
    for (const patch of [{ actionId: testExplorationActionId("foreign-spark-action") }, { selectionRulesVersion: "stale" },
      { expectedEncounterCardId: character.id }, { expectedRerollCount: 1 }]) {
      expect(resolveExplorationChoice({ ...request, payload: { ...request.payload, ...patch } })).toBeNull();
      expect(request.journey).toEqual(before);
    }
    const next = resolveExplorationChoice(request);
    if (next === null) throw new Error("Valid spark offer refused");
    expect(resolveExplorationChoice({ ...request, journey: json(request.journey), payload: json(request.payload) })).toEqual(next);
    expect(resolveExplorationChoice({ ...request, journey: next })).toBeNull();
    const survivors = next.deck.filter(e => e.cardNumber === cards[0].cardNumber);
    expect(survivors.length).toBe(kind === "increase-spark-all" ? 2 : 1);
    expect(survivors.every(e => e.sparkBonus === 3)).toBe(true);
    expect(next.deck.find(e => e.cardNumber === cards[2].cardNumber)?.sparkBonus).toBeUndefined();
    for (const side of SIDES) {
      const input = init(next, side, false), started = engine.createBattle(input, NO_PROMPTS).state;
      const changed = Object.values(started.instances).filter(i => i.owner === side && i.variant.deckMods?.sparkBonus === 3);
      expect(changed.length).toBe(survivors.length);
      expect(changed.every(i => spark(started, i.id) === 7)).toBe(true);
    }
    expect(request.journey).toEqual(before);
  });

  it("refuses invalid targets, nonfinite amounts, partial composites and incomplete init mappings without changing state", () => {
    const state = journey(), target = { entryId: state.deck[0].entryId, cardUuid: character.id, cardNumber: cards[0].cardNumber }, before = json(state);
    const valid = { kind: "add_deck_entry_spark_bonus", ...target, amount: 2 } as const;
    for (const patch of [{ entryId: parseDeckEntryId("missing-spark-entry") }, { cardUuid: eventCard.id }, { cardNumber: cards[2].cardNumber }, { amount: NaN }, { amount: Infinity }]) {
      const invalid = { ...valid, ...patch };
      expect(applyJourneyRewardEffect({ state, journeyContent: content, effect: invalid })).toBeNull();
      expect(applyJourneyRewardEffect({ state, journeyContent: content, effect: { kind: "composite", children: [valid, invalid] } })).toBeNull();
      expect(state).toEqual(before);
    }
    expect(() => createEngineBattleInit({ seed: 631, scoreToWin: 25, startingSide: "player", journey: state,
      enemy: { deck: [character.id], avatar: null, dreamsigns: [] }, cardDatabase: new Map(),
      transfigurationData: content.transfigurationData, minimumDeckSize: 1, dreamwell: [] })).toThrow();
    expect(state).toEqual(before); expect(apply(state, valid).deck[0].sparkBonus).toBe(5);
  });
});
