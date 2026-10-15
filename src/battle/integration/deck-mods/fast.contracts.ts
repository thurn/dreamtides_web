/** Synthetic preparation only; original hv-umm2.282 owns real-card recipes, both-controller sweeps and judgment. */
import { describe, expect, it } from "vitest";
import { createCatalog, instanceCard, type EngineCardDefinition } from "../../../engine/catalog";
import * as b from "../../../engine/dsl/builders";
import { onMaterialized, triggered, whenYouPlay } from "../../../engine/dsl/triggers";
import { BASE_VARIANT, type Variant } from "../../../engine/dsl/types";
import * as p from "../../../engine/effects/primitives";
import { createEngine } from "../../../engine/engine";
import { createFoldAdapter, type IntentOutcome } from "../../../engine/fold/slice";
import { cloneState } from "../../../engine/state/clone";
import { deserializeState, serializeState, stateHash } from "../../../engine/state/hash";
import { SIDES, opponent, type InstanceId, type Side } from "../../../engine/state/ids";
import type { BattleInit, BattleState } from "../../../engine/state/types";
import { NO_PROMPTS } from "../../../engine/steps/sources";
import { syntheticId } from "../../../engine/testing/synthetic-cards";
import { passUntil } from "../../../engine/testing/trigger-harness";
import { appendEngineTransfiguration } from "../../../engine/transfigurations";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../../journey_v2/testing/fixtures";
import { applyJourneyRewardEffect, type JourneyRewardEffect } from "../../../rules/journey/reward-effects";
import { testJourneyState } from "../../../testing/journey-genesis";
import { resonantChange, transfigurationSourceState } from "../../../transfiguration/transfiguration-logic";
import { parseCardSubtype } from "../../../types/card-identity";
import { parseCardTypeChangePredicateId, parseDeckEntryId } from "../../../types/identifiers";
import type { DeckEntry, JourneyState } from "../../../types/journey";
import { createEngineBattleInit, engineDeckEntry } from "../engine-battle-init";

const warrior = parseCardSubtype("Warrior"), mage = parseCardSubtype("Mage"), untyped = parseCardSubtype("");
function definition(index: number, cardType: "character" | "event", speed: EngineCardDefinition["speed"]): EngineCardDefinition {
  const text = cardType === "character" ? "▸Materialized: Gain 2⍟.\n\n3●: Gain 1⍟." : "Gain 2⍟.";
  const amplified = text.replace("Gain 2", "Gain 5");
  return { id: syntheticId(0x63301 + index), cardType, speed, costs: [b.energy(7)], spark: cardType === "character" ? 3 : null,
    subtype: cardType === "character" ? warrior : untyped, status: "authored",
    transfiguration: { amplified: true, resonant: { base: resonantChange(text), amplified: resonantChange(amplified) } },
    transfigurationState: (initial, steps) => transfigurationSourceState(text, amplified, initial, steps),
    abilities: variant => cardType === "event" ? [b.event(p.gainPoints(variant.amplified ? 5 : 2))] : [
      triggered(onMaterialized(), p.gainPoints(variant.amplified ? 5 : 2)),
      b.activated([b.energy(3)], p.gainPoints(1)), b.activated([], p.returnToHand(b.self())), b.activated([], p.dissolve(b.self())),
    ] };
}
const characters = [definition(0, "character", "standard"), definition(1, "character", "fast"), definition(2, "character", "interrupt")];
const events = [definition(3, "event", "standard"), definition(4, "event", "fast"), definition(5, "event", "interrupt")];
const filler: EngineCardDefinition = { ...characters[0], id: syntheticId(0x63307), costs: [], status: "vanilla", abilities: () => [] };
const payment: EngineCardDefinition = { ...events[0], id: syntheticId(0x63308), costs: [b.energy(2)],
  abilities: () => [b.event(p.gainPoints(2)), b.additionalCost(b.discardCost())] };
