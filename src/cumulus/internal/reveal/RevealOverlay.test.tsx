// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RevealOverlay, type RevealOverlayActive } from "./RevealOverlay";
import { makeTextRevealSpec } from "./test-utils";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { RevealGeometrySnapshot, RevealSpec } from "./model";
import type { RevealPlacementDecision } from "./geometry";
import { CumulusRoot } from "../../CumulusRoot";

const UUID = "00000000-0000-4000-8000-000000000001";
let root: Root;
let container: HTMLDivElement;
let resizeCallbacks: ResizeObserverCallback[];
let measuredPrimaryHeight: number;

function renderOverlay(element: ReactElement): void { root.render(<CumulusRoot>{element}</CumulusRoot>); }

function active(overrides: Partial<RevealOverlayActive> = {}): RevealOverlayActive {
  const source = document.createElement("button");
  source.getBoundingClientRect = () => ({ x: 400, y: 250, left: 400, top: 250, right: 500, bottom: 300, width: 100, height: 50, toJSON: () => ({}) });
  return {
    source: { identity: { entityType: "test", entityId: UUID }, registrationId: "one" },
    spec: makeTextRevealSpec("Primary", "Body", ["First", "Second"]), element: source,
    reason: "hover", sourceShowsCompleteGameCard: false, interactionId: 1,
    sourceRect: { x: 400, y: 250, width: 100, height: 50 }, modality: "mouse",
    ...overrides,
  };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 300, offsetLeft: 0, offsetTop: 0 } });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  resizeCallbacks = [];
  measuredPrimaryHeight = 100;
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.revealMeasure === "primary") return { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: measuredPrimaryHeight, width: 100, height: measuredPrimaryHeight, toJSON: () => ({}) };
    if (this.dataset.revealMeasure === "secondary") {
      const height = this.dataset.revealIndex === "0" ? 80 : 90;
      return { x: 0, y: 0, left: 0, top: 0, right: 80, bottom: height, width: 80, height, toJSON: () => ({}) };
    }
    return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});

afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ""; vi.restoreAllMocks(); delete (globalThis as Partial<typeof globalThis>).ResizeObserver; });

