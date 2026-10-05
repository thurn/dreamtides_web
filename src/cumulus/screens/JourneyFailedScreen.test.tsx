// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JourneyFailedScreen,
  type JourneyFailedView,
} from "./JourneyFailedScreen";
import { testAvatarId } from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";

const VIEW: JourneyFailedView = {
  result: "defeat",
  reason: "score_target_reached",
  avatar: {
    id: testAvatarId("00000000-0000-4000-8000-000000000061"),
    name: "The Wayfinder",
    title: "Bearer of the Last Light",
    ability: "Whenever you map a dream, gain 1 essence.",
    imageNumber: "001",
    portraitFocus: { x: 0.42, y: 0.18 },
  },
  stats: [
    { id: "battles", value: 2 },
    { id: "round", value: 6 },
    { id: "playerScore", value: 4 },
    { id: "enemyScore", value: 10 },
  ],
};

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
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Cumulus JourneyFailedScreen", () => {
  it("orders the result, interactive portrait, and terminal summary", () => {
    const { container } = renderInCumulus(
      <JourneyFailedScreen view={VIEW} onNewJourney={vi.fn()} />,
    );

    const screen = container.querySelector<HTMLElement>(
      "[data-journey-failed-screen]",
    );
    const hierarchy = container.querySelector(
      "[data-journey-failed-hierarchy]",
    );
    const portrait = hierarchy?.querySelector<HTMLElement>(
      "[data-journey-failed-avatar]",
    );

    expect(screen?.dataset.journeyFailedScreen).toBe("defeat");
    expect(screen?.dataset.journeyFailedReason).toBe("score_target_reached");
    expect(container.querySelector("h1")?.textContent).not.toBe("");
    expect(
      container.querySelector('[data-journey-failed-section="title"] p')
        ?.textContent,
    ).not.toBe("");
    expect(
      container.querySelector(
        '[data-journey-failed-reason="score_target_reached"]',
      )?.textContent,
    ).not.toBe("");
    expect(container.querySelector("h1")?.style.color).toBe(
      "var(--text-primary)",
    );
    expect(
      container.querySelector<HTMLElement>(
        '[data-journey-failed-reason="score_target_reached"]:not([data-journey-failed-screen])',
      )?.style.color,
    ).toBe("var(--danger)");
    expect(
      Array.from(hierarchy?.children ?? []).map((element) =>
        element.getAttribute("data-journey-failed-section"),
      ),
    ).toEqual(["title", "portrait", "stats"]);
    expect(portrait?.textContent).toBe("");
    expect(
      portrait?.querySelector("[data-avatar-source]"),
    ).not.toBeNull();
    expect(
      container.querySelectorAll("[data-journey-failed-stat]"),
    ).toHaveLength(4);
    expect(
      container
        .querySelector('[data-testid="journey-failed-summary-panel"]')
        ?.getAttribute("data-glass-panel-frame"),
    ).toBe("floating");
    expect(
      container.querySelector('[data-journey-failed-stat="enemyScore"]')
        ?.textContent,
    ).toContain("10");
  });

  it("renders the bottom action as accent glass and reports activation", () => {
    const onNewJourney = vi.fn();
    const { container } = renderInCumulus(
      <JourneyFailedScreen view={VIEW} onNewJourney={onNewJourney} />,
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="journey-failed-start-new-run"]',
    );

    expect(button?.dataset.glassVariant).toBe("accent");
    act(() => button?.click());
    expect(onNewJourney).toHaveBeenCalledOnce();
  });

  it("renders a safe fallback without an action when the summary is missing", () => {
    const { container } = renderInCumulus(
      <JourneyFailedScreen view={null} onNewJourney={vi.fn()} />,
    );

    expect(container.textContent).toContain(
      "Journey failure summary not found",
    );
    expect(
      container.querySelector('[data-testid="journey-failed-start-new-run"]'),
    ).toBeNull();
  });
});
