import { assertLocalized } from "@trox/runtime";
// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CumulusRoot } from "../CumulusRoot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSource } from "../../runtime/localization/runtime";
import type {
  AtlasNodeModel,
  AtlasNodePrimary,
} from "../components/atlas/AtlasNode";
import { artRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import {
  AtlasScreen,
  type AtlasNodePlacementView,
  type AtlasView,
} from "./AtlasScreen";
import { testArtAssetKey } from "../../types/test-identities";
import { testPresentationId } from "../../types/test-identities";
import { parseAtlasNodeId } from "../../types/identifiers";
import { testDreamscapeId, testGuideId } from "../../types/test-identities";

/**
 * Stub matchMedia (jsdom lacks it; Pressable + useIsDesktop + the InfoCard
 * press engine read it). `fine` reports a fine pointer with hover (mouse /
 * desktop), so a plain `.click()` on a node selects it (the touch path selects
 * on pointer-up instead).
 */
function stubViewport(desktop: boolean, fine = true): void {
  window.matchMedia = (query: string) => ({
    matches: query.includes("min-width")
      ? desktop
      : query.includes("hover")
        ? fine
        : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  originalInnerWidth = window.innerWidth;
  originalClientWidth = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );
  originalClientHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  );
  originalVisualViewport = Object.getOwnPropertyDescriptor(
    window,
    "visualViewport",
  );
  stubViewport(false);
  class StubResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    StubResizeObserver;
});

afterEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: originalInnerWidth,
  });
  restorePrototypeDescriptor("clientWidth", originalClientWidth);
  restorePrototypeDescriptor("clientHeight", originalClientHeight);
  if (originalVisualViewport === undefined) {
    Reflect.deleteProperty(window, "visualViewport");
  } else {
    Object.defineProperty(window, "visualViewport", originalVisualViewport);
  }
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

let originalInnerWidth = 0;
let originalClientWidth: PropertyDescriptor | undefined;
let originalClientHeight: PropertyDescriptor | undefined;
let originalVisualViewport: PropertyDescriptor | undefined;

function restorePrototypeDescriptor(
  name: "clientWidth" | "clientHeight",
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, name);
    return;
  }
  Object.defineProperty(HTMLElement.prototype, name, descriptor);
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return { container, root };
}

function revealPointer(
  type: "pointerover" | "pointerout" | "pointerdown" | "pointercancel",
  pointerType: "mouse" | "touch",
  pointerId: number,
  point: { x: number; y: number },
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: point.x,
    clientY: point.y,
  });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: pointerId },
  });
  return event;
}

function domRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    width,
    height,
    toJSON: () => ({}),
  };
}

function mockRevealCardMeasurements(primary: {
  width: number;
  height: number;
}): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.dataset.revealMeasure === "primary") {
        return domRect(0, 0, primary.width, primary.height);
      }
      if (this.dataset.revealMeasure === "secondary") {
        return domRect(0, 0, 180, 120);
      }
      return domRect(0, 0, 0, 0);
    },
  );
}

function placedPrimary(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const primary = document.querySelector<HTMLElement>(
    '[data-cumulus-reveal-card="primary"]',
  )!;
  return {
    x: Number.parseFloat(primary.style.left),
    y: Number.parseFloat(primary.style.top),
    width: Number.parseFloat(primary.style.width),
    height: Number.parseFloat(primary.style.height),
  };
}

function emptyPrimary(): AtlasNodePrimary {
  return {
    sceneArt: null,
    figureArt: null,
    title: assertLocalized("An Unseen Dream"),
    body: assertLocalized("An unseen dream."),
    placeName: null,
    guideName: null,
  };
}

function residentModel(): Pick<
  AtlasNodeModel,
  "primary" | "dreamsign" | "site" | "affiliation"
> {
  return {
    primary: {
      sceneArt: artRef.dreamscapeScene(testDreamscapeId("wilderveil")),
      figureArt: artRef.dreamGuide(testGuideId("aldric")),
      title: assertLocalized("Aldric, the Seer"),
      body: assertLocalized("Aldric offers curated visions of the future."),
      placeName: assertLocalized("The Glass Orchard"),
      guideName: assertLocalized("Aldric, the Seer"),
    },
    dreamsign: null,
    site: {
      name: assertLocalized("Augury"),
      blurb: assertLocalized("Study a curated vision of what waits ahead."),
      icon: GLYPHS.water,
    },
    affiliation: {
      title: assertLocalized("Fixture affiliation"),
      body: assertLocalized("Fixture cards are more likely here."),
    },
  };
}

