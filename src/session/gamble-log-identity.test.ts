import { afterEach, beforeEach, expect, it } from "vitest";
import {
  getLogEntries,
  resetLog,
  setJourneyLogCapture,
  setLogContext,
} from "../logging";
import {
  logGamblePrepared,
  logGambleResolved,
  logGambleReplacement,
  logGambleSettled,
} from "../screens/cumulus_adapters/gamble-site-logging-view-model";
import {
  buildGambleSiteView,
  GAMBLE_SITE,
  GUIDE,
  GUIDE_LINE_SOURCE,
} from "../screens/cumulus_adapters/gamble-site-view-model.fixtures";
import { gambleFixture, testGambleSelectionTrace } from "../testing/gamble-fixture";
import { testJourneyState } from "../testing/journey-genesis";
import {
  parseDeckEntryId,
  parseGameId,
  parseShuffleCommitment,
} from "../types/identifiers";
import { testCardId, testCardName, testDreamsignId } from "../types/test-identities";
import type { CardData } from "../types/cards";
import type {
  BlackjackSiteRuntime,
  FourSuitRepriseSiteRuntime,
  GambleSiteRuntime,
} from "../types/journey";
import { createGameLogCapture, readGameLog } from "./game-log-capture";
import { LIMITS } from "./game-log-capture.fixtures";
import { createGameRepository } from "./game-repository";
import { createMemoryKeyValueStore } from "./key-value-store";

const RUN_ID = parseGameId("gambleidentity735");
const OTHER_RUN_ID = parseGameId("otheridentity735");
const CARD: CardData = {
  id: testCardId("gamble-log-target"),
  name: testCardName(),
  cardNumber: 735,
  cardType: "Character",
  subtype: "",
  isStarter: false,
  energyCost: 2,
  spark: 2,
  isFast: false,
  renderedText: "",
  imageNumber: 735,
  artOwned: false,
};
const SELECTED = parseDeckEntryId("target-735");
const COPIED = parseDeckEntryId("copy-735");
const COMMITMENT = parseShuffleCommitment("gamble-log-735");
const FOUR_SUIT: FourSuitRepriseSiteRuntime = {
  kind: "gamble",
  gameId: "four-suit-reprise",
  selectionTrace: testGambleSelectionTrace("four-suit-reprise"),
  isFarpoint: false,
  drawCost: 25,
  shuffleCommitments: [COMMITMENT],
  committedCards: [{ rank: "7", suit: "hearts" }],
  targets: [{
    entryId: SELECTED,
    cardId: CARD.id,
    cardNumber: CARD.cardNumber,
    cardSnapshot: CARD,
    transfigurationOffers: []
  }],
  rounds: [{
    roundNumber: 1,
    shuffleCommitment: COMMITMENT,
    card: { rank: "7", suit: "hearts" },
    targetEntryId: SELECTED,
    targetCardId: CARD.id,
    costPaid: 25,
    outcome: "duplication",
    resultRevealed: true,
    resultSettled: true,
    essenceGained: 0,
    duplicatedEntryId: COPIED
  }],
  phase: "result",
};
const BLACKJACK: BlackjackSiteRuntime = {
  kind: "gamble",
  gameId: "blackjack",
  selectionTrace: testGambleSelectionTrace("blackjack"),
  isFarpoint: false,
  wagerCost: 50,
  prizeEssence: 300,
  attemptNumber: 1,
  shuffleCommitment: COMMITMENT,
  committedDeck: [{ rank: "10", suit: "hearts" }, { rank: "9", suit: "clubs" }],
  deckCursor: 2,
  playerCards: [{ rank: "10", suit: "hearts" }],
  dealerCards: [{ rank: "9", suit: "clubs" }],
  dealerRevealed: true,
  wagerPaid: true,
  playerDecision: "stand",
  outcome: "player-win",
  resultSettled: true,
  essenceAwarded: 300,
};
const REWARD = {
  id: testDreamsignId("gamble-log-award"),
  name: "Fixture sign",
  effectDescription: ""
};
const REPLACED = testDreamsignId("gamble-log-replaced");
const OTHER_RUNTIMES: GambleSiteRuntime[] = [
  {
    kind: "gamble",
    gameId: "gravok-three-gate-wager",
    selectionTrace: testGambleSelectionTrace("gravok-three-gate-wager"),
    isFarpoint: false,
    wagerCost: 50,
    shuffleCommitment: COMMITMENT,
    committedCard: { rank: "Q", suit: "clubs" },
    dreamsignCandidateIds: [REWARD.id],
    rewardDreamsign: REWARD,
    result: {
      gateId: "jack",
      card: { rank: "Q", suit: "clubs" },
      won: true,
      essenceGained: 200,
      essenceSettled: true,
      dreamsignAwarded: true,
      pendingDreamsignReplacement: false
    },
  },
  {
    kind: "gamble",
    gameId: "tidemark-ladder-climb",
    selectionTrace: testGambleSelectionTrace("tidemark-ladder-climb"),
    isFarpoint: false,
    shuffleCommitments: [COMMITMENT],
    committedCards: [{ rank: "Q", suit: "clubs" }],
    dreamsignCandidateScores: [{ dreamsignId: REWARD.id, score: 1 }],
    strongPoolSize: 1,
    strongPoolCutoffScore: 1,
    rewardDreamsign: REWARD,
    revealedCards: [{ rank: "Q", suit: "clubs" }],
    cumulativeCost: 0,
    result: {
      attemptNumber: 1,
      card: { rank: "Q", suit: "clubs" },
      won: true,
      costPaid: 0,
      cumulativeCost: 0,
      resultSettled: true,
      dreamsignAwarded: true,
      pendingDreamsignReplacement: false
    },
  },
  {
    kind: "gamble",
    gameId: "starway-stairs",
    selectionTrace: testGambleSelectionTrace("starway-stairs"),
    roundNumber: 1,
    isFarpoint: false,
    wagerAmount: 30,
    shuffleCommitments: [COMMITMENT],
    committedCards: [{ rank: "Q", suit: "clubs" }],
    results: [{
      tierNumber: 1,
      card: { rank: "Q", suit: "clubs" },
      busted: false,
      resultSettled: true
    }],
    terminalReason: "cashed-out",
    prizeAwarded: 60,
  },
];

