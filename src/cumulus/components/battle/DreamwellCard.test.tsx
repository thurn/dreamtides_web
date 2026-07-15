// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { asCardId } from "../../../types/card-identity";
import { DreamwellCard, type DreamwellCardModel } from "./DreamwellCard";

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

const MODEL: DreamwellCardModel = {
  cardId: asCardId("3a4293da-55a1-4094-898a-df402ffa1c92"),
  displaySnapshot: {
    id: asCardId("3a4293da-55a1-4094-898a-df402ffa1c92"),
    name: "Fixture Beacon",
    renderedText:
      "Look at the top 2 cards of your deck. Put one into your hand.",
    energyAdded: 2,
    imageNumber: 42,
    art: { x: 0.25, y: -0.5, scale: 1.4 },
  },
};

describe("DreamwellCard", () => {
  it("renders a complete static landscape card from its UUID-backed model", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<DreamwellCard model={MODEL} testId="dreamwell" />);
    });

    const card = container.querySelector<HTMLElement>("[data-dreamwell-card]");
    expect(card?.dataset.dreamwellCard).toBe(MODEL.cardId);
    expect(card?.getAttribute("aria-label")).toBe(
      "Fixture Beacon: adds 2 energy",
    );
    expect(card?.style.aspectRatio).toBe("3 / 2");
    expect(card?.style.animation).toBe("none");
    expect(card?.style.transition).toBe("none");
    expect(card?.querySelector("[data-dreamwell-card-name]")?.textContent).toBe(
      "Fixture Beacon",
    );
    expect(
      card?.querySelector("[data-dreamwell-card-rules]")?.textContent,
    ).toContain("Look at the top 2 cards");
    expect(
      card?.querySelector<HTMLElement>('[data-card-stat="dreamwellEnergy"]')
        ?.getAttribute("aria-label"),
    ).toBe("2 energy added");
    expect(card?.querySelector("img")?.getAttribute("src")).toContain(
      "/cards/42.webp",
    );
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("[data-battle-card-motion]")).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
