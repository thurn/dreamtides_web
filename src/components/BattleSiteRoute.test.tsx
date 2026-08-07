// @vitest-environment jsdom

import { StrictMode, act, type ReactElement } from "react";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
} from "../__test-helpers__/atlas-fixtures";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { BattleSiteRoute } from "./BattleSiteRoute";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import type { CoopActions } from "../coop/actions";
import { createDefaultState, useJourney } from "../state/journey-context";
import type { FoldState } from "../rules/fold-state";
import type { CardSourceDebugState, Screen, SiteState } from "../types/journey";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamAvatars,
  makeBattleTestSite,
  makeBattleTestState,
} from "../battle/test-support";
import { createTestBattleInit } from "../testing/create-battle-init";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import { emptyDawnFired } from "../rules/battle/fold";

vi.mock("../state/journey-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/journey-context")>()),
  useJourney: vi.fn(),
}));

let mockGameState: FoldState;
const mockActions: CoopActions = {} as CoopActions;
const beginBattleSpy = vi.fn(() => Promise.resolve(0));

vi.mock("../coop/hooks", () => ({
  useGameState: () => mockGameState,
  useActions: () => mockActions,
}));

vi.mock("../screens/cumulus_adapters/BattleStartScreenAdapter", () => ({
  BattleStartScreenAdapter: ({
    init,
    onBegin,
  }: {
    init: { battleId: string };
    onBegin: () => void;
  }) => (
    <div data-screen="cumulus-battle-start" data-battle-id={init.battleId}>
      <button type="button" data-cumulus-begin="" onClick={onBegin}>
        Begin Battle
      </button>
    </div>
  ),
}));

vi.mock("../battle/components/PlayableBattleScreen", async () => {
  const { useGameState } = await import("../coop/hooks");
  return {
    PlayableBattleScreen: () => {
      const gameState = useGameState();
      const battle = gameState.battle;
      if (battle === null) {
        return null;
      }
      return (
        <div
          data-screen="cumulus-playable"
          data-battle-id={battle.board.battleId}
        >
          {battle.init.battleEntryKey}
        </div>
      );
    },
  };
});

const roots: Root[] = [];

function stubViewport(isDesktop: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width") ? isDesktop : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function makeSite(): SiteState {
  return {
    id: "site-7",
    type: "Battle",
    isEnhanced: false,
    isVisited: false,
  };
}

function makeFoldStateWithBattle(): FoldState {
  const init = createTestBattleInit({
    battleEntryKey: "site-7::3::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamAvatars: makeBattleTestDreamAvatars(),
    dreamwellCards: [],
    seedOverride: 1234,
  });
  const board = createInitialBattleState(init);
  return {
    frontDoor: { phase: "main", journeyId: null, tutorial: null },
    journey: makeJourneyState(),
    battle: {
      init,
      board,
      effectQueue: [],
      pendingPrompt: null,
      dawnFired: emptyDawnFired(),
    },
  };
}

function makeJourneyState(
  overrides: {
    atlasStartingNodeId?: string;
    cardSourceDebug?: CardSourceDebugState | null;
    completionLevel?: number;
    currentDreamscape?: string | null;
    screen?: Screen;
    visitedSites?: string[];
  } = {},
) {
  const {
    atlasStartingNodeId = "",
    cardSourceDebug = null,
    completionLevel = 3,
    currentDreamscape = "dreamscape-2",
    screen = { type: "site", siteId: "site-7" },
    visitedSites = [] as string[],
  } = overrides;
  const battleState = makeBattleTestState();
  return {
    ...createDefaultState(),
    ...battleState,
    runId: "journey:test",
    essence: 250,
    cardSourceDebug,
    completionLevel,
    atlas: {
      ...battleState.atlas,
      startingNodeId: atlasStartingNodeId,
      bossNodeId: atlasStartingNodeId,
      currentNodeId: atlasStartingNodeId,
    },
    currentDreamscape,
    visitedSites,
    screen,
    activeSiteId: "site-7",
  };
}

