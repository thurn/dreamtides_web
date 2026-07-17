// @vitest-environment jsdom

import { act } from "react";
import {
  MINIMAL_ATLAS_CONFIG,
  MINIMAL_DREAMSCAPES,
} from "./__test-helpers__/atlas-fixtures";
import type { ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestContent } from "./data/quest-content";
import { loadQuestContent } from "./data/quest-content";
import { getFirebaseDatabase } from "./firebase/app-config";
import type { CardData } from "./types/cards";
import type { QuestMutations } from "./state/quest-context";
import type { QuestState } from "./types/quest";
import { LayerName } from "./types/layer-name";
import App, { QuestApp } from "./App";
import { useQuest } from "./state/quest-context";
import { registerGameProviders } from "./coop/providers/register-game-providers";

vi.mock("./data/quest-content", () => ({
  loadQuestContent: vi.fn(),
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

vi.mock("./state/coop-quest-context", () => ({
  CoopQuestProvider: ({ children }: { children: ReactNode }) => (
    <div data-coop-quest-provider>{children}</div>
  ),
}));

vi.mock("./state/quest-context", () => ({
  useQuest: vi.fn(),
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

vi.mock("./components/PoolViewer", () => ({
  PoolViewer: (props: PoolViewerMockProps) => poolViewerMock(props),
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
    screen: { type: "questStart" },
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

function makeQuestContent(): QuestContent {
  return {
    cardDatabase: new Map<number, CardData>(),
    dreamcallers: [],

    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: MINIMAL_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasConfig: MINIMAL_ATLAS_CONFIG,
  };
}

function setQuestState(state: QuestState): void {
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations: makeMutations(),
    cardDatabase: new Map<number, CardData>(),
    questContent: {
      cardDatabase: new Map(),
      dreamcallers: [],

      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: MINIMAL_DREAMSCAPES,
      affiliations: [],
      guides: [],
      atlasConfig: MINIMAL_ATLAS_CONFIG,
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
  vi.mocked(loadQuestContent).mockResolvedValue(makeQuestContent());
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
  it("routes loaded quest content through the coop room gate", async () => {
    setQuestState(makeState());

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
      container.querySelector("[data-coop-quest-provider]"),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("blocks room entry and provider registration when quest content loading fails", async () => {
    vi.mocked(loadQuestContent).mockRejectedValueOnce(
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

    expect(container.textContent).toContain("Quest content failed to load");
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

    expect(container.textContent).toContain("Firebase setup issue");
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
    expect(container.textContent).toContain("Firebase setup issue");
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

describe("QuestApp", () => {
  const starterCallerState = (
    overrides: Partial<QuestState> = {},
  ): QuestState =>
    makeState({
      deck: Array.from({ length: 10 }, (_, index) => ({
        entryId: `deck-${String(index + 1)}`,
        cardNumber: 711 + index,
        transfiguration: null,
        isBane: false,
      })),
      dreamcaller: {
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

  it("keeps the deck viewer and starting-deck modal closed before any dreamcaller is selected", () => {
    setQuestState(makeState());

    const { container, root } = mount(
      <QuestApp
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

  it("opens the starting-deck modal (not the full DeckViewer) immediately after a dreamcaller is picked", () => {
    setQuestState(starterCallerState());

    const { container, root } = mount(
      <QuestApp
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
    vi.mocked(useQuest).mockReturnValue({
      state: starterCallerState(),
      mutations,
      cardDatabase: new Map<number, CardData>(),
      questContent: {
        cardDatabase: new Map(),
        dreamcallers: [],

        dreamwellCards: [],
        dreamsignTemplates: [],
        dreamscapes: MINIMAL_DREAMSCAPES,
        affiliations: [],
        guides: [],
        atlasConfig: MINIMAL_ATLAS_CONFIG,
      },
    });

    const { root } = mount(
      <QuestApp
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
    setQuestState(starterCallerState({ hasSeenStartingDeckPopup: true }));

    const { root } = mount(
      <QuestApp
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

  it("opens and closes the Pool Viewer from Cumulus quest chrome", () => {
    setQuestState(starterCallerState({ hasSeenStartingDeckPopup: true }));

    const { container, root } = mount(
      <QuestApp
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
    setQuestState(
      makeState({
        atlas: {
          nodes: {
            "dreamscape-1": {
              id: "dreamscape-1",
              layer: LayerName.One,
              indexInLayer: 0,
              dreamscapeId: "test_dreamscape",
              biomeName: "Test Dreamscape",
              biomeColor: "#112233",
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
      <QuestApp
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
    setQuestState(
      makeState({
        atlas: {
          nodes: {
            "dreamscape-1": {
              id: "dreamscape-1",
              layer: LayerName.One,
              indexInLayer: 0,
              dreamscapeId: "test_dreamscape",
              biomeName: "Test Dreamscape",
              biomeColor: "#112233",
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
      <QuestApp
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
