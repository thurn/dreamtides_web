// @vitest-environment jsdom

import { act } from "react";
import { MINIMAL_ATLAS_CONFIG, MINIMAL_DREAMSCAPES } from "../__test-helpers__/atlas-fixtures";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestMutations } from "../state/quest-context";
import type { CardData } from "../types/cards";
import type { DreamcallerContent } from "../types/content";
import type { QuestState } from "../types/quest";
import { QuestStartScreen, largestTides } from "./QuestStartScreen";
import { useQuest } from "../state/quest-context";
import { selectDreamcallerOffer } from "../data/dreamcaller-selection";
import type { Tides4DeckJson } from "../draft/pool/tides4-io";
import { CumulusRoot } from "../cumulus/CumulusRoot";


vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      animate: _animate,
      children,
      initial: _initial,
      transition: _transition,
      whileHover,
      whileTap,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      initial?: unknown;
      transition?: unknown;
      whileHover?: unknown;
      whileTap?: unknown;
    } & HTMLAttributes<HTMLDivElement>) => (
      <div data-transition={JSON.stringify(_transition)} data-while-hover={JSON.stringify(whileHover)} data-while-tap={JSON.stringify(whileTap)} {...props}>
        {children}
      </div>
    ),
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
    button: ({
      animate: _animate,
      children,
      initial: _initial,
      transition: _transition,
      whileHover,
      whileTap,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      initial?: unknown;
      transition?: unknown;
      whileHover?: unknown;
      whileTap?: unknown;
    } & HTMLAttributes<HTMLButtonElement>) => (
      <button
        data-transition={JSON.stringify(_transition)}
        data-while-hover={JSON.stringify(whileHover)}
        data-while-tap={JSON.stringify(whileTap)}
        {...props}
      >
        {children}
      </button>
    ),
  },
}));

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../data/dreamcaller-selection", () => ({
  selectDreamcallerOffer: vi.fn(),
}));

const OFFERED_DREAMCALLERS: readonly DreamcallerContent[] = [
  {
    id: "caller-1",
    name: "Mira of Lanterns",
    title: "Keeper of the Threshold Flame",
    renderedText: "Discover a card.",
    imageNumber: "0009",
    startingEssence: 230,
    signatureCards: ["Lantern Seer", "Banner Captain", "Verdant Sprout"],
    signatureCardIds: ["sig-1-0", "sig-1-1", "sig-1-2"],
  },
  {
    id: "caller-2",
    name: "Vey of Embers",
    title: "The Ashen Cartographer",
    renderedText: "Second dreamcaller.",
    imageNumber: "0010",
    startingEssence: 250,
    signatureCards: ["Ember Scout", "Charging Host", "Quick Striker"],
    signatureCardIds: ["sig-2-0", "sig-2-1", "sig-2-2"],
  },
  {
    id: "caller-3",
    name: "Noctis of Tides",
    title: "Harbinger of the Ninth Current",
    renderedText: "Third dreamcaller.",
    imageNumber: "0011",
    startingEssence: 285,
    signatureCards: ["Void Revenant", "Crowned Spark", "Endless Procession"],
    signatureCardIds: ["sig-3-0", "sig-3-1", "sig-3-2"],
  },
] as const;

let currentMutations: QuestMutations;

const SIGNATURE_CARDS = OFFERED_DREAMCALLERS.flatMap((dreamcaller) =>
  (dreamcaller.signatureCards ?? []).map((name, index) => ({
    dreamcallerId: dreamcaller.id,
    name,
    id: (dreamcaller.signatureCardIds ?? [])[index],
  })),
);

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
    enterDraftSite: vi.fn(),
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

