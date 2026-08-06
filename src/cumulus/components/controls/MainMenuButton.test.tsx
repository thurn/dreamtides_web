// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainMenuButton } from "./MainMenuButton";

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
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
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("MainMenuButton", () => {
  it("renders the shared neutral glass treatment on the press surface", () => {
    const { container, root } = mount(
      <MainMenuButton label="New Journey" onPress={() => {}} />,
    );

    const glassSurface = container.querySelector<HTMLElement>(
      "[data-main-menu-button-glass]",
    );
    expect(glassSurface?.style.backdropFilter).toContain("--glass-blur");
    expect(glassSurface?.style.background).toContain("--glass-sheen");
    expect(glassSurface?.style.background).toContain("--glass-fill");
    expect(glassSurface?.style.border).toContain("--glass-rim");
    expect(glassSurface?.style.boxShadow).toContain("--glass-shadow");

    act(() => root.unmount());
  });

  it("reports activation with its player-facing label intact", () => {
    const onPress = vi.fn();
    const { container, root } = mount(
      <MainMenuButton label="New Journey" onPress={onPress} />,
    );
    const button = container.querySelector("button");

    expect(button?.textContent).toBe("New Journey");
    act(() => button?.click());
    expect(onPress).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

});
