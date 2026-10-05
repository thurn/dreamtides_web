// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { screenMocks } from "./__test-helpers__/tutorial-screen-stubs";
import {
  ResizeObserverStub,
  TUTORIAL_AVATARS,
  battle,
  guideModel,
  installTutorialScreenHarness,
  renderTutorialScreen,
  setDesktopViewport,
  setRect,
  speechAction,
  tutorialView,
} from "./__test-helpers__/tutorial-screen-fixtures";
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

const emptyRanks = {
  enemy: { backRank: [], frontRank: [] },
  player: { backRank: [], frontRank: [] },
};
const emptyStatus = { avatar: null, currentEnergy: 0, maxEnergy: 0, points: 0 };

describe("TutorialScreen scene entry, dialogue, and avatar arrival", () => {
  it("applies an authored desktop width to guide speech", () => {
    setDesktopViewport(true);
    const { container } = renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:width"), {
        dialogue: {
          kind: "guide",
          delay: 1,
          horizontalOffset: 20,
          verticalOffset: 0,
          bubbleWidth: 450,
          model: guideModel("A custom greeting."),
        },
        currentAction: speechAction(
          testTutorialActionId("greeting"),
          {
            delay: 1,
            horizontalOffset: 20,
            bubbleWidth: 450,
            text: "A custom greeting.",
          },
          1,
        ),
        battle: battle(emptyRanks),
      }),
    );

    const dialogueAnchor = container.querySelector<HTMLElement>(
      "[data-tutorial-dialogue-anchor]",
    );
    expect(dialogueAnchor?.style.maxWidth).toBe("450px");
    expect(dialogueAnchor?.style.left).toBe("20px");
  });

  it("starts an action wait only after the scene has entered", () => {
    vi.useFakeTimers();
    const onActionComplete = vi.fn();
    const { container } = renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:1"), {
        dialogue: {
          kind: "guide",
          delay: 1,
          horizontalOffset: 0,
          verticalOffset: 0,
          model: guideModel("Welcome, Dreamer."),
        },
        currentAction: speechAction(testTutorialActionId("welcome"), {
          delay: 1,
          text: "Welcome, Dreamer.",
        }),
      }),
      { playbackSpeed: 4, onActionComplete },
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    expect(screenMocks.sceneTransition).toEqual({ duration: 0.3 });
    expect(screenMocks.props?.playbackSpeed).toBe(4);
    expect(screenMocks.dialogueProps?.playbackSpeed).toBe(4);
    expect(
      container
        .querySelector<HTMLElement>("[data-tutorial-screen]")
        ?.style.getPropertyValue("--dur-slow"),
    ).toBe("0.105s");

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:1",
      testTutorialActionId("welcome"),
    );
  });

  it("fades in the battle before revealing CharacterDialogue", () => {
    const { container } = renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:1"), {
        dialogue: {
          kind: "guide",
          horizontalOffset: 40,
          verticalOffset: 100,
          bubbleWidth: 450,
          model: guideModel("Welcome, Dreamer."),
        },
        currentAction: speechAction(
          testTutorialActionId("welcome"),
          { horizontalOffset: 40, text: "Welcome, Dreamer." },
          3,
        ),
        battle: battle(emptyRanks),
      }),
    );

    const tutorialScreen = container.querySelector<HTMLElement>(
      "[data-tutorial-screen]",
    );
    expect(tutorialScreen).not.toBeNull();
    expect(
      container.querySelector("[data-battle-mobile='tutorial-battle']"),
    ).not.toBeNull();
    expect(screenMocks.props?.inspectorDefault).toBe("collapsed");
    expect(screenMocks.props?.phaseNavigation).toBe("hidden");
    expect(screenMocks.props?.zoneLabels).toBe("voids");
    const dialogueAnchor = container.querySelector<HTMLElement>(
      "[data-tutorial-dialogue-anchor]",
    );
    expect(dialogueAnchor?.style.left).not.toBe("40px");
    expect(dialogueAnchor?.style.top).toBe("100px");
    expect(dialogueAnchor?.style.maxWidth).toBe("");
    expect(
      container.querySelector("[data-character-dialogue='Mira']"),
    ).not.toBeNull();
    expect(screenMocks.dialogueProps).toMatchObject({
      dialogue: { speakerName: "Mira", text: "Welcome, Dreamer." },
      size: "compact",
      visible: false,
    });

    act(() => screenMocks.sceneAnimationComplete?.());

    expect(screenMocks.dialogueProps?.visible).toBe(true);
    tutorialScreen!.style.setProperty("--space-l", "16px");
    setRect(tutorialScreen, { width: 390, height: 844 });
    setRect(container.querySelector("[data-character-dialogue]"), {
      width: 300,
      height: 64,
    });
    act(() => ResizeObserverStub.flush());
    expect(dialogueAnchor?.style.top).toBe("410px");
  });

  it("anchors reveal dialogue below the centered reading card on mobile", () => {
    const { container } = renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:reveal-dialogue"), {
        dialogue: {
          kind: "guide",
          horizontalOffset: 0,
          verticalOffset: 0,
          model: guideModel("This card has a ▸Dawn ability."),
        },
        currentAction: {
          id: testTutorialActionId("runebound-reveal"),
          action: "reveal-and-play-opponent-card",
          cardId: testCardId("a28ad36d-fa74-4190-a463-7efd3a6233d0"),
          revealDuration: 5,
          speechBubble: {
            speaker: "mira",
            duration: 5,
            horizontalOffset: 0,
            verticalOffset: 0,
            bubbleWidth: 700,
            text: "This card has a ▸Dawn ability.",
          },
          wait: 0,
        },
        battle: battle({ enemyHand: [], ...emptyRanks }),
      }),
    );

    const dialogueAnchor = container.querySelector<HTMLElement>(
      "[data-tutorial-dialogue-anchor]",
    );
    expect(dialogueAnchor?.style.top).toBe("");
    expect(dialogueAnchor?.style.bottom).not.toBe("");
    expect(dialogueAnchor?.style.visibility).toBe("visible");
  });

  it("places opposing speech beside the portrait rim with a top-left pointer", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function rectForElement(this: HTMLElement) {
        if (this.matches("[data-tutorial-screen]")) {
          return DOMRect.fromRect({ x: 0, y: 0, width: 390, height: 844 });
        }
        if (this.matches("[data-avatar-source]")) {
          return DOMRect.fromRect({ x: 173, y: 100, width: 44, height: 44 });
        }
        if (this.matches("[data-tutorial-avatar-dialogue] aside")) {
          return DOMRect.fromRect({ x: 0, y: 0, width: 150, height: 90 });
        }
        return DOMRect.fromRect();
      },
    );
    const { container } = renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:4"), {
        avatars: {
          ...TUTORIAL_AVATARS,
          enemy: { ...TUTORIAL_AVATARS.enemy, settled: true },
        },
        dialogue: {
          kind: "avatar",
          owner: "enemy",
          speakerName: "Threxan",
          text: "For the Abyss!",
        },
        currentAction: speechAction(
          testTutorialActionId("vrakmoth-taunt"),
          { speaker: "enemy", bubbleWidth: 300, text: "For the Abyss!" },
          3,
        ),
        battle: battle({
          enemy: {
            status: {
              avatar: TUTORIAL_AVATARS.enemy.visual,
              avatarProfile: TUTORIAL_AVATARS.enemy.profile,
              currentEnergy: 0,
              maxEnergy: 0,
              points: 0,
            },
          },
        }),
      }),
    );

    act(() => screenMocks.sceneAnimationComplete?.());

    const overlay = container.querySelector<HTMLElement>(
      '[data-tutorial-avatar-dialogue-owner="enemy"]',
    );
    const bubble = container.querySelector<HTMLElement>(
      '[data-testid="tutorial-enemy-avatar-speech-bubble"]',
    );
    expect(
      container.querySelector("[data-avatar-source]")?.getBoundingClientRect(),
    ).toMatchObject({ x: 173, y: 100, width: 44, height: 44 });
    expect(bubble?.getBoundingClientRect()).toMatchObject({
      width: 150,
      height: 90,
    });
    expect(overlay?.style.left).toBe("162px");
    expect(overlay?.style.top).toBe("142px");
    expect(overlay?.style.visibility).toBe("visible");
    expect(bubble?.dataset.speechBubblePointerPlacement).toBe("top-left");
    expect(bubble?.textContent).toContain("For the Abyss!");
  });

  it("uses the prominent dialogue scale on desktop", () => {
    setDesktopViewport(true);
    renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:1"), {
        dialogue: {
          kind: "guide",
          horizontalOffset: 0,
          verticalOffset: 0,
          model: guideModel("Welcome, Dreamer."),
        },
        currentAction: speechAction(
          testTutorialActionId("welcome"),
          { text: "Welcome, Dreamer." },
          3,
        ),
        battle: battle(emptyRanks),
      }),
    );

    expect(screenMocks.dialogueProps?.size).toBe("prominent");
  });
  it("finishes the portrait animation before applying its authored wait", () => {
    vi.useFakeTimers();
    const onActionComplete = vi.fn();
    const onAvatarArrivalComplete = vi.fn();
    const { container } = renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:2"), {
        dialogue: {
          kind: "guide",
          horizontalOffset: 0,
          verticalOffset: 0,
          model: guideModel("Welcome, Dreamer."),
        },
        currentAction: {
          id: testTutorialActionId("avatar-arrival"),
          action: "animate-avatar-portrait",
          owner: "player",
          pause: 1,
          duration: 0.6,
          wait: 0.5,
        },
        battle: battle({ player: { status: emptyStatus } }),
      }),
      { onActionComplete, onAvatarArrivalComplete },
    );

    setRect(container.querySelector("[data-tutorial-screen]"), {
      width: 390,
      height: 844,
    });
    setRect(
      container.querySelector(
        '[data-testid="player-battle-status"] [data-battle-status-avatar-placeholder]',
      ),
      { x: 173, y: 700, width: 44, height: 44 },
    );
    setRect(
      container.querySelector("[data-character-dialogue-portrait-frame]"),
      { x: 18, y: 334, width: 176, height: 176 },
    );

    act(() => screenMocks.sceneAnimationComplete?.());

    expect(
      container.querySelector("[data-tutorial-avatar-arrival]"),
    ).not.toBeNull();
    expect(screenMocks.dialogueProps).toMatchObject({
      dialogue: { text: "Welcome, Dreamer." },
      visible: true,
    });
    expect(screenMocks.arrivalInitial).toMatchObject({
      x: 173,
      y: 400,
      scale: 4,
      opacity: 1,
    });
    expect(screenMocks.arrivalAnimate).toMatchObject({
      y: [400, 400, 700],
      scale: [4, 4, 1],
      opacity: 1,
    });
    const arrivalTransition = screenMocks.arrivalTransition as {
      readonly duration: number;
      readonly times: readonly number[];
    };
    expect(arrivalTransition.duration).toBeCloseTo(1.6);
    expect(arrivalTransition.times[0]).toBe(0);
    expect(arrivalTransition.times[1]).toBeCloseTo(1 / 1.6);
    expect(arrivalTransition.times[2]).toBe(1);
    expect(onActionComplete).not.toHaveBeenCalled();

    act(() => screenMocks.arrivalAnimationComplete?.());

    expect(onAvatarArrivalComplete).toHaveBeenCalledWith(
      TUTORIAL_AVATARS.player.profile.id,
      "player",
    );
    expect(screenMocks.props?.view.player.status).toMatchObject({
      avatar: TUTORIAL_AVATARS.player.visual,
      avatarProfile: TUTORIAL_AVATARS.player.profile,
    });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:2",
      testTutorialActionId("avatar-arrival"),
    );
  });

  it("animates the opponent portrait into the enemy battle status", () => {
    const onAvatarArrivalComplete = vi.fn();
    const { container } = renderTutorialScreen(
      tutorialView(parseTutorialRunId("event:3"), {
        avatars: {
          ...TUTORIAL_AVATARS,
          player: { ...TUTORIAL_AVATARS.player, settled: true },
        },
        currentAction: {
          id: testTutorialActionId("vrakmoth-arrival"),
          action: "animate-avatar-portrait",
          owner: "enemy",
          pause: 1.5,
          duration: 0.6,
          wait: 0,
        },
        battle: battle({
          enemy: { status: emptyStatus },
          player: { status: emptyStatus },
          inspector: { opponentName: "Awaiting Avatar" },
        }),
      }),
      { onAvatarArrivalComplete },
    );

    setRect(container.querySelector("[data-tutorial-screen]"), {
      width: 390,
      height: 844,
    });
    setRect(
      container.querySelector(
        '[data-testid="enemy-battle-status"] [data-battle-status-avatar-placeholder]',
      ),
      { x: 173, y: 100, width: 44, height: 44 },
    );
    setRect(
      container.querySelector(
        '[data-testid="player-battle-status"] [data-avatar-source]',
      ),
      { x: 173, y: 700, width: 44, height: 44 },
    );

    act(() => screenMocks.sceneAnimationComplete?.());

    expect(
      container.querySelector(
        '[data-tutorial-avatar-arrival][data-tutorial-avatar-owner="enemy"]',
      ),
    ).not.toBeNull();
    expect(screenMocks.arrivalInitial).toMatchObject({
      x: 173,
      y: 400,
      scale: 1,
      opacity: 1,
    });
    expect(screenMocks.arrivalAnimate).toMatchObject({
      y: [400, 400, 100],
      scale: [1, 1, 1],
    });

    act(() => screenMocks.arrivalAnimationComplete?.());

    expect(onAvatarArrivalComplete).toHaveBeenCalledWith(
      TUTORIAL_AVATARS.enemy.profile.id,
      "enemy",
    );
    expect(screenMocks.props?.view.enemy.status).toMatchObject({
      avatar: TUTORIAL_AVATARS.enemy.visual,
      avatarProfile: TUTORIAL_AVATARS.enemy.profile,
    });
    expect(screenMocks.props?.view.inspector.opponentName).toBe(
      TUTORIAL_AVATARS.enemy.visual.name,
    );
  });
});
