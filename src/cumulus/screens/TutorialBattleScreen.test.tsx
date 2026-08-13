// @vitest-environment jsdom

import { assertLocalized } from "@trox/runtime";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import { CumulusRoot } from "../CumulusRoot";
import {
  TUTORIAL_BATTLE_REVEAL_TRAVEL_SECONDS,
  TUTORIAL_CHALLENGE_TRAVEL_SECONDS,
  TutorialBattleScreen,
  type TutorialBattleMovementStatus,
  type TutorialBattleView,
} from "./TutorialBattleScreen";
import type {
  MobileBattleCardView,
  MobileBattleInteractions,
} from "./MobileBattleScreen";

const reducedMotionPreference = vi.hoisted(() => ({ value: false }));
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return {
    ...actual,
    LayoutGroup: ({
      id,
      children,
    }: {
      readonly id?: string;
      readonly children: ReactNode;
    }) => <div data-test-layout-group={id}>{children}</div>,
    useReducedMotion: () => reducedMotionPreference.value,
  };
});

const mobileBattleProps = vi.fn();
vi.mock("./MobileBattleScreen", () => ({
  MobileBattleScreen: (props: unknown) => {
    mobileBattleProps(props);
    const testCard = (
      props as {
        readonly view: TutorialBattleView["battle"] & {
          readonly testChallengeCards?: readonly {
            readonly id: string;
            readonly zone?: "player-void" | "enemy-void";
          }[];
        };
      }
    ).view.testChallengeCards;
    return (
      <main data-test-mobile-battle="">
        {testCard?.map((card) => (
          <div key={card.id} data-battle-zone={card.zone}>
            <div data-battle-card-id={card.id} />
          </div>
        ))}
      </main>
    );
  },
}));

const interactions: MobileBattleInteractions = {
  canInteract: false,
  pendingCardId: null,
  targetSelectionPrompt: null,
  onHandCardActivate: vi.fn(),
  onCardDragStart: vi.fn(),
  onCardDragEnd: vi.fn(),
  onSlotDrop: vi.fn(),
  onZoneDrop: vi.fn(),
  onPreviousPhase: vi.fn(),
  onNextPhase: vi.fn(),
};

class ResizeObserverStub {
  observe(_target: Element) {}
  unobserve(_target: Element) {}
  disconnect() {}
}

function view(overrides: Partial<TutorialBattleView> = {}): TutorialBattleView {
  const result: TutorialBattleView = {
    battle: {
      battleId: "tutorial-battle",
      inspector: { turn: "2" },
      activeSide: "player",
    } as TutorialBattleView["battle"],
    challengeOriginBattle: null,
    ownership: "driver",
    driverClientId: "driver-client",
    manualControls: false,
    foresee: null,
    presentationId: null,
    presentation: null,
    victoryVisible: false,
    ...overrides,
  };
  return {
    ...result,
    presentationId:
      overrides.presentationId ??
      overrides.presentation?.presentationId ??
      result.presentationId,
  };
}

function opponentPlayCard(): MobileBattleCardView {
  const cardId = asCardId("5a980eff-6ec7-44d8-9977-b98e66bbc2c8");
  return {
    id: "enemy-card-1",
    model: {
      cardId,
      displaySnapshot: {
        id: cardId,
        name: asCardName("Synthetic Troubadour"),
        cardNumber: 510,
        cardType: "Character",
        subtype: "Musician",
        isStarter: true,
        energyCost: 2,
        spark: 2,
        isFast: false,
        renderedText: "",
        imageNumber: 510,
        artOwned: true,
      },
    },
    exhausted: true,
    figment: false,
    storedTime: 0,
    showPlayableOutline: false,
  };
}

function mount(
  screenView: TutorialBattleView,
  movementStatusMessage: TutorialBattleMovementStatus | null = null,
  onMovementStatusDismiss = vi.fn(),
  onPresentationVisible = vi.fn(),
  onNewJourney = vi.fn(),
  screenInteractions = interactions,
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <CumulusRoot>
        <TutorialBattleScreen
          view={screenView}
          interactions={screenInteractions}
          movementStatusMessage={movementStatusMessage}
          onMovementStatusDismiss={onMovementStatusDismiss}
          onForeseeConfirm={() => {}}
          onNewJourney={onNewJourney}
          guidance={null}
          onGuidanceContinue={() => {}}
          onGuidanceDurationComplete={() => {}}
          onPresentationVisible={onPresentationVisible}
        />
      </CumulusRoot>,
    );
  });
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = ResizeObserverStub;
  reducedMotionPreference.value = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  document.body.innerHTML = "";
  mobileBattleProps.mockClear();
});

