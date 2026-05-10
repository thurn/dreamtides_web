// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestMutations } from "../state/quest-context";
import type { CardData } from "../types/cards";
import type { Dreamsign, QuestState } from "../types/quest";
import { HUD } from "./HUD";
import { useQuest } from "../state/quest-context";

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../logging", () => ({
  downloadLog: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("./DreamcallerPortrait", () => ({
  DreamcallerPortrait: () => <div data-testid="dreamcaller-portrait" />,
}));

vi.mock("./DreamcallerPopover", () => ({
  DreamcallerPopover: () => <div data-testid="dreamcaller-popover" />,
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

function makeDreamsign(name: string): Dreamsign {
  return {
    name,
    effectDescription: `${name} effect.`,
    isBane: false,
  };
}

function makeState(dreamsigns: Dreamsign[]): QuestState {
  return {
    essence: 100,
    deck: [],
    dreamcaller: {
      id: "caller-1",
      name: "Mira of Lanterns",
      title: "Keeper of Lantern Glass",
      renderedText: "Dreamcaller rules.",
      imageNumber: "0005",
      startingEssence: 250,
    },
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns,
    completionLevel: 0,
    atlas: {
      nodes: {},
      edges: [],
      nexusId: "",
    },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: null,
    screen: { type: "dreamscape" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: true,
  };
}

function setQuestContext(state: QuestState): void {
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations: makeMutations(),
    cardDatabase: new Map<number, CardData>(),
    questContent: {
      cardDatabase: new Map(),
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

describe("HUD", () => {
  function renderHud() {
    return mount(
      <HUD
        onOpenDeckViewer={vi.fn()}
        onOpenDebugScreen={vi.fn()}
        onToggleCardSourceOverlay={vi.fn()}
        hasDraftData={false}
        hasCardSourceDebug={false}
        isCardSourceOverlayOpen={false}
      />,
    );
  }

  it("labels an empty Dreamsign pool with the plural 'Dreamsigns'", () => {
    setQuestContext(makeState([]));
    const { container, root } = renderHud();

    const label = container.querySelector('[aria-label="Dreamsigns"]');
    expect(label).not.toBeNull();
    expect(container.textContent).toContain("Dreamsigns");
    expect(container.textContent).not.toMatch(/\bSigns\b/);
    expect(container.textContent).not.toMatch(/\b0 Signs\b/);

    act(() => {
      root.unmount();
    });
  });

  it("uses the singular 'Dreamsign' when exactly one is held", () => {
    setQuestContext(makeState([makeDreamsign("Night's Mark")]));
    const { container, root } = renderHud();

    expect(container.textContent).toContain("Dreamsign");
    expect(container.textContent).not.toContain("Dreamsigns");
    expect(container.textContent).not.toMatch(/\bSigns?\b(?!.*Mark)/);

    act(() => {
      root.unmount();
    });
  });

  it("uses the plural 'Dreamsigns' for two or more", () => {
    setQuestContext(
      makeState([makeDreamsign("Night's Mark"), makeDreamsign("Ashen Debt")]),
    );
    const { container, root } = renderHud();

    expect(container.textContent).toContain("Dreamsigns");

    act(() => {
      root.unmount();
    });
  });
});
