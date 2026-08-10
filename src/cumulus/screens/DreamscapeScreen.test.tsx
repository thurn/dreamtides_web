// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DreamscapeScreen, type DreamscapeView } from "./DreamscapeScreen";
import type { DreamscapeSiteModel } from "../components/dreamscape/SiteNode";
import { glyph } from "../primitives/glyph";
import { artRef } from "../primitives/art";
import type { SiteState } from "../../types/journey";
import { CumulusRoot } from "../CumulusRoot";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      animate,
      children,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      initial?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLDivElement>) => (
      <div {...props} data-motion-animate={JSON.stringify(animate)}>
        {children}
      </div>
    ),
    section: ({
      animate,
      children,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: { opacity?: number };
      children: ReactNode;
      initial?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLElement>) => (
      <section {...props} data-motion-opacity={String(animate?.opacity)}>
        {children}
      </section>
    ),
  },
  useReducedMotion: () => false,
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
  inlineRewards: {},
  replacement: null,
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
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
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
  it("shows persistent Mira guidance two seconds after it becomes eligible", () => {
    vi.useFakeTimers();
    const onGuideDialogueShown = vi.fn();
    const tutorialView: DreamscapeView = {
      ...VIEW,
      guideDialogue: {
        model: {
          portrait: { kind: "character-portrait", characterId: "mira" },
          portraitAlt: "Mira",
          speakerName: "Mira",
          text: "Visit [purple]Dream Sites[/purple].",
        },
        delaySeconds: 2,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
      },
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <DreamscapeScreen
            view={tutorialView}
            onSelectSite={() => undefined}
            onInlineRewardAnimationComplete={() => undefined}
            onReplaceDreamsign={() => undefined}
            onDeclineReward={() => undefined}
            onGuideDialogueShown={onGuideDialogueShown}
          />
        </CumulusRoot>,
      );
    });
    const dialogue = () =>
      container.querySelector('[data-testid="dreamscape-tutorial-dialogue"]');
    expect(dialogue()?.getAttribute("data-character-dialogue-visible")).toBe(
      "false",
    );

    act(() => {
      vi.advanceTimersByTime(1_999);
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

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(dialogue()?.getAttribute("data-character-dialogue-visible")).toBe(
      "true",
    );
    vi.useRealTimers();
  });

  it("renders the scene, one node per unvisited site, and drops visited sites", () => {
    act(() => {
      root.render(
        <CumulusRoot>
          <DreamscapeScreen
            view={VIEW}
            onSelectSite={() => undefined}
            onInlineRewardAnimationComplete={() => undefined}
            onReplaceDreamsign={() => undefined}
            onDeclineReward={() => undefined}
          />
        </CumulusRoot>,
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

  it("leaves persistent journey chrome to the router-owned wrapper", () => {
    act(() => {
      root.render(
        <CumulusRoot>
          <DreamscapeScreen
            view={VIEW}
            onSelectSite={() => undefined}
            onInlineRewardAnimationComplete={() => undefined}
            onReplaceDreamsign={() => undefined}
            onDeclineReward={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();
  });

  it("animates an Essence reward at its node before completing it in place", () => {
    vi.useFakeTimers();
    const onSelectSite = vi.fn();
    const onEssenceAnimationComplete = vi.fn();
    const essenceView: DreamscapeView = {
      ...VIEW,
      sites: [siteModel(siteState("s-essence", { type: "Essence" }))],
      inlineRewards: {
        "s-essence": { kind: "essence", amount: 275 },
      },
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <DreamscapeScreen
            view={essenceView}
            onSelectSite={onSelectSite}
            onInlineRewardAnimationComplete={onEssenceAnimationComplete}
            onReplaceDreamsign={() => undefined}
            onDeclineReward={() => undefined}
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
    const departingSite = container.querySelector(
      '[data-essence-site-departure="s-essence"]',
    );
    expect(reward?.textContent).toContain("+275");
    expect(reward?.getAttribute("aria-label")).toContain("275");
    expect(reward?.getAttribute("aria-label")).not.toContain("s-essence");
    expect(departingSite?.getAttribute("data-motion-animate")).toBe(
      JSON.stringify({ opacity: [1, 0.55, 0, 0] }),
    );
    expect(onEssenceAnimationComplete).not.toHaveBeenCalled();

    const refreshedCollect = vi.fn();
    const collectedView: DreamscapeView = {
      ...essenceView,
      sites: [
        siteModel(siteState("s-essence", { type: "Essence", isVisited: true })),
      ],
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <DreamscapeScreen
            view={collectedView}
            onSelectSite={onSelectSite}
            onInlineRewardAnimationComplete={refreshedCollect}
            onReplaceDreamsign={() => undefined}
            onDeclineReward={() => undefined}
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

  it("animates a Dreamsign Reward at its node and grants it in place", () => {
    vi.useFakeTimers();
    const onSelectSite = vi.fn();
    const onInlineRewardAnimationComplete = vi.fn();
    const rewardView: DreamscapeView = {
      ...VIEW,
      sites: [siteModel(siteState("s-reward", { type: "Reward" }))],
      inlineRewards: {
        "s-reward": {
          kind: "dreamsign",
          requiresReplacement: false,
          dreamsign: {
            id: "dreamsign-uuid",
            name: "Lantern in the Rain",
            effectDescription: "Your first dream each dawn costs 1 less.",
            imageName: "lantern-in-the-rain.webp",
          },
        },
      },
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <DreamscapeScreen
            view={rewardView}
            onSelectSite={onSelectSite}
            onInlineRewardAnimationComplete={onInlineRewardAnimationComplete}
            onReplaceDreamsign={() => undefined}
            onDeclineReward={() => undefined}
          />
        </CumulusRoot>,
      );
    });

    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-site-id="s-reward"]')
        ?.click(),
    );

    expect(onSelectSite).toHaveBeenCalledWith("s-reward");
    const reward = container.querySelector(
      '[data-reward-collection="s-reward"]',
    );
    expect(reward?.getAttribute("aria-label")).not.toBe("");
    expect(reward?.getAttribute("aria-label")).not.toContain("dreamsign-uuid");
    expect(
      reward?.querySelector('[data-dreamsign-id="dreamsign-uuid"]'),
    ).not.toBeNull();
    expect(
      reward?.querySelector("[data-reward-dreamsign-pulse]"),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-reward-site-departure="s-reward"]'),
    ).not.toBeNull();
    expect(onInlineRewardAnimationComplete).not.toHaveBeenCalled();

    const collectedView: DreamscapeView = {
      ...rewardView,
      sites: [
        siteModel(siteState("s-reward", { type: "Reward", isVisited: true })),
      ],
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <DreamscapeScreen
            view={collectedView}
            onSelectSite={onSelectSite}
            onInlineRewardAnimationComplete={onInlineRewardAnimationComplete}
            onReplaceDreamsign={() => undefined}
            onDeclineReward={() => undefined}
          />
        </CumulusRoot>,
      );
    });

    act(() => {
      vi.runAllTimers();
    });
    expect(onInlineRewardAnimationComplete).toHaveBeenCalledWith("s-reward");
    expect(container.querySelector('[data-site-id="s-reward"]')).toBeNull();
    vi.useRealTimers();
  });

  it("shows an at-cap Reward as found and resolves replacement by UUID", () => {
    vi.useFakeTimers();
    const onReplaceDreamsign = vi.fn();
    const onDeclineReward = vi.fn();
    const pendingDreamsign = {
      id: "pending-dreamsign",
      name: "Lantern in the Rain",
      effectDescription: "Your first dream each dawn costs 1 less.",
      imageName: "lantern-in-the-rain.webp",
    };
    const heldDreamsign = {
      id: "held-dreamsign",
      name: "Held Sign",
      effectDescription: "A held effect.",
      imageName: "held.webp",
    };
    const rewardView: DreamscapeView = {
      ...VIEW,
      sites: [siteModel(siteState("s-reward", { type: "Reward" }))],
      inlineRewards: {
        "s-reward": {
          kind: "dreamsign",
          dreamsign: pendingDreamsign,
          requiresReplacement: true,
        },
      },
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <DreamscapeScreen
            view={rewardView}
            onSelectSite={() => undefined}
            onInlineRewardAnimationComplete={() => undefined}
            onReplaceDreamsign={onReplaceDreamsign}
            onDeclineReward={onDeclineReward}
          />
        </CumulusRoot>,
      );
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-site-id="s-reward"]')
        ?.click(),
    );
    expect(
      container
        .querySelector('[data-reward-collection="s-reward"]')
        ?.getAttribute("aria-label"),
    ).not.toBe("");

    act(() => {
      root.render(
        <CumulusRoot>
          <DreamscapeScreen
            view={{
              ...rewardView,
              replacement: {
                pendingDreamsign,
                currentDreamsigns: [heldDreamsign],
                maxDreamsigns: 1,
              },
            }}
            onSelectSite={() => undefined}
            onInlineRewardAnimationComplete={() => undefined}
            onReplaceDreamsign={onReplaceDreamsign}
            onDeclineReward={onDeclineReward}
          />
        </CumulusRoot>,
      );
    });
    act(() =>
      document
        .querySelector<HTMLButtonElement>(
          '[data-testid="replace-dreamsign-held-dreamsign"]',
        )
        ?.click(),
    );
    expect(onReplaceDreamsign).toHaveBeenCalledWith("held-dreamsign");
    act(() =>
      document
        .querySelector<HTMLButtonElement>(
          '[data-testid="dreamsign-replacement-cancel"]',
        )
        ?.click(),
    );
    expect(onDeclineReward).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
