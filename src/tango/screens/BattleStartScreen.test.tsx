// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { artRef } from "../primitives/art";
import { TangoRoot } from "../TangoRoot";
import { BattleStartScreen, type BattleStartView } from "./BattleStartScreen";

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  stubMatchMedia(true);
});

function stubMatchMedia(desktop: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: desktop && query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  document.body.innerHTML = "";
});

function makeView(): BattleStartView {
  const cards: CardData[] = Array.from({ length: 3 }, (_, index) => ({
    name: asCardName(`Signature ${String(index + 1)}`),
    id: asCardId(
      `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
    ),
    cardNumber: index + 1,
    cardType: "Character",
    subtype: "Test",
    isStarter: false,
    energyCost: index + 1,
    spark: index + 2,
    isFast: false,
    renderedText: "A stable test ability.",
    imageNumber: index + 1,
    artOwned: true,
  }));
  return {
    battleId: "battle-test",
    scene: artRef.dreamscapeScene("test_dreamscape"),
    dreamcaller: {
      id: "opponent-uuid",
      name: "Aeris, the Prism Guide",
      title: "Storm Archivist",
      imageNumber: "001",
      ability: "Whenever an event resolves, gain momentum.",
      abilityActive: true,
    },
    dreamsigns: [
      {
        id: "battle-test:dreamsign:0",
        name: "Sign of Quiet Thunder",
        effectDescription: "The first event each turn costs 1 less.",
        imageName: "quiet-thunder.webp",
        isBane: false,
      },
    ],
    signatureCards: cards.map((card) => ({
      cardId: card.id,
      model: { cardId: card.id, displaySnapshot: card },
    })),
    pointsToWin: 12,
    essenceReward: 80,
  };
}

function mount(view = makeView()): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <TangoRoot>
        <BattleStartScreen view={view} onBegin={vi.fn()} />
      </TangoRoot>,
    );
  });
  return { container, root };
}

describe("Tango BattleStartScreen", () => {
  it("renders the untouched scene, opponent, dense preview details, and stakes", () => {
    const view = makeView();
    const { container, root } = mount(view);

    expect(
      container.querySelector('[data-testid="tango-battle-start-scene"]'),
    ).not.toBeNull();
    expect(container.querySelector("[data-battle-start-panel]")).not.toBeNull();
    expect(
      container
        .querySelector("[data-battle-start-opponent]")
        ?.getAttribute("data-battle-start-opponent"),
    ).toBe(view.dreamcaller.id);
    expect(container.textContent).toContain(view.dreamcaller.name);
    expect(container.textContent).toContain("Ability");
    expect(container.querySelectorAll("[data-signature-card-id]")).toHaveLength(
      3,
    );
    expect(container.textContent).toContain("To Win");
    expect(container.textContent).not.toContain("Opposing Dreamcaller");
    expect(container.textContent).toContain("Reward");
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("80");
    const pointsValue = container.querySelector(
      '[data-battle-start-stake="To Win"] > div',
    );
    expect(pointsValue?.children[0]?.textContent).toBe("12");
    expect(pointsValue?.children[1]?.tagName).toBe("I");

    act(() => root.unmount());
  });

  it("uses the neutral glass action and reports begin", () => {
    const onBegin = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <TangoRoot>
          <BattleStartScreen view={makeView()} onBegin={onBegin} />
        </TangoRoot>,
      );
    });

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="tango-battle-start-begin"]',
    );
    expect(button?.getAttribute("data-glass-placement")).toBe("onGlass");
    act(() => button?.click());
    expect(onBegin).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("mirrors the mobile Dreamcaller Select hierarchy and reveals opponent intel separately", () => {
    stubMatchMedia(false);
    const onBegin = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <TangoRoot>
          <BattleStartScreen view={makeView()} onBegin={onBegin} />
        </TangoRoot>,
      );
    });

    const layout = container.querySelector<HTMLElement>(
      '[data-battle-start-layout="mobile"]',
    );
    expect(layout).not.toBeNull();
    const title = layout?.querySelector<HTMLElement>(
      "[data-battle-start-title]",
    );
    const consolePanel = layout?.querySelector<HTMLElement>(
      "[data-battle-start-console]",
    );
    expect(title?.textContent).toContain("Aeris, the Prism Guide");
    expect(title?.textContent).toContain("Storm Archivist");
    expect(consolePanel?.textContent).not.toContain("Aeris, the Prism Guide");
    expect(
      (consolePanel?.firstElementChild as HTMLElement | null)?.style.background,
    ).toBe("var(--surface-card)");
    expect(
      layout?.querySelector("[data-battle-start-opponent]"),
    ).not.toBeNull();
    expect(
      layout
        ?.querySelector("[data-battle-start-opponent]")
        ?.getAttribute("data-battle-start-opponent-framing"),
    ).toBe("standing");
    expect(layout?.querySelectorAll("[data-signature-card-id]")).toHaveLength(
      0,
    );
    expect(layout?.textContent).not.toContain("Signature Cards");
    expect(layout?.textContent).toContain(
      "Whenever an event resolves, gain momentum.",
    );
    expect(layout?.textContent).not.toContain("Dreamsigns");
    expect(layout?.textContent).toContain("To Win");
    expect(layout?.textContent).toContain("Reward");

    const intelToggle = layout?.querySelector<HTMLButtonElement>(
      '[data-testid="tango-battle-start-intel-toggle"]',
    );
    expect(intelToggle?.textContent).toContain("View opponent intel");
    act(() => intelToggle?.click());
    expect(layout?.textContent).not.toContain("To Win");
    expect(layout?.textContent).not.toContain("Reward");
    expect(layout?.textContent).toContain("Signature Cards");
    expect(layout?.textContent).toContain("Dreamsigns");
    expect(layout?.querySelectorAll("[data-signature-card-id]")).toHaveLength(
      3,
    );
    expect(intelToggle?.textContent).toContain("View battle stakes");

    const action = layout?.querySelector<HTMLElement>(
      '[data-testid="tango-battle-start-begin"]',
    );
    expect(action?.querySelector("button")?.textContent).toContain(
      "Begin Battle",
    );
    act(() => action?.querySelector("button")?.click());
    expect(onBegin).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("does not spend mobile briefing space on an inactive ability", () => {
    stubMatchMedia(false);
    const view = makeView();
    const { container, root } = mount({
      ...view,
      dreamcaller: { ...view.dreamcaller, abilityActive: false },
    });

    expect(container.textContent).not.toContain("Ability");
    expect(container.textContent).not.toContain(
      "Opponent dreamcaller ability is not active.",
    );

    act(() => root.unmount());
  });

  it("shows the inactive ability copy when the opponent ability is dormant", () => {
    const view = makeView();
    const { container, root } = mount({
      ...view,
      dreamcaller: { ...view.dreamcaller, abilityActive: false },
    });
    expect(container.textContent).toContain(
      "Opponent dreamcaller ability is not active.",
    );
    act(() => root.unmount());
  });
});
