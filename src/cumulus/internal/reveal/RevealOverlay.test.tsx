// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RevealOverlay, type RevealOverlayActive } from "./RevealOverlay";
import { makeTextRevealSpec } from "./test-utils";
import { parseCardName } from "../../../types/card-identity";
import type { RevealGeometrySnapshot, RevealSpec } from "./model";
import {
  DESKTOP_GAME_CARD_WIDTH,
  type RevealPlacementDecision,
} from "./geometry";
import { captureVisualViewport, findRevealBoundary } from "./viewport";
import { CumulusRoot } from "../../CumulusRoot";
import { GLYPHS } from "../../primitives/glyph";
import { testCardId, testSemanticEntityId } from "../../../types/test-identities";

const UUID = testSemanticEntityId("00000000-0000-4000-8000-000000000001");
let root: Root;
let container: HTMLDivElement;
let resizeCallbacks: ResizeObserverCallback[];
let measuredPrimaryHeight: number;

function domRect(x: number, y: number, width: number, height: number): DOMRect {
  return DOMRect.fromRect({ x, y, width, height });
}

function setViewport(width: number, height: number, offsetLeft = 0, offsetTop = 0): void {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { width, height, offsetLeft, offsetTop },
  });
}

function renderOverlay(element: ReactElement): void {
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
}

function gameCardSpec(copies?: number): RevealSpec {
  const cardId = testCardId(UUID);
  return {
    primary: {
      kind: "gameCard",
      cardId,
      ...(copies === undefined ? {} : { copies }),
      displaySnapshot: {
        id: cardId,
        name: parseCardName("Fixture Card"),
        cardNumber: 1,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        rarity: "Special",
        energyCost: 1,
        spark: null,
        isFast: false,
        renderedText: "Fixture text.",
        imageNumber: 1,
        artOwned: false,
      },
    },
    secondaries: [],
  };
}

function active(
  overrides: Partial<RevealOverlayActive> = {},
): RevealOverlayActive {
  const source = document.createElement("button");
  source.getBoundingClientRect = () => domRect(400, 250, 100, 50);
  return {
    source: {
      identity: { entityType: "test", entityId: UUID },
      registrationId: "cumulus-reveal-source-one",
    },
    spec: makeTextRevealSpec("Primary", "Body", ["First", "Second"]),
    element: source,
    reason: "hover",
    sourceShowsCompleteGameCard: false,
    sourceIsBattlefieldGameCard: false,
    sourceRemainsVisible: false,
    interactionId: 1,
    sourceRect: { x: 400, y: 250, width: 100, height: 50 },
    modality: "mouse",
    ...overrides,
  };
}

interface PlacedProbe {
  readonly onPlaced: (
    decision: RevealPlacementDecision,
    geometry: RevealGeometrySnapshot,
  ) => void;
  decision?: RevealPlacementDecision;
  geometry?: RevealGeometrySnapshot;
  calls: number;
}

function placed(): PlacedProbe {
  const probe: PlacedProbe = {
    calls: 0,
    onPlaced: (decision, geometry) => {
      probe.decision = decision;
      probe.geometry = geometry;
      probe.calls += 1;
    },
  };
  return probe;
}

function revealCards(kind: "primary" | "secondary" | "adjacent"): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      `[data-cumulus-reveal-card="${kind}"]`,
    ),
  ];
}

beforeEach(() => {
  setViewport(1200, 300);
  resizeCallbacks = [];
  measuredPrimaryHeight = 100;
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      resizeCallbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const measure = this.dataset.revealMeasure;
      if (measure === "primary") return domRect(0, 0, 100, measuredPrimaryHeight);
      if (measure === "secondary")
        return domRect(0, 0, 80, this.dataset.revealIndex === "0" ? 80 : 90);
      if (measure === "adjacent") return domRect(0, 0, 150, 225);
      return domRect(0, 0, 0, 0);
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  delete (globalThis as Partial<typeof globalThis>).ResizeObserver;
});

