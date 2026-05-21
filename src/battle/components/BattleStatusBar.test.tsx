// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BattlePhase } from "../types";
import { BattleStatusBar } from "./BattleStatusBar";

function mount(
  overrides: {
    phase?: BattlePhase;
    onSetPhase?: (phase: BattlePhase) => void;
  } = {},
): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <BattleStatusBar
        activeSide="player"
        battleId="battle:test"
        enemyName="Shadow Aeris"
        enemyScore={7}
        futureCount={1}
        hasAiOpponent
        historyCount={3}
        phase={overrides.phase ?? "day"}
        playerScore={12}
        result={null}
        roundNumber={4}
        siteType="Battle"
        onSetPhase={overrides.onSetPhase}
      />,
    );
  });

  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattleStatusBar", () => {
  it("renders only the mockup top-bar contract", () => {
    const { container, root } = mount();

    expect(
      container.querySelector('[data-battle-region="status-bar"]')?.textContent,
    ).toContain("Turn 4");
    expect(container.querySelector('[data-battle-stat="phase"]')?.textContent).toBe("Day");
    expect(container.querySelector('[data-battle-stat="score-summary"]')?.textContent).toContain("12");
    expect(container.querySelector('[data-battle-stat="score-summary"]')?.textContent).toContain("7");
    expect(
      container.querySelector('[data-battle-score-side="player"]')?.classList.contains("active"),
    ).toBe(true);
    expect(
      container.querySelector('[data-battle-score-side="enemy"]')?.classList.contains("active"),
    ).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("keeps history, future, and result metadata off-surface but available for QA", () => {
    const { container, root } = mount();

    expect(container.querySelector('[data-battle-status-meta="history"]')?.textContent).toBe("3");
    expect(container.querySelector('[data-battle-status-meta="future"]')?.textContent).toBe("1");
    expect(container.querySelector('[data-battle-status-meta="result"]')?.textContent).toBe("none");

    act(() => {
      root.unmount();
    });
  });

  it("sets the clicked phase directly via the phase-track chip", () => {
    const onSetPhase = vi.fn();
    const { container, root } = mount({ onSetPhase });

    const chip = container.querySelector<HTMLButtonElement>(
      '[data-battle-phase-chip="dusk"]',
    );
    expect(chip).not.toBeNull();
    act(() => {
      chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSetPhase).toHaveBeenCalledTimes(1);
    expect(onSetPhase).toHaveBeenCalledWith("dusk");

    act(() => {
      root.unmount();
    });
  });

  it("keeps phase increment controls out of the top bar", () => {
    const onSetPhase = vi.fn();
    const { container, root } = mount({ phase: "night", onSetPhase });

    expect(container.querySelector('[data-battle-phase-increment]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
