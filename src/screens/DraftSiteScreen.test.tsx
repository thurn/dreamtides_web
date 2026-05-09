// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestMutations } from "../state/quest-context";
import type { CardData } from "../types/cards";
import type { DraftState } from "../types/draft";
import type { QuestState } from "../types/quest";
import { DraftSiteScreen } from "./DraftSiteScreen";
import { useQuest } from "../state/quest-context";

vi.mock("framer-motion", async () => {
  const React = await import("react");

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
      div: React.forwardRef(function MockMotionDiv(
        {
          animate: _animate,
          children,
          exit: _exit,
          initial: _initial,
          layout: _layout,
          transition: _transition,
          ...props
        }: {
          animate?: unknown;
          children: ReactNode;
          exit?: unknown;
          initial?: unknown;
          layout?: boolean;
          transition?: unknown;
        } & HTMLAttributes<HTMLDivElement>,
        ref: React.ForwardedRef<HTMLDivElement>,
      ) {
        return (
          <div ref={ref} {...props}>
            {children}
          </div>
        );
      }),
      button: React.forwardRef(function MockMotionButton(
        {
          animate: _animate,
          children,
          exit: _exit,
          initial: _initial,
          transition: _transition,
          whileHover: _whileHover,
          whileTap: _whileTap,
          ...props
        }: {
          animate?: unknown;
          children: ReactNode;
          exit?: unknown;
          initial?: unknown;
          transition?: unknown;
          whileHover?: unknown;
          whileTap?: unknown;
        } & HTMLAttributes<HTMLButtonElement>,
        ref: React.ForwardedRef<HTMLButtonElement>,
      ) {
        return (
          <button ref={ref} {...props}>
            {children}
          </button>
        );
      }),
    },
  };
});

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../logging", () => ({
  logEvent: vi.fn(),
}));

vi.mock("../debug/card-source-debug", () => ({
  buildCardSourceDebugState: () => null,
}));

vi.mock("../components/CardDisplay", () => ({
  CardDisplay: ({
    card,
    className,
    onClick,
  }: {
    card: CardData;
    className?: string;
    onClick?: () => void;
  }) => (
    <button className={className} type="button" onClick={onClick}>
      {card.name}
    </button>
  ),
}));

