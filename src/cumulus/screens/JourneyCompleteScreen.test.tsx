// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import {
  JourneyCompleteScreen,
  type JourneyCompleteView,
} from "./JourneyCompleteScreen";

const VIEW: JourneyCompleteView = {
  dreamAvatar: {
    id: "00000000-0000-4000-8000-000000000061",
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
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return { container, root };
}

describe("Cumulus JourneyCompleteScreen", () => {
  it("orders the title, interactive portrait, and run summary without a resting name", () => {
    const { container, root } = mount(
      <JourneyCompleteScreen view={VIEW} onNewJourney={vi.fn()} />,
    );

    expect(container.querySelector("h1")?.textContent).not.toBe("");
    const hierarchy = container.querySelector(
      "[data-journey-complete-hierarchy]",
    );
    const portrait = hierarchy?.querySelector<HTMLElement>(
      "[data-journey-complete-dream-avatar]",
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
      portrait?.querySelector("[data-dream-avatar-source]"),
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

    act(() => root.unmount());
  });

  it("renders the bottom action as accent glass and reports activation", () => {
    const onNewJourney = vi.fn();
    const { container, root } = mount(
      <JourneyCompleteScreen view={VIEW} onNewJourney={onNewJourney} />,
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="journey-complete-new-journey"]',
    );

    expect(button?.dataset.glassVariant).toBe("accent");
    act(() => button?.click());
    expect(onNewJourney).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });
});
