/** Synthetic preparation only. Original hv-umm2.283 retains its58 UUIDs and full real-card sweep/judgment acceptance. */
import { describe, expect, it } from "vitest";
import { createCatalog, type EngineCardDefinition } from "../../../engine/catalog";
import * as b from "../../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../../engine/dsl/triggers";
import { BASE_VARIANT, type Variant } from "../../../engine/dsl/types";
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
import { appendEngineTransfiguration } from "../../../engine/transfigurations";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../../journey_v2/testing/fixtures";
import { applyJourneyRewardEffect, type JourneyRewardEffect } from "../../../rules/journey/reward-effects";
import { SELECTION_RULES_VERSION } from "../../../reward-selection";
import { buildExplorationRuntime, resolveExplorationChoice } from "../../../session/providers/exploration-provider";
import { testJourneyState } from "../../../testing/journey-genesis";
import { resonantChange, transfigurationSourceState } from "../../../transfiguration/transfiguration-logic";
import { parseCardSubtype } from "../../../types/card-identity";
import { parseCardTypeChangePredicateId, parseDeckEntryId, parseSiteId } from "../../../types/identifiers";
import type { CardKeywordModification, DeckEntry, JourneyState, SiteState } from "../../../types/journey";
import { testExplorationActionId } from "../../../types/test-identities";
import { createEngineBattleInit, engineDeckEntry } from "../engine-battle-init";

const warrior = parseCardSubtype("Warrior"), mage = parseCardSubtype("Mage"), untyped = parseCardSubtype("");
function definition(index: number, character: boolean, printedReclaim: boolean): EngineCardDefinition {
  const text = character ? "▸Materialized: Gain 2⍟.\n\n3●: Gain 1⍟." : "Gain 2⍟.";
  const authored = text.replace("Gain 2", "Gain 5");
  return { id: syntheticId(0x63400 + index), cardType: character ? "character" : "event", costs: [b.energy(7)],
    spark: character ? 3 : null, subtype: character ? warrior : untyped, speed: "standard", status: "authored",
    transfiguration: { amplified: true, resonant: { base: resonantChange(text), amplified: resonantChange(authored) } },
    transfigurationState: (initial, steps) => transfigurationSourceState(text, authored, initial, steps),
    abilities: variant => [character ? triggered(onMaterialized(), p.gainPoints(variant.amplified ? 5 : 2)) : b.event(p.gainPoints(variant.amplified ? 5 : 2)),
      ...(printedReclaim ? [b.reclaim(b.energy(variant.amplified ? 8 : 9), b.pointsCost(2))] : []),
      ...(character ? [b.activated([b.energy(3)], p.gainPoints(1)), b.activated([], p.returnToHand(b.self())), b.activated([], p.dissolve(b.self()))] : [])],
  };
}
const character = definition(0, true, true), bareCharacter = definition(1, true, false);
const eventCard = definition(2, false, true), bareEvent = definition(3, false, false);
const payment = { ...eventCard, id: syntheticId(0x63404), abilities: (variant: Variant) => [
  ...eventCard.abilities(variant), b.additionalCost(b.energy(2), b.discardCost()),
] };
const optionalPayment = { ...eventCard, id: syntheticId(0x63405), abilities: (variant: Variant) => [
  ...eventCard.abilities(variant), b.additionalCost(b.energy(2), b.optionalCost(b.energy(1)), b.discardCost()),
] };
const variable = { ...bareEvent, id: syntheticId(0x63406), costs: [b.energyX()] };
const filler = { ...bareCharacter, id: syntheticId(0x63407), costs: [], status: "vanilla" as const, abilities: () => [] };
const runtimeGrant = { ...bareEvent, id: syntheticId(0x63408), costs: [], abilities: () => [b.event(p.sequence(
  p.grantReclaim(b.everyIn("void"), { costs: [b.energy(6)] }),
  p.grantReclaim(b.everyIn("void"), { costs: [b.energy(4)] }), p.grantReclaim(b.everyIn("void")),
))] };
const covering = { ...filler, id: syntheticId(0x63409), status: "authored" as const, abilities: () => [
  b.staticAbility(p.reclaimNotBanished()), b.activated([], p.returnToHand(b.self())),
] };
const adjustment = { ...filler, id: syntheticId(0x6340a), status: "authored" as const, abilities: () => [
  b.staticAbility(p.costModifier("you", {}, 2)), b.staticAbility(p.costModifier("you", {}, -1)),
] };
const definitions = [character, bareCharacter, eventCard, bareEvent, payment, optionalPayment, variable, filler, runtimeGrant, covering, adjustment];
const catalog = createCatalog(definitions, []), engine = createEngine(catalog);
const cards = definitions.map((card, index) => makeAuguryTestCard({ id: card.id, cardNumber: 63400 + index,
  cardType: card.cardType === "character" ? "Character" : "Event", subtype: card.subtype,
  energyCost: index === 6 ? null : index >= 7 ? 0 : 7, spark: typeof card.spark === "number" ? card.spark : null,
}));
const content = makeAuguryTestContent({ cards });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const printed = () => JSON.stringify(definitions.map(card => ({ ...card,
  base: card.abilities(BASE_VARIANT), amplified: card.abilities({ amplified: true }),
})));
function entry(index: number, suffix: string, form: DeckEntry["transfiguration"] = null): DeckEntry {
  return { entryId: parseDeckEntryId(`reclaim:${index}:${suffix}`), cardNumber: cards[index].cardNumber, transfiguration: form, isBane: false };
}
function target(state: JourneyState, index = 0) {
  const subject = state.deck[index], card = content.cardDatabase.get(subject.cardNumber);
  if (card === undefined) throw new Error("Missing synthetic Reclaim printing");
  return { entryId: subject.entryId, cardUuid: card.id, cardNumber: card.cardNumber };
}
function reward(state: JourneyState, effect: JourneyRewardEffect): JourneyState {
  const before = copy(state), result = applyJourneyRewardEffect({ state, journeyContent: content, effect });
  expect(state).toEqual(before);
  if (result === null) throw new Error("Synthetic Reclaim reward refused");
  return result;
}
const keywords = (state: JourneyState, value: CardKeywordModification) => reward(state,
  { kind: "change_deck_entry_keywords", ...target(state), keywords: value });
