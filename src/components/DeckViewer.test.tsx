// @vitest-environment jsdom

import { act } from "react";
import { MINIMAL_ATLAS_CONFIG, MINIMAL_DREAMSCAPES } from "../__test-helpers__/atlas-fixtures";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TangoRoot } from "../tango/TangoRoot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestMutations } from "../state/quest-context";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
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
  logEventOnce: vi.fn(),
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
    seed: "test-seed",
    essence: 120,
    essenceCap: 500,
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
        id: "night-mark",
        name: "Night's Mark",
        effectDescription: "Draw deeper.",
        isBane: false,
      },
      {
        id: "ashen-debt",
        name: "Ashen Debt",
        effectDescription: "Costs later.",
        isBane: true,
      },
    ],
    completionLevel: 1,
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
    screen: { type: "dreamscape" },
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
  vi.mocked(useQuest).mockReturnValue({
    state: makeState(),
    mutations: makeMutations(),
    cardDatabase: new Map<number, CardData>(),
    questContent: {
      cardDatabase: new Map(),
      dreamcallers: [],

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
    root.render(<TangoRoot>{element}</TangoRoot>);
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

describe("DeckViewer", () => {
  it("renders dreamsign artwork in the desktop sidebar, replacing the glyph placeholders", () => {
    vi.mocked(useQuest).mockReturnValue({
      state: makeStateWithArtSigns(),
      mutations: makeMutations(),
      cardDatabase: new Map<number, CardData>(),
      questContent: {
        cardDatabase: new Map(),
        dreamcallers: [],

        dreamwellCards: [],        dreamsignTemplates: [],        dreamscapes: MINIMAL_DREAMSCAPES,        affiliations: [], guides: [],        atlasConfig: MINIMAL_ATLAS_CONFIG,
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
          name: asCardName("Archive Sentry"),
          id: asCardId("archive-sentry"),
          cardNumber: 1,
          cardType: "Character",
          subtype: "",
          isStarter: false,
          energyCost: 3,
          spark: 1,
          isFast: false,
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
        dreamcallers: [],

        dreamwellCards: [],        dreamsignTemplates: [],        dreamscapes: MINIMAL_DREAMSCAPES,        affiliations: [], guides: [],        atlasConfig: MINIMAL_ATLAS_CONFIG,
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
