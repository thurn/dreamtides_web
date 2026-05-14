// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import type { DreamsignTemplate } from "../types/content";
import type { QuestMutations } from "../state/quest-context";
import type { QuestState, SiteState } from "../types/quest";
import { DreamsignDraftScreen } from "./DreamsignDraftScreen";
import { DreamsignOfferingScreen } from "./DreamsignOfferingScreen";
import { useQuest } from "../state/quest-context";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      exit?: unknown;
      initial?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    aside: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      exit?: unknown;
      initial?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLElement>) => <aside {...props}>{children}</aside>,
  },
}));

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../logging", () => ({
  logEvent: vi.fn(),
}));

vi.mock("../data/card-database", () => ({
  isStarterCard: (card: { isStarter: boolean }) => card.isStarter,
}));

const DREAMSIGN_TEMPLATES: DreamsignTemplate[] = [
  {
    id: "embers-whisper",
    name: "Ember's Whisper",
    packageTides: ["alpha"],
    effectDescription: "Fire.",
  },
  {
    id: "glacial-insight",
    name: "Glacial Insight",
    packageTides: ["beta"],
    effectDescription: "Ice.",
  },
  {
    id: "verdant-accord",
    name: "Verdant Accord",
    packageTides: ["gamma"],
    effectDescription: "Growth.",
  },
  {
    id: "stormthread-sigil",
    name: "Stormthread Sigil",
    packageTides: ["delta"],
    effectDescription: "Storm.",
  },
];

function makeMutations(): QuestMutations {
  return {
    changeEssence: vi.fn(),
    startQuest: vi.fn(),
    completeSite: vi.fn(),
    ensureRewardSiteRuntime: vi.fn(),
    acceptRewardSite: vi.fn(),
    ensureDreamsignOfferRuntime: vi.fn(),
    acceptDreamsignOffer: vi.fn(),
    rejectDreamsignOffer: vi.fn(),
    ensureEssenceSiteRuntime: vi.fn(),
    acceptEssenceSite: vi.fn(),
    ensureShopRuntime: vi.fn(),
    buyShopSlot: vi.fn(),
    rerollShop: vi.fn(),
    ensureCardChoiceRuntime: vi.fn(),
    acceptTransfigurationChoice: vi.fn(),
    acceptDuplicationChoice: vi.fn(),
    ensureDreamJourneyRuntime: vi.fn(),
    completeDreamJourneyOption: vi.fn(),
    pickDraftCard: vi.fn(),
    addCard: vi.fn(),
    addBaneCard: vi.fn(),
    removeCard: vi.fn(),
    transfigureCard: vi.fn(),
    setDreamcallerSelection: vi.fn(),
    setCardSourceDebug: vi.fn(),
    addDreamsign: vi.fn(),
    removeDreamsign: vi.fn(),
    setRemainingDreamsignPool: vi.fn(),
    incrementCompletionLevel: vi.fn(),
    setScreen: vi.fn(),
    markSiteVisited: vi.fn(),
    setCurrentDreamscape: vi.fn(),
    updateAtlas: vi.fn(),
    setDraftState: vi.fn(),
    setFailureSummary: vi.fn(),
    dismissStartingDeckPopup: vi.fn(),
    bootstrapStartInBattle: vi.fn(),
    resetQuest: vi.fn(),
  };
}

