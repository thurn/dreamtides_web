// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries } from "../../../logging";
import { CumulusRoot } from "../../CumulusRoot";
import { EntityRevealConformanceDemo } from "./EntityRevealConformanceDemo";

let resizeCallbacks: ResizeObserverCallback[] = [];

interface OpenLog extends Record<string, unknown> {
  viewport: { layout: "mobile" | "desktop"; width: number; height: number; offsetLeft: number; offsetTop: number; safeArea: { top: number; right: number; bottom: number; left: number } };
  sourceRect: { x: number; y: number; width: number; height: number };
  touchPoint?: { x: number; y: number };
  placement: { family: string; orientation: string };
  finalRects: { primary: { x: number; y: number; width: number; height: number }; secondaries: Array<{ x: number; y: number; width: number; height: number }> };
  circleClearance?: number;
  shownSecondaryCount: number;
  droppedSecondaryCount: number;
  fallbacks: { pressInPlace: boolean; sideFallback: boolean; secondaryTruncation: boolean; bestEffortPrimaryOverlap: boolean };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("pointer: fine"), media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 } });
  for (const [name, value] of [["--safe-area-inset-top", "11px"], ["--safe-area-inset-right", "12px"], ["--safe-area-inset-bottom", "13px"], ["--safe-area-inset-left", "14px"]] as const) document.documentElement.style.setProperty(name, value);
  resizeCallbacks = [];
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect(this: HTMLElement) {
    if (this.hasAttribute("data-game-card-source")) return DOMRect.fromRect({ x: 80, y: 300, width: 160, height: 224 });
    if (this.dataset.revealMeasure === "primary") return DOMRect.fromRect({ width: 240, height: 336 });
    if (this.dataset.revealMeasure === "secondary") return DOMRect.fromRect({ width: 248, height: 120 });
    if (this.dataset.cumulusRevealCard !== undefined) {
      return DOMRect.fromRect({ x: Number.parseFloat(this.style.left), y: Number.parseFloat(this.style.top), width: Number.parseFloat(this.style.width), height: Number.parseFloat(this.style.height) });
    }
    return DOMRect.fromRect({ x: 400, y: 300, width: 100, height: 60 });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
  delete (globalThis as Partial<typeof globalThis>).ResizeObserver;
});