describe("RevealOverlay", () => {
  it("uses one highest-layer body portal that is pointer-transparent throughout", () => {
    act(() => renderOverlay(<RevealOverlay active={active()} />));
    const portal = document.body.querySelector<HTMLElement>(":scope > [data-cumulus-reveal-portal]")!;
    expect(portal).not.toBeNull();
    expect(portal.style.zIndex).toBe("var(--layer-reveal)");
    expect(portal.style.pointerEvents).toBe("none");
    expect([...portal.querySelectorAll<HTMLElement>("*")].every((node) => getComputedStyle(node).pointerEvents === "none")).toBe(true);
    expect(document.querySelectorAll("[data-cumulus-reveal-portal]")).toHaveLength(1);
  });

  it("measures invisibly, top-aligns the chosen complete prefix, and omits overflow", () => {
    act(() => renderOverlay(<RevealOverlay active={active()} />));
    const group = document.querySelector<HTMLElement>("[data-cumulus-reveal-group]")!;
    const cards = [...group.querySelectorAll<HTMLElement>("[data-cumulus-reveal-card]")];
    expect(group.style.visibility).toBe("visible");
    expect(cards).toHaveLength(3);
    expect(cards[0].style.top).toBe(cards[1].style.top);
    expect(Number.parseFloat(cards[2].style.top) + Number.parseFloat(cards[2].style.height)).toBeLessThanOrEqual(236);
    expect(document.querySelector<HTMLElement>("[data-reveal-measurement-layer]")?.style.visibility).toBe("hidden");
  });

  it("has no opacity, scale, or travel animation and disappears in one render frame", () => {
    act(() => renderOverlay(<RevealOverlay active={active()} />));
    const group = document.querySelector<HTMLElement>("[data-cumulus-reveal-group]")!;
    expect(group.style.opacity).toBe("");
    expect(group.style.transform).toBe("");
    expect(group.style.transition).toBe("");
    act(() => renderOverlay(<RevealOverlay active={null} />));
    expect(document.querySelector("[data-cumulus-reveal-portal]")).toBeNull();
  });

  it("keeps accessible descriptions on the focus source rather than announcing the visual copy", () => {
    act(() => renderOverlay(<RevealOverlay active={active()} />));
    const portal = document.querySelector<HTMLElement>("[data-cumulus-reveal-portal]")!;
    expect(portal.getAttribute("aria-hidden")).toBe("true");
    expect(portal.querySelector("[tabindex]")).toBeNull();
  });

  it("reports the captured visual viewport offsets used for placement", () => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { width: 1200, height: 300, offsetLeft: 7, offsetTop: 13 } });
    let placedGeometry: RevealGeometrySnapshot | undefined;
    const onPlaced = vi.fn((_decision: RevealPlacementDecision, geometry: RevealGeometrySnapshot) => { placedGeometry = geometry; });
    act(() => renderOverlay(<RevealOverlay active={active()} onPlaced={onPlaced} />));
    expect(onPlaced).toHaveBeenCalled();
    expect(placedGeometry?.viewport).toMatchObject({ offsetLeft: 7, offsetTop: 13 });
  });

  it("uses the sole 160ms GameCard return transition, skipped under reduced motion", () => {
    const returning = active({ returningGameCard: true });
    act(() => renderOverlay(<RevealOverlay active={returning} />));
    expect(document.querySelector<HTMLElement>("[data-cumulus-reveal-group]")!.style.transition).toBe("");
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    act(() => renderOverlay(<RevealOverlay active={{ ...returning, source: { ...returning.source, registrationId: "two" } }} />));
    expect(document.querySelector<HTMLElement>("[data-cumulus-reveal-group]")!.style.transition).toBe("");
  });

  it("waits for the genuinely asynchronous GameCard renderer and remeasures its resolved size", async () => {
    const cardId = asCardId(UUID);
    const spec: RevealSpec = { primary: { kind: "gameCard", cardId, displaySnapshot: {
      id: cardId, name: asCardName("Async Card"), cardNumber: 2, cardType: "Event", subtype: "",
      isStarter: false, rarity: "Special", energyCost: 1, spark: null, isFast: false, renderedText: "Resolve.", imageNumber: 2, artOwned: false,
    } }, secondaries: [] };
    let placedDecision: RevealPlacementDecision | undefined;
    const onPlaced = vi.fn((decision: RevealPlacementDecision) => { placedDecision = decision; });
    act(() => renderOverlay(<RevealOverlay active={active({ spec })} onPlaced={onPlaced} />));
    expect(document.querySelector("[data-reveal-render-pending]")).not.toBeNull();
    expect(onPlaced).not.toHaveBeenCalled();
    await act(async () => { await import("../../components/card/CardView"); });
    expect(document.querySelector("[data-reveal-render-pending]")).toBeNull();
    measuredPrimaryHeight = 240;
    act(() => { for (const callback of resizeCallbacks) callback([], {} as ResizeObserver); });
    expect(onPlaced).toHaveBeenCalledTimes(1);
    expect(placedDecision?.primaryRect.height).toBeCloseTo(816);
  });

  it("keeps a desktop GameCard source and reading copy visually unique", () => {
    const cardId = asCardId(UUID);
    const spec: RevealSpec = { primary: { kind: "gameCard", cardId, displaySnapshot: {
      id: cardId, name: asCardName("Reading Card"), cardNumber: 1, cardType: "Event", subtype: "",
      isStarter: false, rarity: "Special", energyCost: 1, spark: null, isFast: false, renderedText: "Draw a card.",
      imageNumber: 1, artOwned: false,
    } }, secondaries: [] };
    const value = active({ spec });
    act(() => renderOverlay(<RevealOverlay active={value} />));
    expect(value.element.style.opacity).toBe("0");
    act(() => renderOverlay(<RevealOverlay active={{ ...value, returningGameCard: true }} />));
    const returningCard = document.querySelector<HTMLElement>("[data-cumulus-reveal-card=\"primary\"]")!;
    expect(returningCard.style.left).toBe("400px");
    expect(returningCard.style.top).toBe("250px");
    expect(returningCard.style.width).toBe("100px");
    expect(returningCard.style.transition).toContain("160ms");
    act(() => renderOverlay(<RevealOverlay active={null} />));
    expect(value.element.style.opacity).toBe("");
  });
});
