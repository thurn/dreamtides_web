// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import {
  BattleResultSurface,
  type MobileBattleResultView,
} from "./BattleResultSurface";

let animationFrames: FrameRequestCallback[] = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
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
  animationFrames = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    animationFrames.push(callback);
    return animationFrames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function mount(
  view: MobileBattleResultView,
  onAction = vi.fn(),
  centerOnBattlefield = false,
): { container: HTMLDivElement; root: Root; onAction: typeof onAction } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <CumulusRoot>
        <BattleResultSurface
          view={view}
          onAction={onAction}
          centerOnBattlefield={centerOnBattlefield}
        />
      </CumulusRoot>,
    );
  });
  return { container, root, onAction };
}

function runCountUp(): void {
  act(() => animationFrames.shift()?.(0));
  act(() => animationFrames.shift()?.(840));
}

describe("BattleResultSurface", () => {
  it("counts the victory essence payoff before enabling Continue", () => {
    const { container, root, onAction } = mount({
      outcome: "victory",
      summary: "Defeated Fixture Caller · 10–5 · 6 turns",
      essenceReward: 100,
    });

    expect(
      container.querySelector('[data-battle-result-surface="victory"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Victory!");
    expect(container.textContent).toContain(
      "Defeated Fixture Caller · 10–5 · 6 turns",
    );
    expect(
      container.querySelector('[data-testid="battle-reward-cancel"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="battle-result-reopen"]'),
    ).toBeNull();
    expect(
      container.querySelector("[data-battle-reward-essence-value]")?.textContent,
    ).toContain("+0");
    const continueButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-reward-continue"]',
    );
    expect(continueButton?.getAttribute("aria-disabled")).toBe("true");

    runCountUp();

    expect(
      container.querySelector("[data-battle-reward-essence-value]")?.textContent,
    ).toContain("+100");
    expect(continueButton?.getAttribute("aria-disabled")).toBeNull();
    act(() => continueButton?.click());
    expect(onAction).toHaveBeenCalledWith("continue");
    expect(continueButton?.getAttribute("aria-disabled")).toBe("true");

    act(() => root.unmount());
  });

  it.each([
    ["defeat", "Defeat."],
    ["draw", "Draw."],
  ] as const)("renders the compact %s result actions", (outcome, title) => {
    const { container, root, onAction } = mount({
      outcome,
      dismissed: false,
    });

    expect(container.textContent).toContain(title);
    expect(container.querySelector("[data-battle-reward-essence-value]")).toBeNull();
    const inspect = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-result-inspect"]',
    );
    const reset = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-result-reset"]',
    );
    expect(inspect?.textContent).toContain("Keep Inspecting");
    expect(reset?.textContent).toContain("Reset Run…");
    expect(inspect?.dataset.glassVariant).toBe("accent");
    expect(reset?.dataset.glassVariant).toBe("danger");

    act(() => {
      inspect?.click();
      reset?.click();
    });
    expect(onAction).toHaveBeenNthCalledWith(1, "dismiss");
    expect(onAction).toHaveBeenNthCalledWith(2, "reset");

    act(() => root.unmount());
  });

  it("reopens a dismissed result from its bottom control", () => {
    const { container, root, onAction } = mount({
      outcome: "defeat",
      dismissed: true,
    });

    expect(container.querySelector("[role=dialog]")).toBeNull();
    const reopen = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-result-reopen"]',
    );
    expect(reopen?.textContent).toContain("Defeat — Reopen");
    act(() => reopen?.click());
    expect(onAction).toHaveBeenCalledWith("reopen");

    act(() => root.unmount());
  });

  it("centers an open result over the playfield beside a docked inspector", () => {
    const { container, root } = mount(
      {
        outcome: "defeat",
        dismissed: false,
      },
      vi.fn(),
      true,
    );

    const surface = container.querySelector<HTMLElement>(
      '[data-battle-result-surface="defeat"]',
    );
    expect(surface?.style.gridTemplateColumns).toBe(
      "minmax(0, 1fr) clamp(340px, 25vw, 400px)",
    );
    expect(
      container.querySelector<HTMLElement>(
        "[data-battle-result-layout-content]",
      )?.style.gridColumn,
    ).toBe("1");

    act(() => root.unmount());
  });
});
