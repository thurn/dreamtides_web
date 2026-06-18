// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BattleRewardSurface } from "./BattleRewardSurface";

vi.mock("../../logging", () => ({
  logEvent: vi.fn(),
  logEventOnce: vi.fn(),
}));

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
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

describe("BattleRewardSurface", () => {
  it("renders the essence reward as a purple value glued to the crypto glyph", () => {
    const { container, root } = mount(
      <BattleRewardSurface
        battleId="b-1"
        canCancel={true}
        enemyName="Test Enemy"
        essenceReward={50}
        playerScore={40}
        enemyScore={0}
        rewardSource="battle"
        turnNumber={3}
        isLocked={false}
        onCancel={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    const callout = container.querySelector(
      "[data-battle-reward-essence-callout]",
    );
    expect(callout).not.toBeNull();

    const value = container.querySelector(
      "[data-battle-reward-essence-value]",
    );
    expect(value).not.toBeNull();
    expect((value as HTMLElement | null)?.style.color).toBe(
      "var(--color-essence)",
    );
    // The amount is glued to the crypto glyph that marks essence everywhere.
    expect(value?.querySelector("i.bx-crypto")).not.toBeNull();

    // The "Essence Earned" caption above the number is also in the
    // currency colour so the whole callout reads as one purple unit.
    const caption = callout?.querySelector("span");
    expect(caption?.textContent).toBe("Essence Earned");
    expect((caption as HTMLElement | null)?.style.color).toBe(
      "var(--color-essence)",
    );

    act(() => {
      root.unmount();
    });
  });

  it("only shows essence and a Continue button -- no card-selection UI", () => {
    const { container, root } = mount(
      <BattleRewardSurface
        battleId="b-2"
        canCancel={true}
        enemyName="Test Enemy"
        essenceReward={100}
        playerScore={25}
        enemyScore={0}
        rewardSource="battle"
        turnNumber={4}
        isLocked={false}
        onCancel={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    // The reward surface never renders any card-selection chrome.
    expect(container.querySelector("[data-battle-reward-card]")).toBeNull();
    expect(
      container.querySelector('[data-battle-reward-action="select"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-battle-reward-action="confirm"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-battle-reward-action="change-selection"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("Choose a Card Reward");

    // The only primary action is Continue.
    const continueButton = container.querySelector<HTMLButtonElement>(
      '[data-battle-reward-action="continue"]',
    );
    expect(continueButton).not.toBeNull();
    expect(continueButton?.textContent).toBe("Continue");

    act(() => {
      root.unmount();
    });
  });

  it("invokes onContinue when the Continue button is pressed", () => {
    const onContinue = vi.fn();
    const { container, root } = mount(
      <BattleRewardSurface
        battleId="b-3"
        canCancel={true}
        enemyName="Test Enemy"
        essenceReward={150}
        playerScore={25}
        enemyScore={5}
        rewardSource="battle"
        turnNumber={5}
        isLocked={false}
        onCancel={vi.fn()}
        onContinue={onContinue}
      />,
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-battle-reward-action="continue"]',
        )
        ?.click();
    });

    expect(onContinue).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("disables Continue while locked so the handoff cannot be double-fired", () => {
    const onContinue = vi.fn();
    const { container, root } = mount(
      <BattleRewardSurface
        battleId="b-4"
        canCancel={false}
        enemyName="Test Enemy"
        essenceReward={150}
        playerScore={25}
        enemyScore={5}
        rewardSource="battle"
        turnNumber={5}
        isLocked={true}
        onCancel={vi.fn()}
        onContinue={onContinue}
      />,
    );

    const continueButton = container.querySelector<HTMLButtonElement>(
      '[data-battle-reward-action="continue"]',
    );
    expect(continueButton?.disabled).toBe(true);

    act(() => {
      continueButton?.click();
    });
    expect(onContinue).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
