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
    completeDreamJourneySite: vi.fn(),
    pickDraftCard: vi.fn(),
    addCard: vi.fn(),
    addBaneCard: vi.fn(),
    removeCard: vi.fn(),
    cleanseBanes: vi.fn(),
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
    bootstrapStartInBattle: vi.fn(),
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
      },
    ],
  ]);
}

function makeState(slots: RuntimeShopSlot[]): QuestState {
  return {
    essence: 500,
    essenceCap: 500,
    omens: 5,
    maxDreamsigns: 12,
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
        restrictedTide: null,
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

    const priceSpan = container.querySelector("[data-shop-price]");
    expect(priceSpan).not.toBeNull();
    expect(priceSpan?.textContent).toBe("100");
    expect((priceSpan as HTMLElement | null)?.style.color).toBe(
      "var(--color-essence)",
    );

    // The "Essence" label is the second purple span -- the verb
    // "Buy" stays neutral so only the cost reads as currency.
    const labels = container.querySelectorAll("[data-shop-currency-label]");
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

  it("renders dreamsign shop tiles using the dreamsign's artwork", () => {
    setQuestContext(
      makeState([
        {
          itemType: "dreamsign",
          dreamsign: {
            id: "clover",
            name: "Clover",
            effectDescription: "Each turn, gain 1 essence.",
            imageName: "clover.png",
            imageAlt: "A four-leaf clover",
            isBane: false,
          },
          basePrice: 150,
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

    // The dreamsign tile renders its artwork from /dreamsigns/<imageName>
    // so the shop tile matches the visual treatment used by the HUD,
    // Deck Viewer, and dreamsign-pick screens.
    const artImg = container.querySelector<HTMLImageElement>(
      'img[src="/dreamsigns/clover.png"]',
    );
    expect(artImg).not.toBeNull();
    expect(artImg?.getAttribute("alt")).toBe("A four-leaf clover");

    // The art tile carries the shared boon styling.
    const tile = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    expect(tile?.dataset.isBane).toBe("false");

    act(() => {
      root.unmount();
    });
  });

  it("applies bane styling to a bane dreamsign shop tile without swapping the artwork", () => {
    setQuestContext(
      makeState([
        {
          itemType: "dreamsign",
          dreamsign: {
            id: "skull",
            name: "Skull",
            effectDescription: "When you draw a card, you lose 1 essence.",
            imageName: "skull.png",
            imageAlt: "A pale skull",
            isBane: true,
          },
          basePrice: 150,
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

    // Bane dreamsigns still load the same artwork pipeline; the bane state
    // is conveyed by the tile attribute and tint, not by an art swap.
    expect(
      container.querySelector('img[src="/dreamsigns/skull.png"]'),
    ).not.toBeNull();
    const tile = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    expect(tile?.dataset.isBane).toBe("true");

    act(() => {
      root.unmount();
    });
  });

  it("always renders an active reroll affordance with a 1 omen cost when the reroll has not been used this visit", () => {
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

    const rerollButton = container.querySelector<HTMLButtonElement>(
      "[data-shop-reroll-button]",
    );
    expect(rerollButton).not.toBeNull();
    expect(rerollButton?.disabled).toBe(false);
    expect(rerollButton?.dataset.shopRerollUsed).toBe("false");
    expect(rerollButton?.textContent).toContain("Reroll Shop");
    expect(rerollButton?.textContent).toContain("1");
    expect(rerollButton?.textContent).not.toContain("◆");
    expect(rerollButton?.textContent).not.toContain("⬢");

    // Rerolls are paid for in omens.
    const labels = rerollButton?.querySelectorAll("[data-shop-omens-label]");
    expect(labels?.length).toBeGreaterThan(0);
    if (labels) {
      expect(labels[0]?.textContent).toBe("Omens");
    }

    act(() => {
      root.unmount();
    });
  });

  it("disables the reroll affordance and labels it 'Reroll Used' after the reroll has been used this visit", () => {
    const slots: RuntimeShopSlot[] = [
      {
        itemType: "card",
        cardNumber: 1,
        basePrice: 100,
        discountPercent: 0,
        purchased: false,
      },
    ];
    const state = makeState(slots);
    const shopRuntime = state.siteRuntime["shop-1"];
    if (shopRuntime !== undefined && shopRuntime.kind === "shop") {
      shopRuntime.rerollCount = 1;
    }
    setQuestContext(state);

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

    const rerollButton = container.querySelector<HTMLButtonElement>(
      "[data-shop-reroll-button]",
    );
    expect(rerollButton).not.toBeNull();
    expect(rerollButton?.disabled).toBe(true);
    expect(rerollButton?.dataset.shopRerollUsed).toBe("true");
    expect(rerollButton?.textContent).toBe("Reroll Used");

    act(() => {
      root.unmount();
    });
  });

  it("invokes rerollShop without a slot index when the reroll affordance is clicked", () => {
    const mutations = makeMutations();
    vi.mocked(useQuest).mockReturnValue({
      state: makeState([
        {
          itemType: "card",
          cardNumber: 1,
          basePrice: 100,
          discountPercent: 0,
          purchased: false,
        },
      ]),
      mutations,
      cardDatabase: makeCardDatabase(),
      questContent: {
        cardDatabase: makeCardDatabase(),
        cardsByPackageTide: new Map(),
        dreamcallers: [],
        dreamsignTemplates: [],
        resolvedPackagesByDreamcallerId: new Map(),
      },
    });

    const site = {
      id: "shop-1",
      type: "Shop" as const,
      isEnhanced: false,
      isVisited: false,
    };

    const { container, root } = mount(<ShopScreen site={site} />);

    const rerollButton = container.querySelector<HTMLButtonElement>(
      "[data-shop-reroll-button]",
    );
    expect(rerollButton).not.toBeNull();
    act(() => {
      rerollButton?.click();
    });

    // Reroll is now keyed to the site, not a slot index in the grid. The
    // mutation receives the SiteState exactly once, with no slot index.
    expect(mutations.rerollShop).toHaveBeenCalledTimes(1);
    expect(mutations.rerollShop).toHaveBeenCalledWith(site);

    act(() => {
      root.unmount();
    });
  });

  it("shows the reroll affordance as FREE on an enhanced shop visit", () => {
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
          isEnhanced: true,
          isVisited: false,
        }}
      />,
    );

    const rerollButton = container.querySelector<HTMLButtonElement>(
      "[data-shop-reroll-button]",
    );
    expect(rerollButton?.textContent).toContain("FREE");
    expect(rerollButton?.disabled).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  describe("card offer hover preview", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("portals a full card preview when a card offer row is hovered after the 300ms delay", () => {
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

      // No portaled card preview before hover.
      expect(
        document.body.querySelectorAll(
          "[data-testid='shop-offer-hover-card-0']",
        ),
      ).toHaveLength(0);

      const trigger = container.querySelector<HTMLElement>(
        "[data-testid='shop-offer-row-0']",
      );
      expect(trigger).not.toBeNull();

      act(() => {
        trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      });

      // The popover only appears after the configured 300ms delay.
      expect(
        document.body.querySelectorAll(
          "[data-testid='shop-offer-hover-card-0']",
        ),
      ).toHaveLength(0);

      act(() => {
        vi.advanceTimersByTime(350);
      });

      expect(
        document.body.querySelector("[data-testid='shop-offer-hover-card-0']"),
      ).not.toBeNull();

      act(() => {
        root.unmount();
      });
    });

    it("hides the shop offer preview cleanly on mouse-out", () => {
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

      const trigger = container.querySelector<HTMLElement>(
        "[data-testid='shop-offer-row-0']",
      );
      expect(trigger).not.toBeNull();

      act(() => {
        trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(350);
      });

      expect(
        document.body.querySelector("[data-testid='shop-offer-hover-card-0']"),
      ).not.toBeNull();

      act(() => {
        trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      });

      expect(
        document.body.querySelectorAll(
          "[data-testid='shop-offer-hover-card-0']",
        ),
      ).toHaveLength(0);

      act(() => {
        root.unmount();
      });
    });

    it("opens the shop offer preview when the offer's focusable surface receives keyboard focus", () => {
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

      const focusTarget = container.querySelector<HTMLElement>(
        "[data-testid='shop-offer-row-0']",
      );
      expect(focusTarget).not.toBeNull();
      if (!(focusTarget instanceof HTMLElement)) {
        throw new Error("Expected shop offer row to be an HTMLElement");
      }

      // The focusable surface must be reachable by keyboard so screen-reader
      // and keyboard-only users can reveal the preview without a pointer.
      expect(focusTarget.tabIndex).toBe(0);

      act(() => {
        focusTarget.focus();
      });
      act(() => {
        vi.advanceTimersByTime(350);
      });

      expect(
        document.body.querySelector("[data-testid='shop-offer-hover-card-0']"),
      ).not.toBeNull();

      act(() => {
        focusTarget.blur();
      });

      expect(
        document.body.querySelectorAll(
          "[data-testid='shop-offer-hover-card-0']",
        ),
      ).toHaveLength(0);

      act(() => {
        root.unmount();
      });
    });
  });
});
