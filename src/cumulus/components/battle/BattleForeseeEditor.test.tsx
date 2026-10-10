// @vitest-environment jsdom

import { act, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syntheticGameCard } from "../../test-helpers/component-test-fixtures";
import { renderInCumulus } from "../../testing/render";
import {
  parseBattleCardId,
  type BattleCardId,
} from "../../../types/identifiers";
import { testDreamwellCardId } from "../../../types/test-identities";
import {
  BattleForeseeEditor,
  type BattleForeseeEditorModel,
} from "./BattleForeseeEditor";
import {
  BattleArrangeEditor,
  type BattleArrangeEditorModel,
} from "./BattleArrangeEditor";
import {
  BattlePromptHost,
  type BattlePromptHostView,
} from "../../screens/battle-overlays/BattlePromptHost";
import { parsePromptId } from "../../../types/identifiers";

vi.mock("../card/CardView", () => ({
  GameCard: () => <div data-mock-game-card="" />,
}));

const id = (value: string): BattleCardId => parseBattleCardId(value);

function makeView(initialCount = 1): BattleForeseeEditorModel {
  return {
    initialCount,
    allowedCounts: [1, 2, 3],
    cards: [1, 2, 3].map((index) => ({
      battleCardId: id(`battle-card-${String(index)}`),
      // Every card shares a name: the editor must track battle-instance ids.
      card: syntheticGameCard(index, "Duplicate"),
    })),
  };
}

function zoneIds(
  container: HTMLElement,
  zone: "deck" | "void",
): (BattleCardId | undefined)[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      `[data-foresee-card-zone="${zone}"]`,
    ),
    (element) => {
      const value = element.dataset.foreseeCardId;
      return value === undefined ? undefined : parseBattleCardId(value);
    },
  );
}

const deckIds = (container: HTMLElement) => zoneIds(container, "deck");
const voidIds = (container: HTMLElement) => zoneIds(container, "void");

function countButtons(container: HTMLElement): readonly HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      "[data-foresee-count-controls] button",
    ),
  );
}

function confirm(container: HTMLElement): void {
  act(() => {
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="battle-foresee-confirm"]',
      )
      ?.click();
  });
}

function rect(left: number, top: number, width: number, height: number) {
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
  } as DOMRect;
}

/** Deck indicator at x 100–280, void indicator at x 700–880. */
function stubDropGeometry(container: HTMLElement): void {
  const stub = (selector: string, value: DOMRect) =>
    vi
      .spyOn(
        container.querySelector<HTMLElement>(selector)!,
        "getBoundingClientRect",
      )
      .mockReturnValue(value);
  stub("[data-foresee-row]", rect(0, 0, 1_000, 400));
  stub('[data-foresee-indicator="deck"]', rect(100, 100, 180, 252));
  stub('[data-foresee-indicator="void"]', rect(700, 100, 180, 252));
}

function pointerDrag(
  container: HTMLElement,
  cardId: BattleCardId,
  fromX: number,
  toX: number,
): void {
  const element = container.querySelector<HTMLElement>(
    `[data-foresee-card-id="${cardId}"]`,
  );
  const event = (type: string, clientX: number) => {
    const result = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(result, {
      pointerId: { value: 1 },
      pointerType: { value: "mouse" },
      button: { value: 0 },
      clientX: { value: clientX },
      clientY: { value: 226 },
    });
    return result;
  };
  act(() => {
    element?.dispatchEvent(event("pointerdown", fromX));
    element?.dispatchEvent(event("pointermove", toX));
    element?.dispatchEvent(event("pointerup", toX));
  });
}

