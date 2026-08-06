// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { TRANSFIGURATION_TINT_COLORS } from "../../runtime/transfiguration-display";
import { CumulusRoot } from "../CumulusRoot";
import {
  ENERGY_ICON_COLOR,
  SPARK_ICON_COLOR,
} from "../components/controls/StandaloneGlyph";
import { JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP } from "../components/hud/JourneyStatusBar";
import { artRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import {
  ExplorationSiteScreen,
  type ExplorationSiteView,
} from "./ExplorationSiteScreen";

const reducedMotionPreference = vi.hoisted(() => ({ value: true }));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const MotionElement = React.forwardRef<
    HTMLElement,
    React.HTMLAttributes<HTMLElement> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
      layout?: unknown;
      onAnimationComplete?: () => void;
    }
  >(function MotionElement(
    {
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      layout: _layout,
      onAnimationComplete,
      ...props
    },
    ref,
  ) {
    return React.createElement("div", {
      ...props,
      ref,
      onContextMenu: onAnimationComplete,
    });
  });
  return {
    motion: {
      div: MotionElement,
      img: MotionElement,
      main: MotionElement,
      section: MotionElement,
      span: MotionElement,
    },
    useReducedMotion: () => reducedMotionPreference.value,
  };
});

function makeCard(): CardData {
  return {
    id: asCardId("00000000-0000-4000-8000-000000000017"),
    name: asCardName("Exploration Fixture"),
    cardNumber: 17,
    cardType: "Character",
    subtype: "Fixture",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "A synthetic observable rule.",
    imageNumber: 17,
    artOwned: true,
  };
}

function view(resolved = false): ExplorationSiteView {
  const selected = makeCard();
  return {
    siteId: "exploration-site",
    scene: null,
    guide: {
      id: "layaway",
      name: '"Layaway"',
      line: "Every card dreams, friend. Draw one, and we'll step inside.",
      art: artRef.dreamGuide("layaway"),
    },
    card: {
      cardId: selected.id,
      displaySnapshot: selected,
    },
    fullArt: artRef.explorationCard(selected.imageNumber),
    narrative: "A synthetic encounter waits in the dark.",
    actions: [
      {
        id: "choice-a",
        effectKind: "gain-card",
        mechanics: { effectKind: "gain-card" },
        label: "Choose A",
        effectText: "Gain the fixture.",
        followup: { kind: "none" },
        available: true,
      },
      {
        id: "choice-b",
        effectKind: "change-subtype-selected",
        mechanics: { effectKind: "change-subtype-selected" },
        label: "Choose B",
        effectText: "Change the fixture.",
        followup: { kind: "none" },
        available: true,
      },
    ],
    resolvedActionId: resolved ? "choice-a" : null,
    reward: null,
    outcomeKind: null,
  };
}

function twoCardRewardView(): ExplorationSiteView {
  const base = view(true);
  const second = {
    ...base.card,
    cardId: asCardId("00000000-0000-4000-8000-000000000018"),
    displaySnapshot: {
      ...base.card.displaySnapshot,
      id: asCardId("00000000-0000-4000-8000-000000000018"),
      name: asCardName("Second Survivor Fixture"),
      cardNumber: 18,
      imageNumber: 18,
    },
  };
  return {
    ...base,
    reward: {
      objects: { cards: [base.card, second], purgedCards: [], dreamsigns: [] },
      deckModification: null,
    },
  };
}

function purgeAndCopyRewardView(): ExplorationSiteView {
  const base = twoCardRewardView();
  if (base.reward === null || "kind" in base.reward) return base;
  const copiedCardModel = base.reward.objects.cards[0];
  const purgedCardModel = base.reward.objects.cards[1];
  if (copiedCardModel === undefined || purgedCardModel === undefined) return base;
  return {
    ...base,
    outcomeKind: "purge-and-copy",
    reward: {
      kind: "purge-and-copy",
      purgedCard: {
        entryId: "purged-entry",
        model: purgedCardModel,
        isBane: false,
      },
      sourceEntryId: "source-entry",
      source: {
        entryId: "source-entry",
        model: copiedCardModel,
        isBane: false,
      },
      cards: [
        {
          entryId: "copy-entry",
          model: copiedCardModel,
          isBane: false,
        },
      ],
      count: 1,
    },
  };
}

function dreamsignRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    reward: {
      objects: {
        cards: [],
        purgedCards: [],
        dreamsigns: [
          {
            id: "reward-dreamsign-id",
            name: "Reward Dreamsign",
            effectDescription: "A synthetic reward sign.",
            imageName: "reward-dreamsign.webp",
            imageAlt: "Reward Dreamsign art",
          },
        ],
      },
      deckModification: null,
    },
  };
}

function transfigurationRewardView(): ExplorationSiteView {
  const base = view(true);
  return {
    ...base,
    reward: {
      kind: "transfiguration",
      entryId: "deck-entry-transfigured",
      before: base.card,
      after: {
        cardId: base.card.cardId,
        displaySnapshot: {
          ...base.card.displaySnapshot,
          spark: (base.card.displaySnapshot.spark ?? 0) * 2,
        },
        transfiguration: {
          type: "Kindled",
          color: TRANSFIGURATION_TINT_COLORS.Kindled,
          markedText: base.card.displaySnapshot.renderedText,
          energyChanged: false,
          sparkChanged: true,
          fastChanged: false,
        },
      },
    },
  };
}

function deckModificationRewardView(
  kind: "spark" | "fast" = "spark",
): ExplorationSiteView {
  const base = view(true);
  const first =
    kind === "fast"
      ? {
          ...base.card,
          displaySnapshot: { ...base.card.displaySnapshot, isFast: true },
        }
      : base.card;
  const second = {
    ...base.card,
    cardId: asCardId("00000000-0000-4000-8000-000000000018"),
    displaySnapshot: {
      ...base.card.displaySnapshot,
      id: asCardId("00000000-0000-4000-8000-000000000018"),
      name: asCardName("Second Modified Fixture"),
      cardNumber: 18,
      spark: 4,
      isFast: kind === "fast",
      imageNumber: 18,
    },
  };
  return {
    ...base,
    reward: {
      objects: { cards: [], purgedCards: [], dreamsigns: [] },
      deckModification: {
        kind,
        headline: kind === "spark" ? "+1 ✦" : "Fast",
        announcement:
          kind === "spark"
            ? "All characters in your deck gain +1✦"
            : "All cards in your deck become ❖ (fast)",
        selectionColor: kind === "spark" ? "spark" : "accent-bright",
        cards: [
          { entryId: "deck-entry-a", model: first, isBane: false },
          { entryId: "deck-entry-b", model: second, isBane: false },
        ],
      },
    },
  };
}

