// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { ReactNode } from "react";

import { JourneyOptionCircle } from "./JourneyOptionCircle";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("./JourneyHoverCard", () => ({
  JourneyHoverCard: () => <div role="tooltip">hover content</div>,
}));

interface MountResult {
  readonly container: HTMLDivElement;
  readonly root: Root;
}

const VIEWPORT_HEIGHT = 800;

function makeRect(rect: Partial<DOMRect>): DOMRect {
  const left = rect.left ?? rect.x ?? 0;
  const top = rect.top ?? rect.y ?? 0;
  const width = rect.width ?? 0;
  const height = rect.height ?? 0;
  return {
    bottom: rect.bottom ?? top + height,
    height,
    left,
    right: rect.right ?? left + width,
    top,
    width,
    x: rect.x ?? left,
    y: rect.y ?? top,
    toJSON: () => ({}),
  };
}

function mount(node: ReactNode): MountResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

describe("JourneyOptionCircle", () => {
  let cleanups: MountResult[] = [];
  let rectSpy: MockInstance<() => DOMRect>;

  beforeEach(() => {
    cleanups = [];
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: VIEWPORT_HEIGHT,
    });
    rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect");
    rectSpy.mockImplementation(function getMockRect(this: Element) {
      if (this.matches("[data-quest-bottom-hud]")) {
        return makeRect({ top: 704, bottom: 800, width: 1280, height: 96 });
      }
      if (this instanceof HTMLButtonElement) {
        return makeRect({ top: 260, bottom: 520, width: 256, height: 256 });
      }
      if (this.matches("[data-side]")) {
        return makeRect({ top: 528, bottom: 748, width: 430, height: 220 });
      }
      return makeRect({});
    });
  });

  afterEach(() => {
    for (const { root, container } of cleanups) {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
    cleanups = [];
    document.body.innerHTML = "";
    rectSpy.mockRestore();
  });

  function trackedMount(node: ReactNode): MountResult {
    const result = mount(node);
    cleanups.push(result);
    return result;
  }

  function renderHoveredCircle(): HTMLElement {
    const { container } = trackedMount(
      <JourneyOptionCircle
        imageUrl="/journeys/101.jpg"
        dreamName="Iron Front"
        text="Gain 'Spell Tome'."
        locked={false}
        hovered={true}
        onMouseEnter={() => undefined}
        onMouseLeave={() => undefined}
        onEnterDream={() => undefined}
      />,
    );
    const hoverWrapper = container.querySelector<HTMLElement>("[data-side]");
    if (hoverWrapper === null) {
      throw new Error("Expected hover wrapper to render");
    }
    return hoverWrapper;
  }

  it("places the hover above when below-space would intersect the fixed bottom HUD", () => {
    const hud = document.createElement("div");
    hud.setAttribute("data-quest-bottom-hud", "");
    document.body.appendChild(hud);

    const hoverWrapper = renderHoveredCircle();

    expect(hoverWrapper.getAttribute("data-side")).toBe("above");
    expect(hoverWrapper.style.bottom).toBe("calc(100% + 8px)");
    expect(hoverWrapper.style.top).toBe("");
  });

  it("keeps the preferred below placement when no fixed bottom HUD is present", () => {
    const hoverWrapper = renderHoveredCircle();

    expect(hoverWrapper.getAttribute("data-side")).toBe("below");
    expect(hoverWrapper.style.top).toBe("calc(100% + 8px)");
    expect(hoverWrapper.style.bottom).toBe("");
  });
});
