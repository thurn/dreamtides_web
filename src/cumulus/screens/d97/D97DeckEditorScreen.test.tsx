// @vitest-environment jsdom

// The D97 deck editor's interaction contract: a deck card press unequips that
// copy, a reserve card press equips it, deck cards take no press at the
// minimum, every opening starts on the deck, and Escape closes the editor.

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardId } from "../../../types/card-identity";
import { parseD97OwnedCopyId } from "../../../types/identifiers";
import type { DomTestId } from "../../types/dom";
import { renderInCumulus } from "../../testing/render";
import { card, stubMatchMedia } from "../augury-and-starting-deck.fixtures";
import {
  D97DeckEditorScreen,
  type D97DeckEditorCardView,
  type D97DeckEditorView,
} from "./D97DeckEditorScreen";

vi.mock("../../components/card/CardView", async () => {
  const { Pressable } = await import("../../primitives/Pressable");
  return {
    CardView: () => <div />,
    GameCard: ({
      model,
      onPress,
      unavailable,
      testId,
    }: {
      model: { cardId: CardId };
      onPress?: () => void;
      unavailable?: boolean;
      testId?: DomTestId;
    }) => (
      <Pressable
        as={onPress === undefined ? "div" : "button"}
        data-testid={testId}
        data-card-id={model.cardId}
        onClick={unavailable === true ? undefined : onPress}
      />
    ),
  };
});

function copyId(index: number) {
  return parseD97OwnedCopyId(
    `97000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
}

function cardView(index: number): D97DeckEditorCardView {
  const displaySnapshot = card(index);
  return {
    entryId: copyId(index),
    model: { cardId: displaySnapshot.id, displaySnapshot },
    testId: `d97-deck-editor-card-${copyId(index)}`,
  };
}

function view(canUnequip = true): D97DeckEditorView {
  return {
    deck: [cardView(1), cardView(2)],
    reserve: [cardView(3)],
    deckCount: 2,
    reserveCount: 1,
    minimumDeckSize: canUnequip ? 1 : 2,
    canUnequip,
  };
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
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function mount(props: Partial<Parameters<typeof D97DeckEditorScreen>[0]> = {}) {
  const handlers = { onEquip: vi.fn(), onUnequip: vi.fn(), onClose: vi.fn() };
  const { container, rerender } = renderInCumulus(
    <D97DeckEditorScreen isOpen view={view()} {...handlers} {...props} />,
  );
  return { container, rerender, handlers };
}

function press(container: HTMLElement, index: number): void {
  const target = container.querySelector<HTMLElement>(
    `[data-testid="d97-deck-editor-card-${copyId(index)}"]`,
  );
  act(() => {
    target?.click();
  });
}

describe("D97DeckEditorScreen", () => {
  it("unequips a pressed deck copy by its owned-copy id", () => {
    const { container, handlers } = mount();
    const { onUnequip, onEquip } = handlers;
    expect(
      container.querySelector("[data-d97-deck-zone]")?.getAttribute("data-d97-deck-zone"),
    ).toBe("deck");
    press(container, 2);
    expect(onUnequip).toHaveBeenCalledWith(copyId(2));
    expect(onEquip).not.toHaveBeenCalled();
  });

  it("equips a pressed reserve copy after switching to the reserve", () => {
    const { container, handlers } = mount();
    const { onEquip } = handlers;
    act(() => {
      container.querySelectorAll<HTMLElement>('[role="tab"]')[1]?.click();
    });
    expect(
      container.querySelector("[data-d97-deck-zone]")?.getAttribute("data-d97-deck-zone"),
    ).toBe("reserve");
    press(container, 3);
    expect(onEquip).toHaveBeenCalledWith(copyId(3));
  });

  it("opens on the deck again after closing on the reserve", async () => {
    const { container, rerender, handlers } = mount();
    const zone = () => container.querySelector("[data-d97-deck-zone]")?.getAttribute("data-d97-deck-zone") ?? null;
    act(() => {
      container.querySelectorAll<HTMLElement>('[role="tab"]')[1]?.click();
    });
    expect(zone()).toBe("reserve");
    rerender(<D97DeckEditorScreen isOpen={false} view={view()} {...handlers} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    rerender(<D97DeckEditorScreen isOpen view={view()} {...handlers} />);
    expect(zone()).toBe("deck");
  });

  it("takes no unequip press at the minimum deck size", () => {
    const onUnequip = vi.fn();
    const { container } = mount({ view: view(false), onUnequip });
    press(container, 1);
    expect(onUnequip).not.toHaveBeenCalled();
  });

  it("closes on Escape and renders nothing while closed", () => {
    const onClose = vi.fn();
    mount({ onClose });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    document.body.innerHTML = "";
    const { container } = mount({ isOpen: false });
    expect(container.querySelector("[data-d97-deck-editor]")).toBeNull();
  });
});
