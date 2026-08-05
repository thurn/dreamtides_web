// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { captureVisualViewport, findRevealBoundary } from "./viewport";

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

  it("captures the visible rectangle of an application reveal boundary", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { width: 1200, height: 700, offsetLeft: 7, offsetTop: 13 },
    });
    const boundary = document.createElement("div");
    boundary.getBoundingClientRect = () =>
      ({
        x: 20,
        y: 118,
        left: 20,
        top: 118,
        right: 1180,
        bottom: 680,
        width: 1160,
        height: 562,
        toJSON: () => ({}),
      });

    const snapshot = captureVisualViewport(window, boundary);

    expect(snapshot.boundary).toEqual({
      x: 20,
      y: 118,
      width: 1160,
      height: 562,
    });
    expect(Object.isFrozen(snapshot.boundary)).toBe(true);
  });

  it("reserves the rendered journey status bar band on desktop", () => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 700, offsetLeft: 7, offsetTop: 13 } });
    const statusBar = document.createElement("div");
    statusBar.dataset.journeyStatusBarAnchor = "";
    statusBar.getBoundingClientRect = () => ({ x: 0, y: 610, left: 0, top: 610, right: 1207, bottom: 713, width: 1207, height: 103, toJSON: () => ({}) });
    document.body.append(statusBar);

    const snapshot = captureVisualViewport();

    expect(snapshot.boundary).toEqual({ x: 7, y: 13, width: 1200, height: 597 });
    statusBar.remove();
  });

  it("leaves the status bar band available to mobile reveal placement", () => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 390, height: 700, offsetLeft: 0, offsetTop: 0 } });
    const statusBar = document.createElement("div");
    statusBar.dataset.journeyStatusBarAnchor = "";
    statusBar.getBoundingClientRect = () => ({ x: 0, y: 610, left: 0, top: 610, right: 390, bottom: 700, width: 390, height: 90, toJSON: () => ({}) });
    document.body.append(statusBar);

    expect(captureVisualViewport().boundary).toBeUndefined();
    statusBar.remove();
  });

  it("leaves the partial battle HUD band available to desktop card reveals", () => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 700, offsetLeft: 0, offsetTop: 0 } });
    const statusBar = document.createElement("div");
    statusBar.dataset.journeyStatusBarAnchor = "";
    statusBar.dataset.journeyStatusBarVariant = "battle";
    statusBar.getBoundingClientRect = () => ({ x: 0, y: 610, left: 0, top: 610, right: 1200, bottom: 700, width: 1200, height: 90, toJSON: () => ({}) });
    document.body.append(statusBar);

    expect(captureVisualViewport().boundary).toBeUndefined();
    statusBar.remove();
  });

  it("uses the nearest scrolling ancestor as the reveal boundary", () => {
    const outer = document.createElement("div");
    const scroller = document.createElement("div");
    const source = document.createElement("button");
    scroller.style.overflowY = "auto";
    scroller.append(source);
    outer.append(scroller);
    document.body.append(outer);

    expect(findRevealBoundary(source)).toBe(scroller);

    outer.remove();
  });
});
