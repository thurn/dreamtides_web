// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { economyFixture } from "./testing/economy-fixture";
import { opponentsFixture } from "./testing/opponents-fixture";
import { draftDataFixture } from "./testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "./testing/config-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
  MINIMAL_SITES_DATA,
} from "./testing/atlas-fixtures";
import { CumulusRoot } from "./cumulus/CumulusRoot";
import type { JourneyContent } from "./data/journey-content";
import { loadJourneyContent } from "./data/journey-content";
import { useLocalGame } from "./session/use-local-game";
import type { CardData } from "./types/cards";
import type { JourneyMutations } from "./state/journey-context";
import type { JourneyState } from "./types/journey";
import App, { JourneyApp } from "./App";
import { useJourney } from "./state/journey-context";
import { registerGameProviders } from "./session/providers/register-game-providers";
import {
  parseDeckEntryId,
  parseJourneyId,
  parseRoomId,
} from "./types/identifiers";
import { testAvatarId, testJourneySeed } from "./types/test-identities";

vi.mock("./data/journey-content", () => ({
  AFFINITY_GROWN_POOL_VARIANTS: new Set<string>(),
  buildAvatarProvenance: vi.fn(() => null),
  buildAvatarSeedProvenance: vi.fn(() => null),
  buildAvatarTides4Provenance: vi.fn(() => null),
  loadJourneyContent: vi.fn(),
  poolVariantNeedsTides4: vi.fn(() => false),
}));
vi.mock("./data/tutorial-actions", async () => {
  const { makeTutorialConfiguration } = await import(
    "./testing/tutorial-configuration-fixture"
  );
  return {
    tutorialStarterDeckSize: (battle: {
      starterDeck: readonly { copies: number }[];
    }) => battle.starterDeck.reduce((total, entry) => total + entry.copies, 0),
    loadTutorialConfiguration: vi.fn(() => makeTutorialConfiguration()),
  };
});

vi.mock("./session/use-local-game", () => ({
  useLocalGame: vi.fn(() => ({
    status: { kind: "ready", game: {} },
    createNewGame: vi.fn(),
  })),
}));

vi.mock("./session/hooks", () => ({
  LocalGameProvider: ({ children }: { children: ReactNode }) => (
    <div data-local-game-provider>{children}</div>
  ),
  useConfirmedHead: () => 0,
}));

vi.mock("./session/providers/register-game-providers", () => ({
  registerGameProviders: vi.fn(),
}));

vi.mock("./state/game-journey-context", () => ({
  GameJourneyProvider: ({ children }: { children: ReactNode }) => (
    <div data-game-journey-provider>{children}</div>
  ),
}));