function makeState(overrides: Partial<QuestState> = {}): QuestState {
  return {
    essence: 250,
    essenceCap: 500,
    omens: 0,
    maxDreamsigns: 12,
    deck: [],
    dreamcaller: null,
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [],
    completionLevel: 0,
    atlas: {
      nodes: {},
      edges: [],
      startingNodeId: "",
    },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: null,
    screen: { type: "site", siteId: "site-1" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
    ...overrides,
  };
}

function makeSite(overrides: Partial<SiteState> = {}): SiteState {
  return {
    id: "site-1",
    type: "DreamsignOffering",
    isEnhanced: false,
    isVisited: false,
    ...overrides,
  };
}

function setQuestContext(state: QuestState, mutations: QuestMutations): void {
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations,
    cardDatabase: new Map(),
    questContent: {
      cardDatabase: new Map(),
      cardsByPackageTide: new Map(),
      dreamcallers: [],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      resolvedPackagesByDreamcallerId: new Map(),
    },
  });
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function clickButton(container: HTMLElement, label: string): void {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) {
    throw new Error(`Could not find button with label: ${label}`);
  }
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Math, "random").mockReturnValue(0.999);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DreamsignOfferingScreen Why Dreamsigns button", () => {
  it("renders a Why Dreamsigns button when offered dreamsigns are revealed", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [
              {
                id: "embers-whisper",
                name: "Ember's Whisper",
                effectDescription: "Fire.",
                isBane: false,
              },
            ],
            remainingDreamsignPool: ["glacial-insight"],
            accepted: false,
          },
        },
      }),
      mutations,
    );

    const { container, root } = mount(
      <DreamsignOfferingScreen site={makeSite()} />,
    );

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("Why Dreamsigns"),
    );
    expect(button).toBeTruthy();

    act(() => {
      root.unmount();
    });
  });

  it("opens the Why Dreamsigns overlay on click and closes it via the close button", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [
              {
                id: "embers-whisper",
                name: "Ember's Whisper",
                effectDescription: "Fire.",
                isBane: false,
              },
            ],
            remainingDreamsignPool: ["glacial-insight"],
            accepted: false,
          },
        },
      }),
      mutations,
    );

    const { container, root } = mount(
      <DreamsignOfferingScreen site={makeSite()} />,
    );

    expect(container.textContent).not.toContain(
      "Why am I seeing these dreamsigns?",
    );

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("Why Dreamsigns"),
    );
    if (!openButton) {
      throw new Error("Why Dreamsigns button missing");
    }
    act(() => {
      openButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain(
      "Why am I seeing these dreamsigns?",
    );

    const closeButton = Array.from(container.querySelectorAll("button")).find(
      (candidate) =>
        candidate.getAttribute("aria-label") === "Close dreamsign source overlay",
    );
    if (!closeButton) {
      throw new Error("close button missing");
    }
    act(() => {
      closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).not.toContain(
      "Why am I seeing these dreamsigns?",
    );

    act(() => {
      root.unmount();
    });
  });

  it("does not render the Why Dreamsigns button while options are still being revealed", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({ remainingDreamsignPool: ["embers-whisper"] }),
      mutations,
    );

    const { container, root } = mount(
      <DreamsignOfferingScreen site={makeSite()} />,
    );

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("Why Dreamsigns"),
    );
    expect(button).toBeUndefined();

    act(() => {
      root.unmount();
    });
  });
});

describe("DreamsignDraftScreen Why Dreamsigns button", () => {
  it("renders a Why Dreamsigns button when offered dreamsigns are revealed", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [
              {
                id: "embers-whisper",
                name: "Ember's Whisper",
                effectDescription: "Fire.",
                isBane: false,
              },
              {
                id: "glacial-insight",
                name: "Glacial Insight",
                effectDescription: "Ice.",
                isBane: false,
              },
              {
                id: "verdant-accord",
                name: "Verdant Accord",
                effectDescription: "Growth.",
                isBane: false,
              },
            ],
            remainingDreamsignPool: ["stormthread-sigil"],
            accepted: false,
          },
        },
      }),
      mutations,
    );

    const { container, root } = mount(
      <DreamsignDraftScreen site={makeSite({ type: "DreamsignDraft" })} />,
    );

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("Why Dreamsigns"),
    );
    expect(button).toBeTruthy();

    act(() => {
      root.unmount();
    });
  });

  it("opens the Why Dreamsigns overlay with offered dreamsigns and explanatory content", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [
              {
                id: "embers-whisper",
                name: "Ember's Whisper",
                effectDescription: "Fire.",
                isBane: false,
              },
            ],
            remainingDreamsignPool: ["stormthread-sigil"],
            accepted: false,
          },
        },
      }),
      mutations,
    );

    const { container, root } = mount(
      <DreamsignDraftScreen site={makeSite({ type: "DreamsignDraft" })} />,
    );

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("Why Dreamsigns"),
    );
    act(() => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain(
      "Why am I seeing these dreamsigns?",
    );
    expect(container.textContent).toContain("Ember's Whisper");
    expect(container.textContent).toContain("Dreamsign Draft");
    // remainingPoolSize from siteRuntime should be reflected
    expect(container.textContent).toContain("Remaining in");

    act(() => {
      root.unmount();
    });
  });
});

