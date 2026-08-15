// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mountCumulus,
  syntheticGameCard,
} from "../../test-helpers/component-test-fixtures";
import { CardChangePair } from "./CardChangePair";
import { parseDeckEntryId } from "../../../types/identifiers";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CardChangePair", () => {
  it("preserves entry and card identities for every visual change recipe", () => {
    for (const kind of [
      "replacement",
      "copy",
      "transfiguration",
      "keyword",
      "card-type",
    ] as const) {
      const { container, root } = mountCumulus(
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
          reveal="complete"
        />,
      );
      const pair = container.querySelector<HTMLElement>(
        "[data-card-change-pair]",
      );
      expect(pair?.dataset.beforeEntryId).toBe("entry-before");
      expect(pair?.dataset.afterEntryId).toBe("entry-after");
      expect(pair?.dataset.beforeCardId).not.toBe(pair?.dataset.afterCardId);
      expect(pair?.dataset.cardChangeKind).toBe(kind);
      expect(
        container.querySelector<HTMLElement>('[data-card-change-face="after"]')
          ?.dataset.cardChangeSelection,
      ).toBe(
        kind === "copy"
          ? "copied"
          : kind === "transfiguration"
            ? "transfigured"
            : "changed",
      );
      expect(
        container.querySelector<HTMLElement>('[data-card-change-face="before"]')
          ?.dataset.cardChangeSelection,
      ).toBe(kind === "replacement" ? "danger" : "none");
      act(() => root.unmount());
    }
  });

  it("keeps the result concealed in the controlled before phase", () => {
    const { container, root } = mountCumulus(
      <CardChangePair
        model={{
          changeId: "change",
          kind: "copy",
          before: { entryId: parseDeckEntryId("a"), card: syntheticGameCard(1) },
          after: { entryId: parseDeckEntryId("b"), card: syntheticGameCard(2) },
        }}
        reveal="before"
      />,
    );
    expect(
      container.querySelector<HTMLElement>("[data-card-change-pair]")?.dataset
        .cardChangeReveal,
    ).toBe("before");
    expect(
      container
        .querySelector("[data-card-change-pair]")
        ?.getAttribute("aria-label"),
    ).not.toContain("Card 2");
    expect(
      container
        .querySelector('[data-card-change-face="after"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    act(() => root.unmount());
  });

  it("reveals the complete result immediately for reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { container, root } = mountCumulus(
      <CardChangePair
        model={{
          changeId: "reduced",
          kind: "keyword",
          before: {
            entryId: parseDeckEntryId("entry-before"),
            card: syntheticGameCard(1, "A very long duplicate display name"),
          },
          after: {
            entryId: parseDeckEntryId("entry-after"),
            card: syntheticGameCard(2, "A very long duplicate display name"),
          },
        }}
        reveal="before"
      />,
    );
    expect(
      container.querySelector<HTMLElement>("[data-card-change-pair]")?.dataset
        .cardChangeReveal,
    ).toBe("complete");
    expect(
      container.querySelector<HTMLElement>('[data-card-change-face="after"]')
        ?.style.transition,
    ).toBe("none");
    act(() => root.unmount());
  });
});
