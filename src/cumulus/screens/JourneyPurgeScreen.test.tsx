// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";
import { JourneyPurgeScreen, type JourneyPurgeView } from "./JourneyPurgeScreen";
import { click, guide, makeCard, q, stubMatchMedia } from "./essence-sites.fixtures";
beforeEach(() => { stubMatchMedia(false); globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });
function view(exact = true): JourneyPurgeView {
  return { siteId: parseSiteId("purge-choice"), dreamsignId: testDreamsignId("source"), heldIndex: 0, choiceIndex: 0,
    scene: null, guide: guide("purge-guide"), minCount: exact ? 2 : 0, maxCount: 2, collectAmount: exact ? 17 : null,
    title: "", instruction: "", cards: [1, 2, 3].map((index) => ({ entryId: parseDeckEntryId(`entry-${String(index)}`),
      model: { cardId: makeCard(index).id, displaySnapshot: makeCard(index) }, isBane: false })) };
}
describe("JourneyPurgeScreen presentation choices", () => {
  it("requires exact selection, caps candidates and emits concrete IDs while keeping collection available", () => {
    const onPurge = vi.fn(), onCollect = vi.fn();
    const { container } = renderInCumulus(<JourneyPurgeScreen view={view()} onPurge={onPurge} onCollect={onCollect} />);
    click(q(container, "journey-purge-confirm")); expect(onPurge).not.toHaveBeenCalled();
    click(q(container, "journey-purge-card-entry-1")); click(q(container, "journey-purge-confirm")); expect(onPurge).not.toHaveBeenCalled();
    click(q(container, "journey-purge-card-entry-2")); click(q(container, "journey-purge-card-entry-3"));
    click(q(container, "journey-purge-confirm")); expect(onPurge).toHaveBeenCalledWith(["entry-1", "entry-2"]);
    click(q(container, "journey-purge-collect")); expect(onCollect).toHaveBeenCalledOnce();
  });
  it("allows declining a Slug window without any selection and resets selection across earned copies", () => {
    const onPurge = vi.fn(); const { container } = renderInCumulus(<JourneyPurgeScreen view={view(false)} onPurge={onPurge} onCollect={vi.fn()} />);
    click(q(container, "journey-purge-confirm")); expect(onPurge).toHaveBeenCalledWith([]);
    expect(q(container, "journey-purge-collect")).toBeNull();
  });
});