function journey(index = 0, form: DeckEntry["transfiguration"] = null, stacked = false, mods: CardKeywordModification = { reclaim: 3 }, extras: number[] = []): JourneyState {
  let state: JourneyState = { ...testJourneyState("reclaim-contract"), avatar: null, dreamsigns: [], battleModifiers: [],
    deck: [entry(index, "subject", form), entry(index, "sentinel"), ...Array.from({ length: 12 }, (_, i) => entry(7, `filler:${i}`)),
      ...extras.map((extra, i) => entry(extra, `extra:${i}`))] };
  state = keywords(state, mods);
  if (stacked) state = reward(state, { kind: "composite", children: [
    { kind: "reduce_deck_entry_energy_cost", ...target(state), amount: 2 },
    { kind: "change_deck_entry_keywords", ...target(state), keywords: { fast: true } },
    { kind: "add_deck_entry_spark_bonus", ...target(state), amount: 1 },
    { kind: "change_deck_entry_type", ...target(state), typeChange: { predicateId: parseCardTypeChangePredicateId("reclaim-subtype"),
      label: "", cardType: definitions[index].cardType === "character" ? "Character" : "Event", subtype: mage } },
  ] });
  return state;
}
function init(state: JourneyState, side: Side, options: { zone?: "hand" | "void"; energy?: number; prepared?: boolean; ordered?: Variant; cover?: boolean; handPayments?: boolean } = {}): BattleInit {
  const energy = options.energy ?? 40;
  const mapped = createEngineBattleInit({ seed: 634, scoreToWin: 1000, startingSide: side, journey: state,
    enemy: { deck: [target(state).cardUuid, ...Array.from({ length: 12 }, () => filler.id)], avatar: null, dreamsigns: [] },
    cardDatabase: content.cardDatabase, transfigurationData: content.transfigurationData, minimumDeckSize: 1, dreamwell: [] });
  expect(mapped.decks.player[0]).toEqual(engineDeckEntry(state.deck[0], content.cardDatabase.get(state.deck[0].cardNumber)!, content.transfigurationData));
  const deck = [...mapped.decks.player];
  if (options.ordered !== undefined) deck[0] = { cardId: deck[0].cardId, ...options.ordered, deckMods: deck[0].deckMods };
  // The production bridge maps the journey player. This fixture seats its complete mapped deck on either public engine actor.
  const seated = { ...mapped, decks: side === "player" ? { player: deck, enemy: mapped.decks.enemy } : { player: mapped.decks.enemy, enemy: deck } };
  if (options.prepared === false) return seated;
  return { ...seated, setup: { placements: [
    { side, deckIndex: 0, zone: options.zone ?? "hand" },
    ...(options.handPayments === false ? [] : [1, 2, 3].map(deckIndex => ({ side, deckIndex, zone: "hand" as const }))),
    { side: opponent(side), deckIndex: 0, zone: "hand" },
    ...state.deck.flatMap((subject, deckIndex): BattlePlacement[] => deckIndex < 14 ? [] : (subject.cardNumber === cards[9].cardNumber && options.cover) || subject.cardNumber === cards[10].cardNumber
      ? [{ side, deckIndex, zone: "play" as const, slot: { rank: "back" as const, index: 0 } }]
      : [{ side, deckIndex, zone: "hand" as const }]),
  ], sides: { player: { currentEnergy: energy, maxEnergy: energy, score: 10 }, enemy: { currentEnergy: energy, maxEnergy: energy, score: 10 } },
  turn: { active: side, phase: "day", round: 1, turnNumber: 1, lastNormal: side,
    sideTurns: { player: side === "player" ? 1 : 0, enemy: side === "enemy" ? 1 : 0 } }, dreamwell: { deck: [], next: 0 } } };
}
const start = (source: JourneyState, side: Side, options: Parameters<typeof init>[2] = {}) => engine.createBattle(init(source, side, options), NO_PROMPTS).state;
const subject = (state: BattleState, side: Side) => Object.values(state.instances).find(card => card.owner === side && card.variant.deckMods?.reclaim !== undefined && card.variant.deckMods.reclaim !== null)!.id;
const canPlay = (state: BattleState, side: Side, id: InstanceId, from: "hand" | "void") => engine.legalActions(state, side).some(action => action.kind === "play" && action.card === id && action.from === from);
const play = (state: BattleState, side: Side, id: InstanceId, from: "hand" | "void" = "hand", answers: ConstructorParameters<typeof ScriptedSource>[0] = []) =>
  engine.apply(state, side, { kind: "play", card: id, from }, new ScriptedSource(answers)).state;
