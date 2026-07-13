// @vitest-environment jsdom

import { StrictMode, act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenRouter } from "./ScreenRouter";
import {
  QuestContextProvider,
  createDefaultState,
  type QuestMutations,
} from "../state/quest-context";
import { parseRuntimeConfig } from "../runtime/runtime-config";
import type { QuestContent } from "../data/quest-content";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import type { CardSourceDebugState, QuestState, SiteState } from "../types/quest";
import { LayerName } from "../types/layer-name";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestQuestState,
} from "../journey_v2/testing/fixtures";
import { getLogEntries, resetLog } from "../logging";
import { ALL_SITE_TYPES } from "../atlas/atlas-generator";

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

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

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
    id: asCardId(id),
    cardNumber,
    name: asCardName(`Router Fixture ${cardNumber}`),
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
      name: asCardName("High Event"),
      cardType: "Event",
      energyCost: 5,
      spark: null,
      renderedText: "Fast.",
    }),
    card(UUIDS.deckHighCharacter, 2, {
      name: asCardName("High Character"),
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

function merchantContent() {
  const cards = fixtureCards();
  const corpus: Record<string, { quality: number }> = {};
  for (const [index, c] of cards.entries()) {
    corpus[c.id] = { quality: 0.1 + (index % 10) / 10 };
  }
  return makeMerchantTestContent({
    cards,
    dreamsignTemplates: [
      makeMerchantTestDreamsignTemplate({ id: "router-sign-a", name: "Router Sign A" }),
      makeMerchantTestDreamsignTemplate({ id: "router-sign-b", name: "Router Sign B" }),
    ],
    merchantCorpus: makeMerchantTestCorpus({ cards: corpus }),
    dreamsignProfiles: new Map(),
  });
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
    completeDreamAugurySite: vi.fn(),
    acceptDreamMerchantOffer: vi.fn(),
    declineDreamMerchant: vi.fn(),
    pickDraftCard: vi.fn(),
    enterDraftSite: vi.fn(),
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
    setEssence: vi.fn(),
    changeMaxEssence: vi.fn(),
    addCardById: vi.fn(() => null),
    addCardByIdWithTransfiguration: vi.fn(() => null),
    addBaneCardById: vi.fn(),
    removeDeckEntry: vi.fn(),
    purgeDeckCards: vi.fn(),
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
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: "test_dreamscape",
          biomeName: "Router Dreamscape",
          biomeColor: "#7c3aed",
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
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
  return mountWithQuest({ state, questContent, mutations, children, strict })
    .container;
}

function mountWithQuest({
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

  const renderTree = (
    nextState: QuestState,
    nextMutations: QuestMutations = mutations,
  ) => {
    const tree = (
      <QuestContextProvider
        value={{
          state: nextState,
          mutations: nextMutations,
          cardDatabase: questContent.cardDatabase,
          questContent,
        }}
      >
        {children}
      </QuestContextProvider>
    );
    const cumulusTree = <CumulusRoot>{tree}</CumulusRoot>;
    root.render(strict ? <StrictMode>{cumulusTree}</StrictMode> : cumulusTree);
  };
  const renderState = (
    nextState: QuestState,
    nextMutations: QuestMutations = mutations,
  ) => act(() => {
    renderTree(nextState, nextMutations);
  });
  const renderStateAndFlush = async (
    nextState: QuestState,
    nextMutations: QuestMutations = mutations,
  ) => {
    await act(async () => {
      renderTree(nextState, nextMutations);
      await Promise.resolve();
    });
  };
  renderState(state);

  return { container, renderState, renderStateAndFlush };
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

describe("ScreenRouter DreamAugury routing", () => {
  it("renders the classic journey path for a DreamAugury site in classic config", () => {
    const site = makeSite("DreamAugury");
    const state = makeStateFor(site);
    const container = renderWithQuest({
      state,
      questContent: makeMerchantTestContent({ cards: fixtureCards() }),
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=classic")} />
      ),
    });

    expect(container.querySelector('[data-testid="classic-journey-screen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dream-merchant-v2-screen"]')).toBeNull();
  });

  it("renders the Dream Merchant v2 screen for a DreamAugury site in v2 config", () => {
    const site = makeSite("DreamAugury");
    const state = makeStateFor(site);
    const container = renderWithQuest({
      state,
      questContent: merchantContent(),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />,
    });

    expect(container.querySelector('[data-testid="dream-merchant-v2-screen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="classic-journey-screen"]')).toBeNull();
  });

  it("logs screen_rendered exactly once per navigation under strict mode", () => {
    const site = makeSite("DreamAugury");
    const state = makeStateFor(site);
    renderWithQuest({
      state,
      questContent: merchantContent(),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />,
      strict: true,
    });

    // StrictMode double-invokes effects in dev; the dedupe guard must keep this
    // to one entry for the single navigation.
    const screenLogs = getLogEntries().filter(
      (entry) => entry.event === "screen_rendered",
    );
    expect(screenLogs).toHaveLength(1);
    expect(screenLogs[0]?.screenType).toBe("site");
    expect(screenLogs[0]?.siteId).toBe(site.id);
  });

  it("logs the generated encounter debug once per encounter signature under strict mode", () => {
    const site = makeSite("DreamAugury");
    const state = makeStateFor(site);
    renderWithQuest({
      state,
      questContent: merchantContent(),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />,
      strict: true,
    });

    const shownLogs = getLogEntries().filter(
      (entry) => entry.event === "merchant_encounter_generated",
    );
    expect(shownLogs).toHaveLength(1);
    expect(shownLogs[0]?.offerCount).toBe(2);
    expect(shownLogs[0]?.debug).toMatchObject({
      encounterSignature: shownLogs[0]?.encounterSignature,
    });
    const debug = shownLogs[0]?.debug as
      | {
          eligibleArchetypeIds?: unknown[];
          rolledA?: string;
          rolledB?: string;
        }
      | undefined;
    expect((debug?.eligibleArchetypeIds?.length ?? 0)).toBeGreaterThan(0);
    expect(debug?.rolledA).toBeDefined();
    expect(debug?.rolledB).toBeDefined();
  });

  it("emits a per-offer merchant_offer_built event joined to the encounter", () => {
    const site = makeSite("DreamAugury");
    const state = makeStateFor(site);
    renderWithQuest({
      state,
      questContent: merchantContent(),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />,
    });

    const encounterLogs = getLogEntries().filter(
      (entry) => entry.event === "merchant_encounter_generated",
    );
    const offerLogs = getLogEntries().filter(
      (entry) => entry.event === "merchant_offer_built",
    );
    const signature = encounterLogs[0]?.encounterSignature;
    expect(signature).toBeDefined();
    // The encounter carries a deck snapshot; one offer event per offer slot.
    expect(encounterLogs[0]?.deck).toBeDefined();
    expect(offerLogs).toHaveLength(2);
    for (const offer of offerLogs) {
      // Each offer line joins back to its encounter and carries a trace.
      expect(offer.encounterSignature).toBe(signature);
      expect(typeof offer.archetypeId).toBe("string");
      expect(typeof offer.targetKey).toBe("string");
      expect(offer.deckHash).toBe(
        (encounterLogs[0]?.deck as { hash?: unknown } | undefined)?.hash,
      );
      const trace = offer.trace as { decision?: unknown } | null;
      expect(trace).not.toBeNull();
      expect(typeof trace?.decision).toBe("string");
    }
    expect(new Set(offerLogs.map((o) => o.offerId))).toEqual(
      new Set(["A", "B"]),
    );
  });

  it("sets card source debug for visible merchant grant cards", () => {
    // Use a fixture with a strong corpus quality signal so at least one
    // grant offer (strong_card or similar) appears in the encounter.
    const site = makeSite("DreamAugury");
    // Build content with no dreamsigns so dreamsign_draft is ineligible and
    // the generator falls back to grant/improve/etc. families that yield cards.
    const cards = fixtureCards();
    const corpus: Record<string, { quality: number }> = {};
    for (const [index, c] of cards.entries()) {
      corpus[c.id] = { quality: 0.1 + (index % 10) / 10 };
    }
    const contentWithoutDreamsigns = makeMerchantTestContent({
      cards,
      dreamsignTemplates: [],
      merchantCorpus: makeMerchantTestCorpus({ cards: corpus }),
      dreamsignProfiles: new Map(),
    });
    // An empty deck keeps the deck-targeting families (duplicate / purge) and
    // fit-gated drafts ineligible, so both offer slots come from the
    // always-eligible face-up grant families (strong_card / card_bundle) and the
    // encounter reliably surfaces visible catalog grant cards.
    const state = { ...makeStateFor(site), deck: [] };
    const mutations = makeMutations();
    renderWithQuest({
      state,
      mutations,
      questContent: contentWithoutDreamsigns,
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

  it("publishes card source debug once when the coop fold applies that debug state", async () => {
    const site = makeSite("DreamAugury");
    const state = { ...makeStateFor(site), deck: [] };
    const mutations = makeMutations();
    const foldedMutations = makeMutations();
    const content = merchantContent();
    const mounted = mountWithQuest({
      state,
      mutations,
      questContent: content,
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />,
    });
    const published = vi.mocked(mutations.setCardSourceDebug).mock.calls[0]?.[0];
    expect(published).toBeDefined();

    await mounted.renderStateAndFlush(
      { ...state, cardSourceDebug: published ?? null },
      foldedMutations,
    );

    expect(mutations.setCardSourceDebug).toHaveBeenCalledTimes(1);
    expect(foldedMutations.setCardSourceDebug).not.toHaveBeenCalled();
  });

  it("does not clear or republish card source debug during StrictMode effect replay", () => {
    const site = makeSite("DreamAugury");
    const mutations = makeMutations();
    renderWithQuest({
      state: { ...makeStateFor(site), deck: [] },
      mutations,
      questContent: merchantContent(),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />,
      strict: true,
    });

    expect(mutations.setCardSourceDebug).toHaveBeenCalledTimes(1);
    expect(mutations.setCardSourceDebug).not.toHaveBeenCalledWith(
      null,
      "merchant_grant_cards_hidden",
    );
  });

  it("does not route a non-DreamAugury site to the v2 screen in v2 config", () => {
    const site = makeSite("Reward");
    const state = makeStateFor(site);
    const container = renderWithQuest({
      state,
      questContent: merchantContent(),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />,
    });

    expect(container.querySelector('[data-testid="reward-site-screen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dream-merchant-v2-screen"]')).toBeNull();
  });

  it("renders a contained v2 fallback when merchant generation is unavailable", () => {
    const site = makeSite("DreamAugury");
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

    expect(mutations.completeDreamAugurySite).toHaveBeenCalledWith(site.id);
  });
});

describe("ScreenRouter site-dispatch completeness", () => {
  // The fallthrough placeholder copy rendered only when no site-type branch
  // matches. Reaching it means a SiteType is unhandled by the router.
  const FALLTHROUGH_TEXT = "This site will be implemented in a later task.";

  // Battle routes into the heavy playable-battle stack, which needs a full
  // battle init that this lightweight harness does not assemble. Its dispatch
  // is covered by BattleSiteRoute's own tests; every other site type must
  // resolve to a real screen here.
  const NON_BATTLE_SITE_TYPES = ALL_SITE_TYPES.filter(
    (type) => type !== "Battle",
  );

  it("resolves a real screen for every non-Battle site type", () => {
    for (const type of NON_BATTLE_SITE_TYPES) {
      const site = makeSite(type);
      const container = renderWithQuest({
        state: makeStateFor(site),
        questContent: merchantContent(),
        children: (
          <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />
        ),
      });

      expect(
        container.querySelector('[data-quest-screen="site"]'),
        `expected site screen for ${type}`,
      ).not.toBeNull();
      expect(
        container.textContent,
        `site type ${type} fell through to the generic placeholder`,
      ).not.toContain(FALLTHROUGH_TEXT);
      expect(
        container.textContent,
        `site type ${type} did not resolve to a site`,
      ).not.toContain("Site not found.");
    }
  });

  it("routes the three stub site types to the stub screen and completes them", () => {
    const stubTypes = ALL_SITE_TYPES.filter(
      (type) =>
        type === "TemptingOffer" ||
        type === "Gamble" ||
        type === "TemporalFork",
    );
    expect(stubTypes.length).toBe(3);

    for (const type of stubTypes) {
      const site = makeSite(type);
      const mutations = makeMutations();
      const container = renderWithQuest({
        state: makeStateFor(site),
        questContent: merchantContent(),
        mutations,
        children: (
          <ScreenRouter runtimeConfig={parseRuntimeConfig("?journey=v2")} />
        ),
      });

      const stub = container.querySelector("[data-stub-site-screen]");
      expect(stub, `expected stub screen for ${type}`).not.toBeNull();
      expect(stub?.getAttribute("data-stub-site-type")).toBe(type);

      const continueButton = container.querySelector(
        "[data-stub-site-continue]",
      );
      if (!(continueButton instanceof HTMLButtonElement)) {
        throw new Error(`expected a Continue button for ${type}`);
      }
      act(() => {
        continueButton.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      });
      expect(mutations.completeSite).toHaveBeenCalledWith(
        site.id,
        "stub_site_continue",
      );
    }
  });
});