describe("DreamsignOfferingScreen", () => {
  it("rejects the offering with no reward and a plain Reject label", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [
              {
                id: "embers-whisper",
                name: "Ember's Whisper",
                effectDescription: "Fire.",
                isBane: false,
              },
            ],
            remainingDreamsignPool: ["glacial-insight"],
            accepted: false,
          },
        },
      }),
      mutations,
    );

    const { container, root } = mount(<DreamsignOfferingScreen site={makeSite()} />);

    expect(container.textContent).toContain("Ember's Whisper");

    const rejectButton = Array.from(
      container.querySelectorAll("button"),
    ).find((candidate) =>
      candidate.textContent?.trim().startsWith("Reject"),
    );
    expect(rejectButton?.textContent?.trim()).toBe("Reject");
    expect(rejectButton?.textContent).not.toContain("Essence");

    clickButton(container, rejectButton?.textContent?.trim() ?? "");

    expect(mutations.acceptDreamsignOffer).not.toHaveBeenCalled();
    expect(mutations.completeSite).not.toHaveBeenCalled();
    expect(mutations.rejectDreamsignOffer).toHaveBeenCalledWith("site-1");

    act(() => {
      root.unmount();
    });
  });

  it("does not restore a shown dreamsign to the pool during full-capacity purge acceptance", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [
              {
                id: "embers-whisper",
                name: "Ember's Whisper",
                effectDescription: "Fire.",
                isBane: false,
              },
            ],
            remainingDreamsignPool: ["glacial-insight"],
            accepted: false,
          },
        },
        dreamsigns: Array.from({ length: 12 }, (_, index) => ({
          name: `Held Sign ${String(index)}`,
          tide: index % 2 === 0 ? "tide_alpha" : "tide_zeta",
          effectDescription: "Existing.",
          isBane: false,
        })),
      }),
      mutations,
    );

    const { container, root } = mount(<DreamsignOfferingScreen site={makeSite()} />);

    clickButton(container, "Accept");
    clickButton(container, "Held Sign 0");

    expect(mutations.removeDreamsign).not.toHaveBeenCalled();
    expect(mutations.acceptDreamsignOffer).toHaveBeenCalledWith(
      "site-1",
      expect.objectContaining({ name: "Ember's Whisper" }),
      0,
    );

    act(() => {
      root.unmount();
    });
  });

  it("requests shared offer runtime while revealing options", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({ remainingDreamsignPool: ["embers-whisper"] }),
      mutations,
    );

    const element = <DreamsignOfferingScreen site={makeSite()} />;
    const { container, root } = mount(element);

    expect(container.textContent).toContain("Revealing Dreamsigns...");
    expect(mutations.ensureDreamsignOfferRuntime).toHaveBeenCalledWith(
      "site-1",
      1,
    );

    setQuestContext(
      makeState({ remainingDreamsignPool: ["glacial-insight"] }),
      mutations,
    );
    act(() => {
      root.render(<DreamsignOfferingScreen site={makeSite()} />);
    });

    expect(mutations.ensureDreamsignOfferRuntime).toHaveBeenCalledTimes(2);

    act(() => {
      root.unmount();
    });
  });
});

