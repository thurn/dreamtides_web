import { afterEach, describe, expect, it } from "vitest";
import { instanceCard } from "../../../engine/catalog";
import { energy } from "../../../engine/dsl/builders";
import { createEngine } from "../../../engine/engine";
import type { BattleInit, BattleState } from "../../../engine/state/types";
import type { Side } from "../../../engine/state/ids";
import { NO_PROMPTS } from "../../../engine/steps/sources";
import { SYNTHETIC, syntheticId, testCatalog } from "../../../engine/testing/synthetic-cards";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../../journey_v2/testing/fixtures";
import { journeyBattleOf } from "../../../rules/battle/fold";
import { pendingEnginePrompt } from "../../../rules/battle/engine-battle";
import { registerBattleCompletionProvider, registerBattleInitProvider } from "../../../rules/battle/journey-battle";
import { genesisFoldState, type FoldState } from "../../../rules/fold-state";
import { ctx, event, GENESIS } from "../../../rules/journey/lifecycle-fixtures";
import { reduceGameEvent } from "../../../rules/reducer";
import { AVATAR_ID, BATTLE_SITE_ID, FIXTURE_ENGINE, FIXTURE_POINTS_CARD_ID, FIXTURE_POINTS_MODE, fixtureBattleInitProvider, registerReplayFixtureProviders } from "../../../rules/replay/fixture-providers";
import { SELECTION_RULES_VERSION } from "../../../reward-selection";
import { buildExplorationRuntime, resolveExplorationChoice } from "../../../session/providers/exploration-provider";
import { clearGameProviders } from "../../../session/providers/register-game-providers";
import { testJourneyState } from "../../../testing/journey-genesis";
import { EVENT_CARD_SUBTYPE } from "../../../types/card-identity";
import { parseDeckEntryId, parseSiteId } from "../../../types/identifiers";
import type { DeckEntry, JourneyState, SiteState } from "../../../types/journey";
import { testExplorationActionId, testJourneySeed } from "../../../types/test-identities";
import type { GameEvent, EventContext } from "../../../eventlog/types";
import { createEngineBattleInit, engineDeckEntry } from "../engine-battle-init";

const paidEvent = { ...SYNTHETIC.event1, id: syntheticId(0x63801), costs: [energy(2)] };
const character = makeAuguryTestCard({ id: SYNTHETIC.vanilla2.id, cardNumber: 63801, energyCost: 2, spark: 2 });
const eventCard = makeAuguryTestCard({ id: paidEvent.id, cardNumber: 63802, energyCost: 2, cardType: "Event", subtype: EVENT_CARD_SUBTYPE, spark: null });
const victoryCard = makeAuguryTestCard({ id: FIXTURE_POINTS_CARD_ID, cardNumber: 63803, energyCost: 0, cardType: "Event", subtype: EVENT_CARD_SUBTYPE, spark: null });
const content = makeAuguryTestContent({ cards: [character, eventCard, victoryCard] });
const engine = createEngine(testCatalog([paidEvent]));
const other = (side: Side): Side => side === "player" ? "enemy" : "player";
const entry = (cardNumber = character.cardNumber, transfiguration: DeckEntry["transfiguration"] = null): DeckEntry => ({
  entryId: parseDeckEntryId(`energy:${cardNumber}:${transfiguration ?? "base"}`), cardNumber, transfiguration, isBane: false,
});

function offer(journey: JourneyState, count: number, index = 0) {
  const site: SiteState = { id: parseSiteId(`energy-site:${index}`), type: "Exploration", isVisited: false, isEnhanced: false };
  const action = { id: testExplorationActionId(`energy-action:${index}`), label: "", effectKind: "next-battle-starting-energy" as const, count };
  const local = { ...content, exploration: { ...content.exploration, encounters: [{ cardId: character.id, prose: "", actions: [action] }] } };
  const runtime = buildExplorationRuntime(journey, site, local, () => 0, character.id);
  return { site, content: local, seq: index + 1, journey: runtime === null ? journey : { ...journey, siteRuntime: { ...journey.siteRuntime, [site.id]: runtime } },
    payload: { actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION, selection: {} } };
}

function rewarded(journey: JourneyState, count: number, index = 0): JourneyState {
  const request = offer(journey, count, index), before = structuredClone(request.journey);
  const result = resolveExplorationChoice(request);
  expect(request.journey).toEqual(before);
  if (result === null) throw new Error("Synthetic energy reward refused");
  return result;
}

