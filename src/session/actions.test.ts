import { testJourneySeed } from "../types/test-identities";
import { testEventActor } from "../types/test-identities";
import { testJourneyMutationSource } from "../types/test-identities";
// Facade contract test for the game actions facade.
//
// Bug class guarded: facade/event drift. Every named action creator must
// produce an event whose `type` EXISTS in the rules-layer event union
// (`KNOWN_EVENT_TYPES`) and which the root reducer ROUTES to a real domain case
// rather than the unknown-type fallback. A renamed event type — or a creator
// that quietly stops matching the union — would silently break the screen that
// calls it; this test fails loudly instead.
//
// The test is table-driven over EVERY creator: each is invoked once with
// minimal valid args against a prepared `FoldState`, the appended draft is
// captured, and we assert (a) its type is known, and (b) folding it through
// `GAME_ENGINE_CONFIG` yields a defined outcome without throwing (poison
// containment) — i.e. it is not a bounce-caused-by-unknown-type. A bounce
// caused by invalid-in-state is acceptable and expected for many creators
// against genesis; the contract is about routing, not applicability.
//
// Data-resilient per AGENTS.md: coverage is asserted against the live
// `KNOWN_EVENT_TYPES` set (derived from events.ts), never a hardcoded list.

import { describe, expect, it } from "vitest";
import type { EventDraft } from "../eventlog/local-log";
import { foldEvents } from "../eventlog/fold";
import type { GameEvent, Genesis } from "../eventlog/types";
import { NIGHTMARE_CARD_ID } from "../data/nightmare";
import { isKnownEventType, KNOWN_EVENT_TYPES } from "../rules/events";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import { makeActions } from "./actions";
import { SELECTION_RULES_VERSION } from "../reward-selection";
import { parseBattleId } from "../types/identifiers";
import { parsePresentationId } from "../types/identifiers";
import { parseSiteId } from "../types/identifiers";
import { parseAtlasNodeId } from "../types/identifiers";
import { parseDeckEntryId } from "../types/identifiers";
import { parseShuffleCommitment } from "../types/identifiers";
import { parseBattleCardId } from "../types/identifiers";
import { parseNoteId, parsePromptId } from "../types/identifiers";
import { parseJourneyId } from "../types/identifiers";
import { parseTutorialRunId } from "../types/identifiers";
import { parseCardTutorialScreenKey } from "../types/identifiers";
import { parseIntentKey } from "../types/identifiers";
import { parseFrontDoorActionId } from "../types/identifiers";
import { parseChoiceId, parseOfferId } from "../types/identifiers";
import { parseStableDigest } from "../types/stable-digest";
import { testCardId, testAvatarId, testDreamsignId, testExplorationActionId, testTutorialActionId } from "../types/test-identities";
import { TEST_CONTENT_CONFIG } from "../testing/journey-genesis";

const AUGURY_DECLINE = {
  encounterSignature: parseStableDigest("a".repeat(64)),
  offerId: parseOfferId("offer-1"),
};

