// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { renderInCumulus } from "../testing/render";
import { JourneyOpeningHandScreen, type JourneyOpeningHandView } from "./JourneyOpeningHandScreen";
import { click, makeCard, q, stubMatchMedia } from "./essence-sites.fixtures";
import { parseDeckEntryId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";

beforeEach(() => { stubMatchMedia(false); globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });
function view(): JourneyOpeningHandView {
  const card = makeCard(1);
  return { dreamsignId: testDreamsignId("opening-screen"), heldIndex: 0, choiceIndex: 0, permissionSeq: 2,
    scene: null, title: "", instruction: "", confirmLabel: "", continueLabel: "", emptyLabel: "",
    cards: ["first", "second"].map((id) => ({ entryId: parseDeckEntryId(id), model: { cardId: card.id, displaySnapshot: card }, isBane: false })) };
}
it("requires one tentative physical selection and resets it for the next permission", () => {
  const onConfirm = vi.fn(), props = view();
  const { container, rerender } = renderInCumulus(<JourneyOpeningHandScreen view={props} onConfirm={onConfirm} />);
  click(q(container, "journey-opening-hand-confirm")); expect(onConfirm).not.toHaveBeenCalled();
  click(q(container, "journey-opening-hand-card-second")); expect(onConfirm).not.toHaveBeenCalled();
  click(q(container, "journey-opening-hand-confirm")); expect(onConfirm).toHaveBeenLastCalledWith("second");
  onConfirm.mockClear();
  rerender(<JourneyOpeningHandScreen view={{ ...props, permissionSeq: 3 }} onConfirm={onConfirm} />);
  click(q(container, "journey-opening-hand-confirm")); expect(onConfirm).not.toHaveBeenCalled();
  rerender(<JourneyOpeningHandScreen view={{ ...props, cards: [] }} onConfirm={onConfirm} />);
  click(q(container, "journey-opening-hand-confirm")); expect(onConfirm).toHaveBeenLastCalledWith(null);
});
