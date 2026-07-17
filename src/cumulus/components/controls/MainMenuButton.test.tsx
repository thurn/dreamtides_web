// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MainMenuButton,
  type MainMenuButtonVariant,
} from "./MainMenuButton";

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
  it("renders each named shared-glass treatment on the press surface", () => {
    const variants: readonly MainMenuButtonVariant[] = [
      "frost",
      "accent",
      "popover",
    ];
    const { container, root } = mount(
      <div>
        {variants.map((variant) => (
          <MainMenuButton
            key={variant}
            label={variant}
            variant={variant}
            testId={`variant-${variant}`}
            onPress={() => {}}
          />
        ))}
      </div>,
    );

    expect(
      Array.from(container.querySelectorAll("button")).map(
        (button) => button.dataset.mainMenuButtonVariant,
      ),
    ).toEqual(variants);

    const glassSurfaces = Array.from(
      container.querySelectorAll<HTMLElement>("[data-main-menu-button-glass]"),
    );
    expect(glassSurfaces).toHaveLength(variants.length);
    for (const surface of glassSurfaces) {
      expect(surface.style.backdropFilter).toContain("--glass-blur");
      expect(surface.style.background).toContain("--glass-sheen");
    }
    expect(glassSurfaces[0]?.style.background).toContain("--glass-fill");
    expect(glassSurfaces[0]?.style.border).toContain("--glass-rim");
    expect(glassSurfaces[0]?.style.boxShadow).toContain("--glass-shadow");
    expect(glassSurfaces[1]?.style.background).toContain("--accent-bright");
    expect(glassSurfaces[1]?.style.background).toContain("--glass-fill");
    expect(glassSurfaces[1]?.style.border).toContain("--accent-bright");
    expect(glassSurfaces[2]?.style.background).toContain(
      "--glass-fill-popover",
    );
    expect(glassSurfaces[2]?.style.border).toContain("--glass-rim");
    expect(glassSurfaces[2]?.style.boxShadow).toContain("--glass-shadow");

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