describe("RevealOverlay", () => {
  it("uses one aria-hidden, pointer-transparent body portal that disappears in one render", () => {
    renderOverlay(<RevealOverlay active={active()} />);
    const portals = document.body.querySelectorAll<HTMLElement>(
      ":scope > [data-cumulus-reveal-portal]",
    );
    expect(portals).toHaveLength(1);
    const portal = portals[0];
    expect(portal.getAttribute("aria-hidden")).toBe("true");
    expect(portal.querySelector("[tabindex]")).toBeNull();
    expect(
      [portal, ...portal.querySelectorAll<HTMLElement>("*")].every(
        (node) => getComputedStyle(node).pointerEvents === "none",
      ),
    ).toBe(true);
    renderOverlay(<RevealOverlay active={null} />);
    expect(document.querySelector("[data-cumulus-reveal-portal]")).toBeNull();
  });

  it("keeps a source reveal inside its nearest scrolling ancestor", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 250 },
      scrollHeight: { configurable: true, value: 500 },
    });
    scroller.getBoundingClientRect = () => domRect(0, 50, 1200, 250);
    const source = document.createElement("button");
    source.getBoundingClientRect = () => domRect(400, 120, 100, 50);
    scroller.append(source);
    document.body.append(scroller);

    renderOverlay(
      <RevealOverlay
        active={active({
          element: source,
          sourceRect: { x: 400, y: 120, width: 100, height: 50 },
          spec: {
            primary: {
              kind: "galleryAction",
              action: { glyph: GLYPHS.spark, label: "Inspect" },
            },
            secondaries: [],
          },
        })}
      />,
    );

    expect(revealCards("primary")[0]?.style.top).toBe("50px");
  });

  it("places a reveal outside its nearest semantic anchor", () => {
    const anchor = document.createElement("section");
    anchor.dataset.cumulusRevealAnchor = "";
    anchor.getBoundingClientRect = () => domRect(12, 50, 400, 200);
    const source = document.createElement("button");
    anchor.append(source);
    document.body.append(anchor);
    const probe = placed();

    renderOverlay(
      <RevealOverlay
        active={active({
          element: source,
          sourceRect: { x: 27, y: 150, width: 370, height: 69 },
          sourceRemainsVisible: true,
          spec: makeTextRevealSpec("Primary", "Body"),
        })}
        onPlaced={probe.onPlaced}
      />,
    );

    expect(probe.decision?.primaryRect.x).toBe(426);
    expect(probe.geometry?.sourceRect).toEqual({
      x: 12,
      y: 50,
      width: 400,
      height: 200,
    });
  });

  it("measures invisibly and side-aligns the chosen complete prefix", () => {
    renderOverlay(<RevealOverlay active={active()} />);
    const group = document.querySelector<HTMLElement>(
      "[data-cumulus-reveal-group]",
    )!;
    const cards = [
      ...group.querySelectorAll<HTMLElement>("[data-cumulus-reveal-card]"),
    ];
    expect(group.style.visibility).toBe("visible");
    expect(cards).toHaveLength(2);
    expect(cards[0].style.top).toBe(cards[1].style.top);
    expect(cards[0].style.left).toBe("514px");
    expect(cards[1].style.left).toBe("624px");
    expect(
      document.querySelector<HTMLElement>("[data-reveal-measurement-layer]")
        ?.style.visibility,
    ).toBe("hidden");
  });

  it("passes the one-off Augury placement exception through measurement", () => {
    const probe = placed();
    renderOverlay(
      <RevealOverlay
        active={active({
          placementException: "augury-offer-above-source",
          spec: makeTextRevealSpec("Primary", "Body"),
        })}
        onPlaced={probe.onPlaced}
      />,
    );

    expect(probe.decision?.family).toBe("desktop-augury-above-source");
    expect(probe.decision?.primaryRect).toMatchObject({ x: 400, y: 136 });
  });

  it("places the Augury reveal against the viewport instead of its horizontal offer row", () => {
    setViewport(390, 844);
    const row = document.createElement("div");
    row.style.overflowX = "auto";
    row.getBoundingClientRect = () => domRect(6, 412, 378, 246);
    const source = document.createElement("button");
    row.append(source);
    document.body.append(row);
    const probe = placed();

    renderOverlay(
      <RevealOverlay
        active={active({
          element: source,
          placementException: "augury-offer-above-source",
          reason: "press",
          sourceRect: { x: 75, y: 412, width: 240, height: 240 },
          modality: "touch",
        })}
        onPlaced={probe.onPlaced}
      />,
    );

    expect(probe.geometry?.viewport.boundary).toBeUndefined();
    expect(probe.geometry?.finalRects.primary.y).toBeLessThan(412);
  });

  it("keeps complete source content in place and stacks all definition cards in one column", () => {
    const spec: RevealSpec = {
      primary: { kind: "source", description: "Complete ability text" },
      secondaries: makeTextRevealSpec("Primary", "Body", ["First", "Second"])
        .secondaries,
    };
    renderOverlay(<RevealOverlay active={active({ spec })} />);
    expect(revealCards("primary")).toHaveLength(0);
    const definitions = revealCards("secondary");
    expect(definitions).toHaveLength(2);
    expect(definitions[0].style.left).toBe(definitions[1].style.left);
    expect(Number.parseFloat(definitions[1].style.top)).toBeGreaterThan(
      Number.parseFloat(definitions[0].style.top),
    );
    expect(
      Number.parseFloat(definitions[1].style.top) +
        Number.parseFloat(definitions[1].style.height),
    ).toBe(300);
  });

  it("omits adjacent tangible previews from the mobile reveal branch", () => {
    setViewport(390, 844);
    const card = gameCardSpec().primary;
    if (card.kind !== "gameCard") throw new Error("expected a GameCard spec");
    const spec: RevealSpec = {
      ...makeTextRevealSpec("Primary", "Body"),
      adjacentCards: [{ ...card, figment: true }],
    };
    renderOverlay(<RevealOverlay active={active({ spec })} />);
    expect(document.querySelector('[data-reveal-measure="adjacent"]')).toBeNull();
    expect(revealCards("adjacent")).toHaveLength(0);
  });

  it("reports the captured visual viewport offsets used for placement", () => {
    setViewport(1200, 300, 7, 13);
    const probe = placed();
    renderOverlay(<RevealOverlay active={active()} onPlaced={probe.onPlaced} />);
    expect(probe.geometry?.viewport).toMatchObject({
      offsetLeft: 7,
      offsetTop: 13,
    });
  });

  it("waits for the asynchronous GameCard renderer and remeasures its resolved size", async () => {
    const probe = placed();
    renderOverlay(
      <RevealOverlay active={active({ spec: gameCardSpec() })} onPlaced={probe.onPlaced} />,
    );
    expect(document.querySelector("[data-reveal-render-pending]")).not.toBeNull();
    expect(probe.calls).toBe(0);
    await act(async () => {
      await import("../../components/card/CardView");
    });
    expect(document.querySelector("[data-reveal-render-pending]")).toBeNull();
    measuredPrimaryHeight = 240;
    act(() => {
      for (const callback of resizeCallbacks) callback([], {} as ResizeObserver);
    });
    expect(probe.calls).toBe(1);
    expect(probe.decision?.primaryRect.height).toBeCloseTo(
      DESKTOP_GAME_CARD_WIDTH * (measuredPrimaryHeight / 100),
    );
  });

  it("hides a desktop GameCard source while its reading copy is shown", () => {
    const value = active({ spec: gameCardSpec() });
    renderOverlay(<RevealOverlay active={value} />);
    expect(value.element.style.opacity).toBe("0");
    renderOverlay(<RevealOverlay active={null} />);
    expect(value.element.style.opacity).toBe("");
  });

  it("keeps a preview control visible while placing its GameCard beside it", () => {
    const value = active({
      spec: gameCardSpec(),
      sourceRemainsVisible: true,
      sourceRect: { x: 29, y: 200, width: 366, height: 53 },
    });

    renderOverlay(<RevealOverlay active={value} />);

    expect(value.element.style.opacity).toBe("");
    expect(
      Number.parseFloat(revealCards("primary")[0]?.style.left ?? "0"),
    ).toBeGreaterThanOrEqual(409);
  });

  it("renders every copy in an exact repeated-card entity reveal", async () => {
    await act(async () => {
      await import("../../components/card/CardView");
      root.render(
        <CumulusRoot>
          <RevealOverlay
            active={active({ spec: gameCardSpec(3), sourceRemainsVisible: true })}
          />
        </CumulusRoot>,
      );
    });
    const measured = document.querySelector<HTMLElement>(
      '[data-reveal-measure="primary"]',
    );
    expect(measured?.querySelectorAll("[data-reveal-game-card-copy]")).toHaveLength(3);
  });
});

