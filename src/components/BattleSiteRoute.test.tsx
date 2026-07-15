// @vitest-environment jsdom

import { StrictMode, act, type ReactElement } from "react";
import { MINIMAL_ATLAS_CONFIG, MINIMAL_DREAMSCAPES } from "../__test-helpers__/atlas-fixtures";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { BattleSiteRoute } from "./BattleSiteRoute";
import type { CoopActions } from "../coop/actions";
import { createDefaultState, useQuest } from "../state/quest-context";
import type { FoldState } from "../rules/fold-state";
import type { CardSourceDebugState, Screen, SiteState } from "../types/quest";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../battle/test-support";
import { createBattleInit } from "../battle/integration/create-battle-init";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import { emptyDawnFired } from "../rules/battle/fold";

vi.mock("../state/quest-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/quest-context")>()),
  useQuest: vi.fn(),
}));

let mockGameState: FoldState;
const mockActions: CoopActions = {} as CoopActions;
const beginBattleSpy = vi.fn(() => Promise.resolve(0));

vi.mock("../coop/hooks", () => ({
  useGameState: () => mockGameState,
  useActions: () => mockActions,
}));

vi.mock("../battle/components/BattleStartScreen", () => ({
  BattleStartScreen: ({
    init,
    onBegin,
  }: {
    init: { battleId: string };
    onBegin: () => void;
  }) => (
    <div data-screen="battle-start" data-battle-id={init.battleId}>
      <button type="button" data-begin="" onClick={onBegin}>
        Begin Battle
      </button>
    </div>
  ),
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
    PlayableBattleScreen: ({ uiVariant }: { uiVariant: "cumulus" | "legacy" }) => {
      const gameState = useGameState();
      const battle = gameState.battle;
      if (battle === null) {
        return null;
      }
      return (
        <div
          data-screen={`${uiVariant}-playable`}
          data-battle-id={battle.board.battleId}
        >
          {battle.init.battleEntryKey}
        </div>
      );
    },
  };
});

const roots: Root[] = [];

function makeSite(): SiteState {
  return {
    id: "site-7",
    type: "Battle",
    isEnhanced: false,
    isVisited: false,
  };
}

function makeFoldStateWithBattle(): FoldState {
  const init = createBattleInit({
    battleEntryKey: "site-7::3::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
    dreamwellCards: [],
    seedOverride: 1234,
  });
  const board = createInitialBattleState(init);
  return {
    quest: makeQuestState(),
    battle: {
      init,
      board,
      effectQueue: [],
      pendingPrompt: null,
      dawnFired: emptyDawnFired(),
    },
  };
}

function makeQuestState(overrides: {
  atlasStartingNodeId?: string;
  cardSourceDebug?: CardSourceDebugState | null;
  completionLevel?: number;
  currentDreamscape?: string | null;
  screen?: Screen;
  visitedSites?: string[];
} = {}) {
  const {
    atlasStartingNodeId = "",
    cardSourceDebug = null,
    completionLevel = 3,
    currentDreamscape = "dreamscape-2",
    screen = { type: "site", siteId: "site-7" } as Screen,
    visitedSites = [] as string[],
  } = overrides;
  const battleState = makeBattleTestState();
  return {
    ...createDefaultState(),
    ...battleState,
    runId: "quest:test",
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

function setQuestState(
  overrides: Parameters<typeof makeQuestState>[0] = {},
): void {
  vi.mocked(useQuest).mockReturnValue({
    state: makeQuestState(overrides),
    mutations: {} as ReturnType<typeof useQuest>["mutations"],
    cardDatabase: makeBattleTestCardDatabase(),
    questContent: {
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: MINIMAL_DREAMSCAPES,
      affiliations: [],
      guides: [],
      atlasConfig: MINIMAL_ATLAS_CONFIG,
    },
  } as unknown as ReturnType<typeof useQuest>);
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
    root.render(element);
  });
  return { container, root };
}

