// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { captureVisualViewport } from "./viewport";

describe("captureVisualViewport", () => {
  it.each([[899, "mobile"], [900, "desktop"]] as const)("classifies %ipx as %s", (width, layout) => {
    const root = document.documentElement;
    root.style.setProperty("--safe-area-inset-top", "11px");
    root.style.setProperty("--safe-area-inset-right", "3px");
    root.style.setProperty("--safe-area-inset-bottom", "17px");
    root.style.setProperty("--safe-area-inset-left", "5px");
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width, height: 700, offsetLeft: 7, offsetTop: 13 } });
    const snapshot = captureVisualViewport();
    expect(snapshot).toEqual({ layout, width, height: 700, offsetLeft: 7, offsetTop: 13, safeArea: { top: 11, right: 3, bottom: 17, left: 5 } });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.safeArea)).toBe(true);
  });
});
