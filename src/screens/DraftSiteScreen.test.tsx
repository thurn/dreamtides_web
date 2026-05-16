// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestMutations } from "../state/quest-context";
import type { CardData } from "../types/cards";
import type { DraftState } from "../types/draft";
import type { QuestState } from "../types/quest";
import { DraftSiteScreen } from "./DraftSiteScreen";
import { useQuest } from "../state/quest-context";

vi.mock("framer-motion", async () => {
  const React = await import("react");

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
      div: React.forwardRef(function MockMotionDiv(
        {
          animate: _animate,
          children,
          exit: _exit,
          initial: _initial,
          layout: _layout,
          transition: _transition,
          ...props
        }: {
          animate?: unknown;
          children: ReactNode;
          exit?: unknown;
          initial?: unknown;
          layout?: boolean;
          transition?: unknown;
        } & HTMLAttributes<HTMLDivElement>,
        ref: React.ForwardedRef<HTMLDivElement>,
      ) {
        return (
          <div ref={ref} {...props}>
            {children}
          </div>
        );
      }),
      button: React.forwardRef(function MockMotionButton(
        {
          animate: _animate,
          children,
          exit: _exit,
          initial: _initial,
          transition: _transition,
          whileHover: _whileHover,
          whileTap: _whileTap,
          ...props
        }: {
          animate?: unknown;
          children: ReactNode;
          exit?: unknown;
          initial?: unknown;
          transition?: unknown;
          whileHover?: unknown;
          whileTap?: unknown;
        } & HTMLAttributes<HTMLButtonElement>,
        ref: React.ForwardedRef<HTMLButtonElement>,
      ) {
        return (
          <button ref={ref} {...props}>
            {children}
          </button>
        );
      }),
    },
  };
});

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../logging", () => ({
  logEvent: vi.fn(),
}));

vi.mock("../debug/card-source-debug", () => ({
  buildCardSourceDebugState: () => null,
}));

vi.mock("../components/CardDisplay", () => ({
  CardDisplay: ({
    card,
    className,
    onClick,
  }: {
    card: CardData;
    className?: string;
    onClick?: () => void;
  }) => (
    <button className={className} type="button" onClick={onClick}>
      {card.name}
    </button>
  ),
}));

