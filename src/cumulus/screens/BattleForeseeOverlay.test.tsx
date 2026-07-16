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

function makeView(): BattleForeseeView {
  return {
    cards: [1, 2, 3].map((index) => {
      const displaySnapshot = makeCard(index);
      return {
        battleCardId: `battle-card-${String(index)}`,
        model: { cardId: displaySnapshot.id, displaySnapshot },
      };
    }),
  };
}

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

function dragEvent(type: string, dataTransfer: DataTransfer): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
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
  }) as unknown as typeof window.matchMedia;
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
  it("renders one horizontal workflow with no controls except Confirm", () => {
    const { container, root } = mount(
      <BattleForeseeOverlay view={makeView()} onConfirm={() => {}} />,
    );

    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label"))
      .toBe("Foresee 3");
    expect(deckIds(container)).toEqual([
      "battle-card-1",
      "battle-card-2",
      "battle-card-3",
    ]);
    expect(Array.from(
      container.querySelectorAll<HTMLElement>("[data-foresee-indicator]"),
      (indicator) => indicator.textContent,
    )).toEqual(["Deck", "Void"]);
    expect(Array.from(container.querySelectorAll("button"), (button) => button.textContent))
      .toEqual(["Confirm"]);
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

  it("supports drag ordering and dragging a card to the void before one confirmation", () => {
    const onConfirm = vi.fn();
    const { container, root } = mount(
      <BattleForeseeOverlay view={makeView()} onConfirm={onConfirm} />,
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
      orderedCardIds: ["battle-card-1", "battle-card-3"],
      voidCardIds: ["battle-card-2"],
    });

    act(() => root.unmount());
  });

  it("fits the mobile row with a blank lane at least one card width", () => {
    stubMatchMedia(false);
    const { container, root } = mount(
      <BattleForeseeOverlay view={{ cards: makeView().cards.slice(0, 1) }} onConfirm={() => {}} />,
    );

    const card = container.querySelector<HTMLElement>("[data-foresee-card-zone=deck]");
    const spacer = container.querySelector<HTMLElement>("[data-foresee-spacer]");
    const indicators = container.querySelectorAll<HTMLElement>("[data-foresee-indicator]");
    expect(card?.style.width).toBe("104px");
    expect(spacer?.style.minWidth).toBe("104px");
    expect(Array.from(indicators, (indicator) => indicator.style.width))
      .toEqual(["64px", "64px"]);
    expect(container.querySelectorAll("button")).toHaveLength(1);

    act(() => root.unmount());
  });
});
