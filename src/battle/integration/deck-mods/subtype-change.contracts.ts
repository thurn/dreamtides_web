/** Synthetic preparation only; original hv-umm2.284 retains all32 UUIDs, real20 per controller and judgment. */
import { describe, expect, it } from "vitest";
import { createCatalog, instanceCard, type EngineCardDefinition } from "../../../engine/catalog";
import * as b from "../../../engine/dsl/builders";
import { onMaterialized, triggered, whenMaterialize, whenYouPlay } from "../../../engine/dsl/triggers";
import { BASE_VARIANT } from "../../../engine/dsl/types";
import * as p from "../../../engine/effects/primitives";
import { createEngine } from "../../../engine/engine";
import { createFoldAdapter, type IntentOutcome } from "../../../engine/fold/slice";
import { cloneState } from "../../../engine/state/clone";
import { deserializeState, serializeState, stateHash } from "../../../engine/state/hash";
import { SIDES, opponent, type InstanceId, type Side } from "../../../engine/state/ids";
import type { BattleInit, BattlePlacement, BattleState } from "../../../engine/state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../engine/steps/sources";
import { syntheticId } from "../../../engine/testing/synthetic-cards";
import { passUntil } from "../../../engine/testing/trigger-harness";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../../journey_v2/testing/fixtures";
import { applyJourneyRewardEffect, type JourneyRewardEffect } from "../../../rules/journey/reward-effects";
import { SELECTION_RULES_VERSION } from "../../../reward-selection";
import { buildExplorationRuntime, resolveExplorationChoice } from "../../../session/providers/exploration-provider";
import { testJourneyState } from "../../../testing/journey-genesis";
import { appendDeckEntryTransfiguration } from "../../../transfiguration/deck-entry-transfigurations";
import { resonantChange, transfigurationSourceState } from "../../../transfiguration/transfiguration-logic";
import { parseCardName, parseCardSubtype } from "../../../types/card-identity";
import { parseCardTypeChangePredicateId, parseDeckEntryId, parseSiteId } from "../../../types/identifiers";
import type { DeckEntry, JourneyState, SiteState } from "../../../types/journey";
import { testExplorationActionId } from "../../../types/test-identities";
import { createEngineBattleInit, engineDeckEntry } from "../engine-battle-init";

