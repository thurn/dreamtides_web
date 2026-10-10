// @vitest-environment jsdom

import { StrictMode, act, type ReactElement } from "react";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
  MINIMAL_SITES_DATA,
} from "../testing/atlas-fixtures";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { BattleSiteRoute } from "./BattleSiteRoute";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import type { GameActions } from "../session/actions";
import { useJourney } from "../state/journey-context";
import { testJourneyState } from "../testing/journey-genesis";
import type { FoldState } from "../rules/fold-state";
import type { Screen, SiteState } from "../types/journey";
import {
  makeBattleTestCardDatabase,
  makeBattleTestAvatars,
  makeBattleTestSite,
  makeBattleTestState,
} from "../battle/test-support";
import { createTestBattleInit } from "../testing/create-battle-init";
import type { JourneyBattleFoldState } from "../rules/battle/fold";
import {
  parseAtlasNodeId,
  parseBattleEntryKey,
  parseJourneyId,
  parseSiteId,
  type AtlasNodeId,
  type BattleId,
} from "../types/identifiers";

vi.mock("../state/journey-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/journey-context")>()),
  useJourney: vi.fn(),
}));

let mockGameState: FoldState;
const beginBattleSpy = vi.fn(() => Promise.resolve(0));
const mockActions = { beginBattle: beginBattleSpy } as unknown as GameActions;

vi.mock("../session/hooks", () => ({
  useGameState: () => mockGameState,
  useConfirmedGameState: () => mockGameState,
  useActions: () => mockActions,
}));

vi.mock("../screens/cumulus_adapters/BattleStartScreenAdapter", () => ({
  BattleStartScreenAdapter: ({
    init,
    onBegin,
  }: {
    init: { init: { battleId: BattleId } };
    onBegin: () => void;
  }) => (
    <div data-screen="cumulus-battle-start" data-battle-id={init.init.battleId}>
      <button type="button" data-cumulus-begin="" onClick={onBegin} />
    </div>
  ),
}));

vi.mock("../battle/components/PlayableBattleScreen", async () => {
  const { useGameState } = await import("../session/hooks");
  return {
    PlayableBattleScreen: () => {
      const battle = useGameState().battle;
      if (battle === null) return null;
      return (
        <div
          data-screen="cumulus-playable"
          data-battle-id={battle.init.battleId}
        />
      );
    },
  };
});

const ENTRY_KEY = "site-7::3::dreamscape-2";
const SITE_ID = parseSiteId("site-7");
const roots: Root[] = [];

interface JourneyOverrides {
  completionLevel?: number;
  currentDreamscape?: AtlasNodeId | null;
  screen?: Screen;
}

function makeJourneyState({
  completionLevel = 3,
  currentDreamscape = parseAtlasNodeId("dreamscape-2"),
  screen = { type: "site", siteId: SITE_ID },
}: JourneyOverrides = {}) {
  const atlasStartingNodeId = parseAtlasNodeId("dreamscape-start");
  const battleState = makeBattleTestState();
  return {
    ...testJourneyState(),
    ...battleState,
    runId: parseJourneyId("journey:test"),
    essence: 250,
    cardSourceDebug: null,
    completionLevel,
    atlas: {
      ...battleState.atlas,
      startingNodeId: atlasStartingNodeId,
      bossNodeId: atlasStartingNodeId,
      currentNodeId: atlasStartingNodeId,
    },
    currentDreamscape,
    screen,
  };
}

