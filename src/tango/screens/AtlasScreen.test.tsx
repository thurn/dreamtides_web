// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerName } from "../../types/layer-name";
import type { DreamscapeNode } from "../../types/quest";
import type { AtlasMapNode } from "../components/atlas/AtlasMap";
import type { AtlasPreviewModel } from "../components/atlas/AtlasPreview";
import { AtlasScreen, type AtlasView } from "./AtlasScreen";

/** Stub matchMedia (jsdom lacks it; Pressable + useIsDesktop read it). */
function stubViewport(desktop: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width") ? desktop : false,
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
  stubViewport(false);
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
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

function emptyPreview(): AtlasPreviewModel {
  return {
    anchorLeft: 0,
    anchorTop: 0,
    isUnrevealed: true,
    isBoss: false,
    bossSubtitle: null,
    bossDescription: null,
    dreamscapeName: null,
    sceneUrl: null,
    guideName: null,
    guidePortraitUrl: null,
    siteName: null,
    siteIconClass: null,
    bonusText: null,
    affiliationName: null,
  };
}

function nodeItem(
  id: string,
  state: DreamscapeNode["state"],
  layer: LayerName,
  extra: { isStarter?: boolean; isBoss?: boolean } = {},
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
    preview: { ...emptyPreview(), isBoss: extra.isBoss ?? false },
    dreamsign: null,
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
});
