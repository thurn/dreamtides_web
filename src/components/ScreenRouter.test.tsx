// @vitest-environment jsdom

import { StrictMode, act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenRouter } from "./ScreenRouter";
import {
  QuestContextProvider,
  createDefaultState,
  type QuestMutations,
} from "../state/quest-context";
import { parseRuntimeConfig } from "../runtime/runtime-config";
import type { QuestContent } from "../data/quest-content";
import type { CardData } from "../types/cards";
import type { CardSourceDebugState, QuestState, SiteState } from "../types/quest";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestQuestState,
} from "../journey_v2/testing/fixtures";
import { getLogEntries, resetLog } from "../logging";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: { children: ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("../journeys", () => ({
  JourneyScreen: () => <div data-testid="classic-journey-screen" />,
  buildJourneyContext: vi.fn(() => ({})),
  buildJourneyContentBundle: vi.fn(() => ({})),
  createJourneyMutations: vi.fn(() => ({})),
}));

vi.mock("../screens/RewardSiteScreen", () => ({
  RewardSiteScreen: () => <div data-testid="reward-site-screen" />,
}));

const roots: Root[] = [];

const UUIDS = {
  deckHighEvent: "71000000-0000-4000-8000-000000000001",
  deckHighCharacter: "71000000-0000-4000-8000-000000000002",
  deckFillerA: "71000000-0000-4000-8000-000000000003",
  deckFillerB: "71000000-0000-4000-8000-000000000004",
  deckFillerC: "71000000-0000-4000-8000-000000000005",
  deckFillerD: "71000000-0000-4000-8000-000000000006",
  drawA: "71000000-0000-4000-8000-000000000101",
  drawB: "71000000-0000-4000-8000-000000000102",
  drawC: "71000000-0000-4000-8000-000000000103",
  recursionA: "71000000-0000-4000-8000-000000000201",
  recursionB: "71000000-0000-4000-8000-000000000202",
  interactionA: "71000000-0000-4000-8000-000000000301",
  interactionB: "71000000-0000-4000-8000-000000000302",
  earlyA: "71000000-0000-4000-8000-000000000401",
  earlyB: "71000000-0000-4000-8000-000000000402",
} as const;

function card(
  id: string,
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return makeMerchantTestCard({
    id,
    cardNumber,
    name: `Router Fixture ${cardNumber}`,
    cardType: "Character",
    energyCost: 2,
    spark: 1,
    renderedText: "",
    ...overrides,
  });
}

function fixtureCards(): CardData[] {
  return [
    card(UUIDS.deckHighEvent, 1, {
      name: "High Event",
      cardType: "Event",
      energyCost: 5,
      spark: null,
      renderedText: "Fast.",
    }),
    card(UUIDS.deckHighCharacter, 2, {
      name: "High Character",
      energyCost: 5,
      spark: 4,
    }),
    card(UUIDS.deckFillerA, 3, { energyCost: 4 }),
    card(UUIDS.deckFillerB, 4, { energyCost: 4 }),
    card(UUIDS.deckFillerC, 5, { energyCost: 3 }),
    card(UUIDS.deckFillerD, 6, { energyCost: 3 }),
    card(UUIDS.drawA, 101, { renderedText: "Draw a card." }),
    card(UUIDS.drawB, 102, { renderedText: "Draw two cards." }),
    card(UUIDS.drawC, 103, { renderedText: "When this enters, draw a card." }),
    card(UUIDS.recursionA, 201, { renderedText: "Reclaim 1." }),
    card(UUIDS.recursionB, 202, {
      renderedText: "Return a card from your void to your hand.",
    }),
    card(UUIDS.interactionA, 301, { renderedText: "Banish an enemy." }),
    card(UUIDS.interactionB, 302, { renderedText: "Prevent the next damage." }),
    card(UUIDS.earlyA, 401, { energyCost: 1 }),
    card(UUIDS.earlyB, 402, { energyCost: 1 }),
  ];
}

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
    acceptDreamMerchantOffer: vi.fn(),
    declineDreamMerchant: vi.fn(),
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
    addCardById: vi.fn(() => null),
    addCardByIdWithTransfiguration: vi.fn(() => null),
    addBaneCardById: vi.fn(),
    removeDeckEntry: vi.fn(),
    duplicateDeckEntry: vi.fn(),
    changeDeckEntryKeywords: vi.fn(),
    changeDeckEntryType: vi.fn(),
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

function makeSite(type: SiteState["type"]): SiteState {
  return {
    id: "router-site",
    type,
    isEnhanced: false,
    isVisited: false,
  };
}

function makeStateFor(site: SiteState): QuestState {
  const merchantState = makeMerchantTestQuestState({
    seed: "router-merchant-seed",
    essence: 180,
    essenceCap: 360,
    deck: [1, 2, 3, 4, 5, 6].map((cardNumber, index) =>
      makeMerchantTestDeckEntry({
        entryId: `router-entry-${index + 1}`,
        cardNumber,
      }),
    ),
  });
  return {
    ...merchantState,
    currentDreamscape: "dreamscape-router",
    screen: { type: "site", siteId: site.id },
    activeSiteId: site.id,
    atlas: {
      ...createDefaultState().atlas,
      startingNodeId: "dreamscape-router",
      nodes: {
        "dreamscape-router": {
          id: "dreamscape-router",
          biomeName: "Router Dreamscape",
          biomeColor: "#7c3aed",
          position: { x: 0, y: 0 },
          status: "available",
          enhancedSiteType: null,
          sites: [site],
        },
      },
    },
  };
}

function renderWithQuest({
  state,
  questContent,
  mutations = makeMutations(),
  children,
  strict = false,
}: {
  state: QuestState;
  questContent: QuestContent;
  mutations?: QuestMutations;
  children: ReactElement;
  strict?: boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    const tree = (
      <QuestContextProvider
        value={{
          state,
          mutations,
          cardDatabase: questContent.cardDatabase,
          questContent,
        }}
      >
        {children}
      </QuestContextProvider>
    );
    root.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  });

  return container;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
  vi.clearAllMocks();
  resetLog();
});

