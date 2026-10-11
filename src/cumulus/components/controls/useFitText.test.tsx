// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { useFitText } from "./useFitText";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useFitText", () => {
  /** The fit's search ceiling and floor (px). */
  const MAX_FONT_PX = 20;
  const MIN_FONT_PX = 6;

  let observerCallbacks: Array<() => void> = [];
  let frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  /** Largest font size (px) whose text the synthetic box holds. */
  let fittingFontPx = MAX_FONT_PX;
  let clientWidth = 100;

  function FitFixture(): ReactElement {
    const { ref } = useFitText(MAX_FONT_PX, MIN_FONT_PX, [], { eager: true });
    return <div ref={ref} data-fit-fixture="" />;
  }

  function fixtureElement(container: HTMLElement): HTMLElement {
    const element = container.querySelector<HTMLElement>("[data-fit-fixture]");
    if (element === null) throw new Error("fit fixture did not render");
    return element;
  }

  function fontPx(element: HTMLElement): number {
    return Number.parseFloat(element.style.fontSize);
  }

  function notifyObservers(): void {
    act(() => {
      for (const callback of observerCallbacks) callback();
    });
  }

  function flushFrames(): void {
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    });
  }

  beforeEach(() => {
    observerCallbacks = [];
    frames = new Map();
    nextFrame = 1;
    fittingFontPx = MAX_FONT_PX;
    clientWidth = 100;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observerCallbacks.push(callback);
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames.delete(id);
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      () => clientWidth,
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(0);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return Number.parseFloat(this.style.fontSize) > fittingFontPx
          ? 1000
          : 0;
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-fits a resized box in the next frame, not inside the observer callback", () => {
    const { container } = renderInCumulus(<FitFixture />);
    const element = fixtureElement(container);
    expect(fontPx(element)).toBe(MAX_FONT_PX);

    fittingFontPx = MAX_FONT_PX / 2;
    clientWidth = 60;
    notifyObservers();
    notifyObservers();
    expect(fontPx(element)).toBe(MAX_FONT_PX);
    expect(frames.size).toBe(1);

    flushFrames();
    expect(fontPx(element)).toBeLessThanOrEqual(fittingFontPx);
    expect(fontPx(element)).toBeGreaterThanOrEqual(MIN_FONT_PX);
  });

  it("does not re-fit when the box keeps its size", () => {
    const { container } = renderInCumulus(<FitFixture />);
    const element = fixtureElement(container);

    fittingFontPx = MAX_FONT_PX / 2;
    notifyObservers();
    flushFrames();
    expect(fontPx(element)).toBe(MAX_FONT_PX);
  });

  it("drops a pending re-fit on unmount", () => {
    const { unmount } = renderInCumulus(<FitFixture />);
    clientWidth = 60;
    notifyObservers();
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });
});
