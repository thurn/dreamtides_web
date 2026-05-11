// @vitest-environment jsdom

import { act, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestMutations } from "../state/quest-context";
import type { QuestState, RuntimeShopSlot } from "../types/quest";
import type { CardData } from "../types/cards";
import { ShopScreen } from "./ShopScreen";
import { useQuest } from "../state/quest-context";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      exit?: unknown;
      initial?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../logging", () => ({
  logEvent: vi.fn(),
}));

vi.mock("../components/CardDisplay", () => ({
  CardDisplay: ({ card }: { card: CardData }) => (
    <div data-test-card={String(card.cardNumber)}>{card.name}</div>
  ),
}));

vi.mock("../components/CardOverlay", () => ({
  CardOverlay: () => null,
}));

vi.mock("../components/RulesText", () => ({
  RulesText: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock("../debug/card-source-debug", () => ({
  buildCardSourceDebugState: () => null,
}));

function makeMutations(): QuestMutations {
  return {
    changeEssence: vi.fn(),
    startQuest: vi.fn(),
    completeSite: vi.fn(),
    ensureRewardSiteRuntime: vi.fn(),
    acceptRewardSite: vi.fn(),
    ensureDreamsignOfferRuntime: vi.fn(),
    acceptDreamsignOffer: vi.fn(),
    rejectDreamsignOffer: vi.fn(),
    ensureEssenceSiteRuntime: vi.fn(),
    acceptEssenceSite: vi.fn(),
    ensureShopRuntime: vi.fn(),
    buyShopSlot: vi.fn(),
    rerollShop: vi.fn(),
    ensureCardChoiceRuntime: vi.fn(),
    acceptTransfigurationChoice: vi.fn(),
    acceptDuplicationChoice: vi.fn(),
    ensureDreamJourneyRuntime: vi.fn(),
    completeDreamJourneyOption: vi.fn(),
    ensureTemptingOfferRuntime: vi.fn(),
    completeTemptingOfferOption: vi.fn(),
    pickDraftCard: vi.fn(),
    addCard: vi.fn(),
    addBaneCard: vi.fn(),
    removeCard: vi.fn(),
    transfigureCard: vi.fn(),
    setDreamcallerSelection: vi.fn(),
    setCardSourceDebug: vi.fn(),
    addDreamsign: vi.fn(),
    removeDreamsign: vi.fn(),
    setRemainingDreamsignPool: vi.fn(),
    incrementCompletionLevel: vi.fn(),
    setScreen: vi.fn(),
    markSiteVisited: vi.fn(),
    setCurrentDreamscape: vi.fn(),
    updateAtlas: vi.fn(),
    setDraftState: vi.fn(),
    setFailureSummary: vi.fn(),
    dismissStartingDeckPopup: vi.fn(),
    resetQuest: vi.fn(),
  };
}

function makeCardDatabase(): Map<number, CardData> {
  return new Map([
    [
      1,
      {
        cardNumber: 1,
        id: "card-1",
        name: "Test Card",
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 2,
        spark: 1,
        isFast: false,
        tides: [],
        renderedText: "Test text.",
        imageNumber: 1,
        artOwned: true,
        rarity: "Common",
      },
    ],
  ]);
}

function makeState(slots: RuntimeShopSlot[]): QuestState {
  return {
    essence: 500,
    deck: [],
    dreamcaller: null,
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [],
    completionLevel: 0,
    atlas: {
      nodes: {},
      edges: [],
      startingNodeId: "",
    },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {
      "shop-1": {
        kind: "shop",
        slots,
        rerollCount: 0,
        remainingDreamsignPoolIds: [],
      },
    },
    draftState: null,
    screen: { type: "site", siteId: "shop-1" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: true,
  };
}

function setQuestContext(state: QuestState): void {
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations: makeMutations(),
    cardDatabase: makeCardDatabase(),
    questContent: {
      cardDatabase: makeCardDatabase(),
      cardsByPackageTide: new Map(),
      dreamcallers: [],
      dreamsignTemplates: [],
      resolvedPackagesByDreamcallerId: new Map(),
    },
  });
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
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ShopScreen", () => {
  it("paints the Buy price's number and 'Essence' label in the shared essence colour", () => {
    setQuestContext(
      makeState([
        {
          itemType: "card",
          cardNumber: 1,
          basePrice: 100,
          discountPercent: 0,
          purchased: false,
        },
      ]),
    );

    const { container, root } = mount(
      <ShopScreen
        site={{
          id: "shop-1",
          type: "Shop",
          isEnhanced: false,
          isVisited: false,
        }}
      />,
    );

    const priceSpan = container.querySelector("[data-shop-essence-price]");
    expect(priceSpan).not.toBeNull();
    expect(priceSpan?.textContent).toBe("100");
    expect((priceSpan as HTMLElement | null)?.style.color).toBe(
      "var(--color-essence)",
    );

    // The "Essence" label is the second purple span -- the verb
    // "Buy" stays neutral so only the cost reads as currency.
    const labels = container.querySelectorAll("[data-shop-essence-label]");
    expect(labels.length).toBeGreaterThan(0);
    expect((labels[0] as HTMLElement).style.color).toBe(
      "var(--color-essence)",
    );
    expect(labels[0]?.textContent).toBe("Essence");

    // No legacy currency glyph anywhere in the Buy button row.
    expect(container.textContent).not.toContain("◆");
    expect(container.textContent).not.toContain("⬢");

    act(() => {
      root.unmount();
    });
  });

  it("shows only the discounted price on sale items, with no strikethrough or original price", () => {
    setQuestContext(
      makeState([
        {
          itemType: "card",
          cardNumber: 1,
          basePrice: 100,
          discountPercent: 30,
          purchased: false,
        },
      ]),
    );

    const { container, root } = mount(
      <ShopScreen
        site={{
          id: "shop-1",
          type: "Shop",
          isEnhanced: false,
          isVisited: false,
        }}
      />,
    );

    // No strikethrough element anywhere in the rendered tree.
    expect(container.querySelector(".line-through")).toBeNull();
    expect(container.querySelector("s")).toBeNull();

    // The Buy button surfaces only the discounted price (70), not the base
    // price (100). The base price must not appear anywhere on the button.
    const buyButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.startsWith("Buy"),
    );
    expect(buyButton).not.toBeUndefined();
    expect(buyButton?.textContent).toContain("70");
    expect(buyButton?.textContent).not.toContain("100");

    // The SALE caption is still rendered below the button.
    expect(container.textContent).toContain("Sale 30% Off");

    act(() => {
      root.unmount();
    });
  });

  it("renders the price button identically for non-sale items (regression: discount path must not alter base rendering)", () => {
    setQuestContext(
      makeState([
        {
          itemType: "card",
          cardNumber: 1,
          basePrice: 80,
          discountPercent: 0,
          purchased: false,
        },
      ]),
    );

    const { container, root } = mount(
      <ShopScreen
        site={{
          id: "shop-1",
          type: "Shop",
          isEnhanced: false,
          isVisited: false,
        }}
      />,
    );

    const buyButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.startsWith("Buy"),
    );
    expect(buyButton).not.toBeUndefined();
    expect(buyButton?.textContent).toContain("80");
    expect(container.querySelector(".line-through")).toBeNull();
    expect(container.textContent).not.toContain("Sale");

    act(() => {
      root.unmount();
    });
  });

  it("paints the Reroll button's essence cost in the shared essence colour", () => {
    setQuestContext(
      makeState([
        {
          itemType: "reroll",
          basePrice: 50,
          discountPercent: 0,
          purchased: false,
        },
      ]),
    );

    const { container, root } = mount(
      <ShopScreen
        site={{
          id: "shop-1",
          type: "Shop",
          isEnhanced: false,
          isVisited: false,
        }}
      />,
    );

    const rerollLabel = container.querySelector("[data-shop-essence-label]");
    expect(rerollLabel).not.toBeNull();
    expect(rerollLabel?.textContent).toBe("Essence");
    expect((rerollLabel as HTMLElement | null)?.style.color).toBe(
      "var(--color-essence)",
    );

    // The button still surfaces the numeric cost alongside the word.
    const rerollButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Reroll"));
    expect(rerollButton).not.toBeUndefined();
    expect(rerollButton?.textContent).toContain("50");
    expect(rerollButton?.textContent).not.toContain("◆");
    expect(rerollButton?.textContent).not.toContain("⬢");

    act(() => {
      root.unmount();
    });
  });
});
