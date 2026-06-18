// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { MINIMAL_ATLAS_CONFIG, MINIMAL_DREAMSCAPES } from "../__test-helpers__/atlas-fixtures";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode, HTMLAttributes } from "react";
import { DreamscapeScreen } from "./DreamscapeScreen";
import { useQuest } from "../state/quest-context";
import type { QuestState } from "../types/quest";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      layout: _layout,
      transition: _transition,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      exit?: unknown;
      initial?: unknown;
      layout?: unknown;
      transition?: unknown;
      whileHover?: unknown;
      whileTap?: unknown;
    } & HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    button: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      layout: _layout,
      transition: _transition,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      exit?: unknown;
      initial?: unknown;
      layout?: unknown;
      transition?: unknown;
      whileHover?: unknown;
      whileTap?: unknown;
    } & HTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  },
}));

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../logging", () => ({
  logEvent: vi.fn(),
}));

function makeState(overrides?: Partial<QuestState>): QuestState {
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
      nodes: {
        "dreamscape-1": {
          id: "dreamscape-1",
          layer: 0,
          indexInLayer: 0,
          dreamscapeId: "test_dreamscape",
          biomeName: "Crystal Spire",
          biomeColor: "#38bdf8",
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
          position: { x: 0, y: 0 },
          sites: [
            {
              id: "site-1",
              type: "Draft",
              isEnhanced: false,
              isVisited: false,
            },
            {
              id: "site-2",
              type: "Reward",
              isEnhanced: false,
              isVisited: false,
            },
            {
              id: "site-3",
              type: "Battle",
              isEnhanced: false,
              isVisited: false,
            },
          ],
        },
      },
      startingNodeId: "dreamscape-1",
      bossNodeId: "dreamscape-1",
      currentNodeId: "dreamscape-1",
      layers: [],
      knownDreamsignCarrierIds: [],
    },
    currentDreamscape: "dreamscape-1",
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
      upcomingOmenDiscounts: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
    ...overrides,
  };
}

describe("DreamscapeScreen", () => {
  it("shows the exact remaining site count while battle is locked", () => {
    vi.mocked(useQuest).mockReturnValue({
      state: makeState(),
      mutations: {
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
        grantShopOmenDiscounts: vi.fn(),
        boostSiteAppearance: vi.fn(),
      },
      cardDatabase: new Map(),
      questContent: {
        cardDatabase: new Map(),
        dreamcallers: [],

        dreamwellCards: [],        dreamsignTemplates: [],        dreamscapes: MINIMAL_DREAMSCAPES,        atlasConfig: MINIMAL_ATLAS_CONFIG,
      },
    });

    const html = renderToStaticMarkup(<DreamscapeScreen />);

    expect(html).toContain("Complete 2 remaining sites to unlock the battle");
    expect(html).toContain("Complete 2 remaining sites to unlock");
  });

  it("shows battle unlocked once all non-battle sites are visited", () => {
    vi.mocked(useQuest).mockReturnValue({
      state: makeState({
        atlas: {
          nodes: {
            "dreamscape-1": {
              id: "dreamscape-1",
              layer: 0,
              indexInLayer: 0,
              dreamscapeId: "test_dreamscape",
              biomeName: "Crystal Spire",
              biomeColor: "#38bdf8",
              state: "available",
              enhancedSiteType: null,
              forwardIds: [],
              backwardIds: [],
              knownDreamsignId: null,
              position: { x: 0, y: 0 },
              sites: [
                {
                  id: "site-1",
                  type: "Draft",
                  isEnhanced: false,
                  isVisited: true,
                },
                {
                  id: "site-2",
                  type: "Reward",
                  isEnhanced: false,
                  isVisited: true,
                },
                {
                  id: "site-3",
                  type: "Battle",
                  isEnhanced: false,
                  isVisited: false,
                },
              ],
            },
          },
          startingNodeId: "dreamscape-1",
          bossNodeId: "dreamscape-1",
          currentNodeId: "dreamscape-1",
          layers: [],
          knownDreamsignCarrierIds: [],
        },
      }),
      mutations: {
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
        grantShopOmenDiscounts: vi.fn(),
        boostSiteAppearance: vi.fn(),
      },
      cardDatabase: new Map(),
      questContent: {
        cardDatabase: new Map(),
        dreamcallers: [],

        dreamwellCards: [],        dreamsignTemplates: [],        dreamscapes: MINIMAL_DREAMSCAPES,        atlasConfig: MINIMAL_ATLAS_CONFIG,
      },
    });

    const html = renderToStaticMarkup(<DreamscapeScreen />);

    expect(html).toContain("Battle unlocked");
    expect(html).not.toContain("remaining sites");
  });
});