function essenceRewardView(): ExplorationSiteView {
  const base = view(true);
  const cards = Array.from({ length: 6 }, (_unused, index) => ({
    entryId: `spirit-animal-entry-${String(index + 1)}`,
    model: {
      ...base.card,
      cardId: asCardId(
        `00000000-0000-4000-8000-${String(index + 21).padStart(12, "0")}`,
      ),
      displaySnapshot: {
        ...base.card.displaySnapshot,
        id: asCardId(
          `00000000-0000-4000-8000-${String(index + 21).padStart(12, "0")}`,
        ),
        name: asCardName(`Spirit Animal ${String(index + 1)}`),
        cardNumber: index + 21,
        imageNumber: index + 21,
        subtype: "Spirit Animal",
      },
    },
    isBane: false,
  }));
  return {
    ...base,
    reward: {
      kind: "essence",
      cards,
      essencePerCard: 15,
      totalEssence: 90,
    },
  };
}

function purgedDreamsignEssenceRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    reward: {
      kind: "purged-dreamsign-essence",
      dreamsign: {
        id: "purged-dreamsign-id",
        name: "Purged Dreamsign",
        effectDescription: "A synthetic purged sign.",
        imageName: "purged-dreamsign.webp",
        imageAlt: "Purged Dreamsign art",
      },
      totalEssence: 50,
    },
  };
}

function cardCopiesRewardView(): ExplorationSiteView {
  const base = view(true);
  return {
    ...base,
    outcomeKind: "card-copies",
    reward: {
      kind: "card-copies",
      sourceEntryId: "source-entry",
      source: { entryId: "source-entry", model: base.card, isBane: false },
      count: 2,
      cards: [
        { entryId: "copy-entry-a", model: base.card, isBane: false },
        { entryId: "copy-entry-b", model: base.card, isBane: false },
      ],
    },
  };
}

function multipleCardCopiesRewardView(): ExplorationSiteView {
  const base = view(true);
  const secondCard = {
    ...base.card,
    cardId: asCardId("00000000-0000-4000-8000-000000000018"),
    displaySnapshot: {
      ...base.card.displaySnapshot,
      id: asCardId("00000000-0000-4000-8000-000000000018"),
      name: asCardName("Second Copy Fixture"),
      cardNumber: 18,
      imageNumber: 18,
    },
  };
  return {
    ...base,
    outcomeKind: "card-copies-multiple",
    reward: {
      kind: "card-copies-multiple",
      count: 2,
      pairs: [
        {
          source: { entryId: "source-entry-a", model: base.card, isBane: false },
          copy: { entryId: "copy-entry-a", model: base.card, isBane: false },
        },
        {
          source: { entryId: "source-entry-b", model: secondCard, isBane: false },
          copy: { entryId: "copy-entry-b", model: secondCard, isBane: false },
        },
      ],
    },
  };
}

function purgedCardEssenceRewardView(): ExplorationSiteView {
  const base = view(true);
  return {
    ...base,
    outcomeKind: "purged-card-essence",
    reward: {
      kind: "purged-card-essence",
      card: { entryId: "purged-entry", model: base.card, isBane: false },
      spark: 2,
      essencePerSpark: 20,
      totalEssence: 40,
    },
  };
}

function battleModifierRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    outcomeKind: "battle-modifier",
    reward: {
      kind: "battle-modifier",
      modifier: "starting-energy",
      amount: 2,
      battlesRemaining: 1,
    },
  };
}

function smallerHandDiscountRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    outcomeKind: "smaller-hand-and-cost-discount",
    reward: {
      kind: "smaller-hand-and-cost-discount",
      openingHandDelta: -1,
      energyCostReduction: 1,
      battlesRemaining: 1,
    },
  };
}

function dreamAvatarRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    outcomeKind: "dream-avatar",
    reward: {
      kind: "dream-avatar",
      previous: null,
      current: {
        id: "dream-avatar-new",
        name: "New Dream Avatar",
        title: "The Synthetic",
        renderedText: "A synthetic ability.",
        imageNumber: "017",
        startingEssence: 250,
      },
    },
  };
}

function siteOfferModifierRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    outcomeKind: "site-offer-modifier",
    reward: {
      kind: "site-offer-modifier",
      modifier: "transfigure-next-draft-or-shop",
      sourceSiteId: "exploration-site",
      sourceActionId: "choice-a",
    },
  };
}

function emptyCardAcquisitionRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    outcomeKind: "card-acquisition",
    reward: {
      semanticKind: "card-acquisition",
      objects: { cards: [], purgedCards: [], dreamsigns: [] },
      deckModification: null,
    },
  };
}

