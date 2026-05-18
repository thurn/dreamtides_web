// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestMutations } from "../state/quest-context";
import type { CardData } from "../types/cards";
import type { QuestState } from "../types/quest";
import { DeckViewer } from "./DeckViewer";
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
    button: ({
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
}));

vi.mock("./CardDisplay", () => ({
  // CardDisplay in production renders a focusable button when `onClick` is
  // wired. The mock mirrors that so HoverPopover's `onFocus` / `onBlur`
  // handlers can fire via the usual React event-bubbling path.
  CardDisplay: ({
    card,
    onClick,
  }: {
    card: CardData;
    onClick?: () => void;
  }) =>
    onClick ? (
      <button type="button" onClick={onClick}>
        {card.name}
      </button>
    ) : (
      <div>{card.name}</div>
    ),
}));

vi.mock("./CardOverlay", () => ({
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

function makeState(): QuestState {
  return {
    seed: "test-seed",
    essence: 120,
    essenceCap: 500,
    omens: 0,
    maxDreamsigns: 12,
    deck: [
      {
        entryId: "entry-1",
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
      },
    ],
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
    dreamsigns: [
      {
        name: "Night's Mark",
        effectDescription: "Draw deeper.",
        isBane: false,
      },
      {
        name: "Ashen Debt",
        effectDescription: "Costs later.",
        isBane: true,
      },
    ],
    completionLevel: 1,
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

function setQuestContext(): void {
  vi.mocked(useQuest).mockReturnValue({
    state: makeState(),
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
  vi.useFakeTimers();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  setQuestContext();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function makeStateWithArtSigns(): QuestState {
  return {
    ...makeState(),
    dreamsigns: [
      {
        id: "moonstone",
        name: "Moonstone",
        effectDescription: "Boon effect.",
        imageName: "moonstone.png",
        imageAlt: "Moonstone art",
        isBane: false,
      },
      {
        id: "skull",
        name: "Skull",
        effectDescription: "Bane effect.",
        imageName: "skull.png",
        imageAlt: "Skull art",
        isBane: true,
      },
    ],
  };
}

function makeStateWithFullDeck(): QuestState {
  return {
    ...makeState(),
    deck: [
      {
        entryId: "entry-1",
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
      },
    ],
  };
}

function makeFullCardDatabase(): Map<number, CardData> {
  return new Map<number, CardData>([
    [
      1,
      {
        name: "Archive Sentry",
        id: "archive-sentry",
        cardNumber: 1,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 3,
        spark: 1,
        isFast: false,
        tides: ["package"],
        renderedText: "Hold the line.",
        imageNumber: 1,
        artOwned: true,
      },
    ],
  ]);
}

function mountWithFullDeck(initialSize: "small" | "medium" | "large") {
  vi.mocked(useQuest).mockReturnValue({
    state: makeStateWithFullDeck(),
    mutations: makeMutations(),
    cardDatabase: makeFullCardDatabase(),
    questContent: {
      cardDatabase: new Map(),
      cardsByPackageTide: new Map(),
      dreamcallers: [],
      dreamsignTemplates: [],
      resolvedPackagesByDreamcallerId: new Map(),
    },
  });
  return mount(
    <DeckViewer
      isOpen
      onClose={vi.fn()}
      cardDatabase={makeFullCardDatabase()}
      initialSize={initialSize}
    />,
  );
}

describe("DeckViewer", () => {
  it("renders dreamsign artwork in the desktop sidebar, replacing the glyph placeholders", () => {
    vi.mocked(useQuest).mockReturnValue({
      state: makeStateWithArtSigns(),
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

    const { container, root } = mount(
      <DeckViewer
        isOpen
        onClose={vi.fn()}
        cardDatabase={new Map<number, CardData>()}
      />,
    );

    // Each owned dreamsign renders one art tile sourced from
    // /dreamsigns/<imageName>. The legacy glyph spans (✦ / ☠) must not
    // appear anywhere in the dreamsign list since they are replaced by
    // the artwork itself.
    expect(
      container.querySelector('img[src="/dreamsigns/moonstone.png"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('img[src="/dreamsigns/skull.png"]'),
    ).not.toBeNull();

    // Shared art tile carries bane/boon state via a data attribute.
    const tiles = container.querySelectorAll<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    const baneTile = Array.from(tiles).find(
      (tile) => tile.dataset.isBane === "true",
    );
    expect(baneTile).not.toBeUndefined();

    act(() => {
      root.unmount();
    });
  });

  it("shows neutral dreamcaller and dreamsign chrome on normal UI", () => {
    const cardDatabase = new Map<number, CardData>([
      [
        1,
        {
          name: "Archive Sentry",
          id: "archive-sentry",
          cardNumber: 1,
          cardType: "Character",
          subtype: "",
          isStarter: false,
          energyCost: 3,
          spark: 1,
          isFast: false,
          tides: ["package"],
          renderedText: "Hold the line.",
          imageNumber: 1,
          artOwned: true,
        },
      ],
    ]);

    const { container, root } = mount(
      <DeckViewer
        isOpen
        onClose={vi.fn()}
        cardDatabase={cardDatabase}
      />,
    );

    expect(container.textContent).toContain("Mira of Lanterns");
    expect(container.textContent).toContain("Keeper of Lantern Glass");
    expect(container.textContent).not.toContain("Awakening");
    expect(container.textContent).toContain("Night's Mark");
    expect(container.textContent).toContain("Ashen Debt");
    expect(container.textContent).not.toContain("tide_alpha");
    expect(container.textContent).not.toContain("tide_gamma");
    expect(container.querySelector('img[alt="tide_alpha"]')).toBeNull();
    expect(container.querySelector('img[alt="tide_beta"]')).toBeNull();
    expect(container.querySelector('img[alt="tide_gamma"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("portals a full card preview when a deck card is hovered at small size", () => {
    const { container, root } = mountWithFullDeck("small");

    // No portaled preview exists before hover.
    expect(
      document.body.querySelectorAll(
        "[data-testid='deck-viewer-row-hover-card-entry-1']",
      ),
    ).toHaveLength(0);

    const row = container.querySelector(
      "[data-testid='deck-viewer-row-entry-1']",
    );
    expect(row).not.toBeNull();
    const trigger = row?.parentElement;
    expect(trigger).not.toBeNull();

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    // Popover only appears after the configured 300ms delay.
    expect(
      document.body.querySelectorAll(
        "[data-testid='deck-viewer-row-hover-card-entry-1']",
      ),
    ).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(
      document.body.querySelector(
        "[data-testid='deck-viewer-row-hover-card-entry-1']",
      ),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("hides the deck-card preview cleanly on mouse-out", () => {
    const { container, root } = mountWithFullDeck("small");

    const row = container.querySelector(
      "[data-testid='deck-viewer-row-entry-1']",
    );
    const trigger = row?.parentElement;

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(
      document.body.querySelector(
        "[data-testid='deck-viewer-row-hover-card-entry-1']",
      ),
    ).not.toBeNull();

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });

    expect(
      document.body.querySelectorAll(
        "[data-testid='deck-viewer-row-hover-card-entry-1']",
      ),
    ).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it("opens the deck-card preview when the row receives keyboard focus", () => {
    const { container, root } = mountWithFullDeck("small");

    const row = container.querySelector(
      "[data-testid='deck-viewer-row-entry-1']",
    );
    expect(row).not.toBeNull();
    if (!(row instanceof HTMLElement)) {
      throw new Error("Expected deck row to be an HTMLElement");
    }

    // The CardDisplay inside the row is a focusable button. Focusing it
    // bubbles to the HoverPopover trigger wrapper through React's focus
    // event delegation, opening the preview for keyboard users.
    const focusTarget = row.querySelector("button");
    expect(focusTarget).not.toBeNull();
    if (!(focusTarget instanceof HTMLElement)) {
      throw new Error("Expected an inner focusable element");
    }

    act(() => {
      focusTarget.focus();
    });
    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(
      document.body.querySelector(
        "[data-testid='deck-viewer-row-hover-card-entry-1']",
      ),
    ).not.toBeNull();

    act(() => {
      focusTarget.blur();
    });

    expect(
      document.body.querySelectorAll(
        "[data-testid='deck-viewer-row-hover-card-entry-1']",
      ),
    ).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it("skips the hover preview at large size where the card already reads at full legibility", () => {
    const { container, root } = mountWithFullDeck("large");

    const row = container.querySelector(
      "[data-testid='deck-viewer-row-entry-1']",
    );
    expect(row).not.toBeNull();

    // Large-size cards have no hover-popover wrapper, so hovering them never
    // produces a portaled preview.
    const trigger = row?.parentElement;
    act(() => {
      trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(
      document.body.querySelectorAll(
        "[data-testid='deck-viewer-row-hover-card-entry-1']",
      ),
    ).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it("renders dreamsign artwork inside the mobile Dreamsigns tab with bane styling preserved", () => {
    // The deck viewer's mobile sidebar tab mirrors the HUD's dreamsign art-tile
    // pattern: each owned dreamsign renders its `imageName` artwork via the
    // shared `DreamsignArtTile`, with bane vs. boon conveyed by the tile's
    // border/desaturation chrome rather than a circular text pip.
    vi.mocked(useQuest).mockReturnValue({
      state: makeStateWithArtSigns(),
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

    const { container, root } = mount(
      <DeckViewer
        isOpen
        onClose={vi.fn()}
        cardDatabase={new Map<number, CardData>()}
      />,
    );

    // The mobile sidebar tab opens its content panel only after the user
    // clicks the Dreamsigns tab button.
    const tabButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").startsWith("Dreamsigns ("));
    expect(tabButton).toBeDefined();

    act(() => {
      tabButton?.click();
    });

    // Both sidebars live in the DOM regardless of viewport (CSS toggles
    // their visibility), so scope the assertion to the mobile sidebar's
    // collapsible panel by walking from its tab button to the sibling
    // panel that AnimatePresence reveals.
    const mobileSidebar = tabButton?.closest("div.lg\\:hidden");
    expect(mobileSidebar).not.toBeNull();
    const mobileTiles = mobileSidebar?.querySelectorAll<HTMLElement>(
      '[data-testid="dreamsign-art-tile"]',
    );
    expect(mobileTiles?.length).toBe(2);

    // Both `imageName` artworks must be rendered in the mobile tab, just like
    // they are on the HUD row.
    const mobileImages = Array.from(
      mobileSidebar?.querySelectorAll<HTMLImageElement>("img") ?? [],
    ).map((img) => img.getAttribute("src"));
    expect(mobileImages).toContain("/dreamsigns/moonstone.png");
    expect(mobileImages).toContain("/dreamsigns/skull.png");

    // Bane styling is conveyed via the shared tile's `data-is-bane`
    // attribute, matching the HUD row's accent treatment.
    const banes = Array.from(mobileTiles ?? []).filter(
      (tile) => tile.dataset.isBane === "true",
    );
    expect(banes).toHaveLength(1);
    const boons = Array.from(mobileTiles ?? []).filter(
      (tile) => tile.dataset.isBane === "false",
    );
    expect(boons).toHaveLength(1);

    act(() => {
      root.unmount();
    });
  });
});