function nodeItem(
  idSeed: string,
  state: AtlasNodeModel["state"],
  extra: {
    role?: AtlasNodeModel["role"];
    semantic?: Partial<
      Pick<AtlasNodeModel, "primary" | "dreamsign" | "site" | "affiliation">
    >;
  } = {},
): AtlasNodePlacementView {
  const model: AtlasNodeModel = {
    id: parseAtlasNodeId(idSeed),
    name: assertLocalized(idSeed),
    state,
    role: extra.role ?? "regular",
    isReachable: true,
    iconRef: null,
    unrevealedFrameRef: artRef.atlasAsset(testArtAssetKey("fixture-frame.png")),
    siteBadgeGlyph: null,
    knownDreamsignRef: null,
    primary: extra.semantic?.primary ?? emptyPrimary(),
    dreamsign: extra.semantic?.dreamsign ?? null,
    site: extra.semantic?.site ?? null,
    affiliation: extra.semantic?.affiliation ?? null,
  };
  return { model, left: 500, top: 400, boxSize: 132 };
}

function makeView(): AtlasView {
  return {
    stageWidth: 1080,
    stageHeight: 1920,
    nodes: [
      nodeItem("starter", "completed", { role: "starter" }),
      nodeItem("frontier", "available"),
      nodeItem("boss", "revealedLocked", { role: "boss" }),
    ],
    edges: [
      {
        key: "starter-frontier",
        x1: 500,
        y1: 210,
        x2: 500,
        y2: 900,
        kind: "open",
      },
    ],
  };
}

