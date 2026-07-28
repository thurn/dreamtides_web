// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import { CumulusRoot } from "../CumulusRoot";
import {
  TUTORIAL_BATTLE_REVEAL_TRAVEL_SECONDS,
  TutorialBattleScreen,
  type TutorialBattleView,
} from "./TutorialBattleScreen";
import type { MobileBattleCardView } from "./MobileBattleScreen";

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
    return <main data-test-mobile-battle="" />;
  },
}));

const interactions = {
  canInteract: false,
  pendingCardId: null,
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

function view(
  overrides: Partial<TutorialBattleView> = {},
): TutorialBattleView {
  const result: TutorialBattleView = {
    battle: {
      battleId: "tutorial-battle",
      inspector: { turn: "2" },
      activeSide: "player",
    } as TutorialBattleView["battle"],
    ownership: "driver",
    driverClientId: "driver-client",
    manualControls: false,
    foresee: null,
    presentationId: null,
    presentation: null,
    victorySummary: null,
    terminalRestartAvailable: false,
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
    figmentTitleBar: false,
    figmentCount: 0,
    storedTime: 0,
    showPlayableOutline: false,
  };
}

function mount(
  screenView: TutorialBattleView,
  movementStatusMessage: string | null = null,
  onMovementStatusDismiss = vi.fn(),
  onPresentationVisible = vi.fn(),
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <CumulusRoot>
        <TutorialBattleScreen
          view={screenView}
          interactions={interactions}
          movementStatusMessage={movementStatusMessage}
          onMovementStatusDismiss={onMovementStatusDismiss}
          onForeseeConfirm={() => {}}
          onRestart={() => {}}
          onReturnToMainMenu={() => {}}
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
  document.body.innerHTML = "";
  mobileBattleProps.mockClear();
});

describe("TutorialBattleScreen", () => {
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

  it("keeps the absent-driver restart available as a blocking recovery action", () => {
    const { container, root } = mount(
      view({ ownership: "paused-driver-absent" }),
    );

    expect(container.querySelector('[role="dialog"]')?.textContent)
      .toContain("Battle Paused");
    expect(
      container.querySelector('[data-testid="tutorial-battle-restart"]'),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("shows a dismissible Cumulus warning when movement cannot resolve", () => {
    const dismiss = vi.fn();
    const { container, root } = mount(
      view(),
      "This character is exhausted and cannot move to the front rank.",
      dismiss,
    );
    const toast = container.querySelector<HTMLButtonElement>(
      '[data-transient-status-toast="warning"]',
    );

    expect(toast?.textContent).toContain(
      "This character is exhausted and cannot move to the front rank.",
    );
    act(() => toast?.click());
    expect(dismiss).toHaveBeenCalledOnce();

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
      container.querySelector('[data-tutorial-opponent-play-reveal]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="tutorial-opponent-play-card"]',
      ),
    ).not.toBeNull();
    expect(mobileBattleProps).toHaveBeenLastCalledWith(expect.objectContaining({
      cardLayoutGroup: "inherited",
      viewport: "contained",
    }));
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
      sharedLayoutGroup?.querySelector(
        "[data-tutorial-opponent-play-reveal]",
      ),
    ).not.toBeNull();
    expect(container.querySelector<HTMLElement>("[data-tutorial-live-battle]")?.style)
      .toMatchObject({ position: "fixed", width: "100vw", height: "100dvh" });
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

  it.each(["opponent-block", "challenge-resolved"] as const)(
    "reports the visible %s board checkpoint so the deferred turn can resume",
    (kind) => {
      const onPresentationVisible = vi.fn();
      const presentationId = `${kind}:enemy:4`;
      const { root } = mount(
        view({
          presentation: {
            kind,
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
    },
  );

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
        portraitAlt: "Mira",
        speakerName: "Mira",
        text: "Erode sends cards to the void.",
      },
      verticalOffset: 0,
      bubbleWidth: 700,
      source: {
        kind: "dreamwell" as const,
        side: "enemy" as const,
        model: {
          cardId: asCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
          displaySnapshot: {
            id: asCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
            name: "Shadow Passage",
            renderedText: "Erode 3.",
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
              onRestart={() => {}}
              onReturnToMainMenu={() => {}}
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
