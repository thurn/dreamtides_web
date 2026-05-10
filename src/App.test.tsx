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

vi.mock("./components/HUD", () => ({
  HUD: () => <div data-testid="hud">HUD</div>,
}));

const deckViewerMock = vi.fn<
  (props: { introMode?: boolean; isOpen: boolean }) => ReactNode
>(({ isOpen, introMode }) => (
  <div
    data-deck-intro={String(Boolean(introMode))}
    data-deck-open={String(isOpen)}
  >
    Deck Viewer
  </div>
));

vi.mock("./components/DeckViewer", () => ({
  DeckViewer: (props: { isOpen: boolean }) => deckViewerMock(props),
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
    ensureEssenceSiteRuntime: vi.fn(),
    acceptEssenceSite: vi.fn(),
    ensureShopRuntime: vi.fn(),
    buyShopSlot: vi.fn(),
    rerollShop: vi.fn(),
    ensureCardChoiceRuntime: vi.fn(),
    acceptTransfigurationChoice: vi.fn(),
    acceptDuplicationChoice: vi.fn(),
    ensureDreamJourneyRuntime: vi.fn(),
    completeDreamJourneyOption: vi.fn(),
    ensureTemptingOfferRuntime: vi.fn(),
    completeTemptingOfferOption: vi.fn(),
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
    screen: { type: "questStart" },
    activeSiteId: null,
    failureSummary: null,
    ...overrides,
  };
}

function makeQuestContent(): QuestContent {
  return {
    cardDatabase: new Map<number, CardData>(),
    cardsByPackageTide: new Map(),
    dreamcallers: [],
    dreamsignTemplates: [],
    resolvedPackagesByDreamcallerId: new Map(),
  };
}

function setQuestState(state: QuestState): void {
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations: makeMutations(),
    cardDatabase: new Map<number, CardData>(),
    questContent: {
      cardDatabase: new Map(),
      cardsByPackageTide: new Map(),
      dreamcallers: [],
      dreamsignTemplates: [],
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
          enableAi: false,
          gameId: "ab12cd",
        }}
      />,
    );

    await flushAppEffects();

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
          enableAi: false,
          gameId: null,
        }}
      />,
    );

    await flushAppEffects();

    expect(container.textContent).toContain("Firebase setup issue");
    expect(container.textContent).toContain("Missing VITE_FIREBASE_DATABASE_URL");
    expect(container.textContent).toContain("Required env: VITE_FIREBASE_API_KEY");
    expect(container.querySelector("[data-room-gate]")).toBeNull();
    expect(container.querySelector("[data-multiplayer-provider]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});

describe("QuestApp", () => {
  it("does not auto-open the deck viewer after leaving quest start (FIND-01-6)", () => {
    setQuestState(makeState());

    const { root } = mount(
      <QuestApp
        cardDatabase={new Map()}
        runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
      />,
    );

    expect(deckViewerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    );

    setQuestState(
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
      }),
    );

    act(() => {
      root.render(
        <QuestApp
          cardDatabase={new Map()}
          runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
        />,
      );
    });

    // FIND-01-6 (Stage 4): player lands on the site screen unobstructed.
    // The deck viewer stays closed; View Deck on the HUD opens it on demand.
    expect(deckViewerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    );

    act(() => {
      root.unmount();
    });
  });

  it("invokes the playable-battle bootstrap when startInBattle is set", () => {
    const mutations = makeMutations();
    const dreamcaller = {
      id: "caller-1",
      name: "Test Caller",
      title: "Of Tests",
      renderedText: "Pick.",
      imageNumber: "0001",
      startingEssence: 250,
      mandatoryTides: ["tide_alpha"],
      optionalTides: ["tide_beta", "tide_gamma", "tide_delta", "tide_zeta"],
    };
    const resolvedPackage = {
      dreamcaller,
      mandatoryTides: ["tide_alpha"],
      optionalSubset: ["tide_beta", "tide_gamma", "tide_delta"],
      selectedTides: ["tide_alpha", "tide_beta", "tide_gamma", "tide_delta"],
      draftPoolCopiesByCard: { "101": 2 },
      dreamsignPoolIds: ["dreamsign-1"],
      mandatoryOnlyPoolSize: 12,
      draftPoolSize: 24,
      doubledCardCount: 1,
      legalSubsetCount: 4,
      preferredSubsetCount: 2,
    };
    vi.mocked(useQuest).mockReturnValue({
      state: makeState(),
      mutations,
      cardDatabase: new Map<number, CardData>(),
      questContent: {
        cardDatabase: new Map(),
        cardsByPackageTide: new Map(),
        dreamcallers: [dreamcaller],
        dreamsignTemplates: [
          {
            id: "dreamsign-1",
            name: "Echo Sign",
            effectDescription: "Test.",
            packageTides: ["tide_alpha"],
          },
        ],
        resolvedPackagesByDreamcallerId: new Map([
          [dreamcaller.id, resolvedPackage],
        ]),
      },
    });

    const { root } = mount(
      <QuestApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          startInBattle: true,
          enableAi: false,
          gameId: null,
        }}
      />,
    );

    expect(mutations.setDreamcallerSelection).toHaveBeenCalledOnce();

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
        cardsByPackageTide: new Map(),
        dreamcallers: [],
        dreamsignTemplates: [],
        resolvedPackagesByDreamcallerId: new Map(),
      },
    });

    const { root } = mount(
      <QuestApp
        cardDatabase={new Map()}
        runtimeConfig={{
          seedOverride: null,
          startInBattle: false,
          enableAi: false,
          gameId: null,
        }}
      />,
    );

    expect(mutations.setDreamcallerSelection).not.toHaveBeenCalled();
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
          nexusId: "dreamscape-1",
        },
        currentDreamscape: "dreamscape-1",
        screen: { type: "site", siteId: "site-1" },
        activeSiteId: "site-1",
      }),
    );

    const { container, root } = mount(
      <QuestApp
        cardDatabase={new Map()}
        runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
      />,
    );

    expect(container.querySelector('[data-testid="hud"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
