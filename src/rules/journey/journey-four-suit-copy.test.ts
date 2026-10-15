import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { createLocalLog } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig } from "../../eventlog/types";
import { parseCardName, parseCardSubtype } from "../../types/card-identity";
import { parseCardTypeChangePredicateId, parseDeckEntryId, parseIntentKey, parseShuffleCommitment } from "../../types/identifiers";
import { testCardId, testDreamsignId, testEventActor } from "../../types/test-identities";
import type { DeckEntry, FourSuitRepriseSiteRuntime } from "../../types/journey";
import { testGambleSelectionTrace } from "../../testing/gamble-fixture";
import { reduceGameEvent } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import type { FoldState } from "../fold-state";
import { ctx, event, GENESIS } from "./lifecycle-fixtures";
import { gambleStateWith, SITE_ID } from "./gamble/test-fixture";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyDeckEntry } from "./journey-deck-entry";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { registerSiteContentProvider } from "./sites";
import { testSiteContentProvider } from "./test-content-providers";

const A = parseDeckEntryId("selected-physical"), B = parseDeckEntryId("same-printing-other");
const COMMITMENT = parseShuffleCommitment("copy-round");
const CARD = testCardId("copy-printing"), BONUS = testDreamsignId("copy-warrior-bonus");
const card = makeAuguryTestCard({ id: CARD, cardNumber: 1, cardType: "Event", subtype: "", name: parseCardName("same fixture name") });
const modifiers = createJourneyModifierRegistry([journeyDeckEntry(BONUS, { kind: "warriorSpark", amount: 3 })]);
const plainModifiers = createJourneyModifierRegistry([]);
function fixture(held = false): FoldState {
  const target: DeckEntry = { entryId: A, cardNumber: 1, transfiguration: null, isBane: false, sparkBonus: 4,
    typeChange: { predicateId: parseCardTypeChangePredicateId("current-type"), cardType: "Character", subtype: parseCardSubtype("Warrior"), label: "" },
    keywordModification: { fast: true, reclaim: 2, setReclaim: 1, energyCostReduction: 1 }, statOverride: { spark: 91, energyCost: 9 } };
  const runtime: FourSuitRepriseSiteRuntime = { kind: "gamble", gameId: "four-suit-reprise", selectionTrace: testGambleSelectionTrace("four-suit-reprise"),
    isFarpoint: false, drawCost: 11, shuffleCommitments: [COMMITMENT], committedCards: [{ rank: "7", suit: "hearts" }],
    targets: [A, B].map(entryId => ({ entryId, cardId: CARD, cardNumber: 1, cardSnapshot: card, transfigurationOffers: [] })), rounds: [], phase: "choose" };
  return gambleStateWith(runtime, { essence: 200, deck: [target, { ...target, entryId: B, sparkBonus: 8 },
    { entryId: parseDeckEntryId("deck-10-0"), cardNumber: 2, transfiguration: null, isBane: false }],
    dreamsigns: held ? [{ id: BONUS, name: "same fixture name", effectDescription: "" }] : [] });
}
function apply(state: FoldState, type: Parameters<typeof event>[0], payload: Record<string, unknown>, held = false) {
  return reduceGameEvent(state, event(type, payload), ctx(), held ? modifiers : plainModifiers);
}
function runtime(state: FoldState) {
  const value = state.journey.siteRuntime[SITE_ID];
  if (value?.kind !== "gamble" || value.gameId !== "four-suit-reprise") throw new Error("missing runtime");
  return value;
}
function drawn(state = fixture(), held = false) {
  const result = apply(state, "DRAW_FOUR_SUIT_REPRISE", { siteId: SITE_ID, entryId: A }, held);
  expect(result.outcome).toBe("applied"); return result.state;
}
function copy(state: FoldState) {
  const id = runtime(state).rounds[0].duplicatedEntryId;
  const entry = state.journey.deck.find(item => item.entryId === id);
  if (entry === undefined) throw new Error("missing physical copy"); return entry;
}
beforeEach(() => {
  const provider = testSiteContentProvider();
  registerSiteContentProvider({ ...provider, gambleData: { ...provider.gambleData, games: provider.gambleData.games.map(game =>
    game.economy.kind !== "fourSuitReprise" || game.rules.kind !== "fourSuitReprise" ? game : { ...game, economy: game.economy, rules: { ...game.rules, outcomes: [
      { suit: "hearts", outcome: "duplication" }, { suit: "clubs", outcome: "purge" },
      { suit: "diamonds", outcome: "essence" }, { suit: "spades", outcome: "transfiguration" }] } }) } });
  registerJourneyTransfigurationProvider(createJourneyTransfigurationProvider(makeAuguryTestContent({ cards: [card,
    makeAuguryTestCard({ id: testCardId("collision-printing"), cardNumber: 2 })] })));
});
afterEach(clearGameProviders);

