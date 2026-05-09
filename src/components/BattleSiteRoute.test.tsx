// @vitest-environment jsdom

import { act, StrictMode, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BattleSiteRoute,
  createBattleEntryKey,
} from "./BattleSiteRoute";
import {
  createPlayableBattleCache,
  PlayableBattleCacheProvider,
  type PlayableBattleCache,
} from "./playable-battle-cache";
import type { BattleMutableState } from "../battle/types";
import { useQuest } from "../state/quest-context";
import type { CardSourceDebugState, Screen, SiteState } from "../types/quest";

const routeLifecycle = vi.hoisted(() => ({
  battleInitCalls: 0,
  initialStateCalls: 0,
  playableStateSnapshots: [] as Array<{
    sides: {
      player: {
        hand: string[];
      };
    };
  }>,
}));

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../battle/integration/create-battle-init", () => ({
  createBattleInit: vi.fn(({ battleEntryKey }: { battleEntryKey: string }) => {
    routeLifecycle.battleInitCalls += 1;
    return {
      battleId: battleEntryKey,
      battleEntryKey,
      seed: 1000 + routeLifecycle.battleInitCalls,
      siteId: "site-7",
      dreamscapeId: "dreamscape-2",
      completionLevelAtStart: 3,
      isMiniboss: true,
      isFinalBoss: false,
      essenceReward: 250,
      openingHandSize: 5,
      scoreToWin: 25,
      turnLimit: 15,
      maxEnergyCap: 10,
      startingSide: "player",
      playerDrawSkipsTurnOne: true,
      enableAi: false,
      rewardOptions: [],
      playerDeckOrder: [],
      enemyDescriptor: {
        id: "enemy-1",
        name: "Mock Enemy",
        subtitle: "Test Only",
        portraitSeed: 1,
        tide: "Arc",
        abilityText: "Mock ability",
        dreamsignCount: 2,
      },
      enemyDeckDefinition: [],
      dreamcallerSummary: null,
      dreamsignSummaries: [],
      atlasSnapshot: {
        nodes: {},
        edges: [],
        nexusId: "",
      },
    };
  }),
}));

vi.mock("../battle/state/create-initial-state", () => ({
  createInitialBattleState: vi.fn(({ battleId }: { battleId: string }) => {
    routeLifecycle.initialStateCalls += 1;
    return {
      battleId,
      activeSide: "player",
      turnNumber: 1,
      phase: "main",
      result: null,
      forcedResult: null,
      nextBattleCardOrdinal: 1,
      sides: {
        player: {
          currentEnergy: 0,
          maxEnergy: 0,
          score: 0,
          pendingExtraTurns: 0,
          visibility: {},
          deck: [],
          hand: ["bc_0001"],
          void: [],
          banished: [],
          reserve: {
            R0: null,
            R1: null,
            R2: null,
            R3: null,
            R4: null,
          },
          deployed: {
            D0: null,
            D1: null,
            D2: null,
            D3: null,
          },
        },
        enemy: {
          currentEnergy: 0,
          maxEnergy: 0,
          score: 0,
          pendingExtraTurns: 0,
          visibility: {},
          deck: [],
          hand: [],
          void: [],
          banished: [],
          reserve: {
            R0: null,
            R1: null,
            R2: null,
            R3: null,
            R4: null,
          },
          deployed: {
            D0: null,
            D1: null,
            D2: null,
            D3: null,
          },
        },
      },
      cardInstances: {
        bc_0001: {
          battleCardId: "bc_0001",
          definition: {
            sourceDeckEntryId: "deck-1",
            cardNumber: 101,
            name: "Mock Card",
            battleCardKind: "character",
            subtype: "Echo",
            energyCost: 1,
            printedEnergyCost: 1,
            printedSpark: 2,
            isFast: false,
            tides: ["alpha"],
            renderedText: "Test text",
            imageNumber: 101,
            transfiguration: null,
            isBane: false,
          },
          owner: "player",
          controller: "player",
          sparkDelta: 0,
          isRevealedToPlayer: true,
          markers: { isPrevented: false, isCopied: false },
          notes: [],
          provenance: {
            kind: "quest-deck",
            sourceBattleCardId: null,
            chosenSpark: null,
            chosenSubtype: null,
            createdAtTurnNumber: null,
            createdAtSide: null,
            createdAtMs: null,
          },
        },
      },
    };
  }),
  cloneBattleMutableState: vi.fn((state: BattleMutableState) => ({
    ...state,
    sides: {
      player: {
        ...state.sides.player,
        deck: [...state.sides.player.deck],
        hand: [...state.sides.player.hand],
        void: [...state.sides.player.void],
        banished: [...state.sides.player.banished],
        reserve: { ...state.sides.player.reserve },
        deployed: { ...state.sides.player.deployed },
      },
      enemy: {
        ...state.sides.enemy,
        deck: [...state.sides.enemy.deck],
        hand: [...state.sides.enemy.hand],
        void: [...state.sides.enemy.void],
        banished: [...state.sides.enemy.banished],
        reserve: { ...state.sides.enemy.reserve },
        deployed: { ...state.sides.enemy.deployed },
      },
    },
    cardInstances: Object.fromEntries(
      Object.entries(state.cardInstances).map(([battleCardId, instance]) => [
        battleCardId,
        { ...instance },
      ]),
    ),
  })),
}));

