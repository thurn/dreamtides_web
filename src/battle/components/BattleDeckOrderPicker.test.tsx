// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestBattleInit } from "../../testing/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamAvatars,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { BattleDeckOrderPicker } from "./BattleDeckOrderPicker";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import { asBattleEntryKey } from "../../types/identifiers";

function LocalizedBattleDeckOrderPicker(
  props: ComponentProps<typeof BattleDeckOrderPicker>,
) {
  return (
    <CumulusRoot>
      <BattleDeckOrderPicker {...props} />
    </CumulusRoot>
  );
}

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
  it("reorders rows from the drag handles and confirms with the expected permutation", () => {
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
        <LocalizedBattleDeckOrderPicker
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
    expect(rootNode?.getAttribute("data-battle-deck-order-side")).toBe(
      "player",
    );

    // Move the first row down through two neighbours so it becomes last.
    pressReorderKey(0, "ArrowDown");
    pressReorderKey(1, "ArrowDown");

    const slotOrder = [
      ...document.querySelectorAll<HTMLElement>("[data-card-order-id]"),
    ].map((element) => element.getAttribute("data-card-order-id"));

    expect(slotOrder).toEqual([
      initialOrder[1],
      initialOrder[2],
      initialOrder[0],
    ]);

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
        <LocalizedBattleDeckOrderPicker
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
    pressReorderKey(0, "ArrowDown");
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

function pressReorderKey(slot: number, key: "ArrowUp" | "ArrowDown"): void {
  const row = document.querySelectorAll<HTMLElement>("[data-card-order-id]")[
    slot
  ];
  const handle = row?.querySelector<HTMLButtonElement>(
    "[data-card-order-drag-handle]",
  );
  if (handle === null || handle === undefined) {
    throw new Error(`Missing deck-order drag handle on row ${String(slot)}`);
  }
  act(() => {
    handle.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

function createTestBattle() {
  const battleInit = createTestBattleInit({
    battleEntryKey: asBattleEntryKey("site-7::2::dreamscape-2"),
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
