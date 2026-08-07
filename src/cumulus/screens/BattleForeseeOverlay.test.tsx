// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import {
  BattleForeseeOverlay,
  type BattleForeseeView,
} from "./BattleForeseeOverlay";
import { CumulusRoot } from "../CumulusRoot";

vi.mock("../components/card/CardView", () => ({
  GameCard: ({ model }: { model: { displaySnapshot: CardData } }) => (
    <div data-card-name={model.displaySnapshot.name}>{model.displaySnapshot.name}</div>
  ),
}));

function makeCard(index: number): CardData {
  return {
    id: asCardId(`00000000-0000-0000-0000-00000000000${String(index)}`),
    name: asCardName(["First", "Second", "Third"][index - 1] ?? `Card ${String(index)}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: index,
    artOwned: true,
  };
}

function makeView(initialCount = 1): BattleForeseeView {
  return {
    initialCount,
    cards: [1, 2, 3].map((index) => {
      const displaySnapshot = makeCard(index);
      return {
        battleCardId: `battle-card-${String(index)}`,
        model: { cardId: displaySnapshot.id, displaySnapshot },
      };
    }),
  };
}

const SOURCE_DREAMWELL_CARD = {
  cardId: asCardId("f9b479cf-02cb-40e1-bb64-70b29977bf15"),
  displaySnapshot: {
    id: asCardId("f9b479cf-02cb-40e1-bb64-70b29977bf15"),
    name: "Skypath",
    renderedText: "Foresee 1.",
    energyAdded: 1,
    imageNumber: 1897537165,
  },
} as const;

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

function deckIds(container: HTMLElement): (string | undefined)[] {
  return Array.from(
    container.querySelectorAll('[data-foresee-card-zone="deck"]'),
    (element) => (element as HTMLElement).dataset.foreseeCardId,
  );
}

function countButtons(container: HTMLElement): readonly HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      "[data-foresee-count-controls] button",
    ),
  );
}

function pointerEvent(
  type: string,
  coordinates: { readonly clientX: number; readonly clientY: number },
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
    button: { value: 0 },
    clientX: { value: coordinates.clientX },
    clientY: { value: coordinates.clientY },
  });
  return event;
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  };
}

function stubDropGeometry(container: HTMLElement): void {
  vi.spyOn(
    container.querySelector<HTMLElement>("[data-foresee-row]") as HTMLElement,
    "getBoundingClientRect",
  ).mockReturnValue(rect(0, 0, 1_000, 400));
  vi.spyOn(
    container.querySelector<HTMLElement>(
      '[data-foresee-indicator="deck"]',
    ) as HTMLElement,
    "getBoundingClientRect",
  ).mockReturnValue(rect(100, 100, 180, 252));
  vi.spyOn(
    container.querySelector<HTMLElement>(
      '[data-foresee-indicator="void"]',
    ) as HTMLElement,
    "getBoundingClientRect",
  ).mockReturnValue(rect(700, 100, 180, 252));
}

function pointerDrag(
  element: HTMLElement,
  from: { readonly clientX: number; readonly clientY: number },
  to: { readonly clientX: number; readonly clientY: number },
): void {
  element.dispatchEvent(pointerEvent("pointerdown", from));
  element.dispatchEvent(pointerEvent("pointermove", to));
  element.dispatchEvent(pointerEvent("pointerup", to));
}

function stubMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: "",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  stubMatchMedia(true);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattleForeseeOverlay", () => {
  it("shows the Dreamwell card that triggered an authoritative Foresee prompt", () => {
    const { container, root } = mount(
      <BattleForeseeOverlay
        view={{
          ...makeView(),
          sourceDreamwellCard: SOURCE_DREAMWELL_CARD,
        }}
        onConfirm={() => {}}
      />,
    );

    const source = container.querySelector<HTMLElement>(
      '[data-battle-prompt-source="dreamwell"]',
    );
    expect(source?.textContent).toContain("Triggered By");
    expect(
      source?.querySelector("[data-dreamwell-card]")
        ?.getAttribute("data-dreamwell-card"),
    ).toBe(SOURCE_DREAMWELL_CARD.cardId);
    expect(source?.querySelector("[data-dreamwell-card-name]")?.textContent)
      .toBe("Skypath");

    act(() => root.unmount());
  });

  it("renders one horizontal workflow with count controls and Confirm", () => {
    const { container, root } = mount(
      <BattleForeseeOverlay view={makeView()} onConfirm={() => {}} />,
    );

    expect(
      container.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    ).not.toBe("");
    expect(
      container.querySelector('[role="dialog"]')
        ?.getAttribute("data-glass-dialog-desktop-center-target"),
    )
      .toBe("battlefield");
    expect(deckIds(container)).toEqual(["battle-card-1"]);
    expect(Array.from(
      container.querySelectorAll<HTMLElement>("[data-foresee-indicator]"),
      (indicator) => indicator.textContent,
    )).toEqual(["Deck", "Void"]);
    expect(Array.from(container.querySelectorAll("button"), (button) => button.textContent))
      .toEqual(["", "", "Confirm"]);
    const [decrement, increment] = countButtons(container);
    expect(decrement?.getAttribute("aria-disabled")).toBe("true");
    expect(decrement?.getAttribute("aria-label")).not.toBe("");
    expect(increment?.hasAttribute("aria-disabled")).toBe(false);
    expect(increment?.getAttribute("aria-label")).not.toBe("");
    expect(container.querySelector("[data-foresee-spacer]")).not.toBeNull();
    const dialogPanel = container.querySelector<HTMLElement>('[role="dialog"]')
      ?.firstElementChild as HTMLElement | undefined;
    expect(dialogPanel?.style.maxWidth).toBe("min(900px, 90vw)");
    expect(Array.from(
      container.querySelectorAll<HTMLElement>("[data-foresee-indicator]"),
      (indicator) => indicator.style.width,
    )).toEqual(["180px", "180px"]);

    act(() => root.unmount());
  });

  it("adds and removes the next deck card while keeping a half-overlapping stack", () => {
    const { container, root } = mount(
      <BattleForeseeOverlay view={makeView()} onConfirm={() => {}} />,
    );

    const initialAccessibleName = container
      .querySelector('[role="dialog"]')
      ?.getAttribute("aria-label");
    act(() => {
      countButtons(container)[1]?.click();
    });
    expect(
      container.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    ).not.toBe(initialAccessibleName);
    expect(deckIds(container)).toEqual(["battle-card-1", "battle-card-2"]);
    expect(Array.from(
      container.querySelectorAll<HTMLElement>('[data-foresee-card-zone="deck"]'),
      (card) => card.style.marginInlineStart,
    )).toEqual(["0px", "-90px"]);
    expect(Array.from(
      container.querySelectorAll<HTMLElement>('[data-foresee-card-zone="deck"]'),
      (card) => card.style.zIndex,
    )).toEqual(["2", "1"]);

    act(() => {
      countButtons(container)[1]?.click();
    });
    expect(deckIds(container)).toEqual([
      "battle-card-1",
      "battle-card-2",
      "battle-card-3",
    ]);
    expect(countButtons(container)[1]?.getAttribute("aria-disabled")).toBe(
      "true",
    );

    const third = container.querySelector<HTMLElement>(
      '[data-foresee-card-id="battle-card-3"]',
    );
    stubDropGeometry(container);
    act(() => {
      if (third !== null) {
        pointerDrag(
          third,
          { clientX: 400, clientY: 200 },
          { clientX: 790, clientY: 200 },
        );
      }
    });
    expect(container.querySelector('[data-foresee-card-zone="void"]')
      ?.getAttribute("data-foresee-card-id")).toBe("battle-card-3");

    act(() => {
      countButtons(container)[0]?.click();
    });
    expect(deckIds(container)).toEqual(["battle-card-1", "battle-card-2"]);
    expect(container.querySelector('[data-foresee-card-zone="void"]')).toBeNull();
    expect(
      container.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    ).not.toBe("");

    act(() => root.unmount());
  });

  it("supports drag ordering and dragging a card to the void before one confirmation", () => {
    const onConfirm = vi.fn();
    const { container, root } = mount(
      <BattleForeseeOverlay view={makeView(3)} onConfirm={onConfirm} />,
    );
    const first = container.querySelector<HTMLElement>(
      '[data-foresee-card-id="battle-card-1"]',
    );
    const third = container.querySelector<HTMLElement>(
      '[data-foresee-card-id="battle-card-3"]',
    );
    stubDropGeometry(container);
    vi.spyOn(third as HTMLElement, "getBoundingClientRect")
      .mockReturnValue(rect(400, 100, 180, 252));

    act(() => {
      if (first !== null) {
        pointerDrag(
          first,
          { clientX: 300, clientY: 200 },
          { clientX: 450, clientY: 200 },
        );
      }
    });
    expect(deckIds(container)).toEqual([
      "battle-card-2",
      "battle-card-1",
      "battle-card-3",
    ]);

    const second = container.querySelector<HTMLElement>(
      '[data-foresee-card-id="battle-card-2"]',
    );
    act(() => {
      if (second !== null) {
        pointerDrag(
          second,
          { clientX: 350, clientY: 200 },
          { clientX: 790, clientY: 200 },
        );
      }
    });
    expect(deckIds(container)).toEqual(["battle-card-1", "battle-card-3"]);
    expect(
      container.querySelector('[data-foresee-card-zone="void"]')
        ?.getAttribute("data-foresee-card-id"),
    ).toBe("battle-card-2");

    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="battle-foresee-confirm"]',
      )?.click();
    });
    expect(onConfirm).toHaveBeenCalledWith({
      viewedCardIds: ["battle-card-1", "battle-card-2", "battle-card-3"],
      orderedCardIds: ["battle-card-1", "battle-card-3"],
      voidCardIds: ["battle-card-2"],
    });

    act(() => root.unmount());
  });

  it("uses destination geometry to accept a release adjacent to the deck indicator", () => {
    const cardInstanceIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ] as const;
    const view = {
      initialCount: 2,
      cards: makeView(2).cards.slice(0, 2).map((card, index) => ({
        ...card,
        battleCardId: cardInstanceIds[index],
      })),
    };
    const { container, root } = mount(
      <BattleForeseeOverlay view={view} onConfirm={() => {}} />,
    );
    const row = container.querySelector<HTMLElement>("[data-foresee-row]");
    const deckIndicator = container.querySelector<HTMLElement>(
      '[data-foresee-indicator="deck"]',
    );
    const voidIndicator = container.querySelector<HTMLElement>(
      '[data-foresee-indicator="void"]',
    );
    const second = container.querySelector<HTMLElement>(
      `[data-foresee-card-id="${cardInstanceIds[1]}"]`,
    );
    vi.spyOn(row as HTMLElement, "getBoundingClientRect")
      .mockReturnValue(rect(0, 0, 900, 400));
    vi.spyOn(deckIndicator as HTMLElement, "getBoundingClientRect")
      .mockReturnValue(rect(100, 100, 180, 252));
    vi.spyOn(voidIndicator as HTMLElement, "getBoundingClientRect")
      .mockReturnValue(rect(700, 100, 180, 252));
    act(() => {
      if (second !== null) {
        pointerDrag(
          second,
          { clientX: 350, clientY: 226 },
          { clientX: 790, clientY: 226 },
        );
      }
    });
    expect(
      container.querySelector('[data-foresee-card-zone="void"]')
        ?.getAttribute("data-foresee-card-id"),
    ).toBe(cardInstanceIds[1]);

    const adjacentRelease = { clientX: 60, clientY: 226 };
    expect(100 - adjacentRelease.clientX).toBe(40);
    act(() => {
      const returnedCard = container.querySelector<HTMLElement>(
        `[data-foresee-card-id="${cardInstanceIds[1]}"]`,
      );
      if (returnedCard !== null) {
        pointerDrag(
          returnedCard,
          { clientX: 790, clientY: 226 },
          adjacentRelease,
        );
      }
    });

    expect(deckIds(container)).toEqual([
      cardInstanceIds[1],
      cardInstanceIds[0],
    ]);
    expect(container.querySelector('[data-foresee-card-zone="void"]'))
      .toBeNull();
    expect(row?.dataset.foreseeDropGeometry)
      .toBe("nearest-destination");

    act(() => root.unmount());
  });

  it("fits the mobile row with a blank lane at least one card width", () => {
    stubMatchMedia(false);
    const { container, root } = mount(
      <BattleForeseeOverlay view={{ initialCount: 1, cards: makeView().cards.slice(0, 1) }} onConfirm={() => {}} />,
    );

    const card = container.querySelector<HTMLElement>("[data-foresee-card-zone=deck]");
    const spacer = container.querySelector<HTMLElement>("[data-foresee-spacer]");
    const indicators = container.querySelectorAll<HTMLElement>("[data-foresee-indicator]");
    expect(card?.style.width).toBe("104px");
    expect(spacer?.style.minWidth).toBe("104px");
    expect(Array.from(indicators, (indicator) => indicator.style.width))
      .toEqual(["64px", "64px"]);
    expect(container.querySelectorAll("button")).toHaveLength(3);

    act(() => root.unmount());
  });

  it("uses pointer capture instead of native HTML drag", () => {
    const { container, root } = mount(
      <BattleForeseeOverlay view={makeView()} onConfirm={() => {}} />,
    );
    const card = container.querySelector<HTMLElement>(
      '[data-foresee-card-zone="deck"]',
    );
    const nativeDrag = new Event("dragstart", {
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      card?.dispatchEvent(nativeDrag);
    });

    expect(card?.draggable).toBe(false);
    expect(nativeDrag.defaultPrevented).toBe(true);

    act(() => root.unmount());
  });

  it("confirms an empty Foresee so an authoritative prompt can resolve", () => {
    const onConfirm = vi.fn();
    const { container, root } = mount(
      <BattleForeseeOverlay
        view={{ initialCount: 1, cards: [] }}
        onConfirm={onConfirm}
      />,
    );

    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-foresee-confirm"]',
    );
    expect(confirm?.hasAttribute("aria-disabled")).toBe(false);

    act(() => confirm?.click());

    expect(onConfirm).toHaveBeenCalledWith({
      viewedCardIds: [],
      orderedCardIds: [],
      voidCardIds: [],
    });

    act(() => root.unmount());
  });
});
