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
    changeOmens: vi.fn(),
    setEssence: vi.fn(),
    changeMaxEssence: vi.fn(),
    addCardById: vi.fn(),
    addCardByIdWithTransfiguration: vi.fn(),
    addBaneCardById: vi.fn(),
    removeDeckEntry: vi.fn(),
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
    grantShopOmenDiscounts: vi.fn(),
    boostSiteAppearance: vi.fn(),
  };
}

function makeState(overrides: Partial<QuestState> = {}): QuestState {
  return {
    seed: "test-seed",
    essence: 250,
    essenceCap: 500,
    omens: 0,
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
    siteRuntime: {},
    draftState: null,
    screen: { type: "site", siteId: "site-1" },
    activeSiteId: null,
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
      dreamcallers: [],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
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
              dreamsign: {
                id: "dreamsign-1",
                name: "Dreamsign One",
                effectDescription: "First effect.",
                isBane: false,
              },
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

  it("renders the dreamsign's artwork through the shared DreamsignArtTile", () => {
    // The reward site sits in the same family of dreamsign surfaces as the
    // shop tile, deck viewer, and dreamsign offering -- all of which draw the
    // dreamsign's `imageName` art through `DreamsignArtTile`. This guards
    // that the reward site renders the same art treatment (including the
    // bane red border + grayscale) instead of a placeholder glyph.
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "reward",
            reward: {
              rewardType: "dreamsign",
              dreamsign: {
                id: "dreamsign-bane",
                name: "Black Horn",
                effectDescription: "Bane effect.",
                imageName: "black_horn.png",
                imageAlt: "A curved black horn",
                isBane: true,
              },
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

    const artImg = container.querySelector('img[src^="/dreamsigns/"]');
    expect(artImg).not.toBeNull();
    expect(artImg?.getAttribute("src")).toBe("/dreamsigns/black_horn.png");

    const tile = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    expect(tile).not.toBeNull();
    expect(tile?.dataset.isBane).toBe("true");
    // Bane tiles carry the desaturation filter so the warning reads first.
    expect(tile?.style.filter).toContain("grayscale");

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

  it("accepts a Dreamsign reward through the composed mutation", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "reward",
            reward: {
              rewardType: "dreamsign",
              dreamsign: {
                id: "dreamsign-1",
                name: "Dreamsign Reward",
                effectDescription: "A boon.",
                isBane: false,
              },
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

    expect(container.textContent).toContain("Dreamsign Reward");

    clickButton(container, "Accept");

    expect(mutations.acceptRewardSite).toHaveBeenCalledWith("site-1");
    expect(mutations.addCard).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("paints the essence reward number in the shared essence colour with no glyph", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "reward",
            reward: {
              rewardType: "essence",
              essenceAmount: 175,
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

    // The essence reward capsule advertises essence purely by colour
    // -- no diamond / hexagon glyph -- and the number itself is the
    // single source of currency identity.
    const value = container.querySelector("[data-essence-reward-value]");
    expect(value).not.toBeNull();
    expect(value?.textContent).toBe("+175");
    expect((value as HTMLElement | null)?.style.color).toBe(
      "var(--color-essence)",
    );

    const capsule = container.querySelector("[data-essence-reward-display]");
    expect(capsule).not.toBeNull();
    expect(capsule?.textContent).not.toContain("◆");
    expect(capsule?.textContent).not.toContain("⬢");

    act(() => {
      root.unmount();
    });
  });

  it("omits the redundant 'Dreamsign Reward' label inside the dreamsign reward card body", () => {
    // The screen-level header carries the "Dreamsign Reward" title and
    // disambiguates from essence rewards. The dreamsign card body itself
    // renders only the art, optional Bane badge, name, and rules text -- the
    // surrounding chrome establishes the reward type.
    // See backlog task 010-remove-dreamsign-label.
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "reward",
            reward: {
              rewardType: "dreamsign",
              dreamsign: {
                id: "dreamsign-1",
                name: "Ember's Whisper",
                effectDescription: "A boon.",
                isBane: false,
              },
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

    const card = container.querySelector("[data-dreamsign-reward-display]");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Ember's Whisper");
    expect(card?.textContent).not.toMatch(/\bDreamsign\b/);

    act(() => {
      root.unmount();
    });
  });
});
