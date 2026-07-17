// @vitest-environment jsdom

import { act } from "react";
import { MINIMAL_ATLAS_CONFIG, MINIMAL_DREAMSCAPES } from "../__test-helpers__/atlas-fixtures";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import type { QuestMutations } from "../state/quest-context";
import type { QuestState } from "../types/quest";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
import type { DreamsignTemplate } from "../types/content";
import { RewardSiteScreen } from "./RewardSiteScreen";
import { useQuest } from "../state/quest-context";
import { CumulusRoot } from "../cumulus/CumulusRoot";
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

function makeState(overrides: Partial<QuestState> = {}): QuestState {
  return {
    runId: "quest:test",
    seed: "test-seed",
    essence: 250,
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
    siteRuntime: {},
    draftState: null,
    screen: { type: "site", siteId: "site-1" },
    activeSiteId: null,
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

function makeCardDatabase(): Map<number, CardData> {
  return new Map([
    [
      1,
      {
        name: asCardName("Card Reward"),
        id: asCardId("card-reward"),
        cardNumber: 1,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 1,
        spark: 1,
        isFast: false,
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

      dreamwellCards: [],      dreamsignTemplates: DREAMSIGN_TEMPLATES,      dreamscapes: MINIMAL_DREAMSCAPES,      affiliations: [], guides: [],      atlasConfig: MINIMAL_ATLAS_CONFIG,
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
      root.render(<CumulusRoot>
        <RewardSiteScreen
          site={{ id: "site-1", type: "Reward", isEnhanced: false, isVisited: false }}
        />
      </CumulusRoot>,
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

  it("selects a held Dreamsign as the replacement when accepting at the cap", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        maxDreamsigns: 2,
        dreamsigns: [
          {
            id: "held-dreamsign-1",
            name: "Held One",
            effectDescription: "First held dreamsign.",
            isBane: false,
          },
          {
            id: "held-dreamsign-2",
            name: "Held Two",
            effectDescription: "Second held dreamsign.",
            isBane: false,
          },
        ],
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

    clickButton(container, "Accept");

    expect(container.textContent).toContain("Dreamsign Limit Reached");
    clickButton(container, "Held Two");

    expect(mutations.acceptRewardSite).toHaveBeenCalledWith("site-1", 1);
    expect(mutations.completeSite).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("paints the essence reward as a purple value glued to the crypto glyph", () => {
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

    // The essence reward reads in the shared purple colour with the amount
    // glued to the crypto glyph that marks essence everywhere.
    const value = container.querySelector("[data-essence-reward-value]");
    expect(value).not.toBeNull();
    expect(value?.textContent).toBe("+175");
    expect((value as HTMLElement | null)?.style.color).toBe(
      "var(--color-essence)",
    );
    expect(value?.querySelector("i.bx-crypto")).not.toBeNull();

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
