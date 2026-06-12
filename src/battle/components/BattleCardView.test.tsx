// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BattleCardView, type BattleCardVisualData } from "./BattleCardView";

const CARD_DATA: BattleCardVisualData = {
  artUrl: null,
  cost: 2,
  isFast: false,
  figmentCount: 1,
  effectiveSpark: 3,
  kind: "character",
  name: "Test Card",
  printedSpark: 3,
  reserved: false,
  sparkDelta: 0,
  subtype: "WARRIOR",
  text: "",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("BattleCardView automation gear", () => {
  it("renders the automated gear icon when showAutomationGear is true", () => {
    act(() => {
      root.render(<BattleCardView data={CARD_DATA} showAutomationGear />);
    });

    expect(container.querySelectorAll('[aria-label="automated"]')).toHaveLength(1);
  });

  it("omits the gear icon when showAutomationGear is false", () => {
    act(() => {
      root.render(<BattleCardView data={CARD_DATA} showAutomationGear={false} />);
    });

    expect(container.querySelectorAll('[aria-label="automated"]')).toHaveLength(0);
  });

  it("omits the gear icon when showAutomationGear is omitted", () => {
    act(() => {
      root.render(<BattleCardView data={CARD_DATA} />);
    });

    expect(container.querySelectorAll('[aria-label="automated"]')).toHaveLength(0);
  });
});