const observer: EngineCardDefinition = { ...filler, id: syntheticId(0x63309), abilities: () => [
  triggered(whenYouPlay({ fast: true, cardType: "event" }), p.gainPoints(10)),
  triggered(whenYouPlay({ fast: true, cardType: "character" }), p.gainPoints(20)),
  triggered(whenYouPlay({ fast: true }, 2), p.gainPoints(100)),
  b.activated([], p.drawMatching({ fast: true, cardType: "event" })),
] };
const definitions = [...characters, ...events, filler, payment, observer];
const catalog = createCatalog(definitions, []), engine = createEngine(catalog);
const cards = definitions.map((card, index) => makeAuguryTestCard({ id: card.id, cardNumber: 63301 + index,
  cardType: card.cardType === "character" ? "Character" : "Event", subtype: card.subtype,
  energyCost: card === filler || card === observer ? 0 : card === payment ? 2 : 7,
  spark: typeof card.spark === "number" ? card.spark : null, isFast: card.speed !== "standard", isInterrupt: card.speed === "interrupt" }));
const content = makeAuguryTestContent({ cards });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const printed = () => JSON.stringify(definitions.map(card => ({ ...card,
  base: card.abilities(BASE_VARIANT), amplified: card.abilities({ amplified: true }) })));
function entry(index: number, suffix: string, form: DeckEntry["transfiguration"] = null): DeckEntry {
  return { entryId: parseDeckEntryId(`fast:${index}:${suffix}`), cardNumber: cards[index].cardNumber, transfiguration: form, isBane: false };
}
function target(state: JourneyState, index = 0) {
  const subject = state.deck[index], card = content.cardDatabase.get(subject.cardNumber);
  if (card === undefined) throw new Error("Missing synthetic Fast printing");
  return { entryId: subject.entryId, cardUuid: card.id, cardNumber: card.cardNumber };
}
function reward(state: JourneyState, effect: JourneyRewardEffect): JourneyState {
  const before = copy(state), next = applyJourneyRewardEffect({ state, journeyContent: content, effect });
  expect(state).toEqual(before);
  if (next === null) throw new Error("Synthetic Fast reward refused");
  return next;
}
function journey(index = 0, form: DeckEntry["transfiguration"] = null, stacked = false): JourneyState {
  let state: JourneyState = { ...testJourneyState("fast-contract"), avatar: null, dreamsigns: [], battleModifiers: [],
    deck: [entry(index, "subject", form), entry(index, "sentinel"), ...Array.from({ length: 12 }, (_, i) => entry(6, `filler:${i}`))] };
  state = reward(state, { kind: "change_deck_entry_keywords", ...target(state), keywords: { fast: true } });
  if (stacked) state = reward(state, { kind: "composite", children: [
    { kind: "reduce_deck_entry_energy_cost", ...target(state), amount: 2 },
    { kind: "change_deck_entry_keywords", ...target(state), keywords: { setReclaim: 1 } },
    { kind: "change_deck_entry_type", ...target(state), typeChange: { predicateId: parseCardTypeChangePredicateId("fast-subtype"),
      label: "", cardType: definitions[index].cardType === "character" ? "Character" : "Event", subtype: mage } },
    { kind: "add_deck_entry_spark_bonus", ...target(state), amount: 1 },
  ] });
  return state;
}
function init(state: JourneyState, side: Side, options: { energy?: number; prepared?: boolean; observer?: boolean; opponentHand?: boolean; active?: Side; ordered?: Variant } = {}): BattleInit {
  const active = options.active ?? side, energy = options.energy ?? 40;
  const mapped = createEngineBattleInit({ seed: 633, scoreToWin: 1000, startingSide: active, journey: state,
    enemy: { deck: [definitions.find(card => card.id === target(state).cardUuid)!.id,
      ...Array.from({ length: 12 }, () => filler.id)], avatar: null, dreamsigns: [] },
    cardDatabase: content.cardDatabase, transfigurationData: content.transfigurationData, minimumDeckSize: 1, dreamwell: [] });
  const subjectCard = cards.find(card => card.cardNumber === state.deck[0].cardNumber)!;
  expect(mapped.decks.player[0]).toEqual(engineDeckEntry(state.deck[0], subjectCard, content.transfigurationData));
  const subjectDeck = [...mapped.decks.player];
  if (options.ordered !== undefined) subjectDeck[0] = { cardId: subjectDeck[0].cardId, ...options.ordered, deckMods: subjectDeck[0].deckMods };
  if (options.observer) subjectDeck.push({ cardId: observer.id });
  // The actual journey bridge addresses player. Seat its complete mapped deck on the requested public engine actor.
  const seated = { ...mapped, decks: side === "player" ? { player: subjectDeck, enemy: mapped.decks.enemy } : { player: mapped.decks.enemy, enemy: subjectDeck } };
  if (options.prepared === false) return seated;
  return { ...seated, setup: { placements: [
    { side, deckIndex: 0, zone: "hand" }, { side, deckIndex: 1, zone: "hand" }, { side, deckIndex: 2, zone: "hand" },
    ...(options.opponentHand === false ? [] : [{ side: opponent(side), deckIndex: 0, zone: "hand" as const }]),
    ...(options.observer ? [{ side, deckIndex: subjectDeck.length - 1, zone: "play" as const, slot: { rank: "back" as const, index: 0 } }] : []),
  ], sides: { player: { currentEnergy: energy, maxEnergy: energy, score: 0 }, enemy: { currentEnergy: energy, maxEnergy: energy, score: 0 } },
  turn: { active, phase: "day", round: 1, turnNumber: 1, lastNormal: active, sideTurns: { player: active === "player" ? 1 : 0, enemy: active === "enemy" ? 1 : 0 } },
  dreamwell: { deck: [], next: 0 } } };
}
function applied(result: IntentOutcome) {
  expect(result.kind).toBe("applied");
  if (result.kind !== "applied") throw new Error("Synthetic Fast intent bounced");
  expect(result.error).toBeNull();
  return result.slice;
}
const playable = (state: BattleState, side: Side, id: InstanceId) => engine.legalActions(state, side).some(action => action.kind === "play" && action.card === id);
const play = (state: BattleState, side: Side, id = state.sides[side].hand[0], from: "hand" | "void" = "hand") =>
  engine.apply(state, side, { kind: "play", card: id, from }, NO_PROMPTS).state;
