// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  completeTurnAnnouncement,
  installTutorialBattleHarness,
  interactions,
  lastBattleProps,
  mountTutorialBattle,
  opponentPlayView,
  tutorialBattleScreen,
  view,
  type TutorialBattleScreenInput,
} from "./__test-helpers__/tutorial-battle-screen-fixtures";
import {
  reducedMotionPreference,
  tutorialBattleProps,
} from "./__test-helpers__/tutorial-screen-stubs";
import {
  TUTORIAL_BATTLE_REVEAL_TRAVEL_SECONDS,
  TUTORIAL_CHALLENGE_TRAVEL_SECONDS,
  type TutorialBattleView,
} from "./TutorialBattleScreen";
import {
  parseBattleCardId,
  parseBattleId,
  parsePresentationId,
} from "../../types/identifiers";
import {
  testDreamwellCardId,
  testTutorialTriggerId,
} from "../../types/test-identities";

vi.mock("framer-motion", async (importOriginal) => {
  const stubs = await import("./__test-helpers__/tutorial-screen-stubs");
  return {
    ...(await importOriginal<typeof import("framer-motion")>()),
    LayoutGroup: stubs.LayoutGroupStub,
    useReducedMotion: () => stubs.reducedMotionPreference.value,
  };
});
vi.mock("./MobileBattleScreen", async () => {
  const stubs = await import("./__test-helpers__/tutorial-screen-stubs");
  return { MobileBattleScreen: stubs.TutorialBattleMobileScreenStub };
});

installTutorialBattleHarness();

