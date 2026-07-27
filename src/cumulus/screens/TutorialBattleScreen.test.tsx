// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId } from "../../types/card-identity";
import { CumulusRoot } from "../CumulusRoot";
import { TutorialBattleScreen, type TutorialBattleView } from "./TutorialBattleScreen";

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
  return {
    battle: {
      battleId: "tutorial-battle",
      inspector: { turn: "2" },
      activeSide: "player",
    } as TutorialBattleView["battle"],
    ownership: "driver",
    driverClientId: "driver-client",
    manualControls: false,
    foresee: null,
    presentation: null,
    victorySummary: null,
    terminalRestartAvailable: false,
    ...overrides,
  };
}

function mount(
  screenView: TutorialBattleView,
  movementStatusMessage: string | null = null,
  onMovementStatusDismiss = vi.fn(),
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
});

afterEach(() => {
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

  it("keeps an opponent card in the battlefield while its authoritative dwell is active", () => {
    const { container, root } = mount(view({
      presentation: {
        kind: "opponent-play",
        cardId: "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
        battleCardId: "enemy-card-1",
        cardKind: "character",
      },
    }));

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[data-tutorial-opponent-play-reveal]')).toBeNull();
    expect(mobileBattleProps).toHaveBeenLastCalledWith(expect.objectContaining({
      viewport: "contained",
    }));
    expect(container.querySelector<HTMLElement>("[data-tutorial-live-battle]")?.style)
      .toMatchObject({ position: "fixed", width: "100vw", height: "100dvh" });

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
      text: "Erode sends cards to the void.",
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