const activate = (state: BattleState, side: Side, source: InstanceId, ability: number) => engine.apply(state, side, { kind: "activate", source, ability }, NO_PROMPTS).state;
const rows = [
  ...([null, "Amplified", "Empowered", "Kindled", "Resonant", "Attuned", "Perfected"] as const).flatMap(form => characters.map((card, index) => ({ form, card, index }))),
  ...([null, "Amplified", "Empowered", "Inspired", "Enduring", "Hastened", "Perfected"] as const).flatMap(form => events.filter(card => form !== "Hastened" || card.speed === "standard").map(card => ({ form, card, index: definitions.indexOf(card) }))),
];

for (const side of SIDES) describe(`${side} synthetic permanent Fast`, () => {
  it("carries the real reward through the bridge and ordinary deal to one physical same-UUID copy", () => {
    const source = journey(), before = copy(source), immutable = printed();
    const rewarded = reward(source, { kind: "change_deck_entry_keywords", ...target(source), keywords: { fast: true } });
    expect(rewarded).toEqual(source);
    const input = init(rewarded, side, { prepared: false }), inputBefore = copy(input), state = engine.createBattle(input, NO_PROMPTS).state;
    const subjects = Object.values(state.instances).filter(card => card.owner === side && card.variant.deckMods?.fast === true);
    expect(subjects).toHaveLength(1);
    const subject = subjects[0];
    expect(subject.controller).toBe(side); expect(instanceCard(catalog, subject).speed).toBe("fast");
    const sentinels = Object.values(state.instances).filter(card => card.id !== subject.id && card.printing.kind === "card" && card.printing.cardId === characters[0].id);
    expect(sentinels.some(card => card.owner === side)).toBe(true); expect(sentinels.some(card => card.owner !== side)).toBe(true);
    expect(sentinels.every(card => instanceCard(catalog, card).speed === "standard")).toBe(true);
    expect(source).toEqual(before); expect(input).toEqual(inputBefore); expect(printed()).toBe(immutable);
  });

  it("plays in Fast windows, pays once, and preserves Interrupt-only responses", () => {
    const state = engine.createBattle(init(journey(), side), NO_PROMPTS).state, [id, sentinel] = state.sides[side].hand;
    expect(playable(state, side, id)).toBe(true); expect(playable(state, side, sentinel)).toBe(true);
    const night = passUntil(engine, state, next => next.turn.phase === "night").state;
    expect(playable(night, side, id)).toBe(true); expect(playable(night, side, sentinel)).toBe(false);
    const paid = play(night, side, id); expect(paid.sides[side].currentEnergy).toBe(33); expect(paid.instances[id].zone).toBe("play");
    const defending = engine.createBattle(init(journey(), side, { active: opponent(side) }), NO_PROMPTS).state;
    const dusk = passUntil(engine, defending, next => next.turn.phase === "dusk").state;
    expect(playable(dusk, side, dusk.sides[side].hand[0])).toBe(true); expect(playable(dusk, side, dusk.sides[side].hand[1])).toBe(false);
    expect(play(dusk, side).sides[side].currentEnergy).toBe(33);
    const response = engine.createBattle(init(journey(5), side, { active: opponent(side) }), NO_PROMPTS).state;
    const announced = play(response, opponent(side));
    expect(announced.stack.length).toBeGreaterThan(0); expect(playable(announced, side, response.sides[side].hand[0])).toBe(true);
    const answered = play(announced, side, response.sides[side].hand[0]);
    expect(answered.turnLog.played[side][0].speed).toBe("interrupt");
    // Supply a genuine response through the side's intrinsic Interrupt sentinel so the stack remains observable.
    const interruptJourney = reward(journey(3), { kind: "add_catalog_card", cardUuid: events[2].id, cardNumber: cards[5].cardNumber });
    const responseInput = init(interruptJourney, side, { active: opponent(side) });
    const withInterrupt = { ...responseInput, setup: { ...responseInput.setup!, placements: [...responseInput.setup!.placements,
      { side, deckIndex: interruptJourney.deck.length - 1, zone: "hand" as const }] } };
    const held = engine.createBattle(withInterrupt, NO_PROMPTS).state, onStack = play(held, opponent(side));
    expect(onStack.stack.length).toBeGreaterThan(0); expect(playable(onStack, side, held.sides[side].hand[0])).toBe(false);
    expect(playable(onStack, side, held.sides[side].hand[3])).toBe(true);
    const short = engine.createBattle(init(journey(), side, { energy: 6 }), NO_PROMPTS).state, before = copy(short);
    expect(playable(short, side, short.sides[side].hand[0])).toBe(false); expect(() => play(short, side)).toThrow();
    expect(() => play(state, opponent(side), id)).toThrow(); expect(() => play(state, side, id, "void")).toThrow();
    expect(short).toEqual(before);
  });

  it("uses real Fast/type filters for current draws and captured matching plays on both public views", () => {
    let source = journey(3);
    source = reward(source, { kind: "add_catalog_card", cardUuid: characters[0].id, cardNumber: cards[0].cardNumber });
    source = reward(source, { kind: "change_deck_entry_keywords", ...target(source, source.deck.length - 1), keywords: { fast: true } });
    source = reward(source, { kind: "add_catalog_card", cardUuid: events[2].id, cardNumber: cards[5].cardNumber });
    const input = init(source, side, { observer: true });
    const prepared = { ...input, setup: { ...input.setup!, placements: [...input.setup!.placements,
      { side, deckIndex: source.deck.length - 2, zone: "hand" as const }, { side, deckIndex: source.deck.length - 1, zone: "hand" as const }] } };
    const state = engine.createBattle(prepared, NO_PROMPTS).state, ids = state.sides[side].hand, observerId = state.sides[side].backRank[0]!;
    let after = play(state, side, ids[1]); expect(after.sides[side].score).toBe(2);
    after = play(after, side, ids[0]); expect(after.sides[side].score).toBe(14);
    after = play(after, side, ids[3]); expect(after.sides[side].score).toBe(136);
    after = play(after, side, ids[4]); expect(after.sides[side].score).toBe(148);
    for (const viewer of SIDES) expect(engine.view(after, viewer).turnLog.played[side].map(card => [card.cardType, card.speed])).toEqual([
      ["event", "standard"], ["event", "fast"], ["character", "fast"], ["event", "interrupt"],
    ]);
    let drawSource = journey(3);
    for (const index of [0, 3]) {
      drawSource = reward(drawSource, { kind: "add_catalog_card", cardUuid: definitions[index].id, cardNumber: cards[index].cardNumber });
      drawSource = reward(drawSource, { kind: "change_deck_entry_keywords", ...target(drawSource, drawSource.deck.length - 1), keywords: { fast: true } });
    }
    const same = engine.createBattle(init(drawSource, side, { observer: true }), NO_PROMPTS).state;
    const matching = same.sides[side].deck.find(id => same.instances[id].printing.kind === "card" && same.instances[id].printing.cardId === events[0].id)!;
    const draw = activate(same, side, same.sides[side].backRank[0]!, 3);
    expect(draw.sides[side].hand).toEqual([...same.sides[side].hand, matching]);
    expect(draw.sides[side].deck).toEqual(same.sides[side].deck.filter(id => id !== matching));
    expect(observerId).not.toBe(ids[0]); expect(after.sides[opponent(side)].score).toBe(0);
  });

  for (const stacked of [false, true]) it.each(rows)(`stacks $form with $card.cardType/$card.speed and other modifications ${stacked}`, row => {
    const source = journey(row.index, row.form, stacked), before = copy(source), immutable = printed();
    const state = engine.createBattle(init(source, side, { opponentHand: false }), NO_PROMPTS).state, [id, sentinel] = state.sides[side].hand;
    const cost = (row.form === "Empowered" || row.form === "Perfected" ? 3 : 7) - (stacked ? 2 : 0);
    const after = play(state, side), stronger = row.form === "Amplified" || row.form === "Perfected", score = stronger ? 5 : 2;
    expect(after.sides[side].currentEnergy).toBe(40 - cost); expect(after.sides[side].score).toBe(score);
    const resolved = instanceCard(catalog, after.instances[id]);
    expect(resolved.speed).toBe(row.card.speed === "interrupt" ? "interrupt" : "fast");
    expect(resolved.subtype).toBe(stacked ? mage : row.card.subtype); expect(resolved.cardType).toBe(row.card.cardType);
    expect(instanceCard(catalog, after.instances[sentinel]).speed).toBe(row.card.speed);
    expect(after.instances[id].zone).toBe(row.card.cardType === "character" ? "play" : "void");
    expect(after.sides[opponent(side)].currentEnergy).toBe(40);
    expect(after.turnLog.played[side][0]).toMatchObject({ instance: id, cardType: row.card.cardType, speed: resolved.speed });
    if (row.card.cardType === "character") {
      expect(engine.view(after, side).instances[id].characteristics.spark).toBe((row.form === "Kindled" || row.form === "Perfected" ? 6 : 3) + (stacked ? 1 : 0));
      const activated = activate(after, side, id, 1);
      expect(activated.sides[side].currentEnergy).toBe(40 - cost - (row.form === "Attuned" || row.form === "Perfected" ? 2 : 3));
      const gone = activate(activated, side, id, 3);
      expect(gone.sides[side].score).toBe(score + 1 + (row.form === "Resonant" || row.form === "Perfected" ? score : 0));
    } else {
      expect(after.sides[side].hand.length).toBe(state.sides[side].hand.length - 1 + (row.form === "Inspired" || row.form === "Perfected" ? 1 : 0));
      if (stacked || row.form === "Enduring" || row.form === "Perfected") {
        const reclaimed = play(after, side, id, "void");
        expect(reclaimed.sides[side].currentEnergy).toBe(40 - cost - (stacked ? 1 : cost));
        expect(reclaimed.instances[id].zone).toBe("banished");
      }
    }
    expect(source).toEqual(before); expect(printed()).toBe(immutable);
  });

  it.each(["event", "character"] as const)("selects forms from the original %s before a permanent opposite-type change", original => {
    const isEvent = original === "event";
    let source = journey(isEvent ? 3 : 0, isEvent ? "Inspired" : "Kindled", true);
    source = reward(source, { kind: "change_deck_entry_type", ...target(source), typeChange: {
      predicateId: parseCardTypeChangePredicateId("fast-opposite-type"), label: "", cardType: isEvent ? "Character" : "Event", subtype: mage } });
    const state = engine.createBattle(init(source, side), NO_PROMPTS).state, id = state.sides[side].hand[0], after = play(state, side);
    expect(after.instances[id].zone).toBe(isEvent ? "play" : "void"); expect(instanceCard(catalog, after.instances[id]).speed).toBe("fast");
    expect(after.sides[side].currentEnergy).toBe(35); expect(after.sides[side].score).toBe(isEvent ? 2 : 0);
    expect(after.turnLog.played[side][0].cardType).toBe(isEvent ? "character" : "event");
    if (isEvent) { expect(engine.view(after, side).instances[id].characteristics.spark).toBe(0); expect(after.sides[side].hand.length).toBe(state.sides[side].hand.length); }
  });

  it("executes delivered chronological inputs after the real bridge without conflating journey membership", () => {
    for (const [forms, draws] of [[["Inspired", "Amplified"], 0], [["Amplified", "Inspired"], 1]] as const) {
      let variant: Variant = BASE_VARIANT;
      for (const form of forms) variant = appendEngineTransfiguration(events[0], variant, form);
      const source = journey(3), input = init(source, side, { ordered: variant }), before = copy(input);
      const state = engine.createBattle(input, NO_PROMPTS).state, after = play(state, side);
      expect(after.sides[side].hand.length).toBe(state.sides[side].hand.length - 1 + draws); expect(after.sides[side].score).toBe(5);
      expect(after.turnLog.played[side][0].speed).toBe("fast"); expect(input).toEqual(before);
    }
    const perfect = appendEngineTransfiguration(events[0], BASE_VARIANT, "Perfected");
    const later = appendEngineTransfiguration(events[0], perfect, "Inspired");
    const state = engine.createBattle(init(journey(3), side, { ordered: later }), NO_PROMPTS).state;
    const after = play(state, side); expect(after.sides[side].hand.length).toBe(state.sides[side].hand.length + 1);
    expect(after.sides[side].currentEnergy).toBe(37); expect(after.sides[side].score).toBe(5);
    let repeated: Variant = BASE_VARIANT;
    for (const form of ["Kindled", "Empowered", "Kindled"] as const) repeated = appendEngineTransfiguration(characters[0], repeated, form);
    const input = init(journey(0, null, true), side, { ordered: repeated });
    const hashes = [input, copy(input)].map(saved => {
      const start = engine.createBattle(saved, NO_PROMPTS).state, paid = play(start, side), id = start.sides[side].hand[0];
      expect(paid.sides[side].currentEnergy).toBe(39); expect(engine.view(paid, side).instances[id].characteristics.spark).toBe(13);
      expect(paid.turnLog.played[side][0].speed).toBe("fast"); return stateHash(paid);
    });
    expect(hashes[1]).toBe(hashes[0]); expect(perfect.transfigurationApplications).toHaveLength(1);
  });

  it("retains physical Fast through return, replay, a turn, clone, reload and a fresh battle", () => {
    const source = journey(), input = init(source, side), start = engine.createBattle(input, NO_PROMPTS).state, [id, sentinel] = start.sides[side].hand;
    const first = play(start, side);
    const hashes = [first, cloneState(first), deserializeState(serializeState(first))].map(saved => {
      const returned = activate(saved, side, id, 2), again = play(returned, side, id);
      const later = passUntil(engine, again, next => next.turn.active === opponent(side) && next.turn.phase === "day").state;
      expect(instanceCard(catalog, later.instances[id]).speed).toBe("fast"); expect(instanceCard(catalog, later.instances[sentinel]).speed).toBe("standard");
      expect(later.sides[side].currentEnergy).toBe(26); return stateHash(later);
    });
    expect(hashes[1]).toBe(hashes[0]); expect(hashes[2]).toBe(hashes[0]);
    expect(stateHash(createEngine(catalog).createBattle(copy(input), NO_PROMPTS).state)).toBe(stateHash(start));
    expect(source.deck[0].keywordModification?.fast).toBe(true);
  });

  it("cancels a real Fast payment and cold-replays one debit while refusing foreign, competing and stale inputs", () => {
    const fold = createFoldAdapter(engine), base = applied(fold.start(init(journey(7), side))), before = copy(base);
    const [id, sentinel, discard] = base.committed.sides[side].hand;
    const intent = { kind: "battleAction", side, action: { kind: "play", card: id, from: "hand" } } as const;
    const pending = applied(fold.reduce(base, intent)), prompt = fold.pending(pending)?.prompt;
    if (prompt === undefined) throw new Error("Missing Fast payment prompt");
    expect(prompt.kind).toBe("chooseCards"); expect(prompt.cancellable).toBe(true); expect(pending.committed).toEqual(base.committed);
    expect(fold.reduce(pending, intent)).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(base, { ...intent, side: opponent(side) }).kind).toBe("bounced");
    expect(fold.reduce(pending, { kind: "answer", side, promptId: prompt.id, value: [id] }).kind).toBe("bounced");
    const cancelled = applied(fold.reduce(pending, { kind: "cancel", side, promptId: prompt.id }));
    expect(cancelled.committed.sides).toEqual(base.committed.sides); expect(cancelled.committed.turnLog.played).toEqual(base.committed.turnLog.played);
    const cold = createFoldAdapter(createEngine(catalog)), retried = applied(cold.reduce(copy(cancelled), intent)), current = cold.pending(retried)?.prompt;
    if (current === undefined) throw new Error("Missing retried Fast payment prompt");
    expect(current.id).not.toBe(prompt.id);
    expect(cold.reduce(retried, { kind: "answer", side, promptId: prompt.id, value: [discard] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(cold.reduce(retried, { kind: "answer", side: opponent(side), promptId: current.id, value: [discard] }).kind).toBe("bounced");
    const answer = { kind: "answer", side, promptId: current.id, value: [discard] } as const, saved = copy(retried);
    const done = applied(cold.reduce(saved, answer)), replayed = applied(createFoldAdapter(createEngine(catalog)).reduce(copy(retried), answer));
    expect(stateHash(done.committed)).toBe(stateHash(replayed.committed)); expect(done.inFlight).toBeNull();
    expect(done.committed.sides[side].currentEnergy).toBe(38); expect(done.committed.sides[side].score).toBe(2);
    expect(done.committed.instances[discard].zone).toBe("void"); expect(done.committed.instances[sentinel].zone).toBe("hand");
    expect(done.committed.turnLog.played[side]).toHaveLength(1); expect(done.committed.turnLog.played[side][0].speed).toBe("fast");
    expect(cold.reduce(done, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(base).toEqual(before); expect(retried).toEqual(saved);
  });
});

describe("synthetic permanent Fast reward refusal", () => {
  it("rejects invalid concrete targets and partial composites without mutating the input or printing", () => {
    const state = journey(), before = copy(state), immutable = printed();
    const valid = { kind: "change_deck_entry_keywords", ...target(state), keywords: { fast: true } } as const;
    for (const patch of [{ entryId: parseDeckEntryId("missing-fast-entry") }, { cardUuid: events[0].id }, { cardNumber: cards[3].cardNumber }]) {
      const invalid = { ...valid, ...patch };
      expect(applyJourneyRewardEffect({ state, journeyContent: content, effect: invalid })).toBeNull();
      expect(applyJourneyRewardEffect({ state, journeyContent: content, effect: { kind: "composite", children: [valid, invalid] } })).toBeNull();
      expect(state).toEqual(before);
    }
    expect(() => createEngineBattleInit({ seed: 633, scoreToWin: 25, startingSide: "player", journey: state,
      enemy: { deck: [characters[0].id], avatar: null, dreamsigns: [] }, cardDatabase: new Map(), transfigurationData: content.transfigurationData,
      minimumDeckSize: 1, dreamwell: [] })).toThrow();
    expect(printed()).toBe(immutable);
  });
});
