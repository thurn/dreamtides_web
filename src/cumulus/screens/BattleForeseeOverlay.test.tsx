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
    deckOwnerLabel: "your",
    cards: [1, 2, 3].map((index) => {
      const displaySnapshot = makeCard(index);
      return {
        battleCardId: `battle-card-${String(index)}`,
        displayName: displaySnapshot.name,
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

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    media: "",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattleForeseeOverlay", () => {
  it("renders only the authoritative ordering and void workflow", () => {
    const { container, root } = mount(
      <BattleForeseeOverlay view={makeView()} onClose={() => {}} onConfirm={() => {}} />,
    );

    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label"))
      .toBe("Foresee 3");
    expect(deckIds(container)).toEqual([
      "battle-card-1",
      "battle-card-2",
      "battle-card-3",
    ]);
    expect(container.textContent).toContain("Left to right is top to bottom.");
    expect(container.textContent).toContain("No cards selected.");
    expect(container.textContent).not.toContain("Reveal count");
    expect(container.textContent).not.toContain("Play from Top");
    expect(container.textContent).not.toContain("Send to Bottom");

    act(() => root.unmount());
  });

  it("supports drag ordering and dragging a card to the void before one confirmation", () => {
    const onConfirm = vi.fn();
    const { container, root } = mount(
      <BattleForeseeOverlay view={makeView()} onClose={() => {}} onConfirm={onConfirm} />,
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

  it("provides named controls as a non-drag fallback", () => {
    const onConfirm = vi.fn();
    const { container, root } = mount(
      <BattleForeseeOverlay view={makeView()} onClose={() => {}} onConfirm={onConfirm} />,
    );

    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Move First later"]')?.click();
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
      Array.from(second?.querySelectorAll("button") ?? [])
        .find((button) => button.textContent?.includes("To Void"))
        ?.click();
    });
    expect(container.querySelector('[data-foresee-card-zone="void"]')).not.toBeNull();

    act(() => root.unmount());
  });
});