beforeEach(resetLog);
afterEach(resetLog);

it.each([FOUR_SUIT, BLACKJACK, ...OTHER_RUNTIMES])(
  "persists and exports run identity separately from $gameId",
  async (runtime) => {
    const store = createMemoryKeyValueStore();
    const repository = createGameRepository(store);
    const capture = createGameLogCapture(repository, RUN_ID, { ...LIMITS, now: () => 7 });
    setLogContext({ gameId: RUN_ID });
    setJourneyLogCapture(capture.capture);
    const state = testJourneyState("gamble-log-identity");
    state.siteRuntime[GAMBLE_SITE.id] = runtime;
    const view = buildGambleSiteView({
      state,
      site: GAMBLE_SITE,
      scene: null,
      guide: GUIDE,
      guideLine: GUIDE_LINE_SOURCE
    });
    if (view === null) {
      throw new Error("synthetic runtime must produce a view");
    }
    try {
      // Re-rendering the same state retains one record for each diagnostic.
      for (let render = 0; render < 2; render += 1) {
        logGamblePrepared(GAMBLE_SITE.id, runtime, view, gambleFixture());
        logGambleResolved(GAMBLE_SITE.id, runtime, view, gambleFixture());
        logGambleSettled(GAMBLE_SITE.id, runtime, view, gambleFixture());
      }
      const exported = await readGameLog(repository, capture);
      expect(exported).toEqual(getLogEntries().map((entry) => JSON.stringify(entry)));
      const records = exported.map(
        (line) => JSON.parse(line) as Record<string, unknown>,
      );
      expect(records.map((record) => record.event)).toEqual([
        "gamble_game_prepared",
        "gamble_wager_resolved",
        "gamble_wager_settled",
      ]);
      for (const record of records) {
        expect(record).toMatchObject({
          gameId: RUN_ID,
          gambleGameId: runtime.gameId,
          siteId: GAMBLE_SITE.id,
          gambleFoldHash: gambleFixture().foldHash,
          selectionTrace: runtime.selectionTrace
        });
      }
      if (runtime.gameId === "four-suit-reprise") {
        expect(records[1]).toMatchObject({
          selectedEntryId: SELECTED,
          selectedCardId: CARD.id,
          payment: 25,
          resolvedSuitOutcome: "duplication"
        });
        expect(records[2]).toMatchObject({
          selectedEntryId: SELECTED,
          selectedCardId: CARD.id,
          duplicatedEntryId: COPIED,
          finalEffect: "duplication"
        });
      } else if (runtime.gameId === "blackjack") {
        expect(records[1]).toMatchObject({ playerDecision: "stand", outcome: "player-win" });
        expect(records[2]).toMatchObject({
          wagerPayment: 50,
          essenceGained: 300,
          netEssenceChange: 250
        });
      }
      // Export reads persisted bytes, including after reopening the repository.
      expect(await createGameRepository(store).readLogLines(RUN_ID)).toEqual(exported);
      expect(await repository.readLogLines(OTHER_RUN_ID)).toEqual([]);
    } finally {
      setJourneyLogCapture(null);
      await capture.close();
    }
  },
);

it.each(["gravok-three-gate-wager", "tidemark-ladder-climb"] as const)(
  "retains run and Dreamsign identities when %s replaces a reward",
  async (gameId) => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const capture = createGameLogCapture(repository, RUN_ID, { ...LIMITS, now: () => 7 });
    setLogContext({ gameId: RUN_ID });
    setJourneyLogCapture(capture.capture);
    try {
      logGambleReplacement(GAMBLE_SITE.id, gameId, REPLACED, REWARD.id);
      logGambleReplacement(GAMBLE_SITE.id, gameId, REPLACED, REWARD.id);
      const exported = await readGameLog(repository, capture);
      expect(exported).toHaveLength(1);
      expect(exported).toEqual(await repository.readLogLines(RUN_ID));
      expect(JSON.parse(exported[0])).toMatchObject({
        event: "gamble_dreamsign_replaced",
        gameId: RUN_ID,
        gambleGameId: gameId,
        siteId: GAMBLE_SITE.id,
        replacedDreamsignId: REPLACED,
        awardedDreamsignId: REWARD.id,
      });
    } finally {
      setJourneyLogCapture(null);
      await capture.close();
    }
  },
);
