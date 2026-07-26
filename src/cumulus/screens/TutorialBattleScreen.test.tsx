// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TutorialBattleScreen, type TutorialBattleView } from "./TutorialBattleScreen";

vi.mock("./MobileBattleScreen", () => ({
  MobileBattleScreen: () => <main data-test-mobile-battle="" />,
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

function view(
  overrides: Partial<TutorialBattleView> = {},
): TutorialBattleView {
  return {
    battle: {} as TutorialBattleView["battle"],
    ownership: "driver",
    driverClientId: "driver-client",
    manualControls: false,
    foresee: null,
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
      <TutorialBattleScreen
        view={screenView}
        interactions={interactions}
        movementStatusMessage={movementStatusMessage}
        onMovementStatusDismiss={onMovementStatusDismiss}
        onForeseeConfirm={() => {}}
        onRestart={() => {}}
        onReturnToMainMenu={() => {}}
      />,
    );
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = "";
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
});
