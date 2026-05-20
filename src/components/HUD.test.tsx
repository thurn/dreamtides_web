// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestMutations } from "../state/quest-context";
import type { CardData } from "../types/cards";
import type { Dreamsign, QuestState } from "../types/quest";
import { HUD } from "./HUD";
import { useQuest } from "../state/quest-context";

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../logging", () => ({
  downloadLog: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("./DreamcallerPortrait", () => ({
  DreamcallerPortrait: () => <div data-testid="dreamcaller-portrait" />,
}));

vi.mock("./DreamcallerPopover", () => ({
  DreamcallerPopover: () => <div data-testid="dreamcaller-popover" />,
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
    changeOmens: vi.fn(),
    setEssence: vi.fn(),
    changeMaxEssence: vi.fn(),
    addCardById: vi.fn(),
    addCardByIdWithTransfiguration: vi.fn(),
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

function makeDreamsign(name: string): Dreamsign {
  return {
    name,
    effectDescription: `${name} effect.`,
    isBane: false,
  };
}

function makeState(dreamsigns: Dreamsign[]): QuestState {
  return {
    seed: "test-seed",
    essence: 100,
    essenceCap: 500,
    omens: 0,
    maxDreamsigns: 12,
    deck: [],
    dreamcaller: {
      id: "caller-1",
      name: "Mira of Lanterns",
      title: "Keeper of Lantern Glass",
      renderedText: "Dreamcaller rules.",
      imageNumber: "0005",
      startingEssence: 250,
    },
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns,
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
    screen: { type: "dreamscape" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: true,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      upcomingOmenDiscounts: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
  };
}

function setQuestContext(state: QuestState): void {
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations: makeMutations(),
    cardDatabase: new Map<number, CardData>(),
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

describe("HUD", () => {
  function renderHud(overrides: Partial<{
    onOpenDeckViewer: () => void;
    onOpenGlossary: () => void;
    onOpenDebugScreen: () => void;
    onToggleCardSourceOverlay: () => void;
    onToggleJourneyExplanation: () => void;
    hasDraftData: boolean;
    hasJourneyExplanation: boolean;
    isJourneyExplanationOpen: boolean;
  }> = {}) {
    return mount(
      <HUD
        onOpenDeckViewer={overrides.onOpenDeckViewer ?? vi.fn()}
        onOpenGlossary={overrides.onOpenGlossary ?? vi.fn()}
        onOpenDebugScreen={overrides.onOpenDebugScreen ?? vi.fn()}
        onToggleCardSourceOverlay={
          overrides.onToggleCardSourceOverlay ?? vi.fn()
        }
        onToggleJourneyExplanation={
          overrides.onToggleJourneyExplanation ?? vi.fn()
        }
        hasDraftData={overrides.hasDraftData ?? false}
        hasCardSourceDebug={false}
        isCardSourceOverlayOpen={false}
        hasJourneyExplanation={overrides.hasJourneyExplanation ?? false}
        isJourneyExplanationOpen={overrides.isJourneyExplanationOpen ?? false}
      />,
    );
  }

  it("renders no dreamsign row and no 'Signs' label when the pool is empty", () => {
    setQuestContext(makeState([]));
    const { container, root } = renderHud();

    expect(container.querySelector('[data-testid="hud-dreamsign-row"]')).toBeNull();
    // Belt-and-braces: the HUD must not include "Signs" / "Dreamsign"
    // counter text when the player owns no dreamsigns.
    expect(container.textContent).not.toMatch(/\bSigns?\b/);
    expect(container.textContent).not.toContain("Dreamsign");

    act(() => {
      root.unmount();
    });
  });

  it("renders one dreamsign tile per owned dreamsign without text counter", () => {
    setQuestContext(
      makeState([makeDreamsign("Night's Mark"), makeDreamsign("Ashen Debt")]),
    );
    const { container, root } = renderHud();

    const row = container.querySelector('[data-testid="hud-dreamsign-row"]');
    expect(row).not.toBeNull();
    const tiles = container.querySelectorAll('[data-testid="hud-dreamsign-icon"]');
    expect(tiles.length).toBe(2);
    // The textual "Dreamsigns" / "Signs" / count copy is gone in favor of
    // the icon row. The dreamsign names only appear as aria labels on the
    // tiles, not as visible HUD text, so a strict search must not find a
    // counter word.
    expect(container.textContent).not.toMatch(/\bSigns?\b/);

    act(() => {
      root.unmount();
    });
  });

  it("renders a Glossary button beside View Deck and fires the callback on click", () => {
    setQuestContext(makeState([]));
    const onOpenGlossary = vi.fn();
    const { container, root } = renderHud({ onOpenGlossary });

    const glossaryButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="hud-glossary-button"]',
    );
    expect(glossaryButton).not.toBeNull();
    expect(glossaryButton?.textContent).toContain("Glossary");

    // The button sits in the same right-side button cluster as
    // "View Deck" — both are inside the same flex container so the
    // glossary entry point is always one click away from the deck
    // viewer entry point.
    const buttons = Array.from(
      container.querySelectorAll("button"),
    ).filter((b) => /Glossary|View Deck/.test(b.textContent ?? ""));
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(buttons[0]?.parentElement).toBe(buttons[1]?.parentElement);

    act(() => {
      glossaryButton?.click();
    });
    expect(onOpenGlossary).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("renders Why Journey beside Debug when journey explanation data is active", () => {
    setQuestContext(makeState([]));
    const onToggleJourneyExplanation = vi.fn();
    const { container, root } = renderHud({
      hasDraftData: true,
      hasJourneyExplanation: true,
      onToggleJourneyExplanation,
    });

    const whyJourneyButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="hud-why-journey-button"]',
    );
    expect(whyJourneyButton).not.toBeNull();
    expect(whyJourneyButton?.textContent).toContain("Why Journey");

    const rightButtons = Array.from(container.querySelectorAll("button"));
    const whyIndex = rightButtons.findIndex(
      (button) => button === whyJourneyButton,
    );
    const debugIndex = rightButtons.findIndex((button) =>
      button.textContent?.includes("Debug"),
    );
    expect(whyIndex).toBeGreaterThanOrEqual(0);
    expect(debugIndex).toBe(whyIndex + 1);

    act(() => {
      whyJourneyButton?.click();
    });
    expect(onToggleJourneyExplanation).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("renders the essence counter in the shared essence colour with no glyph", () => {
    setQuestContext(makeState([]));
    const { container, root } = renderHud();

    const essenceBlock = container.querySelector('[data-hud-essence]');
    expect(essenceBlock).not.toBeNull();

    // The HUD must never carry the legacy gold diamond or hexagon
    // glyphs for essence; the only marker for currency is purple
    // colour applied to both the value and the "Essence" label.
    expect(essenceBlock?.textContent).not.toContain("◆");
    expect(essenceBlock?.textContent).not.toContain("⬢");
    expect(essenceBlock?.textContent).toContain("100");
    expect(essenceBlock?.textContent).toContain("Essence");

    const spans = essenceBlock?.querySelectorAll("span") ?? [];
    expect(spans.length).toBeGreaterThanOrEqual(2);
    for (const span of spans) {
      expect((span as HTMLElement).style.color).toBe("var(--color-essence)");
    }

    act(() => {
      root.unmount();
    });
  });
});
