// @vitest-environment jsdom

// BattleArrangeEditor: destinations, lane bounds, ordering, and Cancel.
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import type { BattleCardId } from "../../../types/identifiers";
import {
  BattleArrangeEditor,
  type BattleArrangeEditorModel,
} from "./BattleArrangeEditor";
import {
  arrangement,
  dialogCloseButtons,
  id,
  stubMatchMedia,
} from "./BattleForeseeEditor.fixtures";

vi.mock("../card/CardView", () => ({
  GameCard: () => <div data-mock-game-card="" />,
}));

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