describe("captureVisualViewport", () => {
  function statusBar(rect: DOMRect, variant?: string): HTMLElement {
    const bar = document.createElement("div");
    bar.dataset.journeyStatusBarAnchor = "";
    if (variant !== undefined) bar.dataset.journeyStatusBarVariant = variant;
    bar.getBoundingClientRect = () => rect;
    document.body.append(bar);
    return bar;
  }

  it.each([[899, "mobile"], [900, "desktop"]] as const)(
    "classifies %ipx as %s and reads safe-area insets into a frozen snapshot",
    (width, layout) => {
      const style = document.documentElement.style;
      const insets = { top: 11, right: 3, bottom: 17, left: 5 };
      for (const [side, value] of Object.entries(insets))
        style.setProperty(`--safe-area-inset-${side}`, `${String(value)}px`);
      setViewport(width, 700, 7, 13);
      const snapshot = captureVisualViewport();
      for (const side of Object.keys(insets))
        style.removeProperty(`--safe-area-inset-${side}`);
      expect(snapshot).toEqual({
        layout,
        width,
        height: 700,
        offsetLeft: 7,
        offsetTop: 13,
        safeArea: insets,
      });
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot.safeArea)).toBe(true);
    },
  );

  it("captures the visible rectangle of an application reveal boundary", () => {
    setViewport(1200, 700, 7, 13);
    const boundary = document.createElement("div");
    boundary.getBoundingClientRect = () => domRect(20, 118, 1160, 562);
    const snapshot = captureVisualViewport(window, boundary);
    expect(snapshot.boundary).toEqual({ x: 20, y: 118, width: 1160, height: 562 });
    expect(Object.isFrozen(snapshot.boundary)).toBe(true);
  });

  it("reserves the journey status bar band on desktop only, and never for the battle HUD", () => {
    setViewport(1200, 700, 7, 13);
    const bar = statusBar(domRect(0, 610, 1207, 103));
    expect(captureVisualViewport().boundary).toEqual({ x: 7, y: 13, width: 1200, height: 597 });
    bar.remove();

    setViewport(390, 700);
    const mobileBar = statusBar(domRect(0, 610, 390, 90));
    expect(captureVisualViewport().boundary).toBeUndefined();
    mobileBar.remove();

    setViewport(1200, 700);
    statusBar(domRect(0, 610, 1200, 90), "battle");
    expect(captureVisualViewport().boundary).toBeUndefined();
  });

  it("uses the nearest scrolling ancestor as the reveal boundary and ignores one that fits", () => {
    const scroller = document.createElement("div");
    const source = document.createElement("button");
    scroller.style.overflowY = "auto";
    let scrollHeight = 200;
    Object.defineProperties(scroller, {
      clientHeight: { value: 100 },
      scrollHeight: { get: () => scrollHeight },
    });
    scroller.append(source);
    document.body.append(scroller);

    expect(findRevealBoundary(source)).toBe(scroller);
    scrollHeight = 100;
    expect(findRevealBoundary(source)).toBeNull();
  });
});
