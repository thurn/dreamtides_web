// @vitest-environment jsdom

import { act } from "react";
import { economyFixture } from "./testing/economy-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
} from "./__test-helpers__/atlas-fixtures";
import type { ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyContent } from "./data/journey-content";
import { loadJourneyContent } from "./data/journey-content";
import { getFirebaseDatabase } from "./firebase/app-config";
import type { CardData } from "./types/cards";
import type { JourneyMutations } from "./state/journey-context";
import type { JourneyState } from "./types/journey";
import { LayerName } from "./types/layer-name";
import App, { JourneyApp } from "./App";
import { useJourney } from "./state/journey-context";
import { registerGameProviders } from "./coop/providers/register-game-providers";

vi.mock("./data/journey-content", () => ({
  loadJourneyContent: vi.fn(),
}));
vi.mock("./data/tutorial-actions", () => ({
  loadTutorialConfiguration: vi.fn(() => Promise.resolve({
    journeyStart: {
      speechBubble: {
        speaker: "mira",
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 550,
        text: "Choose an avatar.",
      },
    },
    dreamscape: {
      speechBubble: {
        speaker: "mira",
        delay: 2,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
        text: "Visit Dream Sites.",
      },
    },
    atlas: {
      speechBubble: {
        speaker: "mira",
        delay: 1,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
        text: "Choose the next dream.",
      },
    },
    draft: {
      speechBubble: {
        speaker: "mira",
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 600,
        text: "Draft a card.",
      },
    },
    purge: {
      speechBubble: {
        speaker: "mira",
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 600,
        text: "Purge a card.",
      },
    },
    dreamsignRevelation: {
      speechBubble: {
        speaker: "mira",
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 600,
        text: "Choose a Dreamsign.",
      },
    },
    battleStart: {
      firstBattle: {
        speechBubble: {
          speaker: "mira",
          delay: 1,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "Review the first opponent.",
        },
      },
      secondBattle: {
        speechBubble: {
          speaker: "mira",
          delay: 1,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "Prepare for the second battle.",
        },
      },
    },
    actions: [],
    triggers: [],
    battle: { playerDraws: [], enemyDraws: [], dreamwellDraws: [] },
  })),
}));

vi.mock("./firebase/app-config", () => ({
  getFirebaseDatabase: vi.fn(),
}));

vi.mock("./coop/RoomGate", () => ({
  RoomGate: ({
    gameId,
    children,
  }: {
    gameId: string | null;
    children: (context: unknown) => ReactNode;
  }) => {
    const context = {
      db: {},
      roomId: gameId ?? "created-room",
      clientId: "client-test",
      genesis: { seed: "test-seed", reducerVersion: "test", createdAt: 0 },
      logSink: {},
    };
    return <div data-room-gate={gameId ?? "create"}>{children(context)}</div>;
  },
}));

vi.mock("./coop/hooks", () => ({
  CoopProvider: ({ children }: { children: ReactNode }) => (
    <div data-coop-provider>{children}</div>
  ),
  useConnectedCount: () => 1,
  useConfirmedHead: () => 0,
}));

vi.mock("./coop/providers/register-game-providers", () => ({
  registerGameProviders: vi.fn(),
}));

vi.mock("./state/coop-journey-context", () => ({
  CoopJourneyProvider: ({ children }: { children: ReactNode }) => (
    <div data-coop-journey-provider>{children}</div>
  ),
}));

