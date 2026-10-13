// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";
import { JourneyTransfigurationScreen, type JourneyTransfigurationView } from "./JourneyTransfigurationScreen";
import { click, guide, makeCard, q, stubMatchMedia } from "./essence-sites.fixtures";
beforeEach(() => { stubMatchMedia(false); globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });
function view(empty = false): JourneyTransfigurationView {
  return { siteId: parseSiteId("transfigure-choice"), dreamsignId: testDreamsignId("source"), heldIndex: 0, choiceIndex: 0,
    scene: null, guide: guide("transfigure-guide"), maxCount: 2, title: "", instruction: "", continueLabel: "", confirmLabel: () => "",
    cards: empty ? [] : [1, 2, 3].map((index) => ({ entryId: parseDeckEntryId(`entry-${String(index)}`),
      model: { cardId: makeCard(index).id, displaySnapshot: makeCard(index) }, isBane: false })) };
}
describe("JourneyTransfigurationScreen player selection", () => {
  it("caps the selection, permits deselection and emits the chosen physical IDs", () => {
    const onConfirm = vi.fn();
    const { container } = renderInCumulus(<JourneyTransfigurationScreen view={view()} onConfirm={onConfirm} />);
    click(q(container, "journey-transfiguration-card-entry-1")); click(q(container, "journey-transfiguration-card-entry-2")); click(q(container, "journey-transfiguration-card-entry-3"));
    click(q(container, "journey-transfiguration-confirm")); expect(onConfirm).toHaveBeenLastCalledWith(["entry-1", "entry-2"]);
    click(q(container, "journey-transfiguration-card-entry-1")); click(q(container, "journey-transfiguration-card-entry-3"));
    click(q(container, "journey-transfiguration-confirm")); expect(onConfirm).toHaveBeenLastCalledWith(["entry-2", "entry-3"]);
  });
  it("renders an empty eligible list and permits declining without game-local state", () => {
    const onConfirm = vi.fn(); const { container } = renderInCumulus(<JourneyTransfigurationScreen view={view(true)} onConfirm={onConfirm} />);
    click(q(container, "journey-transfiguration-confirm")); expect(onConfirm).toHaveBeenCalledWith([]);
  });
});
