// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";
import { JourneyDuplicationScreen, type JourneyDuplicationView } from "./JourneyDuplicationScreen";
import { click, guide, makeCard, q, stubMatchMedia } from "./essence-sites.fixtures";
beforeEach(() => { stubMatchMedia(false); globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });
function view(empty = false): JourneyDuplicationView {
  const card = makeCard(1);
  return { siteId: parseSiteId("copy-choice"), dreamsignId: testDreamsignId("copy-source"), heldIndex: 2, choiceIndex: 0, earnedSeq: 9,
    scene: null, guide: guide("copy-guide"), title: "", instruction: "", continueLabel: "", confirmLabel: "",
    cards: empty ? [] : ["first", "second"].map((id) => ({ entryId: parseDeckEntryId(id), model: { cardId: card.id, displaySnapshot: card }, isBane: false })) };
}
describe("JourneyDuplicationScreen physical selection", () => {
  it("chooses one of two physical copies, allows changing it, and emits no intent until confirmation", () => {
    const onConfirm = vi.fn(), { container } = renderInCumulus(<JourneyDuplicationScreen view={view()} onConfirm={onConfirm} />);
    click(q(container, "journey-duplication-card-first")); click(q(container, "journey-duplication-card-second"));
    expect(onConfirm).not.toHaveBeenCalled(); click(q(container, "journey-duplication-confirm")); expect(onConfirm).toHaveBeenLastCalledWith("second");
    click(q(container, "journey-duplication-card-second")); click(q(container, "journey-duplication-confirm")); expect(onConfirm).toHaveBeenLastCalledWith(null);
  });
  it("permits an empty-deck decline", () => {
    const onConfirm = vi.fn(), { container } = renderInCumulus(<JourneyDuplicationScreen view={view(true)} onConfirm={onConfirm} />);
    click(q(container, "journey-duplication-confirm")); expect(onConfirm).toHaveBeenCalledWith(null);
  });
});
