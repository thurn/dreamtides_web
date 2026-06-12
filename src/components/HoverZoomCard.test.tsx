// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoverZoomCard } from "./HoverZoomCard";

vi.mock("../logging", () => ({
  logEventOnce: vi.fn(),
}));

function mockRect(rect: Partial<DOMRect>): void {
  const full: DOMRect = {
    width: 100,
    height: 140,
    left: 50,
    top: 50,
    right: 150,
    bottom: 190,
    x: 50,
    y: 50,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(full);
}

function mount(element: Parameters<Root["render"]>[0]): {
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

function hover(container: HTMLDivElement): void {
  const slot = container.querySelector("[data-testid='slot']");
  act(() => {
    slot?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}

function overlay(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>("[data-hover-zoom-overlay]");
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  // Run rAF callbacks synchronously so the grow animation commits within the
  // hover handler under test.
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 0;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => 0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("HoverZoomCard", () => {
  it("grows the card into a portaled, pointer-events-none copy on hover", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mount(
      <HoverZoomCard data-testid="slot" logSurface="test">
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    expect(overlay()).toBeNull();

    hover(container);

    const node = overlay();
    expect(node).not.toBeNull();
    // The copy mirrors the card content and floats above the layout without
    // intercepting the pointer.
    expect(node?.textContent).toContain("CARD BODY");
    expect(node?.classList.contains("pointer-events-none")).toBe(true);
    // 340px target / 100px footprint => 3.4x, inside the viewport clamp.
    expect(node?.style.transform).toContain("scale(3.4)");

    act(() => {
      root.unmount();
    });
  });

  it("keeps the card grown while the pointer stays inside the original footprint", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mount(
      <HoverZoomCard data-testid="slot">
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    hover(container);
    expect(overlay()).not.toBeNull();

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 100, clientY: 120 }),
      );
      vi.advanceTimersByTime(400);
    });

    expect(overlay()).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shrinks the card as soon as the pointer leaves the original footprint", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mount(
      <HoverZoomCard data-testid="slot">
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    hover(container);
    expect(overlay()).not.toBeNull();

    act(() => {
      // Well outside the stored 50..150 / 50..190 footprint.
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 600, clientY: 600 }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(overlay()).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("does nothing when disabled", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mount(
      <HoverZoomCard data-testid="slot" enabled={false}>
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    hover(container);

    expect(overlay()).toBeNull();
    expect(container.textContent).toContain("CARD BODY");

    act(() => {
      root.unmount();
    });
  });

  it("does not grow a card already at the target width", () => {
    // A footprint already wider than the 340px target yields a scale <= 1.
    mockRect({ width: 360, height: 500, left: 20, top: 20, right: 380, bottom: 520 });
    const { container, root } = mount(
      <HoverZoomCard data-testid="slot">
        <div>CARD BODY</div>
      </HoverZoomCard>,
    );

    hover(container);

    expect(overlay()).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
