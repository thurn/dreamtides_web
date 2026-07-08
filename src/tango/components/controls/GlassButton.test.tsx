// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlassButton } from "./GlassButton";
import { GLYPHS } from "../../primitives/glyph";

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // Pressable's usePrefersReducedMotion reads window.matchMedia; jsdom lacks it.
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("GlassButton", () => {
  it("renders its text label inside a button", () => {
    const { container, root } = mount(
      <GlassButton label="Apply Filters" onPress={() => {}} />,
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("Apply Filters");

    act(() => {
      root.unmount();
    });
  });

  it("renders an optional leading glyph before the label", () => {
    const { container, root } = mount(
      <GlassButton
        label="Filter"
        glyph={GLYPHS.filter}
        onPress={() => {}}
      />,
    );

    // The leading glyph is a GlowIcon <i> carrying the glyph class.
    expect(container.querySelector("i")?.className).toBe(String(GLYPHS.filter));

    act(() => {
      root.unmount();
    });
  });

  it("omits the `<i>` when no glyph is given", () => {
    const { container, root } = mount(
      <GlassButton label="Filter" onPress={() => {}} />,
    );

    expect(container.querySelector("i")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("fires `onPress` on click", () => {
    const onPress = vi.fn();
    const { container, root } = mount(
      <GlassButton label="Apply" onPress={onPress} />,
    );

    act(() => {
      container.querySelector("button")?.click();
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("while disabled sets aria-disabled=\"true\" and does not fire onPress", () => {
    const onPress = vi.fn();
    const { container, root } = mount(
      <GlassButton label="Apply" onPress={onPress} disabled />,
    );

    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      button?.click();
    });
    expect(onPress).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