vi.mock("./state/front-door-context", () => ({
  FrontDoorProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("./coop/HostedPlaytestShell", () => ({
  HostedPlaytestShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("./components/FrontDoorRouter", () => ({
  FrontDoorRouter: ({ journey }: { journey: ReactNode }) => journey,
}));

vi.mock("./state/journey-context", () => ({
  useJourney: vi.fn(),
}));

vi.mock("./components/ScreenRouter", () => ({
  ScreenRouter: ({
    cumulusChromeHandlers,
  }: {
    cumulusChromeHandlers?: { onOpenPoolViewer?: () => void };
  }) => (
    <div data-testid="cumulus-screen-router">
      <button
        type="button"
        data-testid="cumulus-open-pool"
        onClick={cumulusChromeHandlers?.onOpenPoolViewer}
      >
        Pool
      </button>
    </div>
  ),
}));

interface DeckViewerMockProps {
  isOpen: boolean;
  onClose: () => void;
}

const deckViewerMock = vi.fn<(props: DeckViewerMockProps) => ReactNode>(
  ({ isOpen }) => <div data-deck-open={String(isOpen)}>Deck Viewer</div>,
);

vi.mock("./screens/cumulus_adapters/DesktopDeckViewerAdapter", () => ({
  DesktopDeckViewerAdapter: (props: DeckViewerMockProps) =>
    deckViewerMock(props),
}));

interface PoolViewerMockProps {
  isOpen: boolean;
  onClose: () => void;
}

const poolViewerMock = vi.fn<(props: PoolViewerMockProps) => ReactNode>(
  ({ isOpen, onClose }) => (
    <button type="button" data-pool-open={String(isOpen)} onClick={onClose}>
      Pool Viewer
    </button>
  ),
);

vi.mock("./screens/cumulus_adapters/PoolViewerAdapter", () => ({
  PoolViewerAdapter: (props: PoolViewerMockProps) => poolViewerMock(props),
}));

interface StartingDeckOverlayMockProps {
  isOpen: boolean;
  onClose: () => void;
}

const startingDeckModalMock = vi.fn<
  (props: StartingDeckOverlayMockProps) => ReactNode
>(({ isOpen }) => (
  <div data-starting-deck-open={String(isOpen)}>Starting Deck Overlay</div>
));

vi.mock("./screens/cumulus_adapters/StartingDeckOverlayAdapter", () => ({
  StartingDeckOverlayAdapter: (props: StartingDeckOverlayMockProps) =>
    startingDeckModalMock(props),
}));

vi.mock("./screens/DebugScreen", () => ({
  DebugScreen: () => <div>Debug Screen</div>,
}));

vi.mock("./screens/CardSourceOverlay", () => ({
  CardSourceOverlay: () => <div>Card Source Overlay</div>,
}));

function makeMutations(): JourneyMutations {
  return {
    changeEssence: vi.fn(),
    startJourney: vi.fn(),
    rerollDreamAvatarOffer: vi.fn(),
    completeSite: vi.fn(),
    ensureGambleSiteRuntime: vi.fn(),
    ensureExplorationSiteRuntime: vi.fn(),
    ensureRandomSiteRuntime: vi.fn(),
    chooseRandomSite: vi.fn(),
    resolveExplorationChoice: vi.fn(),
    placeGravokWager: vi.fn(),
    settleGravokWager: vi.fn(),
    playAgainGravokWager: vi.fn(),
    replaceGravokWagerDreamsign: vi.fn(),
    playAgainStarwayStairs: vi.fn(),
    drawTidemarkLadderClimb: vi.fn(),
    settleTidemarkLadderClimb: vi.fn(),
    replaceTidemarkLadderClimbDreamsign: vi.fn(),
    drawStarwayStairs: vi.fn(),
    settleStarwayStairs: vi.fn(),
    cashOutStarwayStairs: vi.fn(),
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
    pickDraftCard: vi.fn(),
    enterDraftSite: vi.fn(),
    addCard: vi.fn(),
    removeCard: vi.fn(),
    transfigureCard: vi.fn(),
    changeDeckEntryType: vi.fn(),
    changeDeckEntryKeywords: vi.fn(),
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
    addCardById: vi.fn(),
    addCardByIdWithTransfiguration: vi.fn(),
    removeDeckEntry: vi.fn(),
    purgeDeckCards: vi.fn(),
    duplicateDeckEntry: vi.fn(),
    purgeRandomNightmareCards: vi.fn(),
    purgeAllNightmareCards: vi.fn(),
    pushBattleRewardModifier: vi.fn(),
    pushTemporaryNightmareGrant: vi.fn(),
    addSiteToDreamscape: vi.fn(),
    replaceSiteType: vi.fn(),
    removeSiteTypeFromNextDreamscapes: vi.fn(),
    grantFreeShopRerolls: vi.fn(),
    applyShopEssenceDiscount: vi.fn(),
    boostSiteAppearance: vi.fn(),
  };
}

function makeState(overrides: Partial<JourneyState> = {}): JourneyState {
  return {
    runId: "journey:test",
    seed: "test-seed",
    essence: 250,
    maxDreamsigns: 12,
    deck: [],
    dreamAvatar: null,
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
    screen: { type: "journeyStart" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      essenceDiscountPercent: 0,
    },
    siteOfferModifiers: [],
    dreamscapeModifiers: [],
    ...overrides,
  };
}

function makeJourneyContent(): JourneyContent {
  return {
    cardDatabase: new Map<number, CardData>(),
    dreamAvatars: [],

    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: MINIMAL_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    economyData: economyFixture(),
  };
}

function setJourneyState(state: JourneyState): void {
  vi.mocked(useJourney).mockReturnValue({
    state,
    mutations: makeMutations(),
    cardDatabase: new Map<number, CardData>(),
    journeyContent: {
      cardDatabase: new Map(),
      dreamAvatars: [],

      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: MINIMAL_DREAMSCAPES,
      affiliations: [],
      guides: [],
      atlasData: MINIMAL_ATLAS_DATA,
      economyData: economyFixture(),
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

async function flushAppEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
  vi.mocked(loadJourneyContent).mockResolvedValue(makeJourneyContent());
  vi.mocked(getFirebaseDatabase).mockReturnValue(
    {} as ReturnType<typeof getFirebaseDatabase>,
  );
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // These specs exercise the desktop deck-viewer overlay (mocked as
  // `deckViewerMock`); report a desktop viewport so `useIsDesktop` selects the
  // `DesktopDeckViewerAdapter` rather than the narrow-viewport
  // `MobileDeckViewerAdapter`.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("min-width"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("routes loaded journey content through the coop room gate", async () => {
    setJourneyState(makeState());

    const { container, root } = mount(
      <App
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: "ab12cd",
          databaseMode: "emulator",
        }}
      />,
    );

    await flushAppEffects();

    expect(getFirebaseDatabase).toHaveBeenCalledWith("emulator");
    expect(container.querySelector("[data-room-gate='ab12cd']")).not.toBeNull();
    expect(container.querySelector("[data-coop-provider]")).not.toBeNull();
    expect(
      container.querySelector("[data-coop-journey-provider]"),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("blocks room entry and provider registration when journey content loading fails", async () => {
    vi.mocked(loadJourneyContent).mockRejectedValueOnce(
      new Error("Failed to load draft records: 503 Test Failure"),
    );

    const { container, root } = mount(
      <App
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: "ab12cd",
          databaseMode: "emulator",
        }}
      />,
    );

    await flushAppEffects();

    expect(container.querySelector('[data-application-state="recoverableError"]')).not.toBeNull();
    expect(container.textContent).toContain("Journey Content Failed to Load");
    expect(container.textContent).toContain("Failed to load draft records");
    expect(container.querySelector("[data-room-gate]")).toBeNull();
    expect(container.querySelector("[data-coop-provider]")).toBeNull();
    expect(registerGameProviders).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("renders a Firebase setup issue when database initialization fails", async () => {
    vi.mocked(getFirebaseDatabase).mockImplementationOnce(() => {
      throw new Error("Missing VITE_FIREBASE_DATABASE_URL");
    });

    const { container, root } = mount(
      <App
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    await flushAppEffects();

    expect(container.querySelector('[data-application-state="fatalConfiguration"]')).not.toBeNull();
    expect(container.textContent).toContain("Firebase Setup Issue");
    expect(container.textContent).toContain(
      "Missing VITE_FIREBASE_DATABASE_URL",
    );
    expect(container.textContent).toContain("Run npm start");
    expect(container.querySelector("[data-room-gate]")).toBeNull();
    expect(container.querySelector("[data-multiplayer-provider]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders realtime Firebase setup help when realtime database initialization fails", async () => {
    vi.mocked(getFirebaseDatabase).mockImplementationOnce(() => {
      throw new Error("Missing VITE_FIREBASE_DATABASE_URL");
    });

    const { container, root } = mount(
      <App
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "realtime",
        }}
      />,
    );

    await flushAppEffects();

    expect(getFirebaseDatabase).toHaveBeenCalledWith("realtime");
    expect(container.querySelector('[data-application-state="fatalConfiguration"]')).not.toBeNull();
    expect(container.textContent).toContain("Firebase Setup Issue");
    expect(container.textContent).toContain(
      "Missing VITE_FIREBASE_DATABASE_URL",
    );
    expect(container.textContent).toContain(
      "Required env: VITE_FIREBASE_API_KEY",
    );

    act(() => {
      root.unmount();
    });
  });
});

describe("JourneyApp", () => {
  const starterCallerState = (
    overrides: Partial<JourneyState> = {},
  ): JourneyState =>
    makeState({
      deck: Array.from({ length: 10 }, (_, index) => ({
        entryId: `deck-${String(index + 1)}`,
        cardNumber: 711 + index,
        transfiguration: null,
        isBane: false,
      })),
      dreamAvatar: {
        id: "caller-1",
        name: "Starter Caller",
        title: "Of the First Hand",
        renderedText: "Pick your path.",
        imageNumber: "0004",
        startingEssence: 250,
      },
      screen: { type: "dreamscape" },
      ...overrides,
    });

  it("keeps the deck viewer and starting-deck modal closed before any dreamAvatar is selected", () => {
    setJourneyState(makeState());

    const { container, root } = mount(
      <JourneyApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    expect(deckViewerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    );
    expect(startingDeckModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    );
    expect(
      container.querySelector("[data-testid='cumulus-screen-router']"),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("opens the starting-deck modal (not the full DeckViewer) immediately after a dreamAvatar is picked", () => {
    setJourneyState(starterCallerState());

    const { container, root } = mount(
      <JourneyApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    // The starter-deck reveal uses the lightweight modal overlay; the full
    // DeckViewer stays closed so the dreamscape behind remains visible.
    expect(startingDeckModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: true }),
    );
    expect(deckViewerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    );
    expect(
      container.querySelector("[data-testid='cumulus-screen-router']"),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("dispatches dismissStartingDeckPopup when the starting-deck modal close handler fires", () => {
    const mutations = makeMutations();
    vi.mocked(useJourney).mockReturnValue({
      state: starterCallerState(),
      mutations,
      cardDatabase: new Map<number, CardData>(),
      journeyContent: {
        cardDatabase: new Map(),
        dreamAvatars: [],

        dreamwellCards: [],
        dreamsignTemplates: [],
        dreamscapes: MINIMAL_DREAMSCAPES,
        affiliations: [],
        guides: [],
        atlasData: MINIMAL_ATLAS_DATA,
        economyData: economyFixture(),
      },
    });

    const { root } = mount(
      <JourneyApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    const lastCall =
      startingDeckModalMock.mock.calls[
        startingDeckModalMock.mock.calls.length - 1
      ];
    expect(lastCall).toBeDefined();
    const props = lastCall?.[0];
    expect(props).toBeDefined();
    expect(typeof props?.onClose).toBe("function");
    act(() => {
      props?.onClose();
    });
    expect(mutations.dismissStartingDeckPopup).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("does not re-open the starting-deck modal when hasSeenStartingDeckPopup is already true (reload case)", () => {
    setJourneyState(starterCallerState({ hasSeenStartingDeckPopup: true }));

    const { root } = mount(
      <JourneyApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    expect(startingDeckModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    );
    expect(deckViewerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    );

    act(() => {
      root.unmount();
    });
  });

  it("opens and closes the Pool Viewer from Cumulus journey chrome", () => {
    setJourneyState(starterCallerState({ hasSeenStartingDeckPopup: true }));

    const { container, root } = mount(
      <JourneyApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    expect(poolViewerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-testid='cumulus-open-pool']")
        ?.click();
    });
    expect(poolViewerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: true }),
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-pool-open='true']")
        ?.click();
    });
    expect(poolViewerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    );

    act(() => {
      root.unmount();
    });
  });

  it("renders battle sites through the same Cumulus gameplay router", () => {
    setJourneyState(
      makeState({
        atlas: {
          nodes: {
            "dreamscape-1": {
              id: "dreamscape-1",
              layer: LayerName.One,
              indexInLayer: 0,
              dreamscapeId: "test_dreamscape",
              biomeName: "Test Dreamscape",
              sites: [
                {
                  id: "site-1",
                  type: "Battle",
                  isEnhanced: false,
                  isVisited: false,
                },
              ],
              position: { x: 0, y: 0 },
              state: "available",
              enhancedSiteType: null,
              forwardIds: [],
              backwardIds: [],
              knownDreamsignId: null,
            },
          },
          startingNodeId: "dreamscape-1",
          bossNodeId: "dreamscape-1",
          currentNodeId: "dreamscape-1",
          layers: [],
          knownDreamsignCarrierIds: [],
        },
        currentDreamscape: "dreamscape-1",
        screen: { type: "site", siteId: "site-1" },
        activeSiteId: "site-1",
      }),
    );

    const { container, root } = mount(
      <JourneyApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    expect(
      container.querySelector('[data-testid="cumulus-screen-router"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("hides the shared HUD on the desktop Cumulus draft site", () => {
    setJourneyState(
      makeState({
        atlas: {
          nodes: {
            "dreamscape-1": {
              id: "dreamscape-1",
              layer: LayerName.One,
              indexInLayer: 0,
              dreamscapeId: "test_dreamscape",
              biomeName: "Test Dreamscape",
              sites: [
                {
                  id: "site-1",
                  type: "Draft",
                  isEnhanced: false,
                  isVisited: false,
                },
              ],
              position: { x: 0, y: 0 },
              state: "available",
              enhancedSiteType: null,
              forwardIds: [],
              backwardIds: [],
              knownDreamsignId: null,
            },
          },
          startingNodeId: "dreamscape-1",
          bossNodeId: "dreamscape-1",
          currentNodeId: "dreamscape-1",
          layers: [],
          knownDreamsignCarrierIds: [],
        },
        currentDreamscape: "dreamscape-1",
        screen: { type: "site", siteId: "site-1" },
        activeSiteId: "site-1",
      }),
    );

    const { container, root } = mount(
      <JourneyApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    expect(container.querySelector('[data-testid="hud"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
