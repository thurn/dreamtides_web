/** Public synthetic contracts; full real-content and encounter acceptance belongs to hv-umm2.288. */
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
import type { BattleModifier, DeckEntry, JourneyState } from "../../../types/journey";
import { createEngineBattleInit, engineDeckEntry, nextBattleEffects } from "../engine-battle-init";

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const characterId = syntheticId(0x63901), eventId = syntheticId(0x63902);
const tuning = { cost: 5, copies: 40, energy: 6, persistentReduction: 1, amplifiedPoints: 2 };
const definition = (cardType: "character" | "event", id: typeof characterId): EngineCardDefinition => ({
  id, cardType, costs: [energy(2), energy(3)], spark: cardType === "character" ? 2 : null,
  subtype: parseCardSubtype(cardType === "character" ? "Mage" : ""), speed: "standard", status: "authored",
  abilities: variant => [event(chooseOne(gainPoints(variant.amplified ? tuning.amplifiedPoints : 1), gainPoints(0)))],
});
const printed = [definition("character", characterId), definition("event", eventId)];
const engine = createEngine(createCatalog(printed, []));
const cards = printed.map((card, index) => makeAuguryTestCard({
  id: card.id, cardNumber: 63901 + index, cardType: card.cardType === "character" ? "Character" : "Event",
  energyCost: tuning.cost, spark: card.spark === null ? null : 2,
}));
const content = makeAuguryTestContent({ cards });
const typeChange = (cardType: "Character" | "Event") => ({
  predicateId: parseCardTypeChangePredicateId("smaller-type"), label: "", cardType,
  subtype: parseCardSubtype(cardType === "Character" ? "Mage" : ""),
});
const entries = Array.from({ length: tuning.copies }, (_, index) => makeAuguryTestDeckEntry({
  entryId: parseDeckEntryId(`smaller-${index}`), cardNumber: index % 2 === 0 ? 63901 : 63902,
  ...(index % 4 === 2 ? { typeChange: typeChange("Event"), transfiguration: "Amplified" as const, sparkBonus: 3, keywordModification: { energyCostReduction: tuning.persistentReduction, fast: true } } : {}),
  ...(index % 4 === 3 ? { typeChange: typeChange("Character"), transfiguration: "Amplified" as const, keywordModification: { energyCostReduction: 2 } } : {}),
}));
const payableEntries = entries.map(entry => ({ ...entry, cardNumber: 63901, transfiguration: "Amplified" as const,
  typeChange: typeChange("Event"), keywordModification: { energyCostReduction: tuning.persistentReduction } }));
const modifier = (battlesRemaining = 1): BattleModifier => ({ kind: "smaller_hand_and_cost_discount", openingHandDelta: -1,
  energyCostReduction: 1, battlesRemaining, source: testJourneyMutationSource("synthetic:smaller-hand") });
