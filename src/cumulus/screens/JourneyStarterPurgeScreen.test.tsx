// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { renderInCumulus } from "../testing/render";
import { JourneyStarterPurgeScreen, type JourneyStarterPurgeView } from "./JourneyStarterPurgeScreen";
import { click, makeCard, q, stubMatchMedia } from "./essence-sites.fixtures";
import { parseDeckEntryId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
beforeEach(() => { stubMatchMedia(false); globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });
function view(): JourneyStarterPurgeView {
  const card = makeCard(1);
  return { dreamsignId: testDreamsignId("starter-source"), heldIndex: 0, choiceIndex: 0, permissionSeq: 2, scene: null, maxCount: 1, title: "", instruction: "", continueLabel: "", confirmLabel: () => "",
    cards: ["first", "second"].map((id) => ({ entryId: parseDeckEntryId(id), model: { cardId: card.id, displaySnapshot: card }, isBane: false })) };
}
it("keeps tentative physical selection local, enforces the bound and resets on a new earned permission", () => {
  const onConfirm = vi.fn(), props = view();
  const { container, rerender } = renderInCumulus(<JourneyStarterPurgeScreen view={props} onConfirm={onConfirm} />);
  click(q(container, "journey-starter-purge-card-first"));
  expect(onConfirm).not.toHaveBeenCalled();
  click(q(container, "journey-starter-purge-card-second")); click(q(container, "journey-starter-purge-confirm"));
  expect(onConfirm).toHaveBeenLastCalledWith(["first"]);
  rerender(<JourneyStarterPurgeScreen view={{ ...props, permissionSeq: 3 }} onConfirm={onConfirm} />);
  click(q(container, "journey-starter-purge-confirm")); expect(onConfirm).toHaveBeenLastCalledWith([]);
});
