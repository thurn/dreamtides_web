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
      <GlassButton
        label="Apply Filters"
        testId="glass-apply"
        onPress={() => {}}
      />,
    );

    const button = container.querySelector('[data-testid="glass-apply"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("Apply Filters");

    act(() => {
      root.unmount();
    });
  });

  it("renders an optional leading glyph before the label", () => {
    const { container, root } = mount(
      <GlassButton label="Filter" glyph={GLYPHS.filter} onPress={() => {}} />,
    );

    // The leading glyph is a GlowIcon <i> carrying the glyph class.
    expect(container.querySelector("i")?.className).toBe(String(GLYPHS.filter));

    act(() => {
      root.unmount();
    });
  });

  it("renders an optional inline essence cost", () => {
    const { container, root } = mount(
      <GlassButton label="Purge 1:" cost={40} onPress={() => {}} />,
    );

    const button = container.querySelector("button");
    expect(button?.textContent).toContain("Purge 1:");
    expect(button?.textContent).toContain("40");
    expect(button?.querySelector("i")?.className).toContain("bx-crypto");

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

  it("defaults to the neutral glass treatment", () => {
    const { container, root } = mount(
      <GlassButton label="Cancel" onPress={() => {}} />,
    );

    const button = container.querySelector("button");
    expect(button?.style.borderColor).toBe("");

    act(() => {
      root.unmount();
    });
  });

  it("uses the lighter tonal-lens treatment when placed on glass", () => {
    const { container, root } = mount(
      <GlassButton label="Cancel" placement="onGlass" onPress={() => {}} />,
    );

    const button = container.querySelector("button");
    expect(button?.dataset.glassPlacement).toBe("onGlass");
    expect(button?.style.background).toContain("--glass-on-glass-fill");
    expect(button?.style.backdropFilter).toBe("");

    act(() => {
      root.unmount();
    });
  });

  it("can render the danger glass treatment", () => {
    const { container, root } = mount(
      <GlassButton label="Cancel" variant="danger" onPress={() => {}} />,
    );

    const button = container.querySelector("button");
    expect(button?.style.borderColor).toBe("rgba(255, 111, 130, 0.92)");
    expect(button?.style.background).toContain("rgba(244, 43, 72, 0.12)");

    act(() => {
      root.unmount();
    });
  });

  it("restores the neutral glass border after leaving the danger state", () => {
    const { container, root } = mount(
      <GlassButton label="Decline" onPress={() => {}} />,
    );
    const button = container.querySelector<HTMLButtonElement>("button");
    const neutralBorder = button?.style.border;
    expect(neutralBorder).not.toBe("");

    act(() => {
      root.render(
        <GlassButton label="Purge 1" variant="danger" onPress={() => {}} />,
      );
    });
    expect(button?.style.border).not.toBe(neutralBorder);

    act(() => {
      root.render(<GlassButton label="Decline" onPress={() => {}} />);
    });
    expect(button?.style.border).toBe(neutralBorder);

    act(() => {
      root.unmount();
    });
  });

  it("balances the danger treatment for placement on glass", () => {
    const { container, root } = mount(
      <GlassButton
        label="Cancel"
        variant="danger"
        placement="onGlass"
        onPress={() => {}}
      />,
    );

    const button = container.querySelector("button");
    expect(button?.style.borderColor).toBe("rgba(255, 111, 130, 0.82)");
    expect(button?.style.background).toContain("--glass-on-glass-fill");

    act(() => {
      root.unmount();
    });
  });

  it("restores the neutral on-glass border after leaving the danger state", () => {
    const { container, root } = mount(
      <GlassButton
        label="Decline"
        placement="onGlass"
        onPress={() => {}}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>("button");
    const neutralBorder = button?.style.border;
    expect(neutralBorder).not.toBe("");

    act(() => {
      root.render(
        <GlassButton
          label="Purge 1"
          variant="danger"
          placement="onGlass"
          onPress={() => {}}
        />,
      );
    });
    expect(button?.style.border).not.toBe(neutralBorder);

    act(() => {
      root.render(
        <GlassButton
          label="Decline"
          placement="onGlass"
          onPress={() => {}}
        />,
      );
    });
    expect(button?.style.border).toBe(neutralBorder);

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

  it('while disabled sets aria-disabled="true" and does not fire onPress', () => {
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