function keydown(
  container: HTMLElement,
  cardId: BattleCardId,
  key: string,
): void {
  act(() => {
    container
      .querySelector(`[data-foresee-card-id="${cardId}"]`)
      ?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
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
  stubMatchMedia(true);
});

describe("BattleForeseeEditor", () => {
  it("renders the battlefield-centered workflow with the triggering Dreamwell card", () => {
    const sourceId = testDreamwellCardId(
      "f9b479cf-02cb-40e1-bb64-70b29977bf15",
    );
    const { container } = renderInCumulus(
      <BattleForeseeEditor
        model={{
          ...makeView(),
          source: {
            cardId: sourceId,
            displaySnapshot: {
              id: sourceId,
              name: "Source",
              renderedText: "Foresee 1.",
              energyAdded: 1,
              imageNumber: 1,
            },
          },
        }}
        onConfirm={() => {}}
      />,
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).not.toBe("");
    expect(
      dialog?.getAttribute("data-glass-dialog-desktop-center-target"),
    ).toBe("battlefield");
    expect(
      container
        .querySelector(
          '[data-battle-prompt-source="dreamwell"] [data-dreamwell-card]',
        )
        ?.getAttribute("data-dreamwell-card"),
    ).toBe(sourceId);
    expect(deckIds(container)).toEqual(["battle-card-1"]);
    expect(container.querySelectorAll("[data-foresee-indicator]")).toHaveLength(
      2,
    );
    const [decrement, increment] = countButtons(container);
    expect(decrement?.getAttribute("aria-disabled")).toBe("true");
    expect(increment?.hasAttribute("aria-disabled")).toBe(false);
  });

  it("adds and removes deck cards within the allowed counts", () => {
    const { container } = renderInCumulus(
      <BattleForeseeEditor model={makeView()} onConfirm={() => {}} />,
    );
    const accessibleName = () =>
      container.querySelector('[role="dialog"]')?.getAttribute("aria-label");
    const initialName = accessibleName();
    act(() => countButtons(container)[1]?.click());
    expect(accessibleName()).not.toBe(initialName);
    act(() => countButtons(container)[1]?.click());
    expect(deckIds(container)).toEqual([
      "battle-card-1",
      "battle-card-2",
      "battle-card-3",
    ]);
    expect(countButtons(container)[1]?.getAttribute("aria-disabled")).toBe(
      "true",
    );

    stubDropGeometry(container);
    pointerDrag(container, id("battle-card-3"), 400, 790);
    expect(voidIds(container)).toEqual(["battle-card-3"]);

    act(() => countButtons(container)[0]?.click());
    expect(deckIds(container)).toEqual(["battle-card-1", "battle-card-2"]);
    expect(voidIds(container)).toEqual([]);
  });

  it("drags to reorder and to void before one confirmation by battle-instance id", () => {
    const onConfirm = vi.fn();
    const { container } = renderInCumulus(
      <BattleForeseeEditor model={makeView(3)} onConfirm={onConfirm} />,
    );
    stubDropGeometry(container);
    vi.spyOn(
      container.querySelector<HTMLElement>(
        '[data-foresee-card-id="battle-card-3"]',
      )!,
      "getBoundingClientRect",
    ).mockReturnValue(rect(400, 100, 180, 252));

    pointerDrag(container, id("battle-card-1"), 300, 450);
    expect(deckIds(container)).toEqual([
      "battle-card-2",
      "battle-card-1",
      "battle-card-3",
    ]);
    pointerDrag(container, id("battle-card-2"), 350, 790);
    expect(deckIds(container)).toEqual(["battle-card-1", "battle-card-3"]);
    expect(voidIds(container)).toEqual(["battle-card-2"]);

    confirm(container);
    expect(onConfirm).toHaveBeenCalledWith({
      viewedCardIds: [
        id("battle-card-1"),
        id("battle-card-2"),
        id("battle-card-3"),
      ],
      orderedCardIds: [id("battle-card-1"), id("battle-card-3")],
      voidCardIds: [id("battle-card-2")],
    });
  });

  it("accepts a release adjacent to the deck indicator by nearest destination", () => {
    const { container } = renderInCumulus(
      <BattleForeseeEditor model={makeView(2)} onConfirm={() => {}} />,
    );
    stubDropGeometry(container);
    pointerDrag(container, id("battle-card-2"), 350, 790);
    expect(voidIds(container)).toEqual(["battle-card-2"]);

    // Released 40px left of the deck indicator, outside every drop zone.
    pointerDrag(container, id("battle-card-2"), 790, 60);
    expect(deckIds(container)).toEqual(["battle-card-2", "battle-card-1"]);
    expect(voidIds(container)).toEqual([]);
    expect(
      container.querySelector<HTMLElement>("[data-foresee-row]")?.dataset
        .foreseeDropGeometry,
    ).toBe("nearest-destination");
  });

  it("reserves a mobile blank lane at least one card wide", () => {
    stubMatchMedia(false);
    const { container } = renderInCumulus(
      <BattleForeseeEditor
        model={{
          initialCount: 1,
          allowedCounts: [1],
          cards: makeView().cards.slice(0, 1),
        }}
        onConfirm={() => {}}
      />,
    );
    const card = container.querySelector<HTMLElement>(
      '[data-foresee-card-zone="deck"]',
    );
    const spacer = container.querySelector<HTMLElement>(
      "[data-foresee-spacer]",
    );
    expect(card?.style.width).not.toBe("");
    expect(spacer?.style.minWidth).toBe(card?.style.width);
  });

  it("uses pointer capture instead of native HTML drag", () => {
    const { container } = renderInCumulus(
      <BattleForeseeEditor model={makeView()} onConfirm={() => {}} />,
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
  });

  it("confirms an empty Foresee so an authoritative prompt can resolve", () => {
    const onConfirm = vi.fn();
    const { container } = renderInCumulus(
      <BattleForeseeEditor
        model={{ initialCount: 0, allowedCounts: [0], cards: [] }}
        onConfirm={onConfirm}
      />,
    );
    expect(
      container
        .querySelector('[data-testid="battle-foresee-confirm"]')
        ?.hasAttribute("aria-disabled"),
    ).toBe(false);
    confirm(container);
    expect(onConfirm).toHaveBeenCalledWith({
      viewedCardIds: [],
      orderedCardIds: [],
      voidCardIds: [],
    });
  });

  it("gives keyboard editing the same result without mutating the model", () => {
    const onConfirm = vi.fn();
    const model = makeView(3);
    const before = JSON.stringify(model);
    const { container } = renderInCumulus(
      <BattleForeseeEditor model={model} onConfirm={onConfirm} />,
    );
    keydown(container, id("battle-card-1"), "ArrowRight");
    keydown(container, id("battle-card-3"), "v");
    confirm(container);
    expect(onConfirm).toHaveBeenCalledWith({
      viewedCardIds: [
        id("battle-card-1"),
        id("battle-card-2"),
        id("battle-card-3"),
      ],
      orderedCardIds: [id("battle-card-2"), id("battle-card-1")],
      voidCardIds: [id("battle-card-3")],
    });
    expect(JSON.stringify(model)).toBe(before);
  });

  it("resets every staged edit when authoritative model identity changes", () => {
    function ReplacementHarness() {
      const [model, setModel] = useState(makeView(1));
      return (
        <>
          <button
            type="button"
            data-testid="replace-model"
            onClick={() => setModel(makeView(2))}
          />
          <BattleForeseeEditor model={model} onConfirm={() => {}} />
        </>
      );
    }
    const { container } = renderInCumulus(<ReplacementHarness />);
    keydown(container, id("battle-card-1"), "v");
    expect(voidIds(container)).toHaveLength(1);
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="replace-model"]')
        ?.click(),
    );
    expect(deckIds(container)).toEqual(["battle-card-1", "battle-card-2"]);
    expect(voidIds(container)).toEqual([]);
  });

  it("rejects duplicate identities, invalid counts, and unsupported initial counts", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const view = makeView();
    const invalidModels: BattleForeseeEditorModel[] = [
      {
        ...view,
        cards: [view.cards[0], view.cards[0]],
        allowedCounts: [1, 2],
      },
      { ...view, allowedCounts: [2, 1] },
      { ...view, initialCount: 2, allowedCounts: [1, 3] },
    ];
    for (const model of invalidModels) {
      expect(() =>
        renderInCumulus(
          <BattleForeseeEditor model={model} onConfirm={() => {}} />,
        ),
      ).toThrow();
    }
    consoleError.mockRestore();
  });
});

