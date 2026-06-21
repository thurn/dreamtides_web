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
import { BattleInspector } from "./BattleInspector";

function createFixture() {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });
  const state = createInitialBattleState(battleInit);
  return { battleInit, state };
}

function mount(): {
  container: HTMLDivElement;
  onCommand: ReturnType<typeof vi.fn>;
  onDreamwellDraw: ReturnType<typeof vi.fn>;
  onErode: ReturnType<typeof vi.fn>;
  onToggleOpponentHand: ReturnType<typeof vi.fn>;
  root: Root;
} {
  const { battleInit, state } = createFixture();
  const onCommand = vi.fn();
  const onDreamwellDraw = vi.fn();
  const onErode = vi.fn();
  const onToggleOpponentHand = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <BattleInspector
        battleInit={battleInit}
        canPlayerAct
        futureCount={1}
        historyCount={2}
        isDesktopLayout
        isOpponentHandRevealed={false}
        isOpen
        lastTransition={null}
        state={state}
        onClose={() => undefined}
        onOpen={() => undefined}
        onCommand={onCommand}
        onDreamwellDraw={onDreamwellDraw}
        onErode={onErode}
        onOpenFigmentCreator={() => undefined}
        onOpenPoolViewer={() => undefined}
        onOpenForesee={() => undefined}
        onOpenZone={() => undefined}
        onResetBattle={() => undefined}
        onRedo={() => undefined}
        onToggleOpponentHand={onToggleOpponentHand}
        onUndo={() => undefined}
      />,
    );
  });

  return { container, onCommand, onDreamwellDraw, onErode, onToggleOpponentHand, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattleInspector", () => {
  it("renders global battle state and side controls", () => {
    const { container, onCommand, onToggleOpponentHand, root } = mount();

    expect(container.textContent).toContain("Battle State");
    expect(container.textContent).toContain("Your state");
    expect(container.textContent).toContain("Enemy state");
    expect(container.textContent).toContain("Visibility");
    expect(container.textContent).toContain("Show enemy hand");
    expect(container.textContent).toContain("Result");
    expect(container.textContent).toContain("Skip to rewards");
    expect(container.textContent).toContain("History");
    expect(container.textContent).not.toContain("Card State");
    expect(container.textContent).not.toContain("Right-click this card");
    const stateRow = [...container.querySelectorAll(".row-ctl .val")].find((node) =>
      node.textContent?.includes("Bk"),
    );
    expect(stateRow?.textContent).toMatch(/Bk\d+ Fr\d+/);
    expect(container.querySelector('[data-battle-inspector-handle]')?.textContent).toContain("CLOSE");

    act(() => {
      clickChip(container, "+1 Draw");
      clickChip(container, "Show enemy hand");
    });

    expect(onCommand.mock.calls[0]?.[0]).toMatchObject({
      id: "DEBUG_EDIT",
      edit: { kind: "DRAW_CARD", side: "player" },
      sourceSurface: "inspector",
    });
    expect(onToggleOpponentHand).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("shuffles the deck into a permutation from the deck tools", () => {
    const { battleInit, state } = createFixture();
    const deck = state.sides.player.deck;
    // The shuffle control only makes sense for a deck the player can reorder;
    // the live initial state seeds more than one card, so the button is enabled.
    expect(deck.length).toBeGreaterThan(1);

    const onCommand = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <BattleInspector
          battleInit={battleInit}
          canPlayerAct
          futureCount={1}
          historyCount={2}
          isDesktopLayout
          isOpponentHandRevealed={false}
          isOpen
          lastTransition={null}
          state={state}
          onClose={() => undefined}
          onOpen={() => undefined}
          onCommand={onCommand}
          onDreamwellDraw={() => undefined}
          onErode={() => undefined}
          onOpenFigmentCreator={() => undefined}
          onOpenPoolViewer={() => undefined}
          onOpenForesee={() => undefined}
          onOpenZone={() => undefined}
          onResetBattle={() => undefined}
          onRedo={() => undefined}
          onToggleOpponentHand={() => undefined}
          onUndo={() => undefined}
        />,
      );
    });

    const shuffleButton = container.querySelector<HTMLButtonElement>(
      '[data-battle-action="debug-shuffle-deck-player"]',
    );
    expect(shuffleButton?.disabled).toBe(false);

    act(() => {
      shuffleButton?.click();
    });

    const command = onCommand.mock.calls[0]?.[0];
    expect(command).toMatchObject({
      id: "DEBUG_EDIT",
      edit: { kind: "REORDER_DECK", side: "player" },
      sourceSurface: "inspector",
    });
    // The dispatched order must be a permutation of the live deck: same length
    // and same multiset of card ids, so REORDER_DECK accepts it.
    const order: string[] = command.edit.order;
    expect([...order].sort()).toEqual([...deck].sort());

    act(() => {
      root.unmount();
    });
  });

  it("runs Dreamwell + draw and erode from the debug rail", () => {
    const { container, onDreamwellDraw, onErode, root } = mount();

    expect(container.textContent).toContain("Dreamwell + draw");

    const erodeButton = container.querySelector<HTMLButtonElement>(
      '[data-battle-action="debug-erode-player"]',
    );
    expect(erodeButton?.textContent).toContain("Erode 1");

    act(() => {
      clickChip(container, "Dreamwell + draw");
    });

    expect(onDreamwellDraw).toHaveBeenCalledWith("player");

    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Increase erode count for you"]')
        ?.click();
    });

    expect(erodeButton?.textContent).toContain("Erode 2");

    act(() => {
      erodeButton?.click();
    });

    expect(onErode).toHaveBeenCalledWith("player", 2);

    act(() => {
      root.unmount();
    });
  });
});

function clickChip(container: HTMLElement, label: string): void {
  const chip = [...container.querySelectorAll<HTMLElement>(".chip")].find(
    (element) => element.textContent?.trim() === label,
  );
  if (chip === undefined) {
    throw new Error(`missing chip: ${label}`);
  }
  chip.click();
}