function stubMatchMedia(): void {
  window.matchMedia = (query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

function pointer(
  type: "pointerdown" | "pointerup",
  options: {
    readonly pointerId: number;
    readonly timeStamp: number;
  },
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: 280,
    clientY: 160,
  });
  Object.defineProperties(event, {
    pointerType: { value: "touch" },
    pointerId: { value: options.pointerId },
    timeStamp: { value: options.timeStamp },
  });
  return event;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  reducedMotionPreference.value = true;
  stubMatchMedia();
  globalThis.ResizeObserver = ResizeObserverStub;
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
  window.cancelAnimationFrame = () => undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("ExplorationSiteScreen", () => {
  it("breaks the selected card's licensed art into a dismissible fullscreen layer", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const onChannel = vi.fn();
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={onChannel}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const cardSlot = container.querySelector<HTMLElement>(
      "[data-exploration-card-slot]",
    );
    const channel = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-channel"]',
    );
    expect(
      container.querySelector('[data-testid="cumulus-exploration-panel"]'),
    ).toBeNull();
    expect(
      container.querySelector("[data-guide-gallery-guide]"),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-guide-art"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-speech"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("Channel A Possibility");
    expect(container.textContent).not.toContain(
      "A single thread rises from your deck.",
    );
    expect(cardSlot?.dataset.cardId).toBe(view().card.cardId);
    expect(
      container
        .querySelector('[data-testid="cumulus-exploration-revealed-card"]')
        ?.getAttribute("data-card-id"),
    ).toBe(view().card.cardId);
    expect(channel?.textContent).toContain("Delve");
    expect(channel?.dataset.glassVariant).toBe("accent");
    expect(channel?.dataset.glassPlacement).toBe("onMedia");

    const fullArtPreload = container.querySelector<HTMLImageElement>(
      'img[aria-hidden="true"][style*="display: none"]',
    );
    if (fullArtPreload === null) throw new Error("Expected full-art preload");
    Object.defineProperties(fullArtPreload, {
      naturalWidth: { configurable: true, value: 1060 },
      naturalHeight: { configurable: true, value: 1600 },
    });
    act(() => {
      fullArtPreload.dispatchEvent(new Event("load"));
    });

    act(() => channel?.click());
    expect(onChannel).toHaveBeenCalledOnce();
    const frameBreak = container.querySelector<HTMLElement>(
      "[data-exploration-frame-break]",
    );
    expect(frameBreak?.dataset.explorationFrameBreakPhase).toBe("open");
    expect(frameBreak?.dataset.explorationFullArtImageNumber).toBe("17");
    expect(frameBreak?.dataset.explorationArtPresentation).toBe(
      "contain-with-blur",
    );
    const blurFill = frameBreak?.querySelector<HTMLElement>(
      "[data-exploration-full-art-blur-fill]",
    );
    expect(blurFill).not.toBeNull();
    expect(blurFill?.querySelector("img")?.style.filter).toContain(
      "var(--glass-blur)",
    );
    const fullArt = frameBreak?.querySelector<HTMLImageElement>(
      "[data-exploration-full-art]",
    );
    expect(
      fullArt?.getAttribute("src"),
    ).toContain("/exploration/17.jpg");
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-exit"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();

    const returnButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Return to Exploration"]',
    );
    act(() => returnButton?.click());
    expect(onExit).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-exploration-frame-break]"),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).not.toBeNull();
    act(() => root.unmount());
  });

  it("keeps landscape art on the existing full-bleed presentation", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const fullArtPreload = container.querySelector<HTMLImageElement>(
      'img[aria-hidden="true"][style*="display: none"]',
    );
    if (fullArtPreload === null) throw new Error("Expected full-art preload");
    Object.defineProperties(fullArtPreload, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 1060 },
    });
    act(() => {
      fullArtPreload.dispatchEvent(new Event("load"));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );

    const frameBreak = container.querySelector<HTMLElement>(
      "[data-exploration-frame-break]",
    );
    expect(frameBreak?.dataset.explorationArtPresentation).toBe("cover");
    expect(
      frameBreak?.querySelector("[data-exploration-full-art-blur-fill]"),
    ).toBeNull();
    act(() => root.unmount());
  });

  it("shows the authored narrative and resolves a direct choice", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-narrative-copy"]',
      )?.textContent,
    ).toBe("A synthetic encounter waits in the dark.");
    const tutorialAnchor = container.querySelector(
      '[data-tutorial-guidance-concept="exploration-actions"]',
    );
    expect(
      tutorialAnchor?.hasAttribute("data-tutorial-guidance-obstacle"),
    ).toBe(true);
    expect(tutorialAnchor?.hasAttribute("data-tutorial-guidance-anchor")).toBe(
      true,
    );
    expect(tutorialAnchor?.hasAttribute("data-cumulus-reveal-anchor")).toBe(
      true,
    );
    expect(
      container
        .querySelector('[data-testid="cumulus-exploration-narrative-panel"]')
        ?.querySelector("[data-glass-panel-header]"),
    ).toBeNull();
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    expect(onResolve).toHaveBeenCalledWith("choice-a");
    act(() => root.unmount());
  });

  it("submits a preselected deck-card target without opening a picker", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onResolve = vi.fn();
    const base = view();
    const automaticView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          automaticSelection: { entryIds: ["minted-entry"] },
        },
        base.actions[1],
      ],
    };
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={automaticView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );

    expect(
      container.querySelector("[data-exploration-followup]"),
    ).toBeNull();
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      entryIds: ["minted-entry"],
    });
    act(() => root.unmount());
  });

  it("renders resource marks in structured Exploration choice copy", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const resourceView: ExplorationSiteView = {
      ...view(),
      actions: [
        {
          ...view().actions[0],
          effectText: "Spend 1● to gain +1✦ and Exploration Fixture.",
          effectParts: [
            { kind: "text", text: "Spend 1● to gain +1✦ and " },
            { kind: "entity", entity: { kind: "card", card: makeCard() } },
            { kind: "text", text: "." },
          ],
        },
        view().actions[1],
      ],
    };
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={resourceView}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    const effect = container.querySelector<HTMLElement>(
      "#exploration-effect-0",
    );
    const energyGlyph = effect?.querySelector<HTMLElement>(
      '[data-inline-glyph][aria-label="energy"]',
    );
    const sparkGlyph = effect?.querySelector<HTMLElement>(
      '[data-inline-glyph][aria-label="spark"]',
    );
    expect(effect?.textContent).not.toMatch(/[●✦]/u);
    expect(energyGlyph?.querySelector("i")?.className).toContain("bx-fire-alt");
    expect(energyGlyph?.parentElement?.style.color).toContain(ENERGY_ICON_COLOR);
    expect(sparkGlyph?.querySelector("i")?.className).toContain("bx-sparkle");
    expect(sparkGlyph?.parentElement?.style.color).toContain(SPARK_ICON_COLOR);

    act(() => root.unmount());
  });

  it("types the narrative for one second before revealing the choices", () => {
    vi.useFakeTimers();
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 1;
    };
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    act(() => {
      container
        .querySelector<HTMLElement>("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector<HTMLElement>("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    const narrative = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-exploration-narrative-copy"]',
    );
    const choices = container.querySelector<HTMLElement>(
      '[data-exploration-choices-state="waiting"]',
    );
    const firstChoice = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-choice-0"]',
    );
    const secondChoice = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-choice-1"]',
    );
    expect(narrative?.textContent).toBe("");
    expect(narrative?.dataset.explorationTypewriterState).toBe("typing");
    expect(choices?.getAttribute("aria-hidden")).toBe("true");
    expect(firstChoice?.getAttribute("aria-disabled")).toBe("true");
    expect(secondChoice?.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(500);
    });
    const halfwayCount = Number(
      narrative?.dataset.explorationVisibleCharacterCount,
    );
    expect(halfwayCount).toBeGreaterThan(0);
    expect(halfwayCount).toBeLessThan(view().narrative.length);
    expect(narrative?.textContent).toBe(
      view().narrative.slice(0, halfwayCount),
    );
    expect(
      container.querySelector("[data-exploration-choices-state='revealed']"),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(narrative?.dataset.explorationTypewriterState).toBe("typing");
    expect(firstChoice?.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(narrative?.textContent).toBe(view().narrative);
    expect(narrative?.dataset.explorationTypewriterState).toBe("complete");
    expect(
      container.querySelector<HTMLElement>(
        "[data-exploration-choices-state='staggering']",
      ),
    ).not.toBeNull();
    expect(firstChoice?.hasAttribute("aria-disabled")).toBe(false);
    expect(secondChoice?.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(
      container.querySelector("[data-exploration-choices-state='revealed']"),
    ).toBeNull();
    expect(secondChoice?.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      container.querySelector("[data-exploration-choices-state='revealed']"),
    ).not.toBeNull();
    expect(secondChoice?.hasAttribute("aria-disabled")).toBe(false);
    act(() => root.unmount());
  });

  it("makes the full referenced choice cell the reveal and activation source", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const referencedCard = makeCard();
    const referencedView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectText: `Gain 3 ${referencedCard.name} cards.`,
          effectParts: [
            { kind: "text", text: "Gain 3 " },
            {
              kind: "entity",
              entity: {
                kind: "card",
                card: {
                  ...referencedCard,
                  renderedText: `${referencedCard.renderedText} Draw a card.`,
                },
                transfiguration: {
                  type: "Inspired",
                  color: TRANSFIGURATION_TINT_COLORS.Inspired,
                  markedText: `${referencedCard.renderedText} Draw a card.`,
                  energyChanged: false,
                  sparkChanged: false,
                  fastChanged: false,
                },
                copies: 3,
              },
            },
            { kind: "text", text: " cards." },
          ],
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={referencedView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    const source = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-choice-0"]',
    );
    const label = container.querySelector<HTMLElement>(
      '[data-exploration-entity-label="card"]',
    );
    expect(source?.textContent).toContain(referencedCard.name);
    expect(source?.dataset.explorationEntityPreview).toBe("card");
    expect(source?.dataset.entityId).toBe(referencedCard.id);
    expect(source?.dataset.entityCopies).toBe("3");
    expect(source?.dataset.revealSourceRetain).toBe("true");
    expect(source?.dataset.revealPrimaryVariant).toBe("gameCard");
    expect(label?.textContent).toBe(referencedCard.name);
    expect(label?.querySelector("span")?.style.textDecoration).toBe(
      "underline",
    );
    expect(label?.hasAttribute("data-reveal-entity-id")).toBe(false);
    expect(label?.tabIndex).toBe(-1);
    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await vi.waitFor(() =>
      expect(
        document.querySelector(
          '[aria-label="Inspired transfiguration"]',
        ),
      ).not.toBeNull(),
    );
    act(() => source?.click());
    expect(onResolve).toHaveBeenCalledWith("choice-a");
    act(() => root.unmount());
  });

  it("reveals on a full-cell touch hold while preserving quick-touch activation", () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const referencedCard = makeCard();
    const referencedView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectText: `Gain ${referencedCard.name}.`,
          effectParts: [
            { kind: "text", text: "Gain " },
            {
              kind: "entity",
              entity: { kind: "card", card: referencedCard },
            },
            { kind: "text", text: "." },
          ],
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={referencedView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    const source = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-choice-0"]',
    )!;

    act(() => {
      source.dispatchEvent(
        pointer("pointerdown", { pointerId: 8, timeStamp: 100 }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(35);
    });
    expect(source.dataset.revealActive).toBe("true");
    act(() => {
      source.dispatchEvent(
        pointer("pointerup", { pointerId: 8, timeStamp: 401 }),
      );
      source.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });
    expect(onResolve).not.toHaveBeenCalled();

    act(() => {
      source.dispatchEvent(
        pointer("pointerdown", { pointerId: 9, timeStamp: 500 }),
      );
    });
    act(() => {
      source.dispatchEvent(
        pointer("pointerup", { pointerId: 9, timeStamp: 600 }),
      );
    });
    expect(onResolve).toHaveBeenCalledOnce();
    act(() => {
      source.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });
    expect(onResolve).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("collects a card follow-up before resolving the choice", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          followup: {
            kind: "cards",
            title: "Choose a Fixture",
            subtitle: "Choose one card.",
            cards: [
              { entryId: "entry-fixture", model: base.card, isBane: false },
            ],
            mode: "single",
            selectionKey: "entryIds",
            selectionOperation: "transfigure",
            min: 1,
            max: 1,
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    const followup = container.querySelector<HTMLElement>(
      '[data-exploration-followup="cards"]',
    );
    expect(followup).not.toBeNull();
    expect(followup?.style.bottom).toBe(
      `calc(${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-3xl")})`,
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-exploration-card-entry-fixture"]',
        )
        ?.click(),
    );
    expect(
      container.querySelector(
        '[data-card-choice-operation="transfigure"] .fa-hammer',
      ),
    ).not.toBeNull();
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-followup-confirm"]',
        )
        ?.click(),
    );
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      entryIds: ["entry-fixture"],
    });
    act(() => root.unmount());
  });

  it("resolves a Dreamsign follow-up directly from its UUID-backed artwork", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const dreamsignId = "held-dreamsign-id";
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          followup: {
            kind: "dreamsigns",
            title: "Break the suspended pattern",
            subtitle: "Choose a Dreamsign to purge.",
            selectionKey: "dreamsignId",
            dreamsigns: [
              {
                id: dreamsignId,
                name: "Amplified Acorn",
                effectDescription: "A synthetic Dreamsign effect.",
                imageName: "amplified-acorn.webp",
                imageAlt: "Amplified Acorn art",
              },
            ],
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );

    const choice = container.querySelector<HTMLElement>(
      `[data-testid="cumulus-exploration-dreamsign-${dreamsignId}"]`,
    );
    expect(choice?.dataset.dreamsignId).toBe(dreamsignId);
    expect(choice?.querySelector("img")?.getAttribute("src")).toContain(
      "/dreamsigns/amplified-acorn.webp",
    );
    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-followup="dreamsigns"] [data-glass-panel-height-contract]',
      )?.dataset.glassPanelHeightContract,
    ).toBe("content");
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-followup-confirm"]',
      ),
    ).toBeNull();

    act(() => choice?.click());
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      dreamsignId,
    });
    act(() => root.unmount());
  });

  it("uses the standard transfiguration picker and commits the chosen free form", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const transformed = {
      ...base.card.displaySnapshot,
      energyCost: 1,
    };
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          followup: {
            kind: "transfiguration",
            candidates: [
              {
                entryId: "entry-fixture",
                model: base.card,
                availability: "available",
                reforgedType: null,
                forms: [
                  {
                    type: "Empowered",
                    description: "Energy cost: 2 → 1",
                    effectDetails: { energyCost: { before: 2, after: 1 } },
                    essenceCost: 0,
                    affordable: true,
                    previewModel: {
                      cardId: transformed.id,
                      displaySnapshot: transformed,
                      transfiguration: {
                        type: "Empowered",
                        color: TRANSFIGURATION_TINT_COLORS.Empowered,
                        markedText: transformed.renderedText,
                        energyChanged: true,
                        sparkChanged: false,
                        fastChanged: false,
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    expect(
      container.querySelector('[data-testid="cumulus-transfiguration-picker"]'),
    ).not.toBeNull();

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-card-entry-fixture"]',
        )
        ?.click(),
    );
    const form = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-transfiguration-form-Empowered"]',
    );
    expect(form?.textContent).toBe("EmpoweredFree");
    expect(form?.getAttribute("aria-disabled")).toBeNull();
    act(() => form?.click());
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-confirm"]',
        )
        ?.click(),
    );

    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      entryIds: ["entry-fixture"],
      transfiguration: "Empowered",
    });
    act(() => root.unmount());
  });

  it("resolves a pack from its explicit Choose button", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          followup: {
            kind: "packs",
            title: "Answer Their Muster",
            subtitle: "Choose one pack to add to your deck.",
            packs: [0, 1].map((index) => ({
              index,
              cards: [0, 1, 2].map((cardIndex) => ({
                entryId: `pack-${String(index)}-card-${String(cardIndex)}`,
                model: base.card,
                isBane: false,
              })),
            })),
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );

    const secondPack = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-exploration-pack-1"]',
    );
    expect(
      container.querySelector("[data-exploration-pack-offer]"),
    ).not.toBeNull();
    expect(secondPack?.tagName).toBe("SECTION");
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-followup-confirm"]',
      ),
    ).toBeNull();
    act(() => secondPack?.click());
    expect(onResolve).not.toHaveBeenCalled();

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-pack-1-choose"]',
        )
        ?.click(),
    );
    expect(onResolve).toHaveBeenCalledWith("choice-a", { packIndex: 1 });
    act(() => root.unmount());
  });

  it("presents four offered cards in the centered Augury choice grid without a Back button", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const offeredCards = [
      "offered-a",
      "offered-b",
      "offered-c",
      "offered-d",
    ].map((entryId) => ({ entryId, model: base.card, isBane: false }));
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          label: "Choose a Guide",
          followup: {
            kind: "cards",
            title: "Choose a Guide",
            subtitle: "Choose one offered card.",
            cards: offeredCards,
            mode: "single",
            selectionKey: "cardIds",
            min: 1,
            max: 1,
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );

    const offer = container.querySelector<HTMLElement>(
      "[data-exploration-card-offer]",
    );
    expect(offer).not.toBeNull();
    expect(
      offer
        ?.querySelector("[data-card-choice-grid]")
        ?.getAttribute("data-card-choice-grid-columns"),
    ).toBe("4");
    expect(
      offer?.querySelector<HTMLElement>("[data-card-choice-grid]")
        ?.parentElement?.style.containerType,
    ).toBe("inline-size");
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-card-followup"]',
      ),
    ).toBeNull();
    expect(
      [...container.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Back",
      ),
    ).toBe(false);

    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-exploration-card-offered-c"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-followup-confirm"]',
        )
        ?.click(),
    );
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      cardIds: ["offered-c"],
    });
    act(() => root.unmount());
  });

  it("lets the player undo the purge target in a purge-and-copy follow-up", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          followup: {
            kind: "cards",
            title: "Exchange Familiar Forms",
            subtitle: "Choose a card to purge, then a card to copy.",
            cards: [
              { entryId: "entry-a", model: base.card, isBane: false },
              { entryId: "entry-b", model: base.card, isBane: false },
            ],
            mode: "purge-and-copy",
            selectionKey: "entryIds",
            min: 2,
            max: 2,
          },
        },
        base.actions[1],
      ],
    };
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    const purgeCard = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-exploration-card-entry-a"]',
    );
    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-followup-confirm"]',
    );
    act(() => purgeCard?.click());
    expect(confirm?.textContent).toContain("Choose a card to copy");
    expect(
      container.querySelector(
        '[data-gallery-entry-id="entry-a"] [data-card-choice-operation="purge"]',
      ),
    ).not.toBeNull();

    const copyCard = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-exploration-card-entry-b"]',
    );
    act(() => copyCard?.click());
    expect(
      container.querySelector(
        '[data-gallery-entry-id="entry-b"] [data-card-choice-operation="copy"]',
      ),
    ).not.toBeNull();
    expect(confirm?.textContent).toContain("Confirm Choice");

    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-exploration-card-entry-a"]',
        )
        ?.click(),
    );
    expect(confirm?.textContent).toContain("Choose a card to purge");
    expect(
      container.querySelector("[data-card-choice-operation]"),
    ).toBeNull();
    act(() => root.unmount());
  });

  it("submits exactly two UUID-selected cards for the multi-copy follow-up", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectKind: "copy-selected-cards",
          followup: {
            kind: "cards",
            title: "Copy two",
            subtitle: "Choose two cards to copy.",
            cards: ["entry-a", "entry-b", "entry-c"].map((entryId) => ({
              entryId,
              model: base.card,
              isBane: false,
            })),
            mode: "exact",
            selectionKey: "entryIds",
            selectionOperation: "copy",
            min: 2,
            max: 2,
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    for (const entryId of ["entry-a", "entry-b"]) {
      act(() =>
        container
          .querySelector<HTMLElement>(
            `[data-testid="cumulus-exploration-card-${entryId}"]`,
          )
          ?.click(),
      );
    }
    expect(
      container.querySelectorAll('[data-card-choice-operation="copy"]'),
    ).toHaveLength(2);
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-followup-confirm"]',
        )
        ?.click(),
    );

    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      entryIds: ["entry-a", "entry-b"],
    });
    act(() => root.unmount());
  });

  it("returns immediately after a choice without a tangible reward", () => {
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 1;
    };
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view(true)}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-narrative-copy"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-continue"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-exit"]'),
    ).toBeNull();

    expect(
      container
        .querySelector("[data-exploration-frame-break]")
        ?.getAttribute("data-exploration-frame-break-phase"),
    ).toBe("collapsing");

    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(
      container.querySelector("[data-exploration-frame-break]"),
    ).toBeNull();
    const cardReturn = container.querySelector(
      "[data-exploration-card-return]",
    );
    expect(cardReturn?.getAttribute("data-exploration-destination")).toBe(
      "journey-deck",
    );
    expect(cardReturn?.querySelector('[data-card-back=""]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      cardReturn?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true }),
      );
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("flips a deck card into its transfigured form and returns it to the deck", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this.hasAttribute("data-exploration-transfiguration-card")) {
          return new DOMRect(520, 170, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () =>
      new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={transfigurationRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const reward = container.querySelector<HTMLElement>(
      "[data-exploration-transfiguration-reward]",
    );
    expect(reward?.dataset.explorationTransfigurationPhase).toBe("original");
    expect(reward?.dataset.explorationDeckEntryId).toBe(
      "deck-entry-transfigured",
    );
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(
      container.querySelector<HTMLElement>(
        "[data-exploration-transfiguration-reward]",
      )?.dataset.explorationTransfigurationPhase,
    ).toBe("transfigured");
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-transfigured-card"] [aria-label="Kindled transfiguration"]',
      ),
    ).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    const cardReturn = container.querySelector<HTMLElement>(
      "[data-exploration-transfiguration-return]",
    );
    expect(cardReturn?.dataset.explorationDestination).toBe("journey-deck");
    expect(cardReturn?.dataset.explorationDeckEntryId).toBe(
      "deck-entry-transfigured",
    );
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      cardReturn?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true }),
      );
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("shows a two-card reward at reading size and flies both cards to the deck", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this.hasAttribute("data-exploration-reward-object")) {
          const offset = this.dataset.explorationRewardId?.endsWith("18")
            ? 660
            : 390;
          return new DOMRect(offset, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={twoCardRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    act(() => {
      container
        .querySelector("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    expect(
      container.querySelectorAll('[data-exploration-reward-object="card"]'),
    ).toHaveLength(2);
    expect(container.querySelector("[data-exploration-narrative]")).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-continue"]'),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const flights = container.querySelectorAll(
      '[data-exploration-reward-flight="card"]',
    );
    expect(flights).toHaveLength(2);
    expect(
      [...flights].map((flight) =>
        flight.getAttribute("data-exploration-destination"),
      ),
    ).toEqual(["journey-deck", "journey-deck"]);
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      for (const flight of flights) {
        flight.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      }
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("purges first, then emits a copy from its source and flies both to the deck", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this.hasAttribute("data-exploration-card-copy-role")) {
          return new DOMRect(
            this.dataset.explorationCardCopyRole === "original" ? 520 : 700,
            180,
            240,
            336,
          );
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () =>
      new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={purgeAndCopyRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    act(() => {
      container
        .querySelector("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-outcome="purge-and-copy"]',
      )?.dataset.explorationCompoundPhase,
    ).toBe("purging");
    expect(
      container.querySelector("[data-exploration-purge-icon] .bx-trash"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-exploration-card-copy-stage]"),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(
      container.querySelector("[data-exploration-purge-card]"),
    ).toBeNull();
    const copyOutcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="purge-and-copy"][data-exploration-compound-phase="copying"]',
    );
    expect(copyOutcome?.dataset.explorationCardCopiesPhase).toBe("original");
    expect(
      [...container.querySelectorAll("[data-exploration-card-copy-role]")].map(
        (card) => ({
          role: card.getAttribute("data-exploration-card-copy-role"),
          entryId: card.getAttribute("data-exploration-deck-entry-id"),
        }),
      ),
    ).toEqual([
      { role: "original", entryId: "source-entry" },
      { role: "copy", entryId: "copy-entry" },
    ]);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-outcome="purge-and-copy"][data-exploration-compound-phase="copying"]',
      )?.dataset.explorationCardCopiesPhase,
    ).toBe("copies");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const flights = container.querySelectorAll(
      '[data-exploration-card-copy-flight][data-exploration-outcome="purge-and-copy"]',
    );
    expect(
      [...flights].map((flight) => ({
        role: flight.getAttribute("data-exploration-card-copy-role"),
        entryId: flight.getAttribute("data-exploration-deck-entry-id"),
        destination: flight.getAttribute("data-exploration-destination"),
      })),
    ).toEqual([
      {
        role: "original",
        entryId: "source-entry",
        destination: "journey-deck",
      },
      {
        role: "copy",
        entryId: "copy-entry",
        destination: "journey-deck",
      },
    ]);
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      for (const flight of flights) {
        flight.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      }
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents both purge-and-copy phases without travel under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={purgeAndCopyRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-outcome="purge-and-copy"]',
      )?.dataset.explorationCompoundPhase,
    ).toBe("purging");
    expect(container.querySelector("[data-exploration-purge-card]")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const copyOutcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="purge-and-copy"]',
    );
    expect(copyOutcome?.dataset.explorationCompoundPhase).toBe("copying");
    expect(copyOutcome?.dataset.explorationCardCopiesPhase).toBe("copies");
    expect(
      [...container.querySelectorAll("[data-exploration-card-copy-role]")].map(
        (card) => card.getAttribute("data-exploration-card-copy-role"),
      ),
    ).toEqual(["original", "copy"]);
    expect(container.querySelector("[data-exploration-card-copy-flight]")).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("fans every affected card around a semantic deck-modification announcement", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={deckModificationRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    act(() => {
      container
        .querySelector("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    const reward = container.querySelector<HTMLElement>(
      "[data-exploration-deck-modification-reward]",
    );
    const cards = reward?.querySelectorAll<HTMLElement>(
      "[data-exploration-deck-modification-card]",
    );
    expect(reward?.dataset.explorationDeckModificationKind).toBe("spark");
    expect(reward?.dataset.explorationDeckModificationCount).toBe("2");
    expect(reward?.getAttribute("aria-label")).toBe(
      "All characters in your deck gain +1✦",
    );
    expect(
      [...(cards ?? [])].map(
        (card) => card.dataset.explorationDeckEntryId,
      ),
    ).toEqual(["deck-entry-a", "deck-entry-b"]);
    const sparkAnnouncement = reward?.querySelector<HTMLElement>(
      "[data-radial-announcement]",
    );
    const sparkGlyph = sparkAnnouncement?.querySelector<HTMLElement>(
      '[data-inline-glyph][aria-label="spark"]',
    );
    expect(sparkAnnouncement?.textContent).toContain("+1");
    expect(sparkAnnouncement?.textContent).not.toContain("✦");
    expect(sparkGlyph?.querySelector("i")?.className).toContain("bx-sparkle");
    expect(sparkGlyph?.parentElement?.style.color).toContain(SPARK_ICON_COLOR);
    expect(
      reward?.querySelector<HTMLElement>(
        '[data-testid="cumulus-exploration-deck-modification-card-deck-entry-a"] .card-view',
      )?.style.boxShadow,
    ).toContain("var(--spark)");
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("shows the fast modifier and canonical bolt on every modified card", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const fastView = deckModificationRewardView("fast");
    const unresolvedFastView: ExplorationSiteView = {
      ...fastView,
      actions: [
        {
          ...fastView.actions[0],
          effectText: "All cards in your deck become ❖ (fast)",
        },
        fastView.actions[1],
      ],
      resolvedActionId: null,
      reward: null,
    };
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={unresolvedFastView}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    const effect = container.querySelector<HTMLElement>(
      "#exploration-effect-0",
    );
    expect(effect?.textContent).not.toContain("❖");
    expect(effect?.querySelector("[data-inline-glyph] i")?.className).toContain(
      "bx-bolt",
    );
    act(() => root.unmount());

    const persisted = mount(
      <ExplorationSiteScreen
        view={deckModificationRewardView("fast")}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const reward = persisted.container.querySelector<HTMLElement>(
      '[data-exploration-deck-modification-kind="fast"]',
    );
    const announcement = reward?.querySelector<HTMLElement>(
      "[data-radial-announcement]",
    );
    expect(announcement?.textContent).not.toContain("Fast");
    expect(
      announcement?.querySelector("[data-inline-glyph] i")?.className,
    ).toContain("bx-bolt");
    expect(reward?.querySelectorAll('[data-attribute-chip="fast"]')).toHaveLength(2);
    act(() => persisted.root.unmount());
  });

  it("presents tangible rewards after a composite deck modification", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const modified = deckModificationRewardView();
    const baseDeckModification =
      modified.reward !== null && !("kind" in modified.reward)
        ? modified.reward.deckModification
        : null;
    if (baseDeckModification === null) {
      throw new Error("fixture requires a deck modification reward");
    }
    const deckModification = {
      ...baseDeckModification,
      kind: "energy-cost" as const,
      headline: "−1 ●",
      selectionColor: "energy" as const,
    };
    const composite: ExplorationSiteView = {
      ...modified,
      reward: {
        objects: { cards: [modified.card], purgedCards: [], dreamsigns: [] },
        deckModification,
      },
    };
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={composite}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const modification = container.querySelector<HTMLElement>(
      '[data-exploration-deck-modification-kind="energy-cost"]',
    );
    expect(modification).not.toBeNull();
    const energyGlyph = modification?.querySelector<HTMLElement>(
      '[data-inline-glyph][aria-label="energy"]',
    );
    expect(modification?.textContent).toContain("−1");
    expect(modification?.textContent).not.toContain("●");
    expect(energyGlyph?.querySelector("i")?.className).toContain("bx-fire-alt");
    expect(energyGlyph?.parentElement?.style.color).toContain(ENERGY_ICON_COLOR);
    expect(
      container.querySelector("[data-exploration-deck-modification-reward]"),
    ).not.toBeNull();
    expect(container.querySelector("[data-exploration-reward-stage]"))
      .toBeNull();

    act(() => {
      vi.advanceTimersByTime(3_360);
    });
    expect(
      container.querySelector("[data-exploration-deck-modification-reward]"),
    ).toBeNull();
    expect(container.querySelector("[data-exploration-reward-stage]"))
      .not.toBeNull();
    expect(onExit).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("presents the complete purge-then-Reclaim sequence under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const modified = deckModificationRewardView();
    if (modified.reward === null || "kind" in modified.reward) {
      throw new Error("fixture requires a deck modification reward");
    }
    const purgedCard = modified.reward.deckModification?.cards[0]?.model;
    const survivorCards = modified.reward.deckModification?.cards;
    if (purgedCard === undefined || survivorCards === undefined) {
      throw new Error("fixture requires purged and surviving cards");
    }
    const reclaimView: ExplorationSiteView = {
      ...modified,
      reward: {
        objects: {
          cards: [],
          purgedCards: [
            { entryId: "purged-entry-a", model: purgedCard, isBane: false },
            { entryId: "purged-entry-b", model: purgedCard, isBane: false },
          ],
          dreamsigns: [],
        },
        deckModification: {
          kind: "reclaim",
          headline: "Reclaim",
          announcement:
            "Purge all copies of every duplicated card from your deck. Every card remaining in your deck gains reclaim.",
          selectionColor: "positive",
          cards: survivorCards,
          reclaimCostByEntryId: {
            "deck-entry-a": 2,
            "deck-entry-b": 4,
          },
        },
      },
    };
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={reclaimView}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const purgedCards = container.querySelectorAll<HTMLElement>(
      "[data-exploration-purge-card]",
    );
    expect(purgedCards).toHaveLength(2);
    expect(
      [...purgedCards].map(
        (card) => card.dataset.explorationDeckEntryId,
      ),
    ).toEqual(["purged-entry-a", "purged-entry-b"]);
    expect(
      container.querySelector("[data-exploration-deck-modification-reward]"),
    ).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3_100);
    });
    expect(
      container.querySelector("[data-exploration-purge-card]"),
    ).toBeNull();
    const reclaim = container.querySelector<HTMLElement>(
      '[data-exploration-deck-modification-kind="reclaim"]',
    );
    expect(reclaim?.dataset.explorationDeckModificationCount).toBe("2");
    expect(
      reclaim?.querySelector<HTMLElement>(
        '[data-exploration-deck-entry-id="deck-entry-a"]',
      )?.dataset.explorationReclaimCost,
    ).toBe("2");
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("resumes a persisted deck modification directly at the reward moment", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={deckModificationRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    expect(
      container.querySelector("[data-exploration-deck-modification-reward]"),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("flies a gained Dreamsign to its UUID-matched HUD dock", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this.hasAttribute("data-exploration-reward-object")) {
          return new DOMRect(520, 190, 240, 240);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const dreamsignTarget = document.createElement("span");
    dreamsignTarget.dataset.dreamsignId = "reward-dreamsign-id";
    dreamsignTarget.getBoundingClientRect = () =>
      new DOMRect(1140, 730, 58, 58);
    document.body.append(dreamsignTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={dreamsignRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    act(() => {
      container
        .querySelector("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-exploration-reward-object="dreamsign"]'),
    ).not.toBeNull();
    expect(dreamsignTarget.style.visibility).toBe("hidden");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const flight = container.querySelector(
      '[data-exploration-reward-flight="dreamsign"]',
    );
    expect(flight?.getAttribute("data-exploration-destination")).toBe(
      "journey-dreamsign",
    );
    act(() => {
      flight?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
    expect(dreamsignTarget.style.visibility).toBe("");
  });

  it("counts the contributing Spirit Animals before announcing the total Essence", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={essenceRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    act(() => {
      container
        .querySelector("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    expect(
      container.querySelectorAll("[data-exploration-essence-card]"),
    ).toHaveLength(6);
    expect(
      container.querySelectorAll(
        '[data-essence-value-variant="rewardBadge"]',
      ),
    ).toHaveLength(6);
    expect(
      container.querySelector("[data-exploration-essence-cards]")
        ?.textContent,
    ).toContain("+15");
    expect(
      container.querySelector("[data-exploration-essence-announcement]"),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(
      container.querySelector("[data-exploration-essence-cards]"),
    ).toBeNull();
    const announcement = container.querySelector(
      "[data-exploration-essence-announcement]",
    );
    expect(announcement?.textContent).toContain("Essence Gained");
    expect(announcement?.textContent).toContain("+90");
    expect(announcement?.textContent).toContain("15 × 6 Spirit Animals");
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("purges the chosen Dreamsign before announcing the gained Essence", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={purgedDreamsignEssenceRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const purgedDreamsign = container.querySelector<HTMLElement>(
      "[data-exploration-purged-dreamsign]",
    );
    expect(purgedDreamsign?.dataset.dreamsignId).toBe(
      "purged-dreamsign-id",
    );
    expect(
      container.querySelector(
        "[data-exploration-purged-dreamsign-announcement]",
      ),
    ).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      purgedDreamsign?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true }),
      );
    });
    expect(
      container.querySelector("[data-exploration-purged-dreamsign-stage]"),
    ).toBeNull();
    const announcement = container.querySelector(
      "[data-exploration-purged-dreamsign-announcement]",
    );
    expect(announcement?.textContent).toContain("Essence Gained");
    expect(announcement?.textContent).toContain("+50");
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("dissolves the exact purged card before announcing its spark-priced Essence", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={purgedCardEssenceRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const purgeOutcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="purged-card-essence"][data-exploration-purged-card-phase="purging"]',
    );
    expect(purgeOutcome?.dataset.explorationDeckEntryId).toBe("purged-entry");
    expect(purgeOutcome?.dataset.cardId).toBe(view().card.cardId);
    expect(purgeOutcome?.dataset.explorationPurgedCardSpark).toBe("2");
    expect(purgeOutcome?.dataset.explorationEssencePerSpark).toBe("20");
    expect(purgeOutcome?.dataset.explorationEssenceGained).toBe("40");
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-purged-card"]',
      ),
    ).not.toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      container
        .querySelector("[data-exploration-purged-card]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    const announcement = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="purged-card-essence"][data-exploration-purged-card-phase="announcement"]',
    );
    expect(announcement?.dataset.explorationPurgedCardSpark).toBe("2");
    expect(announcement?.dataset.explorationEssencePerSpark).toBe("20");
    expect(announcement?.dataset.explorationEssenceGained).toBe("40");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("stages a face-down-to-face-up travel from the bottom-right deck anchor", () => {
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);

    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    const travel = container.querySelector("[data-exploration-card-travel]");
    expect(travel?.getAttribute("data-exploration-source")).toBe(
      "journey-deck",
    );
    expect(travel?.querySelector("[data-card-back]")).not.toBeNull();
    expect(
      travel?.querySelector(`[data-card-id="${view().card.cardId}"]`),
    ).not.toBeNull();
    expect(
      container
        .querySelector("[data-exploration-channel-state]")
        ?.getAttribute("data-exploration-channel-state"),
    ).toBe("waiting");

    act(() => root.unmount());
  });

  it("shows the original, emits exact copied entries, and flies every card to the deck", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-copy-role")) {
          const role = this.dataset.explorationCardCopyRole;
          const entryId = this.dataset.explorationDeckEntryId;
          const left =
            role === "original" ? 430 : entryId === "copy-entry-a" ? 590 : 750;
          return new DOMRect(left, 180, 240, 336);
        }
        return new DOMRect(100, 100, 240, 336);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={cardCopiesRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="card-copies"]',
    );
    expect(outcome?.dataset.explorationSourceEntryId).toBe("source-entry");
    expect(outcome?.dataset.explorationCopyCount).toBe("2");
    expect(outcome?.dataset.explorationCardCopiesPhase).toBe("original");
    expect(
      container.querySelector(
        '[data-exploration-card-copy-role="original"][data-exploration-deck-entry-id="source-entry"]',
      ),
    ).not.toBeNull();
    expect(
      [...container.querySelectorAll("[data-exploration-copied-entry-id]")].map(
        (element) => element.getAttribute("data-exploration-copied-entry-id"),
      ),
    ).toEqual(["copy-entry-a", "copy-entry-b"]);
    expect(outcome?.getAttribute("aria-label")).toBe("Gained 2 copies");
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(
      container.querySelector<HTMLElement>(
        '[data-exploration-outcome="card-copies"]',
      )?.dataset.explorationCardCopiesPhase,
    ).toBe("copies");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const flights = container.querySelectorAll(
      "[data-exploration-card-copy-flight]",
    );
    expect(flights).toHaveLength(3);
    expect(
      [...flights].map((flight) => ({
        entryId: flight.getAttribute("data-exploration-deck-entry-id"),
        destination: flight.getAttribute("data-exploration-destination"),
      })),
    ).toEqual([
      { entryId: "source-entry", destination: "journey-deck" },
      { entryId: "copy-entry-a", destination: "journey-deck" },
      { entryId: "copy-entry-b", destination: "journey-deck" },
    ]);
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      for (const flight of flights) {
        flight.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      }
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents two source-to-copy pairs as a dedicated multi-copy outcome", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={multipleCardCopiesRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="card-copies-multiple"]',
    );
    expect(outcome?.dataset.explorationSourceEntryIds).toBe(
      "source-entry-a,source-entry-b",
    );
    expect(outcome?.dataset.explorationCopyCount).toBe("2");
    expect(
      [...container.querySelectorAll('[data-exploration-card-copy-role="original"]')]
        .map((element) => element.getAttribute("data-exploration-deck-entry-id")),
    ).toEqual(["source-entry-a", "source-entry-b"]);
    expect(
      [...container.querySelectorAll('[data-exploration-card-copy-role="copy"]')]
        .map((element) => element.getAttribute("data-exploration-deck-entry-id")),
    ).toEqual(["copy-entry-a", "copy-entry-b"]);
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const flights = container.querySelectorAll(
      "[data-exploration-card-copy-flight]",
    );
    expect(flights).toHaveLength(4);
    act(() => {
      for (const flight of flights) {
        flight.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      }
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents the persisted next-battle modifier with its exact amount", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={battleModifierRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="battle-modifier"]',
    );
    expect(outcome?.dataset.explorationBattleModifier).toBe("starting-energy");
    expect(outcome?.dataset.explorationBattleModifierAmount).toBe("2");
    expect(outcome?.dataset.explorationBattlesRemaining).toBe("1");
    expect(outcome?.textContent).toContain("Next Battle");
    act(() => root.unmount());
  });

  it("presents the exact compound next-battle modifier under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={smallerHandDiscountRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="smaller-hand-and-cost-discount"]',
    );
    expect(outcome?.dataset.explorationOpeningHandDelta).toBe("-1");
    expect(outcome?.dataset.explorationEnergyCostReduction).toBe("1");
    expect(outcome?.dataset.explorationBattlesRemaining).toBe("1");
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents the exact persisted replacement Dream Avatar", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={dreamAvatarRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="dream-avatar"]',
    );
    expect(outcome?.dataset.explorationDreamAvatarId).toBe("dream-avatar-new");
    expect(outcome?.textContent).toContain("New Dream Avatar");
    expect(outcome?.getAttribute("aria-label")).toBe(
      "New Dream Avatar is now your Dream Avatar",
    );
    act(() => root.unmount());
  });

  it("presents the persisted future-site modifier as a dedicated semantic outcome", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={siteOfferModifierRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="site-offer-modifier"]',
    );
    expect(outcome?.dataset.explorationSiteOfferModifier).toBe(
      "transfigure-next-draft-or-shop",
    );
    expect(outcome?.dataset.explorationSourceSiteId).toBe("exploration-site");
    expect(outcome?.dataset.explorationSourceActionId).toBe("choice-a");
    expect(outcome?.getAttribute("aria-label")).toBe(
      "The next Draft or Shop will contain transfigured cards",
    );
    expect(outcome?.textContent).toContain("Next Draft or Shop");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("presents an exact zero-card acquisition under reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={emptyCardAcquisitionRewardView()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const outcome = container.querySelector<HTMLElement>(
      '[data-exploration-outcome="card-acquisition"]',
    );
    expect(outcome?.dataset.explorationRewardCount).toBe("0");
    expect(outcome?.getAttribute("aria-label")).toBe("No cards taken");
    expect(outcome?.textContent).toContain("No Cards Taken");
    act(() => root.unmount());
  });
});
