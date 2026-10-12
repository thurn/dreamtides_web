// @vitest-environment jsdom

import { act, useLayoutEffect, useRef, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseDreamsignId } from "../../../types/identifiers";
import { renderInCumulus } from "../../testing/render";
import { JourneyStatusBar, type QsbDreamsign } from "./JourneyStatusBar";

const first: QsbDreamsign = {
  id: parseDreamsignId("00000000-0000-4000-8000-000000000001"),
  name: "Shared synthetic display name",
  imageAlt: "Synthetic art",
  imageName: "synthetic-first.png",
  effectDescription: null,
};
const second: QsbDreamsign = {
  ...first,
  id: parseDreamsignId("00000000-0000-4000-8000-000000000002"),
  imageName: "synthetic-second.png",
};

function Stage({
  signs,
  variant = "journey",
}: {
  signs: QsbDreamsign[];
  variant?: "journey" | "battle";
}): ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);
  return (
    <div ref={stageRef}>
      <JourneyStatusBar stageRef={stageRef} dreamsigns={signs} variant={variant} />
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 640, 480),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const tiles = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-dreamsign-id]"));

describe("held Dreamsign occurrences", () => {
  it.each(["journey", "battle"] as const)(
    "renders duplicate copies and preserves distinct UUIDs through %s reordering/removal/restoration",
    (variant) => {
      const view = renderInCumulus(<Stage signs={[first, first, second]} variant={variant} />);
      expect(tiles(view.container).map((tile) => tile.dataset.dreamsignId)).toEqual([
        first.id, first.id, second.id,
      ]);
      expect(console.error).not.toHaveBeenCalled();
      for (const tile of tiles(view.container).slice(0, 2)) {
        act(() => tile.focus());
        expect(document.querySelectorAll("[data-cumulus-reveal-group]")).toHaveLength(1);
        act(() => tile.blur());
      }
      const distinct = tiles(view.container)[2];
      view.rerender(<Stage signs={[second, first, first]} variant={variant} />);
      expect(tiles(view.container)[0]).toBe(distinct);
      expect(tiles(view.container).map((tile) => tile.dataset.dreamsignId)).toEqual([
        second.id, first.id, first.id,
      ]);
      view.rerender(<Stage signs={[second, first]} variant={variant} />);
      expect(tiles(view.container)).toHaveLength(2);
      expect(tiles(view.container)[0]).toBe(distinct);
      view.unmount();
      const restored = renderInCumulus(<Stage signs={[second, first, first]} variant={variant} />);
      expect(tiles(restored.container).map((tile) => tile.dataset.dreamsignId)).toEqual([
        second.id, first.id, first.id,
      ]);
      expect(console.error).not.toHaveBeenCalled();
    },
  );

  it("keeps every overflow copy in the stack and interactive viewer", () => {
    const signs = [first, first, second, second, first];
    const view = renderInCumulus(<Stage signs={signs} />);
    const stack = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.querySelectorAll("img").length === signs.length,
    );
    expect(stack).toBeDefined();
    act(() => stack?.click());
    expect(tiles(view.container).map((tile) => tile.dataset.dreamsignId)).toEqual(
      signs.map((sign) => sign.id),
    );
    expect(tiles(view.container).every((tile) => tile.getAttribute("role") === "button")).toBe(true);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("renders one copy without console errors", () => {
    const view = renderInCumulus(<Stage signs={[first]} />);
    expect(tiles(view.container).map((tile) => tile.dataset.dreamsignId)).toEqual([first.id]);
    expect(console.error).not.toHaveBeenCalled();
  });
});
