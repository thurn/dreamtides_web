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
  const selectedBattleCardId = state.sides.player.hand[0];
  if (selectedBattleCardId === undefined) {
    throw new Error("expected opening hand card");
  }
  return { battleInit, selectedBattleCardId, state };
}

function mount(selection: "player-hand" | "enemy-hand"): {
  container: HTMLDivElement;
  onClearSelection: ReturnType<typeof vi.fn>;
  onCommand: ReturnType<typeof vi.fn>;
  root: Root;
  selectedBattleCardId: string;
} {
  const { battleInit, selectedBattleCardId, state } = createFixture();
  let activeSelection = { kind: "card" as const, battleCardId: selectedBattleCardId };

  if (selection === "enemy-hand") {
    const enemyHandCardId = state.sides.enemy.hand[0];
    if (enemyHandCardId === undefined) {
      throw new Error("expected enemy hand card");
    }
    activeSelection = { kind: "card", battleCardId: enemyHandCardId };
  }

  const onClearSelection = vi.fn();
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
        isOpen
        lastTransition={null}
        selection={activeSelection}
        state={state}
        onClearSelection={onClearSelection}
        onClose={() => undefined}
        onOpen={() => undefined}
        onCommand={onCommand}
        onOpenFigmentCreator={() => undefined}
        onOpenForesee={() => undefined}
        onOpenNoteEditor={() => undefined}
        onOpenZone={() => undefined}
        onResetBattle={() => undefined}
        onRedo={() => undefined}
        onSelectBattleCard={() => undefined}
        onUndo={() => undefined}
      />,
    );
  });

  return { container, onClearSelection, onCommand, root, selectedBattleCardId };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattleInspector", () => {
  it("renders the slimmed inspector with card summary and side controls", () => {
    const { container, onClearSelection, onCommand, root, selectedBattleCardId } = mount("player-hand");

    expect(container.textContent).toContain("Right-click this card");
    expect(container.textContent).toContain("Card State");
    expect(container.textContent).toContain("Your state");
    expect(container.textContent).toContain("Enemy state");
    expect(container.textContent).toContain("Result");
    expect(container.textContent).toContain("History");
    expect(container.querySelector('[data-battle-inspector-handle]')?.textContent).toContain("CLOSE");

    act(() => {
      clickChip(container, "+1 Draw");
      clickChip(container, "Clear");
    });

    expect(selectedBattleCardId).toBeTruthy();
    expect(onCommand.mock.calls[0]?.[0]).toMatchObject({
      id: "DEBUG_EDIT",
      edit: { kind: "DRAW_CARD", side: "player" },
      sourceSurface: "inspector",
    });
    expect(onClearSelection).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("shows enemy-hand card metadata without visibility badges", () => {
    const { container, onCommand, root } = mount("enemy-hand");

    expect(container.textContent).toContain("Card State");
    expect(container.textContent).not.toContain("Revealed");
    expect(container.textContent).not.toContain("Hidden");
    expect(onCommand).not.toHaveBeenCalled();

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
