/** Public synthetic contracts; real-content samples and encounter acceptance belong to hv-umm2.286. */
import { afterEach, describe, expect, it } from "vitest";
import { createEngine, NO_PROMPTS, type BattleInit, type BattleState, type Side } from "../../../engine";
import { createCatalog, type EngineCardDefinition } from "../../../engine/catalog";
import { energy, event } from "../../../engine/dsl/builders";
import { chooseOne } from "../../../engine/effects/primitives/choose-one";
import { gainPoints } from "../../../engine/effects/primitives/gain-points";
import { createFoldAdapter, type IntentOutcome } from "../../../engine/fold/slice";
import { opponent, SIDES } from "../../../engine/state/ids";
import { syntheticId } from "../../../engine/testing/synthetic-cards";
import { parseEngineBattleFold, journeyBattleOf } from "../../../rules/battle/fold";
import { registerBattleInitProvider } from "../../../rules/battle/journey-battle";
import { reduceGameEvent } from "../../../rules/reducer";
import { GAME_ENGINE_CONFIG } from "../../../rules/replay/replay";
import { AVATAR_ID, BATTLE_SITE_ID, clearReplayFixtureProviders, fixtureBattleInitProvider, registerReplayFixtureProviders } from "../../../rules/replay/fixture-providers";
import { ctx, event as journeyEvent, GENESIS } from "../../../rules/journey/lifecycle-fixtures";
import type { FoldState } from "../../../rules/fold-state";
import { buildExplorationRuntime, resolveExplorationChoice } from "../../../session/providers/exploration-provider";
import { action, expectProviderCase, payload, journeyPatch } from "../../../session/providers/exploration-provider.fixtures";
import { makeAuguryTestCard, makeAuguryTestContent, makeAuguryTestDeckEntry, makeAuguryTestJourneyState, makeAuguryTestSite } from "../../../journey_v2/testing/fixtures";
import { SELECTION_RULES_VERSION } from "../../../reward-selection";
import { parseCardSubtype } from "../../../types/card-identity";
import { parseCardTypeChangePredicateId, parseDeckEntryId, parsePromptId } from "../../../types/identifiers";
import { testFoldHash, testJourneyMutationSource, testJourneySeed } from "../../../types/test-identities";
import type { BattleModifier } from "../../../types/journey";
import { createEngineBattleInit, engineDeckEntry, nextBattleEffects } from "../engine-battle-init";

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const characterId = syntheticId(0x63701), eventId = syntheticId(0x63702);
const definition = (cardType: "character" | "event", id: typeof characterId): EngineCardDefinition => ({
  id, cardType, costs: [energy(3)], spark: cardType === "character" ? 2 : null,
  subtype: parseCardSubtype(cardType === "character" ? "Mage" : ""), speed: "standard", status: "authored",
  abilities: variant => [event(chooseOne(gainPoints(variant.amplified ? 2 : 1), gainPoints(0)))],
});
const printed = [definition("character", characterId), definition("event", eventId)];
const engine = createEngine(createCatalog(printed, []));
const cards = printed.map((card, index) => makeAuguryTestCard({
  id: card.id, cardNumber: 63701 + index, cardType: card.cardType === "character" ? "Character" : "Event",
  energyCost: 3, spark: card.spark === null ? null : 2,
}));
const content = makeAuguryTestContent({ cards });
const entries = Array.from({ length: 40 }, (_, index) => makeAuguryTestDeckEntry({
  entryId: parseDeckEntryId(`opening-${index}`), cardNumber: index % 2 === 0 ? 63701 : 63702,
  ...(index % 4 === 2 ? { typeChange: { predicateId: parseCardTypeChangePredicateId("opening-type"), label: "", cardType: "Event" as const, subtype: parseCardSubtype("") }, transfiguration: "Amplified" as const, keywordModification: { energyCostReduction: 1 } } : {}),
  ...(index % 4 === 3 ? { typeChange: { predicateId: parseCardTypeChangePredicateId("opening-type"), label: "", cardType: "Character" as const, subtype: parseCardSubtype("Mage") }, transfiguration: "Amplified" as const } : {}),
}));
const modifiers = (kind: "opening_hand_bonus" | "opening_hand_event_draw", count = 2, battlesRemaining = 1): BattleModifier => ({
  kind, count, battlesRemaining, source: testJourneyMutationSource(`synthetic:${kind}`),
});
function init(battleModifiers: readonly BattleModifier[] = [], startingSide: Side = "player"): BattleInit {
  const journey = makeAuguryTestJourneyState({ deck: entries, avatar: null, dreamsigns: [], battleModifiers: [...battleModifiers] });
  return createEngineBattleInit({ seed: 637, scoreToWin: 100, startingSide, journey,
    enemy: { deck: entries.map(entry => content.cardDatabase.get(entry.cardNumber)!.id), avatar: null, dreamsigns: [] },
    cardDatabase: content.cardDatabase, transfigurationData: content.transfigurationData, minimumDeckSize: entries.length, dreamwell: [] });
}
function forSide(side: Side, effects: NonNullable<BattleInit["nextBattle"]>["player"]): BattleInit {
  const base = init([], side);
  return { ...base, decks: { player: base.decks.player, enemy: base.decks.player }, nextBattle: { [side]: effects } };
}
function opened(input: BattleInit) {
  let boundary: BattleState | undefined;
  const result = engine.createBattle(input, NO_PROMPTS, (state, step) => { if (step.kind === "beginBattle") boundary = state; });
  if (boundary === undefined) throw new Error("Missing public opening boundary");
  return { ...result, boundary };
}
function applied(result: IntentOutcome) {
  if (result.kind !== "applied" || result.error !== null) throw new Error("Expected successful engine fold");
  return result;
}
function reduce(state: FoldState, type: Parameters<typeof journeyEvent>[0], payload: Record<string, unknown> = {}, actor = "opening-a") {
  return reduceGameEvent(state, journeyEvent(type, payload, actor), ctx());
}
function reward(predicate?: "event", count = 2) {
  const primary = action(`opening-${predicate ?? "ordinary"}-${count}`, { effectKind: "next-battle-opening-hand", count, ...(predicate === undefined ? {} : { predicate }) });
  const site = makeAuguryTestSite({ type: "Exploration" });
  const source = { ...content, exploration: { foldHash: testFoldHash("opening"), customCards: [], customDreamsigns: [], encounters: [{ cardId: characterId, prose: "", actions: [primary] }] } };
  const journey = makeAuguryTestJourneyState({ deck: entries, avatar: null, dreamsigns: [] });
  const runtime = buildExplorationRuntime(journey, site, source, () => 0);
  if (runtime === null) throw new Error("Synthetic reward unavailable");
  const before = { ...journey, siteRuntime: { [site.id]: runtime } };
  const payload = { actionId: primary.id, selection: {}, selectionRulesVersion: SELECTION_RULES_VERSION };
  const after = resolveExplorationChoice({ journey: before, site, content: source, payload, seq: 1 });
  if (after === null) throw new Error("Synthetic reward refused");
  return { before, after, site, source, payload };
}

