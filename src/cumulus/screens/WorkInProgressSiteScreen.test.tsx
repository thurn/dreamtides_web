// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import { artRef } from "../primitives/art";
import {
  WorkInProgressSiteScreen,
  type WorkInProgressSiteView,
} from "./WorkInProgressSiteScreen";

function view(
  overrides: Partial<WorkInProgressSiteView> = {},
): WorkInProgressSiteView {
  return {
    siteId: "gamble-site",
    siteType: "Gamble",
    scene: null,
    title: "Gamble",
    isEnhanced: false,
    message:
      "The wager is still being shaped. Continue your journey while its stakes settle into place.",
    guide: {
      id: "gravok",
      name: "Gravok",
      line: "Fortune favors the bold, traveler.",
      art: artRef.dreamGuide("gravok"),
    },
    ...overrides,
  };
}

function stubMatchMedia(): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  stubMatchMedia();
  globalThis.ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("WorkInProgressSiteScreen", () => {
  it("stages the Dream Guide on the left and explains that Gamble is unfinished", () => {
    const { container, root } = mount(
      <WorkInProgressSiteScreen view={view()} onContinue={vi.fn()} />,
    );

    expect(
      container.querySelector<HTMLElement>(
        "[data-guide-gallery-desktop-layout]",
      )?.style.gridTemplateColumns,
    ).toBe("minmax(0, 0.9fr) minmax(0, 1.1fr)");
    expect(
      container.querySelector('[data-testid="cumulus-work-in-progress-guide-art"]')
        ?.getAttribute("alt"),
    ).toBe("Gravok");
    expect(container.querySelector("h1")?.textContent).toBe("Gamble");
    expect(container.textContent).toContain("Work In Progress");
    expect(container.textContent).toContain("still being shaped");

    act(() => root.unmount());
  });

  it("continues from either placeholder and identifies enhanced sites", () => {
    const onContinue = vi.fn();
    const { container, root } = mount(
      <WorkInProgressSiteScreen
        view={view({
          siteId: "temporal-fork-site",
          siteType: "TemporalFork",
          title: "Temporal Fork",
          isEnhanced: true,
          message:
            "This fork in time is still being shaped. Continue your journey while its paths settle into place.",
        })}
        onContinue={onContinue}
      />,
    );

    expect(container.querySelector("h1")?.textContent).toBe("Temporal Fork");
    expect(container.textContent).toContain("Enhanced Site");
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-work-in-progress-continue"]',
        )
        ?.click();
    });
    expect(onContinue).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });
});