describe("DreamsignDraftScreen", () => {
  it("retries shared draft runtime reveal when the Dreamsign pool changes", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({ remainingDreamsignPool: ["embers-whisper"] }),
      mutations,
    );

    const element = (
      <DreamsignDraftScreen
        site={makeSite({ type: "DreamsignDraft" })}
      />
    );
    const { container, root } = mount(element);

    expect(container.textContent).toContain("Revealing Dreamsigns...");
    expect(mutations.ensureDreamsignOfferRuntime).toHaveBeenCalledWith(
      "site-1",
      3,
    );

    setQuestContext(
      makeState({ remainingDreamsignPool: ["glacial-insight"] }),
      mutations,
    );
    act(() => {
      root.render(
        <DreamsignDraftScreen
          site={makeSite({ type: "DreamsignDraft" })}
        />,
      );
    });

    expect(mutations.ensureDreamsignOfferRuntime).toHaveBeenCalledTimes(2);

    act(() => {
      root.unmount();
    });
  });

  it("renders shared draft options and completes when skipped", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [
              {
                id: "embers-whisper",
                name: "Ember's Whisper",
                effectDescription: "Fire.",
                isBane: false,
              },
              {
                id: "glacial-insight",
                name: "Glacial Insight",
                effectDescription: "Ice.",
                isBane: false,
              },
              {
                id: "verdant-accord",
                name: "Verdant Accord",
                effectDescription: "Growth.",
                isBane: false,
              },
            ],
            remainingDreamsignPool: ["stormthread-sigil"],
            accepted: false,
          },
        },
      }),
      mutations,
    );

    const { container, root } = mount(
      <DreamsignDraftScreen
        site={makeSite({ type: "DreamsignDraft" })}
      />,
    );

    expect(container.textContent).toContain("Ember's Whisper");
    expect(container.textContent).toContain("Glacial Insight");
    expect(container.textContent).toContain("Verdant Accord");

    clickButton(container, "Skip (discards the shown Dreamsigns)");

    expect(mutations.acceptDreamsignOffer).not.toHaveBeenCalled();
    expect(mutations.completeSite).toHaveBeenCalledWith(
      "site-1",
      "dreamsign_draft",
    );

    act(() => {
      root.unmount();
    });
  });

  it("degrades to an exhausted-pool fallback without rerolling from the global catalog", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeState({
        siteRuntime: {
          "site-1": {
            kind: "dreamsignOffer",
            offeredDreamsigns: [],
            remainingDreamsignPool: [],
            accepted: false,
          },
        },
      }),
      mutations,
    );

    const { container, root } = mount(
      <DreamsignDraftScreen
        site={makeSite({ type: "DreamsignDraft" })}
      />,
    );

    expect(container.textContent).toContain("The Dreamsign pool is exhausted.");
    expect(container.textContent).not.toContain("Ember's Whisper");
    // Skip + Why Dreamsigns footer buttons remain visible even when the pool
    // is empty so the player can still inspect pool composition.
    expect(container.querySelectorAll("button")).toHaveLength(2);

    clickButton(container, "Skip (discards the shown Dreamsigns)");

    expect(mutations.acceptDreamsignOffer).not.toHaveBeenCalled();
    expect(mutations.completeSite).toHaveBeenCalledWith(
      "site-1",
      "dreamsign_draft",
    );

    act(() => {
      root.unmount();
    });
  });
});

