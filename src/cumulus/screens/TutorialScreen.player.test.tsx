// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { screenMocks } from "./__test-helpers__/tutorial-screen-stubs";
import {
  ResizeObserverStub,
  TUTORIAL_OPPONENT_CARD,
  TUTORIAL_PLAYER_CARD,
  battle,
  installTutorialScreenHarness,
  renderTutorialScreen,
  setDesktopViewport,
  tutorialView,
} from "./__test-helpers__/tutorial-screen-fixtures";
import type { TutorialView } from "./TutorialScreen";
import {
  parseBattleSlotViewId,
  parseTutorialRunId,
  type BattleSlotViewId,
  type TutorialRunId,
} from "../../types/identifiers";
import { testTutorialActionId } from "../../types/test-identities";

vi.mock("framer-motion", async () => {
  const stubs = await import("./__test-helpers__/tutorial-screen-stubs");
  return stubs.framerMotionStub;
});
vi.mock("../components/overlay/CharacterDialogue", async () => {
  const stubs = await import("./__test-helpers__/tutorial-screen-stubs");
  return { CharacterDialogue: stubs.CharacterDialogueStub };
});
vi.mock("./MobileBattleScreen", async (importOriginal) => {
  const stubs = await import("./__test-helpers__/tutorial-screen-stubs");
  return {
    ...(await importOriginal<typeof import("./MobileBattleScreen")>()),
    MobileBattleScreen: stubs.MobileBattleScreenStub,
  };
});

installTutorialScreenHarness();

function endTurnView(
  runId: TutorialRunId,
  ready: boolean,
  battleFields: Record<string, unknown> = {},
): TutorialView {
  return tutorialView(runId, {
    currentAction: {
      id: testTutorialActionId("end-turn"),
      action: "end-turn",
      wait: 0,
    },
    endTurn: {
      actionId: testTutorialActionId("end-turn"),
      triggerCardId: TUTORIAL_PLAYER_CARD.model.cardId,
      ready,
    },
    battle: battle({
      playerHand: [],
      enemy: { backRank: [], frontRank: [], deckCardIds: [] },
      player: { backRank: [], frontRank: [] },
      ...battleFields,
    }),
  });
}

const clearedPending = {
  pendingCardId: null,
  pendingCardSource: null,
  pendingCardOwner: null,
};

