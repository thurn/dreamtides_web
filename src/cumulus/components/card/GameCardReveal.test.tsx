// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCardName } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import * as glossary from "../../../data/glossary";
import { extractMaterializedFigmentPreviews } from "../../../data/materialized-figments";
import { GameCard, type GameCardModel } from "./CardView";
import { GlossaryTerm } from "./GlossaryTerm";
import { Dreamsign } from "../hud/Dreamsign";
import { SiteNode, type DreamscapeSiteModel } from "../dreamscape/SiteNode";
import { glyph } from "../../primitives/glyph";
import { localizedDreamsignFixture } from "../../test-helpers/dreamsign-fixture";
import { transfigurationFormFixture } from "../../test-helpers/transfiguration-fixture";
import { parseSiteId } from "../../../types/identifiers";
import {
  testCardId,
  testDreamsignId,
  testGlossaryEntryId,
} from "../../../types/test-identities";
import { renderInCumulus } from "../../testing/render";

vi.mock("../../../data/materialized-figments", () => ({
  extractMaterializedFigmentPreviews: vi.fn(() => []),
}));

const CARD_ID = testCardId("11111111-1111-4111-8111-111111111111");
const FIGMENT_ID = "bb1a5acd-1a03-4aa3-826d-f0a301843845";
const BANE_ID = testGlossaryEntryId("a9799416-d2d4-4f1b-a3b5-fec790119fae");
let resizeCallbacks: ResizeObserverCallback[] = [];

function card(overrides: Partial<CardData> = {}): CardData {
  return {
    id: CARD_ID,
    name: parseCardName("Archive Sentry"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "Synth",
    isStarter: false,
    energyCost: 2,
    spark: 3,
    isFast: false,
    renderedText: "Nightmare is a Bane.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

function model(displaySnapshot = card()): GameCardModel {
  return { cardId: CARD_ID, displaySnapshot };
}

function rect(width: number, left = 80, top = 120, height = width * 1.5): DOMRect {
  return DOMRect.fromRect({ x: left, y: top, width, height });
}

function pointer(target: EventTarget | null | undefined, type: string, init: PointerEventInit = {}): void {
  target?.dispatchEvent(
    new PointerEvent(type, { bubbles: true, pointerType: "mouse", pointerId: 1, ...init }),
  );
}

function remeasure(): void {
  act(() =>
    resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)),
  );
}

function revealCards(kind: "primary" | "secondary" | "adjacent"): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      `[data-cumulus-reveal-card="${kind}"]`,
    ),
  ];
}

function sourceIn(container: HTMLElement): HTMLElement {
  const source = container.querySelector<HTMLElement>("[data-game-card-source]");
  if (source === null) throw new Error("missing game card source");
  return source;
}

function describedText(source: HTMLElement): string {
  return (
    document.getElementById(source.getAttribute("aria-describedby") ?? "")
      ?.textContent ?? ""
  );
}

/** Hovers (or focuses) a source, settles the lazy renderer, and waits for the reveal. */
async function reveal(
  target: HTMLElement,
  ready: () => boolean = () => revealCards("primary").length > 0,
  open: () => void = () => pointer(target, "pointerover"),
): Promise<void> {
  act(open);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  remeasure();
  await vi.waitFor(() => expect(ready()).toBe(true));
}

