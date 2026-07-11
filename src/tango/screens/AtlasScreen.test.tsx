// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TangoRoot } from "../TangoRoot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerName } from "../../types/layer-name";
import type { DreamscapeNode } from "../../types/quest";
import type { AtlasMapNode } from "../components/atlas/AtlasMap";
import type { AtlasNodeCard } from "../components/atlas/AtlasNodeReveal";
import { artRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { AtlasScreen, type AtlasView } from "./AtlasScreen";

/**
 * Stub matchMedia (jsdom lacks it; Pressable + useIsDesktop + the InfoCard
 * press engine read it). `fine` reports a fine pointer with hover (mouse /
 * desktop), so a plain `.click()` on a node selects it (the touch path selects
 * on pointer-up instead).
 */
function stubViewport(desktop: boolean, fine = true): void {
  window.matchMedia = ((query: string) => ({
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
  })) as unknown as typeof window.matchMedia;
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
  stubViewport(false);
});

afterEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: originalInnerWidth,
  });
  restorePrototypeDescriptor("clientWidth", originalClientWidth);
  restorePrototypeDescriptor("clientHeight", originalClientHeight);
  document.body.innerHTML = "";
});

let originalInnerWidth = 0;
let originalClientWidth: PropertyDescriptor | undefined;
let originalClientHeight: PropertyDescriptor | undefined;

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

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<TangoRoot>{element}</TangoRoot>);
  });
  return { container, root };
}

function makeNode(
  id: string,
  state: DreamscapeNode["state"],
  layer: LayerName,
): DreamscapeNode {
  return {
    id,
    layer,
    indexInLayer: 0,
    dreamscapeId: null,
    biomeName: "",
    biomeColor: "",
    sites: [],
    position: { x: 0, y: 0 },
    state,
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
  };
}

function emptyCard(): AtlasNodeCard {
  return {
    isUnrevealed: true,
    isBoss: false,
    sceneArt: null,
    figureArt: null,
    title: "An Unseen Dream",
    body: "An unseen dream.",
    dreamsign: null,
    placeName: null,
    guideName: null,
    siteName: null,
    affiliation: null,
    siteCard: null,
    affiliationCard: null,
  };
}

function residentCard(): AtlasNodeCard {
  return {
    isUnrevealed: false,
    isBoss: false,
    sceneArt: artRef.dreamscapeScene("wilderveil"),
    figureArt: artRef.dreamGuide("aldric"),
    title: "Aldric, the Seer",
    body: "Aldric offers curated visions of the future.",
    dreamsign: null,
    placeName: "The Glass Orchard",
    guideName: "Aldric, the Seer",
    siteName: "Dream Augury",
    affiliation: "Abandon",
    siteCard: {
      name: "Dream Augury",
      blurb: "Study a curated vision of what waits ahead.",
      icon: GLYPHS.water,
    },
    affiliationCard: {
      title: "Affiliation: Abandon",
      theme: "Abandon",
    },
  };
}

function nodeItem(
  id: string,
  state: DreamscapeNode["state"],
  layer: LayerName,
  extra: {
    isStarter?: boolean;
    isBoss?: boolean;
    card?: Partial<AtlasNodeCard>;
  } = {},
): AtlasMapNode {
  return {
    view: {
      node: makeNode(id, state, layer),
      left: 500,
      top: 400,
      size: 132,
      isStarter: extra.isStarter ?? false,
      isBoss: extra.isBoss ?? false,
      iconRef: null,
      siteBadgeGlyph: null,
      knownDreamsignRef: null,
    },
    card: {
      ...emptyCard(),
      isUnrevealed: !(extra.isBoss ?? false),
      isBoss: extra.isBoss ?? false,
      ...extra.card,
    },
  };
}

function makeView(): AtlasView {
  return {
    stageWidth: 1080,
    stageHeight: 1920,
    nodes: [
      nodeItem("starter", "completed", LayerName.One, { isStarter: true }),
      nodeItem("frontier", "available", LayerName.Two),
      nodeItem("boss", "revealedLocked", LayerName.Seven, { isBoss: true }),
    ],
    edges: [
      { key: "starter-frontier", x1: 500, y1: 210, x2: 500, y2: 900, kind: "open" },
    ],
    hud: { essence: 42, deck: 12, dreamsigns: [] },
  };
}

describe("Tango AtlasScreen", () => {
  it("renders every node and docks the HUD essence total", () => {
    const { container, root } = mount(
      <AtlasScreen view={makeView()} onEnterNode={vi.fn()} />,
    );

    expect(container.querySelector("[data-tango-atlas]")).not.toBeNull();
    expect(container.querySelectorAll("[data-node-state]")).toHaveLength(3);
    expect(container.querySelector("[data-node-starting]")).not.toBeNull();
    expect(container.querySelector("[data-node-boss]")).not.toBeNull();
    expect(container.textContent).toContain("42");

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
    view.nodes[1] = nodeItem("frontier", "available", LayerName.Two, {
      card: residentCard(),
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

    expect(document.body.textContent).toContain("Aldric, the Seer");
    expect(document.body.textContent).toContain("Dream Augury");
    expect(document.body.textContent).toContain(
      "Study a curated vision of what waits ahead.",
    );
    expect(document.body.textContent).toContain("Affiliation: Abandon");
    expect(document.body.textContent).toContain(
      "Abandon cards are more likely here.",
    );
    expect(document.body.textContent).not.toContain("The Glass Orchard");

    act(() => {
      root.unmount();
    });
  });
});