describe("TutorialBattleScreen", () => {
  it("holds Victory before revealing its single New Journey action", () => {
    const onNewJourney = vi.fn();
    const { container } = mountTutorialBattle(view({ victoryVisible: true }), {
      onNewJourney,
    });
    const victory = container.querySelector("[data-tutorial-victory-screen]");

    expect(victory).not.toBeNull();
    expect(
      victory?.querySelector("[data-radial-announcement-orbit]"),
    ).not.toBeNull();
    expect(
      victory?.querySelector("[data-radial-announcement-ripple]"),
    ).not.toBeNull();
    expect(victory?.querySelectorAll("button")).toHaveLength(1);
    expect(
      victory?.querySelector("[data-radial-announcement-headline]")?.tagName,
    ).toBe("H1");
    expect(
      victory
        ?.querySelector("[data-tutorial-victory-action]")
        ?.hasAttribute("data-tutorial-victory-action-entering"),
    ).toBe(true);
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="tutorial-battle-new-journey"]',
        )
        ?.click(),
    );
    expect(onNewJourney).toHaveBeenCalledOnce();
  });

  it.each(["driver", "observer"] as const)(
    "keeps normal %s play free of persistent tutorial-state chrome",
    (ownership) => {
      const { container } = mountTutorialBattle(view({ ownership }));

      expect(
        container.querySelector("[data-tutorial-battle-ownership-panel]"),
      ).toBeNull();
    },
  );

  it("keeps the battle visible while an absent driver is being replaced", () => {
    const { container } = mountTutorialBattle(view({ ownership: "paused-driver-absent" }));

    expect(container.querySelector("[data-test-mobile-battle]")).not.toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("shows a dismissible Cumulus warning when movement cannot resolve", () => {
    const onMovementStatusDismiss = vi.fn();
    const { container } = mountTutorialBattle(view(), {
      movementStatusMessage: "exhausted-front-rank",
      onMovementStatusDismiss,
    });
    const toast = container.querySelector<HTMLButtonElement>(
      '[data-transient-status-toast="warning"]',
    );

    expect(toast?.textContent?.trim()).not.toBe("");
    act(() => toast?.click());
    expect(onMovementStatusDismiss).toHaveBeenCalledOnce();
  });

  it("keeps target selection in a compact top-edge banner", () => {
    const cancel = vi.fn();
    const { container } = mountTutorialBattle(view({ manualControls: true }), {
      interactions: {
        ...interactions,
        targetSelectionPrompt: "legal-target",
        onTargetSelectionCancel: cancel,
      },
    });
    const prompt = container.querySelector<HTMLElement>(
      "[data-tutorial-target-selection]",
    );
    const header = prompt?.querySelector("[data-glass-panel-header]");
    const cancelButton = prompt?.querySelector<HTMLButtonElement>(
      '[data-testid="tutorial-target-cancel"]',
    );

    expect(prompt?.querySelector("h2")?.textContent?.trim()).not.toBe("");
    expect(header?.contains(cancelButton ?? null)).toBe(true);
    expect(prompt?.querySelector("[data-glass-panel-footer]")).toBeNull();
    act(() => cancelButton?.click());
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("animates an opponent card at full reveal size before starting its dwell", () => {
    vi.useFakeTimers();
    const onPresentationVisible = vi.fn();
    const { container } = mountTutorialBattle(opponentPlayView(), { onPresentationVisible });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    const reveal = container.querySelector<HTMLElement>(
      "[data-tutorial-opponent-play-reveal]",
    );
    expect(reveal).not.toBeNull();
    expect(
      container.querySelector('[data-testid="tutorial-opponent-play-card"]'),
    ).not.toBeNull();
    expect(tutorialBattleProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cardLayoutGroup: "inherited",
        viewport: "contained",
      }),
    );
    expect(reveal?.dataset.battleCardLayoutId).toBe("battle-card:enemy-card-1");
    const sharedLayoutGroup = container.querySelector<HTMLElement>(
      '[data-test-layout-group="tutorial-battle:tutorial-battle"]',
    );
    expect(
      sharedLayoutGroup?.querySelector("[data-test-mobile-battle]"),
    ).not.toBeNull();
    expect(
      sharedLayoutGroup?.querySelector("[data-tutorial-opponent-play-reveal]"),
    ).not.toBeNull();
    expect(onPresentationVisible).not.toHaveBeenCalled();
    const revealTravelMs = TUTORIAL_BATTLE_REVEAL_TRAVEL_SECONDS * 1_000;
    act(() => {
      vi.advanceTimersByTime(revealTravelMs - 1);
    });
    expect(onPresentationVisible).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onPresentationVisible).toHaveBeenCalledWith(
      "opponent-play:enemy-card-1",
    );
  });

  it("snaps the revealed card into place when reduced motion is requested", () => {
    vi.useFakeTimers();
    reducedMotionPreference.value = true;
    const onPresentationVisible = vi.fn();
    const { container } = mountTutorialBattle(opponentPlayView(), { onPresentationVisible });
    const reveal = container.querySelector<HTMLElement>(
      "[data-tutorial-opponent-play-reveal]",
    );

    expect(reveal?.dataset.battleCardLayoutMotion).toBe("snap");
    expect(reveal?.dataset.battleCardLayoutId).toBeUndefined();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(onPresentationVisible).toHaveBeenCalledWith(
      "opponent-play:enemy-card-1",
    );
  });

  it("reports a visible opponent-block checkpoint so the deferred turn can resume", () => {
    const onPresentationVisible = vi.fn();
    const presentationId = "opponent-block:enemy:4";
    mountTutorialBattle(
      view({
        presentation: {
          kind: "opponent-block",
          presentationId: parsePresentationId(presentationId),
        },
      }),
      { onPresentationVisible },
    );

    expect(onPresentationVisible).toHaveBeenCalledOnce();
    expect(onPresentationVisible).toHaveBeenCalledWith(presentationId);
  });

  it("holds a paired Challenge while a controlled loser travels from its lane to the player void", () => {
    vi.useFakeTimers();
    const onPresentationVisible = vi.fn();
    const presentationId = "challenge-resolved:enemy:4:F2";
    const animations = [0, 1].map(() => ({
      addEventListener: vi.fn(),
      cancel: vi.fn(),
    }));
    let animationIndex = 0;
    const animate = vi.fn<HTMLElement["animate"]>(
      () => animations[animationIndex++] as unknown as Animation,
    );
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getSyntheticChallengeRect(this: HTMLElement) {
        if (this.dataset.battleCardId !== "player-loser-uuid") {
          return this.closest("[data-battle-zone='enemy-void']") === null
            ? new DOMRect(900, 200, 90, 90)
            : new DOMRect(300, 80, 100, 70);
        }
        return this.closest("[data-battle-zone='player-void']") === null
          ? new DOMRect(100, 120, 80, 96)
          : new DOMRect(700, 520, 100, 70);
      },
    );
    const originBattle = {
      battleId: parseBattleId("tutorial-battle"),
      inspector: { turn: "2" },
      activeSide: "enemy",
      testChallengeCards: [
        { id: parseBattleCardId("player-loser-uuid") },
        { id: parseBattleCardId("enemy-loser-uuid") },
      ],
    } as unknown as TutorialBattleView["battle"];
    const settledBattle = {
      ...originBattle,
      activeSide: "player",
      testChallengeCards: [
        { id: parseBattleCardId("player-loser-uuid"), zone: "player-void" },
        { id: parseBattleCardId("enemy-loser-uuid"), zone: "enemy-void" },
      ],
    } as TutorialBattleView["battle"];
    const { container, unmount } = mountTutorialBattle(
      view({
        battle: settledBattle,
        challengeOriginBattle: originBattle,
        presentation: {
          kind: "challenge-resolved",
          presentationId: parsePresentationId(presentationId),
          paired: true,
          dissolved: [
            {
              battleCardId: parseBattleCardId("player-loser-uuid"),
              side: "player",
            },
            {
              battleCardId: parseBattleCardId("enemy-loser-uuid"),
              side: "enemy",
            },
          ],
          scored: null,
        },
      }),
      { onPresentationVisible },
    );
    type BattleProps = { readonly view: TutorialBattleView["battle"] };

    expect(
      container.querySelector('[data-tutorial-challenge-animation="paired"]'),
    ).toBeNull();
    expect(lastBattleProps<BattleProps>().view).toBe(originBattle);
    expect(onPresentationVisible).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(lastBattleProps<BattleProps>().view).toBe(settledBattle);
    expect(
      container.querySelector('[data-tutorial-challenge-animation="paired"]'),
    ).not.toBeNull();
    expect(animate).toHaveBeenCalledTimes(2);
    const playerKeyframes = animate.mock.calls[0]?.[0] as Keyframe[];
    expect(playerKeyframes[0]?.transform).toBe(
      "translate(-600px, -400px) scale(0.8, 1.3714285714285714)",
    );
    const enemyKeyframes = animate.mock.calls[1]?.[0] as Keyframe[];
    expect(enemyKeyframes[0]?.transform).toBe(
      "translate(600px, 120px) scale(0.9, 1.2857142857142858)",
    );
    expect(animate.mock.calls[0]?.[1]).toMatchObject({
      duration: TUTORIAL_CHALLENGE_TRAVEL_SECONDS * 1_000,
      fill: "both",
    });
    expect(onPresentationVisible).toHaveBeenCalledWith(presentationId);

    const playerFinish = animations[0].addEventListener.mock.calls.find(
      ([eventName]) => eventName === "finish",
    )?.[1] as EventListener | undefined;
    playerFinish?.(new Event("finish"));
    expect(animations[0].cancel).toHaveBeenCalledOnce();

    unmount();
    expect(animations[1].cancel).toHaveBeenCalledOnce();
  });

  it("attaches unpaired Challenge points to the scoring battlefield card", () => {
    const onPresentationVisible = vi.fn();
    const presentationId = "challenge-resolved:player:5:F3";
    const { container } = mountTutorialBattle(
      view({
        presentation: {
          kind: "challenge-resolved",
          presentationId: parsePresentationId(presentationId),
          paired: false,
          dissolved: [],
          scored: {
            battleCardId: parseBattleCardId("player-character-uuid"),
            side: "player",
            points: 2,
          },
        },
      }),
      { onPresentationVisible },
    );

    expect(
      lastBattleProps<{ readonly cardOverlay?: unknown }>().cardOverlay,
    ).toEqual({
      kind: "points-scored",
      presentationId: parsePresentationId(presentationId),
      battleCardId: parseBattleCardId("player-character-uuid"),
      points: 2,
    });
    expect(
      container.querySelector('[data-tutorial-challenge-animation="points"]'),
    ).toBeNull();
    expect(onPresentationVisible).toHaveBeenCalledWith(presentationId);
  });

  it("releases a presentation whose optional render payload is unavailable", () => {
    const onPresentationVisible = vi.fn();
    mountTutorialBattle(
      view({
        presentationId: parsePresentationId("opponent-play:missing-card"),
        presentation: null,
      }),
      { onPresentationVisible },
    );

    expect(onPresentationVisible).toHaveBeenCalledWith(
      "opponent-play:missing-card",
    );
  });

  it("reports a Dreamwell reveal as visible only after the turn announcement", () => {
    const onPresentationVisible = vi.fn();
    const presentationId =
      "dreamwell-reveal:enemy:3:5ec17498-9028-4a01-80a0-67c91b03d505";
    mountTutorialBattle(
      view({
        battle: {
          battleId: parseBattleId("tutorial-battle"),
          inspector: { turn: "3" },
          activeSide: "enemy",
        } as TutorialBattleView["battle"],
        presentation: {
          kind: "dreamwell-reveal",
          presentationId: parsePresentationId(presentationId),
          cardId: testDreamwellCardId("5ec17498-9028-4a01-80a0-67c91b03d505"),
          side: "enemy",
        },
      }),
      { onPresentationVisible },
    );

    expect(onPresentationVisible).not.toHaveBeenCalled();
    completeTurnAnnouncement("enemy");
    expect(onPresentationVisible).toHaveBeenCalledOnce();
    expect(onPresentationVisible).toHaveBeenCalledWith(presentationId);
  });

  it("waits for the opponent-turn announcement before mounting Dreamwell guidance", () => {
    const turnView = (turn: string, activeSide: "player" | "enemy") =>
      view({
        battle: {
          battleId: parseBattleId("tutorial-battle"),
          inspector: { turn },
          activeSide,
        } as TutorialBattleView["battle"],
      });
    const dreamwellId = testDreamwellCardId(
      "03e4e701-4720-4278-8198-9b7e0514d4cf",
    );
    const guidance: TutorialBattleScreenInput["guidance"] = {
      presentationId: parsePresentationId("guidance:erode"),
      triggerId: testTutorialTriggerId("erode"),
      messageIndex: 0,
      messageCount: 1,
      duration: 3,
      dialogue: {
        portrait: { kind: "character-portrait", characterId: "mira" },
        portraitAlt: "Mira",
        speakerName: "Mira",
        text: "Erode sends cards to the void.",
      },
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 700,
      source: {
        kind: "dreamwell",
        side: "enemy",
        model: {
          cardId: dreamwellId,
          displaySnapshot: {
            id: dreamwellId,
            name: "Shadow Passage",
            renderedText: "Erode 3.",
            energyAdded: 1,
            imageNumber: 3,
          },
        },
      },
    };

    const { container, rerender } = mountTutorialBattle(turnView("2", "player"));
    rerender(tutorialBattleScreen(turnView("3", "enemy"), { guidance }));
    expect(
      container.querySelector('[data-testid="battle-tutorial-dreamwell"]'),
    ).toBeNull();

    completeTurnAnnouncement("enemy");
    expect(
      container.querySelector('[data-testid="battle-tutorial-dreamwell"]'),
    ).not.toBeNull();
  });
});
