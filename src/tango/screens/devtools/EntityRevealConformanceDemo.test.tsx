// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries } from "../../../logging";
import { TangoRoot } from "../../TangoRoot";
import { EntityRevealConformanceDemo } from "./EntityRevealConformanceDemo";

let resizeCallbacks: ResizeObserverCallback[] = [];

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("pointer: fine"), media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 } });
  resizeCallbacks = [];
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect(this: HTMLElement) {
    if (this.hasAttribute("data-game-card-source")) return DOMRect.fromRect({ x: 80, y: 300, width: 160, height: 224 });
    if (this.dataset.revealMeasure === "primary") return DOMRect.fromRect({ width: 340, height: 476 });
    if (this.dataset.revealMeasure === "secondary") return DOMRect.fromRect({ width: 248, height: 120 });
    if (this.dataset.tangoRevealCard !== undefined) {
      return DOMRect.fromRect({ x: Number.parseFloat(this.style.left), y: Number.parseFloat(this.style.top), width: Number.parseFloat(this.style.width), height: Number.parseFloat(this.style.height) });
    }
    return DOMRect.fromRect({ x: 400, y: 300, width: 100, height: 60 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete (globalThis as Partial<typeof globalThis>).ResizeObserver;
});

describe("EntityRevealConformanceDemo", () => {
  it("uses fixed semantic fixtures and exposes scenario selectors rather than mechanical props", () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); act(() => root.render(<TangoRoot><EntityRevealConformanceDemo /></TangoRoot>));
    expect(container.querySelector('[data-conformance-card-id="11111111-1111-4111-8111-111111111111"]')).not.toBeNull();
    expect(container.querySelector("[data-atlas-node-id]" )).not.toBeNull();
    expect(container.querySelector("[data-battle-card-id]" )).not.toBeNull();
    expect(container.querySelectorAll("[data-conformance-scenario]").length).toBeGreaterThanOrEqual(6);
    expect(container.innerHTML).not.toContain("anchorRect");
    expect(container.innerHTML).not.toContain("portalTarget");
    act(() => root.unmount());
  });

  it("logs rendered rectangles, placement flags, counts, dismissal, and activation outcome end to end", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); act(() => root.render(<TangoRoot><EntityRevealConformanceDemo /></TangoRoot>));
    const source = container.querySelector<HTMLElement>('[data-conformance-card-id="11111111-1111-4111-8111-111111111111"] [data-game-card-source]')!;
    void act(() => { source.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", pointerId: 1 })); });
    await act(async () => { await Promise.resolve(); });
    act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
    await vi.waitFor(() => expect(document.querySelector("[data-tango-reveal-card]" )).not.toBeNull());
    const opened = [...getLogEntries()].reverse().find((entry) => entry.event === "tango_entity_reveal_opened") as unknown as (Record<string, unknown> & {
      sourceRect: unknown;
      finalRects: unknown;
      circleClearance?: unknown;
      shownSecondaryCount: number;
      droppedSecondaryCount: number;
      fallbacks: { pressInPlace: boolean; sideFallback: boolean; secondaryTruncation: boolean; bestEffortPrimaryOverlap: boolean };
    });
    const rendered = [...document.querySelectorAll<HTMLElement>("[data-tango-reveal-card]")].map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    expect(opened.sourceRect).toEqual({ x: 80, y: 300, width: 160, height: 224 });
    expect(opened.finalRects).toEqual({ primary: rendered[0], secondaries: rendered.slice(1) });
    expect(opened.circleClearance).toBeUndefined();
    expect(opened.shownSecondaryCount).toBe(rendered.length - 1);
    expect(typeof opened.droppedSecondaryCount).toBe("number");
    expect(opened.fallbacks.pressInPlace).toBe(false);
    expect(typeof opened.fallbacks.sideFallback).toBe("boolean");
    expect(typeof opened.fallbacks.secondaryTruncation).toBe("boolean");
    expect(typeof opened.fallbacks.bestEffortPrimaryOverlap).toBe("boolean");
    void act(() => { window.dispatchEvent(new Event("resize")); });
    expect([...getLogEntries()].reverse().find((entry) => entry.event === "tango_entity_reveal_closed")).toMatchObject({ dismissalReason: "resize", activationOutcome: "none" });
    act(() => root.unmount());
  });
});
