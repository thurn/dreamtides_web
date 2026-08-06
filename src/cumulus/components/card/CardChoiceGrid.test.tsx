// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import { CardChoiceGrid } from "./CardChoiceGrid";

vi.mock("./CardView", () => ({
  CardView: () => <div />,
  GameCard: ({
    model,
    onPress,
    selection,
    testId,
  }: {
    model: { displaySnapshot: { name: string } };
    onPress?: () => void;
    selection?: string;
    testId?: string;
  }) => (
    <button
      data-testid={testId}
      data-selection={selection}
      onClick={onPress}
    >
      {model.displaySnapshot.name}
    </button>
  ),
}));

function model(name: string) {
  const cardId = asCardId("11111111-1111-4111-8111-111111111111");
  return {
    cardId,
    displaySnapshot: {
      id: cardId,
      name: asCardName(name),
      cardNumber: 1,
      cardType: "Event" as const,
      subtype: "",
      isStarter: false,
      energyCost: 1,
      spark: null,
      isFast: false,
      renderedText: "Draw a card.",
      imageNumber: 1,
      artOwned: true,
    },
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("CardChoiceGrid", () => {
  it("renders a frameless named-column choice grid and routes stable ids", () => {
    const choose = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CardChoiceGrid
          cards={[
            { entryId: "choice-a", model: model("A"), testId: "choice-a" },
            {
              entryId: "choice-b",
              model: model("B"),
              testId: "choice-b",
              selection: "highlighted",
              quantityBadge: "2x",
              operation: "copy",
            },
          ]}
          columns="two"
          layout={{ kind: "site", viewport: "desktop", fit: "choice" }}
          onCardPress={choose}
        />,
      ),
    );

    expect(
      container
        .querySelector("[data-card-choice-grid-columns]")
        ?.getAttribute("data-card-choice-grid-columns"),
    ).toBe("2");
    expect(
      container.querySelector("[data-card-choice-quantity-badge]")?.textContent,
    ).toBe("2x");
    expect(
      container
        .querySelector('[data-card-choice-operation="copy"]')
        ?.getAttribute("aria-label"),
    ).toBe("This card will be copied");
    act(() =>
      (
        container.querySelector('[data-testid="choice-b"]') as HTMLButtonElement
      ).click(),
    );
    expect(choose).toHaveBeenCalledWith("choice-b");
    act(() => root.unmount());
    container.remove();
  });

  it("renders each semantic operation with its canonical glyph and label", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CardChoiceGrid
          cards={[
            { entryId: "purge", model: model("Purge"), operation: "purge" },
            { entryId: "copy", model: model("Copy"), operation: "copy" },
            {
              entryId: "transfigure",
              model: model("Transfigure"),
              operation: "transfigure",
            },
            {
              entryId: "change",
              model: model("Change"),
              operation: "change",
            },
          ]}
          columns="four"
          layout={{ kind: "site", viewport: "desktop", fit: "choice" }}
        />,
      ),
    );

    const expectations = [
      ["purge", "This card will be purged", ".bx-trash"],
      ["copy", "This card will be copied", ".bx-copy"],
      ["transfigure", "This card will be transfigured", ".fa-hammer"],
      ["change", "This card will be changed", ".bx-refresh-ccw"],
    ] as const;
    for (const [operation, label, glyph] of expectations) {
      const badge = container.querySelector(
        `[data-card-choice-operation="${operation}"]`,
      );
      expect(badge?.getAttribute("aria-label")).toBe(label);
      expect(badge?.querySelector(glyph)).not.toBeNull();
    }

    act(() => root.unmount());
    container.remove();
  });
});
