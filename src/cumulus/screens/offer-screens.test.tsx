// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import { artRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { GLOSSARY_IDS } from "../../data/glossary";
import { draftOfferKey } from "../../data/draft-site-bootstrap";
import { DreamsignGalleryPanel } from "../components/card/DreamsignGalleryPanel";
import type { DreamsignView } from "../components/hud/Dreamsign";
import { DraftScreen, type DraftView } from "./DraftScreen";
import {
  DreamsignRevelationScreen,
  type DreamsignRevelationView,
} from "./DreamsignRevelationScreen";
import { DREAMSIGN_REVELATION_PRESENTATION } from "../test-helpers/presentation-fixtures";
import { dreamsignViewFixture } from "../test-helpers/dreamsign-fixture";
import { parseDeckEntryId, type PresentationId } from "../../types/identifiers";
import {
  testCardId,
  testGuideId,
  testPresentationId,
} from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";

function stubMatchMedia(matches: (query: string) => boolean): void {
  window.matchMedia = (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

function tutorial(id: PresentationId) {
  return {
    id,
    model: {
      portrait: { kind: "character-portrait", characterId: "mira" },
      portraitAlt: "Mira",
      speakerName: "Mira",
      text: "Fixture [purple]guidance[/purple].",
    },
    delaySeconds: 1,
    horizontalOffset: 0,
    verticalOffset: 0,
    bubbleWidth: 600,
  } as const;
}

function press(element: Element | null): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  stubMatchMedia(() => false);
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("DraftScreen", () => {
  function card(cardNumber: number): CardData {
    return {
      name: parseCardName(`Card ${String(cardNumber)}`),
      id: testCardId(`card-${String(cardNumber)}`),
      cardNumber,
      cardType: "Character",
      subtype: "",
      isStarter: false,
      energyCost: (cardNumber % 4) + 1,
      spark: 1,
      isFast: false,
      renderedText: "Text.",
      imageNumber: cardNumber,
      artOwned: false,
    };
  }

  function view(offer = [101, 102, 103, 104]): DraftView {
    return {
      progressLabel: "Draft (1/5)",
      scene: null,
      offer: offer.map((cardNumber) => {
        const displaySnapshot = card(cardNumber);
        return { cardId: displaySnapshot.id, displaySnapshot };
      }),
      offerKey: draftOfferKey(offer),
      pickNumber: 1,
      pickTotal: 5,
    };
  }

  const offerCard = (container: HTMLElement, cardNumber: number) =>
    container.querySelector(
      `[data-draft-offer-card="${String(cardNumber)}"] [role="button"]`,
    );

  it("shows the tutorial after its delay and retires it with the first pick", () => {
    vi.useFakeTimers();
    const onPick = vi.fn();
    const onTutorialShown = vi.fn();
    const { container } = renderInCumulus(
      <DraftScreen
        view={{
          ...view(),
          tutorial: tutorial(testPresentationId("run-a:first-visit:draft-a:Draft")),
        }}
        onPick={onPick}
        onTutorialShown={onTutorialShown}
      />,
    );

    expect(container.querySelector("[data-site-tutorial-guidance]")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(container.querySelector("[data-site-tutorial-guidance]")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      container.querySelector('[data-testid="site-tutorial-dialogue"]'),
    ).not.toBeNull();
    expect(onTutorialShown).toHaveBeenCalledOnce();

    press(offerCard(container, 101));
    expect(onPick).toHaveBeenCalledWith(101);
    expect(container.querySelector("[data-site-tutorial-guidance]")).toBeNull();
  });

  it("renders one offer cell per card and a pick counter", () => {
    const { container } = renderInCumulus(
      <DraftScreen view={view()} onPick={vi.fn()} />,
    );

    const cells = container.querySelectorAll<HTMLElement>(
      "[data-draft-offer-card]",
    );
    expect(Array.from(cells, (cell) => cell.dataset.draftOfferCard)).toEqual([
      "101",
      "102",
      "103",
      "104",
    ]);
    expect(container.querySelector("[data-draft-pick-counter]")).not.toBeNull();
  });

  it.each([
    ["mobile", false, false, 2, 2],
    ["wide desktop", true, true, 4, 1],
    ["narrow desktop", true, false, 2, 2],
  ] as const)(
    "lays out the %s offer grid",
    (_label, desktop, wide, columns, rows) => {
      stubMatchMedia(
        (query) =>
          (desktop && query.includes("min-width: 900px")) ||
          (wide && query.includes("min-width: 1260px")),
      );
      const { container } = renderInCumulus(
        <DraftScreen view={view()} onPick={vi.fn()} />,
      );

      const grid = container.querySelector<HTMLElement>(
        "[data-draft-offer-grid]",
      );
      expect(grid?.style.gridTemplateColumns).toBe(
        `repeat(${String(columns)}, auto)`,
      );
      expect(grid?.style.gridTemplateRows).toBe(
        `repeat(${String(rows)}, auto)`,
      );
    },
  );

  it("latches the first pick so a second card cannot be picked in the same pack", () => {
    const onPick = vi.fn();
    const { container } = renderInCumulus(
      <DraftScreen view={view()} onPick={onPick} />,
    );

    press(offerCard(container, 102));
    press(offerCard(container, 101));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(102);
  });

  it("dispatches the reroll control", () => {
    const onReroll = vi.fn();
    const { container } = renderInCumulus(
      <DraftScreen view={view()} onPick={vi.fn()} onReroll={onReroll} />,
    );

    press(container.querySelector('[data-testid="reroll-draft-offer"]'));
    expect(onReroll).toHaveBeenCalledTimes(1);
  });
});

describe("DreamsignRevelationScreen", () => {
  function dreamsign(idSeed: string, imageName: string): DreamsignView {
    return dreamsignViewFixture({
      idSeed,
      name: `Dreamsign ${idSeed}`,
      effectDescription: "A test effect.",
      imageName,
      imageAlt: `Art for ${idSeed}`,
    });
  }

  function view(): DreamsignRevelationView {
    return {
      presentation: DREAMSIGN_REVELATION_PRESENTATION,
      scene: null,
      guide: {
        id: testGuideId("sigrun"),
        name: "Sigrun",
        line: "Fixture line.",
        art: artRef.dreamGuide(testGuideId("sigrun")),
      },
      offer: [
        dreamsign("left", "eye_3.png"),
        dreamsign("center", "book_11.png"),
        dreamsign("right", "rosemary.png"),
      ],
      offerReady: true,
      purge: null,
    };
  }

  function mount(
    props: Partial<Parameters<typeof DreamsignRevelationScreen>[0]> = {},
  ): HTMLDivElement {
    return renderInCumulus(
      <DreamsignRevelationScreen
        view={view()}
        claimedIndex={null}
        onClaim={vi.fn()}
        onSkip={vi.fn()}
        onPurge={vi.fn()}
        onCancelPurge={vi.fn()}
        {...props}
      />,
    ).container;
  }

  it("keeps the guide while revealing delayed tutorial guidance in the desktop dual-dialogue layout", () => {
    vi.useFakeTimers();
    stubMatchMedia(() => true);
    const onTutorialShown = vi.fn();
    const container = mount({
      view: {
        ...view(),
        tutorial: tutorial(
          testPresentationId("run-a:first-visit:revelation-a:DreamsignRevelation"),
        ),
      },
      onTutorialShown,
    });
    const dialogue = () =>
      container.querySelector(
        '[data-testid="revelation-site-tutorial-dialogue"]',
      );

    expect(dialogue()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(dialogue()).not.toBeNull();
    expect(onTutorialShown).toHaveBeenCalledOnce();
    expect(
      container.querySelector<HTMLElement>("[data-site-layout]")?.dataset
        .siteLayoutComposition,
    ).toBe("balanced-dual-dialogue-revelation");
    expect(
      container.querySelector("[data-site-layout-guide] img"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-site-layout-speech-anchor]"),
    ).not.toBeNull();
    expect(container.querySelectorAll("[data-revelation-option]")).toHaveLength(
      3,
    );
  });

  it("keeps unavailable choices focusable and revealable while suppressing keyboard activation", () => {
    const onClaim = vi.fn();
    const container = mount({ claimedIndex: 0, onClaim });
    const source = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-revelation-art-1"]',
    );
    if (source === null) throw new Error("Missing revelation art");
    expect(source.tabIndex).toBe(0);
    expect(source.getAttribute("aria-disabled")).toBe("true");
    act(() => source.focus());
    expect(source.dataset.revealActive).toBe("true");
    act(() => {
      source.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onClaim).not.toHaveBeenCalled();
  });
});

describe("DreamsignGalleryPanel", () => {
  it("keeps an action caption empty when it has neither price nor text", () => {
    const { container } = renderInCumulus(
      <DreamsignGalleryPanel
        title={"Fixture gallery"}
        entries={[]}
        endAction={{
          entryId: parseDeckEntryId("fixture-action"),
          glyph: GLYPHS.refresh,
          label: "Fixture action",
          glossaryId: GLOSSARY_IDS.dreamsignRestock,
          price: null,
          text: null,
          disabled: true,
        }}
        closeLabel={"Close fixture gallery"}
        onClose={vi.fn()}
        onEntryPress={vi.fn()}
        onEndActionPress={vi.fn()}
      />,
    );

    const captions = container.querySelectorAll<HTMLElement>(
      '[data-dreamsign-gallery-caption="text"]',
    );
    expect(captions).toHaveLength(1);
    expect(captions[0]?.textContent).toBe("");
    expect(captions[0]?.querySelector("[data-essence-value]")).toBeNull();
  });
});
