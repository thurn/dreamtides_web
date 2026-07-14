// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE } from "../components/hud/QuestStatusBar";
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
    const desktopSectionTitles = Array.from(
      container.querySelectorAll("h2"),
      (heading) => heading.textContent,
    );
    expect(desktopSectionTitles).toContain("Signature Cards");
    expect(desktopSectionTitles).toContain("Dreamsigns");
    expect(desktopSectionTitles).not.toContain(
      "Signature Cards & Dreamsigns",
    );
    expect(
      container.querySelector("[data-battle-start-signature-objects]"),
    ).toBeNull();
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

  it("shows the complete desktop dossier in one compact mobile glass panel", () => {
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
    const panel = layout?.querySelector<HTMLElement>(
      "[data-battle-start-panel]",
    );
    expect(panel?.style.backdropFilter).toContain("--glass-blur");
    expect(panel?.style.top).toBe("33.333%");
    expect(panel?.style.bottom).toBe("");
    expect(panel?.style.maxHeight).toBe(
      `calc(66.667dvh - ${QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE})`,
    );
    expect(panel?.style.left).toBe(
      "max(var(--safe-area-inset-left), var(--gutter))",
    );
    expect(panel?.style.padding).toBe("var(--space-6)");
    expect(panel?.style.justifyContent).toBe("");
    expect(panel?.getAttribute("data-battle-start-panel-density")).toBe(
      "compact",
    );
    expect(
      layout?.querySelector("[data-battle-start-opponent]"),
    ).not.toBeNull();
    expect(
      layout
        ?.querySelector("[data-battle-start-opponent]")
        ?.getAttribute("data-battle-start-opponent-framing"),
    ).toBe("standing");
    expect(panel?.textContent).toContain("Aeris, the Prism Guide");
    expect(panel?.textContent).toContain("Storm Archivist");
    expect(panel?.textContent).toContain("Ability");
    expect(panel?.textContent).toContain(
      "Whenever an event resolves, gain momentum.",
    );
    const objectSection = panel?.querySelector<HTMLElement>(
      "[data-battle-start-signature-objects]",
    );
    expect(objectSection?.previousElementSibling?.textContent).toBe(
      "Signature Cards & Dreamsigns",
    );
    expect(objectSection?.querySelectorAll("[data-signature-card-id]")).toHaveLength(3);
    expect(
      objectSection?.querySelectorAll('[data-reveal-complete-game-card="true"]'),
    ).toHaveLength(3);
    expect(
      objectSection?.querySelectorAll(
        '[data-testid^="cumulus-battle-start-dreamsign-"]',
      ),
    ).toHaveLength(1);
    expect(
      Array.from(panel?.querySelectorAll("h2") ?? []).some(
        (heading) => heading.textContent === "Dreamsigns",
      ),
    ).toBe(false);
    expect(panel?.textContent).toContain("To Win");
    expect(panel?.textContent).toContain("Reward");
    expect(
      panel?.querySelector('[data-testid="cumulus-battle-start-begin"]'),
    ).not.toBeNull();
    expect(
      layout?.querySelector(
        '[data-testid^="cumulus-battle-start-carousel-"]',
      ),
    ).toBeNull();
    const action = panel?.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-battle-start-begin"]',
    );
    expect(action?.textContent).toContain("Begin Battle");
    expect(action?.getAttribute("data-glass-variant")).toBe("accent");
    expect(action?.getAttribute("data-glass-placement")).toBe("onGlass");
    act(() => action?.click());
    expect(onBegin).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("labels the combined object section Signature Cards when no Dreamsigns are present", () => {
    stubMatchMedia(false);
    const view = makeView();
    const { container, root } = mount({ ...view, dreamsigns: [] });

    const objectSection = container.querySelector<HTMLElement>(
      "[data-battle-start-signature-objects]",
    );
    expect(objectSection?.previousElementSibling?.textContent).toBe(
      "Signature Cards",
    );
    expect(
      objectSection?.querySelectorAll(
        '[data-testid^="cumulus-battle-start-dreamsign-"]',
      ),
    ).toHaveLength(0);

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