describe("TutorialScreen player actions", () => {
  it("bridges the tutorial hand card after the how-to-play action completes", () => {
    const onPlayerCardPlay = vi.fn();
    renderTutorialScreen(
      endTurnView(parseTutorialRunId("event:player-turn"), false, {
        playerHand: [TUTORIAL_PLAYER_CARD],
      }),
      { onPlayerCardPlay },
    );

    expect(screenMocks.props?.interactions).toMatchObject({
      canInteract: true,
      ...clearedPending,
    });

    act(() => {
      screenMocks.props?.interactions?.onCardDragStart(
        TUTORIAL_PLAYER_CARD.id,
        "near-hand",
      );
    });
    expect(screenMocks.props?.interactions).toMatchObject({
      pendingCardId: TUTORIAL_PLAYER_CARD.id,
      pendingCardSource: "near-hand",
      pendingCardOwner: "player",
    });

    act(() => {
      screenMocks.props?.interactions?.onSlotDrop({
        owner: "player",
        rank: "back",
        slotId: parseBattleSlotViewId("B4"),
      });
    });
    expect(onPlayerCardPlay).toHaveBeenCalledWith(
      "event:player-turn",
      TUTORIAL_PLAYER_CARD.id,
      TUTORIAL_PLAYER_CARD.model.cardId,
      "B4",
    );
    expect(screenMocks.props?.interactions).toMatchObject(clearedPending);
  });

  it("places the played UUID-backed tutorial card in the fifth desktop back-rank slot", () => {
    setDesktopViewport(true);
    renderTutorialScreen(
      endTurnView(parseTutorialRunId("event:player-card-position"), true, {
        player: {
          backRank: [
            { id: "player-back-0", card: TUTORIAL_PLAYER_CARD },
            { id: "player-back-1", card: null },
            { id: "player-back-2", card: null },
          ],
          frontRank: [],
        },
      }),
    );

    const backRank = screenMocks.props?.view.player.backRank;
    expect(backRank).toHaveLength(10);
    expect(backRank?.[4]?.card?.model.cardId).toBe(
      TUTORIAL_PLAYER_CARD.model.cardId,
    );
    expect(backRank?.[5]?.card).toBeNull();
  });

  it("highlights the opposing lane and bridges the guided player block", () => {
    const onPlayerCharacterReposition = vi.fn();
    renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:block"), {
        currentAction: {
          id: testTutorialActionId("block-opponent"),
          action: "reposition-player-character",
          cardId: TUTORIAL_PLAYER_CARD.model.cardId,
          opposingCardId: TUTORIAL_OPPONENT_CARD.model.cardId,
          wait: 0,
        },
        playerReposition: {
          actionId: testTutorialActionId("block-opponent"),
          cardInstanceId: TUTORIAL_PLAYER_CARD.id,
          cardId: TUTORIAL_PLAYER_CARD.model.cardId,
          opposingCardId: TUTORIAL_OPPONENT_CARD.model.cardId,
        },
        battle: battle({
          playerHand: [],
          enemy: {
            backRank: [],
            frontRank: [{ id: "enemy-front-0", card: TUTORIAL_OPPONENT_CARD }],
            deckCardIds: [],
          },
          player: {
            backRank: [{ id: "player-back-0", card: TUTORIAL_PLAYER_CARD }],
            frontRank: [
              { id: "player-front-0", card: null },
              { id: "player-front-1", card: null },
            ],
          },
        }),
      }),
      { onPlayerCharacterReposition },
    );

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => ResizeObserverStub.flush());

    expect(screenMocks.props?.guidedSlotHighlight).toMatchObject({
      owner: "player",
      rank: "front",
      slotId: "player-front-0",
    });
    expect(screenMocks.props?.guidedSlotHighlight?.label).not.toBe("");

    act(() => {
      screenMocks.props?.interactions?.onCardDragStart(
        TUTORIAL_PLAYER_CARD.id,
        "battlefield",
      );
    });
    expect(screenMocks.props?.interactions).toMatchObject({
      pendingCardId: TUTORIAL_PLAYER_CARD.id,
      pendingCardSource: "battlefield",
      pendingCardOwner: "player",
    });

    const drop = (slotId: BattleSlotViewId) =>
      act(() => {
        screenMocks.props?.interactions?.onSlotDrop({
          owner: "player",
          rank: "front",
          slotId,
        });
      });
    drop(parseBattleSlotViewId("player-front-1"));
    expect(onPlayerCharacterReposition).not.toHaveBeenCalled();

    drop(parseBattleSlotViewId("player-front-0"));
    expect(onPlayerCharacterReposition).toHaveBeenCalledWith(
      "event:block",
      testTutorialActionId("block-opponent"),
      TUTORIAL_PLAYER_CARD.model.cardId,
      TUTORIAL_OPPONENT_CARD.model.cardId,
      "player-front-0",
    );
  });

  it("lifts the challenge pair, dissolves the lower-spark card, and completes after rematerialization", () => {
    vi.useFakeTimers();
    const onActionComplete = vi.fn();
    const { container } = renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:challenge"), {
        currentAction: {
          id: testTutorialActionId("resolve-challenge"),
          action: "resolve-challenge",
          challengerCardId: TUTORIAL_OPPONENT_CARD.model.cardId,
          blockerCardId: TUTORIAL_PLAYER_CARD.model.cardId,
          wait: 0,
        },
        playerReposition: null,
        challenge: {
          actionId: testTutorialActionId("resolve-challenge"),
          challenger: { owner: "enemy", card: TUTORIAL_OPPONENT_CARD, spark: 2 },
          blocker: { owner: "player", card: TUTORIAL_PLAYER_CARD, spark: 4 },
          winnerOwner: "player",
          loserOwner: "enemy",
        },
        battle: battle({
          phase: "challenge",
          playerHand: [],
          enemy: {
            backRank: [],
            frontRank: [{ id: "enemy-front-0", card: TUTORIAL_OPPONENT_CARD }],
            deckCardIds: [],
          },
          player: {
            backRank: [],
            frontRank: [{ id: "player-front-0", card: TUTORIAL_PLAYER_CARD }],
          },
        }),
      }),
      { onActionComplete },
    );

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => {
      vi.advanceTimersByTime(500);
    });

    const animation = container.querySelector(
      "[data-tutorial-challenge-animation]",
    );
    expect(animation).not.toBeNull();
    expect(
      animation?.getAttribute("data-tutorial-challenge-winner-card-id"),
    ).toBe(TUTORIAL_PLAYER_CARD.model.cardId);
    expect(
      animation?.getAttribute("data-tutorial-challenge-loser-card-id"),
    ).toBe(TUTORIAL_OPPONENT_CARD.model.cardId);
    expect(
      container.querySelectorAll("[data-tutorial-challenge-mote]").length,
    ).toBeGreaterThan(0);
    for (const rank of ["enemy-front", "player-front"]) {
      expect(
        container.querySelector<HTMLElement>(
          `[data-battle-rank="${rank}"] [data-battle-card-id]`,
        )?.style.visibility,
      ).toBe("");
      expect(
        container.querySelector<HTMLElement>(
          `[data-battle-rank="${rank}"] [data-battle-card-motion]`,
        )?.style.visibility,
      ).toBe("hidden");
    }
    expect(screenMocks.props?.preserveOccupiedSlotOutlines).toBe(true);
    expect(
      container.querySelector(
        '[data-battle-rank="enemy-front"] [data-battle-slot-id="enemy-front-0"] [data-battle-slot-outline]',
      ),
    ).not.toBeNull();
    expect(screenMocks.props?.view.phase).toBe("challenge");

    act(() => screenMocks.challengeRematerializedAnimationComplete?.());
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:challenge",
      testTutorialActionId("resolve-challenge"),
    );
  });

  it("offers End Turn after the shared card play and submits the authored action", () => {
    const onEndTurn = vi.fn();
    renderTutorialScreen(endTurnView(parseTutorialRunId("event:player-turn"), true), { onEndTurn });

    expect(screenMocks.props?.phaseNavigation).toBe("end-turn");
    expect(screenMocks.props?.interactions?.canInteract).toBe(true);
    act(() => screenMocks.props?.interactions?.onNextPhase());
    expect(onEndTurn).toHaveBeenCalledWith(
      "event:player-turn",
      testTutorialActionId("end-turn"),
    );
  });
});