beforeEach(() => {
  vi.clearAllMocks();
  setQuestState();
  mockGameState = { quest: makeQuestState(), battle: null };
  (mockActions as unknown as { beginBattle: typeof beginBattleSpy }).beginBattle = beginBattleSpy;
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
          basicAutomation: false,
          gameId: "9a9qfv",
          databaseMode: "emulator",
          journeyVariant: "classic",
          uiVariant: "cumulus",
        }}
      />,
    );

    expect(container.querySelector('[data-screen="cumulus-playable"]')).not.toBeNull();
    expect(container.querySelector('[data-screen="cumulus-battle-start"]')).toBeNull();
    expect(beginBattleSpy).not.toHaveBeenCalled();
  });

  it("serves the Cumulus Battle Start preview before BEGIN_BATTLE folds", () => {
    const { container, root } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          basicAutomation: false,
          gameId: null,
          databaseMode: "emulator",
          journeyVariant: "classic",
          uiVariant: "cumulus",
        }}
      />,
    );

    expect(container.querySelector('[data-screen="cumulus-battle-start"]')).not.toBeNull();
    expect(container.querySelector('[data-screen="battle-start"]')).toBeNull();
    expect(container.querySelector("[data-cumulus-quest-chrome]")).not.toBeNull();
    expect(beginBattleSpy).not.toHaveBeenCalled();
    act(() => {
      container.querySelector<HTMLButtonElement>("[data-cumulus-begin]")?.click();
    });
    expect(beginBattleSpy).toHaveBeenCalledWith("site-7", false);

    mockGameState = makeFoldStateWithBattle();
    act(() => {
      root.render(
        <BattleSiteRoute
          site={makeSite()}
          cardDatabase={makeBattleTestCardDatabase()}
          runtimeConfig={{
            seedOverride: null,
            aiMode: false,
            basicAutomation: false,
            gameId: null,
            databaseMode: "emulator",
            journeyVariant: "classic",
            uiVariant: "cumulus",
          }}
        />,
      );
    });
    expect(container.querySelector('[data-screen="cumulus-playable"]')).not.toBeNull();
    expect(container.querySelector('[data-screen="legacy-playable"]')).toBeNull();
    expect(container.querySelector("[data-cumulus-quest-chrome]")).toBeNull();
    expect(container.querySelector("[data-quest-status-bar-anchor]")).toBeNull();
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
          basicAutomation: false,
          gameId: null,
          databaseMode: "emulator",
          journeyVariant: "classic",
          uiVariant: "cumulus",
          gotoScene: "battle-playable",
        }}
      />,
    );

    expect(container.querySelector('[data-screen="cumulus-playable"]')).not.toBeNull();
    expect(container.querySelector('[data-screen="cumulus-battle-start"]')).toBeNull();
    expect(container.querySelector("[data-cumulus-quest-chrome]")).toBeNull();
  });

  it("renders the legacy preview and appends BEGIN_BATTLE only after the click", () => {
    const { container } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          basicAutomation: false,
          gameId: null,
          databaseMode: "emulator",
          journeyVariant: "classic",
          uiVariant: "legacy",
        }}
      />,
    );

    expect(container.querySelector('[data-screen="legacy-playable"]')).toBeNull();
    expect(container.querySelector('[data-screen="battle-start"]')).not.toBeNull();
    expect(beginBattleSpy).not.toHaveBeenCalled();
    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-begin]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(beginBattleSpy).toHaveBeenCalledWith("site-7", false);
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
            basicAutomation: false,
            gameId: null,
            databaseMode: "emulator",
            journeyVariant: "classic",
            uiVariant: "legacy",
          }}
        />
      </StrictMode>,
    );

    expect(beginBattleSpy).not.toHaveBeenCalled();
    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-begin]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(beginBattleSpy).toHaveBeenCalledTimes(1);
  });

  it("switches from the legacy preview when BEGIN_BATTLE enters the fold", () => {
    const { container, root } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          basicAutomation: false,
          gameId: null,
          databaseMode: "emulator",
          journeyVariant: "classic",
          uiVariant: "legacy",
        }}
      />,
    );

    // The opposing Dreamcaller is revealed before the playable surface mounts.
    const startScreen = container.querySelector('[data-screen="battle-start"]');
    expect(startScreen).not.toBeNull();
    expect(startScreen?.getAttribute("data-battle-id")).toContain("site-7::3::dreamscape-2");
    expect(container.querySelector('[data-screen="legacy-playable"]')).toBeNull();
    expect(beginBattleSpy).not.toHaveBeenCalled();

    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-begin]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(beginBattleSpy).toHaveBeenCalledWith("site-7", false);

    mockGameState = makeFoldStateWithBattle();
    act(() => {
      root.render(
        <BattleSiteRoute
          site={makeSite()}
          cardDatabase={makeBattleTestCardDatabase()}
          runtimeConfig={{
            seedOverride: null,
            aiMode: false,
            basicAutomation: false,
            gameId: null,
            databaseMode: "emulator",
            journeyVariant: "classic",
            uiVariant: "legacy",
          }}
        />,
      );
    });

    const screen = container.querySelector('[data-screen="legacy-playable"]');
    expect(screen).not.toBeNull();
    expect(screen?.textContent).toBe("site-7::3::dreamscape-2");
    expect(screen?.getAttribute("data-battle-id")).toBe(
      mockGameState.battle?.board.battleId,
    );
  });

  it("returns to the Battle Start preview after the folded battle is cleared", () => {
    mockGameState = makeFoldStateWithBattle();
    setQuestState({ completionLevel: 3 });
    const { container, root } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          aiMode: false,
          basicAutomation: false,
          gameId: null,
          databaseMode: "emulator",
          journeyVariant: "classic",
          uiVariant: "legacy",
        }}
      />,
    );

    expect(
      container.querySelector('[data-screen="legacy-playable"]')?.textContent,
    ).toBe("site-7::3::dreamscape-2");

    mockGameState = { quest: makeQuestState({ completionLevel: 4 }), battle: null };
    setQuestState({ completionLevel: 4 });
    act(() => {
      root.render(
        <BattleSiteRoute
          site={makeSite()}
          cardDatabase={makeBattleTestCardDatabase()}
          runtimeConfig={{
            seedOverride: null,
            aiMode: false,
            basicAutomation: false,
            gameId: null,
            databaseMode: "emulator",
            journeyVariant: "classic",
            uiVariant: "legacy",
          }}
        />,
      );
    });

    expect(
      container.querySelector('[data-screen="battle-start"]'),
    ).not.toBeNull();
  });
});
