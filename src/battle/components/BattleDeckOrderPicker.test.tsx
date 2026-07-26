// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamAvatars,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { BattleDeckOrderPicker } from "./BattleDeckOrderPicker";

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattleDeckOrderPicker", () => {
  it("moves rows via move-up / move-down and confirms with the expected permutation", () => {
    const { state } = createTestBattle();
    const initialOrder = state.sides.player.deck.slice(0, 3);
    expect(initialOrder).toHaveLength(3);
    const onConfirm = vi.fn<(order: readonly string[]) => void>();
    const onCancel = vi.fn();

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <BattleDeckOrderPicker
          initialOrder={initialOrder}
          onCancel={onCancel}
          onConfirm={onConfirm}
          scopeLabel="full"
          side="player"
          state={state}
        />,
      );
    });

    const rootNode = document.querySelector<HTMLElement>(
      "[data-battle-deck-order-picker]",
    );
    expect(rootNode).not.toBeNull();
    expect(rootNode?.getAttribute("data-battle-deck-order-scope")).toBe("full");
    expect(rootNode?.getAttribute("data-battle-deck-order-side")).toBe("player");

    // Move the first row down through two neighbours so it becomes last.
    clickRowAction(0, "move-down");
    clickRowAction(1, "move-down");

    const slotOrder = [
      ...document.querySelectorAll<HTMLElement>("[data-card-order-id]"),
    ].map((element) => element.getAttribute("data-card-order-id"));

    expect(slotOrder).toEqual([initialOrder[1], initialOrder[2], initialOrder[0]]);

    const confirm = document.querySelector<HTMLButtonElement>(
      '[data-testid="battle-deck-order-confirm"]',
    );
    expect(confirm).not.toBeNull();
    act(() => {
      confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith([
      initialOrder[1],
      initialOrder[2],
      initialOrder[0],
    ]);
    expect(onCancel).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("pads top-N scope by appending the remaining deck slice on confirm", () => {
    const { state } = createTestBattle();
    const playerDeck = state.sides.player.deck;
    const initialOrder = playerDeck.slice(0, 2);
    const onConfirm = vi.fn<(order: readonly string[]) => void>();
    const onCancel = vi.fn();

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <BattleDeckOrderPicker
          initialOrder={initialOrder}
          onCancel={onCancel}
          onConfirm={onConfirm}
          scopeLabel="top-N"
          side="player"
          state={state}
        />,
      );
    });

    // Swap the two rows.
    clickRowAction(0, "move-down");
    const confirm = document.querySelector<HTMLButtonElement>(
      '[data-testid="battle-deck-order-confirm"]',
    );
    act(() => {
      confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith([
      initialOrder[1],
      initialOrder[0],
      ...playerDeck.slice(2),
    ]);

    act(() => {
      root.unmount();
    });
  });
});

function clickRowAction(
  slot: number,
  action: "move-up" | "move-down",
): void {
  const row = document.querySelectorAll<HTMLElement>("[data-card-order-id]")[slot];
  const direction = action === "move-up" ? " up" : " down";
  const button = [...(row?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
    .find((candidate) => candidate.getAttribute("aria-label")?.endsWith(direction));
  if (button === undefined) {
    throw new Error(`Missing deck-order action on row ${String(slot)}: ${action}`);
  }
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function createTestBattle() {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamAvatars: makeBattleTestDreamAvatars(),
  });

  return {
    battleInit,
    state: createInitialBattleState(battleInit),
  };
}
