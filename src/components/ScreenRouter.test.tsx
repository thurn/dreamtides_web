// @vitest-environment jsdom

import {
  StrictMode,
  act,
  type ImgHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenRouter } from "./ScreenRouter";
import {
  JourneyContextProvider,
  createDefaultState,
  type JourneyMutations,
} from "../state/journey-context";
import { parseRuntimeConfig } from "../runtime/runtime-config";
import type { JourneyContent } from "../data/journey-content";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import type {
  CardSourceDebugState,
  JourneyState,
  SiteState,
} from "../types/journey";
import { LayerName } from "../types/layer-name";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestJourneyState,
} from "../journey_v2/testing/fixtures";
import { getLogEntries, resetLog } from "../logging";
import {
  MERCHANT_ARCHETYPE_LABELS,
  type MerchantArchetypeId,
} from "../journey_v2";

const motionPreference = vi.hoisted(() => ({
  reduced: false,
  isPresent: true,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({
    children,
    mode,
  }: {
    children: ReactNode;
    mode?: string;
  }) => <div data-animate-presence-mode={mode}>{children}</div>,
  useReducedMotion: () => motionPreference.reduced,
  useIsPresent: () => motionPreference.isPresent,
  motion: {
    div: ({
      children,
      exit,
      ...props
    }: {
      children: ReactNode;
      exit?: { pointerEvents?: string };
    }) => (
      <div
        {...props}
        data-exit-pointer-events={exit?.pointerEvents}
      >
        {children}
      </div>
    ),
    img: ({
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ImgHTMLAttributes<HTMLImageElement> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <img {...props} />,
    main: ({ children, ...props }: { children: ReactNode }) => (
      <main {...props}>{children}</main>
    ),
    section: ({ children, ...props }: { children: ReactNode }) => (
      <section {...props}>{children}</section>
    ),
  },
}));

vi.mock("./BattleSiteRoute", () => ({
  BattleSiteRoute: ({ site }: { site: SiteState }) => (
    <div data-testid="battle-site-route" data-site-id={site.id} />
  ),
}));

const roots: Root[] = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  motionPreference.reduced = false;
  motionPreference.isPresent = true;
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
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
      makeMerchantTestDreamsignTemplate({
        id: "router-sign-a",
        name: "Router Sign A",
      }),
      makeMerchantTestDreamsignTemplate({
        id: "router-sign-b",
        name: "Router Sign B",
      }),
    ],
    merchantCorpus: makeMerchantTestCorpus({ cards: corpus }),
    dreamsignProfiles: new Map(),
  });
}