describe("DreamsignOfferingScreen hover popover", () => {
  it("shows a hover popover with the dreamsign's full effect after hovering its card", () => {
    vi.useFakeTimers();
    try {
      const mutations = makeMutations();
      setQuestContext(
        makeState({
          siteRuntime: {
            "site-1": {
              kind: "dreamsignOffer",
              offeredDreamsigns: [
                {
                  id: "embers-whisper",
                  name: "Ember's Whisper",
                  effectDescription: "Burn 2 spark.",
                  isBane: false,
                },
              ],
              remainingDreamsignPool: ["glacial-insight"],
              accepted: false,
            },
          },
        }),
        mutations,
      );

      const { container, root } = mount(
        <DreamsignOfferingScreen site={makeSite()} />,
      );

      // Before hover the popover is not portaled.
      expect(
        document.body.querySelectorAll(
          '[data-testid="dreamsign-hover-card"]',
        ),
      ).toHaveLength(0);

      const trigger = container.querySelector(
        '[data-testid="dreamsign-offering-hover-trigger-embers-whisper"]',
      );
      expect(trigger).not.toBeNull();

      act(() => {
        trigger?.dispatchEvent(
          new MouseEvent("mouseover", { bubbles: true }),
        );
      });
      act(() => {
        vi.advanceTimersByTime(350);
      });

      const popover = document.body.querySelector(
        '[data-testid="dreamsign-hover-card"]',
      );
      expect(popover).not.toBeNull();
      expect(popover?.textContent).toContain("Ember's Whisper");
      expect(popover?.textContent).toContain("Burn 2 spark.");

      act(() => {
        trigger?.dispatchEvent(
          new MouseEvent("mouseout", { bubbles: true }),
        );
      });

      expect(
        document.body.querySelectorAll(
          '[data-testid="dreamsign-hover-card"]',
        ),
      ).toHaveLength(0);

      act(() => {
        root.unmount();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the hover popover on keyboard focus", () => {
    vi.useFakeTimers();
    try {
      const mutations = makeMutations();
      setQuestContext(
        makeState({
          siteRuntime: {
            "site-1": {
              kind: "dreamsignOffer",
              offeredDreamsigns: [
                {
                  id: "embers-whisper",
                  name: "Ember's Whisper",
                  effectDescription: "Burn 2 spark.",
                  isBane: false,
                },
              ],
              remainingDreamsignPool: ["glacial-insight"],
              accepted: false,
            },
          },
        }),
        mutations,
      );

      const { container, root } = mount(
        <DreamsignOfferingScreen site={makeSite()} />,
      );

      const trigger = container.querySelector(
        '[data-testid="dreamsign-offering-hover-trigger-embers-whisper"]',
      );
      expect(trigger).not.toBeNull();

      act(() => {
        trigger?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(350);
      });

      const popover = document.body.querySelector(
        '[data-testid="dreamsign-hover-card"]',
      );
      expect(popover).not.toBeNull();
      expect(popover?.textContent).toContain("Ember's Whisper");

      act(() => {
        root.unmount();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("DreamsignDraftScreen hover popover", () => {
  it("shows a hover popover with the dreamsign's full effect after hovering its card", () => {
    vi.useFakeTimers();
    try {
      const mutations = makeMutations();
      setQuestContext(
        makeState({
          siteRuntime: {
            "site-1": {
              kind: "dreamsignOffer",
              offeredDreamsigns: [
                {
                  id: "embers-whisper",
                  name: "Ember's Whisper",
                  effectDescription: "Burn 2 spark.",
                  isBane: false,
                },
                {
                  id: "glacial-insight",
                  name: "Glacial Insight",
                  effectDescription: "Chill the foe.",
                  isBane: false,
                },
                {
                  id: "verdant-accord",
                  name: "Verdant Accord",
                  effectDescription: "Grow a vine.",
                  isBane: false,
                },
              ],
              remainingDreamsignPool: ["stormthread-sigil"],
              accepted: false,
            },
          },
        }),
        mutations,
      );

      const { container, root } = mount(
        <DreamsignDraftScreen site={makeSite({ type: "DreamsignDraft" })} />,
      );

      expect(
        document.body.querySelectorAll(
          '[data-testid="dreamsign-hover-card"]',
        ),
      ).toHaveLength(0);

      const trigger = container.querySelector(
        '[data-testid="dreamsign-draft-hover-trigger-glacial-insight"]',
      );
      expect(trigger).not.toBeNull();

      act(() => {
        trigger?.dispatchEvent(
          new MouseEvent("mouseover", { bubbles: true }),
        );
      });
      act(() => {
        vi.advanceTimersByTime(350);
      });

      const popover = document.body.querySelector(
        '[data-testid="dreamsign-hover-card"]',
      );
      expect(popover).not.toBeNull();
      expect(popover?.textContent).toContain("Glacial Insight");
      expect(popover?.textContent).toContain("Chill the foe.");

      act(() => {
        trigger?.dispatchEvent(
          new MouseEvent("mouseout", { bubbles: true }),
        );
      });

      expect(
        document.body.querySelectorAll(
          '[data-testid="dreamsign-hover-card"]',
        ),
      ).toHaveLength(0);

      act(() => {
        root.unmount();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the hover popover on keyboard focus", () => {
    vi.useFakeTimers();
    try {
      const mutations = makeMutations();
      setQuestContext(
        makeState({
          siteRuntime: {
            "site-1": {
              kind: "dreamsignOffer",
              offeredDreamsigns: [
                {
                  id: "embers-whisper",
                  name: "Ember's Whisper",
                  effectDescription: "Burn 2 spark.",
                  isBane: false,
                },
                {
                  id: "glacial-insight",
                  name: "Glacial Insight",
                  effectDescription: "Chill the foe.",
                  isBane: false,
                },
                {
                  id: "verdant-accord",
                  name: "Verdant Accord",
                  effectDescription: "Grow a vine.",
                  isBane: false,
                },
              ],
              remainingDreamsignPool: ["stormthread-sigil"],
              accepted: false,
            },
          },
        }),
        mutations,
      );

      const { container, root } = mount(
        <DreamsignDraftScreen site={makeSite({ type: "DreamsignDraft" })} />,
      );

      const trigger = container.querySelector(
        '[data-testid="dreamsign-draft-hover-trigger-embers-whisper"]',
      );
      expect(trigger).not.toBeNull();

      act(() => {
        trigger?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(350);
      });

      const popover = document.body.querySelector(
        '[data-testid="dreamsign-hover-card"]',
      );
      expect(popover).not.toBeNull();
      expect(popover?.textContent).toContain("Ember's Whisper");

      act(() => {
        root.unmount();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