function init(journey: JourneyState, side: Side = "player", cardDatabase = content.cardDatabase, opponentCard = character.id): BattleInit {
  const projected = createEngineBattleInit({ seed: 638, scoreToWin: 25, startingSide: side, journey,
    enemy: { deck: Array.from({ length: 12 }, () => opponentCard), avatar: null, dreamsigns: [] }, cardDatabase,
    transfigurationData: content.transfigurationData, minimumDeckSize: 12, dreamwell: [] });
  // Journey rewards address the player. Enemy coverage explicitly seats that public DTO and complete deck.
  return side === "player" ? projected : { ...projected, decks: { player: projected.decks.enemy, enemy: projected.decks.player },
    ...(projected.nextBattle === undefined ? {} : { nextBattle: { enemy: projected.nextBattle.player } }) };
}

function energies(state: BattleState, side: Side) {
  return { current: state.sides[side].currentEnergy, max: state.sides[side].maxEnergy };
}

function apply(state: FoldState, type: GameEvent["type"], payload: Record<string, unknown> = {}, context: EventContext = ctx()) {
  return reduceGameEvent(state, event(type, payload), context);
}

function accepted(state: FoldState, type: GameEvent["type"], payload: Record<string, unknown> = {}): FoldState {
  const result = apply(state, type, payload);
  expect(result.outcome).toBe("applied");
  return result.state;
}

function board(state: FoldState) {
  const battle = journeyBattleOf(state.battle);
  if (battle === null) throw new Error("Missing synthetic journey battle");
  return battle.engine.slice.committed;
}

function battle(side: Side) {
  registerReplayFixtureProviders();
  let state = accepted(genesisFoldState({ ...GENESIS, seed: testJourneySeed("fixture-battle") }), "START_JOURNEY", { avatarId: AVATAR_ID });
  state = accepted(state, "ENTER_SITE", { siteId: BATTLE_SITE_ID });
  const journey = rewarded({ ...state.journey, avatar: null, dreamsigns: [], resolvedPackage: null, deck: [entry(victoryCard.cardNumber)] }, 2);
  state = { ...state, journey: rewarded(journey, 3, 1) };
  const metadata = fixtureBattleInitProvider();
  registerBattleInitProvider({ engine: FIXTURE_ENGINE, beginBattle(input) {
    const start = metadata.beginBattle(input);
    return start === null ? null : { ...start, engineInit: { ...init(input.journey, side, content.cardDatabase, victoryCard.id), startingSide: "player", scoreToWin: 1 } };
  } });
  return accepted(state, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID });
}

function victory(state: FoldState) {
  const physical = board(state).sides.player.hand[0];
  let next = accepted(state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card: physical, from: "hand" } });
  const pending = pendingEnginePrompt(next.battle, FIXTURE_ENGINE);
  if (pending === null) throw new Error("Missing actual points-mode prompt");
  next = accepted(next, "BATTLE_ANSWER", { side: "player", promptId: pending.prompt.id, value: FIXTURE_POINTS_MODE });
  expect(board(next).result).toMatchObject({ kind: "victory", winner: "player" });
  return next;
}

afterEach(clearGameProviders);

