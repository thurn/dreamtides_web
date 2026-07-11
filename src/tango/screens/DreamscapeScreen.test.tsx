// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DreamscapeScreen, type DreamscapeView } from "./DreamscapeScreen";
import type { DreamscapeSiteModel } from "../components/dreamscape/SiteNode";
import { glyph } from "../primitives/glyph";
import { artRef } from "../primitives/art";
import type { SiteState } from "../../types/quest";
import {
  QUEST_STATUS_BAR_BOTTOM_INSET,
  QUEST_STATUS_BAR_TOTAL_HEIGHT,
} from "../components/hud/QuestStatusBar";
import { TangoRoot } from "../TangoRoot";

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
  hud: {
    essence: 240,
    deck: 12,
    dreamcaller: {
      id: "00000000-0000-4000-8000-000000000052",
      name: "Drusus Calvus",
      epithet: "Triumphator",
      portrait: artRef.dreamcaller("0007"),
      ability: "Gain 1 essence.",
    },
    dreamsigns: [],
  },
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
        <TangoRoot><DreamscapeScreen view={VIEW} onSelectSite={() => undefined} /></TangoRoot>,
      );
    });
    expect(container.querySelector("[data-tango-dreamscape]")).not.toBeNull();
    const scene = container.querySelector("img");
    expect(scene?.getAttribute("alt")).toBe("Ember Wood");
    const nodes = container.querySelectorAll("[data-site-id]");
    expect(nodes).toHaveLength(2);
    expect(container.querySelector('[data-site-id="s-visited"]')).toBeNull();
    expect(container.querySelector('[data-site-id="s-draft"]')).not.toBeNull();
  });

  it("docks the essence total in the QuestStatusBar", () => {
    act(() => {
      root.render(
        <TangoRoot><DreamscapeScreen view={VIEW} onSelectSite={() => undefined} /></TangoRoot>,
      );
    });
    expect(container.textContent).toContain("240");
    const anchor = container.querySelector<HTMLElement>(
      "[data-quest-status-bar-anchor]",
    );
    const row = anchor?.firstElementChild as HTMLElement | null;
    expect(anchor?.style.bottom).toBe("0px");
    expect(anchor?.style.position).toBe("fixed");
    expect(anchor?.style.height).toBe(QUEST_STATUS_BAR_TOTAL_HEIGHT);
    expect(row?.style.height).toBe("100%");
    expect(row?.style.paddingBottom).toBe(QUEST_STATUS_BAR_BOTTOM_INSET);
  });
});
