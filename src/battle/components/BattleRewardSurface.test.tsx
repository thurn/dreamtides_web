// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { BattleRewardSurface } from "./BattleRewardSurface";

vi.mock("../../logging", () => ({
  logEvent: vi.fn(),
  logEventOnce: vi.fn(),
}));

function makeCard(cardNumber: number, name: string): CardData {
  return {
    cardNumber,
    id: `card-${String(cardNumber)}`,
    name,
    imageNumber: cardNumber,
    cardType: "Character",
    subtype: "",
    rarity: "Common",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: `Card ${String(cardNumber)} text.`,
    artOwned: true,
    tides: [],
  };
}

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
  it("renders the essence reward in the shared essence colour with no glyph", () => {
    const rewardCards = [
      makeCard(1, "Sample One"),
      makeCard(2, "Sample Two"),
      makeCard(3, "Sample Three"),
      makeCard(4, "Sample Four"),
    ];
    const { container, root } = mount(
      <BattleRewardSurface
        battleId="b-1"
        canCancel={true}
        enemyName="Test Enemy"
        essenceReward={50}
        playerScore={40}
        enemyScore={0}
        rewardCards={rewardCards}
        rewardSource="battle"
        selectedRewardIndex={null}
        turnNumber={3}
        onCancel={vi.fn()}
        onSelectReward={vi.fn()}
      />,
    );

    const callout = container.querySelector(
      "[data-battle-reward-essence-callout]",
    );
    expect(callout).not.toBeNull();
    // No legacy hexagon glyph remains anywhere in the essence callout
    // -- essence is identified purely by its purple colour now.
    expect(callout?.textContent).not.toContain("⬢");
    expect(callout?.textContent).not.toContain("◆");

    const value = container.querySelector(
      "[data-battle-reward-essence-value]",
    );
    expect(value).not.toBeNull();
    expect((value as HTMLElement | null)?.style.color).toBe(
      "var(--color-essence)",
    );

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
});
