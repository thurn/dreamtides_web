// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestMutations } from "../state/quest-context";
import type { CardData } from "../types/cards";
import type { DreamcallerContent } from "../types/content";
import type { QuestState } from "../types/quest";
import { QuestStartScreen } from "./QuestStartScreen";
import { useQuest } from "../state/quest-context";
import { selectDreamcallerOffer } from "../data/dreamcaller-selection";

const TIDES_LABEL_HOVER_BLURB =
  "These tide pools will be shuffled together to form the draft pool.";

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
    } & HTMLAttributes<HTMLDivElement>) => (
      <div data-transition={JSON.stringify(_transition)} {...props}>
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
    renderedText: "First dreamcaller.",
    imageNumber: "0009",
    startingEssence: 230,
    mandatoryTides: ["materialize_value", "ally_formation", "cheap_curve"],
    optionalTides: ["spirit_growth", "topdeck_setup", "resource_burst"],
  },
  {
    id: "caller-2",
    name: "Vey of Embers",
    title: "The Ashen Cartographer",
    renderedText: "Second dreamcaller.",
    imageNumber: "0010",
    startingEssence: 250,
    mandatoryTides: ["warrior_pressure", "ally_wide", "tempo_resets"],
    optionalTides: ["tempo_resets", "fast_tempo", "resource_burst"],
  },
  {
    id: "caller-3",
    name: "Noctis of Tides",
    title: "Harbinger of the Ninth Current",
    renderedText: "Third dreamcaller.",
    imageNumber: "0011",
    startingEssence: 285,
    mandatoryTides: ["void_recursion", "spark_tall", "trigger_reuse"],
    optionalTides: ["trigger_reuse", "character_chain", "void_setup"],
  },
] as const;

let currentMutations: QuestMutations;

const DISPLAYED_TIDES = [
  {
    appearance: "mandatory",
    displayName: "Echo Arrival",
    dreamcallerId: "caller-1",
    hoverBlurb:
      "Arrival is never just arrival. Every entrance leaves behind an extra page of value, until replay itself feels like drawing breath.",
    id: "materialize_value",
    kind: "structural",
  },
  {
    appearance: "mandatory",
    displayName: "Banner Formation",
    dreamcallerId: "caller-1",
    hoverBlurb:
      "This tide fights like a drilled company. Position matters, timing matters, and a disciplined line turns ordinary allies into a precise machine.",
    id: "ally_formation",
    kind: "structural",
  },
  {
    appearance: "optional",
    displayName: "Verdant Ascent",
    dreamcallerId: "caller-1",
    hoverBlurb:
      "Life gathers momentum in secret roots. Small turns become rich turns, rich turns become overwhelming ones, and the dream keeps flowering upward.",
    id: "spirit_growth",
    kind: "structural",
  },
  {
    appearance: "optional",
    displayName: "Crown the Draw",
    dreamcallerId: "caller-1",
    hoverBlurb:
      "Tools that prepare the top of the deck so future draws and reveals land where they should.",
    id: "topdeck_setup",
    kind: "support",
  },
  {
    appearance: "mandatory",
    displayName: "Iron Charge",
    dreamcallerId: "caller-2",
    hoverBlurb:
      "A war drum beat made into doctrine. The first bodies hit hard, then every follow-up turns the field into a sprint the enemy cannot survive.",
    id: "warrior_pressure",
    kind: "structural",
  },
  {
    appearance: "mandatory",
    displayName: "Rising Host",
    dreamcallerId: "caller-2",
    hoverBlurb:
      "A single threat can be answered. A battlefield that keeps filling cannot. The host grows until the whole dream is occupied.",
    id: "ally_wide",
    kind: "structural",
  },
  {
    appearance: "optional",
    displayName: "Quickened Edge",
    dreamcallerId: "caller-2",
    hoverBlurb:
      "Victory lives in the half-second before the rival is ready. This tide steals initiative, acts at impossible moments, and never gives it back.",
    id: "fast_tempo",
    kind: "structural",
  },
  {
    appearance: "optional",
    displayName: "Sudden Windfall",
    dreamcallerId: "caller-2",
    hoverBlurb:
      "Temporary acceleration that creates one oversized turn even if the deck cannot sustain it forever.",
    id: "resource_burst",
    kind: "support",
  },
  {
    appearance: "mandatory",
    displayName: "Haunting Return",
    dreamcallerId: "caller-3",
    hoverBlurb:
      "Nothing properly leaves. The void keeps its own ledger, and what was spent comes stalking back when the moment is right.",
    id: "void_recursion",
    kind: "structural",
  },
  {
    appearance: "mandatory",
    displayName: "Kindled Crown",
    dreamcallerId: "caller-3",
    hoverBlurb:
      "All strength is gathered into a chosen few. One threat grows radiant enough to rule the board while lesser bodies exist only to feed it.",
    id: "spark_tall",
    kind: "structural",
  },
  {
    appearance: "optional",
    displayName: "Living Procession",
    dreamcallerId: "caller-3",
    hoverBlurb:
      "Each body invites the next. The turn becomes a procession of arrivals, rebates, and chained deployments that never quite stop on schedule.",
    id: "character_chain",
    kind: "structural",
  },
  {
    appearance: "optional",
    displayName: "Grave Preparation",
    dreamcallerId: "caller-3",
    hoverBlurb:
      "Self-mill and discard support that makes void payoffs turn on earlier and more reliably.",
    id: "void_setup",
    kind: "support",
  },
] as const;

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
    ensureCardChoiceRuntime: vi.fn(),
    acceptTransfigurationChoice: vi.fn(),
    acceptDuplicationChoice: vi.fn(),
    ensureDreamJourneyRuntime: vi.fn(),
    completeDreamJourneyOption: vi.fn(),
    ensureTemptingOfferRuntime: vi.fn(),
    completeTemptingOfferOption: vi.fn(),
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