function makeMutations(): JourneyMutations {
  return {
    changeEssence: vi.fn(),
    startJourney: vi.fn(),
    rerollDreamAvatarOffer: vi.fn(),
    completeSite: vi.fn(),
    ensureGambleSiteRuntime: vi.fn(),
    ensureExplorationSiteRuntime: vi.fn(),
    resolveExplorationChoice: vi.fn(),
    placeGravokWager: vi.fn(),
    settleGravokWager: vi.fn(),
    playAgainGravokWager: vi.fn(),
    replaceGravokWagerDreamsign: vi.fn(),
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
    completeAugurySite: vi.fn(),
    acceptDreamMerchantOffer: vi.fn(),
    declineDreamMerchant: vi.fn(),
    rerollAugury: vi.fn(),
    forceAuguryArchetype: vi.fn(),
    pickDraftCard: vi.fn(),
    enterDraftSite: vi.fn(),
    addCard: vi.fn(),
    addBaneCard: vi.fn(),
    removeCard: vi.fn(),
    transfigureCard: vi.fn(),
    setDreamAvatarSelection: vi.fn(),
    setCardSourceDebug: vi.fn(),
    addDreamsign: vi.fn(),
    removeDreamsign: vi.fn(),
    setRemainingDreamsignPool: vi.fn(),
    enterSite: vi.fn(),
    travelToDreamscape: vi.fn(),
    regenerateAtlas: vi.fn(),
    setDraftState: vi.fn(),
    dismissStartingDeckPopup: vi.fn(),
    resetJourney: vi.fn(),
    setEssence: vi.fn(),
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

function makeStateFor(site: SiteState): JourneyState {
  const merchantState = makeMerchantTestJourneyState({
    seed: "router-merchant-seed",
    essence: 180,
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

function renderWithJourney({
  state,
  journeyContent,
  mutations = makeMutations(),
  children,
  strict = false,
}: {
  state: JourneyState;
  journeyContent: JourneyContent;
  mutations?: JourneyMutations;
  children: ReactElement;
  strict?: boolean;
}) {
  return mountWithJourney({ state, journeyContent, mutations, children, strict })
    .container;
}

function mountWithJourney({
  state,
  journeyContent,
  mutations = makeMutations(),
  children,
  strict = false,
}: {
  state: JourneyState;
  journeyContent: JourneyContent;
  mutations?: JourneyMutations;
  children: ReactElement;
  strict?: boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);

  const renderTree = (
    nextState: JourneyState,
    nextMutations: JourneyMutations = mutations,
  ) => {
    const tree = (
      <JourneyContextProvider
        value={{
          state: nextState,
          mutations: nextMutations,
          cardDatabase: journeyContent.cardDatabase,
          journeyContent,
        }}
      >
        {children}
      </JourneyContextProvider>
    );
    const cumulusTree = <CumulusRoot>{tree}</CumulusRoot>;
    root.render(strict ? <StrictMode>{cumulusTree}</StrictMode> : cumulusTree);
  };
  const renderState = (
    nextState: JourneyState,
    nextMutations: JourneyMutations = mutations,
  ) =>
    act(() => {
      renderTree(nextState, nextMutations);
    });
  const renderStateAndFlush = async (
    nextState: JourneyState,
    nextMutations: JourneyMutations = mutations,
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

describe("ScreenRouter Augury routing", () => {
  it("mounts the next route without waiting on the outgoing screen", () => {
    const site = makeSite("Augury");
    const container = renderWithJourney({
      state: makeStateFor(site),
      journeyContent: merchantContent(),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />,
    });

    expect(
      container
        .querySelector("[data-animate-presence-mode]")
        ?.getAttribute("data-animate-presence-mode"),
    ).toBe("sync");
    expect(
      container
        .querySelector("[data-journey-screen]")
        ?.getAttribute("data-exit-pointer-events"),
    ).toBe("none");
  });

  it("makes an exiting route subtree inert", () => {
    motionPreference.isPresent = false;
    const site = makeSite("Augury");
    const container = renderWithJourney({
      state: makeStateFor(site),
      journeyContent: merchantContent(),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />,
    });

    const frame = container.querySelector<HTMLElement>(
      "[data-journey-screen]",
    );
    expect(frame?.dataset.journeyScreenPresence).toBe("exiting");
    expect(frame?.hasAttribute("inert")).toBe(true);
    expect(frame?.getAttribute("aria-hidden")).toBe("true");
    expect(frame?.style.pointerEvents).toBe("none");
  });

  it("renders the Cumulus Augury screen", () => {
    const site = makeSite("Augury");
    const state = makeStateFor(site);
    const container = renderWithJourney({
      state,
      journeyContent: makeMerchantTestContent({ cards: fixtureCards() }),
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
      ),
    });

    expect(
      container.querySelector('[data-testid="cumulus-augury-offer-A"]'),
    ).not.toBeNull();
  });

  it("renders generated offers for an Augury site", () => {
    const site = makeSite("Augury");
    const state = makeStateFor(site);
    const container = renderWithJourney({
      state,
      journeyContent: merchantContent(),
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
      ),
    });

    expect(
      container.querySelector('[data-testid="cumulus-augury-offer-A"]'),
    ).not.toBeNull();
  });

  it("renders the Cumulus Augury screen by default", () => {
    const site = makeSite("Augury");
    const container = renderWithJourney({
      state: makeStateFor(site),
      journeyContent: merchantContent(),
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
      ),
    });

    expect(
      container.querySelector(
        '[data-testid="cumulus-augury-site-screen"]',
      ),
    ).not.toBeNull();
    expect(
      getLogEntries().find((entry) => entry.event === "screen_rendered"),
    ).toMatchObject({ screenType: "site", siteId: site.id });
  });

  it("adds reroll and force-category debug commands to the Cumulus journey menu", () => {
    const site = makeSite("Augury");
    const mutations = makeMutations();
    const state = makeStateFor(site);
    state.dreamAvatar = {
      id: "72000000-0000-4000-8000-000000000001",
      name: "Menu Fixture",
      title: "Keeper of Tests",
      renderedText: "",
      imageNumber: "0000",
      startingEssence: 180,
    };
    const container = renderWithJourney({
      state,
      mutations,
      journeyContent: merchantContent(),
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
      ),
    });

    const openMenu = () => {
      const trigger = container.querySelector<HTMLButtonElement>(
        '[data-testid="dreamscape-menu-button"]',
      );
      act(() => trigger?.click());
    };
    const menuRow = (label: string) =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
      ).find((element) => element.textContent === label);

    openMenu();
    expect(menuRow("Force Category")).toBeDefined();
    const reroll = menuRow("Reroll Journey");
    expect(reroll).toBeDefined();
    act(() => reroll?.click());
    expect(mutations.rerollAugury).toHaveBeenCalledWith(site.id);

    openMenu();
    act(() => menuRow("Force Category")?.click());
    expect(menuRow("Random (clear force)")).toBeDefined();

    const generated = getLogEntries().find(
      (entry) => entry.event === "merchant_encounter_generated",
    );
    const eligibleArchetypeIds = (
      generated?.debug as
        { eligibleArchetypeIds?: MerchantArchetypeId[] } | undefined
    )?.eligibleArchetypeIds;
    const firstEligible = eligibleArchetypeIds?.[0];
    expect(firstEligible).toBeDefined();
    const categoryLabel =
      firstEligible === undefined
        ? ""
        : MERCHANT_ARCHETYPE_LABELS[firstEligible];
    const category = menuRow(categoryLabel);
    expect(category).toBeDefined();
    act(() => category?.click());
    expect(mutations.forceAuguryArchetype).toHaveBeenCalledWith(
      site.id,
      firstEligible,
    );
  });

  it("logs screen_rendered exactly once per navigation under strict mode", () => {
    const site = makeSite("Augury");
    const state = makeStateFor(site);
    renderWithJourney({
      state,
      journeyContent: merchantContent(),
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
      ),
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
    const site = makeSite("Augury");
    const state = makeStateFor(site);
    renderWithJourney({
      state,
      journeyContent: merchantContent(),
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
      ),
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
    expect(debug?.eligibleArchetypeIds?.length ?? 0).toBeGreaterThan(0);
    expect(debug?.rolledA).toBeDefined();
    expect(debug?.rolledB).toBeDefined();
  });

  it("emits a per-offer merchant_offer_built event joined to the encounter", () => {
    const site = makeSite("Augury");
    const state = makeStateFor(site);
    renderWithJourney({
      state,
      journeyContent: merchantContent(),
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
      ),
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
    const site = makeSite("Augury");
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
    renderWithJourney({
      state,
      mutations,
      journeyContent: contentWithoutDreamsigns,
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
      ),
    });

    const [debugState, source] =
      vi.mocked(mutations.setCardSourceDebug).mock.calls[0] ?? [];
    const cardSourceDebug = debugState as
      CardSourceDebugState | null | undefined;
    expect(source).toBe("merchant_grant_cards_shown");
    expect(cardSourceDebug?.screenLabel).toBe("Dream Merchant Offers");
    expect(cardSourceDebug?.surface).toBe("Reward");
    expect(
      cardSourceDebug?.entries.some(
        (entry) => typeof entry.cardNumber === "number",
      ),
    ).toBe(true);
  });

  it("publishes card source debug once when the coop fold applies that debug state", async () => {
    const site = makeSite("Augury");
    const state = { ...makeStateFor(site), deck: [] };
    const mutations = makeMutations();
    const foldedMutations = makeMutations();
    const content = merchantContent();
    const mounted = mountWithJourney({
      state,
      mutations,
      journeyContent: content,
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
      ),
    });
    const published = vi.mocked(mutations.setCardSourceDebug).mock
      .calls[0]?.[0];
    expect(published).toBeDefined();

    await mounted.renderStateAndFlush(
      { ...state, cardSourceDebug: published ?? null },
      foldedMutations,
    );

    expect(mutations.setCardSourceDebug).toHaveBeenCalledTimes(1);
    expect(foldedMutations.setCardSourceDebug).not.toHaveBeenCalled();
  });

  it("does not clear or republish card source debug during StrictMode effect replay", () => {
    const site = makeSite("Augury");
    const mutations = makeMutations();
    renderWithJourney({
      state: { ...makeStateFor(site), deck: [] },
      mutations,
      journeyContent: merchantContent(),
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
      ),
      strict: true,
    });

    expect(mutations.setCardSourceDebug).toHaveBeenCalledTimes(1);
    expect(mutations.setCardSourceDebug).not.toHaveBeenCalledWith(
      null,
      "merchant_grant_cards_hidden",
    );
  });

  it("fails closed when persisted state targets an inline-only site", () => {
    const site = makeSite("Reward");
    const state = makeStateFor(site);
    const container = renderWithJourney({
      state,
      journeyContent: merchantContent(),
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
      ),
    });

    expect(
      container.querySelector('[data-testid="error-boundary-fallback"]'),
    ).not.toBeNull();
  });

  it("renders a contained v2 fallback when merchant generation is unavailable", () => {
    const site = makeSite("Augury");
    const state = makeStateFor(site);
    const mutations = makeMutations();
    const container = renderWithJourney({
      state,
      mutations,
      journeyContent: makeMerchantTestContent({ cards: [] }),
      children: (
        <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
      ),
    });

    const walkAway = container.querySelector(
      '[data-testid="cumulus-augury-unavailable-exit"]',
    );
    if (!(walkAway instanceof HTMLButtonElement)) {
      throw new Error("expected fallback walk-away button");
    }

    act(() => {
      walkAway.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mutations.completeAugurySite).toHaveBeenCalledWith(site.id);
  });
});

describe("ScreenRouter terminal Cumulus routing", () => {
  it("renders Journey Failed with utility chrome, no status bar, and the reset action", () => {
    const state = createDefaultState();
    state.screen = { type: "journeyFailed" };
    state.completionLevel = 2;
    state.dreamAvatar = {
      id: "73000000-0000-4000-8000-000000000001",
      name: "Failure Fixture",
      title: "Keeper of the Last Test",
      renderedText: "A fixture ability.",
      imageNumber: "0001",
      startingEssence: 180,
    };
    state.failureSummary = {
      battleId: "router-failure-battle",
      result: "defeat",
      reason: "score_target_reached",
      siteId: "router-failure-site",
      siteLabel: "Battle",
      dreamscapeIdOrNone: "router-failure-dreamscape",
      turnNumber: 6,
      playerScore: 4,
      enemyScore: 10,
    };
    const mutations = makeMutations();
    const container = renderWithJourney({
      state,
      mutations,
      journeyContent: merchantContent(),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />,
    });

    expect(
      container.querySelector('[data-testid="cumulus-journey-failed-screen"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="dreamscape-menu-button"]'),
    ).not.toBeNull();
    expect(
      getLogEntries().find(
        (entry) => entry.event === "journey_failed_screen_shown",
      ),
    ).toMatchObject({
      battleId: "router-failure-battle",
      siteId: "router-failure-site",
    });

    const newJourney = container.querySelector<HTMLButtonElement>(
      '[data-testid="journey-failed-start-new-run"]',
    );
    act(() => newJourney?.click());
    expect(mutations.resetJourney).toHaveBeenCalledOnce();
    expect(
      getLogEntries().find(
        (entry) => entry.event === "journey_failed_start_new_run",
      ),
    ).toMatchObject({
      battleId: "router-failure-battle",
      result: "defeat",
    });
  });
});

describe("ScreenRouter site-dispatch completeness", () => {
  it("keeps a valid site route renderable while the active atlas node advances", () => {
    const site = makeSite("Battle");
    const state = makeStateFor(site);
    const siteNode = state.atlas.nodes["dreamscape-router"];
    if (siteNode === undefined) throw new Error("expected fixture site node");
    state.atlas.nodes["next-dreamscape"] = {
      ...siteNode,
      id: "next-dreamscape",
      sites: [],
    };
    state.currentDreamscape = "next-dreamscape";
    const container = renderWithJourney({
      state,
      journeyContent: merchantContent(),
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />,
    });

    expect(
      container
        .querySelector('[data-testid="battle-site-route"]')
        ?.getAttribute("data-site-id"),
    ).toBe(site.id);
  });

  it.each(["TemptingOffer"] as const)(
    "routes %s to the Cumulus work-in-progress site and completes it",
    (type) => {
      const site = makeSite(type);
      const mutations = makeMutations();
      const container = renderWithJourney({
        state: makeStateFor(site),
        journeyContent: merchantContent(),
        mutations,
        children: (
          <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />
        ),
      });

      expect(
        container
          .querySelector("[data-work-in-progress-panel]")
          ?.getAttribute("data-work-in-progress-site-type"),
      ).toBe(type);

      const continueButton = container.querySelector(
        '[data-testid="cumulus-work-in-progress-continue"]',
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
    },
  );

  it("routes Gamble to the Three-Gate Wager screen", () => {
    const site = makeSite("Gamble");
    const mutations = makeMutations();
    const container = renderWithJourney({
      state: makeStateFor(site),
      journeyContent: merchantContent(),
      mutations,
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />,
    });

    expect(
      container.querySelectorAll("[data-gamble-gates] [data-gamble-gate]"),
    ).toHaveLength(3);
    expect(container.querySelectorAll("[data-gamble-draw-card] [data-playing-card]"))
      .toHaveLength(0);
    expect(
      container.querySelector('[data-testid="gamble-choose-six"]'),
    ).toBeInstanceOf(HTMLButtonElement);
    expect(
      container.querySelector('[data-testid="gamble-choose-six"]')?.textContent,
    ).toBe("Bet · 50");
    expect(mutations.ensureGambleSiteRuntime).toHaveBeenCalledWith(site.id);
    expect(container.querySelector("[data-work-in-progress-panel]")).toBeNull();
  });

  it("routes Exploration to its fullscreen frame-break prototype", () => {
    motionPreference.reduced = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const site = makeSite("Exploration");
    const mutations = makeMutations();
    const journeyContent = merchantContent();
    const selectedCard = card(
      asCardId("161482b6-af07-4d9e-822d-8c738672beb9"),
      901,
    );
    journeyContent.cardDatabase.set(selectedCard.cardNumber, selectedCard);
    journeyContent.exploration = {
      customCards: [],
      customDreamsigns: [],
      encounters: [
        {
          cardId: selectedCard.id,
          prose: "The fixture waits beyond the frame.",
          actions: [
            {
              id: "fixture-action-a",
              label: "Accept the Fixture",
              effectText: "Gain the fixture card.",
              effectKind: "gain-card",
              cardId: selectedCard.id,
            },
            {
              id: "fixture-action-b",
              label: "Echo the Fixture",
              effectText: "Gain the fixture card.",
              effectKind: "gain-card",
              cardId: selectedCard.id,
            },
          ],
        },
      ],
    };
    const state = makeStateFor(site);
    state.siteRuntime[site.id] = {
      kind: "exploration",
      encounterCardId: selectedCard.id,
      actionOffers: ["fixture-action-a", "fixture-action-b"].map((actionId) => ({
        actionId,
        offeredCardIds: [],
        packCardIds: [],
        replacementCardIdByEntryId: {},
        transfigurationByEntryId: {},
      })),
      resolution: null,
    };
    const container = renderWithJourney({
      state,
      journeyContent,
      mutations,
      children: <ScreenRouter runtimeConfig={parseRuntimeConfig("")} />,
    });

    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-site-screen"]',
      ),
    ).not.toBeNull();
    expect(
      container
        .querySelector("[data-exploration-card-slot]")
        ?.getAttribute("data-card-id"),
    ).toBe(selectedCard.id);

    const channelButton = container.querySelector(
      '[data-testid="cumulus-exploration-channel"]',
    );
    if (!(channelButton instanceof HTMLButtonElement)) {
      throw new Error("expected a Channel button for Exploration");
    }
    act(() => {
      channelButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const frameBreak = container.querySelector<HTMLElement>(
      "[data-exploration-frame-break]",
    );
    expect(frameBreak?.dataset.explorationFullArtImageNumber).toBe(
      String(selectedCard.imageNumber),
    );
    expect(frameBreak?.dataset.explorationFrameBreakPhase).toBe("open");
    const statusBar = container.querySelector<HTMLElement>(
      "[data-journey-status-bar-anchor]",
    );
    expect(statusBar).not.toBeNull();
    expect(statusBar?.style.visibility).not.toBe("hidden");
    expect(mutations.completeSite).not.toHaveBeenCalled();
    expect(
      getLogEntries().find(
        (entry) => entry.event === "exploration_frame_break_started",
      ),
    ).toMatchObject({
      siteId: site.id,
      cardId: selectedCard.id,
      highResolutionImageNumber: selectedCard.imageNumber,
    });

    const choiceButton = container.querySelector(
      '[data-testid="cumulus-exploration-choice-0"]',
    );
    if (!(choiceButton instanceof HTMLButtonElement)) {
      throw new Error("expected an Exploration choice button");
    }
    act(() => {
      choiceButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mutations.resolveExplorationChoice).toHaveBeenCalledWith(
      site.id,
      "fixture-action-a",
      undefined,
    );
    expect(
      getLogEntries().find(
        (entry) => entry.event === "exploration_choice_requested",
      ),
    ).toMatchObject({
      siteId: site.id,
      presentedCardId: selectedCard.id,
      actionId: "fixture-action-a",
    });
  });
});