vi.mock("../components/CardOverlay", () => ({
  CardOverlay: () => null,
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
    ensureEssenceSiteRuntime: vi.fn(),
    acceptEssenceSite: vi.fn(),
    ensureShopRuntime: vi.fn(),
    buyShopSlot: vi.fn(),
    rerollShop: vi.fn(),
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
    resetQuest: vi.fn(),
  };
}

function makeCardDatabase(): Map<number, CardData> {
  return new Map([
    [
      1,
      {
        name: "Starter Lantern",
        id: "starter-lantern",
        cardNumber: 1,
        cardType: "Character",
        subtype: "",
        isStarter: true,
        energyCost: 1,
        spark: 1,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Starter text.",
        imageNumber: 1,
        artOwned: false,
      },
    ],
    [
      101,
      {
        name: "Arc Runner",
        id: "arc-runner",
        cardNumber: 101,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 2,
        spark: 2,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Offer text.",
        imageNumber: 101,
        artOwned: false,
      },
    ],
    [
      102,
      {
        name: "Alpha Warden",
        id: "alpha-warden",
        cardNumber: 102,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 3,
        spark: 2,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Offer text.",
        imageNumber: 102,
        artOwned: false,
      },
    ],
    [
      103,
      {
        name: "Beta Ledger",
        id: "beta-ledger",
        cardNumber: 103,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        energyCost: 4,
        spark: null,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Offer text.",
        imageNumber: 103,
        artOwned: false,
      },
    ],
    [
      104,
      {
        name: "Gamma Echo",
        id: "gamma-echo",
        cardNumber: 104,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        energyCost: 5,
        spark: null,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Offer text.",
        imageNumber: 104,
        artOwned: false,
      },
    ],
    [
      201,
      {
        name: "Reserve One",
        id: "reserve-one",
        cardNumber: 201,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 2,
        spark: 1,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Reserve text.",
        imageNumber: 201,
        artOwned: false,
      },
    ],
    [
      202,
      {
        name: "Reserve Two",
        id: "reserve-two",
        cardNumber: 202,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 3,
        spark: 1,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Reserve text.",
        imageNumber: 202,
        artOwned: false,
      },
    ],
    [
      203,
      {
        name: "Reserve Three",
        id: "reserve-three",
        cardNumber: 203,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        energyCost: 4,
        spark: null,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Reserve text.",
        imageNumber: 203,
        artOwned: false,
      },
    ],
    [
      204,
      {
        name: "Reserve Four",
        id: "reserve-four",
        cardNumber: 204,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        energyCost: 5,
        spark: null,
        isFast: false,
        tides: ["alpha"],
        renderedText: "Reserve text.",
        imageNumber: 204,
        artOwned: false,
      },
    ],
  ]);
}

function makeDraftState(): DraftState {
  return {
    remainingCopiesByCard: {
      "201": 1,
      "202": 1,
      "203": 1,
      "204": 1,
    },
    currentOffer: [101, 102, 103, 104],
    activeSiteId: "site-1",
    pickNumber: 1,
    sitePicksCompleted: 0,
  };
}

function makeState(overrides: Partial<QuestState> = {}): QuestState {
  return {
    essence: 100,
    deck: [
      {
        entryId: "entry-1",
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
      },
    ],
    dreamcaller: null,
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [],
    completionLevel: 0,
    atlas: {
      nodes: {},
      edges: [],
      nexusId: "",
    },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: makeDraftState(),
    screen: { type: "site", siteId: "site-1" },
    activeSiteId: "site-1",
    failureSummary: null,
    ...overrides,
  };
}

let currentState: QuestState;
let currentMutations: QuestMutations;
let currentCardDatabase: Map<number, CardData>;
let mountedElement: ReactElement | null = null;
let mountedRoot: Root | null = null;
let nextEntryId = 2;

function rerenderCurrent(): void {
  if (mountedElement === null || mountedRoot === null) {
    return;
  }

  act(() => {
    mountedRoot?.render(mountedElement);
  });
}

function setQuestContext(
  state: QuestState,
  mutations: QuestMutations,
  cardDatabase: Map<number, CardData>,
): void {
  currentState = state;
  currentMutations = mutations;
  currentCardDatabase = cardDatabase;

  vi.mocked(useQuest).mockImplementation(() => ({
    state: currentState,
    mutations: currentMutations,
    cardDatabase: currentCardDatabase,
    questContent: {
      cardDatabase: currentCardDatabase,
      cardsByPackageTide: new Map(),
      dreamcallers: [],
      dreamsignTemplates: [],
      resolvedPackagesByDreamcallerId: new Map(),
    },
  }));
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedElement = element;
  mountedRoot = root;
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
  vi.useFakeTimers();
  nextEntryId = 2;
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
      requestAnimationFrame: (callback: FrameRequestCallback) => number;
      cancelAnimationFrame: (handle: number) => void;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};
  mountedElement = null;
  mountedRoot = null;
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("DraftSiteScreen", () => {
  it("surfaces a draft card before header controls for mechanical QA picks", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);
    const body = container.textContent ?? "";
    const controls = Array.from(
      container.querySelectorAll("button,[role=\"button\"]"),
    ).filter((element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      return !element.hasAttribute("disabled");
    });
    const choice = controls.find((element) => {
      const text = element.textContent?.trim() ?? "";
      return (
        text !== ""
        && !/Continue|Accept|Decline|Reject|Leave Shop|Skip|Return to Atlas|Battle|Miniboss|Final Boss/.test(
          text,
        )
      );
    });

    expect(body).toContain("Pick 1/5");
    expect(choice?.textContent).toContain("Arc Runner");

    act(() => {
      root.unmount();
    });
  });

  it("shows the deck sidebar immediately on the draft screen", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    expect(container.querySelector('[data-testid="draft-deck-sidebar"]')).not.toBeNull();
    expect(container.textContent).toContain("Deck (1)");
    expect(container.textContent).toContain("Starter Lantern");

    act(() => {
      root.unmount();
    });
  });

  it("renders a fly-to-deck animation after a draft pick updates the deck", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    mutations.pickDraftCard = vi.fn((siteId: string, cardNumber: number) => {
      const draftState = currentState.draftState;
      if (draftState === null || draftState.activeSiteId !== siteId) {
        return;
      }

      currentState = {
        ...currentState,
        deck: [
          ...currentState.deck,
          {
            entryId: `entry-${String(nextEntryId++)}`,
            cardNumber,
            transfiguration: null,
            isBane: false,
          },
        ],
        draftState: {
          ...draftState,
          remainingCopiesByCard: {},
          currentOffer: [201, 202, 203, 204],
          pickNumber: draftState.pickNumber + 1,
          sitePicksCompleted: draftState.sitePicksCompleted + 1,
        },
      };
      rerenderCurrent();
    });

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    clickButton(container, "Arc Runner");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mutations.pickDraftCard).toHaveBeenCalledWith("site-1", 101);
    expect(mutations.setDraftState).not.toHaveBeenCalled();
    expect(mutations.addCard).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="draft-flying-card"]')).not.toBeNull();
    expect(container.textContent).toContain("Deck (2)");
    expect(container.textContent).toContain("Arc Runner");

    act(() => {
      root.unmount();
    });
  });

  it("keeps the draft screen open when a pick is not committed", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(makeState(), mutations, cardDatabase);

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    clickButton(container, "Arc Runner");

    act(() => {
      vi.advanceTimersByTime(300 + 500);
    });

    expect(mutations.pickDraftCard).toHaveBeenCalledWith("site-1", 101);
    expect(container.textContent).toContain("Pick 1/5");
    expect(container.textContent).toContain("Arc Runner");
    expect(container.textContent).not.toContain("Draft Complete");

    act(() => {
      root.unmount();
    });
  });

  it("completes the draft site from the committed summary", () => {
    const mutations = makeMutations();
    const cardDatabase = makeCardDatabase();
    setQuestContext(
      makeState({
        deck: [
          {
            entryId: "entry-1",
            cardNumber: 1,
            transfiguration: null,
            isBane: false,
          },
          {
            entryId: "entry-2",
            cardNumber: 101,
            transfiguration: null,
            isBane: false,
          },
        ],
        draftState: {
          remainingCopiesByCard: {},
          currentOffer: [],
          activeSiteId: "site-1",
          pickNumber: 2,
          sitePicksCompleted: 1,
        },
      }),
      mutations,
      cardDatabase,
    );

    const { container, root } = mount(<DraftSiteScreen siteId="site-1" />);

    expect(container.textContent).toContain("Draft Complete");
    clickButton(container, "Continue");

    expect(mutations.completeSite).toHaveBeenCalledWith(
      "site-1",
      "draft_site_completed",
    );
    expect(mutations.markSiteVisited).not.toHaveBeenCalled();
    expect(mutations.setScreen).toHaveBeenCalledWith({ type: "dreamscape" });

    act(() => {
      root.unmount();
    });
  });
});
