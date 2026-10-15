/** Synthetic contracts only; original hv-umm2.285 owns its UUID, real20 BOTH controllers, judgment and full content checks. */
import { describe, expect, it } from "vitest";
import { createCatalog, instanceCard, type EngineCardDefinition } from "../../../engine/catalog";
import * as b from "../../../engine/dsl/builders";
import { onMaterialized, triggered, whenMaterialize, whenYouPlay } from "../../../engine/dsl/triggers";
import { BASE_VARIANT } from "../../../engine/dsl/types";
import * as p from "../../../engine/effects/primitives";
import { createEngine } from "../../../engine/engine";
import { createFoldAdapter, type IntentOutcome } from "../../../engine/fold/slice";
import { cloneState } from "../../../engine/state/clone";
import { initialState } from "../../../engine/state/create";
import { deserializeState, serializeState, stateHash } from "../../../engine/state/hash";
import { SIDES, opponent, type InstanceId, type Side } from "../../../engine/state/ids";
import type { BattleInit, BattlePlacement, BattleState } from "../../../engine/state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../engine/steps/sources";
import { syntheticId } from "../../../engine/testing/synthetic-cards";
import { passUntil } from "../../../engine/testing/trigger-harness";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../../journey_v2/testing/fixtures";
import { SELECTION_RULES_VERSION } from "../../../reward-selection";
import { applyJourneyRewardEffect, type JourneyRewardEffect } from "../../../rules/journey/reward-effects";
import { buildExplorationRuntime, resolveExplorationChoice } from "../../../session/providers/exploration-provider";
import { testJourneyState } from "../../../testing/journey-genesis";
import { appendDeckEntryTransfiguration } from "../../../transfiguration/deck-entry-transfigurations";
import { resonantChange, transfigurationSourceState } from "../../../transfiguration/transfiguration-logic";
import { EVENT_CARD_SUBTYPE, parseCardName, parseCardSubtype } from "../../../types/card-identity";
import { parseCardTypeChangePredicateId, parseDeckEntryId, parseSiteId } from "../../../types/identifiers";
import type { DeckEntry, JourneyState, SiteState, TransfigurationType } from "../../../types/journey";
import { testExplorationActionId } from "../../../types/test-identities";
import { createEngineBattleInit, engineDeckEntry } from "../engine-battle-init";

