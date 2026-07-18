// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { DreamwellCardDefinition } from "../types";
import { BattleDreamwellHistoryDrawer } from "./BattleDreamwellHistoryDrawer";

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

const CARD: DreamwellCardDefinition = {
  id: "983e55a8-8f70-44c2-9e66-c47e3f020e34",
  name: "Recurring Beacon",
  renderedText: "Draw a card.",
  energyAdded: 1,
  order: 0,
  cardNumber: 1,
  imageNumber: 42,
};

describe("BattleDreamwellHistoryDrawer", () => {
  it("renders each drawn entry with the canonical UUID-backed Dreamwell card", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <BattleDreamwellHistoryDrawer
          dreamwellDeck={[CARD, { ...CARD, order: 1 }]}
          dreamwellDeckIndex={2}
          isOpen
          onClose={() => undefined}
        />,
      );
    });

    const entries = container.querySelectorAll(
      '[data-battle-dreamwell-history-card="983e55a8-8f70-44c2-9e66-c47e3f020e34"]',
    );
    expect(entries).toHaveLength(2);
    expect(
      container.querySelectorAll("[data-cumulus-dreamwell-card]"),
    ).toHaveLength(2);
    expect(entries[0]?.textContent).toContain("Recurring Beacon");
    expect(entries[1]?.textContent).toContain("Recurring Beacon");

    act(() => root.unmount());
    container.remove();
  });
});