describe("starting energy through public reward, engine and journey boundaries", () => {
  it.each([2, 3])("starts with isolated reward %s as current and maximum before opening completion", count => {
    const journey = rewarded({ ...testJourneyState(), deck: [entry()] }, count), before = structuredClone(journey);
    expect(journey.battleModifiers).toMatchObject([{ kind: "starting_energy_bonus", count, battlesRemaining: 1 }]);
    const input = init(journey);
    expect(input.nextBattle?.enemy).toBeUndefined();
    const started = engine.createBattle(input, NO_PROMPTS);
    expect(energies(started.state, "player")).toEqual({ current: count, max: count });
    expect(energies(started.state, "enemy")).toEqual({ current: 0, max: 0 });
    const energyIndex = started.events.findIndex(e => e.kind === "energyChanged" && e.side === "player" && e.current === count && e.max === count);
    const completed = started.events.flatMap((e, index) => e.kind === "openingHandCompleted" ? [index] : []);
    expect(energyIndex).toBeGreaterThanOrEqual(0);
    expect(completed).toHaveLength(2);
    expect(completed.every(index => index > energyIndex)).toBe(true);
    expect(journey).toEqual(before);
  });

  it("adds active rewards, ignores exhausted lifetimes and leaves unrelated modifier kinds out of energy", () => {
    const once = rewarded({ ...testJourneyState(), deck: [entry()] }, 2);
    const stacked = rewarded(once, 3, 1);
    const started = engine.createBattle(init(stacked), NO_PROMPTS);
    expect(energies(started.state, "player")).toEqual({ current: 5, max: 5 });
    const expired = { ...stacked, battleModifiers: stacked.battleModifiers.map(modifier => ({ ...modifier, battlesRemaining: 0 })) };
    expect(init(expired).nextBattle).toBeUndefined();
    const unrelated: JourneyState = { ...once, battleModifiers: [{ kind: "reward_reduction_flat", amount: 9, battlesRemaining: 1, source: once.battleModifiers[0].source }] };
    expect(energies(engine.createBattle(init(unrelated), NO_PROMPTS).state, "player")).toEqual({ current: 0, max: 0 });
  });

  for (const side of ["player", "enemy"] as const) for (const card of [character, eventCard]) for (const form of [null, "Amplified"] as const) {
    it(`pays the real discounted ${card.cardType} cost for ${side} with ${form ?? "base"} entry`, () => {
      const subject = { ...entry(card.cardNumber, form), keywordModification: { energyCostReduction: 1 } };
      const journey = rewarded({ ...testJourneyState(), deck: [subject] }, 2);
      const printed = structuredClone([card, character, eventCard]), input = init(journey, side);
      expect(input.decks[side][0]).toEqual(engineDeckEntry(subject, card, content.transfigurationData));
      const start = engine.createBattle(input, NO_PROMPTS), physical = start.state.sides[side].hand[0];
      const instance = start.state.instances[physical];
      expect(instance).toMatchObject({ owner: side, controller: side, printing: { kind: "card", cardId: card.id }, variant: { amplified: form === "Amplified", deckMods: { costReduction: 1 } } });
      expect(instanceCard(engine.catalog, instance)).toMatchObject({ cardType: card.cardType === "Character" ? "character" : "event", costs: [energy(1)] });
      expect(energies(start.state, side)).toEqual({ current: 2, max: 2 });
      expect(energies(start.state, other(side))).toEqual({ current: 0, max: 0 });
      expect(Object.values(start.state.instances).filter(i => i.owner === other(side)).every(i => !i.variant.amplified && i.variant.deckMods === undefined)).toBe(true);
      const play = { kind: "play", card: physical, from: "hand" } as const;
      const paid = engine.apply(start.state, side, play, NO_PROMPTS);
      expect(paid.events).toContainEqual(expect.objectContaining({ kind: "energyChanged", side, current: 1, max: 2, change: -1, maxChange: 0, cause: "payment" }));
      expect(energies(paid.state, side)).toEqual({ current: 1, max: 2 });
      const dropped = engine.createBattle({ ...input, nextBattle: undefined }, NO_PROMPTS);
      const unpaid = dropped.state.sides[side].hand[0];
      expect(energies(dropped.state, side)).toEqual({ current: 0, max: 0 });
      expect(engine.legalActions(dropped.state, side).some(action => action.kind === "play" && action.card === unpaid)).toBe(false);
      expect(() => engine.apply(dropped.state, side, { kind: "play", card: unpaid, from: "hand" }, NO_PROMPTS)).toThrow();
      expect([card, character, eventCard]).toEqual(printed);
    });
  }

  it("refuses stale, malformed and already resolved rewards without a partial grant, then accepts the valid offer", () => {
    const request = offer({ ...testJourneyState(), deck: [entry()] }, 2), before = structuredClone(request.journey);
    for (const patch of [{ actionId: testExplorationActionId("foreign-energy-action") }, { selectionRulesVersion: "stale" },
      { expectedEncounterCardId: eventCard.id }, { expectedRerollCount: 1 }]) {
      expect(resolveExplorationChoice({ ...request, payload: { ...request.payload, ...patch } })).toBeNull();
      expect(request.journey).toEqual(before);
    }
    for (const count of [0, -1, 0.5]) {
      const invalid = offer(request.journey, count);
      expect(resolveExplorationChoice(invalid)).toBeNull();
      expect(invalid.journey.battleModifiers).toEqual(before.battleModifiers);
    }
    expect(resolveExplorationChoice({ ...request, site: { ...request.site, isVisited: true } })).toBeNull();
    const after = resolveExplorationChoice(request);
    if (after === null) throw new Error("Valid energy offer refused");
    expect(resolveExplorationChoice(request)).toEqual(after);
    expect(resolveExplorationChoice({ ...request, journey: after })).toBeNull();
    expect(after.battleModifiers).toHaveLength(before.battleModifiers.length + 1);
  });

  it("fails an incomplete card mapping atomically and starts from the intact reward after recovery", () => {
    const journey = rewarded({ ...testJourneyState(), deck: [entry(), entry(eventCard.cardNumber)] }, 2), before = structuredClone(journey);
    const incomplete = new Map(content.cardDatabase);
    incomplete.delete(eventCard.cardNumber);
    expect(() => init(journey, "player", incomplete)).toThrow();
    expect(journey).toEqual(before);
    expect(energies(engine.createBattle(init(journey), NO_PROMPTS).state, "player")).toEqual({ current: 2, max: 2 });
  });

  it.each(["player", "enemy"] as const)("consumes %s-seated rewards only at an actual victorious END_BATTLE", side => {
    const started = battle(side), modifiers = structuredClone(started.journey.battleModifiers);
    expect(energies(board(started), side)).toEqual({ current: 5, max: 5 });
    expect(energies(board(started), other(side))).toEqual({ current: 0, max: 0 });
    expect(apply(started, "END_BATTLE").state).toBe(started);
    expect(started.journey.battleModifiers).toEqual(modifiers);
    const terminal = victory(started), before = structuredClone(terminal);
    expect(terminal.journey.battleModifiers).toEqual(modifiers);
    registerBattleCompletionProvider({ advanceAtlas: () => null });
    expect(apply(terminal, "END_BATTLE").state).toBe(terminal);
    expect(terminal).toEqual(before);
    registerReplayFixtureProviders();
    const reloaded = accepted(terminal, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(terminal.journey)), battle: JSON.parse(JSON.stringify(terminal.battle)) });
    const ended = accepted(reloaded, "END_BATTLE");
    expect(ended.battle).toBeNull();
    expect(ended.journey.battleModifiers).toEqual([]);
    expect(apply(ended, "END_BATTLE").state).toBe(ended);
    expect(accepted(terminal, "END_BATTLE")).toEqual(ended);
    const next = FIXTURE_ENGINE.createBattle(init(ended.journey, side), NO_PROMPTS);
    expect(energies(next.state, side)).toEqual({ current: 0, max: 0 });
    const longer = { ...terminal, journey: { ...terminal.journey, battleModifiers: modifiers.map(modifier => ({ ...modifier, battlesRemaining: 2 })) } };
    const retained = accepted(longer, "END_BATTLE");
    expect(retained.journey.battleModifiers).toEqual(modifiers);
    expect(energies(FIXTURE_ENGINE.createBattle(init(retained.journey, side), NO_PROMPTS).state, side)).toEqual({ current: 5, max: 5 });
  });

  it("keeps startup energy through cancel, reload and stale/wrong-side play answers", () => {
    const started = battle("player"), physical = board(started).sides.player.hand[0];
    const play = { side: "player", action: { kind: "play", card: physical, from: "hand" } };
    const pending = accepted(started, "BATTLE_ACTION", play), prompt = pendingEnginePrompt(pending.battle, FIXTURE_ENGINE);
    if (prompt === null) throw new Error("Missing actual cancellable play prompt");
    expect(accepted(started, "BATTLE_ACTION", play)).toEqual(pending);
    const cancelled = accepted(pending, "BATTLE_CANCEL", { side: "player", promptId: prompt.prompt.id });
    expect(energies(board(cancelled), "player")).toEqual({ current: 5, max: 5 });
    expect(cancelled.journey.battleModifiers).toEqual(started.journey.battleModifiers);
    const loaded = accepted(cancelled, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(cancelled.journey)), battle: JSON.parse(JSON.stringify(cancelled.battle)) });
    const retried = accepted(loaded, "BATTLE_ACTION", play), current = pendingEnginePrompt(retried.battle, FIXTURE_ENGINE);
    if (current === null) throw new Error("Missing retried play prompt");
    expect(current.prompt.id).not.toBe(prompt.prompt.id);
    for (const payload of [{ side: "player", promptId: prompt.prompt.id, value: FIXTURE_POINTS_MODE },
      { side: "enemy", promptId: current.prompt.id, value: FIXTURE_POINTS_MODE }]) expect(apply(retried, "BATTLE_ANSWER", payload).state).toBe(retried);
    const answer = { side: "player", promptId: current.prompt.id, value: FIXTURE_POINTS_MODE };
    const terminal = accepted(retried, "BATTLE_ANSWER", answer);
    expect(apply(terminal, "BATTLE_ANSWER", answer).state).toBe(terminal);
    expect(terminal.journey.battleModifiers).toEqual(started.journey.battleModifiers);
    expect(energies(board(terminal), "player")).toEqual({ current: 5, max: 5 });
  });
});