beforeEach(() => {
  vi.mocked(extractMaterializedFigmentPreviews).mockReset().mockReturnValue([]);
  window.matchMedia = (query: string) => ({
    matches: query.includes("pointer: fine"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
  resizeCallbacks = [];
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      resizeCallbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function getRect(this: HTMLElement) {
      if (this.hasAttribute("data-game-card-source"))
        return rect(Number(this.parentElement?.dataset.testWidth ?? 160));
      const measure = this.getAttribute("data-reveal-measure");
      if (measure === "primary") return rect(240, 0, 0);
      if (measure === "secondary") return rect(248, 0, 0);
      if (measure === "adjacent") return rect(150, 0, 0);
      return rect(100);
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete (globalThis as { ResizeObserver?: typeof ResizeObserver })
    .ResizeObserver;
});

describe("GameCard reveal contract", () => {
  it("registers canonical UUID semantics and de-duplicates glossary secondaries", () => {
    const { container } = renderInCumulus(
      <GameCard
        model={model(
          card({
            renderedText:
              "Nightmare is a Bane. The Bane keyword identifies Nightmare.",
          }),
        )}
      />,
    );
    const source = sourceIn(container);
    expect(source.getAttribute("aria-describedby")).toMatch(
      /^cumulus-reveal-description-/,
    );
    const definition = glossary.requireGlossaryEntry(BANE_ID).definition;
    expect(describedText(source).split(definition).length - 1).toBe(1);
  });

  it("stacks a glossary-backed card status before rules-text definitions", async () => {
    const { container } = renderInCumulus(
      <GameCard model={model()} exhausted />,
    );
    await reveal(sourceIn(container), () => revealCards("secondary").length === 2);
    const [status, rules] = revealCards("secondary");
    expect(status?.textContent).toContain(
      glossary.requireGlossaryEntry(glossary.GLOSSARY_IDS.exhausted).term,
    );
    expect(rules?.textContent).toContain(glossary.requireGlossaryEntry(BANE_ID).term);
  });

  it("shows a timing secondary for a fast card with no rules text", async () => {
    const fastId = glossary.GLOSSARY_IDS.fast;
    vi.spyOn(glossary, "glossaryEntry").mockImplementation((id) =>
      id === fastId
        ? {
            id,
            category: "Keywords",
            term: "Fixture timing",
            definition: "Fixture timing definition.",
            priority: 95,
            matchesTermInRulesText: false,
            variants: ["❖"],
            termPresentation: "definitionOnly",
          }
        : undefined,
    );
    const { container } = renderInCumulus(
      <GameCard model={model(card({ isFast: true, renderedText: "" }))} />,
    );
    await reveal(sourceIn(container), () => revealCards("secondary").length === 1);
    expect(revealCards("secondary")[0]?.textContent).toContain(
      "Fixture timing definition.",
    );
  });

  it("keeps the card interactive when its status glossary entry is unavailable", () => {
    vi.spyOn(glossary, "glossaryEntry").mockReturnValue(undefined);
    const { container } = renderInCumulus(<GameCard model={model()} exhausted />);
    const source = sourceIn(container);
    expect(source.tabIndex).toBe(0);
    expect(describedText(source).trim()).not.toBe("");
  });

  it("places an authored figment preview beyond the glossary definitions on desktop", async () => {
    vi.mocked(extractMaterializedFigmentPreviews).mockReturnValue([
      {
        card: Object.freeze(
          card({
            id: testCardId(FIGMENT_ID),
            name: parseCardName("Fixture Figment"),
            subtype: "Warrior",
            energyCost: 0,
            spark: 1,
            renderedText: "Fixture figment text.",
            artOwned: false,
          }),
        ),
      },
    ]);
    const { container } = renderInCumulus(
      <div data-test-width="240">
        <GameCard
          model={model(
            card({ renderedText: "Nightmare is a Bane. Materialize a figment." }),
          )}
        />
      </div>,
    );
    await reveal(sourceIn(container), () => revealCards("adjacent").length > 0);
    const [definition] = revealCards("secondary");
    const [figment] = revealCards("adjacent");
    expect(
      figment
        .querySelector(`[data-card-id="${FIGMENT_ID}"]`)
        ?.getAttribute("data-figment"),
    ).toBe("true");
    expect(Number.parseFloat(figment.style.left)).toBe(
      Number.parseFloat(definition.style.left) +
        Number.parseFloat(definition.style.width) +
        10,
    );
  });

  it("uses a reading copy below 240px and leaves a complete 240px source in place", async () => {
    const small = renderInCumulus(
      <div data-test-width="239">
        <GameCard model={model()} />
      </div>,
    );
    const smallSource = sourceIn(small.container);
    await reveal(smallSource);
    expect(smallSource.dataset.revealActive).toBe("true");
    expect(smallSource.style.opacity).toBe("0");
    expect(revealCards("primary")[0]?.style.width).toBe("240px");
    small.unmount();

    const wide = renderInCumulus(
      <div data-test-width="240">
        <GameCard model={model()} />
      </div>,
    );
    const wideSource = sourceIn(wide.container);
    await reveal(wideSource, () => revealCards("secondary").length === 1);
    expect(wideSource.style.opacity).not.toBe("0");
    expect(revealCards("primary")).toHaveLength(0);
  });

  it("scales the desktop reading copy for a hovered battle hand card", async () => {
    const { container } = renderInCumulus(
      <div data-test-width="160" data-battle-hand-card-hover-scale="1.25">
        <GameCard model={model()} />
      </div>,
    );
    await reveal(sourceIn(container));
    expect(revealCards("primary")[0]?.style.width).toBe("300px");
  });

  it("reveals the complete card for hidden-rules faces and beside a visible battlefield face", async () => {
    for (const props of [{ hideRulesText: true }, { presentation: "battlefield" as const }]) {
      const rendered = renderInCumulus(<GameCard model={model()} {...props} />);
      const source = sourceIn(rendered.container);
      expect(source.dataset.revealCompleteGameCard).toBe("false");
      await reveal(source);
      if ("presentation" in props)
        expect(source.style.opacity).not.toBe("0");
      expect(revealCards("primary")[0]?.textContent).toContain(
        "Nightmare is a Bane",
      );
      rendered.unmount();
    }
  });

  it("uses the card's primary reveal when hovering a corner stat", async () => {
    const { container } = renderInCumulus(<GameCard model={model()} />);
    const source = sourceIn(container);
    const spark = source.querySelector<HTMLElement>('[data-card-stat="spark"]')!;
    expect(spark.closest("[data-reveal-entity-type]")).toBe(source);
    await reveal(spark);
    expect(source.dataset.revealActive).toBe("true");
  });

  it("carries figment framing and an applied transfiguration onto the reading copy", async () => {
    const displaySnapshot = card({ energyCost: 1 });
    const { container } = renderInCumulus(
      <GameCard
        figment
        model={{
          cardId: CARD_ID,
          displaySnapshot,
          transfiguration: {
            type: "Empowered",
            form: transfigurationFormFixture("Empowered"),
            markedText: displaySnapshot.renderedText,
            energyChanged: true,
            energyChangeName: "Fixture energy form",
            sparkChanged: false,
            sparkChangeName: null,
            fastChanged: false,
          },
        }}
      />,
    );
    await reveal(sourceIn(container));
    const [primary] = revealCards("primary");
    expect(primary.querySelector('.card-view[data-figment="true"]')).not.toBeNull();
    expect(primary.querySelector('[data-testid="figment-title-bar"]')).not.toBeNull();
    expect(primary.querySelector("i[aria-label]")).not.toBeNull();
  });

  it("keeps informative unavailable cards focusable while suppressing activation", async () => {
    const activate = vi.fn();
    const { container } = renderInCumulus(
      <GameCard model={model()} unavailable onPress={activate} />,
    );
    const source = sourceIn(container);
    expect(source.tabIndex).toBe(0);
    await reveal(source, undefined, () => source.focus());
    expect(source.dataset.revealActive).toBe("true");
    act(() => source.click());
    expect(activate).not.toHaveBeenCalled();
  });

  it("fires quick activation, suppresses a hold, and dismisses on drag recognition", () => {
    vi.useFakeTimers();
    const activate = vi.fn();
    const { container } = renderInCumulus(
      <GameCard model={model()} onPress={activate} />,
    );
    const source = sourceIn(container);
    const touch = (pointerId: number) => ({
      pointerType: "touch",
      pointerId,
      clientX: 100,
      clientY: 200,
    });
    act(() => pointer(source, "pointerdown", touch(4)));
    act(() => pointer(source, "pointerup", touch(4)));
    expect(activate).toHaveBeenCalledTimes(1);

    act(() => {
      pointer(source, "pointerdown", touch(5));
      vi.advanceTimersByTime(300);
      pointer(source, "pointerup", touch(5));
    });
    expect(activate).toHaveBeenCalledTimes(1);

    act(() => {
      pointer(source, "pointerover", { pointerId: 6 });
      source.dispatchEvent(new Event("dragstart", { bubbles: true }));
    });
    expect(document.querySelector("[data-cumulus-reveal-group]")).toBeNull();
  });
});

describe("cross-family reveal competition", () => {
  const SIGN = localizedDreamsignFixture({
    id: testDreamsignId("22222222-2222-4222-8222-222222222222"),
    name: "Fixture Sign",
    effectDescription: "Fixed effect.",
  });
  const SITE: DreamscapeSiteModel = {
    id: parseSiteId("33333333-3333-4333-8333-333333333333"),
    type: "Battle",
    isVisited: false,
    pos: { x: 50, y: 50 },
    index: 0,
    isBattle: true,
    isLocked: true,
    isInteractive: false,
    label: "Locked Fixture",
    blurb: "Fixed site detail.",
    icon: glyph("bxf bx-lock"),
  };

  beforeEach(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { width: 1200, height: 420, offsetLeft: 0, offsetTop: 0 },
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const measure = this.dataset.revealMeasure;
        if (measure === "primary") return rect(340, 40, 40, 360);
        if (measure === "secondary") return rect(248, 40, 40, 180);
        if (this.hasAttribute("data-game-card-source")) return rect(160, 40, 40, 240);
        return rect(100, 40, 40, 100);
      },
    );
  });

  it("enforces replacement, Escape suppression, unavailable activation, and consolidated definitions", async () => {
    const unavailableActivation = vi.fn();
    const { container } = renderInCumulus(
      <>
        <GameCard
          model={model(card({ renderedText: "Nightmare is a Bane. Discover. Ephemeral." }))}
        />
        <GlossaryTerm
          entry={{ term: "Fixture", definition: "Fixed local definition." }}
          text={"Fixture"}
        />
        <div style={{ width: 40, height: 40 }}>
          <Dreamsign dreamsign={SIGN} />
        </div>
        <SiteNode model={SITE} motion={false} onSelect={unavailableActivation} />
      </>,
    );
    const activeSources = () => [
      ...container.querySelectorAll<HTMLElement>('[data-reveal-active="true"]'),
    ];
    const groups = () => document.querySelectorAll("[data-cumulus-reveal-group]");
    const cardSource = sourceIn(container);
    const term = container.querySelector<HTMLElement>("[data-glossary-term]")!;
    const sign = container.querySelector<HTMLElement>("[data-dreamsign-id]")!;
    const site = container.querySelector<HTMLElement>("[data-site-id]")!;

    act(() => term.focus());
    expect(activeSources()).toEqual([term]);
    act(() => pointer(sign, "pointerover", { pointerId: 1 }));
    expect(activeSources()).toEqual([sign]);
    act(() => pointer(sign, "pointerout", { pointerId: 1 }));
    expect(activeSources()).toEqual([term]);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(activeSources()).toHaveLength(0);
    expect(groups()).toHaveLength(0);
    act(() => {
      pointer(sign, "pointerover", { pointerId: 2 });
      pointer(sign, "pointerout", { pointerId: 2 });
    });
    expect(activeSources()).toHaveLength(0);
    expect(groups()).toHaveLength(0);
    act(() => {
      term.blur();
      term.focus();
    });
    expect(activeSources()).toEqual([term]);

    act(() => {
      site.click();
      site.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(unavailableActivation).not.toHaveBeenCalled();

    act(() => term.blur());
    await reveal(cardSource, () => groups().length === 1, () =>
      pointer(cardSource, "pointerover", { pointerId: 3 }),
    );
    expect(activeSources()).toEqual([cardSource]);
    expect(cardSource.dataset.revealSecondaryTitles).toBe("");
    expect(revealCards("secondary")).toHaveLength(1);
  });
});
