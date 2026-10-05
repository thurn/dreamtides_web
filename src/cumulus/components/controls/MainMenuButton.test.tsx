// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainMenuButton } from "./MainMenuButton";
import { renderInCumulus } from "../../testing/render";

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

describe("MainMenuButton", () => {
  it("renders the shared neutral glass treatment on the press surface", () => {
    const { container } = renderInCumulus(
      <MainMenuButton label={"New Journey"} onPress={() => {}} />,
    );

    const glassSurface = container.querySelector<HTMLElement>(
      "[data-main-menu-button-glass]",
    );
    expect(glassSurface?.style.backdropFilter).toContain("--glass-blur");
    expect(glassSurface?.style.background).toContain("--glass-sheen");
    expect(glassSurface?.style.background).toContain("--glass-fill");
    expect(glassSurface?.style.border).toContain("--glass-rim");
    expect(glassSurface?.style.boxShadow).toContain("--glass-shadow");
  });

  it("reports activation with its player-facing label intact", () => {
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <MainMenuButton label={"New Journey"} onPress={onPress} />,
    );
    const button = container.querySelector("button");

    expect(button?.textContent).toBe("New Journey");
    act(() => button?.click());
    expect(onPress).toHaveBeenCalledOnce();
  });
});
