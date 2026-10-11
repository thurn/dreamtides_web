// @vitest-environment jsdom

// CardChangePair: entry and card identities, change kinds, and the reveal.
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDeckEntryId } from "../../../types/identifiers";
import { syntheticGameCard } from "../../test-helpers/component-test-fixtures";
import { renderInCumulus } from "../../testing/render";
import { CardChangePair } from "./CardChangePair";

const originalMatchMedia = window.matchMedia.bind(window);

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("CardChangePair", () => {
  function pair(
    kind: "replacement" | "copy" | "transfiguration" | "keyword",
    reveal: "before" | "complete",
  ) {
    return (
      <CardChangePair
        model={{
          changeId: kind,
          kind,
          before: {
            entryId: parseDeckEntryId("entry-before"),
            card: syntheticGameCard(1, "Duplicate"),
          },
          after: {
            entryId: parseDeckEntryId("entry-after"),
            card: syntheticGameCard(2, "Duplicate"),
          },
        }}
        reveal={reveal}
      />
    );
  }

  it("preserves entry and card identities and marks each face by change kind", () => {
    for (const [kind, before, after] of [
      ["replacement", "danger", "changed"],
      ["copy", "none", "copied"],
      ["transfiguration", "none", "transfigured"],
    ] as const) {
      const { container, unmount } = renderInCumulus(pair(kind, "complete"));
      const root = container.querySelector<HTMLElement>(
        "[data-card-change-pair]",
      );
      expect(root?.dataset.beforeEntryId).toBe("entry-before");
      expect(root?.dataset.afterEntryId).toBe("entry-after");
      expect(root?.dataset.beforeCardId).not.toBe(root?.dataset.afterCardId);
      expect(root?.dataset.cardChangeKind).toBe(kind);
      const face = (side: string) =>
        container.querySelector<HTMLElement>(`[data-card-change-face="${side}"]`)
          ?.dataset.cardChangeSelection;
      expect(face("before")).toBe(before);
      expect(face("after")).toBe(after);
      unmount();
    }
  });

  it("conceals the result in the before phase unless motion is reduced", () => {
    const { container, unmount } = renderInCumulus(pair("copy", "before"));
    expect(
      container.querySelector<HTMLElement>("[data-card-change-pair]")?.dataset
        .cardChangeReveal,
    ).toBe("before");
    expect(
      container
        .querySelector('[data-card-change-face="after"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    unmount();

    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const reduced = renderInCumulus(pair("keyword", "before"));
    expect(
      reduced.container.querySelector<HTMLElement>("[data-card-change-pair]")
        ?.dataset.cardChangeReveal,
    ).toBe("complete");
  });
});
