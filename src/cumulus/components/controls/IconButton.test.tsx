// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";
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
    }));
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("IconButton", () => {
  it("renders an accessible button labelled by `label`, carrying the glyph class", () => {
    const { container, root } = mount(
      <IconButton glyph={GLYPHS.close} label="Close deck" onPress={() => {}} />,
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Close deck");
    expect(button?.style.appearance).toBe("none");
    expect(button?.style.webkitAppearance).toBe("none");
    // The disc shows only its glyph — the close mark (`bx bx-x`).
    expect(button?.querySelector("i.bx-x")).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders `sm` as a 40px disc with a 22px glyph font", () => {
    const { container, root } = mount(
      <IconButton
        glyph={GLYPHS.close}
        size="sm"
        label="Close"
        onPress={() => {}}
      />,
    );

    const style =
      container.querySelector("button")?.getAttribute("style") ?? "";
    expect(style).toContain("width: 40px");
    expect(style).toContain("height: 40px");
    expect(style).toContain("font-size: 22px");

    act(() => {
      root.unmount();
    });
  });

  it("renders `md` as a 48px disc with a 26px glyph font", () => {
    const { container, root } = mount(
      <IconButton
        glyph={GLYPHS.close}
        size="md"
        label="Close"
        onPress={() => {}}
      />,
    );

    const style =
      container.querySelector("button")?.getAttribute("style") ?? "";
    expect(style).toContain("width: 48px");
    expect(style).toContain("height: 48px");
    expect(style).toContain("font-size: 26px");

    act(() => {
      root.unmount();
    });
  });

  it("defaults to the `md` size", () => {
    const { container, root } = mount(
      <IconButton glyph={GLYPHS.close} label="Close" onPress={() => {}} />,
    );

    const style =
      container.querySelector("button")?.getAttribute("style") ?? "";
    expect(style).toContain("width: 48px");
    expect(style).toContain("font-size: 26px");

    act(() => {
      root.unmount();
    });
  });

  it("uses the lighter tonal-lens treatment when placed on glass", () => {
    const { container, root } = mount(
      <IconButton
        glyph={GLYPHS.close}
        label="Close"
        placement="onGlass"
        onPress={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button?.dataset.glassPlacement).toBe("onGlass");
    expect(button?.style.background).toContain("--glass-on-glass-fill");
    expect(button?.style.backdropFilter).toBe("");

    act(() => {
      root.unmount();
    });
  });

  it("renders the shared purple soft-wash accent without dropping the glass blur", () => {
    const { container, root } = mount(
      <IconButton
        glyph={GLYPHS.close}
        label="Close"
        variant="accent"
        onPress={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button?.dataset.glassVariant).toBe("accent");
    expect(button?.style.backdropFilter).toContain("--glass-blur");
    expect(button?.style.background).toContain("var(--accent-bright) 20%");
    expect(button?.style.background).toContain("var(--accent-strong) 10%");
    expect(button?.style.boxShadow).toContain("inset 0 -12px 26px");
    expect(button?.style.boxShadow).toContain("0 10px 26px");

    act(() => {
      root.unmount();
    });
  });

  it("balances the purple accent for an icon button nested on glass", () => {
    const { container, root } = mount(
      <IconButton
        glyph={GLYPHS.close}
        label="Close"
        variant="accent"
        placement="onGlass"
        onPress={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button?.style.background).toContain("var(--accent-bright) 18%");
    expect(button?.style.background).toContain("var(--accent-strong) 8%");
    expect(button?.style.boxShadow).toContain("inset 0 -10px 22px");
    expect(button?.style.boxShadow).toContain("0 8px 22px");

    act(() => {
      root.unmount();
    });
  });

  it("fires `onPress` on click", () => {
    const onPress = vi.fn();
    const { container, root } = mount(
      <IconButton glyph={GLYPHS.close} label="Close" onPress={onPress} />,
    );

    act(() => {
      container.querySelector("button")?.click();
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it('while disabled sets aria-disabled="true" and does not fire onPress', () => {
    const onPress = vi.fn();
    const { container, root } = mount(
      <IconButton
        glyph={GLYPHS.close}
        label="Close"
        onPress={onPress}
        disabled
      />,
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