vi.mock("./state/front-door-context", () => ({
  FrontDoorProvider: ({ children }: { children: ReactNode }) => children,
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

interface OverlayMockProps {
  isOpen: boolean;
  onClose: () => void;
}

const deckViewerMock = vi.fn<(props: OverlayMockProps) => ReactNode>(
  ({ isOpen }) => <div data-deck-open={String(isOpen)} />,
);

vi.mock("./screens/cumulus_adapters/DesktopDeckViewerAdapter", () => ({
  DesktopDeckViewerAdapter: (props: OverlayMockProps) => deckViewerMock(props),
}));

const poolViewerMock = vi.fn<(props: OverlayMockProps) => ReactNode>(
  ({ isOpen, onClose }) => (
    <button type="button" data-pool-open={String(isOpen)} onClick={onClose} />
  ),
);

vi.mock("./screens/cumulus_adapters/PoolViewerAdapter", () => ({
  PoolViewerAdapter: (props: OverlayMockProps) => poolViewerMock(props),
}));

const startingDeckModalMock = vi.fn<(props: OverlayMockProps) => ReactNode>(
  ({ isOpen }) => <div data-starting-deck-open={String(isOpen)} />,
);

vi.mock("./screens/cumulus_adapters/StartingDeckOverlayAdapter", () => ({
  StartingDeckOverlayAdapter: (props: OverlayMockProps) =>
    startingDeckModalMock(props),
}));

vi.mock("./screens/DebugScreen", () => ({
  DebugScreen: () => <div />,
}));

vi.mock("./screens/CardSourceOverlay", () => ({
  CardSourceOverlay: () => <div />,
}));

/** Every mutation is a lazily created spy, so the shell may call any intent. */
function makeMutations(): JourneyMutations {
  const spies = new Map<string, ReturnType<typeof vi.fn>>();
  return new Proxy({} as JourneyMutations, {
    get(_target, key) {
      if (typeof key !== "string" || key === "then" || key === "toJSON") {
        return undefined;
      }
      const spy = spies.get(key) ?? vi.fn();
      spies.set(key, spy);
      return spy;
    },
  });
}

function makeState(overrides: Partial<JourneyState> = {}): JourneyState {
  return {
    runId: parseJourneyId("journey:test"),
    seed: testJourneySeed("test-seed"),
    essence: 250,
    maxDreamsigns: 12,
    deck: [],
    avatar: null,
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [],
    completionLevel: 0,
    atlas: {
      nodes: {},
      startingNodeId: null,
      bossNodeId: null,
      currentNodeId: null,
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
      freeNextShopModifiers: [],
      freePurchaseModifiers: [],
    },
    siteOfferModifiers: [],
    dreamscapeModifiers: [],
    ...overrides,
  };
}

/** A journey whose avatar was just picked, with its starter deck dealt. */
function starterCallerState(
  overrides: Partial<JourneyState> = {},
): JourneyState {
  return makeState({
    deck: Array.from({ length: 10 }, (_, index) => ({
      entryId: parseDeckEntryId(`deck-${String(index + 1)}`),
      cardNumber: 711 + index,
      transfiguration: null,
      isBane: false,
    })),
    avatar: {
      id: testAvatarId("caller-1"),
      name: "Starter Caller",
      title: "Of the First Hand",
      renderedText: "Pick your path.",
      imageNumber: "0004",
      startingEssence: 250,
    },
    screen: { type: "dreamscape" },
    ...overrides,
  });
}

function makeJourneyContent(): JourneyContent {
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase: new Map<number, CardData>(),
    avatars: [],
    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: MINIMAL_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
  };
}

function setJourneyState(
  state: JourneyState,
  mutations: JourneyMutations = makeMutations(),
): void {
  vi.mocked(useJourney).mockReturnValue({
    state,
    mutations,
    cardDatabase: new Map<number, CardData>(),
    journeyContent: makeJourneyContent(),
  });
}

const roots: Root[] = [];

function mount(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return container;
}

function mountJourneyApp(): HTMLDivElement {
  return mount(
    <JourneyApp
      cardDatabase={new Map()}
      runtimeConfig={{ seedOverride: null, aiMode: false, gameId: null }}
    />,
  );
}

function lastOpenState(mock: typeof startingDeckModalMock): boolean | undefined {
  return mock.mock.lastCall?.[0].isOpen;
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
  vi.mocked(loadJourneyContent).mockReturnValue(makeJourneyContent());
  // Report a desktop viewport so `useIsDesktop` selects the desktop deck
  // viewer that `deckViewerMock` stands in for.
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
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("routes loaded journey content into the selected local game", async () => {
    setJourneyState(makeState());
    const container = mount(
      <App
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: parseRoomId("ab12cd"),
        }}
      />,
    );
    await flushAppEffects();

    expect(vi.mocked(useLocalGame).mock.calls[0]?.[0].gameId).toBe("ab12cd");
    expect(registerGameProviders).toHaveBeenCalled();
    expect(container.querySelector("[data-local-game-provider]")).not.toBeNull();
    expect(container.querySelector("[data-game-journey-provider]")).not.toBeNull();
  });

  it("blocks game entry and provider registration when journey content loading fails", async () => {
    vi.mocked(loadJourneyContent).mockImplementationOnce(() => {
      throw new Error("Failed to load draft records: 503 Test Failure");
    });
    const container = mount(
      <App
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: parseRoomId("ab12cd"),
        }}
      />,
    );
    await flushAppEffects();

    expect(
      container.querySelector('[data-application-state="recoverableError"]'),
    ).not.toBeNull();
    expect(useLocalGame).not.toHaveBeenCalled();
    expect(container.querySelector("[data-local-game-provider]")).toBeNull();
    expect(registerGameProviders).not.toHaveBeenCalled();
  });
});

describe("JourneyApp", () => {
  it("shows the starting-deck modal only once an avatar is picked and until it is seen", () => {
    const cases: ReadonlyArray<readonly [JourneyState, boolean]> = [
      [makeState(), false],
      [starterCallerState(), true],
      [starterCallerState({ hasSeenStartingDeckPopup: true }), false],
    ];
    for (const [state, modalOpen] of cases) {
      setJourneyState(state);
      const container = mountJourneyApp();
      expect(
        container.querySelector("[data-testid='cumulus-screen-router']"),
      ).not.toBeNull();
      expect(lastOpenState(startingDeckModalMock)).toBe(modalOpen);
      // The starter reveal is the lightweight modal; the full deck viewer
      // stays closed so the dreamscape behind remains visible.
      expect(lastOpenState(deckViewerMock)).toBe(false);
    }
  });

  it("dispatches dismissStartingDeckPopup when the starting-deck modal closes", () => {
    const mutations = makeMutations();
    setJourneyState(starterCallerState(), mutations);
    mountJourneyApp();

    const props = startingDeckModalMock.mock.lastCall?.[0];
    if (props === undefined) throw new Error("expected the starting-deck modal");
    act(() => props.onClose());
    expect(mutations.dismissStartingDeckPopup).toHaveBeenCalledTimes(1);
  });

  it("opens and closes the Pool Viewer from Cumulus journey chrome", () => {
    setJourneyState(starterCallerState({ hasSeenStartingDeckPopup: true }));
    const container = mountJourneyApp();
    expect(lastOpenState(poolViewerMock)).toBe(false);

    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-testid='cumulus-open-pool']")
        ?.click();
    });
    expect(lastOpenState(poolViewerMock)).toBe(true);

    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-pool-open='true']")
        ?.click();
    });
    expect(lastOpenState(poolViewerMock)).toBe(false);
  });
});