const activate = (state: BattleState, side: Side, source: InstanceId, ability: number) => engine.apply(state, side, { kind: "activate", source, ability }, NO_PROMPTS).state;
const quote = (state: BattleState, side: Side, id: InstanceId) => engine.view(state, side).instances[id].characteristics.reclaimCost;
function applied(outcome: IntentOutcome) {
  expect(outcome.kind).toBe("applied");
  if (outcome.kind !== "applied") throw new Error("Synthetic Reclaim intent bounced");
  expect(outcome.error).toBeNull();
  return outcome.slice;
}
const forms = [
  ...([null, "Amplified", "Empowered", "Kindled", "Resonant", "Attuned", "Perfected"] as const).map(form => ({ index: 0, form })),
  ...([null, "Amplified", "Empowered", "Inspired", "Enduring", "Hastened", "Perfected"] as const).map(form => ({ index: 2, form })),
];

for (const side of SIDES) describe(`${side} synthetic persistent Reclaim`, () => {
  it("accumulates journey grants while explicit sets including zero retain priority over grants and printed costs", () => {
    const original = journey(0, null, false, { reclaim: 2 }), immutable = printed(), before = copy(original);
    const accumulated = keywords(original, { reclaim: 3 });
    expect(accumulated.deck[0].keywordModification).toEqual({ reclaim: 5 });
    const set = keywords(accumulated, { setReclaim: 1 });
    expect(set.deck[0].keywordModification).toEqual({ setReclaim: 1 });
    const later = keywords(set, { reclaim: 4 });
    expect(later.deck[0].keywordModification).toEqual({ setReclaim: 1, reclaim: 4 });
    const zero = keywords(later, { setReclaim: 0 });
    expect(zero.deck[0].keywordModification).toEqual({ setReclaim: 0 });
    for (const [source, cost] of [[accumulated, 5], [later, 1], [keywords(zero, { reclaim: 8 }), 0]] as const) {
      const state = start(source, side, { zone: "void", energy: cost }), id = subject(state, side);
      expect(quote(state, side, id)).toBe(cost); expect(canPlay(state, side, id, "void")).toBe(true);
      const done = play(state, side, id, "void");
      expect(done.sides[side].currentEnergy).toBe(0); expect(done.sides[side].score).toBe(12);
      expect(done.instances[id].status).toMatchObject({ reclaimed: true, playedViaReclaim: true });
      const hand = start(source, side, { energy: 7 }), held = subject(hand, side);
      expect(play(hand, side, held).sides[side].currentEnergy).toBe(0);
    }
    expect(original).toEqual(before); expect(printed()).toBe(immutable);
  });

  it.each([1, 3])("grants Reclaim to a definition without one, card index %i", index => {
    const state = start(journey(index), side, { zone: "void", energy: 3 }), id = subject(state, side);
    expect(quote(state, side, id)).toBe(3);
    const done = play(state, side, id, "void");
    expect(done.sides[side].currentEnergy).toBe(0); expect(done.sides[side].score).toBe(12);
    expect(done.instances[id].zone).toBe(index === 1 ? "play" : "banished");
  });

  it("carries the real DTO through ordinary start and deal to one physical same-UUID copy on the intended actor", () => {
    const source = journey(0, "Amplified"), before = copy(source), immutable = printed(), input = init(source, side, { prepared: false }), inputBefore = copy(input);
    const state = engine.createBattle(input, NO_PROMPTS).state;
    const changed = Object.values(state.instances).filter(card => card.variant.deckMods?.reclaim === 3);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ owner: side, controller: side, printing: { kind: "card", cardId: character.id }, variant: { amplified: true } });
    const others = Object.values(state.instances).filter(card => card.printing.kind === "card" && card.printing.cardId === character.id && card.id !== changed[0].id);
    expect(others.some(card => card.owner === side)).toBe(true); expect(others.some(card => card.owner === opponent(side))).toBe(true);
    expect(others.every(card => card.variant.deckMods?.reclaim === undefined)).toBe(true);
    expect(source).toEqual(before); expect(input).toEqual(inputBefore); expect(printed()).toBe(immutable);
  });

  it("keeps printed Reclaim and its payments on an unmodified same-UUID copy and refuses the wrong actor or zone", () => {
    const input = init(journey(), side, { zone: "void", energy: 8 });
    if (input.setup === undefined) throw new Error("Missing declared physical-copy setup");
    const prepared = { ...input, setup: { ...input.setup, placements: input.setup.placements.map(placement =>
      placement.side === side && placement.deckIndex === 1 ? { side, deckIndex: 1, zone: "void" as const } : placement) } };
    const state = engine.createBattle(prepared, NO_PROMPTS).state, [id, sentinel] = state.sides[side].void, before = copy(state);
    expect(quote(state, side, id)).toBe(3); expect(quote(state, side, sentinel)).toBe(9);
    expect(canPlay(state, side, id, "void")).toBe(true); expect(canPlay(state, side, sentinel, "void")).toBe(false);
    expect(() => play(state, side, id, "hand")).toThrow(); expect(() => play(state, opponent(side), id, "void")).toThrow();
    expect(() => play(state, side, sentinel, "void")).toThrow(); expect(state).toEqual(before);
    const rich = engine.createBattle({ ...prepared, setup: { ...prepared.setup,
      sides: { ...prepared.setup.sides, [side]: { currentEnergy: 9, maxEnergy: 9, score: 10 } } } }, NO_PROMPTS).state;
    const paid = play(rich, side, rich.sides[side].void[1], "void");
    expect(paid.sides[side].currentEnergy).toBe(0); expect(paid.sides[side].score).toBe(10);
  });

  it.each(["hand", "void"] as const)("preserves additional costs and replaces only the Reclaim price when played from %s", from => {
    const total = from === "hand" ? 9 : 5, source = journey(4), state = start(source, side, { zone: from, energy: total });
    const id = subject(state, side), discard = state.sides[side].hand.find(card => card !== id)!, before = copy(state);
    expect(canPlay(state, side, id, from)).toBe(true);
    const done = play(state, side, id, from, [[discard]]);
    expect(done.sides[side].currentEnergy).toBe(0); expect(done.sides[side].score).toBe(12);
    expect(done.instances[discard].zone).toBe("void"); expect(done.instances[id].zone).toBe(from === "void" ? "banished" : "void");
    expect(done.instances[id].status.playedViaReclaim).toBe(from === "void");
    for (const options of [{ energy: total - 1 }, { energy: total, handPayments: false }]) {
      const short = start(source, side, { zone: from, ...options }), held = subject(short, side), unchanged = copy(short);
      expect(canPlay(short, side, held, from)).toBe(false); expect(() => play(short, side, held, from)).toThrow(); expect(short).toEqual(unchanged);
    }
    expect(state).toEqual(before);
  });

  it("keeps a zero Reclaim base separate from mandatory energy and distinct hand-card payment", () => {
    const state = start(journey(4, null, false, { setReclaim: 0, reclaim: 8 }), side, { zone: "void", energy: 2 });
    const id = subject(state, side), discard = state.sides[side].hand[1];
    expect(quote(state, side, id)).toBe(2);
    const done = play(state, side, id, "void", [[discard]]);
    expect(done.sides[side].currentEnergy).toBe(0); expect(done.instances[id].zone).toBe("banished"); expect(done.instances[discard].zone).toBe("void");
  });

  it("applies floating energy adjustments to the selected route while keeping entry reduction on the normal base", () => {
    const source = journey(4, null, true, { reclaim: 3 }, [10]);
    for (const from of ["hand", "void"] as const) {
      const cost = from === "hand" ? 8 : 6, state = start(source, side, { zone: from, energy: cost }), id = subject(state, side);
      const discard = state.sides[side].hand.find(card => card !== id)!;
      const done = play(state, side, id, from, [[discard]]);
      expect(done.sides[side].currentEnergy).toBe(0); expect(done.sides[side].score).toBe(12);
      expect(done.instances[discard].zone).toBe("void"); expect(done.instances[id].zone).toBe(from === "void" ? "banished" : "void");
    }
  });

  for (const stacked of [false, true]) it.each(forms)(`applies $form before explicit Reclaim on card $index with other modifications ${stacked}`, row => {
    const source = journey(row.index, row.form, stacked), before = copy(source), immutable = printed();
    const state = start(source, side), id = subject(state, side), sentinel = state.sides[side].hand[1];
    const handCost = (row.form === "Empowered" || row.form === "Perfected" ? 3 : 7) - (stacked ? 2 : 0);
    const amplified = row.form === "Amplified" || row.form === "Perfected", points = amplified ? 5 : 2;
    const hand = play(state, side, id);
    expect(hand.sides[side].currentEnergy).toBe(40 - handCost); expect(hand.sides[side].score).toBe(10 + points);
    expect(hand.instances[id].status.playedViaReclaim).toBe(false);
    const initialVoid = start(source, side, { zone: "void" }), reclaimedId = subject(initialVoid, side);
    expect(quote(initialVoid, side, reclaimedId)).toBe(3);
    for (const viewer of SIDES) expect(engine.view(initialVoid, viewer).instances[reclaimedId].characteristics.reclaimCost).toBe(3);
    const reclaimed = play(initialVoid, side, reclaimedId, "void");
    expect(reclaimed.sides[side].currentEnergy).toBe(37); expect(reclaimed.sides[side].score).toBe(10 + points);
    expect(reclaimed.sides[opponent(side)].currentEnergy).toBe(40); expect(reclaimed.instances[reclaimedId].status.playedViaReclaim).toBe(true);
    const view = engine.view(reclaimed, side).instances[reclaimedId].characteristics;
    expect(view.subtype).toBe(stacked ? mage : row.index === 0 ? warrior : untyped);
    const fast = stacked || row.index === 2 && (row.form === "Hastened" || row.form === "Perfected");
    if (fast) expect(reclaimed.turnLog.played[side][0].speed).toBe("fast");
    expect(hand.instances[sentinel].variant.deckMods).toBeUndefined();
    if (row.index === 0) {
      expect(view.spark).toBe((row.form === "Kindled" || row.form === "Perfected" ? 6 : 3) + (stacked ? 1 : 0));
      const activated = activate(reclaimed, side, reclaimedId, 2);
      expect(activated.sides[side].currentEnergy).toBe(37 - (row.form === "Attuned" || row.form === "Perfected" ? 2 : 3));
      expect(activated.sides[side].score).toBe(11 + points);
      const gone = activate(activated, side, reclaimedId, 4);
      expect(gone.instances[reclaimedId].zone).toBe("banished"); expect(gone.sides[side].score).toBe(11 + points);
      const ordinaryGone = activate(hand, side, id, 4);
      expect(ordinaryGone.instances[id].zone).toBe("void");
      expect(ordinaryGone.sides[side].score).toBe(10 + points + (row.form === "Resonant" || row.form === "Perfected" ? points : 0));
    } else {
      const draws = row.form === "Inspired" || row.form === "Perfected" ? 1 : 0;
      expect(hand.sides[side].hand.length).toBe(state.sides[side].hand.length - 1 + draws);
      expect(reclaimed.sides[side].hand.length).toBe(initialVoid.sides[side].hand.length + draws);
      expect(hand.instances[id].zone).toBe("void"); expect(reclaimed.instances[reclaimedId].zone).toBe("banished");
    }
    expect(source).toEqual(before); expect(printed()).toBe(immutable);
  });

  it.each(["Enduring", "Perfected"] as const)("keeps unoverridden %s Reclaim at its ordinary transformed base", form => {
    const state = start(journey(3, form, false, {}), side), id = state.sides[side].hand[0];
    const inVoid = play(state, side, id), cost = form === "Perfected" ? 3 : 7;
    expect(quote(inVoid, side, id)).toBe(cost);
    const reclaimed = play(inVoid, side, id, "void");
    expect(reclaimed.sides[side].currentEnergy).toBe(40 - cost * 2); expect(reclaimed.instances[id].zone).toBe("banished");
  });

  it.each(["event", "character"] as const)("selects forms before a permanent opposite-type change from %s", original => {
    const event = original === "event";
    let source = journey(event ? 2 : 0, event ? "Perfected" : "Kindled", true);
    source = reward(source, { kind: "change_deck_entry_type", ...target(source), typeChange: { predicateId: parseCardTypeChangePredicateId("reclaim-opposite-type"),
      label: "", cardType: event ? "Character" : "Event", subtype: mage } });
    const state = start(source, side, { zone: "void" }), id = subject(state, side), done = play(state, side, id, "void");
    expect(done.sides[side].currentEnergy).toBe(37); expect(done.instances[id].zone).toBe(event ? "play" : "banished");
    expect(engine.view(done, side).instances[id].characteristics).toMatchObject({ cardType: event ? "character" : "event", spark: event ? 0 : null, subtype: mage });
    expect(done.sides[side].hand.length).toBe(state.sides[side].hand.length + (event ? 1 : 0));
    expect(done.sides[side].score).toBe(event ? 15 : 10);
  });

  it("keeps chosen hand X separate from fixed deck-entry Reclaim", () => {
    const source = journey(6), hand = start(source, side, { energy: 4 }), id = subject(hand, side);
    expect(play(hand, side, id, "hand", [4]).sides[side].currentEnergy).toBe(0);
    const state = start(source, side, { zone: "void", energy: 3 }), held = subject(state, side);
    const done = play(state, side, held, "void");
    expect(done.sides[side].currentEnergy).toBe(0); expect(done.instances[held].zone).toBe("banished");
  });

  it("preserves chronological forms, authored replacement, Perfected snapshots and repeated forms before the entry price", () => {
    for (const [order, draws] of [[["Inspired", "Amplified"], 0], [["Amplified", "Inspired"], 1]] as const) {
      let ordered: Variant = BASE_VARIANT;
      for (const form of order) ordered = appendEngineTransfiguration(eventCard, ordered, form);
      const source = journey(2), state = start(source, side, { zone: "void", ordered }), id = subject(state, side), done = play(state, side, id, "void");
      expect(done.sides[side].score).toBe(15); expect(done.sides[side].currentEnergy).toBe(37);
      expect(done.sides[side].hand.length).toBe(state.sides[side].hand.length + draws); expect(done.instances[id].zone).toBe("banished");
    }
    const perfect = appendEngineTransfiguration(eventCard, BASE_VARIANT, "Perfected");
    const later = appendEngineTransfiguration(eventCard, perfect, "Inspired");
    const state = start(journey(2), side, { zone: "void", ordered: later }), id = subject(state, side), done = play(state, side, id, "void");
    expect(done.sides[side].hand.length).toBe(state.sides[side].hand.length + 2); expect(done.sides[side].score).toBe(15); expect(done.sides[side].currentEnergy).toBe(37);
    let repeated: Variant = BASE_VARIANT;
    for (const form of ["Kindled", "Empowered", "Kindled"] as const) repeated = appendEngineTransfiguration(character, repeated, form);
    const input = init(journey(0, null, true), side, { ordered: repeated }), before = copy(input);
    const paid = engine.createBattle(input, NO_PROMPTS).state, held = subject(paid, side), hand = play(paid, side, held);
    expect(engine.view(hand, side).instances[held].characteristics.spark).toBe(13); expect(hand.sides[side].currentEnergy).toBe(39);
    const voidState = start(journey(0, null, true), side, { zone: "void", ordered: repeated });
    expect(play(voidState, side, subject(voidState, side), "void").sides[side].currentEnergy).toBe(37); expect(input).toEqual(before);
  });

  it("keeps journey accumulation distinct from latest explicit runtime gains and a later plain gain", () => {
    const state = start(journey(0, null, false, { reclaim: 3 }, [8]), side, { zone: "void" }), id = subject(state, side);
    const granted = play(state, side, state.sides[side].hand[state.sides[side].hand.length - 1]);
    expect(quote(state, side, id)).toBe(3); expect(quote(granted, side, id)).toBe(4);
    expect(granted.instances[id].variant.deckMods?.reclaim).toBe(3);
    const done = play(granted, side, id, "void"); expect(done.sides[side].currentEnergy).toBe(36);
  });

  it("retains physical Reclaim through return, repeated play, turns, clone, reload and a fresh journey battle", () => {
    const source = journey(), input = init(source, side), original = engine.createBattle(input, NO_PROMPTS).state, id = subject(original, side);
    const first = play(original, side, id), returned = activate(first, side, id, 3), again = play(returned, side, id);
    const inVoid = activate(again, side, id, 4);
    expect(inVoid.instances[id].zone).toBe("void"); expect(quote(inVoid, side, id)).toBe(3);
    const hashes = [inVoid, cloneState(inVoid), deserializeState(serializeState(inVoid))].map(saved => {
      const reclaimed = play(saved, side, id, "void"), gone = activate(reclaimed, side, id, 4);
      expect(gone.instances[id].zone).toBe("banished"); expect(gone.sides[side].currentEnergy).toBe(23);
      const later = passUntil(engine, gone, next => next.turn.active === opponent(side) && next.turn.phase === "day").state;
      expect(later.instances[id].variant).toEqual(original.instances[id].variant); return stateHash(later);
    });
    expect(hashes[1]).toBe(hashes[0]); expect(hashes[2]).toBe(hashes[0]);
    expect(stateHash(createEngine(catalog).createBattle(copy(input), NO_PROMPTS).state)).toBe(stateHash(original));
    expect(source.deck[0].keywordModification?.reclaim).toBe(3);
  });

  it("removes only the reclaimed replacement when an owner coverage source applies, retaining actual play and entry price", () => {
    const state = start(journey(0, null, false, { reclaim: 3 }, [9]), side, { zone: "void", cover: true }), id = subject(state, side);
    const reclaimed = play(state, side, id, "void"), inVoid = activate(reclaimed, side, id, 4);
    expect(inVoid.instances[id].zone).toBe("void"); expect(inVoid.instances[id].status).toMatchObject({ reclaimed: false, playedViaReclaim: true });
    expect(quote(inVoid, side, id)).toBe(3);
    const cover = inVoid.sides[side].backRank[0]!, departed = activate(inVoid, side, cover, 1), replay = play(departed, side, id, "void");
    expect(activate(replay, side, id, 4).instances[id].zone).toBe("banished");
  });

  it("cancels, reloads and commits one Reclaim payment while rejecting foreign, stale, competing and duplicate inputs", () => {
    const fold = createFoldAdapter(engine), base = applied(fold.start(init(journey(5), side, { zone: "void" }))), before = copy(base);
    const id = subject(base.committed, side), discard = base.committed.sides[side].hand[1];
    const intent = { kind: "battleAction", side, action: { kind: "play", card: id, from: "void" } } as const;
    const pending = applied(fold.reduce(base, intent)), prompt = fold.pending(pending)?.prompt;
    if (prompt === undefined) throw new Error("Missing optional Reclaim payment prompt");
    expect(prompt.kind).toBe("confirm"); expect(prompt.cancellable).toBe(true); expect(pending.committed).toEqual(base.committed);
    expect(fold.reduce(pending, intent)).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(base, { ...intent, side: opponent(side) }).kind).toBe("bounced");
    expect(fold.reduce(pending, { kind: "answer", side: opponent(side), promptId: prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const cancelled = applied(fold.reduce(pending, { kind: "cancel", side, promptId: prompt.id }));
    expect(cancelled.committed.sides).toEqual(base.committed.sides); expect(cancelled.committed.instances).toEqual(base.committed.instances);
    const cold = createFoldAdapter(createEngine(catalog)), retry = applied(cold.reduce(copy(cancelled), intent)), current = cold.pending(retry)?.prompt;
    if (current === undefined) throw new Error("Missing retried Reclaim payment prompt");
    expect(current.id).not.toBe(prompt.id);
    expect(cold.reduce(retry, { kind: "answer", side, promptId: prompt.id, value: true })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const selected = applied(cold.reduce(retry, { kind: "answer", side, promptId: current.id, value: true })), paymentPrompt = cold.pending(selected)?.prompt;
    if (paymentPrompt === undefined) throw new Error("Missing distinct discard payment prompt");
    expect(paymentPrompt.kind).toBe("chooseCards"); expect(selected.committed).toEqual(base.committed);
    expect(cold.reduce(selected, { kind: "answer", side, promptId: paymentPrompt.id, value: [id] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const saved = copy(selected), answer = { kind: "answer", side, promptId: paymentPrompt.id, value: [discard] } as const;
    const done = applied(cold.reduce(saved, answer)), replayed = applied(createFoldAdapter(createEngine(catalog)).reduce(copy(selected), answer));
    expect(stateHash(done.committed)).toBe(stateHash(replayed.committed)); expect(done.inFlight).toBeNull();
    expect(done.committed.sides[side].currentEnergy).toBe(34); expect(done.committed.sides[side].score).toBe(12);
    expect(done.committed.instances[id].zone).toBe("banished"); expect(done.committed.instances[discard].zone).toBe("void");
    expect(done.committed.turnLog.played[side]).toHaveLength(1);
    expect(cold.reduce(done, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const corrupt = copy(selected);
    if (corrupt.inFlight === null) throw new Error("Missing saved Reclaim attempt");
    const damaged = { ...corrupt, inFlight: { ...corrupt.inFlight, answers: corrupt.inFlight.answers.map((record, index) => index === 0 ? { ...record, value: [] } : record) } };
    const recovery = createFoldAdapter(createEngine(catalog)); expect(recovery.pending(damaged)).toBeNull();
    const recovered = recovery.reduce(damaged, intent);
    expect(recovered.kind).toBe("applied");
    if (recovered.kind !== "applied") throw new Error("Damaged Reclaim attempt did not recover");
    expect(recovered.error?.kind).toBe("engine_error"); expect(recovered.slice.inFlight).toBeNull();
    expect(recovered.slice.committed).toEqual(selected.committed);
    expect(base).toEqual(before); expect(selected).toEqual(saved);
  });
});

function offer() {
  const site: SiteState = { id: parseSiteId("reclaim-exploration"), type: "Exploration", isEnhanced: false, isVisited: false };
  const action = { id: testExplorationActionId("reclaim-action"), label: "", effectKind: "purge-duplicates-and-grant-reclaim" as const };
  const local = { ...content, exploration: { ...content.exploration, encounters: [{ cardId: eventCard.id, prose: "", actions: [action] }] } };
  const base = { ...testJourneyState("reclaim-offer"), deck: [entry(0, "survivor", "Empowered"), entry(1, "duplicate:a"), entry(1, "duplicate:b")] };
  const journey = keywords(base, { reclaim: 12, energyCostReduction: 1 });
  const runtime = buildExplorationRuntime(journey, site, local, () => 0, eventCard.id);
  if (runtime === null) throw new Error("Synthetic Reclaim offer refused");
  return { journey: { ...journey, siteRuntime: { ...journey.siteRuntime, [site.id]: runtime } }, site, seq: 1, content: local,
    payload: { actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION } };
}

describe("synthetic persistent Reclaim transactions", () => {
  it("consumes the real synthetic exploration offer once, purging UUID duplicates and setting each survivor's resolved price", () => {
    const request = offer(), before = copy(request.journey), immutable = printed();
    for (const patch of [{ actionId: testExplorationActionId("foreign-reclaim-action") }, { selectionRulesVersion: "stale" },
      { expectedEncounterCardId: character.id }, { expectedRerollCount: 1 }]) {
      expect(resolveExplorationChoice({ ...request, payload: { ...request.payload, ...patch } })).toBeNull(); expect(request.journey).toEqual(before);
    }
    const next = resolveExplorationChoice(request);
    if (next === null) throw new Error("Valid Reclaim offer refused");
    expect(resolveExplorationChoice({ ...request, journey: copy(request.journey), payload: copy(request.payload) })).toEqual(next);
    expect(resolveExplorationChoice({ ...request, journey: next })).toBeNull(); expect(next.deck).toHaveLength(1);
    expect(next.deck[0].keywordModification).toEqual({ setReclaim: 2, energyCostReduction: 1 });
    for (const side of SIDES) {
      const input = init(next, side, { prepared: false }), ordinary = engine.createBattle(input, NO_PROMPTS).state;
      expect(subject(ordinary, side)).toBeDefined();
      const prepared = { ...input, setup: { placements: [{ side, deckIndex: 0, zone: "void" as const }],
        sides: { player: { currentEnergy: 2, maxEnergy: 2, score: 10 }, enemy: { currentEnergy: 2, maxEnergy: 2, score: 10 } },
        turn: { active: side, phase: "day" as const, round: 1, turnNumber: 1, lastNormal: side,
          sideTurns: { player: side === "player" ? 1 : 0, enemy: side === "enemy" ? 1 : 0 } }, dreamwell: { deck: [], next: 0 } } };
      const state = engine.createBattle(prepared, NO_PROMPTS).state, id = subject(state, side);
      expect(quote(state, side, id)).toBe(2); expect(play(state, side, id, "void").sides[side].currentEnergy).toBe(0);
    }
    expect(request.journey).toEqual(before); expect(printed()).toBe(immutable);
  });

  it("refuses invalid concrete targets and composites atomically while preserving the source and printed catalog", () => {
    const state = journey(), before = copy(state), immutable = printed();
    const valid = { kind: "change_deck_entry_keywords", ...target(state), keywords: { reclaim: 2 } } as const;
    for (const patch of [{ entryId: parseDeckEntryId("missing-reclaim-entry") }, { cardUuid: eventCard.id }, { cardNumber: cards[2].cardNumber }]) {
      const invalid = { ...valid, ...patch };
      expect(applyJourneyRewardEffect({ state, journeyContent: content, effect: invalid })).toBeNull();
      expect(applyJourneyRewardEffect({ state, journeyContent: content, effect: { kind: "composite", children: [valid, invalid] } })).toBeNull();
      expect(state).toEqual(before);
    }
    expect(() => createEngineBattleInit({ seed: 634, scoreToWin: 1000, startingSide: "player", journey: state,
      enemy: { deck: [character.id], avatar: null, dreamsigns: [] }, cardDatabase: new Map(), transfigurationData: content.transfigurationData,
      minimumDeckSize: 1, dreamwell: [] })).toThrow();
    expect(printed()).toBe(immutable);
  });
});