const warrior = parseCardSubtype("Warrior"), mage = parseCardSubtype("Mage");
const text = "Gain 2⍟.\n\n▸Materialized: Gain 3⍟.\n\n3●: Gain 1⍟.", stronger = text.replace("Gain 2", "Gain 5");
function definition(index: number, character: boolean): EngineCardDefinition {
  return { id: syntheticId(0x63600 + index), cardType: character ? "character" : "event", costs: [b.energy(7)],
    spark: character ? 3 : null, subtype: character ? warrior : EVENT_CARD_SUBTYPE, speed: "standard", status: "authored",
    transfiguration: { amplified: true, resonant: { base: resonantChange(text), amplified: resonantChange(stronger) } },
    transfigurationState: (initial, steps) => transfigurationSourceState(text, stronger, initial, steps),
    abilities: v => [b.event(p.gainPoints(v.amplified ? 5 : 2)), triggered(onMaterialized(), p.gainPoints(3)),
      b.activated([b.energy(3)], p.gainPoints(1)), b.activated([], p.returnToHand(b.self())), b.activated([], p.dissolve(b.self())),
      b.activated([], p.gainSpark(b.all({ controller: "you", subtype: warrior }), 1)),
      b.activated([], p.createCopyInHand(b.self())), b.activated([b.energy(3)], p.gainPoints(1), { zone: "void" }),
      b.activated([], p.gainSpark(b.self(), 4)), b.activated([], p.materializeFigmentCopy(b.self())),
      b.playCondition({ cond: "energyAtLeast", amount: 8 })],
  };
}
const eventCard = definition(0, false), character = definition(1, true);
const filler: EngineCardDefinition = { ...character, id: syntheticId(0x63602), costs: [], status: "vanilla", abilities: () => [] };
const observer: EngineCardDefinition = { ...filler, id: syntheticId(0x63603), abilities: () => [
  triggered(whenYouPlay({ cardType: "character", subtype: mage }), p.gainPoints(10)),
  triggered(whenYouPlay({ cardType: "event", subtype: mage }), p.gainPoints(20)),
  triggered(whenMaterialize({ controller: "you", subtype: mage }), p.gainPoints(30)),
  b.staticAbility(p.sparkModifier(b.all({ controller: "you", subtype: mage }), 2)),
  b.activated([], p.drawMatching({ cardType: "character", subtype: mage })),
  b.activated([], p.returnFromVoid(b.fromVoid({ cardType: "event", subtype: mage }))),
  b.activated([], p.gainSpark(b.target({ controller: "you", subtype: mage }), 2)),
] };
const payment: EngineCardDefinition = { ...eventCard, id: syntheticId(0x63604), costs: [b.energy(2)], abilities: () => [
  b.event(p.gainPoints(2)), b.additionalCost(b.optionalCost(b.energy(1)), b.discardCostFilter({ cardType: "character", subtype: mage })),
] };
const zero: EngineCardDefinition = { ...character, id: syntheticId(0x63605), spark: 0 };
const definitions = [eventCard, character, filler, observer, payment, zero];
const catalog = createCatalog(definitions, []), engine = createEngine(catalog);
const cards = definitions.map((card, index) => makeAuguryTestCard({ id: card.id, cardNumber: 63600 + index,
  name: parseCardName("Shared synthetic display name"), cardType: card.cardType === "character" ? "Character" : "Event", subtype: card.subtype,
  energyCost: index === 4 ? 2 : index === 2 || index === 3 ? 0 : 7, spark: typeof card.spark === "number" ? card.spark : null,
  renderedText: text, amplifiedText: stronger,
}));
const content = makeAuguryTestContent({ cards });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const printed = () => JSON.stringify(definitions.map(card => ({ ...card, base: card.abilities(BASE_VARIANT), amplified: card.abilities({ amplified: true }) })));
function entry(index: number, suffix: string): DeckEntry {
  return { entryId: parseDeckEntryId(`card-type:${index}:${suffix}`), cardNumber: cards[index].cardNumber, transfiguration: null, isBane: false };
}
function target(state: JourneyState, index = 0) {
  const subject = state.deck[index], card = content.cardDatabase.get(subject.cardNumber);
  if (card === undefined) throw new Error("Missing synthetic printing");
  return { entryId: subject.entryId, cardNumber: card.cardNumber, cardUuid: card.id };
}
function reward(state: JourneyState, effect: JourneyRewardEffect): JourneyState {
  const before = copy(state), next = applyJourneyRewardEffect({ state, journeyContent: content, effect });
  expect(state).toEqual(before); if (next === null) throw new Error("Synthetic reward refused"); return next;
}
function changed(state: JourneyState, index = 0, cardType: "Character" | "Event" = "Character") {
  return reward(state, { kind: "change_deck_entry_type", ...target(state, index), typeChange: {
    predicateId: parseCardTypeChangePredicateId("synthetic-card-type"), label: "", subtype: mage, cardType,
  } });
}
function forms(state: JourneyState, sequence: readonly TransfigurationType[]) {
  const card = cards.find(card => card.cardNumber === state.deck[0].cardNumber)!, definition = definitions.find(value => value.id === card.id)!;
  let held = state.deck[0];
  for (const form of sequence) {
    const result = appendDeckEntryTransfiguration(content.transfigurationData, card, definition, held, form);
    if (!result.ok) throw new Error(`Synthetic form refused: ${form}/${result.reason}`); held = result.value;
  }
  return { ...state, deck: [held, ...state.deck.slice(1)] };
}
function journey(index = 0, sequence: readonly TransfigurationType[] = [], stacked = false) {
  let state: JourneyState = { ...testJourneyState("card-type-contract"), avatar: null, dreamsigns: [], battleModifiers: [],
    deck: [entry(index, "subject"), entry(index, "same-uuid"), ...Array.from({ length: 12 }, (_, i) => entry(2, `filler:${i}`))] };
  state = changed(forms(state, sequence), 0, definitions[index].cardType === "event" ? "Character" : "Event");
  if (stacked) state = reward(state, { kind: "composite", children: [
    { kind: "reduce_deck_entry_energy_cost", ...target(state), amount: 2 },
    { kind: "add_deck_entry_spark_bonus", ...target(state), amount: 1 },
    { kind: "change_deck_entry_keywords", ...target(state), keywords: { fast: true, setReclaim: 1 } },
  ] });
  return state;
}
function init(state: JourneyState, side: Side, options: { normal?: boolean; zone?: "hand" | "deck" | "void" | "play"; observer?: boolean; payment?: boolean } = {}): BattleInit {
  const mapped = createEngineBattleInit({ seed: 636, scoreToWin: 1000, startingSide: side, journey: state,
    enemy: { deck: [target(state).cardUuid, ...Array.from({ length: 12 }, () => filler.id)], avatar: null, dreamsigns: [] },
    cardDatabase: content.cardDatabase, transfigurationData: content.transfigurationData, minimumDeckSize: 1, dreamwell: [] });
  expect(mapped.decks.player[0]).toEqual(engineDeckEntry(state.deck[0], cards.find(card => card.cardNumber === state.deck[0].cardNumber)!, content.transfigurationData));
  const deck = [...mapped.decks.player, ...(options.observer ? [{ cardId: observer.id }] : []), ...(options.payment ? [{ cardId: payment.id }] : [])];
  // The bridge maps a journey player; seat that complete public DTO on each engine actor.
  const seated = { ...mapped, decks: side === "player" ? { player: deck, enemy: mapped.decks.enemy } : { player: mapped.decks.enemy, enemy: deck } };
  if (options.normal) return seated;
  const zone = options.zone ?? "hand";
  const placements: BattlePlacement[] = [
    ...(zone === "deck" ? [] : zone === "play" ? [{ side, deckIndex: 0, zone: "play" as const, slot: { rank: "back" as const, index: 0 } }] : [{ side, deckIndex: 0, zone }]),
    { side, deckIndex: 1, zone: "hand" }, { side, deckIndex: 2, zone: "hand" }, { side: opponent(side), deckIndex: 0, zone: "hand" },
    ...(options.observer ? [{ side, deckIndex: state.deck.length, zone: "play" as const, slot: { rank: "back" as const, index: 1 } }] : []),
    ...(options.payment ? [{ side, deckIndex: state.deck.length + (options.observer ? 1 : 0), zone: "hand" as const }] : []),
  ];
  return { ...seated, setup: { placements, sides: { player: { currentEnergy: 40, maxEnergy: 40, score: 0 }, enemy: { currentEnergy: 40, maxEnergy: 40, score: 0 } },
    turn: { active: side, phase: "day", round: 1, turnNumber: 1, lastNormal: side, sideTurns: { player: side === "player" ? 1 : 0, enemy: side === "enemy" ? 1 : 0 } },
    dreamwell: { deck: [], next: 0 } } };
}
function start(source: JourneyState, side: Side, options: Parameters<typeof init>[2] = {}) {
  const input = init(source, side, options), before = copy(input), original = initialState(input, catalog);
  // Prepared placements change zone order, so the declared first hand/play slot identifies the subject.
  const subject = options.zone === "play" ? original.sides[side].backRank[0]! : options.zone === "void" ? original.sides[side].void[0] : options.zone === "deck" || options.normal ? original.sides[side].deck[0] : original.sides[side].hand[0];
  expect(original.instances[subject]).toMatchObject({ owner: side, controller: side, printing: { kind: "card", cardId: target(source).cardUuid } });
  const state = engine.createBattle(input, NO_PROMPTS).state; expect(input).toEqual(before); return { state, id: subject, input };
}
const view = (state: BattleState, side: Side, id: InstanceId) => engine.view(state, side).instances[id].characteristics;
const play = (state: BattleState, side: Side, id: InstanceId, from: "hand" | "void" = "hand") => engine.apply(state, side, { kind: "play", card: id, from }, NO_PROMPTS).state;
const activate = (state: BattleState, side: Side, source: InstanceId, ability: number, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) =>
  engine.apply(state, side, { kind: "activate", source, ability }, new ScriptedSource(answers)).state;