function makeState(): QuestState {
  return {
    essence: 250,
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
      nexusId: "",
    },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: null,
    screen: { type: "questStart" },
    activeSiteId: null,
    failureSummary: null,
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
      cardsByPackageTide: new Map(),
      dreamcallers: [...OFFERED_DREAMCALLERS],
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
  setQuestContext();
  vi.mocked(selectDreamcallerOffer).mockReturnValue([...OFFERED_DREAMCALLERS]);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("QuestStartScreen", () => {
  it("shows exactly 3 Dreamcaller choices", () => {
    const { container, root } = mount(<QuestStartScreen />);

    expect(container.textContent).toContain("Mira of Lanterns");
    expect(container.textContent).toContain("Vey of Embers");
    expect(container.textContent).toContain("Noctis of Tides");
    expect(container.textContent).toContain("Choose Your Dreamcaller");
    expect(container.textContent).toContain("Tides:");
    expect(container.textContent).not.toContain("Structural Tides");
    expect(container.querySelectorAll("button")).toHaveLength(3);
    expect(
      container.querySelectorAll("[data-structural-tides-label]"),
    ).toHaveLength(3);
    expect(
      container.querySelectorAll("[data-structural-tides-info-icon]"),
    ).toHaveLength(3);
    for (const dreamcaller of OFFERED_DREAMCALLERS) {
      const icon = container.querySelector(
        `[data-structural-tides-info-icon="${dreamcaller.id}"]`,
      );
      expect(icon).not.toBeNull();
      expect(icon?.className).toContain("bx-info-circle");
      expect(icon?.getAttribute("aria-label")).toBe("About tides");
      expect((icon as HTMLElement | null)?.style.color).toBe(
        "rgb(148, 163, 184)",
      );
    }
    expect(
      container.querySelectorAll("[data-dreamcaller-tide]"),
    ).toHaveLength(DISPLAYED_TIDES.length);
    expect(
      Array.from(container.querySelectorAll("[data-dreamcaller-tide]")).map((tide) =>
        tide.getAttribute("data-dreamcaller-tide"),
      ),
    ).toEqual(
      DISPLAYED_TIDES.map(
        (tide) => `${tide.dreamcallerId}:${tide.id}`,
      ),
    );

    for (const dreamcaller of OFFERED_DREAMCALLERS) {
      const label = container.querySelector(
        `[data-structural-tides-label="${dreamcaller.id}"]`,
      );
      expect(label?.textContent).toBe("Tides:");
      expect((label as HTMLElement | null)?.style.color).toBe(
        "rgb(148, 163, 184)",
      );
      // The HoverPopover content is portaled to document.body only while
      // the trigger is hovered, so it is not in the static DOM.
      expect(
        container.querySelector(
          `[data-structural-tides-label-tooltip="${dreamcaller.id}"]`,
        ),
      ).toBeNull();
    }

    for (const tide of DISPLAYED_TIDES) {
      expect(container.textContent).toContain(tide.displayName);
      expect(container.textContent).toContain(tide.hoverBlurb);
      const row = container.querySelector(
        `[data-dreamcaller-tide="${tide.dreamcallerId}:${tide.id}"]`,
      );
      expect(row?.getAttribute("data-dreamcaller-tide-appearance")).toBe(
        tide.appearance,
      );
      expect(row?.getAttribute("data-dreamcaller-tide-kind")).toBe(tide.kind);
      const visibleRow = row?.firstElementChild;
      expect(visibleRow).not.toBeNull();
      expect((visibleRow as HTMLElement | null)?.style.color).toBe(
        tide.appearance === "optional"
          ? "rgb(148, 163, 184)"
          : "rgb(255, 255, 255)",
      );
      const icon = container.querySelector(
        `[data-dreamcaller-tide-icon="${tide.dreamcallerId}:${tide.id}"]`,
      );
      expect(icon?.className).toContain("bx");
      expect(icon?.className).toContain(
        tide.kind === "structural" ? "bx" : "bxs-circle",
      );
      expect((icon as HTMLElement | null)?.style.color).toBe(
        tide.appearance === "optional"
          ? "rgb(148, 163, 184)"
          : "rgb(255, 255, 255)",
      );
      if (tide.kind === "structural") {
        expect(
          container.querySelector(
            `[data-dreamcaller-tide-tooltip="${tide.dreamcallerId}:${tide.id}"]`,
          )?.textContent,
        ).toBe(tide.hoverBlurb);
      } else {
        expect(
          container.querySelector(
            `[data-dreamcaller-tide-tooltip="${tide.dreamcallerId}:${tide.id}"]`,
          )?.textContent,
        ).toBe(tide.hoverBlurb);
      }
    }

    expect(container.textContent).not.toContain("topdeck_setup");
    expect(container.textContent).not.toContain("tempo_resets");
    expect(container.textContent).not.toContain("resource_burst");
    expect(container.textContent).not.toContain("trigger_reuse");
    expect(container.textContent).not.toContain("void_setup");
    expect(container.textContent).not.toContain("cheap_curve");

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

    expect(currentMutations.startQuest).toHaveBeenCalledWith(
      OFFERED_DREAMCALLERS[1],
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
      expect((valueNode as HTMLElement | null)?.style.color).toBe(
        "var(--color-essence)",
      );
      const row = container.querySelector(
        `[data-starting-essence="${dreamcaller.id}"]`,
      );
      expect(row?.textContent).toContain("Starting Essence");
    }

    act(() => {
      root.unmount();
    });
  });

  it("portals the tides explanation popover into the body when the (i) icon is hovered", () => {
    vi.useFakeTimers();
    try {
      const { container, root } = mount(<QuestStartScreen />);

      const firstIcon = container.querySelector(
        `[data-structural-tides-info-icon="${OFFERED_DREAMCALLERS[0].id}"]`,
      );
      expect(firstIcon).not.toBeNull();
      // The HoverPopover wraps its child in a <span>; dispatch mouse events
      // on that wrapper because that is where React attaches the listeners.
      const triggerWrapper = firstIcon?.parentElement;
      expect(triggerWrapper).not.toBeNull();

      // No popover content is in the DOM before hover.
      expect(
        document.body.querySelectorAll(
          "[data-structural-tides-label-tooltip]",
        ),
      ).toHaveLength(0);

      act(() => {
        triggerWrapper?.dispatchEvent(
          new MouseEvent("mouseover", { bubbles: true }),
        );
      });
      act(() => {
        vi.advanceTimersByTime(600);
      });

      const tooltip = document.body.querySelector(
        `[data-structural-tides-label-tooltip="${OFFERED_DREAMCALLERS[0].id}"]`,
      );
      expect(tooltip).not.toBeNull();
      expect(tooltip?.textContent).toBe(TIDES_LABEL_HOVER_BLURB);

      // Mouse leave hides the popover.
      act(() => {
        triggerWrapper?.dispatchEvent(
          new MouseEvent("mouseout", { bubbles: true }),
        );
      });
      expect(
        document.body.querySelectorAll(
          "[data-structural-tides-label-tooltip]",
        ),
      ).toHaveLength(0);

      act(() => {
        root.unmount();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies instant hover and tap transitions even with staggered entrance animation", () => {
    const { container, root } = mount(<QuestStartScreen />);

    const firstDreamcallerButton = container.querySelector("button");
    if (!firstDreamcallerButton) {
      throw new Error("Missing dreamcaller selection button");
    }
    const firstDreamcallerWrapper = firstDreamcallerButton.parentElement;
    if (!firstDreamcallerWrapper) {
      throw new Error("Missing dreamcaller wrapper");
    }

    const transition = JSON.parse(
      firstDreamcallerWrapper.getAttribute("data-transition") ?? "null",
    ) as { delay?: number } | null;
    const whileHover = JSON.parse(
      firstDreamcallerButton.getAttribute("data-while-hover") ?? "null",
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
