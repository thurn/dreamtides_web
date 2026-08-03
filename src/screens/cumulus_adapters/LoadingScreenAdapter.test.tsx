// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import {
  TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
  TUTORIAL_WORLDS_AWAIT_CARD_ID,
} from "../../data/tutorial-cards";
import { getLogEntries, resetLog } from "../../logging";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { LoadingScreenAdapter } from "./LoadingScreenAdapter";

const coopMocks = vi.hoisted(() => ({
  frontDoor: { phase: "loading", journeyId: "genesis:seed" },
  advanceFrontDoor: vi.fn().mockResolvedValue(1),
  cardDatabase: new Map<number, CardData>(),
}));

vi.mock("../../state/front-door-context", () => ({
  useFrontDoor: () => ({
    state: coopMocks.frontDoor,
    mutations: { advance: coopMocks.advanceFrontDoor },
  }),
}));

vi.mock("../../state/journey-context", () => ({
  useJourney: () => ({ cardDatabase: coopMocks.cardDatabase }),
}));

function card(cardNumber: number, id: string): CardData {
  return {
    id: asCardId(id),
    name: asCardName(`Fixture ${String(cardNumber)}`),
    cardNumber,
    cardType: cardNumber === 1 ? "Character" : "Event",
    subtype: cardNumber === 1 ? "Fixture" : "",
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
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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
  const champion = card(1, TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID);
  const worlds = card(2, TUTORIAL_WORLDS_AWAIT_CARD_ID);
  coopMocks.cardDatabase.set(champion.cardNumber, champion);
  coopMocks.cardDatabase.set(worlds.cardNumber, worlds);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/loading?seed=7#journey");
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

describe("LoadingScreenAdapter", () => {
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