describe("EntityRevealConformanceDemo", () => {
  it("uses fixed semantic fixtures and exposes scenario selectors rather than mechanical props", () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); act(() => root.render(<CumulusRoot><EntityRevealConformanceDemo /></CumulusRoot>));
    expect(container.querySelector('[data-conformance-card-id="11111111-1111-4111-8111-111111111111"]')).not.toBeNull();
    expect(container.querySelector("[data-atlas-node-id]" )).not.toBeNull();
    expect(container.querySelector("[data-conformance-battle-fixture] [data-game-card-source]" )).not.toBeNull();
    expect(container.querySelector("[data-conformance-generated-battle-fixture] [data-game-card-source]" )).not.toBeNull();
    expect(container.querySelectorAll("[data-conformance-scenario]").length).toBeGreaterThanOrEqual(6);
    const infoSource = container.querySelector<HTMLElement>("[data-conformance-info-secondaries] [data-reveal-entity-type=dreamcaller]")!;
    expect(infoSource.dataset.revealSecondaryTitles?.split("\u001f")).toEqual(["Bane", "Discover", "Ephemeral"]);
    expect(infoSource.querySelector<HTMLImageElement>("img")?.src).toContain(
      "/dreamcallers/cutout/0071.png",
    );
    expect(
      container.querySelector<HTMLImageElement>(
        'img[src*="/cards/485518048.webp"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLImageElement>(
        'img[src*="/dreamsigns/runes.png"]',
      ),
    ).not.toBeNull();
    for (const scenario of ["above", "side-fallback", "top-edge", "truncation", "best-effort", "safe-area", "reduced-motion"]) {
      act(() => container.querySelector<HTMLButtonElement>(`[data-conformance-scenario="${scenario}"]`)?.click());
      const source = container.querySelector<HTMLElement>(`[data-conformance-scenario-source="${scenario}"]`)!;
      expect(source.querySelector("[data-reveal-entity-type]")).not.toBeNull();
      expect(source.style.position).toBe(
        ["top-edge", "best-effort", "safe-area"].includes(scenario)
          ? "fixed"
          : "absolute",
      );
      if (scenario === "best-effort") {
        expect(source.style.left).toBe("calc(50% - 60px)");
        expect(source.style.top).toBe("0px");
      }
    }
    expect(container.innerHTML).not.toContain("anchorRect");
    expect(container.innerHTML).not.toContain("portalTarget");
    expect(container.innerHTML).not.toContain("data-conformance-expects-reduced-motion");
    expect(document.documentElement.dataset.cumulusReducedMotion).toBe("reduce");
    act(() => root.unmount());
  });

  it("logs rendered rectangles, placement flags, counts, dismissal, and activation outcome end to end", async () => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 800, offsetLeft: 7, offsetTop: 13 } });
    const baseline = getLogEntries().length;
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); act(() => root.render(<CumulusRoot><EntityRevealConformanceDemo /></CumulusRoot>));
    const source = container.querySelector<HTMLElement>('[data-conformance-card-id="11111111-1111-4111-8111-111111111111"] [data-game-card-source]')!;
    void act(() => { source.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", pointerId: 1 })); });
    await act(async () => { await Promise.resolve(); });
    act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
    await vi.waitFor(() => expect(document.querySelector("[data-cumulus-reveal-card]" )).not.toBeNull());
    const opens = getLogEntries().slice(baseline).filter((entry) => entry.event === "cumulus_entity_reveal_opened");
    expect(opens).toHaveLength(1);
    const opened = opens[0] as unknown as OpenLog;
    const rendered = [...document.querySelectorAll<HTMLElement>("[data-cumulus-reveal-card]")].map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    expect(opened.sourceRect).toEqual({ x: 80, y: 300, width: 160, height: 224 });
    expect(opened.viewport).toEqual({ layout: "desktop", width: 1200, height: 800, offsetLeft: 7, offsetTop: 13, safeArea: { top: 11, right: 12, bottom: 13, left: 14 } });
    expect(opened.placement).toEqual({ family: "desktop-game-card-reading", orientation: "primary-left" });
    expect(opened.finalRects).toEqual({ primary: rendered[0], secondaries: rendered.slice(1) });
    expect(opened.finalRects).toEqual({ primary: { x: 40, y: 244, width: 240, height: 336 }, secondaries: [{ x: 290, y: 244, width: 248, height: 120 }, { x: 290, y: 374, width: 248, height: 120 }, { x: 290, y: 504, width: 248, height: 120 }] });
    expect(opened.circleClearance).toBeUndefined();
    expect(opened.shownSecondaryCount).toBe(rendered.length - 1);
    expect(opened.droppedSecondaryCount).toBe(0);
    expect(opened.fallbacks.pressInPlace).toBe(false);
    expect(opened.fallbacks).toEqual({ pressInPlace: false, sideFallback: false, secondaryTruncation: false, bestEffortPrimaryOverlap: false });
    void act(() => { window.dispatchEvent(new Event("resize")); });
    const closes = getLogEntries().slice(baseline).filter((entry) => entry.event === "cumulus_entity_reveal_closed");
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({ dismissalReason: "resize", activationOutcome: "none" });
    act(() => root.unmount());
  });

  it("logs exact mobile touch clearance and a real fired activation once", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 390, height: 844, offsetLeft: 3, offsetTop: 5 } });
    for (const [name, value] of [["--safe-area-inset-top", "52px"], ["--safe-area-inset-right", "6px"], ["--safe-area-inset-bottom", "7px"], ["--safe-area-inset-left", "8px"]] as const) document.documentElement.style.setProperty(name, value);
    const baseline = getLogEntries().length;
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); act(() => root.render(<CumulusRoot><EntityRevealConformanceDemo /></CumulusRoot>));
    act(() => container.querySelector<HTMLButtonElement>('[data-conformance-scenario="best-effort"]')?.click());
    const source = container.querySelector<HTMLElement>('[data-conformance-scenario-source="best-effort"] [data-game-card-source]')!;
    source.getBoundingClientRect = () => DOMRect.fromRect({ x: 80, y: 50, width: 120, height: 168 });
    const point = { x: 195, y: 100 };
    void act(() => source.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 9, clientX: point.x, clientY: point.y })));
    await act(async () => { await vi.advanceTimersByTimeAsync(40); });
    act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
    await vi.waitFor(() => expect(document.querySelector("[data-cumulus-reveal-card=primary]")).not.toBeNull());
    const opened = getLogEntries().slice(baseline).find((entry) => entry.event === "cumulus_entity_reveal_opened") as unknown as OpenLog;
    expect(opened.viewport).toEqual({ layout: "mobile", width: 390, height: 844, offsetLeft: 3, offsetTop: 5, safeArea: { top: 52, right: 6, bottom: 7, left: 8 } });
    expect(opened.touchPoint).toEqual(point);
    expect(opened.placement).toEqual({ family: "mobile-touch-corner", orientation: "primary-right" });
    expect(opened.shownSecondaryCount).toBe(8);
    expect(opened.droppedSecondaryCount).toBe(21);
    expect(opened.fallbacks).toEqual({ pressInPlace: false, sideFallback: true, secondaryTruncation: true, bestEffortPrimaryOverlap: true });
    const primary = document.querySelector<HTMLElement>("[data-cumulus-reveal-card=primary]")!.getBoundingClientRect();
    const renderedSecondaries = [...document.querySelectorAll<HTMLElement>("[data-cumulus-reveal-card=secondary]")].map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    expect(opened.finalRects).toEqual({ primary: { x: primary.x, y: primary.y, width: primary.width, height: primary.height }, secondaries: renderedSecondaries });
    const dx = Math.max(primary.left - point.x, 0, point.x - primary.right);
    const dy = Math.max(primary.top - point.y, 0, point.y - primary.bottom);
    expect(opened.circleClearance).toBeCloseTo(Math.hypot(dx, dy) - 24, 8);
    void act(() => source.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 9, clientX: point.x, clientY: point.y })));
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector("[data-conformance-card-id]")?.getAttribute("data-activation-count")).toBe("1");
    const opens = getLogEntries().slice(baseline).filter((entry) => entry.event === "cumulus_entity_reveal_opened");
    const closes = getLogEntries().slice(baseline).filter((entry) => entry.event === "cumulus_entity_reveal_closed");
    expect(opens).toHaveLength(1);
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({ dismissalReason: "release", activationOutcome: "fired" });
    act(() => root.unmount());
  });
});
