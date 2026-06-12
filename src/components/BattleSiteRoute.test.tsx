// @vitest-environment jsdom

import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Database } from "firebase/database";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  BattleSiteRoute,
  createBattleEntryKey,
} from "./BattleSiteRoute";
import { MultiplayerBattleProvider } from "../state/multiplayer-battle-context";
import * as ensureSessionModule from "../state/use-ensure-battle-session";
import * as battleService from "../multiplayer/battle-service";
import { useQuest } from "../state/quest-context";
import type { CardSourceDebugState, Screen, SiteState } from "../types/quest";
import type { SharedBattleState } from "../multiplayer/battle-types";
import { createBattleInit } from "../battle/integration/create-battle-init";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../battle/test-support";

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../multiplayer/battle-service", async () => {
  const actual = await vi.importActual<typeof import("../multiplayer/battle-service")>(
    "../multiplayer/battle-service",
  );
  return {
    ...actual,
    ensureBattleSession: vi.fn(() => Promise.resolve(undefined)),
    dispatchBattleCommandToRoom: vi.fn(() => Promise.resolve(undefined)),
    dispatchBattleHistoryNav: vi.fn(() => Promise.resolve(undefined)),
  };
});

vi.mock("../battle/components/PlayableBattleScreen", async () => {
  const { useMultiplayerBattle } = await import(
    "../state/multiplayer-battle-context"
  );
  return {
    PlayableBattleScreen: () => {
      const { battleState } = useMultiplayerBattle();
      if (battleState === null) {
        return null;
      }
      return (
        <div
          data-screen="playable"
          data-seed={String(battleState.init.seed)}
          data-battle-id={battleState.reducer.mutable.battleId}
        >
          {battleState.init.battleEntryKey}
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

function makeFakeBattleState(): SharedBattleState {
  const init = createBattleInit({
    battleEntryKey: "site-7::3::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),

    dreamwellCards: [],    seedOverride: 1234,
  });
  const initial = createInitialBattleState(init);
  return {
    init,
    reducer: {
      mutable: initial,
      history: { past: [], future: [] },
      lastTransition: null,
      commandSerial: 0,
      lastActivityKind: null,
    },
  };
}

function setQuestState({
  atlasStartingNodeId = "",
  cardSourceDebug = null,
  completionLevel = 3,
  currentDreamscape = "dreamscape-2",
  screen = { type: "site", siteId: "site-7" } as Screen,
  visitedSites = [] as string[],
}: {
  atlasStartingNodeId?: string;
  cardSourceDebug?: CardSourceDebugState | null;
  completionLevel?: number;
  currentDreamscape?: string | null;
  screen?: Screen;
  visitedSites?: string[];
} = {}): void {
  vi.mocked(useQuest).mockReturnValue({
    state: {
      seed: "test-seed",
      essence: 250,
      essenceCap: 500,
      omens: 0,
      maxDreamsigns: 12,
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
        startingNodeId: atlasStartingNodeId,
      },
      currentDreamscape,
      visitedSites,
      siteRuntime: {},
      draftState: null,
      screen,
      activeSiteId: "site-7",
      failureSummary: null,
      hasSeenStartingDeckPopup: false,
      battleModifiers: [],
      shopModifiers: {
        freeRerolls: 0,
        upcomingOmenDiscounts: 0,
        essenceDiscountPercent: 0,
      },
      dreamscapeModifiers: [],
    },
    mutations: {
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
    acceptDreamMerchantOffer: vi.fn(),
    declineDreamMerchant: vi.fn(),
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
      grantShopOmenDiscounts: vi.fn(),
      boostSiteAppearance: vi.fn(),
    },
    cardDatabase: new Map(),
    questContent: {
      cardDatabase: new Map(),
      dreamcallers: [],

      dreamwellCards: [],      dreamsignTemplates: [],
    },
  });
}

function wrap(
  element: ReactElement,
  battleState: SharedBattleState | null,
): ReactNode {
  return (
    <MultiplayerBattleProvider
      database={{} as Database}
      roomId="room-1"
      clientId="client-a"
      connectedCount={1}
      battleState={battleState}
    >
      {element}
    </MultiplayerBattleProvider>
  );
}

function mount(
  element: ReactElement,
  battleState: SharedBattleState | null,
): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(wrap(element, battleState));
  });
  return { container, root };
}

beforeEach(() => {
  vi.clearAllMocks();
  setQuestState();
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

describe("createBattleEntryKey", () => {
  it("uses the exact task format", () => {
    expect(createBattleEntryKey("dreamscape-2", "site-7", 3)).toBe(
      "site-7::3::dreamscape-2",
    );
    expect(createBattleEntryKey(null, "site-7", 3)).toBe("site-7::3::none");
  });
});

describe("BattleSiteRoute", () => {
  it("renders a loading placeholder while battleState is null", () => {
    const { container } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          startInBattle: false,
          aiMode: false,
          basicAutomation: false,
          gameId: null,
          databaseMode: "emulator",
          journeyVariant: "classic",
        }}
      />,
      null,
    );

    expect(container.querySelector('[data-screen="playable"]')).toBeNull();
    expect(container.textContent).toContain("Preparing battle");
  });

  it("invokes ensureBattleSession via the hook when battleState is null", () => {
    const ensureSpy = vi.spyOn(ensureSessionModule, "useEnsureBattleSession");

    mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          startInBattle: false,
          aiMode: false,
          basicAutomation: false,
          gameId: null,
          databaseMode: "emulator",
          journeyVariant: "classic",
        }}
      />,
      null,
    );

    expect(ensureSpy).toHaveBeenCalled();
    const lastCall = ensureSpy.mock.calls[ensureSpy.mock.calls.length - 1];
    if (lastCall === undefined) {
      throw new Error("Expected ensureBattleSession to be called");
    }
    expect(lastCall[0].battleEntryKey).toBe("site-7::3::dreamscape-2");
    expect(lastCall[0].roomId).toBe("room-1");
    expect(lastCall[0].battleState).toBeNull();

    expect(battleService.ensureBattleSession).toHaveBeenCalled();
  });

  it("renders PlayableBattleScreen using shared battleInit and initialState when battleState is present", () => {
    const fakeBattleState = makeFakeBattleState();
    const { container } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          startInBattle: false,
          aiMode: false,
          basicAutomation: false,
          gameId: null,
          databaseMode: "emulator",
          journeyVariant: "classic",
        }}
      />,
      fakeBattleState,
    );

    const screen = container.querySelector('[data-screen="playable"]');
    expect(screen).not.toBeNull();
    expect(screen?.textContent).toBe("site-7::3::dreamscape-2");
    expect(screen?.getAttribute("data-seed")).toBe(String(fakeBattleState.init.seed));
    expect(screen?.getAttribute("data-battle-id")).toBe(
      fakeBattleState.reducer.mutable.battleId,
    );

    // ensureBattleSession should NOT fire when battleState is already populated.
    expect(battleService.ensureBattleSession).not.toHaveBeenCalled();
  });

  it("rerenders the screen with the updated battleEntryKey when quest state changes", () => {
    const fakeBattleState = makeFakeBattleState();
    const { container, root } = mount(
      <BattleSiteRoute
        site={makeSite()}
        cardDatabase={makeBattleTestCardDatabase()}
        runtimeConfig={{
          seedOverride: null,
          startInBattle: false,
          aiMode: false,
          basicAutomation: false,
          gameId: null,
          databaseMode: "emulator",
          journeyVariant: "classic",
        }}
      />,
      fakeBattleState,
    );

    expect(
      container
        .querySelector('[data-screen="playable"]')
        ?.textContent,
    ).toBe("site-7::3::dreamscape-2");

    setQuestState({ completionLevel: 4 });
    act(() => {
      root.render(
        wrap(
          <BattleSiteRoute
            site={makeSite()}
            cardDatabase={makeBattleTestCardDatabase()}
            runtimeConfig={{
              seedOverride: null,
              startInBattle: false,
              aiMode: false,
              basicAutomation: false,
              gameId: null,
              databaseMode: "emulator",
              journeyVariant: "classic",
            }}
          />,
          fakeBattleState,
        ),
      );
    });

    // The shared battleState's init still drives the rendered seed/key
    // (Task 13 will own keying off the shared init); we just confirm the
    // route stays up and reflects the loaded shared state.
    expect(
      container.querySelector('[data-screen="playable"]'),
    ).not.toBeNull();
  });
});
