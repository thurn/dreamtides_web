// @vitest-environment jsdom

import { act } from "react";
import { MINIMAL_ATLAS_CONFIG, MINIMAL_DREAMSCAPES } from "../__test-helpers__/atlas-fixtures";
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
  downloadLog: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("../data/card-database", () => ({
  isStarterCard: (card: { isStarter: boolean }) => card.isStarter,
}));

const DREAMSIGN_TEMPLATES: DreamsignTemplate[] = [
  {
    id: "embers-whisper",
    name: "Ember's Whisper",
    effectDescription: "Fire.",
  },
  {
    id: "glacial-insight",
    name: "Glacial Insight",
    effectDescription: "Ice.",
  },
  {
    id: "verdant-accord",
    name: "Verdant Accord",
    effectDescription: "Growth.",
  },
  {
    id: "stormthread-sigil",
    name: "Stormthread Sigil",
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
    completeDreamAugurySite: vi.fn(),
    acceptDreamMerchantOffer: vi.fn(),
    declineDreamMerchant: vi.fn(),
    pickDraftCard: vi.fn(),
    addCard: vi.fn(),
    addBaneCard: vi.fn(),
    removeCard: vi.fn(),
    transfigureCard: vi.fn(),
    changeDeckEntryType: vi.fn(),
    changeDeckEntryKeywords: vi.fn(),
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
    setEssence: vi.fn(),
    changeMaxEssence: vi.fn(),
    addCardById: vi.fn(),
    addCardByIdWithTransfiguration: vi.fn(),
    addBaneCardById: vi.fn(),
    removeDeckEntry: vi.fn(),
    purgeDeckCards: vi.fn(),
    duplicateDeckEntry: vi.fn(),
    purgeRandomBaneCards: vi.fn(),
    purgeAllBaneCards: vi.fn(),
    pushBattleRewardModifier: vi.fn(),
    pushTemporaryBaneGrant: vi.fn(),
    addSiteToDreamscape: vi.fn(),
    replaceSiteType: vi.fn(),
    removeSiteTypeFromNextDreamscapes: vi.fn(),
    grantFreeShopRerolls: vi.fn(),
    applyShopEssenceDiscount: vi.fn(),
    boostSiteAppearance: vi.fn(),
  };
}

function makeState(overrides: Partial<QuestState> = {}): QuestState {
  return {
    seed: "test-seed",
    essence: 250,
    essenceCap: 500,
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
      startingNodeId: "",
      bossNodeId: "",
      currentNodeId: "",
      layers: [],
      knownDreamsignCarrierIds: [],
    },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: null,
    screen: { type: "site", siteId: "site-1" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
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
      dreamcallers: [],

      dreamwellCards: [],      dreamsignTemplates: DREAMSIGN_TEMPLATES,      dreamscapes: MINIMAL_DREAMSCAPES,      affiliations: [],      atlasConfig: MINIMAL_ATLAS_CONFIG,
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

  it("stretches each draft option slot so actions share the row baseline", () => {
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
                effectDescription:
                  "A longer Dreamsign effect that wraps over several lines, exercising the comparison layout without moving the Select button.",
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

    const optionSlots = container.querySelectorAll(
      '[data-testid^="dreamsign-draft-option-"]',
    );
    expect(optionSlots).toHaveLength(3);
    optionSlots.forEach((slot) => {
      expect(slot.className).toContain("self-stretch");
      expect(slot.className).toContain("w-[224px]");
    });

    const hoverTriggers = container.querySelectorAll(
      '[data-testid^="dreamsign-draft-hover-trigger-"]',
    );
    expect(hoverTriggers).toHaveLength(3);
    hoverTriggers.forEach((trigger) => {
      expect(trigger.className).toContain("h-full");
      expect(trigger.className).toContain("w-full");
      expect(trigger.querySelector('[data-offering-card]')?.className).toContain(
        "h-full",
      );
    });

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
    // The Skip footer button remains visible even when the pool is empty so
    // the player can leave the exhausted offering.
    expect(container.querySelectorAll("button")).toHaveLength(1);

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

describe("Dreamsign card type label", () => {
  // Dreamsign cards do not render the literal word "Dreamsign" as a type
  // badge under the art. The frame, art treatment, and surrounding context
  // already communicate that the card is a dreamsign, so the redundant text
  // label is omitted. See backlog task 010-remove-dreamsign-label.
  it("does not render the literal 'Dreamsign' label on draft cards", () => {
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

    // The dreamsign hover trigger wraps the card content. The card itself
    // must not contain a "Dreamsign" type label badge -- only the dreamsign
    // name, effect text, and art.
    const triggers = container.querySelectorAll(
      '[data-testid^="dreamsign-draft-hover-trigger-"]',
    );
    expect(triggers.length).toBeGreaterThan(0);
    triggers.forEach((trigger) => {
      const cardText = trigger.textContent ?? "";
      expect(cardText).not.toMatch(/\bDreamsign\b/);
    });

    act(() => {
      root.unmount();
    });
  });

  it("does not render the literal 'Dreamsign' label on offering cards", () => {
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

    // The screen heading still says "Dreamsign Offering" -- scope the
    // assertion to the badge spans on the card itself.
    const labelBadges = Array.from(container.querySelectorAll("span")).filter(
      (span) => span.textContent?.trim() === "Dreamsign",
    );
    expect(labelBadges).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });
});
