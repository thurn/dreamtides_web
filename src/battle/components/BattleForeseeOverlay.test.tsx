// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleCommand } from "../debug/commands";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import type { BattleMutableState } from "../types";
import { BattleForeseeOverlay } from "./BattleForeseeOverlay";
import { CumulusRoot } from "../../cumulus/CumulusRoot";

function renderWithCumulus(root: Root, element: ReactElement): void {
  root.render(<CumulusRoot>{element}</CumulusRoot>);
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

function createTestState(): BattleMutableState {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });
  return createInitialBattleState(battleInit);
}

describe("BattleForeseeOverlay", () => {
  it("dispatches REVEAL_DECK_TOP on mount with the initial count and re-dispatches when the user reveals more", () => {
    const state = createTestState();
    const onDispatch = vi.fn<(command: BattleCommand) => void>();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      renderWithCumulus(root,
        <BattleForeseeOverlay
          initialCount={2}
          onClose={() => {}}
          onDispatch={onDispatch}
          side="player"
          state={state}
        />,
      );
    });

    expect(onDispatch).toHaveBeenCalledTimes(1);
    const firstCall = onDispatch.mock.calls[0][0];
    if (firstCall.id !== "DEBUG_EDIT" || firstCall.edit.kind !== "REVEAL_DECK_TOP") {
      throw new Error("expected REVEAL_DECK_TOP dispatch");
    }
    expect(firstCall.edit.side).toBe("player");
    expect(firstCall.edit.count).toBe(2);
    expect(firstCall.sourceSurface).toBe("foresee-overlay");

    // Reveal More widens count to 3.
    const revealMore = document.querySelector<HTMLButtonElement>(
      '[data-battle-foresee-action="reveal-more"]',
    );
    expect(revealMore).not.toBeNull();
    act(() => {
      revealMore?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onDispatch).toHaveBeenCalledTimes(2);
    const secondCall = onDispatch.mock.calls[1][0];
    if (secondCall.id !== "DEBUG_EDIT" || secondCall.edit.kind !== "REVEAL_DECK_TOP") {
      throw new Error("expected second REVEAL_DECK_TOP dispatch");
    }
    expect(secondCall.edit.count).toBe(3);

    act(() => {
      root.unmount();
    });
  });

  it("caps Reveal More at 5 and disables past the cap or deck length", () => {
    const state = createTestState();
    const onDispatch = vi.fn<(command: BattleCommand) => void>();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      renderWithCumulus(root,
        <BattleForeseeOverlay
          initialCount={5}
          onClose={() => {}}
          onDispatch={onDispatch}
          side="player"
          state={state}
        />,
      );
    });

    const revealMore = document.querySelector<HTMLButtonElement>(
      '[data-battle-foresee-action="reveal-more"]',
    );
    expect(revealMore?.disabled).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("emits a REORDER_DECK command with the card appended to the bottom when Send to bottom fires", () => {
    const state = createTestState();
    const onDispatch = vi.fn<(command: BattleCommand) => void>();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      renderWithCumulus(root,
        <BattleForeseeOverlay
          initialCount={2}
          onClose={() => {}}
          onDispatch={onDispatch}
          side="player"
          state={state}
        />,
      );
    });

    const topCard = state.sides.player.deck[0];
    const sendToBottom = document.querySelector<HTMLButtonElement>(
      '[data-battle-foresee-action="send-to-bottom"]',
    );
    expect(sendToBottom).not.toBeNull();
    act(() => {
      sendToBottom?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const reorderCall = onDispatch.mock.calls.find(([command]) => {
      return (
        command.id === "DEBUG_EDIT" &&
        "kind" in command.edit &&
        command.edit.kind === "REORDER_DECK"
      );
    });
    expect(reorderCall).not.toBeUndefined();
    const reorderCommand = reorderCall?.[0];
    if (reorderCommand === undefined || reorderCommand.id !== "DEBUG_EDIT") {
      throw new Error("expected REORDER_DECK dispatch");
    }
    if (reorderCommand.edit.kind !== "REORDER_DECK") {
      throw new Error("expected REORDER_DECK edit");
    }
    expect(reorderCommand.edit.order[reorderCommand.edit.order.length - 1]).toBe(topCard);

    act(() => {
      root.unmount();
    });
  });

  it("does not reveal an additional card after Send to void removes the only revealed card", () => {
    const state = createTestState();
    const onDispatch = vi.fn<(command: BattleCommand) => void>();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const initialTopCard = state.sides.player.deck[0];
    const nextCard = state.sides.player.deck[1];

    act(() => {
      renderWithCumulus(root,
        <BattleForeseeOverlay
          initialCount={1}
          onClose={() => {}}
          onDispatch={onDispatch}
          side="player"
          state={state}
        />,
      );
    });

    expect(
      container.querySelector(`[data-battle-foresee-card="${initialTopCard}"]`),
    ).not.toBeNull();
    expect(
      container.querySelector(`[data-battle-foresee-card="${nextCard}"]`),
    ).toBeNull();

    act(() => {
      document.querySelector<HTMLButtonElement>(
        '[data-battle-foresee-action="send-to-void"]',
      )?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      container.querySelector(`[data-battle-foresee-card="${nextCard}"]`),
    ).toBeNull();
    expect(container.textContent).toContain("No revealed cards remain.");
    expect(container.textContent).not.toContain("Deck is empty.");

    act(() => {
      root.unmount();
    });
  });

  it("renders revealed cards with the full card display chrome and rules text", () => {
    const state = createTestState();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const topCardId = state.sides.player.deck[0];
    const topCard = state.cardInstances[topCardId];

    act(() => {
      renderWithCumulus(root,
        <BattleForeseeOverlay
          initialCount={1}
          onClose={() => {}}
          onDispatch={() => {}}
          side="player"
          state={state}
        />,
      );
    });

    expect(container.textContent).toContain(topCard.definition.renderedText);
    expect(
      container.querySelector(`img[alt="${topCard.definition.name}"]`),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-battle-foresee-card-scroll]"),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("exposes role=dialog and aria-labelledby targeting the title", () => {
    const state = createTestState();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      renderWithCumulus(root,
        <BattleForeseeOverlay
          initialCount={2}
          onClose={() => {}}
          onDispatch={() => {}}
          side="player"
          state={state}
        />,
      );
    });

    const dialog = document.querySelector<HTMLElement>(
      "[data-battle-foresee-overlay]",
    );
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog?.getAttribute("aria-labelledby");
    expect(labelledBy).not.toBeNull();
    expect(document.getElementById(labelledBy ?? "")).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("keeps the Foresee surface scrollable when revealed card controls exceed the viewport", () => {
    const state = createTestState();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      renderWithCumulus(root,
        <BattleForeseeOverlay
          initialCount={1}
          onClose={() => {}}
          onDispatch={() => {}}
          side="player"
          state={state}
        />,
      );
    });

    const scrim = document.querySelector<HTMLElement>(
      "[data-battle-foresee-scrim]",
    );
    const dialog = document.querySelector<HTMLElement>(
      "[data-battle-foresee-overlay]",
    );

    expect(scrim?.className).toContain("overflow-y-auto");
    expect(dialog?.className).toContain("max-h-[calc(100vh-1.5rem)]");
    expect(dialog?.className).toContain("overflow-y-auto");

    act(() => {
      root.unmount();
    });
  });
});
