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
import { parseBattleId } from "../types/identifiers";
import { parsePresentationId } from "../types/identifiers";
import { parseSiteId } from "../types/identifiers";
import { parseAtlasNodeId } from "../types/identifiers";
import { parseDeckEntryId } from "../types/identifiers";
import { parseShuffleCommitment } from "../types/identifiers";
import { parsePromptId } from "../types/identifiers";
import { parseJourneyId } from "../types/identifiers";
import { parseTutorialRunId } from "../types/identifiers";
import { parseCardTutorialScreenKey } from "../types/identifiers";
import { parseIntentKey } from "../types/identifiers";
import {
  parseD97FlagId,
  parseD97ItemId,
  parseD97OwnedCopyId,
  parseD97QuestId,
  parseD97QuestStepId,
  parseDreamAnchorId,
} from "../types/identifiers";
import { parseFrontDoorActionId } from "../types/identifiers";
import { testCardId, testAvatarId, testDreamsignId, testExplorationActionId, testTutorialActionId } from "../types/test-identities";
import { TEST_CONTENT_CONFIG } from "../testing/journey-genesis";
import { AUGURY_DECLINE } from "./actions.fixtures";

const GENESIS: Genesis = {
  seed: testJourneySeed("actions-test-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};

/** Promote a captured draft into the committed-event shape the fold expects. */
function draftToEvent(draft: EventDraft): GameEvent {
  return {
    type: draft.type,
    payload: draft.payload,
    actor: draft.actor ?? testEventActor("c-test"),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
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
  void actions.resolveJourneyDuplication(parseSiteId("site-1"), testDreamsignId("source"), 0, 0, 1, null);
  void actions.resolveJourneyTransfiguration(parseSiteId("site-1"), testDreamsignId("dreamsign-1"), 0, 0, [parseDeckEntryId("entry-1")]);
  void actions.resolveAfterBattleDreamsign(parseSiteId("site-1"), testDreamsignId("source"), 0, 0, 1, testDreamsignId("offered"));
  void actions.resolveTypeRemap(testDreamsignId("source"), 1, 0, 1, "Mage");
  void actions.resolveJourneySubtype(testDreamsignId("source"), 1, 0, 1, "Mage");
  void actions.resolveDreamsignCopy(testDreamsignId("source"), 1, 0, 1, 0, testDreamsignId("target"));
  void actions.resolveOpeningHandEntry(testDreamsignId("source"), 0, 0, 1, parseDeckEntryId("entry-1"));
  void actions.resolveStarterPurge(testDreamsignId("dreamsign-1"), 0, 0, 1, [parseDeckEntryId("entry-1")]);
  void actions.resolveJourneyPurge(parseSiteId("site-1"), testDreamsignId("dreamsign-1"), 0, 0, [parseDeckEntryId("entry-1")]);
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
  void actions.rerollExploration(parseSiteId("site-1"), testDreamsignId("source"), testCardId("encounter"), 0);
  void actions.resolveExplorationChoice(
    parseSiteId("site-1"),
    testExplorationActionId("action-1"),
    {
      entryIds: [parseDeckEntryId("entry-1")],
    },
    testCardId("encounter"),
    1,
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
  void actions.completeTutorialBattlePresentation(
    parsePresentationId("opponent-play:card-1"),
    parseIntentKey("battle:presentation:opponent-play:card-1"),
    testEventActor("tutorial-ai:client-a"),
  );
  void actions.tutorialCardAttempt(parseBattleId("tutorial-battle"), "i1");
  void actions.battleAction("player", { kind: "pass" });
  void actions.answerPrompt("player", parsePromptId("1:1:0"), 1);
  void actions.cancelPrompt("player", parsePromptId("1:1:0"));
  void actions.battleDebug({ kind: "mark" });
  void actions.d97({ type: "D97_START_RUN", payload: { avatarId: testAvatarId("dc-1") } });
  void actions.d97({ type: "D97_PREVIEW_ENCOUNTER", payload: { anchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000006") } });
  void actions.d97({ type: "D97_DECLINE_ENCOUNTER", payload: { anchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000006") } });
  void actions.d97({ type: "D97_BEGIN_BATTLE", payload: { anchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000006") } });
  void actions.d97({ type: "D97_END_BATTLE", payload: {} });
  void actions.d97({ type: "D97_ACTIVATE_WAYPOINT", payload: { anchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000003") } });
  void actions.d97({ type: "D97_STEP_THROUGH_DOOR", payload: { anchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000002") } });
  void actions.d97({ type: "D97_ENTER_ROOM", payload: { anchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000050") } });
  void actions.d97({ type: "D97_LEAVE_ROOM", payload: { anchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000100") } });
  void actions.d97({ type: "D97_BUY_SHOP_CARD", payload: { anchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000005"), slotIndex: 0 } });
  void actions.d97({ type: "D97_SELL_COPY", payload: { anchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000005"), copyId: parseD97OwnedCopyId("00000000-0000-4000-8000-000000000097") } });
  void actions.d97({ type: "D97_RESTOCK_SHOP", payload: { anchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000005") } });
  void actions.d97({ type: "D97_EQUIP_COPY", payload: { copyId: parseD97OwnedCopyId("00000000-0000-4000-8000-000000000097") } });
  void actions.d97({ type: "D97_UNEQUIP_COPY", payload: { copyId: parseD97OwnedCopyId("00000000-0000-4000-8000-000000000097") } });
  const questId = parseD97QuestId("00000000-0000-4000-8000-000000000971");
  const anchorId = parseDreamAnchorId("00000000-0000-4000-8000-000000000972");
  const itemId = parseD97ItemId("00000000-0000-4000-8000-000000000973");
  void actions.d97({ type: "D97_ACCEPT_QUEST", payload: { questId, anchorId } });
  void actions.d97({ type: "D97_ADVANCE_QUEST", payload: { questId, stepId: parseD97QuestStepId("00000000-0000-4000-8000-000000000974"), anchorId } });
  void actions.d97({ type: "D97_COMPLETE_QUEST", payload: { questId, anchorId } });
  void actions.d97({ type: "D97_CHOOSE_QUEST_REWARD", payload: { questId, cardId: testCardId("d97-quest-reward") } });
  void actions.d97({ type: "D97_ABANDON_QUEST", payload: { questId } });
  void actions.d97({ type: "D97_PICK_UP_OBJECT", payload: { anchorId } });
  void actions.d97({ type: "D97_GIVE_ITEM", payload: { itemId, anchorId } });
  void actions.d97({ type: "D97_TAKE_ITEM", payload: { itemId, anchorId } });
  void actions.d97({ type: "D97_SET_FLAG", payload: { flagId: parseD97FlagId("00000000-0000-4000-8000-000000000975"), value: true, anchorId } });
  void actions.d97({ type: "D97_OPEN_SHOP", payload: { anchorId } });
  void actions.d97({ type: "D97_OPEN_SERVICE", payload: { anchorId, service: "sage" } });

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

  it("routes each creator's event without a bounce-caused-by-unknown-type", () => {
    drafts.forEach((draft, index) => {
      const seq = index + 1;
      const event = draftToEvent(draft);
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
});
