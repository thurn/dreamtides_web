// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import type { DreamsignTemplate } from "../types/content";
import type { QuestMutations } from "../state/quest-context";
import type { QuestState, SiteState } from "../types/quest";
import { DreamsignDraftScreen } from "./DreamsignDraftScreen";
import { DreamsignOfferingScreen } from "./DreamsignOfferingScreen";
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

vi.mock("../data/card-database", () => ({
  isStarterCard: (card: { isStarter: boolean }) => card.isStarter,
}));

const DREAMSIGN_TEMPLATES: DreamsignTemplate[] = [
  {
    id: "embers-whisper",
    name: "Ember's Whisper",
    packageTides: ["alpha"],
    effectDescription: "Fire.",
  },
  {
    id: "glacial-insight",
    name: "Glacial Insight",
    packageTides: ["beta"],
    effectDescription: "Ice.",
  },
  {
    id: "verdant-accord",
    name: "Verdant Accord",
    packageTides: ["gamma"],
    effectDescription: "Growth.",
  },
  {
    id: "stormthread-sigil",
    name: "Stormthread Sigil",
    packageTides: ["delta"],
    effectDescription: "Storm.",
  },
];

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
    dismissStartingDeckPopup: vi.fn(),
    resetQuest: vi.fn(),
  };
}

function makeState(overrides: Partial<QuestState> = {}): QuestState {
  return {
    essence: 250,
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
      nexusId: "",
    },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: null,
    screen: { type: "site", siteId: "site-1" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
    ...overrides,
  };
}

function makeSite(overrides: Partial<SiteState> = {}): SiteState {
  return {
    id: "site-1",
    type: "DreamsignOffering",
    isEnhanced: false,
    isVisited: false,
    ...overrides,
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
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
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
  vi.spyOn(Math, "random").mockReturnValue(0.999);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DreamsignOfferingScreen", () => {
  it("renders shared offered dreamsigns and completes when rejected", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [
              {
                id: "embers-whisper",
                name: "Ember's Whisper",
                effectDescription: "Fire.",
                isBane: false,
              },
            ],
            remainingDreamsignPool: ["glacial-insight"],
            accepted: false,
          },
        },
      }),
      mutations,
    );

    const { container, root } = mount(<DreamsignOfferingScreen site={makeSite()} />);

    expect(container.textContent).toContain("Ember's Whisper");

    clickButton(container, "Reject");

    expect(mutations.acceptDreamsignOffer).not.toHaveBeenCalled();
    expect(mutations.completeSite).toHaveBeenCalledWith(
      "site-1",
      "dreamsign_offering",
    );

    act(() => {
      root.unmount();
    });
  });

  it("does not restore a shown dreamsign to the pool during full-capacity purge acceptance", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [
              {
                id: "embers-whisper",
                name: "Ember's Whisper",
                effectDescription: "Fire.",
                isBane: false,
              },
            ],
            remainingDreamsignPool: ["glacial-insight"],
            accepted: false,
          },
        },
        dreamsigns: Array.from({ length: 12 }, (_, index) => ({
          name: `Held Sign ${String(index)}`,
          tide: index % 2 === 0 ? "tide_alpha" : "tide_zeta",
          effectDescription: "Existing.",
          isBane: false,
        })),
      }),
      mutations,
    );

    const { container, root } = mount(<DreamsignOfferingScreen site={makeSite()} />);

    clickButton(container, "Accept");
    clickButton(container, "Held Sign 0");

    expect(mutations.removeDreamsign).not.toHaveBeenCalled();
    expect(mutations.acceptDreamsignOffer).toHaveBeenCalledWith(
      "site-1",
      expect.objectContaining({ name: "Ember's Whisper" }),
      0,
    );

    act(() => {
      root.unmount();
    });
  });

  it("requests shared offer runtime while revealing options", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({ remainingDreamsignPool: ["embers-whisper"] }),
      mutations,
    );

    const element = <DreamsignOfferingScreen site={makeSite()} />;
    const { container, root } = mount(element);

    expect(container.textContent).toContain("Revealing Dreamsigns...");
    expect(mutations.ensureDreamsignOfferRuntime).toHaveBeenCalledWith(
      "site-1",
      1,
    );

    setQuestContext(
      makeState({ remainingDreamsignPool: ["glacial-insight"] }),
      mutations,
    );
    act(() => {
      root.render(<DreamsignOfferingScreen site={makeSite()} />);
    });

    expect(mutations.ensureDreamsignOfferRuntime).toHaveBeenCalledTimes(2);

    act(() => {
      root.unmount();
    });
  });
});

describe("DreamsignDraftScreen", () => {
  it("retries shared draft runtime reveal when the Dreamsign pool changes", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({ remainingDreamsignPool: ["embers-whisper"] }),
      mutations,
    );

    const element = (
      <DreamsignDraftScreen
        site={makeSite({ type: "DreamsignDraft" })}
      />
    );
    const { container, root } = mount(element);

    expect(container.textContent).toContain("Revealing Dreamsigns...");
    expect(mutations.ensureDreamsignOfferRuntime).toHaveBeenCalledWith(
      "site-1",
      3,
    );

    setQuestContext(
      makeState({ remainingDreamsignPool: ["glacial-insight"] }),
      mutations,
    );
    act(() => {
      root.render(
        <DreamsignDraftScreen
          site={makeSite({ type: "DreamsignDraft" })}
        />,
      );
    });

    expect(mutations.ensureDreamsignOfferRuntime).toHaveBeenCalledTimes(2);

    act(() => {
      root.unmount();
    });
  });

  it("renders shared draft options and completes when skipped", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [
              {
                id: "embers-whisper",
                name: "Ember's Whisper",
                effectDescription: "Fire.",
                isBane: false,
              },
              {
                id: "glacial-insight",
                name: "Glacial Insight",
                effectDescription: "Ice.",
                isBane: false,
              },
              {
                id: "verdant-accord",
                name: "Verdant Accord",
                effectDescription: "Growth.",
                isBane: false,
              },
            ],
            remainingDreamsignPool: ["stormthread-sigil"],
            accepted: false,
          },
        },
      }),
      mutations,
    );

    const { container, root } = mount(
      <DreamsignDraftScreen
        site={makeSite({ type: "DreamsignDraft" })}
      />,
    );

    expect(container.textContent).toContain("Ember's Whisper");
    expect(container.textContent).toContain("Glacial Insight");
    expect(container.textContent).toContain("Verdant Accord");

    clickButton(container, "Skip (discards both Dreamsigns)");

    expect(mutations.acceptDreamsignOffer).not.toHaveBeenCalled();
    expect(mutations.completeSite).toHaveBeenCalledWith(
      "site-1",
      "dreamsign_draft",
    );

    act(() => {
      root.unmount();
    });
  });

  it("degrades to an exhausted-pool fallback without rerolling from the global catalog", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [],
            remainingDreamsignPool: [],
            accepted: false,
          },
        },
      }),
      mutations,
    );

    const { container, root } = mount(
      <DreamsignDraftScreen
        site={makeSite({ type: "DreamsignDraft" })}
      />,
    );

    expect(container.textContent).toContain("The Dreamsign pool is exhausted.");
    expect(container.textContent).not.toContain("Ember's Whisper");
    expect(container.querySelectorAll("button")).toHaveLength(1);

    clickButton(container, "Skip (discards both Dreamsigns)");

    expect(mutations.acceptDreamsignOffer).not.toHaveBeenCalled();
    expect(mutations.completeSite).toHaveBeenCalledWith(
      "site-1",
      "dreamsign_draft",
    );

    act(() => {
      root.unmount();
    });
  });
});
