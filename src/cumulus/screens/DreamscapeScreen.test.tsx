// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DreamscapeScreen, type DreamscapeView } from "./DreamscapeScreen";
import type { DreamscapeSiteModel } from "../components/dreamscape/SiteNode";
import { glyph } from "../primitives/glyph";
import { artRef } from "../primitives/art";
import type { SiteState } from "../../types/quest";
import { CumulusRoot } from "../CumulusRoot";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      animate: _animate,
      children,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      initial?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

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
  essenceRewards: {},
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
        <CumulusRoot><DreamscapeScreen view={VIEW} onSelectSite={() => undefined} onEssenceAnimationComplete={() => undefined} /></CumulusRoot>,
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
        <CumulusRoot><DreamscapeScreen view={VIEW} onSelectSite={() => undefined} onEssenceAnimationComplete={() => undefined} /></CumulusRoot>,
      );
    });
    expect(container.querySelector("[data-quest-status-bar-anchor]")).toBeNull();
  });

  it("animates an Essence reward at its node before completing it in place", () => {
    vi.useFakeTimers();
    const onSelectSite = vi.fn();
    const onEssenceAnimationComplete = vi.fn();
    const essenceView: DreamscapeView = {
      ...VIEW,
      sites: [siteModel(siteState("s-essence", { type: "Essence" }))],
      essenceRewards: { "s-essence": 275 },
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <DreamscapeScreen
            view={essenceView}
            onSelectSite={onSelectSite}
            onEssenceAnimationComplete={onEssenceAnimationComplete}
          />
        </CumulusRoot>,
      );
    });

    const node = container.querySelector<HTMLButtonElement>(
      '[data-site-id="s-essence"]',
    );
    act(() => node?.click());

    expect(onSelectSite).toHaveBeenCalledWith("s-essence");
    const reward = container.querySelector(
      '[data-essence-collection="s-essence"]',
    );
    expect(reward?.textContent).toContain("+275");
    expect(reward?.getAttribute("aria-label")).toBe("Gained 275 essence");
    expect(onEssenceAnimationComplete).not.toHaveBeenCalled();

    const refreshedCollect = vi.fn();
    const collectedView: DreamscapeView = {
      ...essenceView,
      sites: [
        siteModel(
          siteState("s-essence", { type: "Essence", isVisited: true }),
        ),
      ],
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <DreamscapeScreen
            view={collectedView}
            onSelectSite={onSelectSite}
            onEssenceAnimationComplete={refreshedCollect}
          />
        </CumulusRoot>,
      );
    });
    expect(
      container.querySelector('[data-site-id="s-essence"]'),
    ).not.toBeNull();

    act(() => {
      vi.runAllTimers();
    });
    expect(onEssenceAnimationComplete).not.toHaveBeenCalled();
    expect(refreshedCollect).toHaveBeenCalledTimes(1);
    expect(refreshedCollect).toHaveBeenCalledWith("s-essence");
    expect(container.querySelector('[data-site-id="s-essence"]')).toBeNull();
    vi.useRealTimers();
  });
});
