import { assertLocalized } from "@trox/runtime";
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
import { CumulusRoot } from "../../CumulusRoot";
import { GLYPHS } from "../../primitives/glyph";
import { artRef } from "../../primitives/art";
import {
  testCardId,
  testDreamscapeId,
  testSemanticEntityId,
} from "../../../types/test-identities";

const UUID = testSemanticEntityId("00000000-0000-4000-8000-000000000001");
let root: Root;
let container: HTMLDivElement;
let resizeCallbacks: ResizeObserverCallback[];
let measuredPrimaryHeight: number;

function renderOverlay(element: ReactElement): void {
  root.render(<CumulusRoot>{element}</CumulusRoot>);
}

function active(
  overrides: Partial<RevealOverlayActive> = {},
): RevealOverlayActive {
  const source = document.createElement("button");
  source.getBoundingClientRect = () => ({
    x: 400,
    y: 250,
    left: 400,
    top: 250,
    right: 500,
    bottom: 300,
    width: 100,
    height: 50,
    toJSON: () => ({}),
  });
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

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { width: 1200, height: 300, offsetLeft: 0, offsetTop: 0 },
  });
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
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
      if (this.dataset.revealMeasure === "primary")
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 100,
          bottom: measuredPrimaryHeight,
          width: 100,
          height: measuredPrimaryHeight,
          toJSON: () => ({}),
        };
      if (this.dataset.revealMeasure === "secondary") {
        const height = this.dataset.revealIndex === "0" ? 80 : 90;
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 80,
          bottom: height,
          width: 80,
          height,
          toJSON: () => ({}),
        };
      }
      if (this.dataset.revealMeasure === "adjacent") {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 150,
          bottom: 225,
          width: 150,
          height: 225,
          toJSON: () => ({}),
        };
      }
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      };
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
  it("uses one highest-layer body portal that is pointer-transparent throughout", () => {
    act(() => renderOverlay(<RevealOverlay active={active()} />));
    const portal = document.body.querySelector<HTMLElement>(
      ":scope > [data-cumulus-reveal-portal]",
    )!;
    expect(portal).not.toBeNull();
    expect(portal.style.zIndex).toBe("var(--layer-reveal)");
    expect(portal.style.pointerEvents).toBe("none");
    expect(
      [...portal.querySelectorAll<HTMLElement>("*")].every(
        (node) => getComputedStyle(node).pointerEvents === "none",
      ),
    ).toBe(true);
    expect(
      document.querySelectorAll("[data-cumulus-reveal-portal]"),
    ).toHaveLength(1);
  });

  it("keeps a source reveal inside its nearest scrolling ancestor", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 250 },
      scrollHeight: { configurable: true, value: 500 },
    });
    scroller.getBoundingClientRect = () => ({
      x: 0,
      y: 50,
      left: 0,
      top: 50,
      right: 1200,
      bottom: 300,
      width: 1200,
      height: 250,
      toJSON: () => ({}),
    });
    const source = document.createElement("button");
    source.getBoundingClientRect = () => ({
      x: 400,
      y: 120,
      left: 400,
      top: 120,
      right: 500,
      bottom: 170,
      width: 100,
      height: 50,
      toJSON: () => ({}),
    });
    scroller.append(source);
    document.body.append(scroller);

    act(() =>
      renderOverlay(
        <RevealOverlay
          active={active({
            element: source,
            sourceRect: { x: 400, y: 120, width: 100, height: 50 },
            spec: {
              primary: {
                kind: "galleryAction",
                action: {
                  glyph: GLYPHS.spark,
                  label: assertLocalized("Inspect"),
                },
              },
              secondaries: [],
            },
          })}
        />,
      ),
    );

    expect(
      document.querySelector<HTMLElement>(
        '[data-cumulus-reveal-card="primary"]',
      )?.style.top,
    ).toBe("50px");
  });

  it("places a reveal outside its nearest semantic anchor", () => {
    const anchor = document.createElement("section");
    anchor.dataset.cumulusRevealAnchor = "";
    anchor.getBoundingClientRect = () => ({
      x: 12,
      y: 50,
      left: 12,
      top: 50,
      right: 412,
      bottom: 250,
      width: 400,
      height: 200,
      toJSON: () => ({}),
    });
    const source = document.createElement("button");
    anchor.append(source);
    document.body.append(anchor);
    let placedDecision: RevealPlacementDecision | undefined;
    let placedGeometry: RevealGeometrySnapshot | undefined;
    const onPlaced = vi.fn(
      (decision: RevealPlacementDecision, geometry: RevealGeometrySnapshot) => {
        placedDecision = decision;
        placedGeometry = geometry;
      },
    );

    act(() =>
      renderOverlay(
        <RevealOverlay
          active={active({
            element: source,
            sourceRect: { x: 27, y: 150, width: 370, height: 69 },
            sourceRemainsVisible: true,
            spec: makeTextRevealSpec("Primary", "Body"),
          })}
          onPlaced={onPlaced}
        />,
      ),
    );

    expect(placedDecision?.primaryRect.x).toBe(426);
    expect(placedGeometry?.sourceRect).toEqual({
      x: 12,
      y: 50,
      width: 400,
      height: 200,
    });
  });

  it("measures invisibly, side-aligns the chosen complete prefix, and omits overflow", () => {
    act(() => renderOverlay(<RevealOverlay active={active()} />));
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
    let placedDecision: RevealPlacementDecision | undefined;
    const onPlaced = vi.fn((decision: RevealPlacementDecision) => {
      placedDecision = decision;
    });
    act(() =>
      renderOverlay(
        <RevealOverlay
          active={active({
            placementException: "augury-offer-above-source",
            spec: makeTextRevealSpec("Primary", "Body"),
          })}
          onPlaced={onPlaced}
        />,
      ),
    );

    expect(placedDecision?.family).toBe("desktop-augury-above-source");
    expect(placedDecision?.primaryRect).toMatchObject({ x: 400, y: 136 });
  });

  it("places the Augury reveal against the viewport instead of its horizontal offer row", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { width: 390, height: 844, offsetLeft: 0, offsetTop: 0 },
    });
    const row = document.createElement("div");
    row.style.overflowX = "auto";
    row.getBoundingClientRect = () => ({
      x: 6,
      y: 412,
      left: 6,
      top: 412,
      right: 384,
      bottom: 658,
      width: 378,
      height: 246,
      toJSON: () => ({}),
    });
    const source = document.createElement("button");
    row.append(source);
    document.body.append(row);
    let geometry: RevealGeometrySnapshot | undefined;

    act(() =>
      renderOverlay(
        <RevealOverlay
          active={active({
            element: source,
            placementException: "augury-offer-above-source",
            reason: "press",
            sourceRect: { x: 75, y: 412, width: 240, height: 240 },
            modality: "touch",
          })}
          onPlaced={(_decision, placedGeometry) => {
            geometry = placedGeometry;
          }}
        />,
      ),
    );

    expect(geometry?.viewport.boundary).toBeUndefined();
    expect(geometry?.finalRects.primary.y).toBeLessThan(412);
  });

  it("reserves the atlas reveal's full native width before placing secondaries", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (
          this.dataset.revealMeasure === "primary" ||
          this.dataset.revealMeasure === "secondary"
        ) {
          const width = Number.parseFloat(this.style.width);
          const height = this.dataset.revealMeasure === "primary" ? 180 : 80;
          return {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: width,
            bottom: height,
            width,
            height,
            toJSON: () => ({}),
          };
        }
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        };
      },
    );
    const spec: RevealSpec = {
      primary: {
        kind: "infoCard",
        card: {
          variant: "atlasReveal",
          image: artRef.dreamscapeScene(testDreamscapeId("wilderveil")),
          title: assertLocalized("Wilderveil"),
        },
      },
      secondaries: [
        {
          variant: "text",
          title: assertLocalized("Affiliation"),
          body: {
            kind: "plain",
            text: assertLocalized("Character cards are more likely here."),
          },
        },
      ],
    };

    act(() => renderOverlay(<RevealOverlay active={active({ spec })} />));

    const measuredPrimary = document.querySelector<HTMLElement>(
      '[data-reveal-measure="primary"]',
    )!;
    const primary = document.querySelector<HTMLElement>(
      '[data-cumulus-reveal-card="primary"]',
    )!;
    const secondary = document.querySelector<HTMLElement>(
      '[data-cumulus-reveal-card="secondary"]',
    )!;
    const primaryRight =
      Number.parseFloat(primary.style.left) +
      Number.parseFloat(primary.style.width);

    expect(measuredPrimary.style.width).toBe("360px");
    expect(primary.style.width).toBe("360px");
    expect(Number.parseFloat(secondary.style.left) - primaryRight).toBe(10);
  });

  it("keeps complete source content in place and stacks all definition cards in one column", () => {
    const spec: RevealSpec = {
      primary: {
        kind: "source",
        description: assertLocalized("Complete ability text"),
      },
      secondaries: [
        {
          variant: "text",
          title: assertLocalized("First"),
          body: { kind: "plain", text: assertLocalized("First definition") },
        },
        {
          variant: "text",
          title: assertLocalized("Second"),
          body: { kind: "plain", text: assertLocalized("Second definition") },
        },
      ],
    };
    act(() => renderOverlay(<RevealOverlay active={active({ spec })} />));
    expect(
      document.querySelector('[data-cumulus-reveal-card="primary"]'),
    ).toBeNull();
    const definitions = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-cumulus-reveal-card="secondary"]',
      ),
    ];
    expect(definitions).toHaveLength(2);
    expect(definitions[0].style.left).toBe(definitions[1].style.left);
    expect(Number.parseFloat(definitions[1].style.top)).toBeGreaterThan(
      Number.parseFloat(definitions[0].style.top),
    );
    const lastDefinition = definitions[definitions.length - 1];
    expect(
      Number.parseFloat(lastDefinition.style.top) +
        Number.parseFloat(lastDefinition.style.height),
    ).toBe(300);
  });

  it("has no opacity, scale, or travel animation and disappears in one render frame", () => {
    act(() => renderOverlay(<RevealOverlay active={active()} />));
    const group = document.querySelector<HTMLElement>(
      "[data-cumulus-reveal-group]",
    )!;
    expect(group.style.opacity).toBe("");
    expect(group.style.transform).toBe("");
    expect(group.style.transition).toBe("");
    act(() => renderOverlay(<RevealOverlay active={null} />));
    expect(document.querySelector("[data-cumulus-reveal-portal]")).toBeNull();
  });

  it("keeps accessible descriptions on the focus source rather than announcing the visual copy", () => {
    act(() => renderOverlay(<RevealOverlay active={active()} />));
    const portal = document.querySelector<HTMLElement>(
      "[data-cumulus-reveal-portal]",
    )!;
    expect(portal.getAttribute("aria-hidden")).toBe("true");
    expect(portal.querySelector("[tabindex]")).toBeNull();
  });

  it("omits adjacent tangible previews from the mobile reveal branch", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { width: 390, height: 844, offsetLeft: 0, offsetTop: 0 },
    });
    const cardId = testCardId(UUID);
    const spec: RevealSpec = {
      ...makeTextRevealSpec("Primary", "Body"),
      adjacentCards: [
        {
          kind: "gameCard",
          cardId,
          displaySnapshot: {
            id: cardId,
            name: parseCardName("Warrior"),
            cardNumber: 1,
            cardType: "Character",
            subtype: "Warrior",
            isStarter: false,
            energyCost: 0,
            spark: 1,
            isFast: false,
            renderedText: "",
            imageNumber: 1,
            artOwned: false,
          },
          figment: true,
        },
      ],
    };
    act(() => renderOverlay(<RevealOverlay active={active({ spec })} />));
    expect(
      document.querySelector('[data-reveal-measure="adjacent"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-cumulus-reveal-card="adjacent"]'),
    ).toBeNull();
  });

  it("reports the captured visual viewport offsets used for placement", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { width: 1200, height: 300, offsetLeft: 7, offsetTop: 13 },
    });
    let placedGeometry: RevealGeometrySnapshot | undefined;
    const onPlaced = vi.fn(
      (
        _decision: RevealPlacementDecision,
        geometry: RevealGeometrySnapshot,
      ) => {
        placedGeometry = geometry;
      },
    );
    act(() =>
      renderOverlay(<RevealOverlay active={active()} onPlaced={onPlaced} />),
    );
    expect(onPlaced).toHaveBeenCalled();
    expect(placedGeometry?.viewport).toMatchObject({
      offsetLeft: 7,
      offsetTop: 13,
    });
  });

  it("waits for the genuinely asynchronous GameCard renderer and remeasures its resolved size", async () => {
    const cardId = testCardId(UUID);
    const spec: RevealSpec = {
      primary: {
        kind: "gameCard",
        cardId,
        displaySnapshot: {
          id: cardId,
          name: parseCardName("Async Card"),
          cardNumber: 2,
          cardType: "Event",
          subtype: "",
          isStarter: false,
          rarity: "Special",
          energyCost: 1,
          spark: null,
          isFast: false,
          renderedText: "Resolve.",
          imageNumber: 2,
          artOwned: false,
        },
      },
      secondaries: [],
    };
    let placedDecision: RevealPlacementDecision | undefined;
    const onPlaced = vi.fn((decision: RevealPlacementDecision) => {
      placedDecision = decision;
    });
    act(() =>
      renderOverlay(
        <RevealOverlay active={active({ spec })} onPlaced={onPlaced} />,
      ),
    );
    expect(
      document.querySelector("[data-reveal-render-pending]"),
    ).not.toBeNull();
    expect(onPlaced).not.toHaveBeenCalled();
    await act(async () => {
      await import("../../components/card/CardView");
    });
    expect(document.querySelector("[data-reveal-render-pending]")).toBeNull();
    measuredPrimaryHeight = 240;
    act(() => {
      for (const callback of resizeCallbacks)
        callback([], {} as ResizeObserver);
    });
    expect(onPlaced).toHaveBeenCalledTimes(1);
    expect(placedDecision?.primaryRect.height).toBeCloseTo(
      DESKTOP_GAME_CARD_WIDTH * (measuredPrimaryHeight / 100),
    );
  });

  it("keeps a desktop GameCard source and reading copy visually unique", () => {
    const cardId = testCardId(UUID);
    const spec: RevealSpec = {
      primary: {
        kind: "gameCard",
        cardId,
        displaySnapshot: {
          id: cardId,
          name: parseCardName("Reading Card"),
          cardNumber: 1,
          cardType: "Event",
          subtype: "",
          isStarter: false,
          rarity: "Special",
          energyCost: 1,
          spark: null,
          isFast: false,
          renderedText: "Draw a card.",
          imageNumber: 1,
          artOwned: false,
        },
      },
      secondaries: [],
    };
    const value = active({ spec });
    act(() => renderOverlay(<RevealOverlay active={value} />));
    expect(value.element.style.opacity).toBe("0");
    act(() => renderOverlay(<RevealOverlay active={null} />));
    expect(value.element.style.opacity).toBe("");
  });

  it("keeps a preview control visible while placing its GameCard beside it", () => {
    const cardId = testCardId(UUID);
    const spec: RevealSpec = {
      primary: {
        kind: "gameCard",
        cardId,
        displaySnapshot: {
          id: cardId,
          name: parseCardName("Referenced Card"),
          cardNumber: 1,
          cardType: "Event",
          subtype: "",
          isStarter: false,
          rarity: "Special",
          energyCost: 1,
          spark: null,
          isFast: false,
          renderedText: "Draw a card.",
          imageNumber: 1,
          artOwned: false,
        },
      },
      secondaries: [],
    };
    const value = active({
      spec,
      sourceRemainsVisible: true,
      sourceRect: { x: 29, y: 200, width: 366, height: 53 },
    });

    act(() => renderOverlay(<RevealOverlay active={value} />));

    const preview = document.querySelector<HTMLElement>(
      '[data-cumulus-reveal-card="primary"]',
    )!;
    expect(value.element.style.opacity).toBe("");
    expect(Number.parseFloat(preview.style.left)).toBeGreaterThanOrEqual(409);
  });

  it("renders every copy in an exact repeated-card entity reveal", async () => {
    const cardId = testCardId(UUID);
    const spec: RevealSpec = {
      primary: {
        kind: "gameCard",
        cardId,
        copies: 3,
        displaySnapshot: {
          id: cardId,
          name: parseCardName("Repeated Card"),
          cardNumber: 1,
          cardType: "Event",
          subtype: "",
          isStarter: false,
          rarity: "Special",
          energyCost: 1,
          spark: null,
          isFast: false,
          renderedText: "Draw a card.",
          imageNumber: 1,
          artOwned: false,
        },
      },
      secondaries: [],
    };
    await act(async () => {
      await import("../../components/card/CardView");
      renderOverlay(
        <RevealOverlay active={active({ spec, sourceRemainsVisible: true })} />,
      );
    });
    const measured = document.querySelector<HTMLElement>(
      '[data-reveal-measure="primary"]',
    );
    expect(Number.parseFloat(measured?.style.width ?? "0")).toBe(
      DESKTOP_GAME_CARD_WIDTH * 1.5,
    );
    expect(
      measured?.querySelectorAll("[data-reveal-game-card-copy]"),
    ).toHaveLength(3);
    expect(
      measured?.querySelector("[data-reveal-game-card-copy-count='3']"),
    ).not.toBeNull();
  });
});
