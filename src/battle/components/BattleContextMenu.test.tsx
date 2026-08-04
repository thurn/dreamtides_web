// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleCommand } from "../debug/commands";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import { makeBattleTestCardDatabase, makeBattleTestDreamAvatars, makeBattleTestSite, makeBattleTestState } from "../test-support";
import type { BattleMutableState } from "../types";
import { BattleContextMenu } from "./BattleContextMenu";

function state(): BattleMutableState {
  return createInitialBattleState(createBattleInit({ battleEntryKey: "test", site: makeBattleTestSite(), state: makeBattleTestState(), cardDatabase: makeBattleTestCardDatabase(), dreamAvatars: makeBattleTestDreamAvatars() }));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = (media: string) => ({ matches: media.includes("min-width"), media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
});
afterEach(() => { document.body.innerHTML = ""; });

describe("BattleContextMenu", () => {
  it("offers a shared reveal action for cards in hand", () => {
    const board = state();
    const battleCardId = board.sides.player.hand[0];
    const onCommand = vi.fn<(command: BattleCommand) => void>();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => root.render(
      <BattleContextMenu
        battleCardId={battleCardId}
        sourceSurface="hand-tray"
        state={board}
        x={200}
        y={300}
        onClose={() => undefined}
        onCommand={onCommand}
        onOpenNoteEditor={() => undefined}
      />,
    ));

    const reveal = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((element) => element.textContent?.trim() === "Reveal");
    expect(reveal).not.toBeUndefined();
    act(() => reveal?.click());
    expect(onCommand).toHaveBeenCalledWith({
      id: "DEBUG_EDIT",
      edit: { kind: "REVEAL_HAND_CARD", battleCardId },
      sourceSurface: "hand-tray",
    });
    act(() => root.unmount());
  });

  it("delegates clamped card actions and nested commands to ContextActionMenu", () => {
    const board = state();
    const battleCardId = board.sides.player.hand.find((id) => board.cardInstances[id]?.definition.battleCardKind === "character");
    if (battleCardId === undefined) throw new Error("expected character");
    const onCommand = vi.fn<(command: BattleCommand) => void>();
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<BattleContextMenu battleCardId={battleCardId} sourceSurface="inspector" state={board} x={9999} y={9999} onClose={() => undefined} onCommand={onCommand} onOpenNoteEditor={() => undefined} />));
    const menu = document.querySelector('[data-context-action-menu]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain("Player · Hand");
    const status = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) => element.textContent?.includes("Status"));
    expect(status).not.toBeUndefined();
    act(() => status?.click());
    const exhaust = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) => element.textContent?.includes("Exhaust"));
    expect(exhaust).not.toBeUndefined();
    act(() => exhaust?.click());
    const command = onCommand.mock.calls[0]?.[0];
    expect(command).toMatchObject({ id: "DEBUG_EDIT", edit: { kind: "SET_CARD_STATUS", battleCardId } });
    act(() => root.unmount());
  });

  it("renders memory counter commands with the filled brain instead of the source character", () => {
    const board = state();
    const battleCardId = board.sides.player.hand.find(
      (id) => board.cardInstances[id]?.definition.battleCardKind === "character",
    );
    if (battleCardId === undefined) throw new Error("expected character");
    board.cardInstances[battleCardId].status.counters = 2;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => root.render(
      <BattleContextMenu
        battleCardId={battleCardId}
        sourceSurface="inspector"
        state={board}
        x={200}
        y={300}
        onClose={() => undefined}
        onCommand={() => undefined}
        onOpenNoteEditor={() => undefined}
      />,
    ));

    const memory = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((element) => element.textContent?.trim() === "Memory (2)");
    expect(memory?.querySelector("i.bxf.bx-brain")).not.toBeNull();
    expect(document.body.textContent).not.toContain("⧗");

    act(() => memory?.click());
    const increment = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((element) => element.textContent?.trim() === "+1");
    expect(increment?.querySelector("i.bxf.bx-brain")).not.toBeNull();
    expect(document.body.querySelector("i.bxf.bx-hourglass")).toBeNull();

    act(() => root.unmount());
  });

  it("accepts a typed signed spark adjustment instead of preset amounts", () => {
    const board = state();
    const battleCardId = board.sides.player.hand.find(
      (id) => board.cardInstances[id]?.definition.battleCardKind === "character",
    );
    if (battleCardId === undefined) throw new Error("expected character");
    const card = board.cardInstances[battleCardId];
    const onCommand = vi.fn<(command: BattleCommand) => void>();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(
      <BattleContextMenu
        battleCardId={battleCardId}
        sourceSurface="hand-tray"
        state={board}
        x={200}
        y={300}
        onClose={() => undefined}
        onCommand={onCommand}
        onOpenNoteEditor={() => undefined}
      />,
    ));

    act(() => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((element) => element.textContent?.trim() === "Add Spark")?.click());
    expect(document.body.textContent).not.toContain("Reset to 0");
    expect(document.body.textContent).not.toContain("+1");
    const input = document.querySelector<HTMLInputElement>('[data-testid="command-menu-signed-integer-input"]');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "-4");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.trim() === "Apply")?.click();
    });
    expect(onCommand).toHaveBeenCalledWith({
      id: "DEBUG_EDIT",
      edit: {
        kind: "KINDLE",
        amount: -4,
        preferredBattleCardId: battleCardId,
        side: card.controller,
      },
      sourceSurface: "hand-tray",
    });
    act(() => root.unmount());
  });

  it("does not offer stack-growth actions for figments", () => {
    const board = state();
    const battleCardId = board.sides.player.hand.find(
      (id) => board.cardInstances[id]?.definition.battleCardKind === "character",
    );
    if (battleCardId === undefined) throw new Error("expected character");
    board.cardInstances[battleCardId].provenance = {
      kind: "generated-figment",
      sourceBattleCardId: null,
      chosenSpark: 2,
      chosenSubtype: "Warrior",
      createdAtTurnNumber: board.turnNumber,
      createdAtSide: board.activeSide,
      createdAtMs: 0,
    };
    board.cardInstances[battleCardId].figments = [2, 2, 2];

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(
      <BattleContextMenu
        battleCardId={battleCardId}
        sourceSurface="inspector"
        state={board}
        x={100}
        y={100}
        onClose={() => undefined}
        onCommand={() => undefined}
        onOpenNoteEditor={() => undefined}
      />,
    ));

    expect(document.querySelector("[data-context-action-menu]")?.textContent)
      .not.toContain("Add Figments");
    act(() => root.unmount());
  });
});