describe("Four-Suit current physical copy contract", () => {
  it("copies permanent values, excludes debug overrides and retains every original physical entry", () => {
    const paid = drawn();
    const result = apply(paid, "SETTLE_FOUR_SUIT_REPRISE", { siteId: SITE_ID, shuffleCommitment: COMMITMENT });
    expect(result.outcome).toBe("applied");
    const duplicated = copy(result.state), source = paid.journey.deck[0];
    expect(duplicated).toEqual({ entryId: duplicated.entryId, cardNumber: source.cardNumber, transfiguration: null, isBane: false,
      sparkBonus: source.sparkBonus, typeChange: source.typeChange, keywordModification: source.keywordModification });
    expect(new Set(result.state.journey.deck.map(entry => entry.entryId)).size).toBe(4);
    expect(paid.journey.deck.some(entry => entry.entryId === duplicated.entryId)).toBe(false);
    expect(result.state.journey.deck.slice(0, 3)).toEqual(paid.journey.deck);
    expect(result.state.journey.essence).toBe(189);
    expect(runtime(result.state).rounds[0]).toMatchObject({ outcome: "duplication", resultRevealed: true, resultSettled: true });
    expect(apply(result.state, "COMPLETE_SITE", { siteId: SITE_ID }).outcome).toBe("applied");
  });
  it("observes the copy's inherited effective Warrior type and grants its own added-card bonus once", () => {
    const paid = drawn(fixture(true), true);
    const result = apply(paid, "SETTLE_FOUR_SUIT_REPRISE", { siteId: SITE_ID, shuffleCommitment: COMMITMENT }, true);
    expect(result.outcome).toBe("applied");
    expect(copy(result.state).sparkBonus).toBe(7);
    expect(result.state.journey.deck.slice(0, 3)).toEqual(paid.journey.deck);
    expect(result.logRecords?.map(record => record.fields.target)).toEqual([{ siteIds: [SITE_ID],
      sparkChanges: [{ entryId: copy(result.state).entryId, cardId: CARD, before: 4, after: 7 }] }]);
    const retry = apply(result.state, "SETTLE_FOUR_SUIT_REPRISE", { siteId: SITE_ID, shuffleCommitment: COMMITMENT }, true);
    expect(retry.state).toBe(result.state); expect(retry.logRecords).toBeUndefined();
  });
  it("deduplicates and replays the paid copy and resumes its saved checkpoint without a second gain", () => {
    const initial = fixture(), config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial,
      reducer: (state, intent, context) => reduceGameEvent(state, intent, context, plainModifiers) };
    const options = { config, genesis: GENESIS, localActor: testEventActor("player"), devMode: false };
    const log = createLocalLog(options);
    log.append({ type: "DRAW_FOUR_SUIT_REPRISE", payload: { siteId: SITE_ID, entryId: A } });
    const intentKey = parseIntentKey("settle-copy-once"), payload = { siteId: SITE_ID, shuffleCommitment: COMMITMENT };
    const seq = log.append({ type: "SETTLE_FOUR_SUIT_REPRISE", payload, intentKey });
    expect(log.append({ type: "SETTLE_FOUR_SUIT_REPRISE", payload, intentKey })).toBe(seq);
    expect(copy(log.state()).sparkBonus).toBe(4); expect(log.state().journey.essence).toBe(189);
    expect(foldEvents(config, GENESIS, { seq: 0, state: initial }, [...log.events()]).state).toEqual(log.state());
    const reopened = createLocalLog({ ...options, base: { ...log.checkpoint(), state: GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(log.state())) }, history: [...log.events()] });
    expect(reopened.append({ type: "SETTLE_FOUR_SUIT_REPRISE", payload, intentKey })).toBe(seq);
    expect(reopened.state()).toEqual(log.state());
  });
});
