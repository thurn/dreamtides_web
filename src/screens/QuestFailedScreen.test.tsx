// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestMutations } from "../state/quest-context";
import type { QuestFailureSummary, QuestState } from "../types/quest";
import { QuestFailedScreen } from "./QuestFailedScreen";
import { useQuest } from "../state/quest-context";
import { logEvent, logEventOnce } from "../logging";

vi.mock("framer-motion", () => ({
  motion: {
    h1: ({
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
    } & HTMLAttributes<HTMLHeadingElement>) => <h1 {...props}>{children}</h1>,
    p: ({
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
    } & HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{children}</p>,
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
    dl: ({
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
    } & HTMLAttributes<HTMLElement>) => <dl {...props}>{children}</dl>,
    button: ({
      animate: _animate,
      children,
      initial: _initial,
      transition: _transition,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      initial?: unknown;
      transition?: unknown;
      whileHover?: unknown;
      whileTap?: unknown;
    } & HTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../logging", () => ({
  logEvent: vi.fn(),
  logEventOnce: vi.fn(),
}));

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
    completeDreamJourneySite: vi.fn(),
    pickDraftCard: vi.fn(),
    addCard: vi.fn(),
    addBaneCard: vi.fn(),
    removeCard: vi.fn(),
    cleanseBanes: vi.fn(),
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
    changeOmens: vi.fn(),
    setEssence: vi.fn(),
    changeMaxEssence: vi.fn(),
    addCardById: vi.fn(),
    addBaneCardById: vi.fn(),
    removeDeckEntry: vi.fn(),
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
    grantShopOmenDiscounts: vi.fn(),
    boostSiteAppearance: vi.fn(),
  };
}

function makeSummary(
  overrides: Partial<QuestFailureSummary> = {},
): QuestFailureSummary {
  return {
    battleId: "battle-1",
    result: "defeat",
    reason: "score_target_reached",
    siteId: "site-7",
    siteLabel: "Battle",
    dreamscapeIdOrNone: "dreamscape-2",
    turnNumber: 3,
    playerScore: 10,
    enemyScore: 13,
    ...overrides,
  };
}

function makeState(
  failureSummary: QuestFailureSummary | null,
): QuestState {
  return {
    seed: "test-seed",
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
    screen: { type: "questFailed" },
    activeSiteId: null,
    failureSummary,
    hasSeenStartingDeckPopup: false,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      upcomingOmenDiscounts: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
  };
}

function setQuestContext(
  failureSummary: QuestFailureSummary | null,
  mutations: QuestMutations,
): void {
  vi.mocked(useQuest).mockReturnValue({
    state: makeState(failureSummary),
    mutations,
    cardDatabase: new Map(),
    questContent: {
      cardDatabase: new Map(),
      cardsByPackageTide: new Map(),
      dreamcallers: [],
      dreamsignTemplates: [],
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

beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("QuestFailedScreen", () => {
  it("renders the frozen failure summary fields", () => {
    const mutations = makeMutations();
    setQuestContext(makeSummary(), mutations);

    const { container, root } = mount(<QuestFailedScreen />);

    expect(container.textContent).toContain("Defeat");
    expect(container.textContent).toContain("battle-1");
    expect(container.textContent).toContain("site-7");
    expect(container.textContent).toContain("Battle");
    expect(container.textContent).toContain("dreamscape-2");
    expect(container.textContent).toContain("10");
    expect(container.textContent).toContain("13");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("Score threshold reached");
    const reasonNode = container.querySelector(
      '[data-quest-failed-reason="score_target_reached"]',
    );
    expect(reasonNode).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders a draw summary with 'None' for a missing dreamscape id", () => {
    const mutations = makeMutations();
    setQuestContext(
      makeSummary({
        result: "draw",
        reason: "turn_limit_reached",
        dreamscapeIdOrNone: null,
      }),
      mutations,
    );

    const { container, root } = mount(<QuestFailedScreen />);

    expect(container.textContent).toContain("Draw");
    expect(container.textContent).toContain("None");
    expect(container.textContent).toContain("Turn limit reached");

    act(() => {
      root.unmount();
    });
  });

  it("renders the forced-result reason when the failure was forced", () => {
    const mutations = makeMutations();
    setQuestContext(makeSummary({ reason: "forced_result" }), mutations);

    const { container, root } = mount(<QuestFailedScreen />);

    expect(container.textContent).toContain("Forced result");
    expect(logEventOnce).toHaveBeenCalledWith(
      expect.stringContaining("quest_failed_screen_shown:"),
      "quest_failed_screen_shown",
      expect.objectContaining({ reason: "forced_result" }),
    );

    act(() => {
      root.unmount();
    });
  });

  it("exposes data-quest-failed-reason on the root so automation can read it (bug-113)", () => {
    const mutations = makeMutations();
    setQuestContext(makeSummary({ reason: "forced_result" }), mutations);

    const { container, root } = mount(<QuestFailedScreen />);

    const screen = container.querySelector<HTMLElement>(
      "[data-quest-failed-screen]",
    );
    expect(screen).not.toBeNull();
    expect(screen?.getAttribute("data-quest-failed-reason")).toBe("forced_result");

    act(() => {
      root.unmount();
    });
  });

  it("is the only path that calls resetQuest, and only when Start New Run is pressed", () => {
    const mutations = makeMutations();
    setQuestContext(makeSummary(), mutations);

    const { container, root } = mount(<QuestFailedScreen />);

    expect(mutations.resetQuest).not.toHaveBeenCalled();

    const startNewRun = container.querySelector<HTMLButtonElement>(
      '[data-quest-failed-action="start-new-run"]',
    );
    expect(startNewRun).not.toBeNull();

    act(() => {
      startNewRun?.click();
    });

    expect(mutations.resetQuest).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      "quest_failed_start_new_run",
      expect.objectContaining({ battleId: "battle-1", result: "defeat" }),
    );

    act(() => {
      root.unmount();
    });
  });

  it("falls back to a safe message when no failure summary has been frozen", () => {
    const mutations = makeMutations();
    setQuestContext(null, mutations);

    const { container, root } = mount(<QuestFailedScreen />);

    expect(container.textContent).toContain("Quest failure summary not found");
    expect(
      container.querySelector('[data-quest-failed-action="start-new-run"]'),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
