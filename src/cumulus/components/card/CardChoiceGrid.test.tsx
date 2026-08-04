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
    onActivate,
    selected,
    selectionColor,
    testId,
  }: {
    model: { displaySnapshot: { name: string } };
    onActivate?: () => void;
    selected?: boolean;
    selectionColor?: string;
    testId?: string;
  }) => (
    <button
      data-testid={testId}
      data-selected={String(selected)}
      data-selection-color={selectionColor}
      onClick={onActivate}
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
              selected: true,
              selectionColor: "accent-bright",
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
});