vi.mock("../components/CardOverlay", () => ({
  CardOverlay: () => null,
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
    changeOmens: vi.fn(),
    setEssence: vi.fn(),
    changeMaxEssence: vi.fn(),
    addCardById: vi.fn(),
    addBaneCardById: vi.fn(),
    removeDeckEntry: vi.fn(),
    duplicateDeckEntry: vi.fn(),
    pushBattleRewardModifier: vi.fn(),
    pushTemporaryBaneGrant: vi.fn(),
    addSiteToDreamscape: vi.fn(),
    replaceSiteType: vi.fn(),
    removeSiteTypeFromNextDreamscapes: vi.fn(),
    grantFreeShopRerolls: vi.fn(),
    applyShopEssenceDiscount: vi.fn(),
    grantShopOmenDiscounts: vi.fn(),
    boostSiteAppearance: vi.fn(),
  };
}

function makeCardDatabase(): Map<number, CardData> {
  return new Map([
    [
      1,
      {
        name: "Starter Lantern",
        id: "starter-lantern",
        cardNumber: 1,
        cardType: "Character",
        subtype: "",
        isStarter: true,
        energyCost: 1,
        spark: 1,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Starter text.",
        imageNumber: 1,
        artOwned: false,
      },
    ],
    [
      101,
      {
        name: "Arc Runner",
        id: "arc-runner",
        cardNumber: 101,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 2,
        spark: 2,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Offer text.",
        imageNumber: 101,
        artOwned: false,
      },
    ],
    [
      102,
      {
        name: "Alpha Warden",
        id: "alpha-warden",
        cardNumber: 102,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 3,
        spark: 2,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Offer text.",
        imageNumber: 102,
        artOwned: false,
      },
    ],
    [
      103,
      {
        name: "Beta Ledger",
        id: "beta-ledger",
        cardNumber: 103,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        energyCost: 4,
        spark: null,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Offer text.",
        imageNumber: 103,
        artOwned: false,
      },
    ],
    [
      104,
      {
        name: "Gamma Echo",
        id: "gamma-echo",
        cardNumber: 104,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        energyCost: 5,
        spark: null,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Offer text.",
        imageNumber: 104,
        artOwned: false,
      },
    ],
    [
      201,
      {
        name: "Reserve One",
        id: "reserve-one",
        cardNumber: 201,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 2,
        spark: 1,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Reserve text.",
        imageNumber: 201,
        artOwned: false,
      },
    ],
    [
      202,
      {
        name: "Reserve Two",
        id: "reserve-two",
        cardNumber: 202,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 3,
        spark: 1,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Reserve text.",
        imageNumber: 202,
        artOwned: false,
      },
    ],
    [
      203,
      {
        name: "Reserve Three",
        id: "reserve-three",
        cardNumber: 203,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        energyCost: 4,
        spark: null,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Reserve text.",
        imageNumber: 203,
        artOwned: false,
      },
    ],
    [
      204,
      {
        name: "Reserve Four",
        id: "reserve-four",
        cardNumber: 204,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        energyCost: 5,
        spark: null,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Reserve text.",
        imageNumber: 204,
        artOwned: false,
      },
    ],
  ]);
}

function makeDraftState(): DraftState {
  return {
    draftPoolCopiesByCard: {
      "201": 1,
      "202": 1,
      "203": 1,
      "204": 1,
    },
    remainingCopiesByCard: {
      "201": 1,
      "202": 1,
      "203": 1,
      "204": 1,
    },
    currentOffer: [101, 102, 103, 104],
    activeSiteId: "site-1",
    pickNumber: 1,
    sitePicksCompleted: 0,
  };
}

function makeState(overrides: Partial<QuestState> = {}): QuestState {
  return {
    seed: "test-seed",
    essence: 100,
    essenceCap: 500,
    omens: 0,
    maxDreamsigns: 12,
    deck: [
      {
        entryId: "entry-1",
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
      },
    ],
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
    siteRuntime: {},
    draftState: makeDraftState(),
    screen: { type: "site", siteId: "site-1" },
    activeSiteId: "site-1",
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      upcomingOmenDiscounts: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
    ...overrides,
  };
}

let currentState: QuestState;
let currentMutations: QuestMutations;
let currentCardDatabase: Map<number, CardData>;
let mountedElement: ReactElement | null = null;
let mountedRoot: Root | null = null;
let nextEntryId = 2;

function rerenderCurrent(): void {
  if (mountedElement === null || mountedRoot === null) {
    return;
  }

  act(() => {
    mountedRoot?.render(mountedElement);
  });
}

function setQuestContext(
  state: QuestState,
  mutations: QuestMutations,
  cardDatabase: Map<number, CardData>,
): void {
  currentState = state;
  currentMutations = mutations;
  currentCardDatabase = cardDatabase;

  vi.mocked(useQuest).mockImplementation(() => ({
    state: currentState,
    mutations: currentMutations,
    cardDatabase: currentCardDatabase,
    questContent: {
      cardDatabase: currentCardDatabase,
      cardsByPackageTide: new Map(),
      dreamcallers: [],
      dreamsignTemplates: [],
      resolvedPackagesByDreamcallerId: new Map(),
    },
  }));
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedElement = element;
  mountedRoot = root;
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function clickButton(container: HTMLElement, label: string): void {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) {
    throw new Error(`Could not find button with label: ${label}`);
  }

  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  nextEntryId = 2;
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
      requestAnimationFrame: (callback: FrameRequestCallback) => number;
      cancelAnimationFrame: (handle: number) => void;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};
  mountedElement = null;
  mountedRoot = null;
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("DraftSiteScreen", () => {
  it("surfaces a draft card before header controls for mechanical QA picks", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);
    const body = container.textContent ?? "";
    const controls = Array.from(
      container.querySelectorAll("button,[role=\"button\"]"),
    ).filter((element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      return !element.hasAttribute("disabled");
    });
    const choice = controls.find((element) => {
      const text = element.textContent?.trim() ?? "";
      return (
        text !== ""
        && !/Continue|Accept|Decline|Reject|Leave Shop|Skip|Battle|Miniboss|Final Boss/.test(
          text,
        )
      );
    });

    expect(body).toContain("Pick 1/5");
    expect(choice?.textContent).toContain("Arc Runner");

    act(() => {
      root.unmount();
    });
  });

  it("shows the deck sidebar immediately on the draft screen", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    expect(container.querySelector('[data-testid="draft-deck-sidebar"]')).not.toBeNull();
    expect(container.textContent).toContain("Deck (1)");
    expect(container.textContent).toContain("Starter Lantern");

    act(() => {
      root.unmount();
    });
  });

  it("toggles the deck sidebar via the chevron button and omits the redundant count badge", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    // The redundant deck count badge in the draft header is gone — the deck
    // count is communicated by the deck-panel header ("Deck (N)") and the
    // bottom HUD ("N Cards"). A small card-shaped badge in the header would
    // teach players to ignore real cards.
    expect(
      container.querySelector('[data-testid="draft-deck-count-badge"]'),
    ).toBeNull();

    // Initial state: sidebar expanded, chevron points toward the edge it
    // folds into (right) and reports `aria-expanded="true"`.
    expect(
      container.querySelector('[data-testid="draft-deck-sidebar"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="draft-deck-sidebar-collapsed-rail"]',
      ),
    ).toBeNull();
    const expandedToggle = container.querySelector(
      '[data-testid="draft-deck-toggle"]',
    );
    expect(expandedToggle).not.toBeNull();
    expect(expandedToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(expandedToggle?.getAttribute("data-expanded")).toBe("true");
    expect(expandedToggle?.getAttribute("aria-label")).toBe(
      "Collapse deck panel",
    );
    expect(expandedToggle?.textContent).toBe("▶");

    // Click chevron: panel folds away, the collapsed-rail toggle takes its
    // place, and the chevron now points back toward where the panel will
    // re-emerge from.
    act(() => {
      expandedToggle?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(
      container.querySelector('[data-testid="draft-deck-sidebar"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="draft-deck-sidebar-collapsed-rail"]',
      ),
    ).not.toBeNull();
    const collapsedToggle = container.querySelector(
      '[data-testid="draft-deck-toggle"]',
    );
    expect(collapsedToggle).not.toBeNull();
    expect(collapsedToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(collapsedToggle?.getAttribute("data-expanded")).toBe("false");
    expect(collapsedToggle?.getAttribute("aria-label")).toBe(
      "Expand deck panel",
    );
    expect(collapsedToggle?.textContent).toBe("◀");

    // The deck count badge remains absent while collapsed.
    expect(
      container.querySelector('[data-testid="draft-deck-count-badge"]'),
    ).toBeNull();

    // Click chevron again: panel re-expands and chevron flips back.
    act(() => {
      collapsedToggle?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(
      container.querySelector('[data-testid="draft-deck-sidebar"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="draft-deck-sidebar-collapsed-rail"]',
      ),
    ).toBeNull();
    const reopenedToggle = container.querySelector(
      '[data-testid="draft-deck-toggle"]',
    );
    expect(reopenedToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(reopenedToggle?.textContent).toBe("▶");

    act(() => {
      root.unmount();
    });
  });

  it("renders a fly-to-deck animation after a draft pick updates the deck", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    mutations.pickDraftCard = vi.fn((siteId: string, cardNumber: number) => {
      const draftState = currentState.draftState;
      if (draftState === null || draftState.activeSiteId !== siteId) {
        return;
      }

      currentState = {
        ...currentState,
        deck: [
          ...currentState.deck,
          {
            entryId: `entry-${String(nextEntryId++)}`,
            cardNumber,
            transfiguration: null,
            isBane: false,
          },
        ],
        draftState: {
          ...draftState,
          remainingCopiesByCard: {},
          currentOffer: [201, 202, 203, 204],
          pickNumber: draftState.pickNumber + 1,
          sitePicksCompleted: draftState.sitePicksCompleted + 1,
        },
      };
      rerenderCurrent();
    });

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    clickButton(container, "Arc Runner");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mutations.pickDraftCard).toHaveBeenCalledWith("site-1", 101);
    expect(mutations.setDraftState).not.toHaveBeenCalled();
    expect(mutations.addCard).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="draft-flying-card"]')).not.toBeNull();
    expect(container.textContent).toContain("Deck (2)");
    expect(container.textContent).toContain("Arc Runner");

    act(() => {
      root.unmount();
    });
  });

  it("keeps the draft screen open when a pick is not committed", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    clickButton(container, "Arc Runner");

    act(() => {
      vi.advanceTimersByTime(300 + 500);
    });

    expect(mutations.pickDraftCard).toHaveBeenCalledWith("site-1", 101);
    expect(container.textContent).toContain("Pick 1/5");
    expect(container.textContent).toContain("Arc Runner");
    expect(container.textContent).not.toContain("Draft Complete");

    act(() => {
      root.unmount();
    });
  });

  it("does not change a draft offer card's outline color on mouse hover for either card type", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    // The offer pack mixes Character cards (101, 102) with Event cards
    // (103, 104). Hover should never re-color the card outline regardless of
    // type — character cards must not gain an orange / amber glow that event
    // cards lack.
    const wrappers = [101, 102, 103, 104].map((cardNumber) => {
      const wrapper = container.querySelector(
        `[data-testid="draft-offer-card-wrapper-${String(cardNumber)}"]`,
      );
      if (!(wrapper instanceof HTMLElement)) {
        throw new Error(
          `Missing offer wrapper for card ${String(cardNumber)}`,
        );
      }
      return wrapper;
    });

    for (const wrapper of wrappers) {
      const before = wrapper.style.boxShadow;
      act(() => {
        wrapper.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      });
      const after = wrapper.style.boxShadow;
      expect(after).toBe(before);
      // Sanity: the inline boxShadow must never carry a hover-applied color.
      expect(after).not.toContain("249, 115, 22");
      expect(after).not.toContain("#f97316");
    }

    act(() => {
      root.unmount();
    });
  });

  it("constrains the draft layout to the viewport so no scroll is introduced", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    const screen = container.querySelector(
      "[data-testid=\"draft-site-screen\"]",
    );
    if (!(screen instanceof HTMLElement)) {
      throw new Error("Expected draft site screen wrapper to be present");
    }

    // The wrapper sizes itself to viewport-minus-HUD and clips overflow so
    // a slightly-too-tall card grid never pushes the document past the
    // viewport. If either invariant regresses, common laptop sizes start
    // showing a vertical scrollbar at the very first interactive screen.
    expect(screen.style.height).toContain("100vh");
    expect(screen.style.height).toContain("48px");
    expect(screen.className).toMatch(/\boverflow-hidden\b/);

    // Each offer card wrapper sizes itself to half of (viewport - HUD -
    // header chrome) so the 2x2 grid always fits two rows in the screen.
    // Without this constraint the card defaults to its content height and
    // the bottom row clips at 1280x633-style laptop sizes.
    const offerWrappers = Array.from(screen.querySelectorAll("div")).filter(
      (element) =>
        element.style.aspectRatio === "2 / 3"
        && element.style.height.startsWith("calc"),
    );
    expect(offerWrappers).toHaveLength(4);
    for (const wrapper of offerWrappers) {
      // The browser keeps `(… - 48px - 80px) / 2`; jsdom normalizes it to
      // `0.5 * (… - 48px - 80px)`. Either form expresses "half of viewport
      // minus HUD minus header chrome" — accept either.
      expect(wrapper.style.height).toContain("100vh");
      expect(wrapper.style.height).toContain("48px");
      expect(wrapper.style.height).toContain("80px");
      expect(wrapper.style.height).toMatch(/\/\s*2|0\.5\s*\*/);
    }

    act(() => {
      root.unmount();
    });
  });

  it("scrolls the deck sidebar independently of the draft offers when it overflows", () => {
    // Build a deck large enough that the row list cannot possibly fit inside
    // the sidebar's flex remainder. The exact viewport height doesn't matter
    // for the structural assertions below — they encode the layout invariants
    // that produce in-panel scrolling regardless of how tall the viewport is.
    const overflowingDeck = Array.from({ length: 30 }, (_, i) => ({
      entryId: `deck-${String(i + 1)}`,
      cardNumber: i % 4 === 0 ? 1 : i % 4 === 1 ? 101 : i % 4 === 2 ? 102 : 103,
      transfiguration: null,
      isBane: false,
    }));
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(
      makeState({ deck: overflowingDeck }),
      mutations,
      cardDatabase,
    );

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    // The sidebar wrapper must be a flex column constrained to the parent
    // height; without `flex-col` + a height the inner rows list cannot
    // claim a fixed share of the panel and overflow-y on the rows does
    // nothing (the bug). `overflow-hidden` keeps the rows from spilling
    // visually past the panel edges while the rows themselves scroll.
    const sidebar = container.querySelector(
      "[data-testid='draft-deck-sidebar']",
    );
    if (!(sidebar instanceof HTMLElement)) {
      throw new Error("Expected draft-deck-sidebar wrapper");
    }
    expect(sidebar.className).toMatch(/\bflex\b/);
    expect(sidebar.className).toMatch(/\bflex-col\b/);
    expect(sidebar.className).toMatch(/\bh-full\b/);
    expect(sidebar.className).toMatch(/\boverflow-hidden\b/);

    // The rows container is the scroll region: it must claim the remaining
    // flex height (`flex-1 min-h-0`) and own the vertical overflow. Without
    // `min-h-0` the flex item refuses to shrink below its content height
    // and rows clip past the panel without a scrollbar.
    const rows = container.querySelector(
      "[data-testid='draft-deck-rows']",
    );
    if (!(rows instanceof HTMLElement)) {
      throw new Error("Expected draft-deck-rows scroll container");
    }
    expect(rows.className).toMatch(/\bflex-1\b/);
    expect(rows.className).toMatch(/\bmin-h-0\b/);
    expect(rows.className).toMatch(/\boverflow-y-auto\b/);

    // The page-level wrapper itself still clips overflow so the draft
    // offers stay anchored — page scroll is not the answer here.
    const screen = container.querySelector(
      "[data-testid='draft-site-screen']",
    );
    if (!(screen instanceof HTMLElement)) {
      throw new Error("Expected draft-site-screen wrapper");
    }
    expect(screen.className).toMatch(/\boverflow-hidden\b/);

    // The scroll region is opted into the dark-theme scrollbar class so the
    // panel does not show a default OS scrollbar against the dark UI.
    expect(rows.className).toMatch(/\bdraft-deck-rail-scroll\b/);

    act(() => {
      root.unmount();
    });
  });

  it("completes the draft site from the committed summary", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(
      makeState({
        deck: [
          {
            entryId: "entry-1",
            cardNumber: 1,
            transfiguration: null,
            isBane: false,
          },
          {
            entryId: "entry-2",
            cardNumber: 101,
            transfiguration: null,
            isBane: false,
          },
        ],
        draftState: {
          draftPoolCopiesByCard: {},
          remainingCopiesByCard: {},
          currentOffer: [],
          activeSiteId: "site-1",
          pickNumber: 2,
          sitePicksCompleted: 1,
        },
      }),
      mutations,
      cardDatabase,
    );

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    expect(container.textContent).toContain("Draft Complete");
    clickButton(container, "Continue");

    expect(mutations.completeSite).toHaveBeenCalledWith(
      "site-1",
      "draft_site_completed",
    );
    expect(mutations.markSiteVisited).not.toHaveBeenCalled();
    expect(mutations.setScreen).toHaveBeenCalledWith({ type: "dreamscape" });

    act(() => {
      root.unmount();
    });
  });

  it("portals a full card preview when a deck row is hovered", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    // No portaled card preview before hover.
    expect(
      document.body.querySelectorAll(
        "[data-testid='draft-deck-row-hover-card-entry-1']",
      ),
    ).toHaveLength(0);

    const row = container.querySelector(
      "[data-testid='draft-deck-row-entry-1']",
    );
    expect(row).not.toBeNull();
    const trigger = row?.parentElement;
    expect(trigger).not.toBeNull();

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    // Popover only appears after the configured 300ms delay.
    expect(
      document.body.querySelectorAll(
        "[data-testid='draft-deck-row-hover-card-entry-1']",
      ),
    ).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(
      document.body.querySelector(
        "[data-testid='draft-deck-row-hover-card-entry-1']",
      ),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("hides the deck-row preview cleanly on mouse-out", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    const row = container.querySelector(
      "[data-testid='draft-deck-row-entry-1']",
    );
    const trigger = row?.parentElement;

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(
      document.body.querySelector(
        "[data-testid='draft-deck-row-hover-card-entry-1']",
      ),
    ).not.toBeNull();

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });

    expect(
      document.body.querySelectorAll(
        "[data-testid='draft-deck-row-hover-card-entry-1']",
      ),
    ).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it("opens the deck-row preview when a row receives keyboard focus", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    const row = container.querySelector(
      "[data-testid='draft-deck-row-entry-1']",
    );
    expect(row).not.toBeNull();
    if (!(row instanceof HTMLElement)) {
      throw new Error("Expected deck row to be an HTMLElement");
    }

    // The row must be keyboard-focusable so screen-reader / keyboard users
    // can reveal the preview without a pointer.
    expect(row.tabIndex).toBe(0);

    act(() => {
      row.focus();
    });
    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(
      document.body.querySelector(
        "[data-testid='draft-deck-row-hover-card-entry-1']",
      ),
    ).not.toBeNull();

    act(() => {
      row.blur();
    });

    expect(
      document.body.querySelectorAll(
        "[data-testid='draft-deck-row-hover-card-entry-1']",
      ),
    ).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  // Regression for the visible "fade out / fade in" flicker on draft entry.
  // Before the fix, the screen mounted with `state.draftState.activeSiteId`
  // still pointing somewhere else (or null), painted an empty grid, then
  // re-rendered once the RTDB write round-tripped — AnimatePresence saw the
  // grid key change and animated the empty pack out / new pack in.
  //
  // Pin the invariant directly: when entered with un-entered draft state,
  // the first render already shows the freshly-bootstrapped offer cards,
  // and the subsequent live-state catch-up does not change which cards
  // are on screen.
  it(
    "shows the bootstrapped offer on first render and does not swap offers"
      + " when the live draft state catches up",
    () => {
      const mutations = makeMutations();
      const cardDatabase = makeCardDatabase();
      // Draft pool seeded with cards 101..104 only — bootstrap must select
      // exactly these four numbers in some order.
      const unEnteredDraftState: DraftState = {
        draftPoolCopiesByCard: {
          "101": 1,
          "102": 1,
          "103": 1,
          "104": 1,
        },
        remainingCopiesByCard: {
          "101": 1,
          "102": 1,
          "103": 1,
          "104": 1,
        },
        currentOffer: [],
        activeSiteId: null,
        pickNumber: 1,
        sitePicksCompleted: 0,
      };
      setQuestContext(
        makeState({ draftState: unEnteredDraftState }),
        mutations,
        cardDatabase,
      );

      const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

      // First render must already display the four offer cards. Before the
      // fix this saw zero offer cards (the empty / fading-out grid).
      const expectedNames = [
        "Arc Runner",
        "Alpha Warden",
        "Beta Ledger",
        "Gamma Echo",
      ];
      const draftRoot = container.querySelector(
        "[data-testid='draft-site-screen']",
      );
      expect(draftRoot).not.toBeNull();
      const text = draftRoot?.textContent ?? "";
      for (const name of expectedNames) {
        expect(text).toContain(name);
      }

      // The bootstrap effect must have written the new draft state once.
      expect(mutations.setDraftState).toHaveBeenCalledTimes(1);
      const writtenDraftState = (
        mutations.setDraftState as ReturnType<typeof vi.fn>
      ).mock.calls[0]?.[0] as DraftState;
      expect(writtenDraftState.activeSiteId).toBe("site-1");
      expect([...writtenDraftState.currentOffer].sort()).toEqual([
        101, 102, 103, 104,
      ]);

      // Capture the offer-grid wrapper (motion.div with key `offer-...`)
      // identity before catch-up — if AnimatePresence remounts on the live
      // snapshot, the DOM node identity changes and so does the textContent
      // ordering.
      const offerGridBefore = draftRoot?.querySelector(".order-2");
      expect(offerGridBefore).not.toBeNull();
      const offerTextBefore = offerGridBefore?.textContent ?? "";

      // Simulate the RTDB round-trip: the locally-bootstrapped draft state
      // arrives back as the live `state.draftState`.
      act(() => {
        currentState = {
          ...currentState,
          draftState: writtenDraftState,
        };
        rerenderCurrent();
      });

      const offerGridAfter = draftRoot?.querySelector(".order-2");
      expect(offerGridAfter).not.toBeNull();

      // Offer must be unchanged — the same four cards in the same display
      // order. Any swap here would manifest in the browser as the original
      // fade-out / fade-in flicker.
      expect(offerGridAfter?.textContent).toBe(offerTextBefore);
      for (const name of expectedNames) {
        expect(offerGridAfter?.textContent ?? "").toContain(name);
      }

      // Same DOM node identity: React preserves the motion.div across the
      // catch-up because the AnimatePresence `key` (derived from the offer
      // numbers) does not change. A different node here would mean the
      // grid was unmounted and remounted — i.e. the original flicker.
      expect(offerGridAfter).toBe(offerGridBefore);

      // No follow-up bootstrap write once the live state matches.
      expect(mutations.setDraftState).toHaveBeenCalledTimes(1);

      act(() => {
        root.unmount();
      });
    },
  );

  describe("Hearthstone-style deck rows", () => {
    it("renders each row with the card art as a horizontal-cropped background", () => {
      const mutations = makeMutations();
      const cardDatabase = makeCardDatabase();
      setQuestContext(makeState(), mutations, cardDatabase);

      const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

      const row = container.querySelector<HTMLElement>(
        "[data-testid='draft-deck-row-entry-1']",
      );
      expect(row).not.toBeNull();
      const style = row?.getAttribute("style") ?? "";

      // Background-image must be set and point at the card webp.
      expect(style).toContain("background-image");
      expect(style).toContain("/cards/1.webp");
      // Cropped to a horizontal band via background-size: cover.
      expect(style).toContain("background-size: cover");
      // Background-position biased to the upper portion of the art so the
      // focal point shows in the row band.
      expect(style).toContain("background-position: center 25%");

      act(() => {
        root.unmount();
      });
    });

    it("renders the energy cost as a teal/cyan PipBadge on the left of the row", () => {
      const mutations = makeMutations();
      const cardDatabase = makeCardDatabase();
      setQuestContext(makeState(), mutations, cardDatabase);

      const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

      const row = container.querySelector<HTMLElement>(
        "[data-testid='draft-deck-row-entry-1']",
      );
      expect(row).not.toBeNull();
      const energyPip = row?.querySelector<HTMLElement>(
        "[data-pip-variant='energy']",
      );
      expect(energyPip).not.toBeNull();
      expect(energyPip?.textContent).toBe("1");

      // Energy pip must appear before the name in document order, so it sits
      // on the left of the row.
      const spans = Array.from(
        row?.querySelectorAll<HTMLElement>("span") ?? [],
      );
      const nameEl = spans.find(
        (s) => s.textContent?.trim() === "Starter Lantern",
      );
      expect(nameEl).not.toBeNull();
      if (nameEl && energyPip) {
        expect(
          energyPip.compareDocumentPosition(nameEl)
            & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeGreaterThan(0);
      }

      act(() => {
        root.unmount();
      });
    });

    it("renders the card name in white with a black text-shadow for legibility on art", () => {
      const mutations = makeMutations();
      const cardDatabase = makeCardDatabase();
      setQuestContext(makeState(), mutations, cardDatabase);

      const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

      const row = container.querySelector<HTMLElement>(
        "[data-testid='draft-deck-row-entry-1']",
      );
      expect(row).not.toBeNull();
      // The name span is the only descendant span carrying the card name.
      const spans = Array.from(
        row?.querySelectorAll<HTMLElement>("span") ?? [],
      );
      const nameSpan = spans.find(
        (s) => s.textContent?.trim() === "Starter Lantern",
      );
      expect(nameSpan).not.toBeNull();
      const nameStyle = nameSpan?.getAttribute("style") ?? "";
      expect(nameStyle.toLowerCase()).toContain("color: rgb(255, 255, 255)");
      expect(nameStyle.toLowerCase()).toContain("text-shadow");

      act(() => {
        root.unmount();
      });
    });

    it("omits the duplicate-count badge for singletons", () => {
      const mutations = makeMutations();
      const cardDatabase = makeCardDatabase();
      setQuestContext(makeState(), mutations, cardDatabase);

      const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

      // The starter Lantern deck has a single copy — no count badge.
      expect(
        container.querySelector("[data-testid='draft-deck-row-count-1']"),
      ).toBeNull();

      act(() => {
        root.unmount();
      });
    });

    it("collapses duplicate cards into a single row with an Nx count on the right", () => {
      const mutations = makeMutations();
      const cardDatabase = makeCardDatabase();
      // Two copies of cardNumber 101 (Arc Runner) plus one starter.
      setQuestContext(
        makeState({
          deck: [
            {
              entryId: "entry-1",
              cardNumber: 1,
              transfiguration: null,
              isBane: false,
            },
            {
              entryId: "entry-2",
              cardNumber: 101,
              transfiguration: null,
              isBane: false,
            },
            {
              entryId: "entry-3",
              cardNumber: 101,
              transfiguration: null,
              isBane: false,
            },
          ],
        }),
        mutations,
        cardDatabase,
      );

      const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

      // Exactly one row for Arc Runner, with the count badge showing "2x".
      const arcRunnerRows = container.querySelectorAll(
        "[data-card-number='101']",
      );
      expect(arcRunnerRows).toHaveLength(1);
      const countBadge = container.querySelector(
        "[data-testid='draft-deck-row-count-101']",
      );
      expect(countBadge).not.toBeNull();
      expect(countBadge?.textContent).toBe("2x");

      // Total rows = unique cards = 2 (Starter Lantern + Arc Runner).
      const allRows = container.querySelectorAll(
        "[data-testid='draft-deck-rows'] [data-card-number]",
      );
      expect(allRows).toHaveLength(2);

      act(() => {
        root.unmount();
      });
    });

    it("sorts rows by energy cost ascending, then by name", () => {
      const mutations = makeMutations();
      const cardDatabase = makeCardDatabase();
      setQuestContext(
        makeState({
          deck: [
            {
              entryId: "entry-2",
              cardNumber: 104,
              transfiguration: null,
              isBane: false,
            },
            {
              entryId: "entry-1",
              cardNumber: 102,
              transfiguration: null,
              isBane: false,
            },
            {
              entryId: "entry-3",
              cardNumber: 1,
              transfiguration: null,
              isBane: false,
            },
            {
              entryId: "entry-4",
              cardNumber: 101,
              transfiguration: null,
              isBane: false,
            },
          ],
        }),
        mutations,
        cardDatabase,
      );

      const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

      const rows = Array.from(
        container.querySelectorAll<HTMLElement>(
          "[data-testid='draft-deck-rows'] [data-card-number]",
        ),
      );
      const orderedCardNumbers = rows.map(
        (row) => row.getAttribute("data-card-number") ?? "",
      );
      // Costs: 1->1, 101->2, 102->3, 104->5. Ascending by cost.
      expect(orderedCardNumbers).toEqual(["1", "101", "102", "104"]);

      act(() => {
        root.unmount();
      });
    });
  });
});