const warrior = parseCardSubtype("Warrior"), mage = parseCardSubtype("Mage"), untyped = parseCardSubtype("");
const text = "▸Materialized: Gain 2⍟.\n\n3●: Gain 1⍟.", eventText = "Gain 2⍟.\n\n3●: Gain 1⍟.";
function definition(index: number, character: boolean): EngineCardDefinition {
  const original = character ? text : eventText, amplified = original.replace("Gain 2", "Gain 5");
  return { id: syntheticId(0x63500 + index), cardType: character ? "character" : "event", costs: [b.energy(7)],
    spark: character ? 3 : null, subtype: character ? warrior : untyped, speed: "standard", status: "authored",
    transfiguration: { amplified: true, resonant: { base: resonantChange(original), amplified: resonantChange(amplified) } },
    transfigurationState: (initial, steps) => transfigurationSourceState(original, amplified, initial, steps),
    abilities: variant => [character ? triggered(onMaterialized(), p.gainPoints(variant.amplified ? 5 : 2)) : b.event(p.gainPoints(variant.amplified ? 5 : 2)),
      b.activated([b.energy(3)], p.gainPoints(1)), b.activated([], p.returnToHand(b.self())), b.activated([], p.dissolve(b.self()))],
  };
}
const character = definition(0, true), eventCard = definition(1, false);
const filler: EngineCardDefinition = { ...character, id: syntheticId(0x63502), costs: [], status: "vanilla", abilities: () => [] };
const observer: EngineCardDefinition = { ...filler, id: syntheticId(0x63503), abilities: () => [
  b.staticAbility(p.sparkModifier(b.all({ controller: "you", subtype: mage }), 2)),
  triggered(whenYouPlay({ cardType: "character", subtype: mage }), p.gainPoints(3)),
  triggered(whenMaterialize({ controller: "you", subtype: mage }), p.gainPoints(5)),
  b.activated([], p.gainSpark(b.target({ controller: "you", subtype: mage }), 2)),
  b.activated([], p.gainSpark(b.target({ controller: "you", notSubtype: warrior }), 4)),
  b.activated([], p.drawMatching({ cardType: "character", subtype: mage })),
  b.activated([], p.returnFromVoid(b.fromVoid({ cardType: "character", subtype: mage }))),
  b.activated([], p.gainSpark(b.target({ controller: "you", subtype: warrior }), 8)),
] };
const allTypes: EngineCardDefinition = { ...character, id: syntheticId(0x63504), abilities: () => [
  b.staticAbility(p.giveAllTypes(b.self())), b.activated([], p.chooseSubtype({ self: true })),
  b.activated([], p.giveAllTypes(b.self(), "whileSourceInPlay")), b.activated([], p.returnToHand(b.self())),
] };
const literal: EngineCardDefinition = { ...character, id: syntheticId(0x63505), abilities: () => [
  b.activated([], p.gainSpark(b.all({ controller: "you", subtype: warrior }), 1)),
  b.activated([], p.materializeFigmentCopy(b.self())), b.activated([], p.createCopyInHand(b.self())),
] };
const payment: EngineCardDefinition = { ...eventCard, id: syntheticId(0x63506), costs: [b.energy(2)], abilities: () => [
  b.event(p.gainPoints(2)), b.additionalCost(b.optionalCost(b.energy(1)), b.discardCostFilter({ cardType: "character", subtype: mage })),
] };
const plainMage: EngineCardDefinition = { ...filler, id: syntheticId(0x63507), subtype: mage };
const definitions = [character, eventCard, filler, observer, allTypes, literal, payment, plainMage];
const catalog = createCatalog(definitions, []), engine = createEngine(catalog);
const cards = definitions.map((card, index) => makeAuguryTestCard({ id: card.id, cardNumber: 63500 + index,
  name: parseCardName("Shared synthetic display name"), cardType: card.cardType === "character" ? "Character" : "Event", subtype: card.subtype,
  energyCost: index === 6 ? 2 : index === 2 || index === 3 || index === 7 ? 0 : 7, spark: typeof card.spark === "number" ? card.spark : null,
  renderedText: card.cardType === "character" ? text : eventText, amplifiedText: (card.cardType === "character" ? text : eventText).replace("Gain 2", "Gain 5"),
}));
const content = makeAuguryTestContent({ cards });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const printed = () => JSON.stringify(definitions.map(card => ({ ...card, base: card.abilities(BASE_VARIANT), amplified: card.abilities({ amplified: true }) })));
function entry(index: number, suffix: string): DeckEntry {
  return { entryId: parseDeckEntryId(`subtype:${index}:${suffix}`), cardNumber: cards[index].cardNumber, transfiguration: null, isBane: false };
}
function target(state: JourneyState, index = 0) {
  const subject = state.deck[index], card = content.cardDatabase.get(subject.cardNumber);
  if (card === undefined) throw new Error("Missing synthetic subtype printing");
  return { entryId: subject.entryId, cardNumber: card.cardNumber, cardUuid: card.id };
}
function reward(state: JourneyState, effect: JourneyRewardEffect): JourneyState {
  const before = copy(state), next = applyJourneyRewardEffect({ state, journeyContent: content, effect });
  expect(state).toEqual(before);
  if (next === null) throw new Error("Synthetic subtype reward refused");
  return next;
}
function changed(state: JourneyState, index = 0, subtype = mage, cardType: "Character" | "Event" = "Character") {
  return reward(state, { kind: "change_deck_entry_type", ...target(state, index), typeChange: {
    predicateId: parseCardTypeChangePredicateId("synthetic-subtype"), label: "", subtype, cardType,
  } });
}
function forms(state: JourneyState, index: number, sequence: readonly NonNullable<DeckEntry["transfiguration"]>[]) {
  const card = cards.find(card => card.cardNumber === state.deck[index].cardNumber)!;
  const definition = definitions.find(definition => definition.id === card.id)!;
  let next = state.deck[index];
  for (const form of sequence) {
    const result = appendDeckEntryTransfiguration(content.transfigurationData, card, definition, next, form);
    if (!result.ok) throw new Error(`Synthetic journey form refused: ${form}/${result.reason}`);
    next = result.value;
  }
  return { ...state, deck: state.deck.map((subject, i) => i === index ? next : subject) };
}
function journey(index = 0, sequence: readonly NonNullable<DeckEntry["transfiguration"]>[] = [], stacked = false) {
  let state: JourneyState = { ...testJourneyState("subtype-contract"), avatar: null, dreamsigns: [], battleModifiers: [],
    deck: [entry(index, "subject"), entry(index, "same-uuid"), ...Array.from({ length: 12 }, (_, i) => entry(2, `filler:${i}`))] };
  state = changed(forms(state, 0, sequence));
  if (stacked) state = reward(state, { kind: "composite", children: [
    { kind: "reduce_deck_entry_energy_cost", ...target(state), amount: 2 },
    { kind: "add_deck_entry_spark_bonus", ...target(state), amount: 1 },
    { kind: "change_deck_entry_keywords", ...target(state), keywords: { fast: true, setReclaim: 1 } },
  ] });
  return state;
}
function init(state: JourneyState, side: Side, options: { prepared?: boolean; subjectZone?: "hand" | "deck" | "void" | "play"; observer?: boolean; extras?: readonly number[]; energy?: number } = {}): BattleInit {
  const mapped = createEngineBattleInit({ seed: 635, scoreToWin: 1000, startingSide: side, journey: state,
    enemy: { deck: [target(state).cardUuid, ...Array.from({ length: 12 }, () => filler.id)], avatar: null, dreamsigns: [] },
    cardDatabase: content.cardDatabase, transfigurationData: content.transfigurationData, minimumDeckSize: 1, dreamwell: [] });
  expect(mapped.decks.player[0]).toEqual({ ...engineDeckEntry(state.deck[0], cards.find(card => card.cardNumber === state.deck[0].cardNumber)!, content.transfigurationData),
    ...(state.typeRemap === undefined ? {} : { typeRemap: state.typeRemap }) });
  const deck = [...mapped.decks.player, ...(options.observer ? [{ cardId: observer.id }] : []), ...(options.extras ?? []).map(index => ({ cardId: definitions[index].id }))];
  // The actual journey bridge addresses player; seat its complete mapped deck on either public engine actor.
  const seated = { ...mapped, decks: side === "player" ? { player: deck, enemy: mapped.decks.enemy } : { player: mapped.decks.enemy, enemy: deck } };
  if (options.prepared === false) return seated;
  const zone = options.subjectZone ?? "hand", energy = options.energy ?? 40;
  const placements: BattlePlacement[] = [
    ...(zone === "deck" ? [] : zone === "play" ? [{ side, deckIndex: 0, zone: "play" as const, slot: { rank: "back" as const, index: 0 } }] : [{ side, deckIndex: 0, zone }]),
    { side, deckIndex: 1, zone: "hand" }, { side, deckIndex: 2, zone: "hand" },
    { side: opponent(side), deckIndex: 0, zone: "hand" },
    ...(options.observer ? [{ side, deckIndex: state.deck.length, zone: "play" as const, slot: { rank: "back" as const, index: 1 } }] : []),
    ...(options.extras ?? []).map((_, index) => ({ side, deckIndex: state.deck.length + (options.observer ? 1 : 0) + index, zone: "hand" as const })),
  ];
  return { ...seated, setup: { placements, sides: { player: { currentEnergy: energy, maxEnergy: energy, score: 0 }, enemy: { currentEnergy: energy, maxEnergy: energy, score: 0 } },
    turn: { active: side, phase: "day", round: 1, turnNumber: 1, lastNormal: side, sideTurns: { player: side === "player" ? 1 : 0, enemy: side === "enemy" ? 1 : 0 } },
    dreamwell: { deck: [], next: 0 } } };
}
const start = (source: JourneyState, side: Side, options: Parameters<typeof init>[2] = {}) => engine.createBattle(init(source, side, options), NO_PROMPTS).state;
function subject(state: BattleState, side: Side, zone: "hand" | "play" | "deck" = state.sides[side].backRank[0] === null ? "hand" : "play"): InstanceId {
  const id = zone === "play" ? state.sides[side].backRank[0]! : state.sides[side][zone][0];
  expect(state.instances[id]).toMatchObject({ owner: side, controller: side, variant: { deckMods: { typeChange: { subtype: mage } } } });
  return id;
}
const view = (state: BattleState, side: Side, id: InstanceId) => engine.view(state, side).instances[id].characteristics;
const play = (state: BattleState, side: Side, id: InstanceId, from: "hand" | "void" = "hand") => engine.apply(state, side, { kind: "play", card: id, from }, NO_PROMPTS).state;
const activate = (state: BattleState, side: Side, source: InstanceId, ability: number, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) =>
  engine.apply(state, side, { kind: "activate", source, ability }, new ScriptedSource(answers)).state;
