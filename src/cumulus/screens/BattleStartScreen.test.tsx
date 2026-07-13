// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { artRef } from "../primitives/art";
import { CumulusRoot } from "../CumulusRoot";
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
      <CumulusRoot>
        <BattleStartScreen view={view} onBegin={vi.fn()} />
      </CumulusRoot>,
    );
  });
  return { container, root };
}

describe("Cumulus BattleStartScreen", () => {
  it("renders the untouched scene, opponent, dense preview details, and stakes", () => {
    const view = makeView();
    const { container, root } = mount(view);

    expect(
      container.querySelector('[data-testid="cumulus-battle-start-scene"]'),
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
    expect(
      container.querySelectorAll(
        '[data-signature-card-id] [data-reveal-complete-game-card="true"]',
      ),
    ).toHaveLength(3);
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

  it("uses the accented glass action and reports begin", () => {
    const onBegin = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <BattleStartScreen view={makeView()} onBegin={onBegin} />
        </CumulusRoot>,
      );
    });

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-battle-start-begin"]',
    );
    expect(button?.getAttribute("data-glass-placement")).toBe("onGlass");
    expect(button?.getAttribute("data-glass-variant")).toBe("accent");
    act(() => button?.click());
    expect(onBegin).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("carousels the complete mobile battle console across its three detail pages", () => {
    stubMatchMedia(false);
    const onBegin = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <BattleStartScreen view={makeView()} onBegin={onBegin} />
        </CumulusRoot>,
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
    expect(title?.textContent).not.toContain("Battle Opponent");
    expect(title?.textContent).toContain("Battle vs. Aeris, the Prism Guide");
    expect(title?.querySelector("span")?.style.font).toContain("--t-title");
    expect(title?.textContent).toContain("Storm Archivist");
    expect(consolePanel?.textContent).not.toContain("Aeris, the Prism Guide");
    expect(
      (consolePanel?.firstElementChild as HTMLElement | null)?.style
        .backdropFilter,
    ).toContain("--glass-blur");
    expect(
      (consolePanel?.firstElementChild as HTMLElement | null)?.style.padding,
    ).toBe("");
    expect(consolePanel?.style.top).toBe("61%");
    expect(consolePanel?.style.transform).toBe("translateY(-50%)");
    expect(
      layout?.querySelector("[data-battle-start-opponent]"),
    ).not.toBeNull();
    expect(
      layout
        ?.querySelector("[data-battle-start-opponent]")
        ?.getAttribute("data-battle-start-opponent-framing"),
    ).toBe("standing");
    expect(layout?.textContent).toContain(
      "Whenever an event resolves, gain momentum.",
    );
    const activePage = () =>
      layout?.querySelector<HTMLElement>(
        '[data-battle-start-detail-active="true"]',
      );
    expect(activePage()?.textContent).toContain("Victory:");
    expect(activePage()?.textContent).toContain(
      "Whenever an event resolves, gain momentum.",
    );
    const overviewTitles = Array.from(
      activePage()?.querySelectorAll<HTMLElement>(
        "[data-battle-start-detail-title]",
      ) ?? [],
    );
    expect(overviewTitles.map((title) => title.textContent)).toEqual([
      "Ability:",
      "Victory:",
    ]);
    expect(
      overviewTitles.every(
        (title) =>
          title.style.justifySelf === "stretch" &&
          title.style.textAlign === "left",
      ),
    ).toBe(true);
    expect(
      activePage()?.querySelector<HTMLElement>(
        "[data-battle-start-mobile-ability]",
      )?.style.textAlign,
    ).toBe("center");
    expect(activePage()?.textContent).toContain("To Win");
    expect(activePage()?.textContent).toContain("Reward");
    expect(
      activePage()?.querySelector('[data-testid="cumulus-battle-start-begin"]'),
    ).not.toBeNull();
    expect(activePage()?.style.minHeight).toBe("");
    expect(activePage()?.style.alignItems).toBe("");
    expect(
      activePage()?.querySelector<HTMLElement>(
        '[data-battle-start-stake="To Win"] > div',
      )?.style.font,
    ).toContain("--t-body");
    const stakes = activePage()?.querySelector<HTMLElement>(
      "[data-battle-start-stakes]",
    );
    expect(stakes?.style.justifyContent).toBe("center");
    expect(stakes?.style.gap).toBe("var(--space-9)");
    expect(activePage()?.style.paddingLeft).toBe(
      "calc(var(--touch-min) + var(--space-5))",
    );
    expect(activePage()?.style.paddingRight).toBe(
      "calc(var(--touch-min) + var(--space-5))",
    );

    const track = layout?.querySelector<HTMLElement>(
      "[data-battle-start-detail-track]",
    );
    expect(track?.style.transform).toBe("translateX(0%)");
    expect(track?.style.transition).toContain("transform");

    expect(
      layout?.querySelector(
        '[data-testid="cumulus-battle-start-carousel-previous"]',
      ),
    ).toBeNull();
    const next = layout?.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-battle-start-carousel-next"]',
    );
    expect(next?.getAttribute("data-glass-placement")).toBe("onGlass");
    act(() => next?.click());
    expect(track?.style.transform).toBe("translateX(-100%)");
    expect(activePage()?.textContent).toContain("Dreamsigns:");
    expect(activePage()?.textContent).not.toContain(
      "Whenever an event resolves, gain momentum.",
    );
    expect(activePage()?.textContent).not.toContain("To Win");
    expect(activePage()?.textContent).not.toContain("Reward");
    expect(
      activePage()?.querySelector('[data-testid="cumulus-battle-start-begin"]'),
    ).toBeNull();
    expect(
      activePage()?.querySelectorAll(
        '[data-testid^="cumulus-battle-start-dreamsign-"]',
      ),
    ).toHaveLength(1);
    expect(
      activePage()?.querySelectorAll("[data-signature-card-id]"),
    ).toHaveLength(0);
    expect(
      layout?.querySelector(
        '[data-testid="cumulus-battle-start-carousel-previous"]',
      ),
    ).not.toBeNull();

    act(() =>
      layout
        ?.querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-battle-start-carousel-next"]',
        )
        ?.click(),
    );
    expect(track?.style.transform).toBe("translateX(-200%)");
    expect(activePage()?.textContent).toContain("Signature Cards:");
    expect(activePage()?.style.paddingLeft).toBe(
      "calc(var(--touch-min) + var(--space-5))",
    );
    expect(activePage()?.style.paddingRight).toBe(
      "calc(var(--touch-min) + var(--space-5))",
    );
    const signatureTitle = activePage()?.querySelector<HTMLElement>(
      "[data-battle-start-detail-title]",
    );
    expect(signatureTitle?.style.justifySelf).toBe("stretch");
    expect(signatureTitle?.style.textAlign).toBe("left");
    expect(
      activePage()?.querySelectorAll("[data-signature-card-id]"),
    ).toHaveLength(3);
    expect(
      activePage()?.querySelectorAll(
        '[data-testid^="cumulus-battle-start-dreamsign-"]',
      ),
    ).toHaveLength(0);
    expect(
      activePage()?.querySelectorAll('[data-reveal-complete-game-card="true"]'),
    ).toHaveLength(3);
    expect(
      layout?.querySelector(
        '[data-testid="cumulus-battle-start-carousel-next"]',
      ),
    ).toBeNull();

    const action = activePage()?.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-battle-start-begin"]',
    );
    expect(action).toBeNull();

    act(() =>
      layout
        ?.querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-battle-start-carousel-previous"]',
        )
        ?.click(),
    );
    act(() =>
      layout
        ?.querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-battle-start-carousel-previous"]',
        )
        ?.click(),
    );
    const firstPageAction = activePage()?.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-battle-start-begin"]',
    );
    expect(firstPageAction?.textContent).toContain("Begin Battle");
    expect(firstPageAction?.getAttribute("data-glass-variant")).toBe("accent");
    expect(firstPageAction?.getAttribute("data-glass-placement")).toBe(
      "onGlass",
    );
    act(() => firstPageAction?.click());
    expect(onBegin).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("skips the mobile Dreamsign detail when the opponent has no Dreamsigns", () => {
    stubMatchMedia(false);
    const view = makeView();
    const { container, root } = mount({ ...view, dreamsigns: [] });
    const layout = container.querySelector<HTMLElement>(
      '[data-battle-start-layout="mobile"]',
    );

    const activePage = () =>
      layout?.querySelector<HTMLElement>(
        '[data-battle-start-detail-active="true"]',
      );
    expect(activePage()?.textContent).toContain("Victory:");
    act(() =>
      layout
        ?.querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-battle-start-carousel-next"]',
        )
        ?.click(),
    );

    expect(activePage()?.textContent).toContain("Signature Cards:");
    expect(activePage()?.textContent).not.toContain("Dreamsigns:");
    expect(
      layout?.querySelector(
        '[data-testid="cumulus-battle-start-carousel-next"]',
      ),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("shows the inactive ability copy in the mobile briefing", () => {
    stubMatchMedia(false);
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
