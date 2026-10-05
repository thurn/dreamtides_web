// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { screenMocks } from "./__test-helpers__/tutorial-screen-stubs";
import {
  TUTORIAL_OPPONENT_CARD,
  battle,
  emptySide,
  guideModel,
  installTutorialScreenHarness,
  renderTutorialScreen,
  setDesktopViewport,
  setRect,
  tutorialView,
} from "./__test-helpers__/tutorial-screen-fixtures";
import { parseCardName } from "../../types/card-identity";
import { parseTutorialRunId } from "../../types/identifiers";
import { testCardId, testTutorialActionId } from "../../types/test-identities";

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

/** The enemy holding the opponent card face down, ready to reveal it. */
function revealBattle() {
  return battle({
    enemyHandCardIds: [TUTORIAL_OPPONENT_CARD.id],
    enemyHand: [],
    farHand: {
      owner: "enemy",
      position: "far",
      cardIds: [TUTORIAL_OPPONENT_CARD.id],
      cards: [],
    },
    enemy: emptySide("enemy"),
    player: emptySide("player"),
    inspector: {
      sides: {
        enemy: { zones: { hand: 1, backRank: 0 } },
        player: { zones: {} },
      },
    },
  });
}

describe("TutorialScreen opponent cards", () => {
  it("moves the opponent deck's top card face down into hand before completing the action", () => {
    vi.useFakeTimers();
    const onActionComplete = vi.fn();
    renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:draw"), {
        dialogue: {
          kind: "avatar",
          owner: "enemy",
          bubbleWidth: 450,
          speakerName: "Threxan",
          text: "For the Abyss!",
        },
        currentAction: {
          id: testTutorialActionId("vrakmoth-draw"),
          action: "draw-opponent-card",
          cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
          wait: 0,
        },
        battle: battle({
          enemyHandCardIds: [],
          enemyHand: [],
          farHand: { owner: "enemy", position: "far", cardIds: [], cards: [] },
          enemy: {
            deckCardIds: ["tutorial-enemy-deck-1", "tutorial-enemy-deck-2"],
          },
          inspector: {
            sides: {
              enemy: { zones: { deck: 2, hand: 0 } },
              player: { zones: {} },
            },
          },
        }),
      }),
      { onActionComplete },
    );

    expect(screenMocks.props?.view.enemy.deckCardIds).toEqual([
      "tutorial-enemy-deck-1",
      "tutorial-enemy-deck-2",
    ]);
    expect(screenMocks.props?.view.enemyHandCardIds).toEqual([]);
    expect(screenMocks.props?.view.farHand.cardIds).toEqual([]);

    act(() => screenMocks.sceneAnimationComplete?.());

    const view = screenMocks.props?.view;
    expect(view?.enemy.deckCardIds).toEqual(["tutorial-enemy-deck-2"]);
    expect(view?.enemyHandCardIds).toEqual(["tutorial-enemy-deck-1"]);
    expect(view?.farHand.cardIds).toEqual(["tutorial-enemy-deck-1"]);
    expect(view?.enemyHand).toEqual([]);
    expect(view?.inspector.sides.enemy.zones).toMatchObject({
      deck: 1,
      hand: 1,
    });
    act(() => {
      vi.advanceTimersByTime(419);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:draw",
      testTutorialActionId("vrakmoth-draw"),
    );
  });

  it("flips the UUID-backed hand card at the mirrored grid intersection, then plays it in the back-rank center", () => {
    vi.useFakeTimers();
    setDesktopViewport(true);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function rectForElement(this: HTMLElement) {
        if (this.matches("[data-tutorial-screen]")) {
          return DOMRect.fromRect({ width: 1920, height: 1080 });
        }
        if (this.matches('[data-battle-card-zone="far-hand"]')) {
          return DOMRect.fromRect({ x: 931, y: 0, width: 58, height: 81.2 });
        }
        const slotId = this.dataset.battleSlotId;
        const rank = this.parentElement?.dataset.battleRank;
        if (slotId === undefined || rank === undefined) {
          return DOMRect.fromRect();
        }
        const slotParts = slotId.split("-");
        const index = Number(slotParts[slotParts.length - 1]);
        if (rank === "enemy-back") {
          return DOMRect.fromRect({
            x: 335.98 + index * 125.2,
            y: 205.2,
            width: 121.2,
            height: 121.2,
          });
        }
        return DOMRect.fromRect({
          x: 398.58 + index * 125.2,
          y: rank === "enemy-front" ? 330.4 : 455.6,
          width: 121.2,
          height: 121.2,
        });
      },
    );
    const onActionComplete = vi.fn();
    const { container } = renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:play"), {
        dialogue: {
          kind: "guide",
          horizontalOffset: 0,
          verticalOffset: 0,
          model: guideModel("This card has a ▸Dawn ability."),
        },
        currentAction: {
          id: testTutorialActionId("vrakmoth-reveal-and-play"),
          action: "reveal-and-play-opponent-card",
          cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
          revealDuration: 2,
          speechBubble: {
            speaker: "mira",
            duration: 2,
            horizontalOffset: 0,
            verticalOffset: 0,
            bubbleWidth: 700,
            text: "This card has a ▸Dawn ability.",
          },
          wait: 0,
        },
        opponentCardToReveal: TUTORIAL_OPPONENT_CARD,
        battle: revealBattle(),
      }),
      { onActionComplete },
    );
    act(() => screenMocks.sceneAnimationComplete?.());

    expect(screenMocks.cardInitial).toMatchObject({
      x: 931,
      y: 0,
      width: 58,
      height: 81.2,
    });
    expect(screenMocks.cardAnimate).toEqual({
      x: [931, 1278.18, 1278.18, 1278.18, 836.78],
      y: [0, 285.6, 285.6, 285.6, 205.2],
      width: [58, 240, 240, 240, 121.2],
      height: [81.2, 336, 336, 336, 121.2],
    });
    expect(screenMocks.cardTransition).toMatchObject({ duration: 3.26 });
    expect(screenMocks.cardFlipAnimate).toEqual({
      rotateY: [0, 0, 180, 180, 180],
    });
    expect(screenMocks.cardFlipTransition).toMatchObject({ duration: 3.26 });
    expect(screenMocks.cardFullAnimate).toEqual({ opacity: 0 });
    expect(screenMocks.cardFullTransition).toMatchObject({
      delay: 2.84,
      duration: 0.42,
    });
    expect(screenMocks.cardBattlefieldAnimate).toEqual({ opacity: 1 });
    expect(screenMocks.cardBattlefieldTransition).toMatchObject({
      delay: 2.84,
      duration: 0.42,
    });
    expect(
      container.querySelector(
        '[data-testid="tutorial-opponent-card-battlefield"][data-game-card-presentation="battlefield"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-tutorial-card-id="229ab3a1-3720-41a2-924c-8fe112188f8e"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>('[data-battle-card-zone="far-hand"]')
        ?.style.visibility,
    ).toBe("hidden");
    expect(screenMocks.dialogueProps).toMatchObject({
      dialogue: { text: "This card has a ▸Dawn ability." },
      visible: false,
    });
    act(() => {
      vi.advanceTimersByTime(839);
    });
    expect(screenMocks.dialogueProps?.visible).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screenMocks.dialogueProps?.visible).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1_999);
    });
    expect(screenMocks.dialogueProps?.visible).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screenMocks.dialogueProps?.visible).toBe(false);

    act(() => screenMocks.cardAnimationComplete?.());
    act(() => {
      vi.advanceTimersByTime(0);
    });

    const view = screenMocks.props?.view;
    expect(view?.enemyHandCardIds).toEqual([]);
    expect(view?.farHand).toMatchObject({ cardIds: [], cards: [] });
    expect(view?.enemy.backRank[4]?.card?.model.cardId).toBe(
      "229ab3a1-3720-41a2-924c-8fe112188f8e",
    );
    expect(view?.enemy.backRank[5]?.card).toBeNull();
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:play",
      testTutorialActionId("vrakmoth-reveal-and-play"),
    );
  });

  it("plays the opponent card into the center of the opening mobile back rank", () => {
    vi.useFakeTimers();
    renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:mobile-play"), {
        currentAction: {
          id: testTutorialActionId("vrakmoth-reveal-and-play"),
          action: "reveal-and-play-opponent-card",
          cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
          revealDuration: 0,
          wait: 0,
        },
        opponentCardToReveal: TUTORIAL_OPPONENT_CARD,
        battle: revealBattle(),
      }),
    );
    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => screenMocks.cardAnimationComplete?.());

    const backRank = screenMocks.props?.view.enemy.backRank;
    expect(backRank).toHaveLength(6);
    expect(backRank?.[0]?.card).toBeNull();
    expect(backRank?.[1]?.card).toBeNull();
    expect(backRank?.[2]?.card?.model.cardId).toBe(
      "229ab3a1-3720-41a2-924c-8fe112188f8e",
    );
    expect(backRank?.[3]?.card).toBeNull();
  });

  it("repositions one opponent character without shifting an adjacent back-rank card", () => {
    vi.useFakeTimers();
    setDesktopViewport(true);
    const onActionComplete = vi.fn();
    const championCard = {
      ...TUTORIAL_OPPONENT_CARD,
      id: "tutorial-enemy-deck-2",
      model: {
        ...TUTORIAL_OPPONENT_CARD.model,
        cardId: testCardId("a28ad36d-fa74-4190-a463-7efd3a6233d0"),
        displaySnapshot: {
          ...TUTORIAL_OPPONENT_CARD.model.displaySnapshot,
          id: testCardId("a28ad36d-fa74-4190-a463-7efd3a6233d0"),
          name: parseCardName("Runebound Champion"),
        },
      },
    };
    const { container } = renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:reposition"), {
        currentAction: {
          id: testTutorialActionId("opponent-character-advance"),
          action: "reposition-opponent-character",
          cardId: TUTORIAL_OPPONENT_CARD.model.cardId,
          wait: 0,
        },
        battle: battle({
          enemy: {
            backRank: Array.from({ length: 3 }, (_, index) => ({
              id: `enemy-back-${String(index)}`,
              card: index === 1 ? championCard : null,
            })),
            frontRank: Array.from({ length: 2 }, (_, index) => ({
              id: `enemy-front-${String(index)}`,
              card:
                index === 0
                  ? { ...TUTORIAL_OPPONENT_CARD, layoutMotion: "travel" }
                  : null,
            })),
            deckCardIds: [],
          },
          player: { backRank: [], frontRank: [], deckCardIds: [] },
        }),
      }),
      { onActionComplete },
    );

    setRect(
      container.querySelector(
        '[data-battle-rank="enemy-back"] [data-battle-slot-id="enemy-back-4"]',
      ),
      { x: 100, y: 120, width: 80, height: 120 },
    );
    const repositionDestination = container.querySelector<HTMLElement>(
      `[data-battle-rank="enemy-front"] [data-battle-card-id="${TUTORIAL_OPPONENT_CARD.id}"]`,
    );
    setRect(repositionDestination, { x: 260, y: 300, width: 80, height: 120 });
    const animateReposition = vi.fn(
      (
        _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
        _options?: number | KeyframeAnimationOptions,
      ) => ({ cancel: vi.fn() }) as unknown as Animation,
    );
    Object.defineProperty(repositionDestination, "animate", {
      configurable: true,
      value: animateReposition,
    });

    act(() => screenMocks.sceneAnimationComplete?.());
    const view = screenMocks.props?.view;
    expect(view?.enemy.backRank).toHaveLength(10);
    expect(view?.enemy.backRank[4]?.card).toBeNull();
    expect(view?.enemy.backRank[5]?.card).toMatchObject({
      id: "tutorial-enemy-deck-2",
      model: { cardId: testCardId("a28ad36d-fa74-4190-a463-7efd3a6233d0") },
    });
    expect(view?.enemy.frontRank).toHaveLength(9);
    expect(view?.enemy.frontRank[4]?.card).toMatchObject({
      id: TUTORIAL_OPPONENT_CARD.id,
      layoutMotion: "snap",
    });
    expect(view?.enemy.frontRank[3]?.card).toBeNull();
    expect(animateReposition).toHaveBeenCalledWith(
      [
        { transform: "translate3d(-160px, -180px, 0)" },
        { transform: "translate3d(0, 0, 0)" },
      ],
      expect.objectContaining({ duration: 1_000 }),
    );
    expect(
      repositionDestination?.dataset.tutorialOpponentCharacterReposition,
    ).toBe("");
    expect(screenMocks.motionConfigTransition).toMatchObject({ duration: 1 });
    expect(onActionComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:reposition",
      testTutorialActionId("opponent-character-advance"),
    );
  });
});
