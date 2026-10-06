// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { parseBattleId } from "../../types/identifiers";
import {
  testAvatarId,
  testCardId,
  testDreamscapeArtKey,
  testDreamsignId,
  testOpponentId,
} from "../../types/test-identities";
import { artRef } from "../primitives/art";
import { dreamsignViewFixture } from "../test-helpers/dreamsign-fixture";
import { renderInCumulus } from "../testing/render";
import {
  BattleResultSurface,
  type MobileBattleResultView,
} from "./BattleResultSurface";
import { BattleStartScreen, type BattleStartView } from "./BattleStartScreen";
import {
  JourneyCompleteScreen,
  type JourneyCompleteView,
} from "./JourneyCompleteScreen";
import {
  JourneyFailedScreen,
  type JourneyFailedView,
} from "./JourneyFailedScreen";

/** `desktop` answers the `min-width` breakpoint queries. */
function stubViewport(desktop: boolean): void {
  window.matchMedia = (query: string) => ({
    matches: query.includes("min-width") ? desktop : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

beforeEach(() => {
  stubViewport(false);
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function click(element: Element | null | undefined): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("BattleStartScreen", () => {
  function makeView(): BattleStartView {
    const cards: CardData[] = Array.from({ length: 3 }, (_, index) => ({
      name: parseCardName(`Signature ${String(index + 1)}`),
      id: testCardId(
        `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
      ),
      cardNumber: index + 1,
      cardType: "Character",
      subtype: "Warrior",
      isStarter: false,
      energyCost: index + 1,
      spark: index + 2,
      isFast: false,
      renderedText: "A stable test ability.",
      imageNumber: index + 1,
      artOwned: true,
    }));
    return {
      battleId: parseBattleId("battle-test"),
      scene: artRef.dreamscapeScene(testDreamscapeArtKey("test_dreamscape")),
      avatar: {
        id: testOpponentId("opponent-uuid"),
        name: "Aeris, the Prism Guide",
        title: "Storm Archivist",
        imageNumber: "001",
        ability: "Whenever an event resolves, gain momentum.",
        abilityActive: true,
      },
      dreamsigns: [
        dreamsignViewFixture({
          id: testDreamsignId("battle-test:dreamsign:0"),
          name: "Sign of Quiet Thunder",
          effectDescription: "Fixture effect.",
          imageName: "quiet-thunder.webp",
        }),
      ],
      signatureCards: cards.map((card) => ({
        cardId: card.id,
        model: { cardId: card.id, displaySnapshot: card },
      })),
      pointsToWin: 12,
      essenceReward: 80,
    };
  }

  it("renders the desktop scene, opponent, signature cards, and stakes and reports begin", () => {
    stubViewport(true);
    const view = makeView();
    const onBegin = vi.fn();
    const { container } = renderInCumulus(
      <BattleStartScreen view={view} onBegin={onBegin} />,
    );

    expect(
      container.querySelector('[data-testid="cumulus-battle-start-scene"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector("[data-battle-start-opponent]")
        ?.getAttribute("data-battle-start-opponent"),
    ).toBe(view.avatar.id);
    expect(container.querySelector("h1")?.textContent).not.toContain(
      view.avatar.id,
    );
    expect(
      container.querySelector('[data-battle-start-panel-section="dreamsigns"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-signature-card-id] [data-reveal-complete-game-card="true"]',
      ),
    ).toHaveLength(3);
    for (const stake of ["points", "reward"]) {
      expect(
        container.querySelector(`[data-battle-start-stake="${stake}"]`),
      ).not.toBeNull();
    }

    click(
      container.querySelector('[data-testid="cumulus-battle-start-begin"]'),
    );
    expect(onBegin).toHaveBeenCalledTimes(1);
  });

  it("combines signature cards and Dreamsigns in one compact mobile panel", () => {
    const { container } = renderInCumulus(
      <BattleStartScreen view={makeView()} onBegin={vi.fn()} />,
    );
    const panel = container.querySelector(
      '[data-battle-start-layout="mobile"] [data-battle-start-panel]',
    );
    const objects = panel?.querySelector(
      "[data-battle-start-signature-objects]",
    );

    expect(panel?.getAttribute("data-battle-start-panel-density")).toBe(
      "compact",
    );
    expect(objects?.querySelectorAll("[data-signature-card-id]")).toHaveLength(
      3,
    );
    expect(
      objects?.querySelectorAll(
        '[data-testid^="cumulus-battle-start-dreamsign-"]',
      ),
    ).toHaveLength(1);
    expect(
      panel?.querySelector('[data-battle-start-panel-section="dreamsigns"]'),
    ).toBeNull();
    expect(
      panel?.querySelector('[data-testid="cumulus-battle-start-begin"]'),
    ).not.toBeNull();
  });

  it("hides the ability text while the opponent ability is dormant", () => {
    stubViewport(true);
    const view = makeView();
    const { container } = renderInCumulus(
      <BattleStartScreen
        view={{ ...view, avatar: { ...view.avatar, abilityActive: false } }}
        onBegin={vi.fn()}
      />,
    );
    const ability = container.querySelector(
      '[data-battle-start-panel-section="ability"]',
    );
    expect(ability?.textContent).not.toContain(view.avatar.ability);
    expect(ability?.textContent).not.toBe("");
  });
});

describe("BattleResultSurface", () => {
  let animationFrames: FrameRequestCallback[] = [];

  beforeEach(() => {
    animationFrames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      () => undefined,
    );
  });

  function mount(view: MobileBattleResultView) {
    const onAction = vi.fn();
    const { container } = renderInCumulus(
      <BattleResultSurface view={view} onAction={onAction} />,
    );
    return { container, onAction };
  }

  it("counts up the victory essence before enabling Continue", () => {
    const { container, onAction } = mount({
      outcome: "victory",
      opponentName: "Fixture Caller",
      playerScore: 10,
      opponentScore: 5,
      turnCount: 6,
      essenceReward: 100,
    });
    const essence = () =>
      container.querySelector("[data-battle-reward-essence-value]")
        ?.textContent;
    const continueButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-reward-continue"]',
    );

    expect(
      container.querySelector('[data-battle-result-surface="victory"]'),
    ).not.toBeNull();
    expect(essence()).not.toContain("100");
    expect(continueButton?.getAttribute("aria-disabled")).toBe("true");

    act(() => animationFrames.shift()?.(0));
    act(() => animationFrames.shift()?.(840));

    expect(essence()).toContain("100");
    expect(continueButton?.getAttribute("aria-disabled")).toBeNull();
    act(() => continueButton?.click());
    expect(onAction).toHaveBeenCalledWith("continue");
    expect(continueButton?.getAttribute("aria-disabled")).toBe("true");
  });

  it("reports inspect and reset from an open defeat", () => {
    const { container, onAction } = mount({
      outcome: "defeat",
      dismissed: false,
    });

    expect(
      container.querySelector("[data-battle-reward-essence-value]"),
    ).toBeNull();
    click(container.querySelector('[data-testid="battle-result-inspect"]'));
    click(container.querySelector('[data-testid="battle-result-reset"]'));
    expect(onAction).toHaveBeenNthCalledWith(1, "dismiss");
    expect(onAction).toHaveBeenNthCalledWith(2, "reset");
  });

  it("reopens a dismissed result from its bottom control", () => {
    const { container, onAction } = mount({
      outcome: "defeat",
      dismissed: true,
    });

    expect(container.querySelector("[role=dialog]")).toBeNull();
    click(container.querySelector('[data-testid="battle-result-reopen"]'));
    expect(onAction).toHaveBeenCalledWith("reopen");
  });
});

const PORTRAIT = {
  id: testAvatarId("00000000-0000-4000-8000-000000000061"),
  name: "The Wayfinder",
  title: "Bearer of the Last Light",
  ability: "Fixture ability.",
  imageNumber: "001",
  portraitFocus: { x: 0.42, y: 0.18 },
};

describe("JourneyCompleteScreen", () => {
  const VIEW: JourneyCompleteView = {
    avatar: PORTRAIT,
    stats: [
      { id: "battles", value: 7, kind: "number" },
      { id: "dreamscapes", value: 7, kind: "number" },
      { id: "cards", value: 30, kind: "number" },
      { id: "dreamsigns", value: 4, kind: "number" },
      { id: "essence", value: 140, kind: "essence" },
    ],
  };

  it("orders title, portrait, and run summary and reports a new journey", () => {
    const onNewJourney = vi.fn();
    const { container } = renderInCumulus(
      <JourneyCompleteScreen view={VIEW} onNewJourney={onNewJourney} />,
    );
    const hierarchy = container.querySelector(
      "[data-journey-complete-hierarchy]",
    );

    expect(
      Array.from(hierarchy?.children ?? []).map((element) =>
        element.getAttribute("data-journey-complete-section"),
      ),
    ).toEqual(["title", "portrait", "stats"]);
    expect(
      hierarchy?.querySelector(
        "[data-journey-complete-avatar] [data-avatar-source]",
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll("[data-journey-complete-stat]"),
    ).toHaveLength(VIEW.stats.length);

    click(
      container.querySelector('[data-testid="journey-complete-new-journey"]'),
    );
    expect(onNewJourney).toHaveBeenCalledOnce();
  });
});

describe("JourneyFailedScreen", () => {
  const VIEW: JourneyFailedView = {
    result: "defeat",
    reason: "score_target_reached",
    avatar: PORTRAIT,
    stats: [
      { id: "battles", value: 2 },
      { id: "round", value: 6 },
      { id: "playerScore", value: 4 },
      { id: "enemyScore", value: 10 },
    ],
  };

  it("orders result, portrait, and summary and reports a new run", () => {
    const onNewJourney = vi.fn();
    const { container } = renderInCumulus(
      <JourneyFailedScreen view={VIEW} onNewJourney={onNewJourney} />,
    );
    const screen = container.querySelector<HTMLElement>(
      "[data-journey-failed-screen]",
    );
    const hierarchy = container.querySelector(
      "[data-journey-failed-hierarchy]",
    );

    expect(screen?.dataset.journeyFailedScreen).toBe("defeat");
    expect(screen?.dataset.journeyFailedReason).toBe("score_target_reached");
    expect(
      Array.from(hierarchy?.children ?? []).map((element) =>
        element.getAttribute("data-journey-failed-section"),
      ),
    ).toEqual(["title", "portrait", "stats"]);
    expect(
      container.querySelectorAll("[data-journey-failed-stat]"),
    ).toHaveLength(VIEW.stats.length);

    click(
      container.querySelector('[data-testid="journey-failed-start-new-run"]'),
    );
    expect(onNewJourney).toHaveBeenCalledOnce();
  });

  it("renders a fallback without an action when the summary is missing", () => {
    const { container } = renderInCumulus(
      <JourneyFailedScreen view={null} onNewJourney={vi.fn()} />,
    );
    expect(container.textContent).not.toBe("");
    expect(
      container.querySelector('[data-testid="journey-failed-start-new-run"]'),
    ).toBeNull();
  });
});
