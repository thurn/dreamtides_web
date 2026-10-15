import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineConfig, EventContext } from "../../eventlog/types";
import type { FourSuitRepriseSiteRuntime } from "../../types/journey";
import type { FoldState } from "../fold-state";
import { parseDeckEntryId, parseShuffleCommitment, parseIntentKey, parseClientId, parseGameId, parseCardTypeChangePredicateId, type DreamsignId } from "../../types/identifiers";
import { parseCardSubtype } from "../../types/card-identity";
import { testCardId, testDreamsignId, testEventActor } from "../../types/test-identities";
import { makeAuguryTestCard } from "../../journey_v2/testing/fixtures";
import { testGambleSelectionTrace } from "../../testing/gamble-fixture";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "./lifecycle-fixtures";
import { registerDeckContentProvider } from "./deck";
import { registerSiteContentProvider } from "./sites";
import { testSiteContentProvider } from "./test-content-providers";
import { createJourneyModifierRegistry, journeyModifierRegistry as registry, type JourneyModifierDefinition } from "./modifier-registry";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import { createGameRepository } from "../../session/game-repository";
import { createMemoryKeyValueStore } from "../../session/key-value-store";
import { createLocalGame, openLocalGame } from "../../session/local-game";
import { createJourneySaveFile, serializeJourneySaveFile, parseJourneySaveFile } from "../../state/journey-save-files";
import { journeyPurge } from "./journey-purge";
import { gambleStateWith, SITE_ID } from "./gamble/test-fixture";

