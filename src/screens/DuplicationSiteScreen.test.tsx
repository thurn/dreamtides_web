// @vitest-environment jsdom

import { act } from "react";
import { MINIMAL_ATLAS_CONFIG, MINIMAL_DREAMSCAPES } from "../__test-helpers__/atlas-fixtures";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import type { QuestMutations } from "../state/quest-context";
import type { CardData } from "../types/cards";
import type { QuestState, SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import {
  DuplicationSiteScreen,
  duplicationCopyCount,
} from "./DuplicationSiteScreen";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      animate: _animate,
      children,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      initial?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../components/CardDisplay", () => ({
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

function makeState(overrides: Partial<QuestState> = {}): QuestState {
  return {
    seed: "test-seed",
    essence: 250,
    essenceCap: 500,
    maxDreamsigns: 12,
    deck: [
      {
        entryId: "deck-1",
        cardNumber: 101,
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
    atlas: { layers: [], nodes: {}, startingNodeId: "", bossNodeId: "", currentNodeId: null, knownDreamsignCarrierIds: [] },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {
      "site-1": {
        kind: "cardChoice",
        choiceKind: "duplication",
        entryIds: ["deck-1"],
        acceptedEntryIds: [],
      },
    },
    draftState: null,
    screen: { type: "site", siteId: "site-1" },
    activeSiteId: "site-1",
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
    ...overrides,
  };
}

function makeSite(): SiteState {
  return {
    id: "site-1",
    type: "Duplication",
    isEnhanced: false,
    isVisited: false,
  };
}

function makeCardDatabase(): Map<number, CardData> {
  return new Map([
    [
      101,
      {
        name: "Test Card",
        id: "test-card",
        cardNumber: 101,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 1,
        spark: 1,
        isFast: false,
        renderedText: "Test text.",
        imageNumber: 101,
        artOwned: false,
      },
    ],
  ]);
}

function setQuestContext(state: QuestState, mutations: QuestMutations): void {
  const cardDatabase = makeCardDatabase();
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations,
    cardDatabase,
    questContent: {
      cardDatabase,
      dreamcallers: [],

      dreamwellCards: [],      dreamsignTemplates: [],      dreamscapes: MINIMAL_DREAMSCAPES,      affiliations: [], guides: [],      atlasConfig: MINIMAL_ATLAS_CONFIG,
    },
  });
}

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function clickFirstDuplicate(container: HTMLElement): void {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim().startsWith("Duplicate x"),
  );
  if (button === undefined) {
    throw new Error("Missing duplicate button");
  }
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DuplicationSiteScreen", () => {
  it("shows the preparing fallback for a wrong runtime kind", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "essence",
            amount: 250,
            accepted: false,
          },
        },
      }),
      mutations,
    );
    const { container, root } = mount(<DuplicationSiteScreen site={makeSite()} />);

    expect(container.textContent).toContain("Preparing choices...");
    expect(mutations.ensureCardChoiceRuntime).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("shows the preparing fallback for a wrong card-choice subtype", () => {
    const mutations = makeMutations();
    const previewCard = makeCardDatabase().get(101);
    if (previewCard === undefined) {
      throw new Error("Missing preview card");
    }
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "cardChoice",
            choiceKind: "transfiguration",
            entryIds: ["deck-1"],
            acceptedEntryIds: [],
            transfigurationOffers: [
              {
                entryId: "deck-1",
                type: "Empowered",
                effectDescription: "Empowered test effect",
                effectDetails: { test: true },
                previewCard,
              },
            ],
          },
        },
      }),
      mutations,
    );
    const { container, root } = mount(<DuplicationSiteScreen site={makeSite()} />);

    expect(container.textContent).toContain("Preparing choices...");
    expect(mutations.acceptDuplicationChoice).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("accepts a shared card choice through the composed mutation", () => {
    const mutations = makeMutations();
    setQuestContext(makeState(), mutations);
    const { container, root } = mount(<DuplicationSiteScreen site={makeSite()} />);

    clickFirstDuplicate(container);

    expect(mutations.acceptDuplicationChoice).toHaveBeenCalledWith(
      "site-1",
      "deck-1",
      duplicationCopyCount("site-1", "deck-1"),
    );
    expect(mutations.addCard).not.toHaveBeenCalled();
    expect(mutations.markSiteVisited).not.toHaveBeenCalled();
    expect(mutations.setScreen).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
