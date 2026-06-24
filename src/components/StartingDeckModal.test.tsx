// @vitest-environment jsdom

import { act } from "react";
import { MINIMAL_ATLAS_CONFIG, MINIMAL_DREAMSCAPES } from "../__test-helpers__/atlas-fixtures";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestMutations } from "../state/quest-context";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
import type { QuestState } from "../types/quest";
import { StartingDeckModal } from "./StartingDeckModal";
import { useQuest } from "../state/quest-context";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
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

vi.mock("./CardDisplay", () => ({
  CardDisplay: ({ card }: { card: CardData }) => <div>{card.name}</div>,
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
    bootstrapStartInBattle: vi.fn(),
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

function makeState(): QuestState {
  return {
    seed: "test-seed",
    essence: 250,
    essenceCap: 500,
    maxDreamsigns: 12,
    deck: [
      {
        entryId: "entry-1",
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
      },
      {
        entryId: "entry-2",
        cardNumber: 2,
        transfiguration: null,
        isBane: false,
      },
    ],
    dreamcaller: {
      id: "caller-1",
      name: "Mira",
      title: "Of the Lanterns",
      renderedText: "Rules.",
      imageNumber: "0005",
      startingEssence: 250,
    },
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [],
    completionLevel: 1,
    atlas: { layers: [], nodes: {}, startingNodeId: "", bossNodeId: "", currentNodeId: null, knownDreamsignCarrierIds: [] },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: null,
    screen: { type: "dreamscape" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
  };
}

function makeCardDatabase(): Map<number, CardData> {
  return new Map<number, CardData>([
    [
      1,
      {
        name: asCardName("Archive Sentry"),
        id: asCardId("archive-sentry"),
        cardNumber: 1,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 3,
        spark: 1,
        isFast: false,
        renderedText: "Hold the line.",
        imageNumber: 1,
        artOwned: true,
      },
    ],
    [
      2,
      {
        name: asCardName("Glimpse of What Was"),
        id: asCardId("glimpse"),
        cardNumber: 2,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        energyCost: 1,
        spark: null,
        isFast: false,
        renderedText: "Draw a card.",
        imageNumber: 2,
        artOwned: true,
      },
    ],
  ]);
}

function setQuestContext(state: QuestState = makeState()): void {
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations: makeMutations(),
    cardDatabase: makeCardDatabase(),
    questContent: {
      cardDatabase: new Map(),
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
  setQuestContext();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("StartingDeckModal", () => {
  it("renders nothing when closed", () => {
    const { container, root } = mount(
      <StartingDeckModal
        isOpen={false}
        onClose={vi.fn()}
        cardDatabase={makeCardDatabase()}
      />,
    );

    expect(container.querySelector("[data-testid='starting-deck-modal']")).toBeNull();
    expect(
      container.querySelector("[data-testid='starting-deck-modal-close']"),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders the starting deck cards in acquisition order when open", () => {
    const { container, root } = mount(
      <StartingDeckModal
        isOpen
        onClose={vi.fn()}
        cardDatabase={makeCardDatabase()}
      />,
    );

    const modal = container.querySelector("[data-testid='starting-deck-modal']");
    expect(modal).not.toBeNull();
    // Header text is present and is the only piece of explanatory copy.
    expect(modal?.textContent).toContain("Starting Deck");
    expect(modal?.textContent).toContain(
      "These are the cards you begin the quest with.",
    );
    const title = modal?.querySelector("h2");
    expect(title?.textContent).toBe("Starting Deck");
    expect(title?.className).toContain("text-xl");
    expect(title?.className).not.toContain("uppercase");
    expect(title?.className).not.toContain("tracking-");
    // Both starting cards render.
    expect(
      container.querySelector("[data-testid='starting-deck-modal-card-entry-1']"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-testid='starting-deck-modal-card-entry-2']"),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("keeps the click-outside backdrop visually transparent", () => {
    const { container, root } = mount(
      <StartingDeckModal
        isOpen
        onClose={vi.fn()}
        cardDatabase={makeCardDatabase()}
      />,
    );

    const backdrop = container.querySelector<HTMLElement>(
      "[data-testid='starting-deck-modal-backdrop']",
    );
    expect(backdrop).not.toBeNull();
    expect(backdrop?.style.backgroundColor).toBe("transparent");

    act(() => {
      root.unmount();
    });
  });

  it("exposes only a close button (no Continue, sort, filter, or summary chrome)", () => {
    const { container, root } = mount(
      <StartingDeckModal
        isOpen
        onClose={vi.fn()}
        cardDatabase={makeCardDatabase()}
      />,
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    // The only button in the modal is the close affordance.
    expect(buttons).toHaveLength(1);
    const closeButton = buttons[0];
    expect(closeButton?.getAttribute("aria-label")).toBe("Close starting deck");

    const text = container.textContent ?? "";
    // No Continue / sort / filter / summary controls.
    expect(text).not.toContain("Continue");
    expect(text).not.toContain("Sort");
    expect(text).not.toContain("Acquisition Order");
    expect(text).not.toContain("Characters");
    expect(text).not.toContain("Avg Cost");
    expect(text).not.toContain("Filter");

    act(() => {
      root.unmount();
    });
  });

  it("calls onClose when the red X button is clicked", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <StartingDeckModal
        isOpen
        onClose={onClose}
        cardDatabase={makeCardDatabase()}
      />,
    );

    const closeButton = container.querySelector<HTMLButtonElement>(
      "[data-testid='starting-deck-modal-close']",
    );
    expect(closeButton).not.toBeNull();
    act(() => {
      closeButton?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    const { root } = mount(
      <StartingDeckModal
        isOpen
        onClose={onClose}
        cardDatabase={makeCardDatabase()}
      />,
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("calls onClose when the backdrop is clicked, but not when the modal content itself is clicked", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <StartingDeckModal
        isOpen
        onClose={onClose}
        cardDatabase={makeCardDatabase()}
      />,
    );

    const modal = container.querySelector<HTMLElement>(
      "[data-testid='starting-deck-modal']",
    );
    act(() => {
      modal?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = container.querySelector<HTMLElement>(
      "[data-testid='starting-deck-modal-backdrop']",
    );
    act(() => {
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("scrolls internally instead of taking the full screen", () => {
    const { container, root } = mount(
      <StartingDeckModal
        isOpen
        onClose={vi.fn()}
        cardDatabase={makeCardDatabase()}
      />,
    );

    const scroll = container.querySelector<HTMLElement>(
      "[data-testid='starting-deck-modal-scroll']",
    );
    expect(scroll).not.toBeNull();
    expect(scroll?.className).toContain("overflow-y-auto");

    act(() => {
      root.unmount();
    });
  });
});