const SHIELD = testDreamsignId("committed-shield"), FRUIT = testDreamsignId("committed-fruit"), OTHER = testDreamsignId("same-name-other");
// Explicit synthetic catalog replaces only the registry export for this test module.
// The real canonical codec body, reducer and local-game storage remain unchanged.
vi.mock("./modifier-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./modifier-registry")>();
  const { journeyPurge } = await import("./journey-purge");
  const { journeyEssence } = await import("./journey-essence");
  const { testDreamsignId } = await import("../../types/test-identities");
  return { ...actual, journeyModifierRegistry: actual.createJourneyModifierRegistry([
    journeyPurge(testDreamsignId("committed-shield"), { kind: "preventPurge" }),
    journeyEssence(testDreamsignId("committed-fruit"), { kind: "purgedCardEssence", amount: 7 }),
  ]) };
});
const A = parseDeckEntryId("locked-a"), B = parseDeckEntryId("same-printing-b"), C = parseDeckEntryId("different-c");
const commitment = parseShuffleCommitment("committed-round-1");
const sign = (id: DreamsignId) => ({ id, name: "same fixture name", effectDescription: "" });
function fixture(suit: "clubs" | "hearts" | "diamonds" | "spades" = "clubs", held = [SHIELD, FRUIT]) {
  const card = makeAuguryTestCard({ id: testCardId("locked-printing"), cardNumber: 1 });
  const targets = [A, B, C].map((entryId, index) => ({ entryId, cardId: index < 2 ? card.id : testCardId("other-printing"), cardNumber: index < 2 ? 1 : 2,
    cardSnapshot: index < 2 ? card : { ...card, id: testCardId("other-printing"), cardNumber: 2 },
    transfigurationOffers: [{ entryId, type: "Empowered" as const, effectDetails: {}, previewCard: card, essenceCost: 0 }] }));
  const runtime: FourSuitRepriseSiteRuntime = { kind: "gamble", gameId: "four-suit-reprise", selectionTrace: testGambleSelectionTrace("four-suit-reprise"),
    isFarpoint: false, drawCost: 25, shuffleCommitments: [commitment, parseShuffleCommitment("round-2"), parseShuffleCommitment("round-3")],
    committedCards: [{ rank: "7", suit }, { rank: "3", suit: "diamonds" }, { rank: "4", suit: "hearts" }], targets, rounds: [], phase: "choose" };
  return gambleStateWith(runtime, { dreamsigns: held.map(sign), deck: targets.map(target => ({ entryId: target.entryId, cardNumber: target.cardNumber,
    transfiguration: null, isBane: false, sparkBonus: 4, statOverride: { energyCost: 2 }, keywordModification: { fast: true },
    typeChange: { predicateId: parseCardTypeChangePredicateId("fixture-type"), cardType: "Character", subtype: parseCardSubtype("Warrior"), label: "fixture" } })) });
}
function apply(state: FoldState, type: Parameters<typeof event>[0], payload: Record<string, unknown>, context: EventContext = ctx()) {
  return reduceGameEvent(state, event(type, payload), context, registry);
}
const settlePayload = { siteId: SITE_ID, shuffleCommitment: commitment };
function draw(state = fixture()) { const result = apply(state, "DRAW_FOUR_SUIT_REPRISE", { siteId: SITE_ID, entryId: A }); expect(result.outcome).toBe("applied"); return result.state; }
function registerGamble(purgeSuit: "clubs" | "hearts" = "clubs") {
  const provider = testSiteContentProvider();
  registerSiteContentProvider({ ...provider, gambleData: { ...provider.gambleData,
    games: provider.gambleData.games.map(game => game.rules.kind !== "fourSuitReprise" ? game : { ...game,
      economy: { kind: "fourSuitReprise", standardDrawPrice: 25, enhancedDrawPrice: 15, essenceReward: 100 },
      rules: { kind: "fourSuitReprise", standardDeckSize: 52, maxRounds: 3, matchingSuitCardCount: 13,
        outcomes: [{ suit: "clubs", outcome: purgeSuit === "clubs" ? "purge" : "duplication" },
          { suit: "hearts", outcome: purgeSuit === "hearts" ? "purge" : "duplication" },
          { suit: "diamonds", outcome: "essence" }, { suit: "spades", outcome: "transfiguration" }] } }) } });
}
function runtime(state: FoldState) {
  const value = state.journey.siteRuntime[SITE_ID];
  if (value?.kind !== "gamble" || value.gameId !== "four-suit-reprise") throw new Error("missing fixture runtime");
  return value;
}
function settled(state = draw()) {
  const result = apply(state, "SETTLE_FOUR_SUIT_REPRISE", settlePayload);
  expect(result.outcome).toBe("applied"); return result.state;
}
function editRound(state: FoldState, change: Record<string, unknown>) {
  const value = runtime(state);
  return { ...state, journey: { ...state.journey, siteRuntime: { ...state.journey.siteRuntime,
    [SITE_ID]: { ...value, rounds: [{ ...value.rounds[0], ...change }] } } } };
}
beforeEach(() => { registerGamble(); registerDeckContentProvider({ resolveCardNumber: () => 1, resolveDreamsign: sign }); });
afterEach(() => { registerSiteContentProvider(null); registerDeckContentProvider(null); });
describe("committed Four-Suit purge protection", () => {
  it("settles the paid locked Clubs result and permits completion while retaining its exact deck", () => {
    const drawn = draw();
    const result = apply(drawn, "SETTLE_FOUR_SUIT_REPRISE", settlePayload);
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.deck).toEqual(drawn.journey.deck);
    expect(result.state.journey.essence).toBe(175);
    expect(result.state.journey.siteRuntime[SITE_ID]).toMatchObject({ rounds: [{ resultRevealed: true, resultSettled: true }] });
    expect(apply(result.state, "COMPLETE_SITE", { siteId: SITE_ID }).outcome).toBe("applied");
  });
  it("attributes one prevention, preserves all physical copies and permits a paid next round", () => {
    const drawn = draw(fixture("clubs", [OTHER, SHIELD, SHIELD, FRUIT]));
    const random = vi.fn(() => 0);
    const out = apply(drawn, "SETTLE_FOUR_SUIT_REPRISE", { ...settlePayload, dreamsignId: OTHER, heldIndex: 99 }, ctx({ rng: random }));
    expect(out.outcome).toBe("applied"); if (out.outcome !== "applied") throw new Error("expected settlement");
    expect(out.purges).toEqual([]); expect(random).not.toHaveBeenCalled();
    expect(out.logRecords).toEqual([{ event: "journey_purge_prevented", fields: {
      eventType: "SETTLE_FOUR_SUIT_REPRISE", siteId: SITE_ID, shuffleCommitment: commitment,
      dreamsignId: SHIELD, heldIndex: 1, entryId: A, cardId: testCardId("locked-printing") } }]);
    expect(out.state.journey.deck).toEqual(drawn.journey.deck);
    expect(runtime(out.state).rounds[0]).toEqual({ ...runtime(drawn).rounds[0], resultRevealed: true,
      resultSettled: true, purgePreventedBy: { dreamsignId: SHIELD, heldIndex: 1 } });
    const again = apply(out.state, "PLAY_AGAIN_FOUR_SUIT_REPRISE", { siteId: SITE_ID, previousShuffleCommitment: commitment });
    expect(again.outcome).toBe("applied"); expect(again.state.journey.essence).toBe(175);
    expect(apply(again.state, "DRAW_FOUR_SUIT_REPRISE", { siteId: SITE_ID, entryId: B }).state).toBe(again.state);
    const next = apply(again.state, "DRAW_FOUR_SUIT_REPRISE", { siteId: SITE_ID, entryId: C });
    expect(next.outcome).toBe("applied"); expect(next.state.journey.essence).toBe(150);
    expect(apply(next.state, "SETTLE_FOUR_SUIT_REPRISE", settlePayload).state).toBe(next.state);
  });
  it.each(["gained", "lost"])("uses settlement-time protection when it is %s", (change) => {
    const drawn = draw(fixture("clubs", change === "gained" ? [FRUIT] : [SHIELD, FRUIT]));
    const sourceChange = apply(drawn, change === "gained" ? "ADD_DREAMSIGN" : "REMOVE_DREAMSIGN", { dreamsignId: SHIELD });
    expect(sourceChange.outcome).toBe("applied");
    const out = apply(sourceChange.state, "SETTLE_FOUR_SUIT_REPRISE", settlePayload);
    expect(out.outcome).toBe("applied"); if (out.outcome !== "applied") throw new Error("expected settlement");
    expect(out.purges).toEqual(change === "lost" ? [{ entryId: A, cardId: testCardId("locked-printing") }] : []);
    expect(out.state.journey.deck.map(entry => entry.entryId)).toEqual(change === "lost" ? [B, C] : [A, B, C]);
    expect(out.state.journey.essence).toBe(change === "lost" ? 182 : 175);
  });
  it.each([{ held: [] }, { held: [OTHER, FRUIT] }])("really purges without a registered source: $held", ({ held }) => {
    const out = apply(draw(fixture("clubs", held)), "SETTLE_FOUR_SUIT_REPRISE", settlePayload);
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck.map(entry => entry.entryId)).toEqual([B, C]);
    expect(runtime(out.state).rounds[0].purgePreventedBy).toBeUndefined();
  });
  it("uses configured purge outcome rather than a fixed playing-card suit", () => {
    registerGamble("hearts");
    const protectedResult = settled(draw(fixture("hearts")));
    expect(protectedResult.journey.deck).toHaveLength(3);
    expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(protectedResult))).toEqual(protectedResult);
    const duplicated = settled(draw(fixture("clubs")));
    expect(duplicated.journey.deck).toHaveLength(4);
    expect(runtime(duplicated).rounds[0].purgePreventedBy).toBeUndefined();
  });
  it.each(["diamonds", "hearts", "spades"] as const)("preserves the other authored %s outcome", suit => {
    const revealed = settled(draw(fixture(suit)));
    expect(runtime(revealed).rounds[0].purgePreventedBy).toBeUndefined();
    if (suit === "diamonds") { expect(revealed.journey.essence).toBe(275); expect(revealed.journey.deck).toHaveLength(3); }
    if (suit === "hearts") expect(revealed.journey.deck).toHaveLength(4);
    if (suit === "spades") {
      expect(runtime(revealed).rounds[0].resultSettled).toBe(false);
      expect(apply(revealed, "COMPLETE_SITE", { siteId: SITE_ID }).outcome).toBe("bounced");
      const chosen = apply(revealed, "CHOOSE_FOUR_SUIT_REPRISE_TRANSFIGURATION", { ...settlePayload, type: "Empowered" });
      expect(chosen.outcome).toBe("applied"); expect(chosen.state.journey.deck[0].transfiguration).toBe("Empowered");
    }
  });
  it("rejects malformed/stale/partner intents without changing the committed paid state", () => {
    const drawn = draw();
    for (const payload of [{}, { ...settlePayload, siteId: "missing" }, { ...settlePayload, shuffleCommitment: "wrong" },
      { ...settlePayload, shuffleCommitment: null }, { ...settlePayload, siteId: 12 }]) {
      const out = apply(drawn, "SETTLE_FOUR_SUIT_REPRISE", payload);
      expect(out.state).toBe(drawn); expect(out.logRecords).toBeUndefined();
    }
    for (const context of [ctx({ intervening: "unknown" }), ctx({ intervening: [{ seq: 1, actor: testEventActor("partner"), type: "REMOVE_DREAMSIGN" }] })]) {
      expect(apply(drawn, "SETTLE_FOUR_SUIT_REPRISE", settlePayload, context).state).toBe(drawn);
    }
    const done = settled(drawn);
    const retry = apply(done, "SETTLE_FOUR_SUIT_REPRISE", settlePayload);
    expect(retry.state).toBe(done); expect(retry.logRecords).toBeUndefined();
  });
  it("retains historical prevention through source loss, deck changes, portable LOAD and canonical checkpoint decoding", () => {
    const done = settled();
    const lost = apply(done, "REMOVE_DREAMSIGN", { dreamsignId: SHIELD }); expect(lost.outcome).toBe("applied");
    const removed = apply(lost.state, "REMOVE_DECK_ENTRY", { entryId: A }); expect(removed.outcome).toBe("applied");
    const historical = removed.state;
    const save = parseJourneySaveFile(serializeJourneySaveFile(createJourneySaveFile("fixture", historical.journey)));
    const loaded = apply(done, "LOAD_STATE", { snapshot: save.journeyState });
    expect(loaded.outcome).toBe("applied"); expect(runtime(loaded.state).rounds).toEqual(runtime(done).rounds);
    expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(historical))).toEqual(historical);
    const legacy = editRound(done, { purgePreventedBy: undefined });
    const cleanLegacy = JSON.parse(GAME_ENGINE_CONFIG.encode(legacy)) as FoldState;
    expect(apply(done, "LOAD_STATE", { snapshot: cleanLegacy.journey }).outcome).toBe("applied");
    expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(cleanLegacy))).toEqual(cleanLegacy);
  });
  it.each([
    { purgePreventedBy: null }, { purgePreventedBy: [] }, { purgePreventedBy: { dreamsignId: "bad", heldIndex: 0 } },
    { purgePreventedBy: { dreamsignId: OTHER, heldIndex: 0 } }, { purgePreventedBy: { dreamsignId: FRUIT, heldIndex: 0 } },
    { purgePreventedBy: { dreamsignId: SHIELD, heldIndex: -1 } }, { purgePreventedBy: { dreamsignId: SHIELD, heldIndex: 0.5 } },
    { outcome: "essence" }, { resultRevealed: false }, { resultSettled: false }, { essenceGained: 7 },
    { duplicatedEntryId: B }, { chosenTransfiguration: "Empowered" }, { targetEntryId: "missing" },
    { targetCardId: testCardId("wrong") }, { shuffleCommitment: "wrong" }, { roundNumber: 2 },
    { card: { rank: "Q", suit: "clubs" } }, { card: null },
  ])("rejects malformed historical receipt on both actual intake paths: %j", patch => {
    const done = settled(), malformed = editRound(done, patch);
    expect(apply(done, "LOAD_STATE", { snapshot: malformed.journey }).state).toBe(done);
    expect(() => GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(malformed))).toThrow();
  });
  it("rejects malformed committed arrays carrying a present receipt at both intake paths", () => {
    const done = settled(), value = runtime(done);
    for (const change of [{ rounds: { purgePreventedBy: value.rounds[0].purgePreventedBy } }, { rounds: { 0: value.rounds[0] } }, { committedCards: [] }, { shuffleCommitments: [] },
      { targets: [] }, { committedCards: [{ rank: "invalid", suit: "invalid" }] }]) {
      const malformed = { ...done, journey: { ...done.journey, siteRuntime: { [SITE_ID]: { ...value, ...change } } } };
      expect(apply(done, "LOAD_STATE", { snapshot: malformed.journey }).state).toBe(done);
      expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(malformed))).toThrow();
    }
  });
  it("replays and deduplicates settlement through local-log checkpoint continuation", () => {
    const initial = fixture(), config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial };
    const options = { config, genesis: GENESIS, localActor: testEventActor("player"), now: () => ctx().timestamp, devMode: false };
    const log = createLocalLog(options), records: LocalLogRecord<FoldState>[] = [];
    log.subscribe(record => records.push(record));
    log.append({ type: "DRAW_FOUR_SUIT_REPRISE", payload: { siteId: SITE_ID, entryId: A } });
    const key = parseIntentKey("settle-paid-round");
    const appliedSeq = log.append({ type: "SETTLE_FOUR_SUIT_REPRISE", payload: settlePayload, intentKey: key });
    expect(log.append({ type: "SETTLE_FOUR_SUIT_REPRISE", payload: settlePayload, intentKey: key })).toBe(appliedSeq);
    expect(records.flatMap(record => record.logRecords ?? []).filter(record => record.event === "journey_purge_prevented")).toHaveLength(1);
    expect(foldEvents(config, GENESIS, { seq: 0, state: initial }, [...log.events()]).state).toEqual(log.state());
    const reopened = createLocalLog({ ...options, base: { ...log.checkpoint(), state: GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(log.state())) }, history: [...log.events()] });
    expect(reopened.append({ type: "SETTLE_FOUR_SUIT_REPRISE", payload: settlePayload, intentKey: key })).toBe(appliedSeq);
    expect(reopened.state()).toEqual(log.state());
  });
  it("reopens real persisted paid and settled states, recovering a malformed checkpoint from preserved events", async () => {
    const initial = fixture(), config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial };
    const store = createMemoryKeyValueStore(), repository = createGameRepository(store), gameId = parseGameId("committed-purge");
    const options = { checkpointInterval: 1, now: () => 0, eventClock: () => ctx().timestamp };
    let game = await createLocalGame(repository, config, { gameId, genesis: GENESIS, localPlayerId: parseClientId("player") }, options);
    game.log.append({ type: "DRAW_FOUR_SUIT_REPRISE", payload: { siteId: SITE_ID, entryId: A } }); await game.close();
    const paid = await openLocalGame(repository, config, gameId, options); if (paid === null) throw new Error("missing persisted game"); game = paid;
    expect(game.opened.checkpointRejected).toBe(false); expect(runtime(game.log.state()).rounds[0].resultSettled).toBe(false);
    game.log.append({ type: "SETTLE_FOUR_SUIT_REPRISE", payload: settlePayload }); await game.close();
    const expected = game.log.state();
    const good = await openLocalGame(repository, config, gameId, options); if (good === null) throw new Error("missing settled game");
    expect(good.log.state()).toEqual(expected); expect(good.opened.checkpointRejected).toBe(false); await good.close();
    const key = `game/${gameId}/checkpoint`, checkpoint = await store.get(key) as Record<string, unknown>;
    const malformed = editRound(expected, { resultSettled: false });
    await store.putAll([[key, { ...checkpoint, state: config.encode(malformed), stateHash: config.hash(malformed) }]]);
    const recovered = await openLocalGame(repository, config, gameId, options); if (recovered === null) throw new Error("missing recovered game");
    expect(recovered.opened.checkpointRejected).toBe(true); expect(recovered.log.state()).toEqual(expected); await recovered.close();
  });

  it("contains a later observer error without partially settling, then retries the original committed result", () => {
    let fail = true;
    const OBSERVER = testDreamsignId("later-observer"), observer = vi.fn<JourneyModifierDefinition["afterJourneyEvent"]>(({ eventType }) => {
      if (eventType === "SETTLE_FOUR_SUIT_REPRISE" && fail) throw new Error("synthetic observer failure after domain");
      return null;
    });
    const modifiers = createJourneyModifierRegistry([journeyPurge(SHIELD, { kind: "preventPurge" }), { dreamsignId: OBSERVER, afterJourneyEvent: observer }]);
    const initial = fixture("clubs", [SHIELD, OBSERVER]);
    const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial,
      reducer: (state, intent, context) => reduceGameEvent(state, intent, context, modifiers) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: testEventActor("player"), devMode: false });
    const records: LocalLogRecord<FoldState>[] = []; log.subscribe(record => records.push(record));
    log.append({ type: "DRAW_FOUR_SUIT_REPRISE", payload: { siteId: SITE_ID, entryId: A } });
    const paid = log.state();
    log.append({ type: "SETTLE_FOUR_SUIT_REPRISE", payload: settlePayload });
    expect(records[1].bounceReason).toBe("fold_error"); expect(records[1].logRecords).toBeUndefined(); expect(log.state()).toBe(paid);
    fail = false; log.append({ type: "SETTLE_FOUR_SUIT_REPRISE", payload: settlePayload });
    expect(records[2].outcome).toBe("applied"); expect(log.state().journey.deck).toEqual(paid.journey.deck);
    expect(records[2].logRecords?.map(record => record.event)).toEqual(["journey_purge_prevented"]);
  });

});