function applied(outcome: IntentOutcome) {
  expect(outcome.kind).toBe("applied");
  if (outcome.kind !== "applied") throw new Error("Synthetic subtype intent bounced");
  expect(outcome.error).toBeNull(); return outcome.slice;
}
const rows = [
  ...([null, "Amplified", "Empowered", "Kindled", "Resonant", "Attuned", "Perfected"] as const).map(form => ({ index: 0, form })),
  ...([null, "Amplified", "Empowered", "Inspired", "Enduring", "Hastened", "Perfected"] as const).map(form => ({ index: 1, form })),
];

for (const side of SIDES) describe(`${side} synthetic persistent subtype`, () => {
  it("carries the reward and complete journey history through ordinary engine start to exactly one physical copy", () => {
    const source = journey(0, ["Amplified"]), before = copy(source), immutable = printed();
    const input = init(source, side, { prepared: false }), inputBefore = copy(input), state = engine.createBattle(input, NO_PROMPTS).state;
    const matching = Object.values(state.instances).filter(card => card.variant.deckMods?.typeChange?.subtype === mage);
    expect(matching).toHaveLength(1); const id = matching[0].id; expect(matching[0]).toMatchObject({ owner: side, controller: side, printing: { cardId: character.id } });
    const sentinels = Object.values(state.instances).filter(card => card.id !== id && card.printing.kind === "card" && card.printing.cardId === character.id);
    expect(sentinels.some(card => card.owner === side)).toBe(true); expect(sentinels.some(card => card.owner === opponent(side))).toBe(true);
    for (const card of sentinels) expect(instanceCard(catalog, card).subtype).toBe(warrior);
    expect(instanceCard(catalog, state.instances[id])).toMatchObject({ cardType: "character", subtype: mage });
    const again = changed(source); expect(again).toEqual(source);
    const replaced = changed(source, 0, warrior); expect(replaced.deck[0]).toEqual({ ...source.deck[0], typeChange: { ...source.deck[0].typeChange!, subtype: warrior } });
    expect(source).toEqual(before); expect(input).toEqual(inputBefore); expect(printed()).toBe(immutable);
  });

  for (const stacked of [false, true]) it.each(rows)(`applies $form before subtype on printing $index with companion mods ${stacked}`, ({ index, form }) => {
    const source = journey(index, form === null ? [] : [form], stacked), before = copy(source), immutable = printed();
    const state = start(source, side), id = subject(state, side), sentinel = state.sides[side].hand[1];
    const cost = (form === "Empowered" || form === "Perfected" ? 3 : 7) - (stacked ? 2 : 0), stronger = form === "Amplified" || form === "Perfected";
    const done = play(state, side, id), points = stronger ? 5 : 2;
    expect(done.sides[side].currentEnergy).toBe(40 - cost); expect(done.sides[side].score).toBe(points);
    expect(done.sides[opponent(side)].currentEnergy).toBe(40); expect(done.instances[id].zone).toBe("play");
    for (const viewer of SIDES) expect(view(done, viewer, id)).toMatchObject({ cardType: "character", subtype: mage, allTypes: false,
      spark: index === 1 ? 0 : (form === "Kindled" || form === "Perfected" ? 6 : 3) + (stacked ? 1 : 0) });
    expect(done.turnLog.played[side][0]).toMatchObject({ instance: id, cardType: "character", subtype: mage, allTypes: false });
    expect(done.instances[sentinel].variant.deckMods).toBeUndefined(); expect(view(done, side, sentinel).subtype).toBe(index === 0 ? warrior : untyped);
    const draws = index === 1 && (form === "Inspired" || form === "Perfected") ? 1 : 0;
    expect(done.sides[side].hand.length).toBe(state.sides[side].hand.length - 1 + draws);
    const paid = activate(done, side, id, 1);
    expect(paid.sides[side].currentEnergy).toBe(40 - cost - (form === "Attuned" || form === "Perfected" ? 2 : 3));
    expect(paid.sides[side].score).toBe(points + 1);
    const gone = activate(paid, side, id, 3);
    expect(gone.sides[side].score).toBe(points + 1 + (index === 0 && (form === "Resonant" || form === "Perfected") ? points : 0));
    expect(view(gone, side, id).subtype).toBe(mage);
    if (stacked || index === 1 && (form === "Enduring" || form === "Perfected")) {
      const price = stacked ? 1 : cost, replay = play(gone, side, id, "void");
      expect(replay.sides[side].currentEnergy).toBe(gone.sides[side].currentEnergy - price); expect(view(replay, side, id).subtype).toBe(mage);
    }
    if (form === "Hastened") {
      const night = passUntil(engine, state, next => next.turn.phase === "night").state;
      expect(engine.legalActions(night, side).some(action => action.kind === "play" && action.card === id)).toBe(true);
      expect(play(night, side, id).turnLog.played[side][0].speed).toBe("fast");
    }
    expect(source).toEqual(before); expect(printed()).toBe(immutable);
  });

  it("uses current subtype for targets, negative selectors, typal triggers, spark bonuses, deck and void filters", () => {
    const state = start(journey(), side, { observer: true }), id = subject(state, side), sentinel = state.sides[side].hand[1], watcher = state.sides[side].backRank[1]!;
    const before = copy(state); expect(() => play(state, opponent(side), id)).toThrow(); expect(() => play(state, side, id, "void")).toThrow(); expect(state).toEqual(before);
    const done = play(state, side, id); expect(done.sides[side].score).toBe(10); expect(done.sides[opponent(side)].score).toBe(0);
    expect(view(done, side, id).spark).toBe(5); expect(done.turnLog.played[side][0].subtype).toBe(mage);
    const withSentinel = play(done, side, sentinel); expect(withSentinel.sides[side].score).toBe(12); expect(view(withSentinel, side, sentinel).spark).toBe(3);
    for (const ability of [3, 4]) {
      const fold = createFoldAdapter(engine), input = init(journey(), side, { observer: true, subjectZone: "play", extras: [7] });
      if (input.setup === undefined) throw new Error("Missing declared subtype targets");
      const prepared = { ...input, setup: { ...input.setup, placements: input.setup.placements.map((placement): BattlePlacement =>
        placement.deckIndex === 1 && placement.side === side ? { side, deckIndex: 1, zone: "play", slot: { rank: "back", index: 3 } } :
          placement.deckIndex === input.decks[side].length - 1 && placement.side === side ? { ...placement, zone: "play", slot: { rank: "back", index: 2 } } : placement) } };
      const slice = applied(fold.start(prepared));
      const source = slice.committed.sides[side].backRank[1]!, held = subject(slice.committed, side);
      const pending = applied(fold.reduce(slice, { kind: "battleAction", side, action: { kind: "activate", source, ability } })), prompt = fold.pending(pending)?.prompt;
      if (prompt?.kind !== "chooseTargets") throw new Error("Missing subtype target prompt");
      expect(prompt.candidates).toContain(held); expect(prompt.candidates).not.toContain(slice.committed.sides[side].backRank[3]);
      expect(fold.reduce(pending, { kind: "answer", side, promptId: prompt.id, value: [slice.committed.sides[opponent(side)].hand[0]] }).kind).toBe("bounced");
      const selected = applied(fold.reduce(pending, { kind: "answer", side, promptId: prompt.id, value: [held] }));
      expect(view(selected.committed, side, held).spark).toBe(ability === 3 ? 7 : 9);
    }
    const gone = activate(withSentinel, side, id, 3), returned = activate(gone, side, watcher, 6, [[id]]);
    expect(returned.instances[id].zone).toBe("hand"); expect(view(returned, side, id).subtype).toBe(mage);
    const deck = start(journey(), side, { observer: true, subjectZone: "deck" }), drawnId = subject(deck, side, "deck"), draw = activate(deck, side, deck.sides[side].backRank[1]!, 5);
    expect(draw.sides[side].hand).toEqual([...deck.sides[side].hand, drawnId]); expect(draw.sides[side].deck).toEqual(deck.sides[side].deck.filter(card => card !== drawnId));
  });

  it("orders permanent layer1 subtype before layer2 all-types and later chosen-type effects", () => {
    let state = start(journey(4), side, { subjectZone: "play", observer: true }); const id = subject(state, side), watcher = state.sides[side].backRank[1]!;
    expect(view(state, side, id)).toMatchObject({ subtype: mage, allTypes: true, spark: 5 });
    const before = view(state, side, id).spark!;
    state = activate(state, side, watcher, 7, [[id]]); expect(view(state, side, id).spark).toBe(before + 8);
    const negative = engine.legalActions(state, side).some(action => action.kind === "activate" && action.source === watcher && action.ability === 4);
    expect(negative).toBe(false);
    state = activate(state, side, id, 1, [catalog.characterTypes.indexOf(warrior)]);
    expect(view(state, side, id)).toMatchObject({ subtype: warrior, allTypes: false }); expect(state.instances[id].variant.deckMods?.typeChange?.subtype).toBe(mage);
    state = activate(state, side, id, 2); expect(view(state, side, id)).toMatchObject({ subtype: warrior, allTypes: true });
    const returned = activate(state, side, id, 3); expect(view(returned, side, id)).toMatchObject({ subtype: mage, allTypes: false });
  });

  it("preserves literal ability references and copiable subtype while independently remapping only ability references", () => {
    const source = journey(5), state = start(source, side, { subjectZone: "play" }), id = subject(state, side), sentinel = state.sides[side].hand[0];
    const plain = play(state, side, sentinel), boosted = activate(plain, side, id, 0);
    expect(view(boosted, side, id).spark).toBe(3); expect(view(boosted, side, sentinel).spark).toBe(4);
    const copied = activate(boosted, side, id, 1), figment = Object.values(copied.instances).find(card => card.printing.kind === "figmentCopy")!;
    expect(figment.id).not.toBe(id); expect(view(copied, side, figment.id)).toMatchObject({ subtype: mage, spark: 3 });
    const hand = activate(copied, side, id, 2), newId = hand.sides[side].hand.find(card => !copied.sides[side].hand.includes(card))!;
    expect(hand.instances[newId].variant).toEqual(hand.instances[id].variant); expect(view(hand, side, newId).subtype).toBe(mage);
    const remapped = start({ ...source, typeRemap: mage }, side, { subjectZone: "play" }), remappedId = subject(remapped, side), remappedSentinel = remapped.sides[side].hand[0];
    const withPlain = play(remapped, side, remappedSentinel), changedAbility = activate(withPlain, side, remappedId, 0);
    expect(view(changedAbility, side, remappedId).spark).toBe(4); expect(view(changedAbility, side, remappedSentinel).spark).toBe(3);
  });

  it("keeps chronological replacements, repeated forms and Perfected snapshots through the journey bridge", () => {
    for (const [sequence, draws] of [[["Inspired", "Amplified"], 0], [["Amplified", "Inspired"], 1]] as const) {
      const source = journey(1, sequence), input = init(source, side), before = copy(input), state = engine.createBattle(input, NO_PROMPTS).state, id = subject(state, side), done = play(state, side, id);
      expect(done.sides[side].hand.length).toBe(state.sides[side].hand.length - 1 + draws); expect(done.sides[side].score).toBe(5); expect(view(done, side, id).subtype).toBe(mage);
      expect(input).toEqual(before); expect(source.deck[0].transfiguration).toBe(sequence[0]);
    }
    const repeated = journey(0, ["Kindled", "Empowered", "Kindled"], true), state = start(repeated, side), id = subject(state, side), done = play(state, side, id);
    expect(done.sides[side].currentEnergy).toBe(39); expect(view(done, side, id)).toMatchObject({ subtype: mage, spark: 13 });
    const perfect = journey(1, ["Perfected", "Inspired"]), initial = start(perfect, side), held = subject(initial, side), resolved = play(initial, side, held);
    expect(resolved.sides[side].hand.length).toBe(initial.sides[side].hand.length + 1); expect(resolved.sides[side].score).toBe(5);
    expect(view(resolved, side, held).subtype).toBe(mage);
  });

  it("retains physical subtype through return, replay, turns, clone, saved reload and another journey battle", () => {
    const source = journey(0, ["Kindled", "Empowered"], true), input = init(source, side), state = engine.createBattle(input, NO_PROMPTS).state, id = subject(state, side), first = play(state, side, id);
    const hashes = [first, cloneState(first), deserializeState(serializeState(first))].map(saved => {
      const returned = activate(saved, side, id, 2), again = play(returned, side, id);
      const later = passUntil(engine, again, next => next.turn.active === opponent(side) && next.turn.phase === "day").state;
      expect(view(later, side, id)).toMatchObject({ subtype: mage, spark: 7 }); expect(later.sides[side].currentEnergy).toBe(38); return stateHash(later);
    });
    expect(hashes[1]).toBe(hashes[0]); expect(hashes[2]).toBe(hashes[0]);
    expect(stateHash(createEngine(catalog).createBattle(copy(input), NO_PROMPTS).state)).toBe(stateHash(state));
    const plain = engine.createBattle(init(changed(source, 0, warrior), side), NO_PROMPTS).state;
    expect(stateHash(plain)).not.toBe(stateHash(state)); expect(source.deck[0].typeChange?.subtype).toBe(mage);
  });

  it("cancels a real subtype-filtered payment, reloads once, and refuses stale, foreign, competing and duplicate inputs", () => {
    const source = changed(journey(6), 1), fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const base = applied(fold.start(init(source, side, { extras: [7] }))), before = copy(base), id = base.committed.sides[side].hand[0], discard = base.committed.sides[side].hand[1];
    const intent = { kind: "battleAction", side, action: { kind: "play", card: id, from: "hand" } } as const;
    const pending = applied(fold.reduce(base, intent)), prompt = fold.pending(pending)?.prompt;
    if (prompt === undefined) throw new Error("Missing optional subtype payment prompt");
    expect(prompt.kind).toBe("confirm"); expect(prompt.cancellable).toBe(true); expect(pending.committed).toEqual(base.committed);
    expect(fold.reduce(pending, intent)).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(base, { ...intent, side: opponent(side) }).kind).toBe("bounced");
    const cancelled = applied(fold.reduce(pending, { kind: "cancel", side, promptId: prompt.id }));
    expect(cancelled.committed.sides).toEqual(base.committed.sides); expect(cancelled.committed.instances).toEqual(base.committed.instances);
    const cold = createFoldAdapter(createEngine(catalog)), retry = applied(cold.reduce(copy(cancelled), intent)), current = cold.pending(retry)?.prompt;
    if (current === undefined) throw new Error("Missing retry subtype payment prompt");
    expect(current.id).not.toBe(prompt.id);
    expect(cold.reduce(retry, { kind: "answer", side, promptId: prompt.id, value: true })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(cold.reduce(retry, { kind: "answer", side: opponent(side), promptId: current.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const selected = applied(cold.reduce(retry, { kind: "answer", side, promptId: current.id, value: true })), paymentPrompt = cold.pending(selected)?.prompt;
    if (paymentPrompt?.kind !== "chooseCards") throw new Error("Missing subtype-filtered discard prompt");
    expect(paymentPrompt.candidates).toContain(discard); expect(paymentPrompt.candidates).not.toContain(selected.committed.sides[side].hand[2]);
    expect(cold.reduce(selected, { kind: "answer", side, promptId: paymentPrompt.id, value: [id] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const answer = { kind: "answer", side, promptId: paymentPrompt.id, value: [discard] } as const, saved = copy(selected);
    const done = applied(cold.reduce(saved, answer)), replayed = applied(createFoldAdapter(createEngine(catalog)).reduce(copy(selected), answer));
    expect(stateHash(done.committed)).toBe(stateHash(replayed.committed)); expect(done.committed.sides[side].currentEnergy).toBe(37);
    expect(done.committed.sides[side].score).toBe(2); expect(done.committed.instances[discard].zone).toBe("void");
    expect(done.committed.turnLog.played[side]).toHaveLength(1); expect(done.committed.turnLog.played[side][0].subtype).toBe(mage);
    expect(cold.reduce(done, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    if (selected.inFlight === null) throw new Error("Missing saved subtype payment");
    const damaged = { ...copy(selected), inFlight: { ...selected.inFlight, answers: selected.inFlight.answers.map((record, index) => index === 0 ? { ...record, value: [] } : record) } };
    const recovery = createFoldAdapter(createEngine(catalog)); expect(recovery.pending(damaged)).toBeNull();
    const recovered = recovery.reduce(damaged, intent); expect(recovered.kind).toBe("applied");
    if (recovered.kind !== "applied") throw new Error("Subtype payment did not recover");
    expect(recovered.error?.kind).toBe("engine_error"); expect(recovered.slice.inFlight).toBeNull(); expect(recovered.slice.committed).toEqual(selected.committed);
    expect(base).toEqual(before); expect(selected).toEqual(saved);
  });
});

function offer(all: boolean) {
  const site: SiteState = { id: parseSiteId("subtype-exploration"), type: "Exploration", isEnhanced: false, isVisited: false };
  const action = { id: testExplorationActionId("subtype-action"), label: "", ...(all ? { effectKind: "change-subtype-all" as const, subtypeOptions: [mage] } :
    { effectKind: "change-subtype-selected" as const, subtype: mage, deckTarget: "chosen" as const }) };
  const local = { ...content, exploration: { ...content.exploration, encounters: [{ cardId: payment.id, prose: "", actions: [action] }] } };
  let state: JourneyState = { ...testJourneyState("subtype-offer"), avatar: null, dreamsigns: [], battleModifiers: [],
    deck: [entry(0, "chosen"), entry(0, "same-uuid"), entry(1, "event-to-character"), entry(0, "character-to-event"), entry(1, "event"), entry(7, "same-name-other-uuid")] };
  state = forms(state, 0, ["Kindled", "Empowered"]); state = changed(state, 2, warrior); state = changed(state, 3, untyped, "Event");
  const runtime = buildExplorationRuntime(state, site, local, () => 0, payment.id);
  if (runtime === null) throw new Error("Synthetic subtype offer refused");
  return { journey: { ...state, siteRuntime: { ...state.siteRuntime, [site.id]: runtime } }, site, seq: 1, content: local,
    payload: { actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION, selection: all ? { subtype: mage } : { entryIds: [state.deck[0].entryId] } } };
}
describe("synthetic persistent subtype transactions", () => {
  for (const all of [false, true]) it(`resolves actual ${all ? "all" : "selected"} subtype offers by current card type and physical entry`, () => {
    const request = offer(all), before = copy(request.journey), immutable = printed(), next = resolveExplorationChoice(request);
    if (next === null) throw new Error("Valid synthetic subtype choice refused");
    const affected = all ? [0, 1, 2, 5] : [0];
    for (let index = 0; index < next.deck.length; index++) {
      if (!affected.includes(index)) { expect(next.deck[index]).toEqual(before.deck[index]); continue; }
      const { typeChange: _beforeType, ...beforeEntry } = before.deck[index], { typeChange: afterType, ...afterEntry } = next.deck[index];
      expect(afterEntry).toEqual(beforeEntry); expect(afterType).toMatchObject({
        predicateId: parseCardTypeChangePredicateId("exploration:subtype:mage"), cardType: "Character", subtype: mage,
      });
    }
    const resolution = next.siteRuntime[request.site.id];
    expect(resolution?.kind).toBe("exploration");
    if (resolution?.kind !== "exploration") throw new Error("Missing subtype resolution");
    expect(resolution.resolution?.affectedEntryIds).toEqual(affected.map(index => next.deck[index].entryId)); expect(resolution.resolution?.chosenSubtype).toBe(mage);
    for (const side of SIDES) {
      const state = start(next, side, { prepared: false });
      const changedCards = Object.values(state.instances).filter(card => card.owner === side && card.variant.deckMods?.typeChange?.subtype === mage);
      expect(changedCards).toHaveLength(affected.length); for (const card of changedCards) expect(instanceCard(catalog, card).subtype).toBe(mage);
    }
    expect(resolveExplorationChoice({ ...request, journey: copy(request.journey), payload: copy(request.payload) })).toEqual(next);
    expect(resolveExplorationChoice({ ...request, journey: next })).toBeNull(); expect(request.journey).toEqual(before); expect(printed()).toBe(immutable);
  });

  it("refuses stale, malformed and ineligible selections without changing a journey or a concrete reward prefix", () => {
    for (const all of [false, true]) {
      const request = offer(all), before = copy(request.journey);
      const selections = all ? [{ subtype: warrior }, {}] : [{ entryIds: [] }, { entryIds: [request.journey.deck[0].entryId, request.journey.deck[0].entryId] },
        { entryIds: [request.journey.deck[4].entryId] }, { entryIds: [request.journey.deck[5].entryId] }, { entryIds: [parseDeckEntryId("foreign-subtype-entry")] }];
      for (const patch of [{ actionId: testExplorationActionId("foreign-subtype-action") }, { selectionRulesVersion: "stale" },
        { expectedEncounterCardId: character.id }, { expectedRerollCount: 1 }, ...selections.map(selection => ({ selection }))]) {
        expect(resolveExplorationChoice({ ...request, payload: { ...request.payload, ...patch } })).toBeNull(); expect(request.journey).toEqual(before);
      }
    }
    const state = journey(), before = copy(state), valid = { kind: "change_deck_entry_type", ...target(state), typeChange: state.deck[0].typeChange! } as const;
    for (const patch of [{ entryId: parseDeckEntryId("missing-subtype-entry") }, { cardUuid: eventCard.id }, { cardNumber: cards[1].cardNumber }]) {
      const invalid = { ...valid, ...patch };
      expect(applyJourneyRewardEffect({ state, journeyContent: content, effect: invalid })).toBeNull();
      expect(applyJourneyRewardEffect({ state, journeyContent: content, effect: { kind: "composite", children: [valid, invalid] } })).toBeNull(); expect(state).toEqual(before);
    }
    const entry = state.deck[0], malformed = { ...entry, transfiguration: "Kindled" as const, transfigurationApplications: [{ form: "Empowered" as const }] };
    expect(() => engineDeckEntry(malformed, cards[0], content.transfigurationData)).toThrow();
    const input = init(journey(0, ["Kindled"]), "player"), bad = { ...input, decks: { ...input.decks, player: input.decks.player.map((entry, index) => index === 0 ? { ...entry, transfigurations: ["Kindled" as const] } : entry) } };
    expect(() => engine.createBattle(bad, NO_PROMPTS)).toThrow(); expect(state).toEqual(before);
  });
});