const GENESIS: Genesis = {
  seed: testJourneySeed("actions-test-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};

/** Promote a captured draft into the committed-event shape the fold expects. */
function draftToEvent(draft: EventDraft, seq: number): GameEvent {
  return {
    type: draft.type,
    payload: draft.payload,
    actor: draft.actor ?? testEventActor("c-test"),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    // basedOnSeq = seq - 1 keeps the intervening window empty (clear), so a
    // bounce can only come from an unknown type or invalid-in-state — never a
    // spurious CAS bounce that would mask a routing regression.
    basedOnSeq: seq - 1,
  };
}

/**
 * Invoke every creator exactly once with minimal valid args, capturing the
 * draft each one appends. The recording append returns a monotonic seq so the
 * creators that read the resolved seq still work.
 */
function captureAllDrafts(): EventDraft[] {
  const drafts: EventDraft[] = [];
  let seq = 0;
  const actions = makeActions((draft) => {
    drafts.push(draft);
    seq += 1;
    return Promise.resolve(seq);
  });

  // One call per creator. Minimal args; values are placeholders — the contract
  // is about the event type + routing, not the payload's game meaning.
  void actions.frontDoorAction("main", parseFrontDoorActionId("new-journey"));
  void actions.advanceFrontDoor("loading", parseJourneyId("journey-1"));
  void actions.beginTutorial([], {
    intentKey: parseIntentKey("tutorial:journey-1:begin"),
  });
  void actions.completeTutorialAction(
    parseTutorialRunId("event:1"),
    testTutorialActionId("welcome"),
  );
  void actions.takePlaytestControl(null);
  void actions.beginTutorialBattle(parseTutorialRunId("event:1"));
  void actions.restartTutorialBattle(parseBattleId("tutorial-battle:event:1:0"));
  void actions.exitTutorialBattle(
    parseBattleId("tutorial-battle:event:1:1:client-b"),
  );
  void actions.openCardTutorialGuidance(
    parseCardTutorialScreenKey("journey:1:site:site-1"),
    [testCardId("card-1")],
  );
  void actions.completeCardTutorialGuidance(
    parsePresentationId("card-tutorial:journey:1:site:site-1:card-1:support"),
    parseCardTutorialScreenKey("journey:1:site:site-1"),
  );
  void actions.changeEssence(1);
  void actions.setEssence(1);
  void actions.setMaxDreamsigns(1);
  void actions.startJourney({});
  void actions.resetJourney();
  void actions.loadState({});
  void actions.selectAvatar(testAvatarId("dc-1"));
  void actions.rerollAvatarOffer();
  void actions.enterSite(parseSiteId("site-1"));
  void actions.travelToDreamscape(parseAtlasNodeId("node-1"));
  void actions.regenerateAtlas();
  void actions.dismissStartingDeckPopup();
  void actions.addCard({ cardId: testCardId("card-1") });
  void actions.removeDeckEntry(parseDeckEntryId("entry-1"));
  void actions.purgeDeckCards(parseSiteId("site-1"), [parseDeckEntryId("entry-1")]);
  void actions.duplicateDeckEntry(parseDeckEntryId("entry-1"));
  void actions.setDeckEntryStatOverride(parseDeckEntryId("entry-1"), null);
  void actions.setDeckEntryKeywords(parseDeckEntryId("entry-1"), null);
  void actions.setDeckEntryType(parseDeckEntryId("entry-1"), null);
  void actions.transfigureCard(parseDeckEntryId("entry-1"), null);
  void actions.acceptTransfigurationChoice(
    parseSiteId("site-1"),
    parseDeckEntryId("entry-1"),
  );
  void actions.acceptDuplicationChoice(
    parseSiteId("site-1"),
    parseDeckEntryId("entry-1"),
  );
  void actions.purgeAllNightmareCards();
  void actions.purgeRandomNightmareCards(1);
  void actions.addDreamsign(testDreamsignId("ds-1"));
  void actions.removeDreamsign(testDreamsignId("ds-1"));
  void actions.setDreamsignPool([testDreamsignId("ds-1")]);
  void actions.setDraftState({});
  void actions.pickDraftCard(0, testCardId("card-1"));
  void actions.rerollDraftOffer(parseSiteId("site-1"));
  void actions.enterDraftSite(parseSiteId("site-1"));
  void actions.openSite(parseSiteId("site-1"));
  void actions.chooseRandomSite(parseSiteId("site-1"), "Shop");
  void actions.resolveExplorationChoice(
    parseSiteId("site-1"),
    testExplorationActionId("action-1"),
    {
      entryIds: [parseDeckEntryId("entry-1")],
    },
  );
  void actions.completeAugury(parseSiteId("site-1"));
  void actions.acceptReward(parseSiteId("site-1"));
  void actions.acceptDreamsignOffer(parseSiteId("site-1"), testDreamsignId("ds-1"));
  void actions.rejectDreamsignOffer(parseSiteId("site-1"));
  void actions.acceptEssence(parseSiteId("site-1"));
  void actions.rerollAugury(parseSiteId("site-1"));
  void actions.forceAuguryArchetype(
    parseSiteId("site-1"),
    "fit_card_grant",
  );
  void actions.completeSite(parseSiteId("site-1"));
  void actions.placeGravokWager(parseSiteId("site-1"), "six");
  void actions.settleGravokWager(
    parseSiteId("site-1"),
    parseShuffleCommitment("commitment-1"),
  );
  void actions.playAgainGravokWager(
    parseSiteId("site-1"),
    parseShuffleCommitment("commitment-1"),
  );
  void actions.replaceGravokWagerDreamsign(
    parseSiteId("site-1"),
    testDreamsignId("ds-1"),
  );
  void actions.drawTidemarkLadderClimb(parseSiteId("site-1"));
  void actions.settleTidemarkLadderClimb(
    parseSiteId("site-1"),
    parseShuffleCommitment("commitment-1"),
  );
  void actions.replaceTidemarkLadderClimbDreamsign(
    parseSiteId("site-1"),
    testDreamsignId("ds-1"),
  );
  void actions.drawStarwayStairs(parseSiteId("site-1"));
  void actions.settleStarwayStairs(
    parseSiteId("site-1"),
    parseShuffleCommitment("commitment-1"),
  );
  void actions.cashOutStarwayStairs(
    parseSiteId("site-1"),
    parseShuffleCommitment("commitment-1"),
  );
  void actions.playAgainStarwayStairs(
    parseSiteId("site-1"),
    parseShuffleCommitment("commitment-1"),
  );
  void actions.drawFourSuitReprise(
    parseSiteId("site-1"),
    parseDeckEntryId("entry-1"),
  );
  void actions.settleFourSuitReprise(
    parseSiteId("site-1"),
    parseShuffleCommitment("commitment-1"),
  );
  void actions.chooseFourSuitRepriseTransfiguration(
    parseSiteId("site-1"),
    parseShuffleCommitment("commitment-1"),
    "Empowered",
  );
  void actions.playAgainFourSuitReprise(
    parseSiteId("site-1"),
    parseShuffleCommitment("commitment-1"),
  );
  void actions.dealBlackjack(parseSiteId("site-1"));
  void actions.hitBlackjack(parseSiteId("site-1"));
  void actions.standBlackjack(parseSiteId("site-1"));
  void actions.settleBlackjack(
    parseSiteId("site-1"),
    parseShuffleCommitment("commitment-1"),
  );
  void actions.playAgainBlackjack(
    parseSiteId("site-1"),
    parseShuffleCommitment("commitment-1"),
  );
  void actions.acceptAuguryOffer(parseSiteId("site-1"), {
    ...AUGURY_DECLINE,
    archetypeId: "fit_card_grant",
  });
  void actions.declineAugury(parseSiteId("site-1"), AUGURY_DECLINE);
  void actions.buyShopSlot(parseSiteId("site-1"), 0);
  void actions.rerollShop(parseSiteId("site-1"));
  void actions.grantFreeRerolls(1);
  void actions.applyShopDiscount(10);
  void actions.pushBattleModifier({});
  void actions.pushTemporaryNightmareGrant({
    cardId: NIGHTMARE_CARD_ID,
    count: 1,
    battlesRemaining: 1,
    source: testJourneyMutationSource("test"),
  });
  void actions.banSiteType("Shop", 1);
  void actions.boostSiteAppearance("Shop", 10, 1);
  void actions.replaceSiteType(parseAtlasNodeId("node-1"), "Shop", "Battle");
  void actions.addSiteToDreamscape(parseAtlasNodeId("node-1"), "Shop");
  void actions.setCardSourceDebug(null);
  void actions.endBattle();
  void actions.beginBattle(parseSiteId("site-1"));
  void actions.setBattleAutomation(true);
  void actions.battleCommand({});
  void actions.battleRepositionCharacter(parseBattleCardId("battle-card-1"), {
    side: "player",
    zone: "backRank",
    slotId: "B0",
  });
  void actions.battlePlayCard(parseBattleCardId("battle-card-1"), []);
  void actions.battleGesture([{}, {}]);
  void actions.battleAiBlock("enemy", testEventActor("ai:test"));
  void actions.completeTutorialBattlePresentation(
    parsePresentationId("opponent-play:card-1"),
    parseIntentKey("battle:presentation:opponent-play:card-1"),
    testEventActor("tutorial-ai:client-a"),
  );
  void actions.resolvePrompt(1, {});
  void actions.setCardNote(parseBattleCardId("instance-1"), {
    noteId: parseNoteId("n1"),
    text: "t",
    expiry: null,
  });
  void actions.battleAction("player", { kind: "pass" });
  void actions.answerPrompt("player", parsePromptId("1:1:0"), 1);
  void actions.cancelPrompt("player", parsePromptId("1:1:0"));
  void actions.battleDebug({ kind: "mark" });

  return drafts;
}

describe("game actions facade", () => {
  const drafts = captureAllDrafts();

  it("produces a known event type for every creator", () => {
    for (const draft of drafts) {
      expect(
        isKnownEventType(draft.type),
        `creator produced unknown event type "${draft.type}"`,
      ).toBe(true);
    }
  });

  it("covers every known event type (no orphaned reducer case, no drift)", () => {
    const produced = new Set(drafts.map((d) => d.type));
    expect([...produced].sort()).toEqual([...KNOWN_EVENT_TYPES].sort());
  });

  it("writes each engine intent with its side and, for the AI host, its actor", () => {
    const captured: EventDraft[] = [];
    const actions = makeActions((draft) => {
      captured.push(draft);
      return Promise.resolve(captured.length);
    });
    const promptId = parsePromptId("4:2:1");
    const ai = testEventActor("ai:enemy");
    void actions.battleAction("enemy", { kind: "play", card: "i3", from: "hand" }, ai);
    void actions.answerPrompt("player", promptId, ["i7"]);
    void actions.cancelPrompt("player", promptId);
    expect(captured).toEqual([
      {
        type: "BATTLE_ACTION",
        payload: { side: "enemy", action: { kind: "play", card: "i3", from: "hand" } },
        actor: ai,
      },
      { type: "BATTLE_ANSWER", payload: { side: "player", promptId, value: ["i7"] } },
      { type: "BATTLE_CANCEL", payload: { side: "player", promptId } },
    ]);
  });

  it("routes each creator's event without a bounce-caused-by-unknown-type", () => {
    drafts.forEach((draft, index) => {
      const seq = index + 1;
      const event = draftToEvent(draft, seq);
      const base = {
        seq: 0,
        state: GAME_ENGINE_CONFIG.genesisState(GENESIS),
      };
      // devMode:false so a contained throw would surface as an error-tagged
      // bounce rather than escaping — the fold must never throw on a facade
      // event.
      const result = foldEvents(
        GAME_ENGINE_CONFIG,
        GENESIS,
        base,
        [{ seq, event }],
        {
          devMode: false,
        },
      );
      const outcome = result.outcomes[0];
      expect(outcome, `no outcome for "${draft.type}"`).toBeDefined();
      expect(["applied", "bounced"]).toContain(outcome.outcome);
      // A known type routes to a real domain case; the only bounces allowed
      // here are invalid-in-state, which never attach a fold error.
      expect(outcome.error, `fold error on "${draft.type}"`).toBeUndefined();
    });
  });

  it("stamps durable logical keys on automatic and site-lifecycle intents", () => {
    const captured: EventDraft[] = [];
    const actions = makeActions((draft) => {
      captured.push(draft);
      return Promise.resolve(captured.length);
    });

    void actions.advanceFrontDoor("loading", parseJourneyId("event:9"));
    void actions.openSite(
      parseSiteId("site-7"),
      parseJourneyId("journey:12"),
      "RandomSite",
    );
    void actions.enterDraftSite(parseSiteId("site-7"), parseJourneyId("journey:12"));
    void actions.acceptEssence(parseSiteId("site-7"), parseJourneyId("journey:12"));
    void actions.completeSite(parseSiteId("site-7"), parseJourneyId("journey:12"));
    void actions.settleGravokWager(
      parseSiteId("site-7"),
      parseShuffleCommitment("commitment-1"),
      parseJourneyId("journey:12"),
    );
    void actions.playAgainGravokWager(
      parseSiteId("site-7"),
      parseShuffleCommitment("commitment-1"),
      parseJourneyId("journey:12"),
    );
    void actions.settleStarwayStairs(
      parseSiteId("site-7"),
      parseShuffleCommitment("commitment-2"),
      parseJourneyId("journey:12"),
    );
    void actions.playAgainStarwayStairs(
      parseSiteId("site-7"),
      parseShuffleCommitment("commitment-2"),
      parseJourneyId("journey:12"),
    );
    void actions.settleBlackjack(
      parseSiteId("site-7"),
      parseShuffleCommitment("commitment-3"),
      parseJourneyId("journey:12"),
    );
    void actions.playAgainBlackjack(
      parseSiteId("site-7"),
      parseShuffleCommitment("commitment-3"),
      parseJourneyId("journey:12"),
    );
    void actions.battleCommand(
      { id: "DEBUG_EDIT" },
      parseIntentKey("battle:b-1:dreamwell:player:2"),
    );
    void actions.beginTutorialBattle(parseTutorialRunId("event:9"));
    void actions.restartTutorialBattle(parseBattleId("tutorial-battle:event:9:0"));
    void actions.exitTutorialBattle(
      parseBattleId("tutorial-battle:event:9:1:client-b"),
    );

    expect(captured.map((draft) => draft.intentKey)).toEqual([
      "front-door:event:9:loading",
      "open-site:RandomSite:journey:12:site-7",
      "enter-draft-site:journey:12:site-7",
      "accept-essence:journey:12:site-7",
      "complete-site:journey:12:site-7",
      "settle-gravok-wager:journey:12:site-7:commitment-1",
      "play-again-gravok-wager:journey:12:site-7:commitment-1",
      "settle-starway-stairs:journey:12:site-7:commitment-2",
      "play-again-starway-stairs:journey:12:site-7:commitment-2",
      "settle-blackjack:journey:12:site-7:commitment-3",
      "play-again-blackjack:journey:12:site-7:commitment-3",
      "battle:b-1:dreamwell:player:2",
      "tutorial-battle:event:9:begin",
      "tutorial-battle:tutorial-battle:event:9:0:restart",
      "tutorial-battle:tutorial-battle:event:9:1:client-b:exit",
    ]);
  });

  it("writes the current selection protocol into site opens and Exploration choices", () => {
    const captured: EventDraft[] = [];
    const actions = makeActions((draft) => {
      captured.push(draft);
      return Promise.resolve(captured.length);
    });

    void actions.openSite(
      parseSiteId("site-7"),
      parseJourneyId("journey:12"),
      "Exploration",
    );
    void actions.resolveExplorationChoice(
      parseSiteId("site-7"),
      testExplorationActionId("action-1"),
      {
        entryIds: [parseDeckEntryId("entry-1")],
      },
    );

    expect(captured.map((draft) => draft.payload)).toEqual([
      {
        siteId: parseSiteId("site-7"),
        selectionRulesVersion: SELECTION_RULES_VERSION,
      },
      {
        siteId: parseSiteId("site-7"),
        actionId: testExplorationActionId("action-1"),
        selectionRulesVersion: SELECTION_RULES_VERSION,
        selection: { entryIds: [parseDeckEntryId("entry-1")] },
      },
    ]);
  });

  it("deduplicates concurrent card tutorial opening while leaving bounces retriable", () => {
    const captured: EventDraft[] = [];
    const actions = makeActions((draft) => {
      captured.push(draft);
      return Promise.resolve(captured.length);
    });

    void actions.openCardTutorialGuidance(
      parseCardTutorialScreenKey("journey:12:site:site-7"),
      [testCardId("card-a")],
    );

    expect(captured).toEqual([
      {
        type: "OPEN_CARD_TUTORIAL_GUIDANCE",
        payload: {
          screenKey: "journey:12:site:site-7",
          cardIds: [testCardId("card-a")],
        },
        intentKey: "card-tutorial:journey:12:site:site-7:open",
      },
    ]);
  });

  it("carries the shared tutorial start cursor in the begin event", () => {
    const captured: EventDraft[] = [];
    const actions = makeActions((draft) => {
      captured.push(draft);
      return Promise.resolve(captured.length);
    });
    const tutorialActions = [
      {
        id: testTutorialActionId("tail-start"),
        action: "display-speech-bubble" as const,
        speechBubble: {
          speaker: "mira" as const,
          duration: 1,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "Begin here.",
        },
        wait: 1,
      },
    ];

    void actions.beginTutorial(tutorialActions, {
      startActionId: testTutorialActionId("tail-start"),
      intentKey: parseIntentKey("tutorial:test:tail-start"),
    });

    expect(captured).toEqual([
      {
        type: "BEGIN_TUTORIAL",
        payload: {
          actions: tutorialActions,
          startActionId: testTutorialActionId("tail-start"),
        },
        intentKey: "tutorial:test:tail-start",
      },
    ]);
  });

  it("carries the terminal tutorial cursor while preserving authored actions", () => {
    const captured: EventDraft[] = [];
    const actions = makeActions((draft) => {
      captured.push(draft);
      return Promise.resolve(captured.length);
    });
    const tutorialActions = [
      {
        id: testTutorialActionId("draw"),
        action: "draw-card" as const,
        owner: "player" as const,
        cardId: testCardId("a526fa7b-5cef-4da9-a3f2-27ee0bd9b481"),
        reason: "dreamwell-effect" as const,
        wait: 0,
      },
    ];

    void actions.beginTutorial(tutorialActions, {
      startAtEnd: true,
      intentKey: parseIntentKey("tutorial:test:terminal"),
    });

    expect(captured).toEqual([
      {
        type: "BEGIN_TUTORIAL",
        payload: { actions: tutorialActions, startAtEnd: true },
        intentKey: "tutorial:test:terminal",
      },
    ]);
  });

  it("writes optional journey fields in the order the replay log stores them", () => {
    const captured: EventDraft[] = [];
    const actions = makeActions((draft) => {
      captured.push(draft);
      return Promise.resolve(captured.length);
    });
    const siteId = parseSiteId("site-7");
    const dreamsignId = testDreamsignId("ds-7");
    const entryId = parseDeckEntryId("entry-7");
    const acceptRequest = {
      ...AUGURY_DECLINE,
      archetypeId: "fit_card_grant" as const,
      choice: { choiceId: parseChoiceId("choice-1") },
    };

    void actions.addDreamsign(dreamsignId);
    void actions.addDreamsign(dreamsignId, 2);
    void actions.acceptReward(siteId);
    void actions.acceptReward(siteId, 0);
    void actions.acceptDreamsignOffer(siteId, dreamsignId, 3);
    void actions.buyShopSlot(siteId, 1);
    void actions.buyShopSlot(siteId, 1, 4);
    void actions.acceptTransfigurationChoice(siteId, entryId);
    void actions.acceptTransfigurationChoice(siteId, entryId, "Empowered");
    void actions.forceAuguryArchetype(siteId, null);
    void actions.acceptAuguryOffer(siteId, acceptRequest);
    void actions.declineAugury(siteId, AUGURY_DECLINE);
    void actions.loadState(
      { snapshot: true },
      undefined,
      parseIntentKey("qa-bootstrap:scene-1"),
    );

    // JSON text pins key order: replay fixtures hash the stored wire bytes.
    expect(
      captured.map((draft) => [draft.type, JSON.stringify(draft.payload)]),
    ).toEqual([
      ["ADD_DREAMSIGN", JSON.stringify({ dreamsignId })],
      ["ADD_DREAMSIGN", JSON.stringify({ dreamsignId, purgeIndex: 2 })],
      ["ACCEPT_REWARD", JSON.stringify({ siteId })],
      ["ACCEPT_REWARD", JSON.stringify({ siteId, purgeIndex: 0 })],
      [
        "ACCEPT_DREAMSIGN_OFFER",
        JSON.stringify({ siteId, dreamsignId, purgeIndex: 3 }),
      ],
      ["BUY_SHOP_SLOT", JSON.stringify({ siteId, slotIndex: 1 })],
      ["BUY_SHOP_SLOT", JSON.stringify({ siteId, slotIndex: 1, purgeIndex: 4 })],
      ["ACCEPT_TRANSFIGURATION_CHOICE", JSON.stringify({ siteId, entryId })],
      [
        "ACCEPT_TRANSFIGURATION_CHOICE",
        JSON.stringify({ siteId, entryId, type: "Empowered" }),
      ],
      [
        "FORCE_AUGURY_ARCHETYPE",
        JSON.stringify({ siteId, archetypeId: null }),
      ],
      ["ACCEPT_AUGURY_OFFER", JSON.stringify({ siteId, ...acceptRequest })],
      ["DECLINE_AUGURY", JSON.stringify({ siteId, ...AUGURY_DECLINE })],
      ["LOAD_STATE", JSON.stringify({ snapshot: { snapshot: true } })],
    ]);
    expect(captured[captured.length - 1]?.intentKey).toBe("qa-bootstrap:scene-1");
  });

  it("carries an explicit battle seed in the authoritative intent", () => {
    const captured: EventDraft[] = [];
    const actions = makeActions((draft) => {
      captured.push(draft);
      return Promise.resolve(captured.length);
    });

    void actions.beginBattle(parseSiteId("site-7"), 4242);
    void actions.beginBattle(parseSiteId("site-8"), null);

    expect(captured).toEqual([
      {
        type: "BEGIN_BATTLE",
        payload: { siteId: parseSiteId("site-7"), seedOverride: 4242 },
      },
      { type: "BEGIN_BATTLE", payload: { siteId: parseSiteId("site-8") } },
    ]);
  });
});