vi.mock("../battle/components/PlayableBattleScreen", () => ({
  PlayableBattleScreen: ({
    battleInit,
    initialState,
  }: {
    battleInit: {
      battleEntryKey: string;
      seed: number;
    };
    initialState: {
      sides: {
        player: {
          hand: string[];
        };
      };
    };
  }) => {
    routeLifecycle.playableStateSnapshots.push(initialState);

    return (
      <div
        data-opening-hand={String(initialState.sides.player.hand.length)}
        data-screen="playable"
        data-seed={String(battleInit.seed)}
      >
        {battleInit.battleEntryKey}
      </div>
    );
  },
}));

function makeSite(): SiteState {
  return {
    id: "site-7",
    type: "Battle",
    isEnhanced: false,
    isVisited: false,
  };
}

function setQuestState({
  atlasNexusId = "",
  cardSourceDebug = null,
  completionLevel = 3,
  currentDreamscape = "dreamscape-2",
  screen = { type: "site", siteId: "site-7" },
  visitedSites = [] as string[],
}: {
  atlasNexusId?: string;
  cardSourceDebug?: CardSourceDebugState | null;
  completionLevel?: number;
  currentDreamscape?: string | null;
  screen?: Screen;
  visitedSites?: string[];
} = {}): void {
  vi.mocked(useQuest).mockReturnValue({
    state: {
      essence: 250,
      deck: [],
      dreamcaller: null,
      resolvedPackage: null,
      cardSourceDebug,
      remainingDreamsignPool: [],
      dreamsigns: [],
      completionLevel,
      atlas: {
        nodes: {},
        edges: [],
        nexusId: atlasNexusId,
      },
      currentDreamscape,
      visitedSites,
      siteRuntime: {},
      draftState: null,
      screen,
      activeSiteId: "site-7",
      failureSummary: null,
    },
    mutations: {
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
    },
    cardDatabase: new Map(),
    questContent: {
      cardDatabase: new Map(),
      cardsByPackageTide: new Map(),
      dreamcallers: [],
      dreamsignTemplates: [],
      resolvedPackagesByDreamcallerId: new Map(),
    },
  });
}

let testCache: PlayableBattleCache = createPlayableBattleCache();

function wrapWithCache(element: ReactElement): ReactElement {
  return (
    <PlayableBattleCacheProvider cache={testCache}>
      {element}
    </PlayableBattleCacheProvider>
  );
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(wrapWithCache(element));
  });
  return { container, root };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeLifecycle.battleInitCalls = 0;
  routeLifecycle.initialStateCalls = 0;
  routeLifecycle.playableStateSnapshots = [];
  testCache = createPlayableBattleCache();
  setQuestState();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
});

describe("createBattleEntryKey", () => {
  it("uses the exact task format", () => {
    expect(createBattleEntryKey("dreamscape-2", "site-7", 3)).toBe(
      "site-7::3::dreamscape-2",
    );
    expect(createBattleEntryKey(null, "site-7", 3)).toBe("site-7::3::none");
  });
});

