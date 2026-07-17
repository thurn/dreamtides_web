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
  it("renders each named hover treatment on the shared press surface", () => {
    const variants: readonly MainMenuButtonVariant[] = [
      "mist",
      "bloom",
      "veil",
      "ripple",
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