/** Two cards, one into the hand and the other on top or bottom; both start legally placed. */
function arrangement(): BattleArrangeEditorModel {
  const lane = (
    destination: "top" | "bottom" | "hand",
    min: number,
    cardIds: readonly BattleCardId[],
  ) => ({ destination, label: destination, shortLabel: destination, min, max: 1, ordered: destination !== "hand", cardIds });
  return {
    title: "Arrange",
    subtitle: null,
    cards: [1, 2].map((index) => ({
      battleCardId: id(`battle-card-${String(index)}`),
      card: syntheticGameCard(index, "Duplicate"),
    })),
    lanes: [
      lane("top", 0, [id("battle-card-2")]),
      lane("bottom", 0, []),
      lane("hand", 1, [id("battle-card-1")]),
    ],
  };
}

/** Picks a card's destination from its destination menu, by lane index. */
function sendTo(container: HTMLElement, cardId: BattleCardId, laneIndex: number): void {
  act(() => {
    container
      .querySelector<HTMLElement>(`[data-battle-arrange-card="${cardId}"] [aria-haspopup="listbox"]`)
      ?.click();
  });
  act(() => {
    document.body.querySelectorAll<HTMLElement>('[role="option"]')[laneIndex]?.click();
  });
}

const arrangeConfirm = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('[data-testid="battle-arrange-confirm"]');

