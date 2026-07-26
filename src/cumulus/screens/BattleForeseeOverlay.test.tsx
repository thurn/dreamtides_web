// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import type { DreamwellCardModel } from "../components/battle/DreamwellCard";
import {
  BattleForeseeOverlay,
  type BattleForeseeView,
} from "./BattleForeseeOverlay";

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

const DREAMWELL_SOURCE: DreamwellCardModel = {
  cardId: asCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
  displaySnapshot: {
    id: asCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
    name: "Source Dreamwell" as never,
    renderedText: "Foresee 1.",
    energyAdded: 1,
    imageNumber: 1,
  },
};

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

function deckIds(container: HTMLElement): (string | undefined)[] {
  return Array.from(
    container.querySelectorAll('[data-foresee-card-zone="deck"]'),
    (element) => (element as HTMLElement).dataset.foreseeCardId,
  );
}

function transfer(): DataTransfer {
  const data = new Map<string, string>();
  return {
    effectAllowed: "none",
    dropEffect: "none",
    files: {} as FileList,
    items: {} as DataTransferItemList,
    types: [],
    clearData: (format?: string) => {
      if (format === undefined) data.clear();
      else data.delete(format);
    },
    getData: (format: string) => data.get(format) ?? "",
    setData: (format: string, value: string) => {
      data.set(format, value);
    },
    setDragImage: () => {},
  };
}

function dragEvent(
  type: string,
  dataTransfer: DataTransfer,
  coordinates?: { readonly clientX: number; readonly clientY: number },
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  if (coordinates !== undefined) {
    Object.defineProperties(event, {
      clientX: { value: coordinates.clientX },
      clientY: { value: coordinates.clientY },
    });
  }
  return event;
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
  it("renders one horizontal workflow with count controls and Confirm", () => {
    const { container, root } = mount(
      <BattleForeseeOverlay view={makeView()} onConfirm={() => {}} />,
    );

    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label"))
      .toBe("Foresee 1");
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
    expect(container.querySelector<HTMLButtonElement>(
      '[aria-label="Foresee 1 fewer"]',
    )?.getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector<HTMLButtonElement>(
      '[aria-label="Foresee 1 more"]',
    )?.hasAttribute("aria-disabled")).toBe(false);
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

  it("keeps the UUID-backed Dreamwell source paired with the Foresee dialog", () => {
    const { root } = mount(
      <BattleForeseeOverlay
        view={makeView()}
        source={DREAMWELL_SOURCE}
        onConfirm={() => {}}
      />,
    );

    expect(
      document.body.querySelector('[data-battle-foresee-dreamwell-source]')
        ?.getAttribute("data-battle-foresee-dreamwell-source"),
    ).toBe("02e8ea92-1218-413c-9f0b-4c865a3921d3");

    act(() => root.unmount());
  });

  it("adds and removes the next deck card while keeping a half-overlapping stack", () => {
    const { container, root } = mount(
      <BattleForeseeOverlay view={makeView()} onConfirm={() => {}} />,
    );

    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Foresee 1 more"]')?.click();
    });
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label"))
      .toBe("Foresee 2");
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
      container.querySelector<HTMLButtonElement>('[aria-label="Foresee 1 more"]')?.click();
    });
    expect(deckIds(container)).toEqual([
      "battle-card-1",
      "battle-card-2",
      "battle-card-3",
    ]);
    expect(container.querySelector<HTMLButtonElement>(
      '[aria-label="Foresee 1 more"]',
    )?.getAttribute("aria-disabled")).toBe("true");

    const third = container.querySelector<HTMLElement>(
      '[data-foresee-card-id="battle-card-3"]',
    );
    const voidZone = container.querySelector<HTMLElement>('[data-foresee-zone="void"]');
    const dragData = transfer();
    act(() => {
      third?.dispatchEvent(dragEvent("dragstart", dragData));
      voidZone?.dispatchEvent(dragEvent("drop", dragData));
    });
    expect(container.querySelector('[data-foresee-card-zone="void"]')
      ?.getAttribute("data-foresee-card-id")).toBe("battle-card-3");

    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Foresee 1 fewer"]')?.click();
    });
    expect(deckIds(container)).toEqual(["battle-card-1", "battle-card-2"]);
    expect(container.querySelector('[data-foresee-card-zone="void"]')).toBeNull();
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label"))
      .toBe("Foresee 2");

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
    const voidZone = container.querySelector<HTMLElement>('[data-foresee-zone="void"]');
    const dragData = transfer();

    act(() => {
      first?.dispatchEvent(dragEvent("dragstart", dragData));
      third?.dispatchEvent(dragEvent("drop", dragData));
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
      second?.dispatchEvent(dragEvent("dragstart", dragData));
      voidZone?.dispatchEvent(dragEvent("drop", dragData));
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
    const voidZone = container.querySelector<HTMLElement>(
      '[data-foresee-zone="void"]',
    );
    vi.spyOn(deckIndicator as HTMLElement, "getBoundingClientRect")
      .mockReturnValue({
        x: 100,
        y: 100,
        left: 100,
        top: 100,
        right: 280,
        bottom: 352,
        width: 180,
        height: 252,
        toJSON: () => ({}),
      });
    vi.spyOn(voidIndicator as HTMLElement, "getBoundingClientRect")
      .mockReturnValue({
        x: 700,
        y: 100,
        left: 700,
        top: 100,
        right: 880,
        bottom: 352,
        width: 180,
        height: 252,
        toJSON: () => ({}),
      });
    const dragData = transfer();
    act(() => {
      second?.dispatchEvent(dragEvent("dragstart", dragData));
      voidZone?.dispatchEvent(dragEvent("drop", dragData));
    });
    expect(
      container.querySelector('[data-foresee-card-zone="void"]')
        ?.getAttribute("data-foresee-card-id"),
    ).toBe(cardInstanceIds[1]);

    const adjacentRelease = { clientX: 60, clientY: 226 };
    expect(100 - adjacentRelease.clientX).toBe(40);
    act(() => {
      container.querySelector<HTMLElement>(
        `[data-foresee-card-id="${cardInstanceIds[1]}"]`,
      )?.dispatchEvent(dragEvent("dragstart", dragData));
      row?.dispatchEvent(dragEvent("drop", dragData, adjacentRelease));
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
