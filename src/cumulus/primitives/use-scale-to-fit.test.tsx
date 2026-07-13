// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useScaleToFit } from "./use-scale-to-fit";

// The hook returns the uniform scale-to-fit ratio for a fixed design stage,
// re-evaluated on the window `resize` event. A `Probe` component captures the
// hook's current return so each render's value can be asserted.

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
    writable: true,
  });
}

/**
 * Mount the hook under a `Probe` and return an accessor for its latest value.
 */
function renderHook(
  stageWidth: number,
  stageHeight: number,
): { value: () => number; root: Root } {
  let latest = Number.NaN;
  function Probe(): null {
    latest = useScaleToFit(stageWidth, stageHeight);
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Probe />);
  });
  return { value: () => latest, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  setViewport(1920, 1080);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useScaleToFit", () => {
  it("returns 1.0 when the stage matches the viewport exactly", () => {
    expect(renderHook(1920, 1080).value()).toBeCloseTo(1.0);
  });

  it("returns the MIN of the width/height fit ratios", () => {
    // A 3840×2160 stage in a 1920×1080 viewport fits at half scale on both axes.
    expect(renderHook(3840, 2160).value()).toBeCloseTo(0.5);
  });

  it("takes the limiting (smaller) axis when the ratios differ", () => {
    // Width ratio 1920/3840 = 0.5, height ratio 1080/1080 = 1.0 → min is 0.5.
    expect(renderHook(3840, 1080).value()).toBeCloseTo(0.5);
    // Width ratio 1920/1920 = 1.0, height ratio 1080/2160 = 0.5 → min is 0.5.
    expect(renderHook(1920, 2160).value()).toBeCloseTo(0.5);
  });

  it("re-fits on a dispatched resize event", () => {
    const hook = renderHook(1920, 1080);
    expect(hook.value()).toBeCloseTo(1.0);
    act(() => {
      setViewport(960, 540);
      window.dispatchEvent(new Event("resize"));
    });
    expect(hook.value()).toBeCloseTo(0.5);
  });
});