/** The dialog's own controls outside its body: the Cancel disc, when it has one. */
const dialogCloseButtons = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>("[data-glass-dialog-panel] button")).filter(
    (button) => button.closest("[data-glass-dialog-body]") === null,
  );

describe("BattleArrangeEditor", () => {
  beforeEach(() => stubMatchMedia(false));

  it("places cards in every allowed destination and confirms only within each lane's bounds", () => {
    const onConfirm = vi.fn();
    const { container } = renderInCumulus(<BattleArrangeEditor model={arrangement()} onConfirm={onConfirm} />);
    const [first, second] = [id("battle-card-1"), id("battle-card-2")];

    sendTo(container, second, 1);
    act(() => arrangeConfirm(container)?.click());
    expect(onConfirm).toHaveBeenLastCalledWith({
      viewedCardIds: [first, second],
      orderedCardIds: [],
      bottomCardIds: [second],
      voidCardIds: [],
      handCardIds: [first],
    });
    // Both cards on the bottom leave the hand short and the bottom over: no confirmation.
    sendTo(container, first, 1);
    expect(container.querySelector('[data-battle-arrange-lane="hand"]')?.getAttribute("data-battle-arrange-lane-valid")).toBe("false");
    expect(arrangeConfirm(container)?.getAttribute("aria-disabled")).toBe("true");
    act(() => arrangeConfirm(container)?.click());
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("reorders the cards of an ordered lane and confirms them first to last", () => {
    const onConfirm = vi.fn();
    const [first, second] = [id("battle-card-1"), id("battle-card-2")];
    const base = arrangement();
    const model: BattleArrangeEditorModel = {
      ...base,
      lanes: [{ ...base.lanes[0], max: 2, cardIds: [first, second] }, { ...base.lanes[2], min: 0, cardIds: [] }],
    };
    const { container } = renderInCumulus(<BattleArrangeEditor model={model} onConfirm={onConfirm} />);
    const orderButtons = (cardId: BattleCardId) =>
      Array.from(container.querySelectorAll<HTMLElement>(`[data-battle-arrange-card="${cardId}"] button:not([aria-haspopup])`));

    expect(orderButtons(first).map((button) => button.getAttribute("aria-disabled"))).toEqual(["true", null]);
    act(() => orderButtons(first)[1]?.click());
    expect(
      Array.from(container.querySelectorAll('[data-battle-arrange-lane="top"] [data-battle-arrange-card]'), (card) =>
        card.getAttribute("data-battle-arrange-card"),
      ),
    ).toEqual([second, first]);
    act(() => arrangeConfirm(container)?.click());
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ orderedCardIds: [second, first], handCardIds: [] }));
    // The unordered hand lane offers no order controls.
    sendTo(container, first, 1);
    expect(orderButtons(first)).toEqual([]);
  });

  it("offers Cancel only when the arrangement may be cancelled", () => {
    const onCancel = vi.fn();
    const without = renderInCumulus(<BattleArrangeEditor model={arrangement()} onConfirm={() => {}} />);
    expect(dialogCloseButtons(without.container)).toEqual([]);
    without.unmount();
    const { container } = renderInCumulus(
      <BattleArrangeEditor model={arrangement()} onConfirm={() => {}} onCancel={onCancel} />,
    );
    const [cancel] = dialogCloseButtons(container);
    act(() => cancel?.click());
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("BattlePromptHost arrangements", () => {
  beforeEach(() => stubMatchMedia(false));

  const host = (arrange: BattlePromptHostView["arrange"], cancellable: boolean): BattlePromptHostView => ({
    key: parsePromptId("1:0:0"),
    heading: null,
    cancellable,
    number: null,
    arrange,
    loopOffer: null,
    notice: null,
  });

  it("renders each arrangement surface with Cancel exactly while the prompt is cancellable", () => {
    const onCancel = vi.fn();
    for (const arrange of [
      { surface: "foresee", model: makeView(3) },
      { surface: "arrangement", model: arrangement() },
    ] as const) {
      const fixed = renderInCumulus(<BattlePromptHost view={host(arrange, false)} canAct={false} onCancel={onCancel} />);
      expect(fixed.container.querySelector(arrange.surface === "foresee" ? "[data-battle-cumulus-foresee]" : "[data-battle-arrange-editor]")).not.toBeNull();
      expect(dialogCloseButtons(fixed.container)).toEqual([]);
      fixed.unmount();
      const cancellable = renderInCumulus(<BattlePromptHost view={host(arrange, true)} canAct={false} onCancel={onCancel} />);
      act(() => dialogCloseButtons(cancellable.container)[0]?.click());
      cancellable.unmount();
    }
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
