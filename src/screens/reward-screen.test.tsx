// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import type { QuestMutations } from "../state/quest-context";
import type { QuestState } from "../types/quest";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import { RewardSiteScreen } from "./RewardSiteScreen";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";

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
    button: ({
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
    } & HTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../logging", () => ({
  logEvent: vi.fn(),
}));

vi.mock("../components/CardDisplay", () => ({
  CardDisplay: ({ card }: { card: CardData }) => <div>{card.name}</div>,
}));

vi.mock("../data/card-database", () => ({
  isStarterCard: (card: { isStarter: boolean }) => card.isStarter,
}));

const DREAMSIGN_TEMPLATES: DreamsignTemplate[] = [
  {
    id: "dreamsign-1",
    name: "Dreamsign One",
    packageTides: ["alpha"],
    effectDescription: "First effect.",
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
    ...overrides,
  };
}

function makeCardDatabase(): Map<number, CardData> {
  return new Map([
    [
      1,
      {
        name: "Card Reward",
        id: "card-reward",
        cardNumber: 1,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 1,
        spark: 1,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Reward text.",
        imageNumber: 1,
        artOwned: false,
      },
    ],
  ]);
}

function setQuestContext(
  state: QuestState,
  mutations: QuestMutations,
  cardDatabase: Map<number, CardData> = makeCardDatabase(),
): void {
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations,
    cardDatabase,
    questContent: {
      cardDatabase,
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
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("RewardSiteScreen", () => {
  it("renders a shared Dreamsign reward and completes when declined", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "reward",
            reward: {
              rewardType: "dreamsign",
              dreamsignId: "dreamsign-1",
              dreamsignName: "Dreamsign One",
              dreamsignEffect: "First effect.",
            },
            remainingDreamsignPoolIds: [],
            accepted: false,
          },
        },
      }),
      mutations,
      new Map(),
    );

    const { container, root } = mount(
      <RewardSiteScreen
        site={{ id: "site-1", type: "Reward", isEnhanced: false, isVisited: false }}
      />,
    );

    expect(container.textContent).toContain("Dreamsign One");
    expect(container.textContent).not.toContain("tide_alpha");
    expect(container.querySelector('img[alt="tide_alpha"]')).toBeNull();

    clickButton(container, "Decline");

    expect(mutations.acceptRewardSite).not.toHaveBeenCalled();
    expect(mutations.completeSite).toHaveBeenCalledWith("site-1", "reward_site");
    expect(logEvent).toHaveBeenCalledWith(
      "reward_declined",
      expect.objectContaining({ rewardType: "dreamsign" }),
    );

    act(() => {
      root.unmount();
    });
  });

  it("requests runtime generation while the reward is being revealed", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({ remainingDreamsignPool: ["dreamsign-1"] }),
      mutations,
      new Map(),
    );

    const element = (
      <RewardSiteScreen
        site={{ id: "site-1", type: "Reward", isEnhanced: false, isVisited: false }}
      />
    );
    const { container, root } = mount(element);

    expect(container.textContent).toContain("Revealing reward...");
    expect(mutations.ensureRewardSiteRuntime).toHaveBeenCalledWith("site-1");

    setQuestContext(
      makeState({ remainingDreamsignPool: ["dreamsign-2"] }),
      mutations,
      new Map(),
    );
    act(() => {
      root.render(
        <RewardSiteScreen
          site={{ id: "site-1", type: "Reward", isEnhanced: false, isVisited: false }}
        />,
      );
    });

    expect(mutations.ensureRewardSiteRuntime).toHaveBeenCalledTimes(2);

    act(() => {
      root.unmount();
    });
  });

  it("accepts a shared card reward through the composed mutation", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "reward",
            reward: {
              rewardType: "card",
              cardNumber: 1,
              cardName: "Card Reward",
            },
            remainingDreamsignPoolIds: [],
            accepted: false,
          },
        },
      }),
      mutations,
    );

    const { container, root } = mount(
      <RewardSiteScreen
        site={{ id: "site-1", type: "Reward", isEnhanced: false, isVisited: false }}
      />,
    );

    expect(container.textContent).toContain("Card Reward");

    clickButton(container, "Accept");

    expect(mutations.acceptRewardSite).toHaveBeenCalledWith("site-1");
    expect(mutations.addCard).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
