// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import type { QuestMutations } from "../state/quest-context";
import type { QuestState, SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { TemptingOfferScreen } from "./TemptingOfferScreen";

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
    resetQuest: vi.fn(),
  };
}

function makeState(): QuestState {
  return {
    essence: 250,
    deck: [],
    dreamcaller: null,
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [],
    completionLevel: 0,
    atlas: { nodes: {}, edges: [], nexusId: "" },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {
      "site-1": {
        kind: "temptingOffer",
        optionIds: ["offer-0"],
        completed: false,
      },
    },
    draftState: null,
    screen: { type: "site", siteId: "site-1" },
    activeSiteId: "site-1",
    failureSummary: null,
  };
}

function makeSite(): SiteState {
  return {
    id: "site-1",
    type: "TemptingOffer",
    isEnhanced: false,
    isVisited: false,
  };
}

function setQuestContext(state: QuestState, mutations: QuestMutations): void {
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations,
    cardDatabase: new Map(),
    questContent: {
      cardDatabase: new Map(),
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TemptingOfferScreen", () => {
  it("completes a shared offer option through the composed mutation", () => {
    const mutations = makeMutations();
    setQuestContext(makeState(), mutations);
    const { container, root } = mount(<TemptingOfferScreen site={makeSite()} />);
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Accept Offer",
    );
    if (button === undefined) {
      throw new Error("Missing accept button");
    }

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mutations.completeTemptingOfferOption).toHaveBeenCalledWith(
      "site-1",
      "offer-0",
    );
    expect(mutations.changeEssence).not.toHaveBeenCalled();
    expect(mutations.addCard).not.toHaveBeenCalled();
    expect(mutations.addBaneCard).not.toHaveBeenCalled();
    expect(mutations.markSiteVisited).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
