// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestContent } from "./data/quest-content";
import { loadQuestContent } from "./data/quest-content";
import { getFirebaseDatabase } from "./firebase/app-config";
import type { CardData } from "./types/cards";
import type { QuestMutations } from "./state/quest-context";
import type { QuestState } from "./types/quest";
import type { RoomSession } from "./multiplayer/room-types";
import App, { QuestApp } from "./App";
import { useQuest } from "./state/quest-context";

vi.mock("./data/quest-content", () => ({
  loadQuestContent: vi.fn(),
}));

vi.mock("./firebase/app-config", () => ({
  getFirebaseDatabase: vi.fn(),
}));

vi.mock("./multiplayer/MultiplayerRoomGate", () => ({
  MultiplayerRoomGate: ({
    gameId,
    children,
  }: {
    gameId: string | null;
    children: (session: RoomSession) => ReactNode;
  }) => {
    const session: RoomSession = {
      roomId: gameId ?? "created-room",
      clientId: "client-test",
      room: {
        metadata: {
          schemaVersion: 2,
          createdAt: "2026-05-08T00:00:00.000Z",
          updatedAt: "2026-05-08T00:00:00.000Z",
        },
        questState: null,
        battleState: null,
        presence: {
          "client-test": {
            connected: true,
            lastSeenAt: "2026-05-08T00:00:00.000Z",
          },
        },
        actionLog: {},
      },
    };

    return <div data-room-gate={gameId ?? "create"}>{children(session)}</div>;
  },
}));

vi.mock("./state/multiplayer-quest-context", () => ({
  MultiplayerQuestProvider: ({ children }: { children: ReactNode }) => (
    <div data-multiplayer-provider>{children}</div>
  ),
}));

vi.mock("./state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("./components/ScreenRouter", () => ({
  ScreenRouter: () => <div>Screen Router</div>,
}));

interface HudMockProps {
  onOpenPoolViewer: () => void;
}

vi.mock("./components/HUD", () => ({
  HUD: ({ onOpenPoolViewer }: HudMockProps) => (
    <button type="button" data-testid="hud" onClick={onOpenPoolViewer}>
      HUD
    </button>
  ),
}));

interface DeckViewerMockProps {
  isOpen: boolean;
  onClose: () => void;
}

const deckViewerMock = vi.fn<(props: DeckViewerMockProps) => ReactNode>(
  ({ isOpen }) => (
    <div data-deck-open={String(isOpen)}>Deck Viewer</div>
  ),
);

vi.mock("./components/DeckViewer", () => ({
  DeckViewer: (props: DeckViewerMockProps) => deckViewerMock(props),
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

interface StartingDeckModalMockProps {
  isOpen: boolean;
  onClose: () => void;
}

const startingDeckModalMock = vi.fn<
  (props: StartingDeckModalMockProps) => ReactNode
>(({ isOpen }) => (
  <div data-starting-deck-open={String(isOpen)}>Starting Deck Modal</div>
));

vi.mock("./components/StartingDeckModal", () => ({
  StartingDeckModal: (props: StartingDeckModalMockProps) =>
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
    screen: { type: "questStart" },
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

function makeQuestContent(): QuestContent {
  return {
    cardDatabase: new Map<number, CardData>(),
    dreamcallers: [],
    dreamsignTemplates: [],
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
      dreamsignTemplates: [],
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
  vi.mocked(getFirebaseDatabase).mockReturnValue({} as ReturnType<
    typeof getFirebaseDatabase
  >);
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("App", () => {
  it("routes loaded quest content through the multiplayer room gate", async () => {
    setQuestState(makeState());

    const { container, root } = mount(
      <App
        runtimeConfig={{
          seedOverride: null,
          startInBattle: false,
          gameId: "ab12cd",
          databaseMode: "emulator",
        }}
      />,
    );

    await flushAppEffects();

    expect(getFirebaseDatabase).toHaveBeenCalledWith("emulator");
    expect(container.querySelector("[data-room-gate='ab12cd']")).not.toBeNull();
    expect(container.querySelector("[data-multiplayer-provider]")).not.toBeNull();

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
          startInBattle: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    await flushAppEffects();

    expect(container.textContent).toContain("Firebase setup issue");
    expect(container.textContent).toContain("Missing VITE_FIREBASE_DATABASE_URL");
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
          startInBattle: false,
          gameId: null,
          databaseMode: "realtime",
        }}
      />,
    );

    await flushAppEffects();

    expect(getFirebaseDatabase).toHaveBeenCalledWith("realtime");
    expect(container.textContent).toContain("Firebase setup issue");
    expect(container.textContent).toContain("Missing VITE_FIREBASE_DATABASE_URL");
    expect(container.textContent).toContain("Required env: VITE_FIREBASE_API_KEY");

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
          startInBattle: false,
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
    // The dreamcaller-selection screen suppresses the HUD; the deck button is
    // therefore unavailable so neither overlay should be open here.
    expect(container.querySelector("[data-testid='hud']")).toBeNull();

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
          startInBattle: false,
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
    // The HUD is layered behind the modal so the dreamscape remains visible
    // alongside the starting-deck preview.
    expect(container.querySelector("[data-testid='hud']")).not.toBeNull();

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
        dreamsignTemplates: [],
      },
    });

    const { root } = mount(
      <QuestApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          startInBattle: false,
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
          startInBattle: false,
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

  it("opens and closes the Pool Viewer from the HUD entry point", () => {
    setQuestState(starterCallerState({ hasSeenStartingDeckPopup: true }));

    const { container, root } = mount(
      <QuestApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          startInBattle: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    expect(poolViewerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    );

    act(() => {
      container.querySelector<HTMLButtonElement>("[data-testid='hud']")?.click();
    });
    expect(poolViewerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: true }),
    );

    act(() => {
      container.querySelector<HTMLButtonElement>("[data-pool-open='true']")?.click();
    });
    expect(poolViewerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    );

    act(() => {
      root.unmount();
    });
  });

  it("invokes the start-in-battle bootstrap when startInBattle is set", () => {
    const mutations = makeMutations();
    vi.mocked(useQuest).mockReturnValue({
      state: makeState(),
      mutations,
      cardDatabase: new Map<number, CardData>(),
      questContent: {
        cardDatabase: new Map(),
        dreamcallers: [],
        dreamsignTemplates: [],
      },
    });

    const { root } = mount(
      <QuestApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          startInBattle: true,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    expect(mutations.bootstrapStartInBattle).toHaveBeenCalledOnce();

    act(() => {
      root.unmount();
    });
  });

  it("does not invoke the playable-battle bootstrap when startInBattle is false", () => {
    const mutations = makeMutations();
    vi.mocked(useQuest).mockReturnValue({
      state: makeState(),
      mutations,
      cardDatabase: new Map<number, CardData>(),
      questContent: {
        cardDatabase: new Map(),
        dreamcallers: [],
        dreamsignTemplates: [],
      },
    });

    const { root } = mount(
      <QuestApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          startInBattle: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    expect(mutations.bootstrapStartInBattle).not.toHaveBeenCalled();
    expect(mutations.setScreen).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("hides the shared HUD on battle sites so the battle dock stays usable", () => {
    setQuestState(
      makeState({
        atlas: {
          nodes: {
            "dreamscape-1": {
              id: "dreamscape-1",
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
              status: "available",
              enhancedSiteType: null,
            },
          },
          edges: [],
          startingNodeId: "dreamscape-1",
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
          startInBattle: false,
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
