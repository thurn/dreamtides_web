// @vitest-environment jsdom

import { act, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import { MINIMAL_ATLAS_CONFIG, MINIMAL_DREAMSCAPES } from "../__test-helpers__/atlas-fixtures";
import { createRoot, type Root } from "react-dom/client";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestMutations } from "../state/quest-context";
import type { QuestState, RuntimeShopSlot } from "../types/quest";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
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
  logEventOnce: vi.fn(),
}));

vi.mock("../components/CardDisplay", () => ({
  CardDisplay: ({ card }: { card: CardData }) => (
    <div data-test-card={String(card.cardNumber)}>{card.name}</div>
  ),
}));

vi.mock("../components/CardOverlay", () => ({
  CardOverlay: () => null,
}));

vi.mock("../cumulus/components/card/RulesText", () => ({
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
    completeDreamAugurySite: vi.fn(),
    acceptDreamMerchantOffer: vi.fn(),
    declineDreamMerchant: vi.fn(),
    pickDraftCard: vi.fn(),
    enterDraftSite: vi.fn(),
    addCard: vi.fn(),
    addBaneCard: vi.fn(),
    removeCard: vi.fn(),
    transfigureCard: vi.fn(),
    changeDeckEntryType: vi.fn(),
    changeDeckEntryKeywords: vi.fn(),
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
    setEssence: vi.fn(),
    changeMaxEssence: vi.fn(),
    addCardById: vi.fn(),
    addCardByIdWithTransfiguration: vi.fn(),
    addBaneCardById: vi.fn(),
    removeDeckEntry: vi.fn(),
    purgeDeckCards: vi.fn(),
    duplicateDeckEntry: vi.fn(),
    purgeRandomBaneCards: vi.fn(),
    purgeAllBaneCards: vi.fn(),
    pushBattleRewardModifier: vi.fn(),
    pushTemporaryBaneGrant: vi.fn(),
    addSiteToDreamscape: vi.fn(),
    replaceSiteType: vi.fn(),
    removeSiteTypeFromNextDreamscapes: vi.fn(),
    grantFreeShopRerolls: vi.fn(),
    applyShopEssenceDiscount: vi.fn(),
    boostSiteAppearance: vi.fn(),
  };
}

function makeCardDatabase(): Map<number, CardData> {
  return new Map([
    [
      1,
      {
        cardNumber: 1,
        id: asCardId("card-1"),
        name: asCardName("Test Card"),
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 2,
        spark: 1,
        isFast: false,
        renderedText: "Test text.",
        imageNumber: 1,
        artOwned: true,
      },
    ],
  ]);
}

function makeState(slots: RuntimeShopSlot[]): QuestState {
  return {
    runId: "quest:test",
    seed: "test-seed",
    essence: 500,
    essenceCap: 500,
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
      startingNodeId: "",
      bossNodeId: "",
      currentNodeId: "",
      layers: [],
      knownDreamsignCarrierIds: [],
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
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
  };
}

function setQuestContext(state: QuestState): void {
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations: makeMutations(),
    cardDatabase: makeCardDatabase(),
    questContent: {
      cardDatabase: makeCardDatabase(),
      dreamcallers: [],

      dreamwellCards: [],      dreamsignTemplates: [],      dreamscapes: MINIMAL_DREAMSCAPES,      affiliations: [], guides: [],      atlasConfig: MINIMAL_ATLAS_CONFIG,
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
    root.render(<CumulusRoot>{element}</CumulusRoot>);
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
  it("shows the Buy price as a white essence value glued to the crypto glyph", () => {
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
    // The price is part of the button label, so it carries no purple inline
    // colour -- it reads in the button's own white text.
    expect((priceSpan as HTMLElement | null)?.style.color).not.toBe(
      "var(--color-essence)",
    );

    // The crypto glyph names the currency, so no trailing "Essence" word is
    // rendered for an essence price.
    expect(priceSpan?.querySelector("i.bx-crypto")).not.toBeNull();
    expect(
      container.querySelector("[data-shop-currency-label]"),
    ).toBeNull();

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

  it("displays card prices with the permanent shop essence discount applied", () => {
    const state = {
      ...makeState([
        {
          itemType: "card",
          cardNumber: 1,
          basePrice: 100,
          discountPercent: 30,
          purchased: false,
        },
      ]),
      shopModifiers: {
        freeRerolls: 0,
        essenceDiscountPercent: 50,
      },
    };
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

    const priceSpan = container.querySelector("[data-shop-price]");
    expect(priceSpan?.textContent).toBe("20");
    expect(container.textContent).toContain("Sale 80% Off");

    act(() => {
      root.unmount();
    });
  });

  it("displays shop card prices with the permanent shop essence discount applied", () => {
    const state = {
      ...makeState([
        {
          itemType: "card",
          cardNumber: 1,
          basePrice: 200,
          discountPercent: 0,
          purchased: false,
        },
      ]),
      shopModifiers: {
        freeRerolls: 0,
        essenceDiscountPercent: 50,
      },
    };
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

    const priceSpan = container.querySelector("[data-shop-price]");
    expect(priceSpan?.textContent).toBe("100");

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

    // A boon dreamsign tile carries no bane styling.
    const tile = container.querySelector<HTMLElement>(".sh-sign");
    expect(tile).not.toBeNull();
    expect(tile?.classList.contains("is-bane")).toBe(false);

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
    // is conveyed by the tile's styling class and tint, not by an art swap.
    expect(
      container.querySelector('img[src="/dreamsigns/skull.png"]'),
    ).not.toBeNull();
    const tile = container.querySelector<HTMLElement>(".sh-sign");
    expect(tile).not.toBeNull();
    expect(tile?.classList.contains("is-bane")).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("always renders an active reroll affordance with an essence cost when the reroll has not been used this visit", () => {
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
    expect(rerollButton?.textContent).toContain("Restock");

    // Rerolls are paid for in essence; the cost renders as an essence value.
    const costEl = rerollButton?.querySelector("[data-shop-reroll-cost]");
    expect(costEl).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("disables the reroll affordance and labels it 'Restocked' after the reroll has been used this visit", () => {
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
    expect(rerollButton?.textContent).toBe("Restocked");

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
        dreamcallers: [],

        dreamwellCards: [],        dreamsignTemplates: [],        dreamscapes: MINIMAL_DREAMSCAPES,        affiliations: [], guides: [],        atlasConfig: MINIMAL_ATLAS_CONFIG,
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

  it("prices Dreamsign slots in essence", () => {
    const state: QuestState = {
      ...makeState([
        {
          itemType: "dreamsign",
          dreamsign: {
            id: "dreamsign-1",
            name: "Dreamsign One",
            effectDescription: "First effect.",
            isBane: false,
          },
          basePrice: 50,
          discountPercent: 0,
          purchased: false,
        },
      ]),
      shopModifiers: {
        freeRerolls: 0,
        essenceDiscountPercent: 0,
      },
    };
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

    // The Dreamsign Buy button carries an essence price, not omens.
    const buyButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.startsWith("Buy"),
    );
    expect(buyButton).not.toBeUndefined();
    expect(buyButton?.textContent).not.toContain("Omens");
    expect(buyButton?.querySelector("[data-shop-price]")).not.toBeNull();

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
    expect(rerollButton?.textContent).toContain("Free");
    expect(rerollButton?.disabled).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  describe("card offer hover zoom", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("renders the card offer in an in-place zoom slot without a separate floating preview", () => {
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
      // The focusable surface stays reachable by keyboard.
      expect(trigger?.tabIndex).toBe(0);

      act(() => {
        trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // The card now grows in place: the old separate `*-hover-card-*` preview
      // must never be portaled into the document body.
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
