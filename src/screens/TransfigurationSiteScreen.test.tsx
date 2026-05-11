// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import type { QuestMutations } from "../state/quest-context";
import type { CardData } from "../types/cards";
import type { QuestState, SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { TransfigurationSiteScreen } from "./TransfigurationSiteScreen";

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

vi.mock("../transfiguration/transfiguration-logic", () => ({
  assignTransfiguration: (card: CardData) => ({
    type: "Viridian",
    description: "Viridian test effect",
    previewCard: card,
  }),
  TRANSFIGURATION_COLORS: {
    Viridian: "#10b981",
    Golden: "#f59e0b",
    Scarlet: "#ef4444",
    Azure: "#3b82f6",
    Bronze: "#a16207",
  },
  transfigurationEffectDetails: () => ({ test: true }),
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

function makeState(overrides: Partial<QuestState> = {}): QuestState {
  return {
    essence: 250,
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
    atlas: { nodes: {}, edges: [], startingNodeId: "" },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {
      "site-1": {
        kind: "cardChoice",
        choiceKind: "transfiguration",
        entryIds: ["deck-1"],
        acceptedEntryIds: [],
        transfigurationOffers: [
          {
            entryId: "deck-1",
            type: "Viridian",
            effectDescription: "Viridian test effect",
            effectDetails: { test: true },
            previewCard: {
              name: "Test Card",
              id: "test-card",
              cardNumber: 101,
              cardType: "Character",
              subtype: "",
              isStarter: false,
              energyCost: 1,
              spark: 1,
              isFast: false,
              tides: ["alpha"],
              renderedText: "Test text.",
              imageNumber: 101,
              artOwned: false,
            },
          },
        ],
      },
    },
    draftState: null,
    screen: { type: "site", siteId: "site-1" },
    activeSiteId: "site-1",
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
    ...overrides,
  };
}

function makeSite(overrides: Partial<SiteState> = {}): SiteState {
  return {
    id: "site-1",
    type: "Transfiguration",
    isEnhanced: false,
    isVisited: false,
    ...overrides,
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
        tides: ["alpha"],
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
      cardsByPackageTide: new Map(),
      dreamcallers: [],
      dreamsignTemplates: [],
      resolvedPackagesByDreamcallerId: new Map(),
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

function clickButton(container: HTMLElement, label: string): void {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (button === undefined) {
    throw new Error(`Missing button ${label}`);
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

describe("TransfigurationSiteScreen", () => {
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
    const { container, root } = mount(
      <TransfigurationSiteScreen site={makeSite()} />,
    );

    expect(container.textContent).toContain("Preparing choices...");
    expect(mutations.ensureCardChoiceRuntime).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("shows the preparing fallback for a wrong card-choice subtype", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "cardChoice",
            choiceKind: "duplication",
            entryIds: ["deck-1"],
            acceptedEntryIds: [],
          },
        },
      }),
      mutations,
    );
    const { container, root } = mount(
      <TransfigurationSiteScreen site={makeSite()} />,
    );

    expect(container.textContent).toContain("Preparing choices...");
    expect(mutations.acceptTransfigurationChoice).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("shows the preparing fallback for serialized transfiguration runtime without offers", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "cardChoice",
            choiceKind: "transfiguration",
            entryIds: ["deck-1"],
            acceptedEntryIds: [],
          },
        } as unknown as QuestState["siteRuntime"],
      }),
      mutations,
    );
    const { container, root } = mount(
      <TransfigurationSiteScreen site={makeSite()} />,
    );

    expect(container.textContent).toContain("Preparing choices...");
    expect(mutations.acceptTransfigurationChoice).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("accepts a shared card choice through the composed mutation", () => {
    const mutations = makeMutations();
    setQuestContext(makeState(), mutations);
    const { container, root } = mount(
      <TransfigurationSiteScreen site={makeSite()} />,
    );

    clickButton(container, "Accept Viridian");

    expect(mutations.acceptTransfigurationChoice).toHaveBeenCalledWith(
      "site-1",
      "deck-1",
      "Viridian",
      "Viridian test effect",
      { test: true },
    );
    expect(mutations.transfigureCard).not.toHaveBeenCalled();
    expect(mutations.markSiteVisited).not.toHaveBeenCalled();
    expect(mutations.setScreen).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