describe("Cumulus AtlasScreen", () => {
  it("shows persistent Mira guidance one second after the Atlas loads", () => {
    vi.useFakeTimers();
    const onGuideDialogueShown = vi.fn();
    const view: AtlasView = {
      ...makeView(),
      guideDialogue: {
        id: testPresentationId("tutorial-run:atlas-guidance"),
        model: {
          portrait: { kind: "character-portrait", characterId: "mira" },
          portraitAlt: assertLocalized("Mira"),
          speakerName: assertLocalized("Mira"),
          text: assertLocalized(
            "On the [purple]Atlas[/purple] screen, choose a dream.",
          ),
        },
        delaySeconds: 1,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
      },
    };
    const { container, root } = mount(
      <AtlasScreen
        view={view}
        onEnterNode={vi.fn()}
        onGuideDialogueShown={onGuideDialogueShown}
      />,
    );
    const dialogue = () =>
      container.querySelector('[data-testid="atlas-tutorial-dialogue"]');
    expect(dialogue()?.getAttribute("data-character-dialogue-visible")).toBe(
      "false",
    );

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(dialogue()?.getAttribute("data-character-dialogue-visible")).toBe(
      "false",
    );
    expect(onGuideDialogueShown).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(dialogue()?.getAttribute("data-character-dialogue-visible")).toBe(
      "true",
    );
    expect(onGuideDialogueShown).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("renders every node and leaves persistent chrome to the router", () => {
    const { container, root } = mount(
      <AtlasScreen view={makeView()} onEnterNode={vi.fn()} />,
    );

    expect(container.querySelector("[data-cumulus-atlas]")).not.toBeNull();
    expect(container.querySelectorAll("[data-node-state]")).toHaveLength(3);
    expect(container.querySelector("[data-node-starting]")).not.toBeNull();
    expect(container.querySelector("[data-node-boss]")).not.toBeNull();
    const frontierPlacement = container.querySelector<HTMLElement>(
      '[data-atlas-node-placement="frontier"]',
    );
    expect(frontierPlacement?.style.left).toBe("500px");
    expect(frontierPlacement?.style.top).toBe("400px");
    expect(frontierPlacement?.style.width).toBe("132px");
    expect(frontierPlacement?.style.height).toBe("132px");
    expect(frontierPlacement?.style.transform).toBe("translate(-50%, -50%)");
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("reports the entered node when an available node is clicked", () => {
    const onEnterNode = vi.fn();
    const { container, root } = mount(
      <AtlasScreen view={makeView()} onEnterNode={onEnterNode} />,
    );

    const available = container.querySelector('[data-node-state="available"]');
    expect(available).not.toBeNull();
    act(() => {
      (available as HTMLElement).click();
    });
    expect(onEnterNode).toHaveBeenCalledWith("frontier");

    act(() => {
      root.unmount();
    });
  });

  it("places mobile top-left and top-right touches from transformed source rectangles outside stage clipping", async () => {
    stubViewport(false, false);
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { width: 390, height: 844, offsetLeft: 0, offsetTop: 0 },
    });
    mockRevealCardMeasurements({ width: 248, height: 200 });
    const { container, root } = mount(
      <AtlasScreen view={makeView()} onEnterNode={vi.fn()} />,
    );
    const source = container.querySelector<HTMLElement>(
      '[data-node-state="available"]',
    )!;
    const sourceRect = vi.fn(() => domRect(20, 40, 60, 60));
    source.getBoundingClientRect = sourceRect;

    await act(async () => {
      source.dispatchEvent(
        revealPointer("pointerdown", "touch", 31, { x: 30, y: 70 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-cumulus-reveal-card="primary"]'),
      ).not.toBeNull();
    });
    expect(placedPrimary()).toEqual({
      x: 201.5,
      y: 0,
      width: 175.5,
      height: 141.53225806451613,
    });
    expect(sourceRect).toHaveBeenCalled();
    expect(
      document.body.querySelector(":scope > [data-cumulus-reveal-portal]"),
    ).not.toBeNull();
    expect(container.querySelector("[data-cumulus-reveal-portal]")).toBeNull();

    act(() => {
      source.dispatchEvent(
        revealPointer("pointercancel", "touch", 31, { x: 30, y: 70 }),
      );
    });
    sourceRect.mockImplementation(() => domRect(310, 40, 60, 60));
    await act(async () => {
      source.dispatchEvent(
        revealPointer("pointerdown", "touch", 32, { x: 360, y: 70 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await vi.waitFor(() => expect(placedPrimary().x).toBe(13));
    expect(placedPrimary()).toEqual({
      x: 13,
      y: 0,
      width: 175.5,
      height: 141.53225806451613,
    });
    expect(
      document.body.querySelector(":scope > [data-cumulus-reveal-portal]"),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("uses desktop side fallback and follows actual source rect changes instead of stage-space coordinates", async () => {
    stubViewport(true, true);
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 },
    });
    mockRevealCardMeasurements({ width: 248, height: 260 });
    const view = makeView();
    expect(view.nodes[1].left).toBe(500);
    const { container, root } = mount(
      <AtlasScreen view={view} onEnterNode={vi.fn()} />,
    );
    const source = container.querySelector<HTMLElement>(
      '[data-node-state="available"]',
    )!;
    const sourceRect = vi.fn(() => domRect(100, 20, 60, 60));
    source.getBoundingClientRect = sourceRect;

    act(() => {
      source.dispatchEvent(
        revealPointer("pointerover", "mouse", 41, { x: 130, y: 50 }),
      );
    });
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-cumulus-reveal-card="primary"]'),
      ).not.toBeNull();
    });
    expect(placedPrimary()).toEqual({ x: 174, y: 20, width: 248, height: 260 });
    expect(
      document.body.querySelector(":scope > [data-cumulus-reveal-portal]"),
    ).not.toBeNull();
    expect(container.querySelector("[data-cumulus-reveal-portal]")).toBeNull();

    act(() => {
      source.dispatchEvent(
        revealPointer("pointerout", "mouse", 41, { x: 130, y: 50 }),
      );
    });
    sourceRect.mockImplementation(() => domRect(300, 20, 60, 60));
    act(() => {
      source.dispatchEvent(
        revealPointer("pointerover", "mouse", 42, { x: 330, y: 50 }),
      );
    });
    await vi.waitFor(() => expect(placedPrimary().x).toBe(374));
    expect(placedPrimary()).toEqual({ x: 374, y: 20, width: 248, height: 260 });
    expect(view.nodes[1].left).toBe(500);

    act(() => root.unmount());
  });

  it("reveals site and affiliation companion cards on a mobile press", () => {
    stubViewport(false, false);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 390,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 844,
    });
    const view = makeView();
    const resident = residentModel();
    view.nodes[1] = nodeItem("frontier", "available", {
      semantic: resident,
    });
    const { container, root } = mount(
      <AtlasScreen view={view} onEnterNode={vi.fn()} />,
    );

    const available = container.querySelector('[data-node-state="available"]');
    expect(available).not.toBeNull();
    act(() => {
      (available as HTMLElement).dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 195,
          clientY: 420,
        }),
      );
    });

    expect(document.body.textContent).toContain(
      resolveSource(resident.primary.guideName!),
    );
    expect(document.body.textContent).toContain(
      resolveSource(resident.site!.name),
    );
    expect(document.body.textContent).toContain(
      resolveSource(resident.site!.blurb),
    );
    expect(document.body.textContent).toContain(
      resolveSource(resident.affiliation!.title),
    );
    expect(document.body.textContent).toContain(
      resolveSource(resident.affiliation!.body),
    );
    expect(document.body.textContent).toContain(
      resolveSource(resident.primary.placeName!),
    );

    act(() => {
      root.unmount();
    });
  });
});