function setJourneyState(
  overrides: Parameters<typeof makeJourneyState>[0] = {},
): void {
  vi.mocked(useJourney).mockReturnValue({
    state: makeJourneyState(overrides),
    mutations: {} as ReturnType<typeof useJourney>["mutations"],
    cardDatabase: makeBattleTestCardDatabase(),
    journeyContent: {
      ...CONFIG_DATA_FIXTURE,
      draftData: draftDataFixture(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamAvatars: makeBattleTestDreamAvatars(),
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: MINIMAL_DREAMSCAPES,
      affiliations: [],
      guides: [],
      atlasData: MINIMAL_ATLAS_DATA,
      economyData: economyFixture(),
      opponentsData: opponentsFixture(),
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
  roots.push(root);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return { container, root };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubViewport(true);
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  setJourneyState();
  mockGameState = {
    frontDoor: { phase: "main", journeyId: null, tutorial: null },
    journey: makeJourneyState(),
    battle: null,
  };
  (
    mockActions as unknown as { beginBattle: typeof beginBattleSpy }
  ).beginBattle = beginBattleSpy;
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

describe("BattleSiteRoute", () => {
  it("opens the playable surface on mount when the folded battle already exists", () => {
    mockGameState = makeFoldStateWithBattle();
    const { container } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: "9a9qfv",
          databaseMode: "emulator",
        }}
      />,
    );

    expect(
      container.querySelector('[data-screen="cumulus-playable"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-screen="cumulus-battle-start"]'),
    ).toBeNull();
    expect(beginBattleSpy).not.toHaveBeenCalled();
  });

  it("serves the seeded Cumulus Battle Start preview before BEGIN_BATTLE folds", () => {
    const { container, root } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: 4242,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    expect(
      container.querySelector('[data-screen="cumulus-battle-start"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-cumulus-journey-chrome]"),
    ).not.toBeNull();
    expect(beginBattleSpy).not.toHaveBeenCalled();
    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-cumulus-begin]")
        ?.click();
    });
    expect(beginBattleSpy).toHaveBeenCalledWith("site-7", 4242);

    mockGameState = makeFoldStateWithBattle();
    act(() => {
      root.render(
        <CumulusRoot>
          <BattleSiteRoute
            site={makeSite()}
            cardDatabase={makeBattleTestCardDatabase()}
            runtimeConfig={{
              seedOverride: null,
              aiMode: false,
              gameId: null,
              databaseMode: "emulator",
            }}
          />
        </CumulusRoot>,
      );
    });
    expect(
      container.querySelector('[data-screen="cumulus-playable"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-cumulus-journey-chrome]"),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-journey-status-bar-variant="battle"]'),
    ).not.toBeNull();
    expect(container.querySelector('[aria-label^="View deck"]')).toBeNull();
    expect(container.querySelector('[aria-label="DreamAvatar"]')).toBeNull();
  });

  it("opens the Cumulus playable surface when the playable QA scene loads a battle", () => {
    mockGameState = makeFoldStateWithBattle();
    const { container } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
          gotoScene: "battle-playable",
        }}
      />,
    );

    expect(
      container.querySelector('[data-screen="cumulus-playable"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-screen="cumulus-battle-start"]'),
    ).toBeNull();
    expect(
      container.querySelector("[data-cumulus-journey-chrome]"),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-journey-status-bar-variant="battle"]'),
    ).not.toBeNull();
  });

  it("omits the partial journey status bar from the mobile Cumulus battle", () => {
    stubViewport(false);
    mockGameState = makeFoldStateWithBattle();
    const { container } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    expect(
      container.querySelector('[data-screen="cumulus-playable"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();
  });

  it("renders the Cumulus preview and appends BEGIN_BATTLE only after the click", () => {
    const { container } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    expect(
      container.querySelector('[data-screen="cumulus-playable"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-screen="cumulus-battle-start"]'),
    ).not.toBeNull();
    expect(beginBattleSpy).not.toHaveBeenCalled();
    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-cumulus-begin]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(beginBattleSpy).toHaveBeenCalledWith("site-7");
  });

  it("does not append BEGIN_BATTLE during StrictMode mount effects", () => {
    const { container } = mount(
      <StrictMode>
        <BattleSiteRoute
          site={makeSite()}
          cardDatabase={makeBattleTestCardDatabase()}
          runtimeConfig={{
            seedOverride: null,
            aiMode: false,
            gameId: null,
            databaseMode: "emulator",
          }}
        />
      </StrictMode>,
    );

    expect(beginBattleSpy).not.toHaveBeenCalled();
    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-cumulus-begin]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(beginBattleSpy).toHaveBeenCalledTimes(1);
  });

  it("switches from the Cumulus preview when BEGIN_BATTLE enters the fold", () => {
    const { container, root } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    // The opposing DreamAvatar is revealed before the playable surface mounts.
    const startScreen = container.querySelector(
      '[data-screen="cumulus-battle-start"]',
    );
    expect(startScreen).not.toBeNull();
    expect(startScreen?.getAttribute("data-battle-id")).toContain(
      "site-7::3::dreamscape-2",
    );
    expect(
      container.querySelector('[data-screen="cumulus-playable"]'),
    ).toBeNull();
    expect(beginBattleSpy).not.toHaveBeenCalled();

    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-cumulus-begin]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(beginBattleSpy).toHaveBeenCalledWith("site-7");

    mockGameState = makeFoldStateWithBattle();
    act(() => {
      root.render(
        <BattleSiteRoute
          site={makeSite()}
          cardDatabase={makeBattleTestCardDatabase()}
          runtimeConfig={{
            seedOverride: null,
            aiMode: false,
            gameId: null,
            databaseMode: "emulator",
          }}
        />,
      );
    });

    const screen = container.querySelector('[data-screen="cumulus-playable"]');
    expect(screen).not.toBeNull();
    expect(screen?.textContent).toBe("site-7::3::dreamscape-2");
    expect(screen?.getAttribute("data-battle-id")).toBe(
      mockGameState.battle?.board.battleId,
    );
  });

  it("returns to the Battle Start preview after the folded battle is cleared", () => {
    mockGameState = makeFoldStateWithBattle();
    setJourneyState({ completionLevel: 3 });
    const { container, root } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: null,
          databaseMode: "emulator",
        }}
      />,
    );

    expect(
      container.querySelector('[data-screen="cumulus-playable"]')?.textContent,
    ).toBe("site-7::3::dreamscape-2");

    mockGameState = {
      frontDoor: { phase: "main", journeyId: null, tutorial: null },
      journey: makeJourneyState({ completionLevel: 4 }),
      battle: null,
    };
    setJourneyState({ completionLevel: 4 });
    act(() => {
      root.render(
        <BattleSiteRoute
          site={makeSite()}
          cardDatabase={makeBattleTestCardDatabase()}
          runtimeConfig={{
            seedOverride: null,
            aiMode: false,
            gameId: null,
            databaseMode: "emulator",
          }}
        />,
      );
    });

    expect(
      container.querySelector('[data-screen="cumulus-battle-start"]'),
    ).not.toBeNull();
  });

  it("does not show Battle Start while the completed battle route exits to the Atlas", () => {
    mockGameState = makeFoldStateWithBattle();
    const { container, root } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          gameId: "9a9qfv",
          databaseMode: "emulator",
        }}
      />,
    );

    expect(
      container.querySelector('[data-screen="cumulus-playable"]'),
    ).not.toBeNull();

    mockGameState = {
      frontDoor: { phase: "main", journeyId: null, tutorial: null },
      journey: makeJourneyState({
        completionLevel: 4,
        currentDreamscape: null,
        screen: { type: "atlas" },
        visitedSites: ["site-7"],
      }),
      battle: null,
    };
    setJourneyState({
      completionLevel: 4,
      currentDreamscape: null,
      screen: { type: "atlas" },
      visitedSites: ["site-7"],
    });
    act(() => {
      root.render(
        <BattleSiteRoute
          site={makeSite()}
          cardDatabase={makeBattleTestCardDatabase()}
          runtimeConfig={{
            seedOverride: null,
            aiMode: false,
            gameId: "9a9qfv",
            databaseMode: "emulator",
          }}
        />,
      );
    });

    expect(
      container.querySelector('[data-screen="cumulus-battle-start"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-screen="cumulus-playable"]'),
    ).toBeNull();
  });
});
