// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import type {
  MainMenuActionId,
  MainMenuScreenProps,
  MainMenuSocialId,
} from "../../cumulus/screens/MainMenuScreen";
import { getLogEntries, resetLog } from "../../logging";
import {
  makeTutorialConfiguration,
  TEST_TUTORIAL_CARD_CONSTANTS,
} from "../../testing/tutorial-configuration-fixture";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { JourneyId } from "../../types/identifiers";
import { testCardId, testJourneyId } from "../../types/test-identities";
import { LoadingScreenAdapter } from "./LoadingScreenAdapter";
import { MainMenuScreenAdapter } from "./MainMenuScreenAdapter";

const screenMocks = vi.hoisted(() => ({
  onAction: null as null | ((actionId: MainMenuActionId) => void),
  onExitComplete: null as null | (() => void),
  onSocial: null as null | ((socialId: MainMenuSocialId) => void),
}));

const coopMocks = vi.hoisted<{
  frontDoor: { phase: string; journeyId: JourneyId | null };
  frontDoorAction: ReturnType<typeof vi.fn>;
  advanceFrontDoor: ReturnType<typeof vi.fn>;
  cardDatabase: Map<number, CardData>;
}>(() => ({
  frontDoor: { phase: "main", journeyId: null },
  frontDoorAction: vi.fn().mockResolvedValue(1),
  advanceFrontDoor: vi.fn().mockResolvedValue(2),
  cardDatabase: new Map<number, CardData>(),
}));

vi.mock("../../state/front-door-context", () => ({
  useFrontDoor: () => ({
    state: coopMocks.frontDoor,
    mutations: {
      action: coopMocks.frontDoorAction,
      advance: coopMocks.advanceFrontDoor,
    },
  }),
}));

vi.mock("../../state/journey-context", () => ({
  useJourney: () => ({
    journeyContent: {
      cardDatabase: coopMocks.cardDatabase,
      tutorial: makeTutorialConfiguration(),
    },
  }),
}));

vi.mock("../../cumulus/screens/MainMenuScreen", () => ({
  MainMenuScreen: ({
    onAction,
    onExitComplete,
    onSocial,
    transitionPhase,
  }: {
    onAction: (actionId: MainMenuActionId) => void;
    onExitComplete?: () => void;
    onSocial: (socialId: MainMenuSocialId) => void;
    transitionPhase?: MainMenuScreenProps["transitionPhase"];
  }) => {
    screenMocks.onAction = onAction;
    screenMocks.onExitComplete = onExitComplete ?? null;
    screenMocks.onSocial = onSocial;
    return <div data-main-menu data-main-menu-phase={transitionPhase} />;
  },
}));

describe("LoadingScreenAdapter", () => {
  const TUTORIAL_LOADING_CHARACTER_CARD_ID =
    TEST_TUTORIAL_CARD_CONSTANTS.loadingScreenCharacterCardId;
  const TUTORIAL_WORLDS_AWAIT_CARD_ID =
    TEST_TUTORIAL_CARD_CONSTANTS.loadingScreenEventCardId;

  function card(cardNumber: number, idSeed: string): CardData {
    return {
      id: testCardId(idSeed),
      name: parseCardName(`Fixture ${String(cardNumber)}`),
      cardNumber,
      cardType: cardNumber === 1 ? "Character" : "Event",
      subtype: cardNumber === 1 ? "Warrior" : "",
      isStarter: true,
      energyCost: cardNumber,
      spark: cardNumber === 1 ? 3 : null,
      isFast: false,
      renderedText: "Fixture rules.",
      imageNumber: cardNumber,
      artOwned: true,
    };
  }

  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    coopMocks.cardDatabase.clear();
    const champion = card(1, TUTORIAL_LOADING_CHARACTER_CARD_ID);
    const worlds = card(2, TUTORIAL_WORLDS_AWAIT_CARD_ID);
    coopMocks.cardDatabase.set(champion.cardNumber, champion);
    coopMocks.cardDatabase.set(worlds.cardNumber, worlds);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/loading?seed=7#journey");
    coopMocks.frontDoor = {
      phase: "loading",
      journeyId: testJourneyId("genesis:seed"),
    };
    coopMocks.advanceFrontDoor.mockClear();
    resetLog();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
    delete (globalThis as { ResizeObserver?: typeof ResizeObserver })
      .ResizeObserver;
  });

  it("logs direct loading-screen presentation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <LoadingScreenAdapter playbackSpeed={4} />
        </CumulusRoot>,
      ),
    );

    expect(container.querySelector("[data-loading-screen]")).not.toBeNull();
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "loading_screen_presented",
          source: "direct",
          tutorialPlaybackSpeed: 4,
        }),
      ]),
    );

    act(() => {
      vi.advanceTimersByTime(1_249);
    });
    expect(container.querySelector("[data-loading-indicator]")).not.toBeNull();
    expect(container.querySelector('[data-testid="loading-begin"]')).toBeNull();
    expect(coopMocks.advanceFrontDoor).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector("[data-loading-indicator]")).toBeNull();
    const begin = container.querySelector<HTMLButtonElement>(
      '[data-testid="loading-begin"]',
    );
    expect(begin).not.toBeNull();
    expect(coopMocks.advanceFrontDoor).not.toHaveBeenCalled();

    act(() => begin?.click());
    expect(coopMocks.advanceFrontDoor).toHaveBeenCalledWith(
      "loading",
      "genesis:seed",
    );
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "loading_begin_pressed",
          source: "direct",
          tutorialPlaybackSpeed: 4,
        }),
      ]),
    );

    act(() => root.unmount());
  });
});

describe("MainMenuScreenAdapter", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    window.history.replaceState(null, "", "/main");
    screenMocks.onAction = null;
    screenMocks.onExitComplete = null;
    screenMocks.onSocial = null;
    coopMocks.frontDoor = { phase: "main", journeyId: null };
    coopMocks.frontDoorAction.mockClear();
    coopMocks.advanceFrontDoor.mockClear();
    resetLog();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("submits New Journey, logs the restored controls, and advances the shared exit transition", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <MainMenuScreenAdapter />
        </CumulusRoot>,
      ),
    );

    act(() => screenMocks.onAction?.("new-journey"));
    act(() => screenMocks.onAction?.("dream-codex"));
    expect(coopMocks.frontDoorAction).toHaveBeenCalledWith(
      "main",
      "new-journey",
    );

    coopMocks.frontDoor = {
      phase: "mainExiting",
      journeyId: testJourneyId("event:1"),
    };
    act(() =>
      root.render(
        <CumulusRoot>
          <MainMenuScreenAdapter />
        </CumulusRoot>,
      ),
    );
    expect(
      container.querySelector("[data-main-menu-phase='exiting']"),
    ).not.toBeNull();
    act(() => screenMocks.onSocial?.("reddit"));
    act(() => screenMocks.onExitComplete?.());
    expect(coopMocks.frontDoorAction).toHaveBeenCalledTimes(1);
    expect(coopMocks.advanceFrontDoor).toHaveBeenCalledWith(
      "mainExiting",
      "event:1",
    );

    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "main_menu_presented" }),
        expect.objectContaining({
          event: "main_menu_action_pressed",
          actionId: "new-journey",
        }),
        expect.objectContaining({
          event: "main_menu_action_pressed",
          actionId: "dream-codex",
        }),
        expect.objectContaining({
          event: "main_menu_social_pressed",
          socialId: "reddit",
        }),
      ]),
    );

    act(() => root.unmount());
  });
});
