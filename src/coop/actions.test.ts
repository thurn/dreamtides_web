// Facade contract test for the coop actions facade.
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
import type { EventDraft } from "../eventlog/client";
import { foldEvents } from "../eventlog/fold";
import type { GameEvent, Genesis } from "../eventlog/types";
import { KNOWN_EVENT_TYPES } from "../rules/events";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import { makeActions } from "./actions";

const GENESIS: Genesis = {
  seed: "actions-test-seed",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: {
    poolVariant: "test",
    draftMode: "pool",
    fresh20PackSize: null,
  },
};

/** Promote a captured draft into the committed-event shape the fold expects. */
function draftToEvent(draft: EventDraft, seq: number): GameEvent {
  return {
    type: draft.type,
    payload: draft.payload,
    actor: draft.actor ?? "c-test",
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
  void actions.frontDoorAction("main", "new-journey");
  void actions.advanceFrontDoor("loading", "journey-1");
  void actions.beginTutorial([], { intentKey: "tutorial:journey-1:begin" });
  void actions.completeTutorialAction("event:1", "welcome");
  void actions.beginTutorialBattle("event:1", "client-a");
  void actions.restartTutorialBattle("tutorial-battle:event:1:0:client-a", "client-a", "client-b");
  void actions.exitTutorialBattle("tutorial-battle:event:1:1:client-b");
  void actions.changeEssence(1);
  void actions.setEssence(1);
  void actions.changeMaxEssence(1);
  void actions.setEssenceCap(1);
  void actions.setMaxDreamsigns(1);
  void actions.setCompletionLevel(1);
  void actions.startQuest({});
  void actions.resetQuest();
  void actions.loadState({});
  void actions.selectDreamcaller("dc-1");
  void actions.rerollDreamcallerOffer();
  void actions.setScreen({ type: "questStart" });
  void actions.travelToDreamscape("node-1");
  void actions.markSiteVisited("site-1");
  void actions.dismissStartingDeckPopup();
  void actions.addCard({ cardId: "card-1" });
  void actions.removeDeckEntry("entry-1");
  void actions.purgeDeckCards(["entry-1"]);
  void actions.duplicateDeckEntry("entry-1");
  void actions.setDeckEntryStatOverride("entry-1", null);
  void actions.setDeckEntryKeywords("entry-1", null);
  void actions.setDeckEntryType("entry-1", null);
  void actions.transfigureCard("entry-1", null);
  void actions.acceptTransfigurationChoice("site-1", "entry-1");
  void actions.acceptDuplicationChoice("site-1", "entry-1");
  void actions.purgeAllBaneCards();
  void actions.purgeRandomBaneCards(1);
  void actions.addDreamsign("ds-1");
  void actions.removeDreamsign("ds-1");
  void actions.setDreamsignPool(["ds-1"]);
  void actions.setDreamsignIsBane("ds-1", true);
  void actions.setDraftState({});
  void actions.pickDraftCard(0, "card-1");
  void actions.rerollDraftOffer("site-1");
  void actions.enterDraftSite("site-1");
  void actions.openSite("site-1");
  void actions.completeDreamAugury("site-1");
  void actions.acceptReward("site-1");
  void actions.acceptDreamsignOffer("site-1", "ds-1");
  void actions.rejectDreamsignOffer("site-1");
  void actions.acceptEssence("site-1");
  void actions.rerollDreamAugury("site-1");
  void actions.forceDreamAuguryArchetype("site-1", "arch-1");
  void actions.completeSite("site-1");
  void actions.acceptMerchantOffer("site-1");
  void actions.declineMerchant("site-1");
  void actions.buyShopSlot("site-1", 0);
  void actions.rerollShop("site-1");
  void actions.grantFreeRerolls(1);
  void actions.applyShopDiscount(10);
  void actions.pushBattleModifier({});
  void actions.pushTemporaryBaneGrant({});
  void actions.banSiteType("Shop", 1);
  void actions.boostSiteAppearance("Shop", 10, 1);
  void actions.replaceSiteType("node-1", "Shop", "Battle");
  void actions.addSiteToDreamscape("node-1", "Shop");
  void actions.updateAtlas({});
  void actions.setCardSourceDebug(null);
  void actions.endBattle("victory");
  void actions.beginBattle("site-1");
  void actions.setBattleAutomation(true);
  void actions.battleCommand({});
  void actions.battleGesture([{}, {}]);
  void actions.battleAiDefend("enemy", "ai:test");
  void actions.resolvePrompt(1, {});
  void actions.setCardNote("instance-1", {
    noteId: "n1",
    text: "t",
    expiry: null,
  });

  return drafts;
}

describe("coop actions facade", () => {
  const drafts = captureAllDrafts();

  it("produces a known event type for every creator", () => {
    for (const draft of drafts) {
      expect(
        KNOWN_EVENT_TYPES.has(draft.type),
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

    void actions.advanceFrontDoor("loading", "event:9");
    void actions.openSite("site-7", "quest:12");
    void actions.enterDraftSite("site-7", "quest:12");
    void actions.acceptEssence("site-7", "quest:12");
    void actions.completeSite("site-7", "quest:12");
    void actions.battleCommand(
      { id: "DEBUG_EDIT" },
      "battle:b-1:dreamwell:player:2",
    );
    void actions.beginTutorialBattle("event:9", "client-a");
    void actions.restartTutorialBattle("tutorial-battle:event:9:0:client-a", "client-a", "client-b");
    void actions.exitTutorialBattle("tutorial-battle:event:9:1:client-b");

    expect(captured.map((draft) => draft.intentKey)).toEqual([
      "front-door:event:9:loading",
      "open-site:quest:12:site-7",
      "enter-draft-site:quest:12:site-7",
      "accept-essence:quest:12:site-7",
      "complete-site:quest:12:site-7",
      "battle:b-1:dreamwell:player:2",
      "tutorial-battle:event:9:begin",
      "tutorial-battle:tutorial-battle:event:9:0:client-a:restart:client-a",
      "tutorial-battle:tutorial-battle:event:9:1:client-b:exit",
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
        id: "tail-start",
        action: "display-speech-bubble" as const,
        speechBubble: {
          speaker: "mira" as const,
          duration: 1,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "Begin here.",
        },
        wait: 1,
      },
    ];

    void actions.beginTutorial(tutorialActions, {
      startActionId: "tail-start",
      intentKey: "tutorial:test:tail-start",
    });

    expect(captured).toEqual([
      {
        type: "BEGIN_TUTORIAL",
        payload: { actions: tutorialActions, startActionId: "tail-start" },
        intentKey: "tutorial:test:tail-start",
      },
    ]);
  });

  it("carries an explicit battle seed in the authoritative intent", () => {
    const captured: EventDraft[] = [];
    const actions = makeActions((draft) => {
      captured.push(draft);
      return Promise.resolve(captured.length);
    });

    void actions.beginBattle("site-7", 4242);
    void actions.beginBattle("site-8", null);

    expect(captured).toEqual([
      {
        type: "BEGIN_BATTLE",
        payload: { siteId: "site-7", seedOverride: 4242 },
      },
      { type: "BEGIN_BATTLE", payload: { siteId: "site-8" } },
    ]);
  });
});