/** Sets both the folded game state and the journey context the route reads. */
function setFold({
  withBattle,
  ...overrides
}: JourneyOverrides & { withBattle: boolean }): void {
  const journey = makeJourneyState(overrides);
  let battle: FoldState["battle"] = null;
  if (withBattle) {
    const { init } = createTestBattleInit({
      battleEntryKey: parseBattleEntryKey(ENTRY_KEY),
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      avatars: makeBattleTestAvatars(),
      dreamwellCards: [],
      seedOverride: 1234,
    });
    // The playable-screen mock never reads the engine battle.
    battle = {
      mode: { kind: "journey" },
      init,
      engine: {} as JourneyBattleFoldState["engine"],
    };
  }
  mockGameState = {
    frontDoor: { phase: "main", journeyId: null, tutorial: null },
    journey,
    battle,
    tutorialTriggerIdsSeen: [],
    cardTutorialScreenKeysSeen: [],
    cardTutorialPresentation: null,
  };
  vi.mocked(useJourney).mockReturnValue({
    state: journey,
    mutations: {} as ReturnType<typeof useJourney>["mutations"],
    cardDatabase: makeBattleTestCardDatabase(),
    journeyContent: {
      ...CONFIG_DATA_FIXTURE,
      draftData: draftDataFixture(),
      cardDatabase: makeBattleTestCardDatabase(),
      avatars: makeBattleTestAvatars(),
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: MINIMAL_DREAMSCAPES,
      affiliations: [],
      guides: [],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      economyData: economyFixture(),
      opponentsData: opponentsFixture(),
    },
  });
}

function route(seedOverride: number | null = null): ReactElement {
  const site: SiteState = {
    id: SITE_ID,
    type: "Battle",
    isEnhanced: false,
    isVisited: false,
  };
  return (
    <BattleSiteRoute
      site={site}
      cardDatabase={makeBattleTestCardDatabase()}
      runtimeConfig={{
        seedOverride,
        gameId: null,
      }}
    />
  );
}

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const render = (next: ReactElement) =>
    act(() => root.render(<CumulusRoot>{next}</CumulusRoot>));
  render(element);
  const query = (selector: string) => container.querySelector(selector);
  return {
    rerender: render,
    query,
    start: () => query('[data-screen="cumulus-battle-start"]'),
    playable: () => query('[data-screen="cumulus-playable"]'),
    begin: () =>
      act(() => {
        query("[data-cumulus-begin]")?.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  setFold({ withBattle: false });
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("BattleSiteRoute", () => {
  it("opens the playable surface on mount when the folded battle already exists", () => {
    setFold({ withBattle: true });
    const view = mount(route());

    expect(view.playable()).not.toBeNull();
    expect(view.start()).toBeNull();
    expect(
      view.query('[data-journey-status-bar-variant="battle"]'),
    ).not.toBeNull();
    expect(beginBattleSpy).not.toHaveBeenCalled();
  });

  it("previews Battle Start, begins with the seed only on click, then hands off when BEGIN_BATTLE folds", () => {
    const view = mount(<StrictMode>{route(4242)}</StrictMode>);

    expect(view.start()?.getAttribute("data-battle-id")).toContain(ENTRY_KEY);
    expect(view.query("[data-cumulus-journey-chrome]")).not.toBeNull();
    expect(view.playable()).toBeNull();
    expect(beginBattleSpy).not.toHaveBeenCalled();

    view.begin();
    expect(beginBattleSpy).toHaveBeenCalledTimes(1);
    expect(beginBattleSpy).toHaveBeenCalledWith("site-7", 4242);

    setFold({ withBattle: true });
    view.rerender(<StrictMode>{route(4242)}</StrictMode>);
    const playable = view.playable();
    expect(playable?.getAttribute("data-battle-id")).toBe(
      mockGameState.battle?.init.battleId,
    );
    expect(view.start()).toBeNull();
    expect(
      view.query('[data-journey-status-bar-variant="battle"]'),
    ).not.toBeNull();
  });

  it("begins without a seed when no seed override is configured", () => {
    const view = mount(route());
    view.begin();
    expect(beginBattleSpy).toHaveBeenCalledWith("site-7");
  });

  it("returns to the Battle Start preview after the folded battle is cleared", () => {
    setFold({ withBattle: true });
    const view = mount(route());
    expect(view.playable()).not.toBeNull();

    setFold({ withBattle: false, completionLevel: 4 });
    view.rerender(route());
    expect(view.start()).not.toBeNull();
  });

  it("does not show Battle Start while the completed battle route exits to the Atlas", () => {
    setFold({ withBattle: true });
    const view = mount(route());
    expect(view.playable()).not.toBeNull();

    setFold({
      withBattle: false,
      completionLevel: 4,
      currentDreamscape: null,
      screen: { type: "atlas" },
    });
    view.rerender(route());
    expect(view.start()).toBeNull();
    expect(view.playable()).toBeNull();
  });
});