function init(battleModifiers: readonly BattleModifier[] = [], startingSide: Side = "player", deck: readonly DeckEntry[] = entries): BattleInit {
  return fromJourney(makeAuguryTestJourneyState({ deck: [...deck], avatar: null, dreamsigns: [], battleModifiers: [...battleModifiers] }), startingSide);
}
function fromJourney(journey: JourneyState, startingSide: Side = "player"): BattleInit {
  return createEngineBattleInit({ seed: 639, scoreToWin: 100, startingSide, journey: { ...journey, avatar: null, dreamsigns: [] },
    enemy: { deck: entries.map(entry => content.cardDatabase.get(entry.cardNumber)!.id), avatar: null, dreamsigns: [] },
    cardDatabase: content.cardDatabase, transfigurationData: content.transfigurationData, minimumDeckSize: tuning.copies, dreamwell: [] });
}
function forSide(side: Side, modifiers: readonly BattleModifier[], deck: readonly DeckEntry[] = entries, startingEnergy = 0): BattleInit {
  const base = init([], side, deck), effects = nextBattleEffects(modifiers);
  return { ...base, decks: { player: base.decks.player, enemy: base.decks.player },
    ...(effects === null ? {} : { nextBattle: { [side]: { ...effects, startingEnergy } } }) };
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
function reduce(state: FoldState, type: Parameters<typeof journeyEvent>[0], payload: Record<string, unknown> = {}, actor = "smaller-a") {
  return reduceGameEvent(state, journeyEvent(type, payload, actor), ctx());
}
function reward() {
  const primary = action("smaller-contract", { effectKind: "next-battle-smaller-hand-and-cost-discount" });
  const site = makeAuguryTestSite({ type: "Exploration" });
  const source = { ...content, exploration: { foldHash: testFoldHash("smaller"), customCards: [], customDreamsigns: [], encounters: [{ cardId: characterId, prose: "", actions: [primary] }] } };
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

describe("smaller-hand public modification contracts", () => {
  it("carries the actual reward DTO through real journey mapping, hand reduction and every dealt copy", () => {
    const r = reward(), input = init(r.after.battleModifiers), before = copy(r.before);
    expect(r.after.battleModifiers).toMatchObject([{ kind: "smaller_hand_and_cost_discount", openingHandDelta: -1, energyCostReduction: 1, battlesRemaining: 1 }]);
    const runtime = r.after.siteRuntime[r.site.id];
    expect(runtime?.kind === "exploration" ? runtime.resolution?.battleModifier : null).toEqual({ kind: "smaller-hand-and-cost-discount", openingHandDelta: -1, energyCostReduction: 1, battlesRemaining: 1 });
    expect(input.nextBattle).toEqual({ player: { openingHand: [], startingEnergy: 0, smallerHandAndCostDiscount: [{ openingHandDelta: -1, costReduction: 1 }] } });
    const baseline = opened(init()).boundary, dealt = opened(input).boundary;
    expect(dealt.sides.player.hand).toEqual(baseline.sides.player.hand.slice(0, -1));
    expect(dealt.sides.player.deck).toEqual([...baseline.sides.player.hand.slice(-1), ...baseline.sides.player.deck]);
    expect(dealt.sides.enemy).toEqual(baseline.sides.enemy);
    for (const id of [...dealt.sides.player.hand, ...dealt.sides.player.deck]) {
      expect(dealt.instances[id].variant.deckMods?.costReduction).toBe((baseline.instances[id].variant.deckMods?.costReduction ?? 0) + 1);
    }
    expect(r.before).toEqual(before);
    expect(r.after.deck).toEqual(r.before.deck);
  });

  it.each(SIDES)("stacks active hand deltas and all-deck discounts with persistent physical variants on %s", side => {
    const input = forSide(side, [modifier(), modifier(), modifier(0)]), before = copy(input);
    const baseline = opened(forSide(side, [])).boundary, result = opened(input), state = result.boundary;
    expect(state.sides[side].hand).toEqual(baseline.sides[side].hand.slice(0, -2));
    expect(state.sides[side].deck).toEqual([...baseline.sides[side].hand.slice(-2), ...baseline.sides[side].deck]);
    expect(state.sides[opponent(side)]).toEqual(baseline.sides[opponent(side)]);
    const physical = Object.values(state.instances).filter(card => card.owner === side);
    expect(physical).toHaveLength(tuning.copies);
    expect(new Set(physical.map(card => card.id)).size).toBe(tuning.copies);
    for (const instance of physical) {
      const original = baseline.instances[instance.id], mods = original.variant.deckMods;
      expect(instance.printing).toEqual(original.printing);
      expect(instance.variant).toMatchObject({ amplified: original.variant.amplified, deckMods: { costReduction: (mods?.costReduction ?? 0) + 2 } });
      expect(instance.variant.transfigurations ?? []).toEqual(original.variant.transfigurations ?? []);
      expect(instance.variant.deckMods?.typeChange ?? null).toEqual(mods?.typeChange ?? null);
      expect(instance.variant.deckMods?.sparkBonus).toBe(mods?.sparkBonus ?? 0);
      expect(instance.variant.deckMods?.fast).toBe(mods?.fast ?? false);
    }
    for (const id of state.sides[side].hand) {
      const original = baseline.instances[id], seen = engine.view(state, side).instances[id];
      expect(seen.characteristics.cost).toBe(tuning.cost - (original.variant.deckMods?.costReduction ?? 0) - 2);
      expect(seen.characteristics.cardType).toBe(original.variant.deckMods?.typeChange?.cardType ?? (original.printing.kind === "card" && original.printing.cardId === eventId ? "event" : "character"));
    }
    for (const instance of Object.values(baseline.instances).filter(card => card.owner === opponent(side))) expect(state.instances[instance.id]).toEqual({ ...instance, enteredZoneAt: state.instances[instance.id].enteredZoneAt });
    expect(input).toEqual(before);
    expect(opened(copy(input))).toEqual(result);
  });

  it.each(SIDES)("floors the reduced opening hand and card cost without fatigue on %s", side => {
    const base = opened(forSide(side, [])).boundary;
    const reductions = Array.from({ length: Math.max(base.sides[side].hand.length, tuning.cost) + 1 }, () => modifier());
    const state = opened(forSide(side, reductions)).boundary;
    expect(state.sides[side].hand).toEqual([]);
    expect(state.sides[side].deck).toEqual([...base.sides[side].hand, ...base.sides[side].deck]);
    expect(state.sides[side].fatigueCount).toBe(base.sides[side].fatigueCount);
    expect(state.sides[opponent(side)]).toEqual(base.sides[opponent(side)]);
    const payable = forSide(side, reductions, payableEntries, tuning.energy);
    // A public extra draw makes a zero-cost copy observable after the hand floor.
    const effects = payable.nextBattle?.[side];
    if (effects === undefined) throw new Error("Missing public next-battle effects");
    const start = applied(createFoldAdapter(engine).start({ ...payable, nextBattle: { [side]: { ...effects, openingHand: [{ count: 1, filter: null }] } } }));
    const card = start.slice.committed.sides[side].hand[0];
    expect(engine.view(start.slice.committed, side).instances[card].characteristics.cost).toBe(0);
    const adapter = createFoldAdapter(engine), play = applied(adapter.reduce(start.slice, { kind: "battleAction", side, action: { kind: "play", card, from: "hand" } }));
    const pending = adapter.pending(play.slice);
    if (pending === null) throw new Error("Missing zero-cost choice");
    const paid = applied(adapter.reduce(play.slice, { kind: "answer", side, promptId: pending.prompt.id, value: 0 }));
    expect(paid.slice.committed.sides[side].currentEnergy).toBe(start.slice.committed.sides[side].currentEnergy);
    expect(paid.slice.committed.sides[side].score).toBe(tuning.amplifiedPoints);
  });

  it.each(SIDES)("preserves persistent plus temporary payment through cancel, reload and competing inputs on %s", side => {
    const adapter = createFoldAdapter(engine), input = forSide(side, [modifier()], payableEntries, tuning.energy);
    const start = applied(adapter.start(input)), before = copy(start.slice), card = start.slice.committed.sides[side].hand[0];
    expect(engine.view(start.slice.committed, side).instances[card].characteristics).toMatchObject({ cardType: "event", cost: 3 });
    expect(start.slice.committed.instances[card]).toMatchObject({ printing: { kind: "card", cardId: characterId }, variant: { amplified: true, transfigurations: ["Amplified"], deckMods: { costReduction: 2, typeChange: { cardType: "event" } } } });
    const intent = { kind: "battleAction", side, action: { kind: "play", card, from: "hand" } } as const;
    expect(adapter.reduce(start.slice, { ...intent, side: opponent(side) })).toMatchObject({ kind: "bounced", reason: "notYourDecision" });
    const play = applied(adapter.reduce(start.slice, intent)), pending = adapter.pending(play.slice);
    if (pending === null) throw new Error("Missing cancellable payment");
    expect(play.slice.committed).toEqual(start.slice.committed);
    const saved = parseEngineBattleFold(copy({ init: input, slice: play.slice }), engine.catalog);
    if (saved === null) throw new Error("Valid pending save refused");
    expect(adapter.pending(saved.slice)).toEqual(pending);
    expect(adapter.reduce(saved.slice, { kind: "answer", side, promptId: parsePromptId("999:0:0"), value: 0 })).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
    expect(adapter.reduce(saved.slice, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: 0 })).toMatchObject({ kind: "bounced", reason: "notYourPrompt" });
    expect(adapter.reduce(saved.slice, { kind: "answer", side, promptId: pending.prompt.id, value: 99 })).toMatchObject({ kind: "bounced", reason: "illegalAnswer" });
    const cancelled = applied(adapter.reduce(saved.slice, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(cancelled.slice.committed).toEqual(start.slice.committed);
    const retry = applied(adapter.reduce(cancelled.slice, intent)), again = adapter.pending(retry.slice);
    if (again === null) throw new Error("Missing retried payment");
    expect(again.prompt.id).not.toBe(pending.prompt.id);
    expect(adapter.reduce(retry.slice, { kind: "answer", side, promptId: pending.prompt.id, value: 0 })).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
    const answer = { kind: "answer", side, promptId: again.prompt.id, value: 0 } as const, paid = applied(adapter.reduce(retry.slice, answer));
    expect(paid.slice.committed.sides[side].currentEnergy).toBe(start.slice.committed.sides[side].currentEnergy - 3);
    expect(paid.slice.committed.sides[side].score).toBe(tuning.amplifiedPoints);
    expect(paid.slice.committed.instances[card].zone).toBe("void");
    expect(paid.slice.committed.instances[card].variant).toEqual(start.slice.committed.instances[card].variant);
    expect(adapter.reduce(paid.slice, answer).kind).toBe("bounced");
    expect(adapter.reduce(copy(retry.slice), answer)).toEqual(paid);
    const next = paid.slice.committed.sides[side].hand[0];
    expect(engine.view(paid.slice.committed, side).instances[next].characteristics.cost).toBe(3);
    const second = applied(adapter.reduce(paid.slice, { ...intent, action: { kind: "play", card: next, from: "hand" } })), secondPrompt = adapter.pending(second.slice);
    if (secondPrompt === null) throw new Error("Missing second discounted play");
    const twice = applied(adapter.reduce(second.slice, { kind: "answer", side, promptId: secondPrompt.prompt.id, value: 0 }));
    expect(twice.slice.committed.sides[side].currentEnergy).toBe(start.slice.committed.sides[side].currentEnergy - 6);
    expect(twice.slice.committed.sides[side].score).toBe(2 * tuning.amplifiedPoints);
    expect(start.slice).toEqual(before);
    expect(input.decks[side]).toEqual(payableEntries.map(entry => engineDeckEntry(entry, cards[0], content.transfigurationData)));
    expect(printed.map(card => ({ id: card.id, cardType: card.cardType, costs: card.costs, spark: card.spark }))).toEqual([{ id: characterId, cardType: "character", costs: [energy(2), energy(3)], spark: 2 }, { id: eventId, cardType: "event", costs: [energy(2), energy(3)], spark: null }]);
  });

  it("refuses stale rewards and serializes competing reward resolutions exactly once", () => {
    expectProviderCase({ name: "smaller hand reward", primary: action("smaller-provider", { effectKind: "next-battle-smaller-hand-and-cost-discount" }),
      effect: (before, after) => expect(after.battleModifiers).toEqual([...before.battleModifiers, expect.objectContaining({ kind: "smaller_hand_and_cost_discount", openingHandDelta: -1, energyCostReduction: 1, battlesRemaining: 1 })]),
      forgeries: { version: payload({ selectionRulesVersion: "unsupported" }), staleEncounter: payload({ expectedEncounterCardId: eventId }), staleReroll: payload({ expectedRerollCount: 1 }), visited: journeyPatch(journey => ({ atlas: { ...journey.atlas, nodes: Object.fromEntries(Object.entries(journey.atlas.nodes).map(([key, node]) => [key, { ...node, sites: node.sites.map(site => ({ ...site, isVisited: true })) }])) } })) },
    });
    const r = reward(), before = copy(r.before);
    expect(resolveExplorationChoice({ journey: r.after, site: r.site, content: r.source, payload: r.payload, seq: 2 })).toBeNull();
    expect(r.before).toEqual(before);
  });

  it.each([1, 2])("consumes one victorious battle of a %i-battle discount while preserving permanent source entries", lifetime => {
    registerReplayFixtureProviders();
    const active = reward().after.battleModifiers.map(effect => ({ ...effect, battlesRemaining: lifetime }));
    const base = fixtureBattleInitProvider();
    registerBattleInitProvider({ engine, beginBattle: request => {
      const result = base.beginBattle(request);
      return result === null ? null : { ...result, engineInit: { ...fromJourney(request.journey), scoreToWin: tuning.amplifiedPoints,
        nextBattle: { player: { ...nextBattleEffects(request.journey.battleModifiers)!, startingEnergy: tuning.energy } } } };
    } });
    const started = reduce(GAME_ENGINE_CONFIG.genesisState({ ...GENESIS, seed: testJourneySeed("fixture-battle") }), "START_JOURNEY", { avatarId: AVATAR_ID });
    expect(started.outcome, started.bounceReason).toBe("applied");
    const entered = reduce(started.state, "ENTER_SITE", { siteId: BATTLE_SITE_ID });
    expect(entered.outcome, entered.bounceReason).toBe("applied");
    const source = { ...entered.state, journey: { ...entered.state.journey, deck: payableEntries, battleModifiers: active, resolvedPackage: null } }, sourceBefore = copy(source);
    const begun = reduce(source, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID });
    expect(begun.outcome, begun.bounceReason).toBe("applied");
    const battle = journeyBattleOf(begun.state.battle);
    if (battle === null) throw new Error("Missing journey engine battle");
    expect(battle.engine.init.nextBattle?.player?.smallerHandAndCostDiscount).toEqual([{ openingHandDelta: -1, costReduction: 1 }]);
    expect(begun.state.journey.battleModifiers).toEqual(active);
    expect(reduce(begun.state, "END_BATTLE").outcome).toBe("bounced");
    const card = battle.engine.slice.committed.sides.player.hand[0];
    expect(engine.view(battle.engine.slice.committed, "player").instances[card].characteristics.cost).toBe(3);
    const playing = reduce(begun.state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } });
    const inFlight = journeyBattleOf(playing.state.battle)?.engine.slice;
    if (inFlight === undefined) throw new Error("Missing journey payment");
    const pending = createFoldAdapter(engine).pending(inFlight);
    if (pending === null) throw new Error("Missing journey choice");
    const won = reduce(playing.state, "BATTLE_ANSWER", { side: "player", promptId: pending.prompt.id, value: 0 });
    expect(journeyBattleOf(won.state.battle)?.engine.slice.committed.result).toMatchObject({ kind: "victory", winner: "player" });
    const ended = reduce(won.state, "END_BATTLE", {}, "smaller-b");
    expect(ended.outcome, ended.bounceReason).toBe("applied");
    expect(ended.state.battle).toBeNull();
    expect(ended.state.journey.battleModifiers).toEqual(lifetime === 1 ? [] : active.map(effect => ({ ...effect, battlesRemaining: 1 })));
    expect(ended.state.journey.deck).toEqual(payableEntries);
    const next = fromJourney(ended.state.journey), fresh = opened(next).boundary;
    const permanentOnly = opened(init([], "player", payableEntries)).boundary;
    expect(fresh.sides.player.hand.length).toBe(permanentOnly.sides.player.hand.length - (lifetime === 1 ? 0 : 1));
    for (const id of fresh.sides.player.hand) expect(engine.view(fresh, "player").instances[id].characteristics.cost).toBe(lifetime === 1 ? 4 : 3);
    expect(reduce(ended.state, "END_BATTLE").outcome).toBe("bounced");
    expect(reduce(copy(won.state), "END_BATTLE", {}, "smaller-b")).toEqual(ended);
    expect(source).toEqual(sourceBefore);
  });
});