afterEach(clearReplayFixtureProviders);

describe("opening-hand public modification contracts", () => {
  it.each(["ordinary", "event"] as const)("carries the actual %s reward DTO through journey init and real dealing", kind => {
    const predicate = kind === "event" ? "event" : undefined;
    const { after } = reward(predicate);
    expect(after.battleModifiers).toMatchObject([{ kind: predicate === "event" ? "opening_hand_event_draw" : "opening_hand_bonus", count: 2, battlesRemaining: 1 }]);
    const input = init(after.battleModifiers), baseline = opened(init());
    expect(input.nextBattle).toEqual({ player: { openingHand: [{ count: 2, filter: predicate === "event" ? { cardType: "event" } : null }], startingEnergy: 0, smallerHandAndCostDiscount: [] } });
    const dealt = opened(input).boundary;
    const remaining = baseline.boundary.sides.player.deck;
    const expected = predicate === "event" ? remaining.filter(id => {
      const instance = baseline.boundary.instances[id];
      return instance.variant.deckMods?.typeChange?.cardType === "event" || (instance.printing.kind === "card" && instance.printing.cardId === eventId && instance.variant.deckMods?.typeChange == null);
    }).slice(0, 2) : remaining.slice(0, 2);
    expect(dealt.sides.player.hand).toEqual([...baseline.boundary.sides.player.hand, ...expected]);
    expect(dealt.sides.enemy).toEqual(baseline.boundary.sides.enemy);
    expect(dealt.sides.player.deck).toEqual(remaining.filter(id => !expected.includes(id)));
  });

  it.each(SIDES)("stacks ordinary before Event groups using physical current variants on %s", side => {
    const effects = nextBattleEffects([modifiers("opening_hand_event_draw", 2), modifiers("opening_hand_bonus", 2), modifiers("opening_hand_bonus", 1), modifiers("opening_hand_event_draw", 1), modifiers("opening_hand_bonus", 9, 0)]);
    expect(effects?.openingHand).toEqual([{ count: 2, filter: null }, { count: 1, filter: null }, { count: 2, filter: { cardType: "event" } }, { count: 1, filter: { cardType: "event" } }]);
    const base = forSide(side, undefined), baseline = opened(base).boundary;
    const input = forSide(side, effects ?? undefined), before = copy(input), out = opened(input);
    const ordinary = baseline.sides[side].deck.slice(0, 3), tail = baseline.sides[side].deck.slice(3);
    // Even copies remapped to Event qualify; printed Events remapped to Character do not.
    const events = tail.filter(id => {
      const card = baseline.instances[id];
      return card.variant.deckMods?.typeChange?.cardType === "event" || (card.printing.kind === "card" && card.printing.cardId === eventId && card.variant.deckMods?.typeChange == null);
    }).slice(0, 3);
    expect(events).toHaveLength(3);
    expect(out.boundary.sides[side].hand).toEqual([...baseline.sides[side].hand, ...ordinary, ...events]);
    expect(out.boundary.sides[side].deck).toEqual(tail.filter(id => !events.includes(id)));
    expect(out.boundary.sides[opponent(side)]).toEqual(baseline.sides[opponent(side)]);
    for (const id of out.boundary.sides[side].hand) expect(out.boundary.instances[id]).toEqual({ ...baseline.instances[id], zone: "hand", enteredZoneAt: out.boundary.instances[id].enteredZoneAt });
    const draws = out.events.flatMap(event => event.kind === "cardDrawn" && event.side === side ? [event.instance] : []);
    expect(new Set(draws).size).toBe(draws.length);
    expect(input).toEqual(before);
    expect(opened(copy(input))).toEqual(out);
  });

  it.each(SIDES)("limits filtered draws to eligible remaining copies without fatigue on %s", side => {
    const base = forSide(side, undefined), baseline = opened(base).boundary;
    const input = forSide(side, { openingHand: [{ count: 100, filter: { cardType: "event" } }], startingEnergy: 0, smallerHandAndCostDiscount: [] });
    const out = opened(input).boundary;
    expect(out.sides[side].fatigueCount).toBe(baseline.sides[side].fatigueCount);
    expect(out.sides[side].deck.length).toBeGreaterThan(0);
    expect(engine.view(out, side).sides[side].hand.count).toBe(out.sides[side].hand.length);
    for (const id of out.sides[side].hand.slice(baseline.sides[side].hand.length)) expect(engine.view(out, side).instances[id].characteristics.cardType).toBe("event");
    const noEvents = { ...input, decks: { player: Array.from({ length: 40 }, () => ({ cardId: characterId })), enemy: Array.from({ length: 40 }, () => ({ cardId: characterId })) } };
    expect(opened(noEvents).boundary.sides[side].hand).toHaveLength(opened({ ...noEvents, nextBattle: undefined }).boundary.sides[side].hand.length);
  });

  it.each(SIDES)("preserves dealt opening cards through payment, cancellation, reload and stale actors on %s", side => {
    const adapter = createFoldAdapter(engine);
    const input = forSide(side, { openingHand: [{ count: 100, filter: { cardType: "event" } }], startingEnergy: 6, smallerHandAndCostDiscount: [] });
    const start = applied(adapter.start(input));
    const card = start.slice.committed.sides[side].hand.find(id => start.slice.committed.instances[id].variant.amplified && start.slice.committed.instances[id].variant.deckMods?.typeChange?.cardType === "event");
    if (card === undefined) throw new Error("Missing amplified remapped Event");
    const seen = engine.view(start.slice.committed, side).instances[card];
    expect(seen.characteristics).toMatchObject({ cardType: "event", cost: 2 });
    expect(start.slice.committed.instances[card].printing).toEqual({ kind: "card", cardId: characterId });
    const before = copy(start.slice), intent = { kind: "battleAction", side, action: { kind: "play", card, from: "hand" } } as const;
    expect(adapter.reduce(start.slice, { ...intent, side: opponent(side) })).toMatchObject({ kind: "bounced", reason: "notYourDecision" });
    const playing = applied(adapter.reduce(start.slice, intent));
    const pending = adapter.pending(playing.slice);
    if (pending === null) throw new Error("Missing cancellable play choice");
    expect(pending.prompt.cancellable).toBe(true);
    expect(playing.slice.committed).toEqual(start.slice.committed);
    const saved = parseEngineBattleFold(copy({ init: input, slice: playing.slice }), engine.catalog);
    if (saved === null) throw new Error("Valid opening save refused");
    expect(adapter.pending(saved.slice)).toEqual(pending);
    expect(adapter.reduce(saved.slice, { kind: "answer", side, promptId: parsePromptId("999:0:0"), value: 0 })).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
    expect(adapter.reduce(saved.slice, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: 0 })).toMatchObject({ kind: "bounced", reason: "notYourPrompt" });
    expect(adapter.reduce(saved.slice, { kind: "answer", side, promptId: pending.prompt.id, value: 99 })).toMatchObject({ kind: "bounced", reason: "illegalAnswer" });
    const cancelled = applied(adapter.reduce(saved.slice, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(cancelled.slice.committed.sides[side]).toEqual(start.slice.committed.sides[side]);
    const retried = applied(adapter.reduce(cancelled.slice, intent)), again = adapter.pending(retried.slice);
    if (again === null) throw new Error("Retry unavailable");
    expect(again.prompt.id).not.toBe(pending.prompt.id);
    expect(adapter.reduce(retried.slice, { kind: "answer", side, promptId: pending.prompt.id, value: 0 })).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
    const answer = { kind: "answer", side, promptId: again.prompt.id, value: 0 } as const;
    const paid = applied(adapter.reduce(retried.slice, answer));
    expect(paid.slice.committed.sides[side].currentEnergy).toBe(start.slice.committed.sides[side].currentEnergy - 2);
    expect(paid.slice.committed.sides[side].score).toBe(2);
    expect(paid.slice.committed.instances[card].zone).toBe("void");
    expect(paid.slice.committed.instances[card].variant).toEqual(start.slice.committed.instances[card].variant);
    expect(adapter.reduce(paid.slice, answer).kind).toBe("bounced");
    expect(adapter.reduce(copy(retried.slice), answer)).toEqual(paid);
    expect(start.slice).toEqual(before);
    expect(printed.map(card => ({ id: card.id, type: card.cardType, costs: card.costs, spark: card.spark }))).toEqual([{ id: characterId, type: "character", costs: [energy(3)], spark: 2 }, { id: eventId, type: "event", costs: [energy(3)], spark: null }]);
  });

  it.each(["ordinary", "event"] as const)("refuses forged or stale %s rewards and logs a competing resolution once", kind => {
    const predicate = kind === "event" ? "event" : undefined;
    expectProviderCase({ name: "opening reward", primary: action(`contract-${predicate ?? "ordinary"}`, { effectKind: "next-battle-opening-hand", count: 2, ...(predicate === undefined ? {} : { predicate }) }),
      effect: (before, after) => expect(after.battleModifiers).toEqual([...before.battleModifiers, expect.objectContaining({ kind: predicate === "event" ? "opening_hand_event_draw" : "opening_hand_bonus", count: 2, battlesRemaining: 1 })]),
      forgeries: { version: payload({ selectionRulesVersion: "unsupported" }), staleEncounter: payload({ expectedEncounterCardId: eventId }), staleReroll: payload({ expectedRerollCount: 1 }), visited: journeyPatch(journey => ({ atlas: { ...journey.atlas, nodes: Object.fromEntries(Object.entries(journey.atlas.nodes).map(([key, node]) => [key, { ...node, sites: node.sites.map(site => ({ ...site, isVisited: true })) }])) } })) },
    });
    const r = reward(predicate), before = copy(r.before);
    expect(resolveExplorationChoice({ journey: r.after, site: r.site, content: r.source, payload: r.payload, seq: 2 })).toBeNull();
    expect(r.before).toEqual(before);
    for (const count of [0, -1, 0.5, Infinity]) {
      const invalid = { ...r.source, exploration: { ...r.source.exploration, encounters: r.source.exploration.encounters.map(encounter => ({ ...encounter, actions: encounter.actions.map(action => ({ ...action, count })) })) } };
      expect(resolveExplorationChoice({ journey: r.before, site: r.site, content: invalid, payload: r.payload, seq: 2 })).toBeNull();
      expect(r.before).toEqual(before);
    }
  });

  it("consumes opening rewards exactly once at victorious END_BATTLE and retains a multi-battle lifetime", () => {
    registerReplayFixtureProviders();
    const ordinary = reward().after.battleModifiers, filtered = reward("event").after.battleModifiers;
    const active = [...ordinary, ...filtered, modifiers("opening_hand_event_draw", 1, 2)];
    const base = fixtureBattleInitProvider();
    registerBattleInitProvider({ engine, beginBattle: request => {
      const result = base.beginBattle(request);
      return result === null ? null : { ...result, engineInit: { ...init(request.journey.battleModifiers), scoreToWin: 2, decks: { player: entries.map(entry => engineDeckEntry({ ...entry, cardNumber: 63702, typeChange: undefined, transfiguration: "Amplified", keywordModification: { energyCostReduction: 3 } }, cards[1], content.transfigurationData)), enemy: entries.map(() => ({ cardId: characterId })) } } };
    } });
    let state = GAME_ENGINE_CONFIG.genesisState({ ...GENESIS, seed: testJourneySeed("fixture-battle") });
    const started = reduce(state, "START_JOURNEY", { avatarId: AVATAR_ID });
    expect(started.outcome, started.bounceReason).toBe("applied");
    const entered = reduce(started.state, "ENTER_SITE", { siteId: BATTLE_SITE_ID });
    expect(entered.outcome, entered.bounceReason).toBe("applied");
    state = entered.state;
    state = { ...state, journey: { ...state.journey, battleModifiers: active } };
    const begun = reduce(state, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID });
    expect(begun.outcome, begun.bounceReason).toBe("applied");
    const battle = journeyBattleOf(begun.state.battle);
    if (battle === null) throw new Error("Missing journey engine battle");
    expect(battle.engine.init.nextBattle?.player?.openingHand).toHaveLength(3);
    expect(begun.state.journey.battleModifiers).toEqual(active);
    expect(reduce(begun.state, "END_BATTLE").outcome).toBe("bounced");
    const card = battle.engine.slice.committed.sides.player.hand[0];
    const playing = reduce(begun.state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } });
    const inFlight = journeyBattleOf(playing.state.battle)?.engine.slice;
    if (inFlight === undefined) throw new Error("Missing journey play");
    const pending = createFoldAdapter(engine).pending(inFlight);
    if (pending === null) throw new Error("Missing journey choice");
    const won = reduce(playing.state, "BATTLE_ANSWER", { side: "player", promptId: pending.prompt.id, value: 0 });
    expect(journeyBattleOf(won.state.battle)?.engine.slice.committed.result).toMatchObject({ kind: "victory", winner: "player" });
    const ended = reduce(won.state, "END_BATTLE", {}, "opening-b");
    expect(ended.outcome).toBe("applied");
    expect(ended.state.battle).toBeNull();
    expect(ended.state.journey.battleModifiers).toEqual([modifiers("opening_hand_event_draw", 1, 1)]);
    expect(init(ended.state.journey.battleModifiers).nextBattle?.player?.openingHand).toEqual([{ count: 1, filter: { cardType: "event" } }]);
    expect(reduce(ended.state, "END_BATTLE").outcome).toBe("bounced");
    expect(reduce(copy(won.state), "END_BATTLE", {}, "opening-b")).toEqual(ended);
    expect(won.state.journey.battleModifiers).toEqual(active);
  });
});