describe("BattleSiteRoute", () => {
  it("renders the playable battle screen for battle sites", () => {
    const html = renderToStaticMarkup(
      wrapWithCache(
        <BattleSiteRoute
          site={makeSite()}
          cardDatabase={new Map()}
          runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
        />,
      ),
    );

    expect(html).toContain('data-screen="playable"');
    expect(html).toContain("site-7::3::dreamscape-2");
    expect(routeLifecycle.battleInitCalls).toBe(1);
    expect(routeLifecycle.initialStateCalls).toBe(1);
  });

  it("remounts the route when the battle entry changes on the same mounted component", () => {
    const site = makeSite();
    const { container, root } = mount(
      <BattleSiteRoute
        site={site}
        cardDatabase={new Map()}
        runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
      />,
    );

    const initialScreen = container.querySelector('[data-screen="playable"]');
    expect(initialScreen?.textContent).toBe("site-7::3::dreamscape-2");

    setQuestState({ completionLevel: 4 });
    act(() => {
      root.render(
        wrapWithCache(
          <BattleSiteRoute
            site={site}
            cardDatabase={new Map()}
            runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
          />,
        ),
      );
    });

    const updatedScreen = container.querySelector('[data-screen="playable"]');
    expect(updatedScreen?.textContent).toBe("site-7::4::dreamscape-2");
    expect(routeLifecycle.battleInitCalls).toBe(2);
    expect(routeLifecycle.initialStateCalls).toBe(2);

    act(() => {
      root.unmount();
    });
  });

  it("reuses cached playable battle bootstrap data across rerenders and remounts", () => {
    const site = makeSite();
    const firstMount = mount(
      <BattleSiteRoute
        site={site}
        cardDatabase={new Map()}
        runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
      />,
    );

    const firstScreen = firstMount.container.querySelector('[data-screen="playable"]');
    expect(firstScreen?.getAttribute("data-seed")).toBe("1001");
    expect(firstScreen?.getAttribute("data-opening-hand")).toBe("1");
    expect(routeLifecycle.battleInitCalls).toBe(1);
    expect(routeLifecycle.initialStateCalls).toBe(1);

    act(() => {
      firstMount.root.render(
        wrapWithCache(
          <BattleSiteRoute
            site={site}
            cardDatabase={new Map()}
            runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
          />,
        ),
      );
    });

    expect(routeLifecycle.battleInitCalls).toBe(1);
    expect(routeLifecycle.initialStateCalls).toBe(1);

    act(() => {
      firstMount.root.unmount();
    });

    const secondMount = mount(
      <BattleSiteRoute
        site={site}
        cardDatabase={new Map()}
        runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
      />,
    );

    const secondScreen = secondMount.container.querySelector('[data-screen="playable"]');
    expect(secondScreen?.getAttribute("data-seed")).toBe("1001");
    expect(routeLifecycle.battleInitCalls).toBe(1);
    expect(routeLifecycle.initialStateCalls).toBe(1);

    act(() => {
      secondMount.root.unmount();
    });
  });

  it("keeps the same playable bootstrap for harmless quest-state rerenders", () => {
    const site = makeSite();
    const mountResult = mount(
      <BattleSiteRoute
        site={site}
        cardDatabase={new Map()}
        runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
      />,
    );

    const firstScreen = mountResult.container.querySelector('[data-screen="playable"]');
    expect(firstScreen?.getAttribute("data-seed")).toBe("1001");
    expect(routeLifecycle.battleInitCalls).toBe(1);
    expect(routeLifecycle.initialStateCalls).toBe(1);

    setQuestState({
      cardSourceDebug: {
        screenLabel: "Battle Rewards",
        surface: "BattleReward",
        entries: [],
      },
      screen: { type: "questStart" },
      visitedSites: ["site-1", "site-2"],
    });
    act(() => {
      mountResult.root.render(
        wrapWithCache(
          <BattleSiteRoute
            site={site}
            cardDatabase={new Map()}
            runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
          />,
        ),
      );
    });

    const rerenderedScreen = mountResult.container.querySelector('[data-screen="playable"]');
    expect(rerenderedScreen?.getAttribute("data-seed")).toBe("1001");
    expect(routeLifecycle.battleInitCalls).toBe(1);
    expect(routeLifecycle.initialStateCalls).toBe(1);

    act(() => {
      mountResult.root.unmount();
    });
  });

  it("preserves the cached playable bootstrap when unrelated atlas state mutates mid-battle", () => {
    const site = makeSite();
    const mountResult = mount(
      <BattleSiteRoute
        site={site}
        cardDatabase={new Map()}
        runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
      />,
    );

    const firstScreen = mountResult.container.querySelector('[data-screen="playable"]');
    expect(firstScreen?.getAttribute("data-seed")).toBe("1001");
    expect(routeLifecycle.battleInitCalls).toBe(1);
    expect(routeLifecycle.initialStateCalls).toBe(1);

    setQuestState({ atlasNexusId: "atlas-after-edit" });
    act(() => {
      mountResult.root.render(
        wrapWithCache(
          <BattleSiteRoute
            site={site}
            cardDatabase={new Map()}
            runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
          />,
        ),
      );
    });

    const rerenderedScreen = mountResult.container.querySelector('[data-screen="playable"]');
    expect(rerenderedScreen?.getAttribute("data-seed")).toBe("1001");
    expect(routeLifecycle.battleInitCalls).toBe(1);
    expect(routeLifecycle.initialStateCalls).toBe(1);

    act(() => {
      mountResult.root.unmount();
    });
  });

  it("rebuilds the playable bootstrap when the battle identity changes (different site)", () => {
    const firstSite = makeSite();
    const mountResult = mount(
      <BattleSiteRoute
        site={firstSite}
        cardDatabase={new Map()}
        runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
      />,
    );

    const firstScreen = mountResult.container.querySelector('[data-screen="playable"]');
    expect(firstScreen?.getAttribute("data-seed")).toBe("1001");
    expect(routeLifecycle.battleInitCalls).toBe(1);
    expect(routeLifecycle.initialStateCalls).toBe(1);

    setQuestState({ completionLevel: 5 });
    act(() => {
      mountResult.root.render(
        wrapWithCache(
          <BattleSiteRoute
            site={firstSite}
            cardDatabase={new Map()}
            runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
          />,
        ),
      );
    });

    const refreshedScreen = mountResult.container.querySelector('[data-screen="playable"]');
    expect(refreshedScreen?.getAttribute("data-seed")).toBe("1002");
    expect(refreshedScreen?.textContent).toBe("site-7::5::dreamscape-2");
    expect(routeLifecycle.battleInitCalls).toBe(2);
    expect(routeLifecycle.initialStateCalls).toBe(2);

    act(() => {
      mountResult.root.unmount();
    });
  });

  it("returns a fresh playable mutable-state clone instead of leaking cached mutations across remounts", () => {
    const site = makeSite();
    const firstMount = mount(
      <BattleSiteRoute
        site={site}
        cardDatabase={new Map()}
        runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
      />,
    );

    const firstState =
      routeLifecycle.playableStateSnapshots[routeLifecycle.playableStateSnapshots.length - 1];
    expect(firstState).toBeDefined();
    if (firstState === undefined) {
      throw new Error("Expected playable state snapshot");
    }
    firstState.sides.player.hand.splice(0, firstState.sides.player.hand.length);

    act(() => {
      firstMount.root.unmount();
    });

    const secondMount = mount(
      <BattleSiteRoute
        site={site}
        cardDatabase={new Map()}
        runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
      />,
    );

    const secondScreen = secondMount.container.querySelector('[data-screen="playable"]');
    expect(secondScreen?.getAttribute("data-opening-hand")).toBe("1");
    expect(routeLifecycle.battleInitCalls).toBe(1);
    expect(routeLifecycle.initialStateCalls).toBe(1);

    act(() => {
      secondMount.root.unmount();
    });
  });

  it("only bootstraps a single playable battle init under React StrictMode double mounting", () => {
    const site = makeSite();
    const { container, root } = mount(
      <StrictMode>
        <BattleSiteRoute
          site={site}
          cardDatabase={new Map()}
          runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
        />
      </StrictMode>,
    );

    const screen = container.querySelector('[data-screen="playable"]');
    expect(screen?.getAttribute("data-seed")).toBe("1001");
    expect(screen?.getAttribute("data-opening-hand")).toBe("1");
    expect(routeLifecycle.battleInitCalls).toBe(1);
    expect(routeLifecycle.initialStateCalls).toBe(1);

    act(() => {
      root.render(
        wrapWithCache(
          <StrictMode>
            <BattleSiteRoute
              site={site}
              cardDatabase={new Map()}
              runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
            />
          </StrictMode>,
        ),
      );
    });

    const rerendered = container.querySelector('[data-screen="playable"]');
    expect(rerendered?.getAttribute("data-seed")).toBe("1001");
    expect(routeLifecycle.battleInitCalls).toBe(1);
    expect(routeLifecycle.initialStateCalls).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it("rebuilds the playable bootstrap after cache.reset() so a recycled battleEntryKey starts fresh", () => {
    const site = makeSite();
    const firstMount = mount(
      <BattleSiteRoute
        site={site}
        cardDatabase={new Map()}
        runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
      />,
    );

    const firstScreen = firstMount.container.querySelector('[data-screen="playable"]');
    expect(firstScreen?.getAttribute("data-seed")).toBe("1001");
    expect(routeLifecycle.battleInitCalls).toBe(1);

    act(() => {
      firstMount.root.unmount();
    });

    testCache.reset();

    const secondMount = mount(
      <BattleSiteRoute
        site={site}
        cardDatabase={new Map()}
        runtimeConfig={{ seedOverride: null, startInBattle: false, enableAi: false, gameId: null }}
      />,
    );

    const secondScreen = secondMount.container.querySelector('[data-screen="playable"]');
    expect(secondScreen?.getAttribute("data-seed")).toBe("1002");
    expect(routeLifecycle.battleInitCalls).toBe(2);
    expect(routeLifecycle.initialStateCalls).toBe(2);

    act(() => {
      secondMount.root.unmount();
    });
  });
});
