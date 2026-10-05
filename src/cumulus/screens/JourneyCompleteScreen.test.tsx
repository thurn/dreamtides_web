// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JourneyCompleteScreen,
  type JourneyCompleteView,
} from "./JourneyCompleteScreen";
import { testAvatarId } from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";

const VIEW: JourneyCompleteView = {
  avatar: {
    id: testAvatarId("00000000-0000-4000-8000-000000000061"),
    name: "The Wayfinder",
    title: "Bearer of the Last Light",
    ability: "Whenever you map a dream, gain 1 essence.",
    imageNumber: "001",
    portraitFocus: { x: 0.42, y: 0.18 },
  },
  stats: [
    { id: "battles", value: 7, kind: "number" },
    { id: "dreamscapes", value: 7, kind: "number" },
    { id: "cards", value: 30, kind: "number" },
    { id: "dreamsigns", value: 4, kind: "number" },
    { id: "essence", value: 140, kind: "essence" },
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

describe("Cumulus JourneyCompleteScreen", () => {
  it("orders the title, interactive portrait, and run summary without a resting name", () => {
    const { container } = renderInCumulus(
      <JourneyCompleteScreen view={VIEW} onNewJourney={vi.fn()} />,
    );

    expect(container.querySelector("h1")?.textContent).not.toBe("");
    const hierarchy = container.querySelector(
      "[data-journey-complete-hierarchy]",
    );
    const portrait = hierarchy?.querySelector<HTMLElement>(
      "[data-journey-complete-avatar]",
    );
    expect(
      Array.from(hierarchy?.children ?? []).map((element) =>
        element.getAttribute("data-journey-complete-section"),
      ),
    ).toEqual(["title", "portrait", "stats"]);
    const statsSection = hierarchy?.querySelector<HTMLElement>(
      '[data-journey-complete-section="stats"]',
    );
    expect(statsSection?.style.flex).toBe("1 1 0%");
    expect(statsSection?.style.justifyContent).toBe("center");
    expect(portrait?.textContent).toBe("");
    expect(
      portrait?.querySelector("[data-avatar-source]"),
    ).not.toBeNull();
    expect(portrait?.querySelector("img")?.getAttribute("alt")).toContain(
      "The Wayfinder",
    );
    expect(
      container.querySelectorAll("[data-journey-complete-stat]"),
    ).toHaveLength(5);
    expect(
      container
        .querySelector('[data-testid="journey-complete-summary-panel"]')
        ?.getAttribute("data-glass-panel-frame"),
    ).toBe("floating");
    expect(
      container.querySelector('[data-journey-complete-stat="essence"]')
        ?.textContent,
    ).toContain("140");
    expect(container.querySelector('[title="Victory"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="journey-complete-view-deck"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="journey-complete-download-log"]'),
    ).toBeNull();
  });

  it("renders the bottom action as accent glass and reports activation", () => {
    const onNewJourney = vi.fn();
    const { container } = renderInCumulus(
      <JourneyCompleteScreen view={VIEW} onNewJourney={onNewJourney} />,
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="journey-complete-new-journey"]',
    );

    expect(button?.dataset.glassVariant).toBe("accent");
    act(() => button?.click());
    expect(onNewJourney).toHaveBeenCalledOnce();
  });
});
