// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import type { BattleMutableState } from "../types";
import { BattleContextMenu } from "./BattleContextMenu";

function createState(): BattleMutableState {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });
  return createInitialBattleState(battleInit);
}

/**
 * Places the first player character from hand into `slotId` of the given rank so
 * the context menu has a battlefield-resident character to act on.
 */
function placeCharacter(
  state: BattleMutableState,
  zone: "frontRank" | "backRank",
  slotId: string,
): string {
  const battleCardId = state.sides.player.hand.find(
    (id) => state.cardInstances[id]?.definition.battleCardKind === "character",
  );
  if (battleCardId === undefined) {
    throw new Error("expected a player character in hand");
  }
  state.sides.player.hand = state.sides.player.hand.filter((id) => id !== battleCardId);
  if (zone === "frontRank") {
    state.sides.player.frontRank[slotId as keyof typeof state.sides.player.frontRank] =
      battleCardId;
  } else {
    state.sides.player.backRank[slotId as keyof typeof state.sides.player.backRank] =
      battleCardId;
  }
  return battleCardId;
}

function mount(
  state: BattleMutableState,
  battleCardId: string,
): {
  container: HTMLDivElement;
  onCommand: ReturnType<typeof vi.fn>;
  root: Root;
} {
  const onCommand = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <BattleContextMenu
        battleCardId={battleCardId}
        onOpenNoteEditor={() => undefined}
        sourceSurface="inspector"
        state={state}
        x={0}
        y={0}
        onClose={() => undefined}
        onCommand={onCommand}
      />,
    );
  });

  return { container, onCommand, root };
}

/** Hovers a submenu trigger by its label so its child items render. */
function openSubmenu(container: HTMLElement, label: string): void {
  const trigger = [...container.querySelectorAll(".ctx-item.has-submenu")].find(
    (node) => node.querySelector("span")?.textContent === label,
  );
  if (trigger === undefined) {
    throw new Error(`submenu trigger not found: ${label}`);
  }
  act(() => {
    // React maps onMouseEnter onto a delegated mouseover listener, so the
    // synthetic enter fires from a bubbling mouseover rather than mouseenter.
    trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}

/** Clicks a leaf ctx-item by exact label text. */
function clickItem(container: HTMLElement, label: string): void {
  const item = [...container.querySelectorAll(".ctx-item")].find(
    (node) => node.textContent === label,
  );
  if (item === undefined) {
    throw new Error(`ctx-item not found: ${label}`);
  }
  act(() => {
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattleContextMenu status toggles", () => {
  it("renders the Status submenu for a battlefield character", () => {
    const state = createState();
    const battleCardId = placeCharacter(state, "backRank", "B0");
    const { container, root } = mount(state, battleCardId);

    openSubmenu(container, "Status");
    expect(container.textContent).toContain("Exhaust ☪");
    expect(container.textContent).toContain("Mark Reclaimed");
    expect(container.textContent).toContain("Mark Offering");
    expect(container.textContent).toContain("Mark Ephemeral");
    expect(container.textContent).toContain("Grant Unstoppable");

    act(() => {
      root.unmount();
    });
  });

  it("emits SET_CARD_STATUS toggling isExhausted (the ☪ exhaust)", () => {
    const state = createState();
    const battleCardId = placeCharacter(state, "frontRank", "F0");
    const { container, onCommand, root } = mount(state, battleCardId);

    openSubmenu(container, "Status");
    clickItem(container, "Exhaust ☪");

    expect(onCommand).toHaveBeenCalledWith({
      id: "DEBUG_EDIT",
      edit: { kind: "SET_CARD_STATUS", battleCardId, status: { isExhausted: true } },
      sourceSurface: "inspector",
    });

    act(() => {
      root.unmount();
    });
  });

  it("offers Awaken when the character is already exhausted", () => {
    const state = createState();
    const battleCardId = placeCharacter(state, "backRank", "B0");
    state.cardInstances[battleCardId].status.isExhausted = true;
    const { container, onCommand, root } = mount(state, battleCardId);

    openSubmenu(container, "Status");
    expect(container.textContent).toContain("Awaken");
    clickItem(container, "Awaken");

    expect(onCommand).toHaveBeenCalledWith({
      id: "DEBUG_EDIT",
      edit: { kind: "SET_CARD_STATUS", battleCardId, status: { isExhausted: false } },
      sourceSurface: "inspector",
    });

    act(() => {
      root.unmount();
    });
  });

  it("emits a veil value and a granted-keyword toggle", () => {
    const state = createState();
    const battleCardId = placeCharacter(state, "backRank", "B0");
    const { container, onCommand, root } = mount(state, battleCardId);

    openSubmenu(container, "Status");
    clickItem(container, "Veil 2●");
    expect(onCommand).toHaveBeenCalledWith({
      id: "DEBUG_EDIT",
      edit: { kind: "SET_CARD_STATUS", battleCardId, status: { veil: 2 } },
      sourceSurface: "inspector",
    });

    clickItem(container, "Grant Vengeful");
    expect(onCommand).toHaveBeenCalledWith({
      id: "DEBUG_EDIT",
      edit: { kind: "SET_CARD_STATUS", battleCardId, status: { grantedVengeful: true } },
      sourceSurface: "inspector",
    });

    act(() => {
      root.unmount();
    });
  });

  it("does not show the Status submenu for an event card", () => {
    const state = createState();
    const eventCardId = state.sides.player.hand.find(
      (id) => state.cardInstances[id]?.definition.battleCardKind === "event",
    );
    if (eventCardId === undefined) {
      throw new Error("expected a player event card in hand");
    }
    const { container, root } = mount(state, eventCardId);

    expect(container.textContent).not.toContain("Status");

    act(() => {
      root.unmount();
    });
  });
});