function makeState(): QuestState {
  return {
    runId: null,
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
    screen: { type: "questStart" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
  };
}

function setQuestContext(): void {
  currentMutations = makeMutations();
  vi.mocked(useQuest).mockReturnValue({
    state: makeState(),
    mutations: currentMutations,
    cardDatabase: new Map<number, CardData>(),
    questContent: {
      cardDatabase: new Map(),
      dreamcallers: [...OFFERED_DREAMCALLERS],

      dreamwellCards: [],      dreamsignTemplates: [],      dreamscapes: MINIMAL_DREAMSCAPES,      affiliations: [], guides: [],      atlasConfig: MINIMAL_ATLAS_CONFIG,
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
    root.render(<CumulusRoot>{element}</CumulusRoot>);
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
  setQuestContext();
  vi.mocked(selectDreamcallerOffer).mockReturnValue([...OFFERED_DREAMCALLERS]);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("QuestStartScreen", () => {
  it("shows exactly 3 Dreamcaller choices with their signature cards", () => {
    const { container, root } = mount(<QuestStartScreen />);

    expect(container.textContent).toContain("Mira of Lanterns");
    expect(container.textContent).toContain("Vey of Embers");
    expect(container.textContent).toContain("Noctis of Tides");
    expect(container.textContent).toContain("Choose Your Dreamcaller");
    expect(container.textContent).toContain("Signature Cards:");
    expect(container.querySelectorAll("button")).toHaveLength(3);
    expect(
      container.querySelectorAll("[data-signature-cards-label]"),
    ).toHaveLength(3);
    expect(container.querySelectorAll("[data-signature-cards-label-tooltip]")).toHaveLength(3);
    for (const dreamcaller of OFFERED_DREAMCALLERS) {
      const explanation = container.querySelector(
        `[data-signature-cards-label-tooltip="${dreamcaller.id}"]`,
      );
      expect(explanation?.textContent).toContain("define this Dreamcaller's strategy");
    }
    expect(
      container.querySelectorAll("[data-dreamcaller-signature-card]"),
    ).toHaveLength(SIGNATURE_CARDS.length);
    expect(
      Array.from(
        container.querySelectorAll("[data-dreamcaller-signature-card]"),
      ).map((card) => card.getAttribute("data-dreamcaller-signature-card")),
    ).toEqual(
      SIGNATURE_CARDS.map((card) => `${card.dreamcallerId}:${card.id}`),
    );

    for (const dreamcaller of OFFERED_DREAMCALLERS) {
      const label = container.querySelector(
        `[data-signature-cards-label="${dreamcaller.id}"]`,
      );
      expect(label?.textContent).toBe("Signature Cards:");
      expect((label as HTMLElement | null)?.style.color).toBe(
        "rgb(148, 163, 184)",
      );
      expect(
        container.querySelector(
          `[data-signature-cards-label-tooltip="${dreamcaller.id}"]`,
        ),
      ).not.toBeNull();
    }

    for (const card of SIGNATURE_CARDS) {
      expect(container.textContent).toContain(card.name);
      const row = container.querySelector(
        `[data-dreamcaller-signature-card="${card.dreamcallerId}:${card.id}"]`,
      );
      const visibleRow = row?.firstElementChild;
      expect(visibleRow).not.toBeNull();
      expect((visibleRow as HTMLElement | null)?.style.color).toBe(
        "rgb(255, 255, 255)",
      );
      const icon = container.querySelector(
        `[data-dreamcaller-signature-card-icon="${card.dreamcallerId}:${card.id}"]`,
      );
      expect(icon?.className).toContain("bx-star");
    }

    const secondDreamcallerButton = Array.from(
      container.querySelectorAll("button"),
    ).find((candidate) => candidate.textContent?.includes("Vey of Embers"));
    if (!secondDreamcallerButton) {
      throw new Error("Missing dreamcaller selection button");
    }

    act(() => {
      secondDreamcallerButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    // The screen mints the run seed up front (so the tides4 preview matches the
    // dealt pool) and hands it to startQuest alongside the chosen Dreamcaller.
    expect(currentMutations.startQuest).toHaveBeenCalledWith(
      OFFERED_DREAMCALLERS[1],
      expect.any(String),
    );

    act(() => {
      root.unmount();
    });
  });

  it("renders each Dreamcaller's tuned starting essence on its selection card", () => {
    const { container, root } = mount(<QuestStartScreen />);

    for (const dreamcaller of OFFERED_DREAMCALLERS) {
      const valueNode = container.querySelector(
        `[data-starting-essence-value="${dreamcaller.id}"]`,
      );
      expect(valueNode).not.toBeNull();
      expect(valueNode?.textContent).toBe(String(dreamcaller.startingEssence));
      const glyph = valueNode?.querySelector("i.bx-crypto");
      expect(glyph).not.toBeNull();
      expect((glyph as HTMLElement | null)?.style.color).toBe("var(--essence)");
      const source = valueNode?.querySelector<HTMLElement>("[data-resource-source]");
      expect(source?.getAttribute("aria-describedby")).toMatch(/^cumulus-reveal-description-/);
      expect(document.getElementById(source?.getAttribute("aria-describedby") ?? "")?.textContent).toContain("Starting Essence");
      const row = container.querySelector(
        `[data-starting-essence="${dreamcaller.id}"]`,
      );
      expect(row?.textContent).toContain("Starting Essence");
    }

    act(() => {
      root.unmount();
    });
  });

  it("keeps glossary interaction outside the single Dreamcaller selection owner", () => {
    const { container, root } = mount(<QuestStartScreen />);
    const glossary = container.querySelector<HTMLElement>('[data-glossary-term="Discover"]');
    const choice = container.querySelector<HTMLButtonElement>('button[aria-label^="Choose Mira of Lanterns"]');
    expect(glossary).not.toBeNull();
    expect(choice).not.toBeNull();
    expect(choice?.contains(glossary ?? null)).toBe(false);

    act(() => { glossary?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(currentMutations.startQuest).not.toHaveBeenCalled();

    act(() => {
      choice?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      choice?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(currentMutations.startQuest).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("renders signature-card help as static explanatory copy", () => {
      const { container, root } = mount(<QuestStartScreen />);
      expect(container.querySelectorAll("[data-signature-cards-label-tooltip]")).toHaveLength(3);
      expect(document.querySelector("[data-cumulus-reveal-portal]")).toBeNull();
      act(() => root.unmount());
  });

  it("does not embed signature-card rows inside the Dreamcaller card button", () => {
    vi.useFakeTimers();
    try {
      const { container, root } = mount(<QuestStartScreen />);

      const dreamcallerButtons = Array.from(
        container.querySelectorAll("button"),
      );
      expect(dreamcallerButtons).toHaveLength(3);

      for (const button of dreamcallerButtons) {
        // The button (the visually-emphasized surface while hovering a
        // Dreamcaller card) must not embed any signature-card chip, label, or
        // info icon. Signature-card rows live in the static card body
        // alongside the button, not inside it.
        expect(
          button.querySelectorAll("[data-dreamcaller-signature-card]"),
        ).toHaveLength(0);
        expect(
          button.querySelectorAll("[data-signature-cards-label]"),
        ).toHaveLength(0);
        expect(
          button.querySelectorAll("[data-signature-cards-info-icon]"),
        ).toHaveLength(0);
        for (const card of SIGNATURE_CARDS) {
          expect(button.textContent).not.toContain(card.name);
        }
      }

      // Hovering the choice leaves the static help in place and creates no
      // transient reveal portal.
      act(() => {
        dreamcallerButtons[0]?.dispatchEvent(
          new MouseEvent("mouseover", { bubbles: true }),
        );
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(container.querySelectorAll("[data-signature-cards-label-tooltip]")).toHaveLength(3);
      expect(document.querySelector("[data-cumulus-reveal-portal]")).toBeNull();

      act(() => {
        root.unmount();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies instant hover and tap transitions even with staggered entrance animation", () => {
    const { container, root } = mount(<QuestStartScreen />);

    const firstDreamcallerButton = container.querySelector('button[aria-label^="Choose "]');
    if (!firstDreamcallerButton) {
      throw new Error("Missing dreamcaller selection button");
    }
    const firstDreamcallerSurface = firstDreamcallerButton.parentElement;
    const firstDreamcallerWrapper = firstDreamcallerSurface?.parentElement;
    if (!firstDreamcallerWrapper || !firstDreamcallerSurface) {
      throw new Error("Missing dreamcaller wrapper");
    }

    const transition = JSON.parse(
      firstDreamcallerWrapper.getAttribute("data-transition") ?? "null",
    ) as { delay?: number } | null;
    const whileHover = JSON.parse(
      firstDreamcallerSurface.getAttribute("data-while-hover") ?? "null",
    ) as { transition?: { delay?: number; duration?: number } } | null;
    const whileTap = JSON.parse(
      firstDreamcallerButton.getAttribute("data-while-tap") ?? "null",
    ) as { transition?: { delay?: number; duration?: number } } | null;

    expect(transition?.delay).toBeGreaterThan(0);
    expect(whileHover?.transition).toEqual({ delay: 0, duration: 0.12 });
    expect(whileTap?.transition).toEqual({ delay: 0, duration: 0.08 });

    act(() => {
      root.unmount();
    });
  });
});

describe("largestTides", () => {
  function tide(id: string, cardCount: number): Tides4DeckJson {
    return {
      id,
      name: id,
      role: "facet",
      color: "purple",
      cards: Array.from({ length: cardCount }, (_, index) => ({
        id: `${id}-card-${index}`,
        name: `${id}-card-${index}`,
        copies: 1,
      })),
    };
  }

  it("returns the input unchanged when at or below the cap", () => {
    const tides = [tide("a", 5), tide("b", 3), tide("c", 1)];
    expect(largestTides(tides)).toEqual(tides);
  });

  it("keeps the four largest tides by total card count", () => {
    const tides = [
      tide("a", 2),
      tide("b", 10),
      tide("c", 1),
      tide("d", 8),
      tide("e", 5),
      tide("f", 3),
    ];
    expect(largestTides(tides).map((t) => t.id)).toEqual(["b", "d", "e", "f"]);
  });

  it("preserves the original order of the kept tides", () => {
    const tides = [
      tide("first", 9),
      tide("second", 1),
      tide("third", 8),
      tide("fourth", 7),
      tide("fifth", 6),
    ];
    expect(largestTides(tides).map((t) => t.id)).toEqual([
      "first",
      "third",
      "fourth",
      "fifth",
    ]);
  });

  it("counts copies, not unique card entries", () => {
    const big: Tides4DeckJson = {
      id: "big",
      name: "big",
      role: "facet",
      color: "purple",
      cards: [{ id: "x", name: "x", copies: 20 }],
    };
    const tides = [
      tide("a", 5),
      tide("b", 5),
      tide("c", 5),
      tide("d", 5),
      big,
    ];
    expect(largestTides(tides).map((t) => t.id)).toContain("big");
    expect(largestTides(tides)).toHaveLength(4);
  });
});