describe("ScreenRouter DreamJourney routing", () => {
  it("renders the classic journey path for a DreamJourney site in classic config", () => {
    const site = makeSite("DreamJourney");
    const state = makeStateFor(site);
    const container = renderWithQuest({
      state,
      questContent: makeMerchantTestContent({ cards: fixtureCards() }),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />,
    });

    expect(container.querySelector('[data-testid="classic-journey-screen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dream-merchant-v2-screen"]')).toBeNull();
  });

  it("renders the Dream Merchant v2 screen for a DreamJourney site in v2 config", () => {
    const site = makeSite("DreamJourney");
    const state = makeStateFor(site);
    const container = renderWithQuest({
      state,
      questContent: makeMerchantTestContent({ cards: fixtureCards() }),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />,
    });

    expect(container.querySelector('[data-testid="dream-merchant-v2-screen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="classic-journey-screen"]')).toBeNull();
  });

  it("logs shown offers once per encounter signature under strict mode", () => {
    const site = makeSite("DreamJourney");
    const state = makeStateFor(site);
    renderWithQuest({
      state,
      questContent: makeMerchantTestContent({ cards: fixtureCards() }),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />,
      strict: true,
    });

    const shownLogs = getLogEntries().filter(
      (entry) => entry.event === "merchant_offer_shown",
    );
    expect(shownLogs).toHaveLength(2);
    expect(shownLogs.map((entry) => entry.offerId)).toEqual(["A", "B"]);
  });

  it("sets card source debug for visible merchant grant cards", () => {
    const site = makeSite("DreamJourney");
    const state = makeStateFor(site);
    const mutations = makeMutations();
    renderWithQuest({
      state,
      mutations,
      questContent: makeMerchantTestContent({ cards: fixtureCards() }),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />,
    });

    const [debugState, source] =
      vi.mocked(mutations.setCardSourceDebug).mock.calls[0] ?? [];
    const cardSourceDebug = debugState as CardSourceDebugState | null | undefined;
    expect(source).toBe("merchant_grant_cards_shown");
    expect(cardSourceDebug?.screenLabel).toBe("Dream Merchant Offers");
    expect(cardSourceDebug?.surface).toBe("Reward");
    expect(cardSourceDebug?.entries.some((entry) =>
      typeof entry.cardNumber === "number",
    )).toBe(true);
  });

  it("does not route a non-DreamJourney site to the v2 screen in v2 config", () => {
    const site = makeSite("Reward");
    const state = makeStateFor(site);
    const container = renderWithQuest({
      state,
      questContent: makeMerchantTestContent({ cards: fixtureCards() }),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />,
    });

    expect(container.querySelector('[data-testid="reward-site-screen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dream-merchant-v2-screen"]')).toBeNull();
  });

  it("renders a contained v2 fallback when merchant generation is unavailable", () => {
    const site = makeSite("DreamJourney");
    const state = makeStateFor(site);
    const mutations = makeMutations();
    const container = renderWithQuest({
      state,
      mutations,
      questContent: makeMerchantTestContent({ cards: [] }),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />,
    });

    expect(container.querySelector('[data-testid="dream-merchant-v2-fallback"]')).not.toBeNull();
    const walkAway = container.querySelector(
      '[data-testid="merchant-fallback-walk-away"]',
    );
    if (!(walkAway instanceof HTMLButtonElement)) {
      throw new Error("expected fallback walk-away button");
    }

    act(() => {
      walkAway.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mutations.completeDreamJourneySite).toHaveBeenCalledWith(site.id);
  });
});