describe("TutorialBattleScreen", () => {
  it("holds Victory centered before its slower move and action reveal", () => {
    const onNewJourney = vi.fn();
    const { container, root } = mount(
      view({ victoryVisible: true }),
      null,
      vi.fn(),
      vi.fn(),
      onNewJourney,
    );
    const victory = container.querySelector("[data-tutorial-victory-screen]");
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="tutorial-battle-new-journey"]',
    );
    const title = victory?.querySelector<HTMLElement>(
      "[data-radial-announcement-headline]",
    );
    const action = victory?.querySelector<HTMLElement>(
      "[data-tutorial-victory-action]",
    );
    const titleCopy = victory?.querySelector<HTMLElement>(
      "[data-radial-announcement-copy]",
    );

    expect(victory).not.toBeNull();
    expect(
      victory?.querySelector("[data-radial-announcement-orbit]"),
    ).not.toBeNull();
    expect(
      victory?.querySelector("[data-radial-announcement-ripple]"),
    ).not.toBeNull();
    expect(
      Array.from(victory?.querySelectorAll("button") ?? []).map(
        (candidate) => candidate.textContent,
      ),
    ).toEqual(["New Journey"]);
    expect(title?.tagName).toBe("H1");
    expect(title?.textContent).toBe("Victory");
    expect(title?.style.animation).toContain(
      "radial-announcement-victory-title-move calc(var(--dur-slow) * 3)",
    );
    expect(title?.style.animation).toContain("3s both");
    expect(titleCopy?.style.animation).toContain(
      "radial-announcement-victory-title-fade calc(var(--dur-slow) * 0.7)",
    );
    expect(action?.style.animation).toContain(
      "tutorial-victory-action calc(var(--dur-slow) * 1.4)",
    );
    expect(action?.style.animation).toContain(
      "calc(3s + var(--dur-slow) * 3) both",
    );
    expect(action?.hasAttribute("data-tutorial-victory-action-entering")).toBe(
      true,
    );
    expect(victory?.querySelectorAll("h1, h2, p")).toHaveLength(1);
    act(() => button?.click());
    expect(onNewJourney).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it.each(["driver", "observer"] as const)(
    "keeps normal %s play free of persistent tutorial-state chrome",
    (ownership) => {
      const { container, root } = mount(view({ ownership }));

      expect(
        container.querySelector("[data-tutorial-battle-ownership-panel]"),
      ).toBeNull();
      expect(container.textContent).not.toContain("Tutorial Battle");
      expect(container.textContent).not.toContain("Driver:");

      act(() => root.unmount());
    },
  );

  it("keeps the battle visible while an absent driver is being replaced", () => {
    const { container, root } = mount(
      view({ ownership: "paused-driver-absent" }),
    );

    expect(container.querySelector("[data-test-mobile-battle]")).not.toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => root.unmount());
  });

  it("shows a dismissible Cumulus warning when movement cannot resolve", () => {
    const dismiss = vi.fn();
    const { container, root } = mount(
      view(),
      "exhausted-front-rank",
      dismiss,
    );
    const toast = container.querySelector<HTMLButtonElement>(
      '[data-transient-status-toast="warning"]',
    );

    expect(toast?.textContent?.trim()).not.toBe("");
    act(() => toast?.click());
    expect(dismiss).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("keeps target selection in a compact top-edge banner", () => {
    const cancel = vi.fn();
    const { container, root } = mount(
      view({ manualControls: true }),
      null,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      {
        ...interactions,
        targetSelectionPrompt: "legal-target",
        onTargetSelectionCancel: cancel,
      },
    );
    const prompt = container.querySelector<HTMLElement>(
      "[data-tutorial-target-selection]",
    );
    const header = prompt?.querySelector("[data-glass-panel-header]");
    const cancelButton = prompt?.querySelector<HTMLButtonElement>(
      '[data-testid="tutorial-target-cancel"]',
    );

    expect(prompt?.style.width).toBe("90vw");
    expect(prompt?.style.maxWidth).toBe("416px");
    expect(prompt?.querySelector("h2")?.textContent?.trim()).not.toBe("");
    expect(prompt?.textContent?.trim()).not.toBe("");
    expect(header?.contains(cancelButton ?? null)).toBe(true);
    expect(prompt?.querySelector("[data-glass-panel-footer]")).toBeNull();
    act(() => cancelButton?.click());
    expect(cancel).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("animates an opponent card at full reveal size before starting its dwell", () => {
    vi.useFakeTimers();
    const onPresentationVisible = vi.fn();
    const { container, root } = mount(
      view({
        presentation: {
          kind: "opponent-play",
          presentationId: "opponent-play:enemy-card-1",
          cardId: "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
          battleCardId: "enemy-card-1",
          cardKind: "character",
          card: opponentPlayCard(),
        },
      }),
      null,
      vi.fn(),
      onPresentationVisible,
    );

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(
      container.querySelector("[data-tutorial-opponent-play-reveal]"),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="tutorial-opponent-play-card"]'),
    ).not.toBeNull();
    expect(mobileBattleProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cardLayoutGroup: "inherited",
        viewport: "contained",
      }),
    );
    expect(
      container.querySelector<HTMLElement>(
        "[data-tutorial-opponent-play-reveal]",
      )?.dataset.battleCardLayoutId,
    ).toBe("battle-card:enemy-card-1");
    const sharedLayoutGroup = container.querySelector<HTMLElement>(
      '[data-test-layout-group="tutorial-battle:tutorial-battle"]',
    );
    expect(
      sharedLayoutGroup?.querySelector("[data-test-mobile-battle]"),
    ).not.toBeNull();
    expect(
      sharedLayoutGroup?.querySelector("[data-tutorial-opponent-play-reveal]"),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>("[data-tutorial-live-battle]")
        ?.style,
    ).toMatchObject({ position: "fixed", width: "100vw", height: "100dvh" });
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

    act(() => root.unmount());
  });

  it("snaps the revealed card into place when reduced motion is requested", () => {
    vi.useFakeTimers();
    reducedMotionPreference.value = true;
    const onPresentationVisible = vi.fn();
    const { container, root } = mount(
      view({
        presentation: {
          kind: "opponent-play",
          presentationId: "opponent-play:enemy-card-1",
          cardId: "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
          battleCardId: "enemy-card-1",
          cardKind: "character",
          card: opponentPlayCard(),
        },
      }),
      null,
      vi.fn(),
      onPresentationVisible,
    );
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

    act(() => root.unmount());
  });

  it("reports a visible opponent-block checkpoint so the deferred turn can resume", () => {
    const onPresentationVisible = vi.fn();
    const presentationId = "opponent-block:enemy:4";
    const { root } = mount(
      view({
        presentation: {
          kind: "opponent-block",
          presentationId,
        },
      }),
      null,
      vi.fn(),
      onPresentationVisible,
    );

    expect(onPresentationVisible).toHaveBeenCalledOnce();
    expect(onPresentationVisible).toHaveBeenCalledWith(presentationId);

    act(() => root.unmount());
  });

  it("holds a paired Challenge while a controlled loser travels from its lane to the player void", () => {
    vi.useFakeTimers();
    const onPresentationVisible = vi.fn();
    const presentationId = "challenge-resolved:enemy:4:F2";
    const animations = [
      {
        addEventListener: vi.fn(),
        cancel: vi.fn(),
      },
      {
        addEventListener: vi.fn(),
        cancel: vi.fn(),
      },
    ];
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
      battleId: "tutorial-battle",
      inspector: { turn: "2" },
      activeSide: "enemy",
      testChallengeCards: [
        { id: "player-loser-uuid" },
        { id: "enemy-loser-uuid" },
      ],
    } as unknown as TutorialBattleView["battle"];
    const settledBattle = {
      ...originBattle,
      activeSide: "player",
      testChallengeCards: [
        {
          id: "player-loser-uuid",
          zone: "player-void",
        },
        {
          id: "enemy-loser-uuid",
          zone: "enemy-void",
        },
      ],
    } as TutorialBattleView["battle"];
    const { container, root } = mount(
      view({
        battle: settledBattle,
        challengeOriginBattle: originBattle,
        presentation: {
          kind: "challenge-resolved",
          presentationId,
          paired: true,
          dissolved: [
            { battleCardId: "player-loser-uuid", side: "player" },
            { battleCardId: "enemy-loser-uuid", side: "enemy" },
          ],
          scored: null,
        },
      }),
      null,
      vi.fn(),
      onPresentationVisible,
    );
    const firstProps = mobileBattleProps.mock.lastCall?.[0] as {
      readonly view: TutorialBattleView["battle"];
    };

    expect(
      container.querySelector('[data-tutorial-challenge-animation="paired"]'),
    ).toBeNull();
    expect(firstProps.view).toBe(originBattle);
    expect(onPresentationVisible).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(40);
    });
    const settledProps = mobileBattleProps.mock.lastCall?.[0] as {
      readonly view: TutorialBattleView["battle"];
    };
    expect(settledProps.view).toBe(settledBattle);
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

    act(() => root.unmount());
    expect(animations[1].cancel).toHaveBeenCalledOnce();
  });

  it("attaches unpaired Challenge points to the scoring battlefield card", () => {
    const onPresentationVisible = vi.fn();
    const presentationId = "challenge-resolved:player:5:F3";
    const { container, root } = mount(
      view({
        presentation: {
          kind: "challenge-resolved",
          presentationId,
          paired: false,
          dissolved: [],
          scored: {
            battleCardId: "player-character-uuid",
            side: "player",
            points: 2,
          },
        },
      }),
      null,
      vi.fn(),
      onPresentationVisible,
    );
    const props = mobileBattleProps.mock.lastCall?.[0] as {
      readonly cardOverlay?: unknown;
    };

    expect(props.cardOverlay).toEqual({
      kind: "points-scored",
      presentationId,
      battleCardId: "player-character-uuid",
      points: 2,
    });
    expect(
      container.querySelector('[data-tutorial-challenge-animation="points"]'),
    ).toBeNull();
    expect(onPresentationVisible).toHaveBeenCalledWith(presentationId);

    act(() => root.unmount());
  });

  it("releases a presentation whose optional render payload is unavailable", () => {
    const onPresentationVisible = vi.fn();
    const { root } = mount(
      view({
        presentationId: "opponent-play:missing-card",
        presentation: null,
      }),
      null,
      vi.fn(),
      onPresentationVisible,
    );

    expect(onPresentationVisible).toHaveBeenCalledWith(
      "opponent-play:missing-card",
    );

    act(() => root.unmount());
  });

  it("reports a Dreamwell reveal as visible only after the turn announcement", () => {
    const onPresentationVisible = vi.fn();
    const { root } = mount(
      view({
        battle: {
          battleId: "tutorial-battle",
          inspector: { turn: "3" },
          activeSide: "enemy",
        } as TutorialBattleView["battle"],
        presentation: {
          kind: "dreamwell-reveal",
          presentationId:
            "dreamwell-reveal:enemy:3:5ec17498-9028-4a01-80a0-67c91b03d505",
          cardId: "5ec17498-9028-4a01-80a0-67c91b03d505",
          side: "enemy",
        },
      }),
      null,
      vi.fn(),
      onPresentationVisible,
    );

    expect(onPresentationVisible).not.toHaveBeenCalled();

    act(() => {
      const props = mobileBattleProps.mock.lastCall?.[0] as {
        onTurnAnnouncementComplete?: (side: "player" | "enemy") => void;
      };
      props.onTurnAnnouncementComplete?.("enemy");
    });
    expect(onPresentationVisible).toHaveBeenCalledOnce();
    expect(onPresentationVisible).toHaveBeenCalledWith(
      "dreamwell-reveal:enemy:3:5ec17498-9028-4a01-80a0-67c91b03d505",
    );

    act(() => root.unmount());
  });

  it("waits for the opponent-turn announcement before mounting Dreamwell guidance", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const playerTurn = view({
      battle: {
        battleId: "tutorial-battle",
        inspector: { turn: "2" },
        activeSide: "player",
      } as TutorialBattleView["battle"],
    });
    const enemyTurn = view({
      battle: {
        battleId: "tutorial-battle",
        inspector: { turn: "3" },
        activeSide: "enemy",
      } as TutorialBattleView["battle"],
    });
    const guidance = {
      presentationId: "guidance:erode",
      triggerId: "erode",
      messageIndex: 0,
      messageCount: 1,
      duration: 3,
      dialogue: {
        portrait: {
          kind: "character-portrait" as const,
          characterId: "mira" as const,
        },
        portraitAlt: assertLocalized("Mira"),
        speakerName: assertLocalized("Mira"),
        text: assertLocalized("Erode sends cards to the void."),
      },
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 700,
      source: {
        kind: "dreamwell" as const,
        side: "enemy" as const,
        model: {
          cardId: asCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
          displaySnapshot: {
            id: asCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
            name: assertLocalized("Shadow Passage"),
            renderedText: assertLocalized("Erode 3."),
            energyAdded: 1,
            imageNumber: 3,
          },
        },
      },
    };
    const render = (
      screenView: TutorialBattleView,
      currentGuidance: typeof guidance | null,
    ): void => {
      act(() => {
        root.render(
          <CumulusRoot>
            <TutorialBattleScreen
              view={screenView}
              interactions={interactions}
              movementStatusMessage={null}
              onMovementStatusDismiss={() => {}}
              onForeseeConfirm={() => {}}
              onNewJourney={() => {}}
              guidance={currentGuidance}
              onGuidanceContinue={() => {}}
              onGuidanceDurationComplete={() => {}}
              onPresentationVisible={() => {}}
            />
          </CumulusRoot>,
        );
      });
    };

    render(playerTurn, null);
    render(enemyTurn, guidance);
    expect(
      container.querySelector('[data-testid="battle-tutorial-dreamwell"]'),
    ).toBeNull();

    act(() => {
      const props = mobileBattleProps.mock.lastCall?.[0] as {
        onTurnAnnouncementComplete?: (side: "player" | "enemy") => void;
      };
      props.onTurnAnnouncementComplete?.("enemy");
    });
    expect(
      container.querySelector('[data-testid="battle-tutorial-dreamwell"]'),
    ).not.toBeNull();

    act(() => root.unmount());
  });
});
