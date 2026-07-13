// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DreamscapeScreen, type DreamscapeView } from "./DreamscapeScreen";
import type { DreamscapeSiteModel } from "../components/dreamscape/SiteNode";
import { glyph } from "../primitives/glyph";
import { artRef } from "../primitives/art";
import type { SiteState } from "../../types/quest";
import { CumulusRoot } from "../CumulusRoot";

function siteModel(
  site: SiteState,
  overrides: Partial<Omit<DreamscapeSiteModel, "site">> = {},
): DreamscapeSiteModel {
  return {
    site,
    pos: { x: 40, y: 40 },
    index: 0,
    isBattle: site.type === "Battle",
    isLocked: false,
    isInteractive: !site.isVisited,
    label: site.type,
    blurb: "Remove cards from your deck.",
    icon: glyph("bxf bx-hot"),
    ...overrides,
  };
}

function siteState(id: string, overrides: Partial<SiteState> = {}): SiteState {
  return {
    id,
    type: "Purge",
    isEnhanced: false,
    isVisited: false,
    ...overrides,
  };
}

const VIEW: DreamscapeView = {
  scene: artRef.dreamscapeScene("ember_wood"),
  title: "Ember Wood",
  sites: [
    siteModel(siteState("s-purge")),
    siteModel(siteState("s-draft", { type: "Draft" }), { label: "Draft 5x" }),
    siteModel(siteState("s-visited", { type: "Shop", isVisited: true })),
  ],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  class StubResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    StubResizeObserver;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("DreamscapeScreen", () => {
  it("renders the scene, one node per unvisited site, and drops visited sites", () => {
    act(() => {
      root.render(
        <CumulusRoot><DreamscapeScreen view={VIEW} onSelectSite={() => undefined} /></CumulusRoot>,
      );
    });
    expect(container.querySelector("[data-cumulus-dreamscape]")).not.toBeNull();
    const scene = container.querySelector("img");
    expect(scene?.getAttribute("alt")).toBe("Ember Wood");
    const nodes = container.querySelectorAll("[data-site-id]");
    expect(nodes).toHaveLength(2);
    expect(container.querySelector('[data-site-id="s-visited"]')).toBeNull();
    expect(container.querySelector('[data-site-id="s-draft"]')).not.toBeNull();
  });

  it("leaves persistent quest chrome to the router-owned wrapper", () => {
    act(() => {
      root.render(
        <CumulusRoot><DreamscapeScreen view={VIEW} onSelectSite={() => undefined} /></CumulusRoot>,
      );
    });
    expect(container.querySelector("[data-quest-status-bar-anchor]")).toBeNull();
  });
});