function applied(outcome: IntentOutcome) {
  expect(outcome.kind).toBe("applied"); if (outcome.kind !== "applied") throw new Error("Synthetic intent bounced");
  expect(outcome.error).toBeNull(); return outcome.slice;
}
const rows = [
  ...([null, "Amplified", "Empowered", "Inspired", "Enduring", "Hastened", "Resonant", "Attuned", "Perfected"] as const).map(form => ({ index: 0, form })),
  ...([null, "Amplified", "Empowered", "Kindled", "Resonant", "Attuned", "Perfected"] as const).map(form => ({ index: 1, form })),
];

for (const side of SIDES) describe(`${side} synthetic permanent card type`, () => {
  it("carries exactly the declared physical entry through real shuffle and deal without changing either same-UUID neighbor", () => {
    const source = journey(0, ["Amplified"], true), before = copy(source), immutable = printed();
    const { state, id, input } = start(source, side, { normal: true }), inputBefore = copy(input);
    expect(state.instances[id]).toMatchObject({ owner: side, printing: { cardId: eventCard.id }, variant: { deckMods: { typeChange: { cardType: "character", subtype: mage } } } });
    const unchanged = Object.values(state.instances).filter(card => card.id !== id && card.printing.kind === "card" && card.printing.cardId === eventCard.id);
    expect(unchanged.some(card => card.owner === side)).toBe(true); expect(unchanged.some(card => card.owner === opponent(side))).toBe(true);
    for (const card of unchanged) expect(instanceCard(catalog, card)).toMatchObject({ cardType: "event", spark: null });
    expect(instanceCard(catalog, state.instances[id])).toMatchObject({ cardType: "character", subtype: mage, spark: 0 });
    if (state.instances[id].zone === "hand") expect(view(state, side, id).cardType).toBe("character");
    else expect(engine.view(state, side).instances[id]).toBeUndefined();
    expect([...state.sides[side].hand, ...state.sides[side].deck]).toContain(id);
    expect(Object.values(state.instances).filter(card => card.printing.kind === "card" && card.printing.cardId === filler.id).every(card => instanceCard(catalog, card).cardType === "character")).toBe(true);
    expect(source).toEqual(before); expect(input).toEqual(inputBefore); expect(printed()).toBe(immutable);
  });

  for (const stacked of [false, true]) it.each(rows)(`resolves printing $index after $form with companion modifications ${stacked}`, ({ index, form }) => {
    const source = journey(index, form === null ? [] : [form], stacked), before = copy(source), immutable = printed();
    const { state, id } = start(source, side), sentinel = state.sides[side].hand[1], done = play(state, side, id);
    const cost = (form === "Empowered" || form === "Perfected" ? 3 : 7) - (stacked ? 2 : 0), points = form === "Amplified" || form === "Perfected" ? 5 : 2;
    expect(done.sides[side].currentEnergy).toBe(40 - cost); expect(done.sides[side].score).toBe(points + (index === 0 ? 3 : 0));
    expect(done.sides[opponent(side)].currentEnergy).toBe(40); expect(done.instances[id].zone).toBe(index === 0 ? "play" : "void");
    for (const viewer of SIDES) expect(view(done, viewer, id)).toMatchObject({ cardType: index === 0 ? "character" : "event", subtype: mage, spark: index === 0 ? 0 : null });
    expect(done.turnLog.played[side][0]).toMatchObject({ instance: id, cardType: index === 0 ? "character" : "event", subtype: mage });
    expect(instanceCard(catalog, done.instances[sentinel]).cardType).toBe(index === 0 ? "event" : "character");
    const draws = index === 0 && (form === "Inspired" || form === "Perfected") ? 1 : 0;
    expect(done.sides[side].hand.length).toBe(state.sides[side].hand.length - 1 + draws);
    const paid = activate(done, side, id, index === 0 ? 2 : 7);
    expect(paid.sides[side].currentEnergy).toBe(40 - cost - (index === 0 && (form === "Attuned" || form === "Perfected") ? 2 : 3));
    expect(paid.sides[side].score).toBe(done.sides[side].score + 1);
    if (index === 0) {
      const gone = activate(paid, side, id, 4);
      expect(gone.sides[side].score).toBe(paid.sides[side].score + (form === "Resonant" || form === "Perfected" ? 3 : 0));
      if (stacked || form === "Enduring" || form === "Perfected") {
        const again = play(gone, side, id, "void"); expect(again.sides[side].currentEnergy).toBe(gone.sides[side].currentEnergy - (stacked ? 1 : cost));
        expect(view(again, side, id)).toMatchObject({ cardType: "character", spark: 0 });
        expect(activate(again, side, id, 4).instances[id].zone).toBe("banished");
      }
    } else {
      expect(engine.legalActions(done, side).some(action => action.kind === "activate" && action.source === id && action.ability === 2)).toBe(false);
      if (stacked) expect(play(paid, side, id, "void").instances[id].zone).toBe("banished");
      const restored = start(changed(source), side).state;
      expect(view(restored, side, restored.sides[side].hand[0]).spark).toBe((form === "Kindled" || form === "Perfected" ? 6 : 3) + (stacked ? 1 : 0));
    }
    if (stacked || form === "Hastened") {
      const night = passUntil(engine, state, next => next.turn.phase === "night").state;
      expect(engine.legalActions(night, side).some(action => action.kind === "play" && action.card === id)).toBe(true);
      expect(play(night, side, id).turnLog.played[side][0].speed).toBe("fast");
    }
    expect(source).toEqual(before); expect(printed()).toBe(immutable);
  });

  it("preserves a printed play condition before payment independently of the changed kind", () => {
    for (const index of [0, 1]) {
      const input = init(journey(index), side);
      if (input.setup === undefined) throw new Error("Missing declared condition setup");
      const setup = input.setup;
      const funded = (amount: number) => engine.createBattle({ ...input, setup: { ...setup, sides: {
        ...setup.sides, [side]: { ...setup.sides[side], currentEnergy: amount, maxEnergy: amount },
      } } }, NO_PROMPTS).state;
      const low = funded(7), id = low.sides[side].hand[0], before = copy(low);
      expect(engine.legalActions(low, side).some(action => action.kind === "play" && action.card === id)).toBe(false);
      expect(() => play(low, side, id)).toThrow(); expect(low).toEqual(before);
      const enough = funded(8); expect(play(enough, side, enough.sides[side].hand[0]).sides[side].currentEnergy).toBe(1);
    }
  });

  it("distinguishes absent printed spark from printed zero and later gained and static battle spark", () => {
    const { state, id } = start(journey(0, [], true), side, { observer: true });
    const done = play(state, side, id); expect(view(done, side, id).spark).toBe(2);
    expect(view(activate(done, side, id, 8), side, id).spark).toBe(6);
    const empty = journey(5, [], true), restored = start(changed(empty), side), played = play(restored.state, side, restored.id);
    expect(view(played, side, restored.id).spark).toBe(1);
  });

  it("uses effective kinds for typal play/materialize observers, deck and void filters while preserving literal ability selectors", () => {
    const { state, id } = start(journey(), side, { observer: true });
    const done = play(state, side, id); expect(done.sides[side].score).toBe(45); expect(view(done, side, id).spark).toBe(2);
    const sentinel = done.sides[side].hand[1], plain = play(done, side, sentinel), literal = activate(plain, side, id, 5);
    expect(view(literal, side, id).spark).toBe(2); expect(view(literal, side, sentinel).spark).toBe(4);
    const event = start(journey(1), side, { observer: true }), eventId = event.id, returned = activate(play(event.state, side, eventId), side, event.state.sides[side].backRank[1]!, 5, [[eventId]]);
    expect(returned.instances[eventId].zone).toBe("hand"); expect(view(returned, side, eventId)).toMatchObject({ cardType: "event", spark: null });
    const deck = start(journey(), side, { zone: "deck", observer: true }), draw = activate(deck.state, side, deck.state.sides[side].backRank[1]!, 4);
    expect(draw.sides[side].hand).toEqual([...deck.state.sides[side].hand, deck.id]); expect(draw.sides[side].deck).not.toContain(deck.id);
    const pending = createFoldAdapter(engine), input = init(changed(journey(), 1), side, { zone: "play", observer: true });
    if (input.setup === undefined) throw new Error("Missing declared target setup");
    const placed = { ...input, setup: { ...input.setup, placements: input.setup.placements.map((placement): BattlePlacement =>
      placement.side === side && placement.deckIndex === 1 ? { side, deckIndex: 1, zone: "play", slot: { rank: "back", index: 2 } } : placement) } };
    const base = applied(pending.start(placed));
    const choice = applied(pending.reduce(base, { kind: "battleAction", side, action: { kind: "activate", source: base.committed.sides[side].backRank[1]!, ability: 6 } })), prompt = pending.pending(choice)?.prompt;
    if (prompt?.kind !== "chooseTargets") throw new Error("Missing effective-type target prompt");
    expect(prompt.candidates).toContain(base.committed.sides[side].backRank[0]);
  });

  it("preserves chronological and repeated applications and each Perfected snapshot before type changes", () => {
    for (const [sequence, draws] of [[["Inspired", "Amplified"], 0], [["Amplified", "Inspired"], 1]] as const) {
      const { state, id } = start(journey(0, sequence), side), done = play(state, side, id);
      expect(done.sides[side].hand.length).toBe(state.sides[side].hand.length - 1 + draws); expect(done.sides[side].score).toBe(8); expect(view(done, side, id).spark).toBe(0);
    }
    const source = journey(1, ["Kindled", "Empowered", "Kindled"], true), restored = start(changed(source), side), done = play(restored.state, side, restored.id);
    expect(done.sides[side].currentEnergy).toBe(39); expect(view(done, side, restored.id).spark).toBe(13);
    const perfect = start(journey(0, ["Perfected", "Inspired"]), side), resolved = play(perfect.state, side, perfect.id);
    expect(resolved.sides[side].hand.length).toBe(perfect.state.sides[side].hand.length + 1); expect(resolved.sides[side].score).toBe(8);
  });

  it("keeps the physical type through return, replay, copies, turns, clone, save and a fresh journey battle", () => {
    const source = journey(0, ["Empowered"], true), { state, id, input } = start(source, side), first = play(state, side, id);
    const hashes = [first, cloneState(first), deserializeState(serializeState(first))].map(saved => {
      const returned = activate(saved, side, id, 3), again = play(returned, side, id), later = passUntil(engine, again, next => next.turn.active === opponent(side) && next.turn.phase === "day").state;
      expect(view(later, side, id)).toMatchObject({ cardType: "character", spark: 0 }); return stateHash(later);
    });
    expect(hashes[1]).toBe(hashes[0]); expect(hashes[2]).toBe(hashes[0]);
    const copied = activate(first, side, id, 6), newId = copied.sides[side].hand.find(value => !first.sides[side].hand.includes(value))!;
    expect(newId).not.toBe(id); expect(copied.instances[newId].variant).toEqual(first.instances[id].variant);
    expect(view(copied, side, newId)).toMatchObject({ cardType: "character", spark: 0 });
    const figments = activate(first, side, id, 9), figment = Object.values(figments.instances).find(value => value.printing.kind === "figmentCopy")!;
    expect(figment.id).not.toBe(id); expect(view(figments, side, figment.id)).toMatchObject({ cardType: "character", spark: 0 });
    expect(stateHash(createEngine(catalog).createBattle(copy(input), NO_PROMPTS).state)).toBe(stateHash(state));
    expect(source.deck[0].typeChange?.cardType).toBe("Character");
  });

  it("cancels and reloads a type-filtered payment while refusing stale, foreign, duplicate and competing inputs", () => {
    const fold = createFoldAdapter(engine, { checkEventPrefix: true }), both = changed(journey(), 1);
    const source = { ...both, deck: both.deck.map((held, index) => index === 2 ? entry(0, "plain-payment-sentinel") : held) };
    const base = applied(fold.start(init(source, side, { payment: true })));
    const before = copy(base), discard = base.committed.sides[side].hand[0], id = base.committed.sides[side].hand[3];
    const intent = { kind: "battleAction", side, action: { kind: "play", card: id, from: "hand" } } as const;
    const pending = applied(fold.reduce(base, intent)), prompt = fold.pending(pending)?.prompt;
    if (prompt === undefined) throw new Error("Missing optional payment");
    expect(prompt.kind).toBe("confirm"); expect(prompt.cancellable).toBe(true); expect(pending.committed).toEqual(base.committed);
    expect(fold.reduce(pending, intent)).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(base, { ...intent, side: opponent(side) }).kind).toBe("bounced");
    const cancelled = applied(fold.reduce(pending, { kind: "cancel", side, promptId: prompt.id }));
    expect(cancelled.committed.sides).toEqual(base.committed.sides); expect(cancelled.committed.instances).toEqual(base.committed.instances);
    const cold = createFoldAdapter(createEngine(catalog)), retry = applied(cold.reduce(copy(cancelled), intent)), current = cold.pending(retry)?.prompt;
    if (current === undefined) throw new Error("Missing retried payment");
    expect(cold.reduce(retry, { kind: "answer", side, promptId: prompt.id, value: true })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(cold.reduce(retry, { kind: "answer", side: opponent(side), promptId: current.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const selected = applied(cold.reduce(retry, { kind: "answer", side, promptId: current.id, value: true })), paymentPrompt = cold.pending(selected)?.prompt;
    if (paymentPrompt?.kind !== "chooseCards") throw new Error("Missing effective Character discard");
    expect(paymentPrompt.candidates).toContain(discard); expect(paymentPrompt.candidates).not.toContain(base.committed.sides[side].hand[2]);
    expect(cold.reduce(selected, { kind: "answer", side, promptId: paymentPrompt.id, value: [id] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const answer = { kind: "answer", side, promptId: paymentPrompt.id, value: [discard] } as const, saved = copy(selected);
    const done = applied(cold.reduce(saved, answer)), replay = applied(createFoldAdapter(createEngine(catalog)).reduce(copy(selected), answer));
    expect(stateHash(done.committed)).toBe(stateHash(replay.committed)); expect(done.committed.sides[side].currentEnergy).toBe(37);
    expect(done.committed.sides[side].score).toBe(2); expect(done.committed.instances[discard].zone).toBe("void");
    expect(done.committed.turnLog.played[side]).toHaveLength(1); expect(cold.reduce(done, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    if (selected.inFlight === null) throw new Error("Missing saved payment");
    const damaged = { ...copy(selected), inFlight: { ...selected.inFlight, answers: selected.inFlight.answers.map((record, index) => index === 0 ? { ...record, value: [] } : record) } };
    const recovery = createFoldAdapter(createEngine(catalog)); expect(recovery.pending(damaged)).toBeNull();
    const recovered = recovery.reduce(damaged, intent); expect(recovered.kind).toBe("applied");
    if (recovered.kind !== "applied") throw new Error("Payment recovery bounced");
    expect(recovered.error?.kind).toBe("engine_error"); expect(recovered.slice.inFlight).toBeNull(); expect(recovered.slice.committed).toEqual(selected.committed);
    expect(base).toEqual(before); expect(selected).toEqual(saved);
  });
});

function offer(offered: boolean) {
  const site: SiteState = { id: parseSiteId("card-type-exploration"), type: "Exploration", isEnhanced: false, isVisited: false };
  const action = { id: testExplorationActionId("card-type-action"), label: "", effectKind: "change-card-type-selected" as const,
    cardType: "Character" as const, deckTarget: offered ? "offered" as const : "chosen" as const,
    ...(offered ? { canonicalMechanicId: "change-entry-card-type" as const, selectionPolicyId: "deck-entry-centrality" as const } : {}) };
  const local = { ...content, exploration: { ...content.exploration, encounters: [{ cardId: payment.id, prose: "", actions: [action] }] } };
  // Only the declared subject is eligible; the same-UUID neighbor already has the requested kind.
  const state = changed({ ...journey(), deck: [entry(0, "offered-subject"), entry(0, "same-uuid"), ...Array.from({ length: 12 }, (_, i) => entry(2, `offered-filler:${i}`))] }, 1);
  const runtime = buildExplorationRuntime(state, site, local, () => 0, payment.id);
  if (runtime === null) throw new Error("Synthetic card-type offer refused");
  return { journey: { ...state, siteRuntime: { ...state.siteRuntime, [site.id]: runtime } }, site, seq: 1, content: local,
    payload: { actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION, selection: { entryIds: [state.deck[0].entryId] } } };
}
describe("synthetic card-type exploration transactions", () => {
  for (const offered of [false, true]) it(`applies an actual ${offered ? "offered" : "chosen"} producer to the declared entry and deals both controllers`, () => {
    const request = offer(offered), before = copy(request.journey), immutable = printed(), next = resolveExplorationChoice(request);
    if (next === null) throw new Error("Valid synthetic card-type choice refused");
    expect(next.deck[0].typeChange).toMatchObject({ cardType: "Character", subtype: EVENT_CARD_SUBTYPE });
    expect(next.deck.slice(1)).toEqual(before.deck.slice(1));
    for (const side of SIDES) {
      const { state, id } = start(next, side, { normal: true });
      expect(instanceCard(catalog, state.instances[id])).toMatchObject({ cardType: "character", spark: 0, subtype: EVENT_CARD_SUBTYPE });
      if (state.instances[id].zone === "deck") expect(engine.view(state, side).instances[id]).toBeUndefined();
      const untouched = Object.values(state.instances).find(card => card.owner === opponent(side) && card.printing.kind === "card" && card.printing.cardId === eventCard.id)!;
      expect(instanceCard(catalog, untouched).cardType).toBe("event");
    }
    expect(resolveExplorationChoice({ ...request, journey: copy(request.journey), payload: copy(request.payload) })).toEqual(next);
    expect(resolveExplorationChoice({ ...request, journey: next })).toBeNull(); expect(request.journey).toEqual(before); expect(printed()).toBe(immutable);
  });

  it("refuses malformed, stale and ineligible selections, invalid DTOs and invalid histories atomically", () => {
    for (const offered of [false, true]) {
      const request = offer(offered), before = copy(request.journey);
      for (const patch of [{ actionId: testExplorationActionId("foreign-card-type-action") }, { selectionRulesVersion: "stale" },
        { expectedEncounterCardId: character.id }, { expectedRerollCount: 1 },
        ...[[], [request.journey.deck[0].entryId, request.journey.deck[0].entryId], [request.journey.deck[1].entryId], [parseDeckEntryId("foreign-card-type-entry")]].map(entryIds => ({ selection: { entryIds } }))]) {
        expect(resolveExplorationChoice({ ...request, payload: { ...request.payload, ...patch } })).toBeNull(); expect(request.journey).toEqual(before);
      }
    }
    const source = journey(), before = copy(source), valid = { kind: "change_deck_entry_type", ...target(source), typeChange: source.deck[0].typeChange! } as const;
    for (const patch of [{ entryId: parseDeckEntryId("missing-card-type-entry") }, { cardUuid: character.id }, { cardNumber: cards[1].cardNumber }]) {
      const invalid = { ...valid, ...patch };
      expect(applyJourneyRewardEffect({ state: source, journeyContent: content, effect: invalid })).toBeNull();
      expect(applyJourneyRewardEffect({ state: source, journeyContent: content, effect: { kind: "composite", children: [valid, invalid] } })).toBeNull(); expect(source).toEqual(before);
    }
    const malformed = { ...source.deck[0], transfiguration: "Kindled" as const, transfigurationApplications: [{ form: "Empowered" as const }] };
    expect(() => engineDeckEntry(malformed, cards[0], content.transfigurationData)).toThrow();
    const input = init(journey(0, ["Inspired"]), "player"), invalid = { ...input, decks: { ...input.decks, player: input.decks.player.map((entry, index) => index === 0 ? { ...entry, transfigurations: ["Inspired" as const] } : entry) } };
    expect(() => engine.createBattle(invalid, NO_PROMPTS)).toThrow(); expect(source).toEqual(before);
    const held = start(source, "player"), immutable = copy(held.state); expect(() => play(held.state, "enemy", held.id)).toThrow(); expect(() => play(held.state, "player", held.id, "void")).toThrow(); expect(held.state).toEqual(immutable);
  });
});
