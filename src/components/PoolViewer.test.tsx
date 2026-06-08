// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import type {
  ResolvedDreamcallerPackage,
  SeedProvenanceSummary,
} from "../types/content";
import type { DraftState } from "../types/draft";
import type { DraftRecord } from "../data/cards-v2-database";
import type { PoolVariant } from "../draft/pool/types";
import { logEvent } from "../logging";
import { PoolViewer } from "./PoolViewer";

vi.mock("../logging", () => ({
  logEvent: vi.fn(),
}));

function makeCard(
  cardNumber: number,
  name: string,
  cardType: CardData["cardType"],
  energyCost: number | null,
  subtype: string,
  mtgName?: string,
): CardData {
  return {
    name,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType,
    subtype,
    isStarter: false,
    energyCost,
    spark: cardType === "Character" ? 2 : null,
    isFast: false,
    renderedText: `${name} text`,
    imageNumber: cardNumber,
    artOwned: true,
    mtgName,
  };
}

const cards = [
  makeCard(1, "Alpha Seer", "Character", 1, "Mystic", "Serra Angel"),
  makeCard(2, "Beta Guard", "Character", 5, "Soldier"),
  makeCard(3, "Null Rain", "Event", null, ""),
  makeCard(4, "Quick Spark", "Event", 0, ""),
];

const cardDatabase = new Map(cards.map((card) => [card.cardNumber, card]));

const draftState: DraftState = {
  mode: "pool",
  draftPoolCopiesByCard: { "1": 3, "2": 1, "3": 2 },
  remainingCopiesByCard: { "1": 2, "2": 0, "3": 1 },
  currentOffer: [],
  activeSiteId: null,
  pickNumber: 1,
  sitePicksCompleted: 0,
};

function makeResolvedPackage(
  overrides: Partial<{
    starterDecklistCardNumbers: number[];
    signatureCards: string[];
  }> = {},
): ResolvedDreamcallerPackage {
  return {
    dreamcaller: {
      id: "dc-test",
      name: "Test Caller",
      title: "The Tester",
      renderedText: "",
      imageNumber: "1",
      startingEssence: 250,
      signatureCards: overrides.signatureCards ?? ["Alpha Seer", "Quick Spark"],
    },
    draftPoolCopiesByCard: {},
    dreamsignPoolIds: [],
    mandatoryOnlyPoolSize: 0,
    draftPoolSize: 0,
    doubledCardCount: 0,
    legalSubsetCount: 1,
    preferredSubsetCount: 1,
    starterDecklistCardNumbers: overrides.starterDecklistCardNumbers ?? [2, 3],
  };
}

const replayDraftState: DraftState = {
  mode: "replay",
  recordId: "seat-7",
  packSequence: [[1, 2]],
  signatureCardNumbers: [1],
  currentOffer: [],
  activeSiteId: null,
  pickNumber: 1,
  sitePicksCompleted: 0,
};

const replayRecord: DraftRecord = {
  id: "seat-7",
  draftId: "draft-1",
  sourceFile: "draft-1-records.json",
  // Mainboard with a doubled "Alpha Seer" so the deck grid shows an x2 badge.
  mainboard: ["Alpha Seer", "Alpha Seer", "Beta Guard", "Unknown Relic"],
  packs: [
    ["Alpha Seer", "Beta Guard"],
    ["Null Rain", "Quick Spark"],
  ],
  picks: [["Alpha Seer"], ["Quick Spark"]],
  packIds: [
    ["Alpha Seer", "Beta Guard"],
    ["Null Rain", "Quick Spark"],
  ],
  pickIds: [["Alpha Seer"], ["Quick Spark"]],
};

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

function renderPool(
  overrides: Partial<{
    draftState: DraftState | null;
    onPoolCardDragStart: (card: CardData) => void;
    poolVariant: PoolVariant | null;
    replayRecord: DraftRecord | null;
    resolvedPackage: ResolvedDreamcallerPackage | null;
    seedProvenance: SeedProvenanceSummary | null;
  }> = {},
) {
  return mount(
    <PoolViewer
      cardDatabase={cardDatabase}
      draftState={
        Object.prototype.hasOwnProperty.call(overrides, "draftState")
          ? overrides.draftState!
          : draftState
      }
      resolvedPackage={overrides.resolvedPackage ?? null}
      poolVariant={overrides.poolVariant ?? null}
      replayRecord={overrides.replayRecord ?? null}
      seedProvenance={overrides.seedProvenance ?? null}
      isOpen
      onClose={vi.fn()}
      onPoolCardDragStart={overrides.onPoolCardDragStart}
    />,
  );
}

function setInputValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
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

