// Facade payload contracts for the game actions facade: engine intents carry
// their side and actor, automatic and site-lifecycle intents carry durable
// logical keys, and optional journey fields are written in the order the
// replay log stores them.

import { testEventActor } from "../types/test-identities";
import { describe, expect, it } from "vitest";
import type { EventDraft } from "../eventlog/local-log";
import { makeActions } from "./actions";
import { SELECTION_RULES_VERSION } from "../reward-selection";
import { parseBattleId } from "../types/identifiers";
import { parseSiteId } from "../types/identifiers";
import { parseDeckEntryId } from "../types/identifiers";
import { parseShuffleCommitment } from "../types/identifiers";
import { parsePromptId } from "../types/identifiers";
import { parseJourneyId } from "../types/identifiers";
import { parseTutorialRunId } from "../types/identifiers";
import { parseCardTutorialScreenKey } from "../types/identifiers";
import { parseIntentKey } from "../types/identifiers";
import { parseChoiceId } from "../types/identifiers";
import { testCardId, testDreamsignId, testExplorationActionId, testTutorialActionId } from "../types/test-identities";
import { AUGURY_DECLINE } from "./actions.fixtures";

describe("game actions facade", () => {
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