describe("PoolViewer", () => {
  it("describes the seed card and growth when seed provenance is supplied", () => {
    const seedProvenance: SeedProvenanceSummary = {
      seedCardName: "Alpha Seer",
      seedCardNumber: 1,
      targetSize: 150,
      seedAffinityWeight: 0.4,
      distinctCardCount: 96,
      totalCopies: 150,
      doubledCardCount: 54,
      topPartnerCardNames: ["Beta Guard"],
      cardProvenanceByNumber: {},
    };
    const { container, root } = renderPool({
      poolVariant: "seed",
      seedProvenance,
    });

    const banner = container.querySelector('[data-pool-seed-source=""]');
    expect(banner).not.toBeNull();
    const text = banner?.textContent ?? "";
    expect(text).toContain("Seed card:");
    expect(text).toContain("Alpha Seer");
    expect(text).toContain("150 copies");
    expect(text).toContain("96 cards");
    expect(text).toContain("54 doubled");
    // The algorithm chip names the seed strategy.
    expect(
      container.querySelector('[data-pool-algo="seed"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shows remaining run-pool copies by default and switches to the full catalog", () => {
    const { container, root } = renderPool();

    expect(container.textContent).toContain("Alpha Seer");
    expect(container.textContent).toContain("Null Rain");
    expect(container.textContent).not.toContain("Beta Guard");
    expect(
      container.querySelector(
        '[data-pool-card-number="1"] [data-pool-copy-badge]',
      )?.textContent,
    ).toBe("x2");

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="catalog"]')
        ?.click();
    });

    expect(container.textContent).toContain("Beta Guard");
    expect(container.textContent).toContain("Quick Spark");
    expect(
      container.querySelector(
        '[data-pool-card-number="1"] [data-pool-copy-badge]',
      ),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("filters by name, cost, type, and character subtype with the shared toolbar", () => {
    const { container, root } = renderPool();

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="catalog"]')
        ?.click();
    });
    act(() => {
      setInputValue(
        container.querySelector<HTMLInputElement>(
          '[aria-label="Search cards"]',
        )!,
        "spark",
      );
    });
    expect(
      container.querySelector('[data-pool-card-number="4"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="1"]')).toBeNull();

    act(() => {
      setInputValue(
        container.querySelector<HTMLInputElement>(
          '[aria-label="Search cards"]',
        )!,
        "",
      );
    });
    act(() => {
      setSelectValue(
        container.querySelector<HTMLSelectElement>(
          '[aria-label="Cost filter"]',
        )!,
        "5plus",
      );
    });
    expect(
      container.querySelector('[data-pool-card-number="2"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="4"]')).toBeNull();

    act(() => {
      setSelectValue(
        container.querySelector<HTMLSelectElement>(
          '[aria-label="Cost filter"]',
        )!,
        "all",
      );
      setSelectValue(
        container.querySelector<HTMLSelectElement>(
          '[aria-label="Type filter"]',
        )!,
        "character",
      );
    });
    expect(
      container.querySelector('[data-pool-card-number="1"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="3"]')).toBeNull();

    act(() => {
      setSelectValue(
        container.querySelector<HTMLSelectElement>(
          '[aria-label="Subtype filter"]',
        )!,
        "Soldier",
      );
    });
    expect(
      container.querySelector('[data-pool-card-number="2"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="1"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shows the source MTG name as a hover tooltip when a card carries one", () => {
    const { container, root } = renderPool();

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="catalog"]')
        ?.click();
    });

    expect(container.querySelector("[data-card-browser-mtg-tooltip]")).toBeNull();

    const cardArticle = container.querySelector<HTMLElement>(
      '[data-pool-card-number="1"] article',
    );
    if (cardArticle === null) {
      throw new Error("Missing pool card article");
    }

    act(() => {
      cardArticle.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(
      container.querySelector("[data-card-browser-mtg-tooltip]")?.textContent,
    ).toBe("MTG: Serra Angel");

    act(() => {
      root.unmount();
    });
  });

  it("omits the IDF3 and signature toggles when no resolved package is supplied", () => {
    const { container, root } = renderPool();

    expect(container.querySelector('[data-pool-source="idf3"]')).toBeNull();
    expect(
      container.querySelector('[data-pool-source="signature"]'),
    ).toBeNull();
    expect(container.querySelector('[data-pool-source="run"]')).not.toBeNull();
    expect(
      container.querySelector('[data-pool-source="catalog"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shows the IDF3 starting decklist and the signature cards from the resolved package", () => {
    const { container, root } = renderPool({
      resolvedPackage: makeResolvedPackage({
        starterDecklistCardNumbers: [2, 3],
        signatureCards: ["Alpha Seer", "Quick Spark"],
      }),
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="idf3"]')
        ?.click();
    });

    expect(container.querySelector('[data-pool-card-number="2"]')).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="3"]')).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="1"]')).toBeNull();
    // Decklist entries carry no remaining-copy badge.
    expect(container.querySelector("[data-pool-copy-badge]")).toBeNull();

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="signature"]')
        ?.click();
    });

    expect(container.querySelector('[data-pool-card-number="1"]')).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="4"]')).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="2"]')).toBeNull();
    expect(container.querySelector("[data-pool-copy-badge]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("hides the signature toggle when the Dreamcaller has no signature cards", () => {
    const { container, root } = renderPool({
      resolvedPackage: makeResolvedPackage({
        starterDecklistCardNumbers: [2],
        signatureCards: [],
      }),
    });

    expect(container.querySelector('[data-pool-source="idf3"]')).not.toBeNull();
    expect(
      container.querySelector('[data-pool-source="signature"]'),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shows empty states and opens the expanded card overlay", () => {
    const { container, root } = renderPool({ draftState: null });

    expect(container.querySelector("[data-pool-empty]")?.textContent).toContain(
      "No run pool cards are available.",
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="catalog"]')
        ?.click();
    });
    act(() => {
      container
        .querySelector<HTMLElement>(
          '[data-pool-card-number="1"] [role="button"]',
        )
        ?.click();
    });

    expect(logEvent).toHaveBeenCalledWith("card_preview", { cardNumber: 1 });

    act(() => {
      root.unmount();
    });
  });

  it("labels the algorithm chip 'pool' variant in pool mode and 'replay' in replay mode", () => {
    const pool = renderPool({ poolVariant: "idf3" });
    expect(
      pool.container.querySelector("[data-pool-algo]")?.getAttribute(
        "data-pool-algo",
      ),
    ).toBe("idf3");
    act(() => {
      pool.root.unmount();
    });

    // Replay runs still resolve a pool variant (the idf3 fallback), but the chip
    // must name the draft algorithm actually in effect: replay.
    const replay = renderPool({
      poolVariant: "idf3",
      draftState: replayDraftState,
      replayRecord,
    });
    expect(
      replay.container.querySelector("[data-pool-algo]")?.getAttribute(
        "data-pool-algo",
      ),
    ).toBe("replay");
    act(() => {
      replay.root.unmount();
    });
  });

  it("swaps pool sources for replay diagnostics in replay mode", () => {
    const { container, root } = renderPool({
      draftState: replayDraftState,
      replayRecord,
      resolvedPackage: makeResolvedPackage({
        starterDecklistCardNumbers: [2, 3],
        signatureCards: ["Alpha Seer"],
      }),
    });

    // Pool-mode sources are hidden; replay sources take their place.
    expect(container.querySelector('[data-pool-source="run"]')).toBeNull();
    expect(container.querySelector('[data-pool-source="idf3"]')).toBeNull();
    expect(container.querySelector('[data-pool-source="deck"]')).not.toBeNull();
    expect(
      container.querySelector('[data-pool-source="history"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-pool-source="signature"]'),
    ).not.toBeNull();

    // The default source is the record deck: the deck the drafter built, with a
    // doubled Alpha Seer badged x2 and the unresolved "Unknown Relic" dropped.
    expect(container.querySelector('[data-pool-card-number="1"]')).not.toBeNull();
    expect(
      container.querySelector(
        '[data-pool-card-number="1"] [data-pool-copy-badge]',
      )?.textContent,
    ).toBe("x2");
    expect(container.querySelector('[data-pool-card-number="2"]')).not.toBeNull();
    // Quick Spark (#4) is not in the mainboard.
    expect(container.querySelector('[data-pool-card-number="4"]')).toBeNull();

    // The record deck screen names the source record JSON file.
    expect(
      container.querySelector('[data-pool-deck-source]')?.textContent,
    ).toContain("draft-1-records.json");

    act(() => {
      root.unmount();
    });
  });

  it("renders the pick history with the chosen card highlighted", () => {
    const { container, root } = renderPool({
      draftState: replayDraftState,
      replayRecord,
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="history"]')
        ?.click();
    });

    const history = container.querySelector("[data-pool-pick-history]");
    expect(history).not.toBeNull();
    expect(history?.textContent).toContain("seat-7");

    const rows = container.querySelectorAll("[data-pool-pick-row]");
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain("Pick 1");
    expect(rows[0]?.textContent).toContain("chose Alpha Seer");

    // The drafter's choice in pack 1 (Alpha Seer) is flagged picked; Beta Guard
    // was offered but passed.
    const pickedChips = rows[0]?.querySelectorAll(
      '[data-pool-pick-card="picked"]',
    );
    expect(pickedChips?.length).toBe(1);
    expect(pickedChips?.[0]?.textContent).toBe("Alpha Seer");
    expect(
      rows[0]?.querySelectorAll('[data-pool-pick-card="offered"]').length,
    ).toBe(1);

    // Clicking a resolvable offered chip opens the zoom overlay.
    act(() => {
      rows[0]
        ?.querySelector<HTMLButtonElement>('[data-pool-pick-card="offered"]')
        ?.click();
    });
    expect(logEvent).toHaveBeenCalledWith("card_preview", { cardNumber: 2 });

    act(() => {
      root.unmount();
    });
  });
});
